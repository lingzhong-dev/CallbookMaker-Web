import type { AlignedCallCue, LyricLine } from '../types/callbook'

export interface RubySegment {
  base: string
  rt?: string
}

export interface ResolvedAlignedCue extends AlignedCallCue {
  isAuto?: boolean
}

export interface AlignedLyricRun {
  start: number
  end: number
  call?: ResolvedAlignedCue
  rubyParts: RubySegment[]
}

const RUBY_TAG_RE = /<ruby>([\s\S]*?)<rt>([\s\S]*?)<\/rt><\/ruby>/gi
const STRIP_TAGS_RE = /<[^>]+>/g

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function parseRubySegments(rubyHtml: string | undefined, fallbackOriginal: string): RubySegment[] {
  const source = rubyHtml && rubyHtml.trim().length > 0 ? rubyHtml : fallbackOriginal
  if (!source.includes('<ruby')) {
    return [{ base: source.replace(STRIP_TAGS_RE, '') }]
  }
  const segments: RubySegment[] = []
  let cursor = 0
  RUBY_TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = RUBY_TAG_RE.exec(source)) !== null) {
    if (match.index > cursor) {
      const plain = source.slice(cursor, match.index).replace(STRIP_TAGS_RE, '')
      if (plain.length > 0) {
        segments.push({ base: plain })
      }
    }
    const base = (match[1] ?? '').replace(STRIP_TAGS_RE, '')
    const rt = (match[2] ?? '').replace(STRIP_TAGS_RE, '')
    if (base.length > 0) {
      segments.push({ base, rt: rt.length > 0 ? rt : undefined })
    }
    cursor = match.index + match[0].length
  }
  if (cursor < source.length) {
    const tail = source.slice(cursor).replace(STRIP_TAGS_RE, '')
    if (tail.length > 0) {
      segments.push({ base: tail })
    }
  }
  return segments.length > 0 ? segments : [{ base: fallbackOriginal }]
}

export function normalizeAlignedCalls(
  raw: AlignedCallCue[] | undefined,
  originalLength: number
): AlignedCallCue[] {
  if (!Array.isArray(raw) || raw.length === 0 || originalLength <= 0) return []
  const cleaned: AlignedCallCue[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const text = String(item.text ?? '').trim()
    if (!text) continue
    const start = Math.max(0, Math.min(originalLength - 1, Math.round(Number(item.start) || 0)))
    const end = Math.max(start + 1, Math.min(originalLength, Math.round(Number(item.end) || start + 1)))
    if (end <= start) continue
    cleaned.push({
      id: String(item.id || `ac-${start}-${end}`),
      start,
      end,
      text,
      ...(typeof item.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.color.trim())
        ? { color: item.color.trim().toUpperCase() }
        : {})
    })
  }
  cleaned.sort((a, b) => a.start - b.start || a.end - b.end)
  const nonOverlapping: AlignedCallCue[] = []
  let lastEnd = 0
  for (const cue of cleaned) {
    if (cue.start >= lastEnd) {
      nonOverlapping.push(cue)
      lastEnd = cue.end
    }
  }
  return nonOverlapping
}

function overlapsExisting(cues: ResolvedAlignedCue[], start: number, end: number): boolean {
  return cues.some((c) => start < c.end && end > c.start)
}

function findNonOverlappingMatch(
  haystack: string,
  needle: string,
  occupied: ResolvedAlignedCue[]
): number {
  const lowerHaystack = haystack.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  let fromIndex = 0
  while (fromIndex <= lowerHaystack.length - lowerNeedle.length) {
    const idx = lowerHaystack.indexOf(lowerNeedle, fromIndex)
    if (idx < 0) return -1
    if (!overlapsExisting(occupied, idx, idx + needle.length)) {
      return idx
    }
    fromIndex = idx + 1
  }
  return -1
}

/**
 * Resolves both explicit `line.alignedCalls` and matching `line.customShout` tokens
 * (e.g. `高い` inside `目指す場所は高い`) into non-overlapping aligned cues, returning
 * any remaining non-matched customShout parts for the top pill strip.
 */
export function resolveLineAlignedCalls(line: LyricLine): {
  aligned: ResolvedAlignedCue[]
  unalignedShoutParts: string[]
} {
  const original = line.text.original || ''
  const explicit = normalizeAlignedCalls(line.alignedCalls, original.length)
  const resolved: ResolvedAlignedCue[] = explicit.map((c) => ({ ...c, isAuto: false }))

  const rawShout = (line.customShout || '').trim()
  if (!rawShout) {
    return { aligned: resolved, unalignedShoutParts: [] }
  }

  if (original.length > 0 && rawShout.length >= 2) {
    const wholeIdx = findNonOverlappingMatch(original, rawShout, resolved)
    if (wholeIdx >= 0) {
      resolved.push({
        id: `auto-shout-${wholeIdx}`,
        start: wholeIdx,
        end: wholeIdx + rawShout.length,
        text: rawShout,
        isAuto: true
      })
      resolved.sort((a, b) => a.start - b.start || a.end - b.end)
      return { aligned: resolved, unalignedShoutParts: [] }
    }
  }

  const tokens = rawShout
    .split(/[/／、,|｜]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  const unaligned: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (original.length > 0 && token.length >= 2) {
      const idx = findNonOverlappingMatch(original, token, resolved)
      if (idx >= 0) {
        resolved.push({
          id: `auto-shout-${i}-${idx}`,
          start: idx,
          end: idx + token.length,
          text: token,
          isAuto: true
        })
        continue
      }
    }
    unaligned.push(token)
  }

  resolved.sort((a, b) => a.start - b.start || a.end - b.end)
  return { aligned: resolved, unalignedShoutParts: unaligned }
}

export function getUnalignedCustomShout(line: LyricLine): string {
  return resolveLineAlignedCalls(line).unalignedShoutParts.join(' / ')
}

function sliceRubySegmentsRange(
  segmentsWithPos: Array<{ start: number; end: number; base: string; rt?: string }>,
  rangeStart: number,
  rangeEnd: number
): RubySegment[] {
  const out: RubySegment[] = []
  for (const seg of segmentsWithPos) {
    if (seg.end <= rangeStart || seg.start >= rangeEnd) continue
    const subStart = Math.max(seg.start, rangeStart) - seg.start
    const subEnd = Math.min(seg.end, rangeEnd) - seg.start
    const textSlice = seg.base.slice(subStart, subEnd)
    if (!textSlice) continue
    const isFullSegment = subStart === 0 && subEnd === seg.base.length
    out.push({
      base: textSlice,
      rt: isFullSegment ? seg.rt : undefined
    })
  }
  return out
}

export function buildAlignedLyricRuns(line: LyricLine, showRuby: boolean): AlignedLyricRun[] {
  const original = line.text.original || ''
  const { aligned } = resolveLineAlignedCalls(line)
  if (!original) {
    return []
  }

  const parsedRuby =
    showRuby && line.text.ruby && line.text.ruby.includes('<ruby')
      ? parseRubySegments(line.text.ruby, original)
      : [{ base: original }]
  const rubyPlain = parsedRuby.map((s) => s.base).join('')
  const segments = rubyPlain === original ? parsedRuby : [{ base: original }]

  const segmentsWithPos: Array<{ start: number; end: number; base: string; rt?: string }> = []
  let pos = 0
  for (const seg of segments) {
    segmentsWithPos.push({
      start: pos,
      end: pos + seg.base.length,
      base: seg.base,
      rt: seg.rt
    })
    pos += seg.base.length
  }

  const runs: AlignedLyricRun[] = []
  let cursor = 0
  for (const cue of aligned) {
    if (cue.start > cursor) {
      runs.push({
        start: cursor,
        end: cue.start,
        rubyParts: sliceRubySegmentsRange(segmentsWithPos, cursor, cue.start)
      })
    }
    runs.push({
      start: cue.start,
      end: cue.end,
      call: cue,
      rubyParts: sliceRubySegmentsRange(segmentsWithPos, cue.start, cue.end)
    })
    cursor = cue.end
  }
  if (cursor < original.length) {
    runs.push({
      start: cursor,
      end: original.length,
      rubyParts: sliceRubySegmentsRange(segmentsWithPos, cursor, original.length)
    })
  }
  return runs
}

/**
 * Merges two adjacent lyric lines cleanly, preserving ruby furigana, calls,
 * custom shouts, tailUpdraft, and shifted aligned call offsets.
 */
export function mergeAdjacentLyricLines(first: LyricLine, second: LyricLine): LyricLine {
  const rawA = first.text.original || ''
  const rawB = second.text.original || ''
  const aTrimRight = rawA.replace(/\s+$/, '')
  const bLeadingTrimCount = rawB.length - rawB.replace(/^\s+/, '').length
  const bTrim = rawB.trim()

  const hasBothOrig = aTrimRight.length > 0 && bTrim.length > 0
  const mergedOriginal = hasBothOrig ? `${aTrimRight} ${bTrim}` : aTrimRight || bTrim
  const shiftB = hasBothOrig ? aTrimRight.length + 1 - bLeadingTrimCount : -bLeadingTrimCount

  const aCalls = normalizeAlignedCalls(first.alignedCalls, rawA.length).filter(
    (c) => c.end <= (aTrimRight.length || mergedOriginal.length)
  )
  const bCalls = normalizeAlignedCalls(second.alignedCalls, rawB.length).map((c) => ({
    ...c,
    start: Math.max(0, c.start + shiftB),
    end: Math.min(mergedOriginal.length, c.end + shiftB)
  }))
  const mergedAligned = normalizeAlignedCalls([...aCalls, ...bCalls], mergedOriginal.length)

  const rubyA = first.text.ruby?.trim() || ''
  const rubyB = second.text.ruby?.trim() || ''
  let mergedRuby: string | undefined
  if (rubyA && rubyB) {
    mergedRuby = `${rubyA} ${rubyB}`
  } else if (rubyA) {
    mergedRuby = bTrim ? `${rubyA} ${escapeHtml(bTrim)}` : rubyA
  } else if (rubyB) {
    mergedRuby = aTrimRight ? `${escapeHtml(aTrimRight)} ${rubyB}` : rubyB
  }

  const romajiParts = [first.text.romaji?.trim(), second.text.romaji?.trim()].filter(
    (s): s is string => Boolean(s)
  )
  const transParts = [first.text.translation?.trim(), second.text.translation?.trim()].filter(
    (s): s is string => Boolean(s)
  )

  const mergedTags = first.calls.map((t) => ({ ...t }))
  for (const tag of second.calls) {
    const existing = mergedTags.find((t) => t.presetId === tag.presetId)
    if (!existing) {
      mergedTags.push({ ...tag })
    } else if (!existing.suffix?.trim() && tag.suffix?.trim()) {
      existing.suffix = tag.suffix
    }
  }

  const shoutA = first.customShout.trim()
  const shoutB = second.customShout.trim()
  const mergedShout =
    shoutA && shoutB
      ? shoutA === shoutB
        ? shoutA
        : `${shoutA} / ${shoutB}`
      : shoutA || shoutB

  return {
    id: first.id,
    startTimeMs: Math.min(first.startTimeMs, second.startTimeMs),
    endTimeMs: Math.max(first.endTimeMs, second.endTimeMs),
    kind: first.kind ?? 'lyric',
    autoGenerated: Boolean(first.autoGenerated && second.autoGenerated),
    calls: mergedTags,
    tailUpdraft: Boolean(first.tailUpdraft || second.tailUpdraft),
    customShout: mergedShout,
    ...(mergedAligned.length > 0 ? { alignedCalls: mergedAligned } : {}),
    text: {
      original: mergedOriginal,
      ...(mergedRuby ? { ruby: mergedRuby } : {}),
      ...(romajiParts.length > 0 ? { romaji: romajiParts.join(' ') } : {}),
      ...(transParts.length > 0 ? { translation: transParts.join(' ') } : {})
    }
  }
}
