from typing import List, Optional, Tuple

import httpx

from app.config import Settings
from app.models import TrackSummary
from app.providers.base import MusicProvider


class LrclibProvider(MusicProvider):
    """Open lyrics provider backed by LRCLIB (https://lrclib.net)."""

    name = "lrclib"

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.lrclib_base_url.rstrip("/")
        self._timeout = settings.http_timeout_seconds
        self._headers = {
            "User-Agent": "LiveCallEditor/1.0 (https://github.com/live-call-editor)"
        }

    def _to_summary(self, item: dict) -> TrackSummary:
        duration_sec = item.get("duration") or 0
        synced = bool(item.get("syncedLyrics"))
        return TrackSummary(
            id=str(item.get("id", "")),
            platform="lrclib",
            title=str(item.get("trackName") or item.get("name") or "Untitled"),
            artist=str(item.get("artistName") or "Unknown Artist"),
            album=str(item.get("albumName") or ""),
            durationMs=int(float(duration_sec) * 1000),
            bpm=None,
            hasSyncedLyrics=synced,
            hasAudioUrl=False,
            provider=self.name,
        )

    async def search(self, query: str, limit: int = 10) -> List[TrackSummary]:
        if not query.strip():
            return []
        async with httpx.AsyncClient(timeout=self._timeout, headers=self._headers) as client:
            resp = await client.get(
                f"{self._base_url}/api/search",
                params={"q": query.strip()},
            )
            resp.raise_for_status()
            payload = resp.json()
            if not isinstance(payload, list):
                return []
            results = [self._to_summary(item) for item in payload[:limit] if item.get("id")]
            return results

    async def get_track_payload(
        self, track_id: str
    ) -> Optional[Tuple[TrackSummary, str, str, str]]:
        async with httpx.AsyncClient(timeout=self._timeout, headers=self._headers) as client:
            resp = await client.get(f"{self._base_url}/api/get/{track_id}")
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            item = resp.json()
            summary = self._to_summary(item)
            raw_lrc = str(item.get("syncedLyrics") or item.get("plainLyrics") or "")
            return summary, "", raw_lrc, ""
