from abc import ABC, abstractmethod
from typing import List, Optional, Tuple

from app.models import TrackSummary


class MusicProvider(ABC):
    """Abstract base adapter for music & lyrics search providers."""

    name: str = "base"

    @abstractmethod
    async def search(self, query: str, limit: int = 10) -> List[TrackSummary]:
        """Search tracks matching the query string."""

    @abstractmethod
    async def get_track_payload(
        self, track_id: str
    ) -> Optional[Tuple[TrackSummary, str, str, str]]:
        """
        Fetch track details by provider-local track ID.

        Returns:
            (TrackSummary, audio_url, raw_lrc, translated_lrc) or None if not found.
        """
