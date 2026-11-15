export function formatMsToClock(ms: number, includeMs = true): string {
  const safe = Math.max(0, Math.round(ms))
  const minutes = Math.floor(safe / 60000)
  const seconds = Math.floor((safe % 60000) / 1000)
  const centis = Math.floor((safe % 1000) / 10)
  const base = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return includeMs ? `${base}.${String(centis).padStart(2, '0')}` : base
}

export function formatMsToPrecise(ms: number): string {
  const safe = Math.max(0, Math.round(ms))
  const minutes = Math.floor(safe / 60000)
  const seconds = Math.floor((safe % 60000) / 1000)
  const millis = safe % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function parseClockToMs(input: string): number | null {
  const trimmed = input.trim()
  const match = trimmed.match(/^(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?$/)
  if (match) {
    const m = Number(match[1])
    const s = Number(match[2])
    const frac = match[3] || ''
    let ms = (m * 60 + s) * 1000
    if (frac.length === 1) ms += Number(frac) * 100
    else if (frac.length === 2) ms += Number(frac) * 10
    else if (frac.length === 3) ms += Number(frac)
    return ms
  }
  const asNum = Number(trimmed)
  if (Number.isFinite(asNum) && asNum >= 0) {
    return Math.round(asNum)
  }
  return null
}
