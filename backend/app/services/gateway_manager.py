import asyncio
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple
from urllib.parse import urlparse

import httpx

from app.config import BACKEND_ROOT, REPO_APP_ROOT


def is_loopback_url(url: str) -> bool:
    host = (urlparse(url.strip()).hostname or "").lower()
    return host in ("127.0.0.1", "localhost", "::1")


def extract_port(url: str, default: int = 3000) -> int:
    parsed = urlparse(url.strip())
    if parsed.port:
        return parsed.port
    return default


def normalize_gateway_url(raw: str) -> str:
    val = raw.strip().rstrip("/")
    if not val:
        return "http://127.0.0.1:3000"
    if not val.startswith("http://") and not val.startswith("https://"):
        val = f"http://{val}"
    return val.rstrip("/")


def normalize_netease_cookie(raw_cookie: str) -> str:
    """Normalize pasted Cookie header or raw MUSIC_U token into a valid Cookie string."""
    cleaned = raw_cookie.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in ("'", '"'):
        cleaned = cleaned[1:-1].strip()
    cleaned = cleaned.replace("\r", "; ").replace("\n", "; ")
    if not cleaned:
        return ""

    if cleaned.lower().startswith("cookie:"):
        cleaned = cleaned[7:].strip()

    parts = [seg.strip() for seg in cleaned.split(";") if seg.strip()]
    if not parts:
        return ""

    has_music_u = any(
        "=" in seg and seg.split("=", 1)[0].strip().upper() == "MUSIC_U"
        for seg in parts
    )
    if not has_music_u and "=" not in parts[0]:
        parts[0] = f"MUSIC_U={parts[0]}"

    has_os = any(
        "=" in seg and seg.split("=", 1)[0].strip().lower() == "os"
        for seg in parts
    )
    if not has_os:
        parts.append("os=pc")

    return "; ".join(parts)


def mask_cookie(cookie: str) -> str:
    if not cookie.strip():
        return ""
    music_u = ""
    for part in cookie.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            if k.strip().upper() == "MUSIC_U":
                music_u = v.strip()
                break
    target = music_u or cookie.strip()
    if len(target) <= 14:
        return f"MUSIC_U=***({len(target)})"
    return f"MUSIC_U={target[:6]}...{target[-6:]} (len={len(target)})"


def update_env_file(env_path: Path, updates: Dict[str, str]) -> None:
    """Persist updated key=value entries in `.env` while keeping comments and other vars."""
    env_path.parent.mkdir(parents=True, exist_ok=True)
    existing_lines: list[str] = []
    if env_path.exists():
        existing_lines = env_path.read_text(encoding="utf-8").splitlines()
    else:
        existing_lines = [
            "MUSIC_API_BASE_URL=http://127.0.0.1:3000",
            "NETEASE_COOKIE=",
            "MUSIC_API_TOKEN=",
            "MUSIC_SEARCH_PATH=/search",
            "MUSIC_LYRIC_PATH=/lyric",
            "MUSIC_URL_PATH=/song/url",
            "LRCLIB_BASE_URL=https://lrclib.net",
            "ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
            "HTTP_TIMEOUT_SECONDS=10",
        ]

    sanitized = {
        k: v.replace("\r", "").replace("\n", " ").strip()
        for k, v in updates.items()
    }
    remaining = dict(sanitized)
    output_lines: list[str] = []

    for line in existing_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            output_lines.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in remaining:
            output_lines.append(f"{key}={remaining.pop(key)}")
        else:
            output_lines.append(line)

    for key, val in remaining.items():
        output_lines.append(f"{key}={val}")

    env_path.write_text("\n".join(output_lines) + "\n", encoding="utf-8")


class GatewaySupervisor:
    """Discovers, launches, probes, and stops the local NeteaseCloudMusicApiEnhanced service."""

    def __init__(self) -> None:
        self._process: Optional[subprocess.Popen[bytes]] = None
        self._managed_url: str = ""
        self._cached_npm_root: Optional[Path] = None

    @property
    def managed_pid(self) -> Optional[int]:
        if self._process is not None and self._process.poll() is None:
            return self._process.pid
        return None

    def find_node_binary(self) -> Optional[str]:
        candidates = [
            shutil.which("node"),
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
            "/usr/local/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/bin/node",
        ]
        for candidate in candidates:
            if candidate and Path(candidate).is_file():
                return candidate
        return None

    def _get_global_npm_root(self) -> Optional[Path]:
        if self._cached_npm_root is not None:
            return self._cached_npm_root
        npm_cmd = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm_cmd:
            return None
        try:
            out = subprocess.check_output(
                [npm_cmd, "root", "-g"],
                stderr=subprocess.DEVNULL,
                timeout=3,
                text=True,
            ).strip()
            if out:
                self._cached_npm_root = Path(out)
                return self._cached_npm_root
        except Exception:
            return None
        return None

    def find_ncm_entry(self) -> Optional[Path]:
        candidates: list[Path] = [
            REPO_APP_ROOT / "netease-gateway" / "node_modules" / "@neteasecloudmusicapienhanced" / "api" / "app.js",
            BACKEND_ROOT / "node_modules" / "@neteasecloudmusicapienhanced" / "api" / "app.js",
        ]
        appdata = os.environ.get("APPDATA")
        if appdata:
            candidates.append(
                Path(appdata) / "npm" / "node_modules" / "@neteasecloudmusicapienhanced" / "api" / "app.js"
            )
        candidates.extend(
            [
                Path.home() / "AppData" / "Roaming" / "npm" / "node_modules" / "@neteasecloudmusicapienhanced" / "api" / "app.js",
                Path("/usr/local/lib/node_modules/@neteasecloudmusicapienhanced/api/app.js"),
                Path("/usr/lib/node_modules/@neteasecloudmusicapienhanced/api/app.js"),
            ]
        )
        npm_root = self._get_global_npm_root()
        if npm_root:
            candidates.append(npm_root / "@neteasecloudmusicapienhanced" / "api" / "app.js")

        for path in candidates:
            if path.is_file():
                return path
        return None

    async def probe_gateway(
        self, base_url: str, cookie: str = ""
    ) -> Tuple[bool, Optional[str]]:
        if not base_url.strip():
            return False, None
        clean_url = normalize_gateway_url(base_url)
        try:
            async with httpx.AsyncClient(
                timeout=2.5,
                trust_env=not is_loopback_url(clean_url),
            ) as client:
                alive = False
                for probe_path in ("/", "/search?keywords=test&limit=1"):
                    try:
                        resp = await client.get(f"{clean_url}{probe_path}")
                        if resp.status_code < 500:
                            alive = True
                            break
                    except httpx.HTTPError:
                        continue
                if not alive:
                    return False, None

                if cookie.strip():
                    try:
                        status_resp = await client.get(
                            f"{clean_url}/login/status",
                            headers={"Cookie": cookie},
                        )
                        if status_resp.status_code == 200:
                            body = status_resp.json()
                            data = body.get("data") if isinstance(body, dict) else None
                            profile = (
                                data.get("profile") if isinstance(data, dict) else None
                            )
                            if isinstance(profile, dict) and profile.get("nickname"):
                                return True, str(profile["nickname"])
                    except Exception:
                        pass
                return True, None
        except Exception:
            return False, None

    async def start_local_gateway(
        self, base_url: str, cookie: str = ""
    ) -> Tuple[bool, str]:
        clean_url = normalize_gateway_url(base_url)
        online, account = await self.probe_gateway(clean_url, cookie=cookie)
        if online:
            msg = f"网易云网关已在运行 ({clean_url})"
            if account:
                msg = f"{msg} · 已登录 {account}"
            return True, msg

        if not is_loopback_url(clean_url):
            return False, f"远程网关 {clean_url} 不可达，请确认目标主机已启动网关服务"

        node_bin = self.find_node_binary()
        if not node_bin:
            return False, "未检测到 Node.js，请安装 Node.js 或手动在 3000 端口启动网关"

        entry = self.find_ncm_entry()
        if not entry:
            return (
                False,
                "未找到 @neteasecloudmusicapienhanced/api 包，请运行 npm i -g @neteasecloudmusicapienhanced/api",
            )

        if self._process is not None and self._process.poll() is not None:
            self._process = None

        port = extract_port(clean_url, default=3000)
        log_dir = BACKEND_ROOT / "data"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = open(log_dir / "netease_gateway.log", "ab")

        child_env = os.environ.copy()
        child_env["PORT"] = str(port)
        child_env["HOST"] = "127.0.0.1"
        child_env["CORS_ALLOW_ORIGIN"] = "*"

        popen_kwargs: dict = {
            "cwd": str(entry.parent),
            "env": child_env,
            "stdout": log_file,
            "stderr": log_file,
        }
        if sys.platform.startswith("win"):
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(
                subprocess, "CREATE_NEW_PROCESS_GROUP", 0
            )
            popen_kwargs["creationflags"] = flags
        else:
            popen_kwargs["start_new_session"] = True

        try:
            self._process = subprocess.Popen([node_bin, str(entry)], **popen_kwargs)
            self._managed_url = clean_url
        except Exception as exc:
            log_file.close()
            return False, f"启动网关进程失败：{exc}"
        finally:
            try:
                log_file.close()
            except Exception:
                pass

        for _ in range(32):
            await asyncio.sleep(0.25)
            if self._process.poll() is not None:
                return False, f"网关进程提前退出 (exit={self._process.returncode})，请检查 backend/data/netease_gateway.log"
            ready, account = await self.probe_gateway(clean_url, cookie=cookie)
            if ready:
                msg = f"已自动启动网易云网关 ({clean_url}, PID={self._process.pid})"
                if account:
                    msg = f"{msg} · 已登录 {account}"
                return True, msg

        return False, "网关进程已启动但端口响应超时，请查看 backend/data/netease_gateway.log"

    def stop_local_gateway(self) -> Tuple[bool, str]:
        if self._process is None or self._process.poll() is not None:
            self._process = None
            return False, "当前没有由后端托管运行的本地网关进程"
        pid = self._process.pid
        try:
            self._process.terminate()
            self._process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self._process.kill()
        except Exception as exc:
            return False, f"停止网关失败：{exc}"
        finally:
            self._process = None
            self._managed_url = ""
        return True, f"已停止后端托管的网易云网关 (PID={pid})"
