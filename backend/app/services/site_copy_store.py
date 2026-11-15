import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

from app.models import SiteCopyDocumentModel, SiteCopyEntryModel


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp_path.replace(path)


def normalize_site_copy_document(doc: SiteCopyDocumentModel) -> SiteCopyDocumentModel:
    """Drop no-op overrides whose edited value matches original text."""
    now_iso = doc.updatedAt.strip() or _utc_now_iso()
    cleaned: dict[str, SiteCopyEntryModel] = {}
    for map_key, entry in doc.entries.items():
        if entry.value == entry.original or not entry.key.strip():
            continue
        cleaned[entry.key] = SiteCopyEntryModel(
            key=entry.key,
            original=entry.original,
            value=entry.value,
            route=entry.route or "global",
            updatedAt=entry.updatedAt.strip() or now_iso,
        )
    return SiteCopyDocumentModel(
        version=1,
        updatedAt=now_iso,
        entries=cleaned,
    )


def load_site_copy(
    primary_path: Path,
    fallback_path: Optional[Path] = None,
) -> SiteCopyDocumentModel:
    """Load persisted website text overrides from backend JSON or bundled project JSON."""
    for candidate in (primary_path, fallback_path):
        if candidate is None or not candidate.is_file():
            continue
        try:
            raw = json.loads(candidate.read_text(encoding="utf-8"))
            return SiteCopyDocumentModel.model_validate(raw)
        except Exception:
            continue
    return SiteCopyDocumentModel(version=1, updatedAt="", entries={})


def save_site_copy(
    doc: SiteCopyDocumentModel,
    primary_path: Path,
    project_path: Optional[Path] = None,
) -> Tuple[SiteCopyDocumentModel, bool]:
    """Persist site text overrides to backend storage and mirror into frontend bundle JSON."""
    normalized = normalize_site_copy_document(doc)
    serialized = normalized.model_dump(mode="json")
    _atomic_write_json(primary_path, serialized)

    project_synced = False
    if project_path is not None and project_path.parent.exists():
        _atomic_write_json(project_path, serialized)
        project_synced = True

    return normalized, project_synced


def reset_site_copy(
    primary_path: Path,
    project_path: Optional[Path] = None,
) -> Tuple[SiteCopyDocumentModel, bool]:
    """Clear all site text overrides back to default empty state."""
    empty_doc = SiteCopyDocumentModel(version=1, updatedAt=_utc_now_iso(), entries={})
    return save_site_copy(empty_doc, primary_path, project_path)
