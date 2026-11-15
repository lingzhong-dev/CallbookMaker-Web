from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx

from app.config import Settings
from app.models import PlatformType, TrackSummary
from app.providers.base import MusicProvider
from app.services.gateway_manager import normalize_netease_cookie


def _is_loopback_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in ("127.0.0.1", "localhost", "::1")


class CustomProxyProvider(MusicProvider):
    """
    Adapter for a self-hosted music parsing gateway (Netease / QQ / Bilibili).

    Activated only when MUSIC_API_BASE_URL is configured in `.env`.
    """

    name = "custom_proxy"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base_url = settings.music_api_base_url.rstrip("/")

    def update_settings(self, settings: Settings) -> None:
        """Hot-reload gateway base URL, endpoint paths, and Netease cookie."""
        self._settings = settings
        self._base_url = settings.music_api_base_url.rstrip("/")

    @property
    def enabled(self) -> bool:
        return bool(self._base_url)

    def _build_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        cookie = normalize_netease_cookie(self._settings.netease_cookie)
        if cookie:
            headers["Cookie"] = cookie
        if self._settings.music_api_token:
            headers["Authorization"] = f"Bearer {self._settings.music_api_token}"
        return headers

    def _detect_platform(self, item: Dict[str, Any]) -> PlatformType:
        raw_platform = str(item.get("platform") or "").lower()
        if raw_platform in ("netease", "qq", "bilibili"):
            return raw_platform  # type: ignore[return-value]
        return "netease"

    def _extract_songs(self, payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, list):
            return payload
        if not isinstance(payload, dict):
            return []
        if isinstance(payload.get("results"), list):
            return payload["results"]
        result = payload.get("result")
        if isinstance(result, dict) and isinstance(result.get("songs"), list):
            return result["songs"]
        if isinstance(payload.get("data"), list):
            return payload["data"]
        return []

    def _song_to_summary(self, item: Dict[str, Any]) -> TrackSummary:
        artists = item.get("artists") or item.get("ar") or []
        if isinstance(artists, list) and artists:
            artist_name = " / ".join(
                str(a.get("name", "")) for a in artists if isinstance(a, dict) and a.get("name")
            )
        else:
            artist_name = str(item.get("artist") or "Unknown Artist")

        album_obj = item.get("album") or item.get("al") or {}
        album_name = (
            str(album_obj.get("name", "")) if isinstance(album_obj, dict) else str(album_obj or "")
        )
        duration_ms = int(item.get("durationMs") or item.get("dt") or item.get("duration") or 0)
        return TrackSummary(
            id=str(item.get("id", "")),
            platform=self._detect_platform(item),
            title=str(item.get("name") or item.get("title") or "Untitled"),
            artist=artist_name or "Unknown Artist",
            album=album_name,
            durationMs=duration_ms,
            bpm=item.get("bpm"),
            hasSyncedLyrics=True,
            hasAudioUrl=True,
            provider=self.name,
        )

    async def search(self, query: str, limit: int = 10) -> List[TrackSummary]:
        if not self.enabled or not query.strip():
            return []

        url = f"{self._base_url}{self._settings.music_search_path}"
        params = {"keywords": query.strip(), "q": query.strip(), "limit": limit}
        async with httpx.AsyncClient(
            timeout=self._settings.http_timeout_seconds,
            headers=self._build_headers(),
            trust_env=not _is_loopback_url(self._base_url),
        ) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            songs = self._extract_songs(resp.json())
            return [self._song_to_summary(song) for song in songs[:limit] if song.get("id")]

    async def get_track_payload(
        self, track_id: str
    ) -> Optional[Tuple[TrackSummary, str, str, str]]:
        if not self.enabled:
            return None

        headers = self._build_headers()
        async with httpx.AsyncClient(
            timeout=self._settings.http_timeout_seconds,
            headers=headers,
            trust_env=not _is_loopback_url(self._base_url),
        ) as client:
            lyric_resp = await client.get(
                f"{self._base_url}{self._settings.music_lyric_path}",
                params={"id": track_id},
            )
            lyric_resp.raise_for_status()
            lyric_data = lyric_resp.json() if lyric_resp.content else {}

            raw_lrc = str(
                lyric_data.get("lrc", {}).get("lyric")
                if isinstance(lyric_data.get("lrc"), dict)
                else lyric_data.get("lrc") or lyric_data.get("lyric") or ""
            )
            translated_lrc = str(
                lyric_data.get("tlyric", {}).get("lyric")
                if isinstance(lyric_data.get("tlyric"), dict)
                else lyric_data.get("tlyric") or ""
            )

            audio_url = ""
            url_candidates = [
                (self._settings.music_url_path, {"id": track_id}),
            ]
            if self._settings.music_url_path == "/song/url":
                url_candidates.append(
                    ("/song/url/v1", {"id": track_id, "level": "standard"})
                )
            for path_candidate, params in url_candidates:
                try:
                    url_resp = await client.get(
                        f"{self._base_url}{path_candidate}",
                        params=params,
                    )
                    if url_resp.status_code == 200:
                        url_data = url_resp.json()
                        if isinstance(url_data, dict):
                            if isinstance(url_data.get("data"), list) and url_data["data"]:
                                audio_url = str(url_data["data"][0].get("url") or "")
                            elif url_data.get("url"):
                                audio_url = str(url_data["url"])
                    if audio_url:
                        break
                except httpx.HTTPError:
                    continue

            title = str(lyric_data.get("title") or "")
            artist = str(lyric_data.get("artist") or "")
            album = ""
            duration_ms = 0

            if not title:
                try:
                    detail_resp = await client.get(
                        f"{self._base_url}/song/detail",
                        params={"ids": track_id},
                    )
                    if detail_resp.status_code == 200:
                        detail_data = detail_resp.json()
                        songs = detail_data.get("songs") if isinstance(detail_data, dict) else None
                        if isinstance(songs, list) and songs:
                            s0 = songs[0]
                            title = str(s0.get("name") or "")
                            ar = s0.get("ar") or s0.get("artists") or []
                            if isinstance(ar, list) and ar:
                                artist = " / ".join(
                                    str(a.get("name", "")) for a in ar if isinstance(a, dict) and a.get("name")
                                )
                            al = s0.get("al") or s0.get("album") or {}
                            if isinstance(al, dict):
                                album = str(al.get("name") or "")
                            duration_ms = int(s0.get("dt") or s0.get("duration") or 0)
                except httpx.HTTPError:
                    pass

            summary = TrackSummary(
                id=str(track_id),
                platform="netease",
                title=title or f"Track {track_id}",
                artist=artist or "Custom Gateway",
                album=album,
                durationMs=duration_ms,
                bpm=None,
                hasSyncedLyrics=bool(raw_lrc),
                hasAudioUrl=bool(audio_url),
                provider=self.name,
            )
            return summary, audio_url, raw_lrc, translated_lrc
