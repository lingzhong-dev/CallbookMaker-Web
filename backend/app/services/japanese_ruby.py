import html
import re
from functools import lru_cache
from typing import Tuple

import pykakasi

KANA_RE = re.compile(r"[\u3040-\u309f\u30a0-\u30ff]")
KANJI_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf々]")
SPACE_PUNCT_RE = re.compile(r"\s+([,.!?;:)\]」』】、。！？])")


@lru_cache(maxsize=1)
def _get_kakasi() -> pykakasi.kakasi:
    return pykakasi.kakasi()


def contains_japanese_kana(text: str) -> bool:
    """Return True if the text contains Hiragana or Katakana characters."""
    return bool(KANA_RE.search(text or ""))


def contains_kanji(text: str) -> bool:
    """Return True if the text contains CJK Kanji characters."""
    return bool(KANJI_RE.search(text or ""))


def to_ruby_and_romaji(text: str, force_japanese: bool = False) -> Tuple[str, str, bool]:
    """
    Convert Japanese text into safe `<ruby>` HTML and Hepburn romaji.

    Returns:
        (ruby_html, romaji, is_japanese)
    """
    stripped = (text or "").strip()
    if not stripped:
        return "", "", False

    is_jp = force_japanese or contains_japanese_kana(stripped)
    if not is_jp:
        return html.escape(stripped), "", False

    kks = _get_kakasi()
    tokens = kks.convert(stripped)

    ruby_parts = []
    romaji_parts = []

    for token in tokens:
        orig = token.get("orig", "")
        hira = token.get("hira", "")
        hepburn = (token.get("hepburn") or "").strip()

        escaped_orig = html.escape(orig)
        if orig and hira and contains_kanji(orig) and hira != orig:
            escaped_hira = html.escape(hira)
            ruby_parts.append(f"<ruby>{escaped_orig}<rt>{escaped_hira}</rt></ruby>")
        else:
            ruby_parts.append(escaped_orig)

        if hepburn:
            romaji_parts.append(hepburn)
        elif orig.strip():
            romaji_parts.append(orig.strip())

    ruby_html = "".join(ruby_parts)
    romaji_raw = " ".join(romaji_parts)
    romaji = SPACE_PUNCT_RE.sub(r"\1", romaji_raw).strip()
    return ruby_html, romaji, True
