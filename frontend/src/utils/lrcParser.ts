import type { LyricLine } from '../types/callbook'

const TIMESTAMP_RE = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
const META_RE = /^\[[a-zA-Z]+:.*\]$/

function toMs(min: string, sec: string, frac?: string): number {
  let ms = (Number(min) * 60 + Number(sec)) * 1000
  if (frac) {
    if (frac.length === 1) ms += Number(frac) * 100
    else if (frac.length === 2) ms += Number(frac) * 10
    else ms += Number(frac.slice(0, 3))
  }
  return ms
}

function extractTimedEntries(rawLrc: string): Array<{ ts: number; text: string }> {
  const entries: Array<{ ts: number; text: string }> = []
  for (const raw of (rawLrc || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const matches = [...line.matchAll(TIMESTAMP_RE)]
    if (matches.length === 0) continue
    const lyricText = line.replace(TIMESTAMP_RE, '').trim()
    if (!lyricText) continue
    for (const m of matches) {
      entries.push({ ts: toMs(m[1], m[2], m[3]), text: lyricText })
    }
  }
  entries.sort((a, b) => a.ts - b.ts)
  return entries
}

export function parseLrcClientFallback(
  rawLrc: string,
  translationLrc = '',
  defaultDurationMs = 3000
): LyricLine[] {
  const timed = extractTimedEntries(rawLrc)
  const grouped: Array<{ ts: number; original: string; translation?: string }> = []

  if (timed.length > 0) {
    for (const item of timed) {
      const prev = grouped[grouped.length - 1]
      if (prev && prev.ts === item.ts && !prev.translation) {
        prev.translation = item.text
      } else {
        grouped.push({ ts: item.ts, original: item.text })
      }
    }
  } else {
    const plain = (rawLrc || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !META_RE.test(l))
    plain.forEach((line, idx) => {
      grouped.push({ ts: idx * defaultDurationMs, original: line })
    })
  }

  const transEntries = extractTimedEntries(translationLrc)

  return grouped.map((entry, idx) => {
    let translation = entry.translation
    if (!translation && transEntries.length > 0) {
      const matched = transEntries.find((t) => Math.abs(t.ts - entry.ts) <= 350)
      if (matched) translation = matched.text
    }
    let original = entry.original
    if (!translation) {
      for (const sep of [' // ', ' || ']) {
        if (original.includes(sep)) {
          const [orig, trans] = original.split(sep, 2)
          original = orig.trim()
          translation = trans.trim()
          break
        }
      }
    }

    const next = grouped[idx + 1]
    const endTimeMs = next ? Math.max(entry.ts + 500, next.ts) : entry.ts + defaultDurationMs

    return {
      id: `line-${idx + 1}-${entry.ts}`,
      startTimeMs: entry.ts,
      endTimeMs,
      calls: [],
      customShout: '',
      text: {
        original,
        translation
      }
    }
  })
}
