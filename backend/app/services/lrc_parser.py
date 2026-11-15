import re
from typing import Dict, List, Optional, Tuple

from app.models import LyricTextModel, ParsedLyricLineModel
from app.services.japanese_ruby import contains_japanese_kana, to_ruby_and_romaji

TIMESTAMP_RE = re.compile(r"\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]")
META_TAG_RE = re.compile(r"^\[[a-zA-Z]+:.*\]$")


def _parse_timestamp_ms(minutes: str, seconds: str, fraction: Optional[str]) -> int:
    total_ms = (int(minutes) * 60 + int(seconds)) * 1000
    if fraction:
        if len(fraction) == 1:
            total_ms += int(fraction) * 100
        elif len(fraction) == 2:
            total_ms += int(fraction) * 10
        else:
            total_ms += int(fraction[:3])
    return total_ms


def _extract_timed_entries(raw_lrc: str) -> List[Tuple[int, str]]:
    entries: List[Tuple[int, str]] = []
    for raw_line in (raw_lrc or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        matches = list(TIMESTAMP_RE.finditer(line))
        if not matches:
            if META_TAG_RE.match(line):
                continue
            continue
        lyric_text = TIMESTAMP_RE.sub("", line).strip()
        if not lyric_text:
            continue
        for m in matches:
            ts_ms = _parse_timestamp_ms(m.group(1), m.group(2), m.group(3))
            entries.append((ts_ms, lyric_text))
    entries.sort(key=lambda item: item[0])
    return entries


def _match_translation(ts_ms: int, trans_map: Dict[int, str], tolerance_ms: int = 350) -> Optional[str]:
    if ts_ms in trans_map:
        return trans_map[ts_ms]
    best_ts = None
    best_diff = tolerance_ms + 1
    for candidate_ts in trans_map:
        diff = abs(candidate_ts - ts_ms)
        if diff < best_diff:
            best_diff = diff
            best_ts = candidate_ts
    if best_ts is not None and best_diff <= tolerance_ms:
        return trans_map[best_ts]
    return None


def parse_lrc_to_lines(
    lrc: str,
    translation_lrc: str = "",
    default_duration_ms: int = 3000,
    enable_ruby: bool = True,
    force_japanese_ruby: bool = False,
) -> Tuple[bool, List[ParsedLyricLineModel]]:
    """
    Parse standard, bilingual, or plain-text lyrics into sorted ParsedLyricLineModel entries.
    """
    timed_entries = _extract_timed_entries(lrc)
    grouped: List[Tuple[int, str, Optional[str]]] = []

    if timed_entries:
        for ts_ms, text in timed_entries:
            if grouped and grouped[-1][0] == ts_ms and grouped[-1][2] is None:
                prev_ts, prev_orig, _ = grouped[-1]
                grouped[-1] = (prev_ts, prev_orig, text)
            else:
                grouped.append((ts_ms, text, None))
    else:
        plain_lines = [
            ln.strip()
            for ln in (lrc or "").splitlines()
            if ln.strip() and not META_TAG_RE.match(ln.strip())
        ]
        for idx, text in enumerate(plain_lines):
            grouped.append((idx * default_duration_ms, text, None))

    # Merge optional secondary translation LRC
    trans_entries = _extract_timed_entries(translation_lrc)
    trans_map: Dict[int, str] = {}
    for ts_ms, text in trans_entries:
        if ts_ms not in trans_map:
            trans_map[ts_ms] = text

    # Support inline separator `//` or `||` if no separate translation matched
    normalized: List[Tuple[int, str, Optional[str]]] = []
    for ts_ms, orig, trans in grouped:
        matched_trans = trans or _match_translation(ts_ms, trans_map)
        final_orig = orig
        if not matched_trans:
            for sep in (" // ", " || "):
                if sep in orig:
                    parts = orig.split(sep, 1)
                    final_orig = parts[0].strip()
                    matched_trans = parts[1].strip() or None
                    break
        normalized.append((ts_ms, final_orig, matched_trans))

    song_is_japanese = force_japanese_ruby or any(
        contains_japanese_kana(orig) for _, orig, _ in normalized
    )

    lines: List[ParsedLyricLineModel] = []
    for idx, (start_ms, orig, trans) in enumerate(normalized):
        if idx + 1 < len(normalized):
            next_start = normalized[idx + 1][0]
            end_ms = max(start_ms + 500, next_start)
        else:
            end_ms = start_ms + default_duration_ms

        ruby_html: Optional[str] = None
        romaji: Optional[str] = None
        if enable_ruby and song_is_japanese:
            ruby_html, romaji, _ = to_ruby_and_romaji(orig, force_japanese=True)

        lines.append(
            ParsedLyricLineModel(
                id=f"line-{idx + 1}-{start_ms}",
                startTimeMs=start_ms,
                endTimeMs=end_ms,
                calls=[],
                customShout="",
                text=LyricTextModel(
                    original=orig,
                    ruby=ruby_html,
                    romaji=romaji,
                    translation=trans,
                ),
            )
        )

    return song_is_japanese, lines
