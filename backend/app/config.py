from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_APP_ROOT = BACKEND_ROOT.parent
DEFAULT_ENV_FILE_PATH = BACKEND_ROOT / ".env"
DEFAULT_BACKEND_SITE_COPY_PATH = BACKEND_ROOT / "data" / "site_copy_overrides.json"
DEFAULT_FRONTEND_SITE_COPY_PATH = (
    REPO_APP_ROOT / "frontend" / "src" / "data" / "siteCopyOverrides.json"
)


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    model_config = SettingsConfigDict(
        env_file=str(DEFAULT_ENV_FILE_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    music_api_base_url: str = ""
    netease_cookie: str = ""
    music_api_token: str = ""
    music_search_path: str = "/search"
    music_lyric_path: str = "/lyric"
    music_url_path: str = "/song/url"

    lrclib_base_url: str = "https://lrclib.net"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
    http_timeout_seconds: float = 10.0

    site_copy_file: str = str(DEFAULT_BACKEND_SITE_COPY_PATH)
    frontend_site_copy_file: str = str(DEFAULT_FRONTEND_SITE_COPY_PATH)

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def has_custom_proxy(self) -> bool:
        return bool(self.music_api_base_url.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
