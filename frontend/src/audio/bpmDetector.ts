export interface BpmDetectionResult {
  bpm: number
  offsetMs: number
  confidence: number
}

/**
 * Pure TypeScript tempo & downbeat phase estimator operating on decoded PCM samples.
 * Exported directly so unit tests can exercise it without Web Audio decodeAudioData.
 */
export function estimateBpmFromSamples(
  samples: Float32Array,
  sampleRate: number,
  windowStartSec = 0
): BpmDetectionResult | null {
  if (samples.length < sampleRate * 4) return null

  // Compute low-pass bass signal (~165 Hz) + wideband signal at 100 Hz frame rate (10ms hop)
  const frameRate = 100
  const hopSize = Math.max(1, Math.floor(sampleRate / frameRate))
  const numFrames = Math.floor(samples.length / hopSize)
  if (numFrames < 400) return null

  const rc = 1 / (2 * Math.PI * 165)
  const dt = 1 / sampleRate
  const alpha = dt / (rc + dt)

  const lowEnv = new Float32Array(numFrames)
  const fullEnv = new Float32Array(numFrames)

  let lpState = 0
  let dcPrevIn = 0
  let dcPrevOut = 0

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize
    const end = Math.min(samples.length, start + hopSize)
    let lowSumSq = 0
    let fullSumSq = 0
    for (let i = start; i < end; i++) {
      const raw = samples[i]
      // High-pass > 25 Hz to remove DC drift while preserving bass/mid/treble energy
      const x = 0.995 * (dcPrevOut + raw - dcPrevIn)
      dcPrevIn = raw
      dcPrevOut = x

      lpState = lpState + alpha * (x - lpState)
      lowSumSq += lpState * lpState
      fullSumSq += x * x
    }
    const n = Math.max(1, end - start)
    lowEnv[f] = Math.log1p(120 * Math.sqrt(lowSumSq / n))
    fullEnv[f] = Math.log1p(120 * Math.sqrt(fullSumSq / n))
  }

  // Half-wave rectified onset novelty minus local moving average (±180ms)
  const novelty = new Float32Array(numFrames)
  const kickNovelty = new Float32Array(numFrames)
  const rawFlux = new Float32Array(numFrames)
  const rawKickFlux = new Float32Array(numFrames)

  for (let f = 1; f < numFrames; f++) {
    const dLow = Math.max(0, lowEnv[f] - lowEnv[f - 1])
    const dFull = Math.max(0, fullEnv[f] - fullEnv[f - 1])
    rawKickFlux[f] = dLow
    rawFlux[f] = 0.42 * dLow + 0.58 * dFull
  }

  const halfWin = 18
  let meanEnergy = 0
  for (let f = 0; f < numFrames; f++) {
    const s = Math.max(0, f - halfWin)
    const e = Math.min(numFrames - 1, f + halfWin)
    let localSum = 0
    let localKickSum = 0
    for (let k = s; k <= e; k++) {
      localSum += rawFlux[k]
      localKickSum += rawKickFlux[k]
    }
    const cnt = e - s + 1
    novelty[f] = Math.max(0, rawFlux[f] - (localSum / cnt) * 1.04)
    kickNovelty[f] = Math.max(0, rawKickFlux[f] - (localKickSum / cnt) * 1.04)
    meanEnergy += novelty[f] * novelty[f]
  }
  if (meanEnergy < 1e-6) return null

  const interp = (arr: Float32Array, idx: number): number => {
    const i0 = Math.floor(idx)
    if (i0 < 0 || i0 >= arr.length - 1) return 0
    const frac = idx - i0
    return arr[i0] * (1 - frac) + arr[i0 + 1] * frac
  }

  const corrAtLag = (arr: Float32Array, lagFrames: number): number => {
    const maxF = arr.length - Math.ceil(lagFrames) - 2
    if (maxF <= 20) return 0
    let sum = 0
    for (let f = 0; f < maxF; f++) {
      sum += arr[f] * interp(arr, f + lagFrames)
    }
    return sum / maxF
  }

  const scoreCandidate = (bpm: number): number => {
    const lag = (60 / bpm) * frameRate
    const c1 = corrAtLag(novelty, lag)
    const c2 = corrAtLag(novelty, lag * 2)
    const c3 = corrAtLag(novelty, lag * 3)
    const c4 = corrAtLag(novelty, lag * 4)
    const k1 = corrAtLag(kickNovelty, lag)
    const comb = 0.52 * c1 + 0.28 * c2 + 0.1 * c3 + 0.12 * c4 + 0.22 * k1
    const octaveLog = Math.log2(bpm / 126)
    const prior = Math.exp(-0.5 * (octaveLog / 0.55) ** 2)
    return comb * (0.76 + 0.24 * prior)
  }

  // Coarse scan across 68..194 BPM (step 0.5 BPM)
  const minBpm = 68
  const maxBpm = 194
  const step = 0.5
  const count = Math.round((maxBpm - minBpm) / step) + 1
  const scores = new Float32Array(count)

  let bestScore = -1
  let bestBpm = 120
  let secondScore = -1

  for (let idx = 0; idx < count; idx++) {
    const bpm = minBpm + idx * step
    const sc = scoreCandidate(bpm)
    scores[idx] = sc
    if (sc > bestScore) {
      bestScore = sc
      bestBpm = bpm
    }
  }

  // Best phase for any BPM to inspect odd vs even beat energy ratio (solves half/double-time errors)
  const findBestPhaseFrames = (bpm: number): { phaseFrames: number; evenAvg: number; halfAvg: number } => {
    const periodFrames = (60 / bpm) * frameRate
    const bins = 48
    let bestP = 0
    let bestSum = -1
    let bestBeatCount = 1

    for (let p = 0; p < bins; p++) {
      const phaseF = (p / bins) * periodFrames
      let sum = 0
      let beats = 0
      for (let b = 0; ; b++) {
        const f = phaseF + b * periodFrames
        if (f >= numFrames - 2) break
        sum += 0.65 * interp(novelty, f) + 0.35 * interp(kickNovelty, f)
        beats++
      }
      if (sum > bestSum) {
        bestSum = sum
        bestP = phaseF
        bestBeatCount = Math.max(1, beats)
      }
    }

    let halfSum = 0
    let halfCount = 0
    for (let b = 0; ; b++) {
      const f = bestP + (b + 0.5) * periodFrames
      if (f >= numFrames - 2) break
      halfSum += 0.65 * interp(novelty, f) + 0.35 * interp(kickNovelty, f)
      halfCount++
    }

    return {
      phaseFrames: bestP,
      evenAvg: bestSum / bestBeatCount,
      halfAvg: halfCount > 0 ? halfSum / halfCount : 0
    }
  }

  // Disambiguate half-time vs double-time using phase beat vs half-beat energy contrast
  if (bestBpm <= 102 && bestBpm * 2 <= maxBpm) {
    const { evenAvg, halfAvg } = findBestPhaseFrames(bestBpm)
    // If offbeats carry strong snare/backbeat onsets (> 55% of main beat strength), true tempo is 2x
    if (evenAvg > 0 && halfAvg / evenAvg >= 0.55) {
      const doubleBpm = bestBpm * 2
      const dIdx = Math.round((doubleBpm - minBpm) / step)
      if ((scores[dIdx] ?? 0) > bestScore * 0.68) {
        bestBpm = doubleBpm
        bestScore = scores[dIdx]
      }
    }
  } else if (bestBpm >= 156 && bestBpm / 2 >= minBpm) {
    const halfBpm = bestBpm / 2
    const { evenAvg, halfAvg } = findBestPhaseFrames(halfBpm)
    // If sub-beats are weak (< 45% of main beats), 2x likely latched onto hi-hats -> fold to halfBpm
    if (evenAvg > 0 && halfAvg / evenAvg < 0.45) {
      const hIdx = Math.round((halfBpm - minBpm) / step)
      if ((scores[hIdx] ?? 0) > bestScore * 0.72) {
        bestBpm = halfBpm
        bestScore = scores[hIdx]
      }
    }
  }

  // Fine refinement around bestBpm (±0.8 BPM at 0.1 step)
  let refinedBpm = bestBpm
  let refinedPeak = bestScore
  for (let bpm = Math.max(minBpm, bestBpm - 0.8); bpm <= Math.min(maxBpm, bestBpm + 0.8); bpm += 0.1) {
    const sc = scoreCandidate(bpm)
    if (sc > refinedPeak) {
      refinedPeak = sc
      refinedBpm = bpm
    }
  }

  for (let idx = 0; idx < count; idx++) {
    const bpm = minBpm + idx * step
    const ratio = bpm / refinedBpm
    const nearHarmonic =
      Math.abs(ratio - 1) < 0.08 ||
      Math.abs(ratio - 2) < 0.12 ||
      Math.abs(ratio - 0.5) < 0.08
    if (!nearHarmonic && scores[idx] > secondScore) {
      secondScore = scores[idx]
    }
  }

  const finalBpm = Math.round(refinedBpm)
  const beatMs = 60000 / finalBpm

  // Estimate downbeat phase offset relative to t = 0 of the full track
  const periodFrames = (60 / finalBpm) * frameRate
  const phaseBins = 60
  let bestPhaseFrames = 0
  let bestPhaseScore = -1
  const analysisSeconds = numFrames / frameRate

  for (let p = 0; p < phaseBins; p++) {
    const phaseF = (p / phaseBins) * periodFrames
    let phaseSum = 0
    for (let beat = 0; ; beat++) {
      const f = phaseF + beat * periodFrames
      if (f >= numFrames - 2) break
      const val = 0.55 * interp(kickNovelty, f) + 0.45 * interp(novelty, f)
      const downbeatBoost = beat % 4 === 0 ? 1.25 : 1.0
      phaseSum += val * downbeatBoost
    }
    if (phaseSum > bestPhaseScore) {
      bestPhaseScore = phaseSum
      bestPhaseFrames = phaseF
    }
  }

  const phaseSecWithinWindow = bestPhaseFrames / frameRate
  const absBeatMs = (windowStartSec + phaseSecWithinWindow) * 1000
  let offsetMs = Math.round(((absBeatMs % beatMs) + beatMs) % beatMs)
  if (offsetMs > beatMs * 0.92) {
    offsetMs = Math.round(offsetMs - beatMs)
  }

  const confidence =
    bestScore > 0 && secondScore >= 0
      ? Math.min(0.99, Math.max(0.2, 1 - secondScore / bestScore))
      : 0.5

  if (!Number.isFinite(finalBpm) || analysisSeconds < 4) return null

  return {
    bpm: finalBpm,
    offsetMs,
    confidence: Number(confidence.toFixed(2))
  }
}

function selectActiveSegment(audioBuffer: AudioBuffer): { samples: Float32Array; startSec: number } {
  const sr = audioBuffer.sampleRate
  const totalSamples = audioBuffer.length
  const totalSec = totalSamples / sr
  const ch0 = audioBuffer.getChannelData(0)
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null

  const targetSec = Math.min(40, totalSec)
  const targetLen = Math.floor(targetSec * sr)

  let startSample = 0
  if (totalSec > 48) {
    const candidates = [0.18, 0.36, 0.55].map((pct) =>
      Math.min(totalSamples - targetLen, Math.floor(totalSamples * pct))
    )
    let maxRms = -1
    for (const s of candidates) {
      let sq = 0
      const step = 64
      for (let i = s; i < s + targetLen; i += step) {
        const v = ch0[i]
        sq += v * v
      }
      if (sq > maxRms) {
        maxRms = sq
        startSample = s
      }
    }
  }

  const mono = new Float32Array(targetLen)
  if (ch1) {
    for (let i = 0; i < targetLen; i++) {
      mono[i] = 0.5 * (ch0[startSample + i] + ch1[startSample + i])
    }
  } else {
    mono.set(ch0.subarray(startSample, startSample + targetLen))
  }

  return {
    samples: mono,
    startSec: startSample / sr
  }
}

export async function detectBpmFromArrayBuffer(buffer: ArrayBuffer): Promise<BpmDetectionResult | null> {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  try {
    const decoded = await ctx.decodeAudioData(buffer.slice(0))
    const { samples, startSec } = selectActiveSegment(decoded)
    return estimateBpmFromSamples(samples, decoded.sampleRate, startSec)
  } catch {
    return null
  } finally {
    void ctx.close()
  }
}

export async function detectBpmFromFile(file: File): Promise<BpmDetectionResult | null> {
  try {
    const buf = await file.arrayBuffer()
    return await detectBpmFromArrayBuffer(buf)
  } catch {
    return null
  }
}

export async function detectBpmFromAudioUrl(audioUrl: string): Promise<{
  result: BpmDetectionResult | null
  blockedByCors: boolean
}> {
  if (!audioUrl) return { result: null, blockedByCors: false }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 14000)

  try {
    const resp = await fetch(audioUrl, { mode: 'cors', signal: controller.signal })
    if (!resp.ok) {
      return { result: null, blockedByCors: false }
    }
    const contentLength = Number(resp.headers.get('content-length') || 0)
    if (contentLength > 45 * 1024 * 1024) {
      return { result: null, blockedByCors: false }
    }
    const buf = await resp.arrayBuffer()
    const result = await detectBpmFromArrayBuffer(buf)
    return { result, blockedByCors: false }
  } catch (err) {
    const blocked = err instanceof TypeError
    return { result: null, blockedByCors: blocked }
  } finally {
    window.clearTimeout(timer)
  }
}
