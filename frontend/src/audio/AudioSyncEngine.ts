export interface AudioEngineCallbacks {
  onTimeUpdate: (timeMs: number, durationMs: number) => void
  onLoadedDuration?: (durationMs: number) => void
  onPlayStateChange: (playing: boolean) => void
  onBeat: (beatInBar: number, barNumber: number, isAccent: boolean) => void
  onError: (message: string) => void
}

/**
 * Anti-CORS Phase-Locked Audio & BPM Metronome Engine.
 *
 * Architecture guarantee:
 * - External / local audio plays strictly via a standalone HTML5 <audio> element.
 *   We NEVER call `audioCtx.createMediaElementSource()`, preventing CORS silence on third-party streams.
 * - Web Audio API Oscillator Lookahead Scheduler runs in parallel, tightly locked to
 *   `audio.currentTime * 1000`, `bpm`, `offsetMs`, `timeSignature`, and `playbackRate`.
 * - When in Synthetic Demo mode (no audioUrl), Web Audio API synthesizes a copyright-free
 *   electronic drum track locked to the exact same beat phase clock.
 */
export class AudioSyncEngine {
  private audioEl: HTMLAudioElement | null = null
  private audioCtx: AudioContext | null = null
  private callbacks: AudioEngineCallbacks

  private bpm = 175
  private offsetMs = 0
  private beatsPerBar = 4
  private playbackRate = 1.0
  private metronomeEnabled = true
  private syntheticMode = true

  private isPlaying = false
  private syntheticPosMs = 0
  private syntheticDurationMs = 48000
  private lastPerfMs = 0

  private schedulerTimer: number | null = null
  private rafId: number | null = null
  private scheduledBeats = new Set<number>()
  private scheduledHalfBeats = new Set<number>()
  private visualTimers: number[] = []
  private noiseBuffer: AudioBuffer | null = null

  constructor(callbacks: AudioEngineCallbacks) {
    this.callbacks = callbacks
  }

  private metronomeVolume = 0.95

  public setMetronomeVolume(volume: number): void {
    this.metronomeVolume = Math.max(0, Math.min(1.5, volume))
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioCtx = new Ctx()
      this.noiseBuffer = this.createNoiseBuffer(this.audioCtx)
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume()
    }
    return this.audioCtx
  }

  private async ensureAudioContextReady(): Promise<AudioContext> {
    const ctx = this.ensureAudioContext()
    if (ctx.state === 'suspended') {
      try {
        await Promise.race([
          ctx.resume(),
          new Promise<void>((resolve) => window.setTimeout(resolve, 80))
        ])
      } catch {
        // Ignore resume rejection if triggered outside user gesture
      }
    }
    return ctx
  }

  public async playTestClick(isAccent = true): Promise<void> {
    const ctx = await this.ensureAudioContextReady()
    this.scheduleMetronomeClick(ctx, ctx.currentTime + 0.015, isAccent)
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.25)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    return buffer
  }

  public attachAudioElement(el: HTMLAudioElement | null): void {
    this.audioEl = el
    if (!el) return

    el.addEventListener('play', () => {
      if (!this.syntheticMode) {
        void this.ensureAudioContextReady()
        this.resetScheduledBeats()
        this.isPlaying = true
        this.callbacks.onPlayStateChange(true)
        this.startLoops()
      }
    })

    el.addEventListener('pause', () => {
      if (!this.syntheticMode) {
        this.isPlaying = false
        this.callbacks.onPlayStateChange(false)
        this.stopLoops()
      }
    })

    el.addEventListener('ended', () => {
      if (!this.syntheticMode) {
        this.isPlaying = false
        this.callbacks.onPlayStateChange(false)
        this.stopLoops()
        this.callbacks.onTimeUpdate(this.getDurationMs(), this.getDurationMs())
      }
    })

    el.addEventListener('loadedmetadata', () => {
      if (!this.syntheticMode) {
        const durMs = this.getDurationMs()
        this.callbacks.onTimeUpdate(this.getCurrentTimeMs(), durMs)
        if (durMs > 0) {
          this.callbacks.onLoadedDuration?.(durMs)
        }
      }
    })

    el.addEventListener('error', () => {
      if (!this.syntheticMode && el.getAttribute('src')) {
        this.isPlaying = false
        this.callbacks.onPlayStateChange(false)
        this.stopLoops()
        this.callbacks.onError('音频直链加载失败（可能已过期或受防盗链限制），可上传本地音频或切换合成鼓点 Demo。')
      }
    })
  }

  public setSource(audioUrl: string, fallbackDurationMs = 48000): void {
    const trimmed = (audioUrl || '').trim()
    this.pause()
    this.syntheticDurationMs = Math.max(15000, fallbackDurationMs)

    if (trimmed) {
      this.syntheticMode = false
      if (this.audioEl) {
        this.audioEl.src = trimmed
        this.audioEl.playbackRate = this.playbackRate
        this.audioEl.load()
      }
    } else {
      this.syntheticMode = true
      if (this.audioEl) {
        this.audioEl.removeAttribute('src')
        this.audioEl.load()
      }
      this.syntheticPosMs = 0
    }
    this.resetScheduledBeats()
    this.callbacks.onTimeUpdate(0, this.getDurationMs())
  }

  public updateConfig(config: {
    bpm?: number
    offsetMs?: number
    timeSignature?: '4/4' | '3/4'
    playbackRate?: number
    metronomeEnabled?: boolean
    syntheticDurationMs?: number
  }): void {
    if (typeof config.bpm === 'number' && Number.isFinite(config.bpm)) {
      this.bpm = Math.max(30, Math.min(300, config.bpm))
    }
    if (typeof config.offsetMs === 'number' && Number.isFinite(config.offsetMs)) {
      this.offsetMs = config.offsetMs
    }
    if (config.timeSignature) {
      this.beatsPerBar = config.timeSignature === '3/4' ? 3 : 4
    }
    if (typeof config.playbackRate === 'number' && Number.isFinite(config.playbackRate)) {
      this.playbackRate = Math.max(0.5, Math.min(1.5, config.playbackRate))
      if (this.audioEl && !this.syntheticMode) {
        this.audioEl.playbackRate = this.playbackRate
      }
    }
    if (typeof config.metronomeEnabled === 'boolean') {
      this.metronomeEnabled = config.metronomeEnabled
      if (this.audioEl) {
        this.audioEl.volume = this.metronomeEnabled ? 0.72 : 1.0
      }
    }
    if (typeof config.syntheticDurationMs === 'number' && config.syntheticDurationMs > 0) {
      this.syntheticDurationMs = Math.max(15000, config.syntheticDurationMs)
    }
    this.resetScheduledBeats()
  }

  public getCurrentTimeMs(): number {
    if (!this.syntheticMode && this.audioEl) {
      return Math.max(0, this.audioEl.currentTime * 1000)
    }
    if (this.syntheticMode && this.isPlaying) {
      const now = performance.now()
      const elapsed = (now - this.lastPerfMs) * this.playbackRate
      this.lastPerfMs = now
      this.syntheticPosMs = Math.min(this.syntheticDurationMs, this.syntheticPosMs + elapsed)
    }
    return this.syntheticPosMs
  }

  public getDurationMs(): number {
    if (!this.syntheticMode && this.audioEl && Number.isFinite(this.audioEl.duration) && this.audioEl.duration > 0) {
      return this.audioEl.duration * 1000
    }
    return this.syntheticDurationMs
  }

  public async play(): Promise<void> {
    await this.ensureAudioContextReady()
    this.resetScheduledBeats()

    if (this.syntheticMode) {
      if (this.syntheticPosMs >= this.syntheticDurationMs - 50) {
        this.syntheticPosMs = 0
      }
      this.lastPerfMs = performance.now()
      this.isPlaying = true
      this.callbacks.onPlayStateChange(true)
      this.startLoops()
      return
    }

    if (this.audioEl) {
      try {
        this.audioEl.volume = this.metronomeEnabled ? 0.72 : 1.0
        this.audioEl.playbackRate = this.playbackRate
        await this.audioEl.play()
        this.isPlaying = true
        this.callbacks.onPlayStateChange(true)
        this.startLoops()
      } catch (err) {
        this.isPlaying = false
        this.callbacks.onPlayStateChange(false)
        this.callbacks.onError(
          err instanceof Error ? `播放受阻：${err.message}` : '浏览器阻止了自动播放，请再次点击播放。'
        )
      }
    }
  }

  public pause(): void {
    if (this.syntheticMode && this.isPlaying) {
      this.getCurrentTimeMs()
    }
    this.isPlaying = false
    if (this.audioEl && !this.syntheticMode && !this.audioEl.paused) {
      this.audioEl.pause()
    }
    this.stopLoops()
    this.callbacks.onPlayStateChange(false)
  }

  public togglePlay(): Promise<void> | void {
    if (this.isPlaying) {
      this.pause()
      return
    }
    return this.play()
  }

  public seek(timeMs: number): void {
    const clamped = Math.max(0, Math.min(this.getDurationMs(), timeMs))
    this.resetScheduledBeats()

    if (this.syntheticMode) {
      this.syntheticPosMs = clamped
      this.lastPerfMs = performance.now()
    } else if (this.audioEl) {
      this.audioEl.currentTime = clamped / 1000
    }
    this.callbacks.onTimeUpdate(clamped, this.getDurationMs())
  }

  public playGtAlertBeep(): void {
    const ctx = this.ensureAudioContext()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1046.5, now)
    osc.frequency.setValueAtTime(1318.5, now + 0.08)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.24)
  }

  private resetScheduledBeats(): void {
    this.scheduledBeats.clear()
    this.scheduledHalfBeats.clear()
    for (const id of this.visualTimers) {
      window.clearTimeout(id)
    }
    this.visualTimers = []
  }

  private startLoops(): void {
    this.stopLoops()
    this.schedulerTimer = window.setInterval(() => this.runLookaheadScheduler(), 25)
    const tickRaf = () => {
      if (!this.isPlaying) return
      const current = this.getCurrentTimeMs()
      const duration = this.getDurationMs()
      this.callbacks.onTimeUpdate(current, duration)

      if (this.syntheticMode && current >= duration) {
        this.pause()
        this.callbacks.onTimeUpdate(duration, duration)
        return
      }
      this.rafId = window.requestAnimationFrame(tickRaf)
    }
    this.rafId = window.requestAnimationFrame(tickRaf)
    this.runLookaheadScheduler()
  }

  private stopLoops(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer)
      this.schedulerTimer = null
    }
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.resetScheduledBeats()
  }

  private runLookaheadScheduler(): void {
    if (!this.isPlaying || !this.audioCtx) return

    const ctx = this.audioCtx
    const audioReady = ctx.state === 'running'
    if (!audioReady) {
      void ctx.resume()
    }

    const trackTimeMs = this.getCurrentTimeMs()
    const beatIntervalMs = 60000 / this.bpm
    const lookaheadWallMs = 140
    const lookaheadTrackMs = trackTimeMs + lookaheadWallMs * this.playbackRate

    let beatIdx = Math.ceil((trackTimeMs - this.offsetMs - 15) / beatIntervalMs)
    while (true) {
      const beatTrackMs = this.offsetMs + beatIdx * beatIntervalMs
      if (beatTrackMs > lookaheadTrackMs) break

      if (beatTrackMs >= 0 && !this.scheduledBeats.has(beatIdx)) {
        this.scheduledBeats.add(beatIdx)
        const deltaSec = Math.max(0, (beatTrackMs - trackTimeMs) / (1000 * this.playbackRate))
        const when = Math.max(ctx.currentTime + 0.008, ctx.currentTime + deltaSec)
        const beatInBar = ((beatIdx % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar
        const barNumber = Math.floor(beatIdx / this.beatsPerBar) + 1
        const isAccent = beatInBar === 0

        if (audioReady && this.metronomeEnabled) {
          this.scheduleMetronomeClick(ctx, when, isAccent)
        }
        if (audioReady && this.syntheticMode) {
          this.scheduleSyntheticBeat(ctx, when, beatInBar)
        }

        const timerId = window.setTimeout(() => {
          if (this.isPlaying) {
            this.callbacks.onBeat(beatInBar + 1, barNumber, isAccent)
          }
        }, Math.round(deltaSec * 1000))
        this.visualTimers.push(timerId)
      }

      // Offbeat 8th-note hi-hat for synthetic backing groove
      if (audioReady && this.syntheticMode && !this.scheduledHalfBeats.has(beatIdx)) {
        const halfTrackMs = beatTrackMs + beatIntervalMs * 0.5
        if (halfTrackMs >= trackTimeMs - 2 && halfTrackMs <= lookaheadTrackMs) {
          this.scheduledHalfBeats.add(beatIdx)
          const deltaSec = Math.max(0, (halfTrackMs - trackTimeMs) / (1000 * this.playbackRate))
          this.scheduleHiHat(ctx, Math.max(ctx.currentTime + 0.008, ctx.currentTime + deltaSec), 0.08)
        }
      }

      beatIdx++
    }

    // Prune older beat indices to keep memory bounded
    if (this.scheduledBeats.size > 64) {
      const cutoff = beatIdx - 32
      for (const idx of this.scheduledBeats) {
        if (idx < cutoff) this.scheduledBeats.delete(idx)
      }
      for (const idx of this.scheduledHalfBeats) {
        if (idx < cutoff) this.scheduledHalfBeats.delete(idx)
      }
    }
  }

  private scheduleMetronomeClick(ctx: AudioContext, when: number, isAccent: boolean): void {
    const safeWhen = Math.max(ctx.currentTime + 0.006, when)
    const vol = this.metronomeVolume
    if (vol <= 0.01) return

    // Crisp pitched woodblock/clave transient so clicks remain clearly audible over full mixes
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(isAccent ? 1560 : 980, safeWhen)
    osc.frequency.exponentialRampToValueAtTime(isAccent ? 1040 : 680, safeWhen + 0.032)

    const peak = Math.min(1.0, (isAccent ? 0.78 : 0.52) * vol)
    gain.gain.setValueAtTime(0.001, safeWhen)
    gain.gain.linearRampToValueAtTime(peak, safeWhen + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.001, safeWhen + 0.055)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(safeWhen)
    osc.stop(safeWhen + 0.06)

    // Short high-band attack snap so beat downbeats punch through dense instrumentals
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource()
      noise.buffer = this.noiseBuffer
      const hp = ctx.createBiquadFilter()
      hp.type = 'bandpass'
      hp.frequency.setValueAtTime(isAccent ? 3200 : 2200, safeWhen)
      hp.Q.setValueAtTime(2.4, safeWhen)
      const nGain = ctx.createGain()
      const nPeak = Math.min(0.6, (isAccent ? 0.34 : 0.2) * vol)
      nGain.gain.setValueAtTime(nPeak, safeWhen)
      nGain.gain.exponentialRampToValueAtTime(0.001, safeWhen + 0.018)
      noise.connect(hp)
      hp.connect(nGain)
      nGain.connect(ctx.destination)
      noise.start(safeWhen)
      noise.stop(safeWhen + 0.022)
    }
  }

  private scheduleSyntheticBeat(ctx: AudioContext, when: number, beatInBar: number): void {
    if (beatInBar === 0 || beatInBar === 2) {
      // Kick drum
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(145, when)
      osc.frequency.exponentialRampToValueAtTime(42, when + 0.09)
      gain.gain.setValueAtTime(0.38, when)
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.16)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(when)
      osc.stop(when + 0.17)
    }

    if (beatInBar === 1 || (this.beatsPerBar === 4 && beatInBar === 3) || (this.beatsPerBar === 3 && beatInBar === 2)) {
      // Snare / Clap
      if (this.noiseBuffer) {
        const src = ctx.createBufferSource()
        src.buffer = this.noiseBuffer
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.setValueAtTime(1800, when)
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.22, when)
        gain.gain.exponentialRampToValueAtTime(0.001, when + 0.11)
        src.connect(filter)
        filter.connect(gain)
        gain.connect(ctx.destination)
        src.start(when)
        src.stop(when + 0.12)
      }
    }

    // Subtle synth bass pulse on every beat for energetic live feel
    const bass = ctx.createOscillator()
    const bassGain = ctx.createGain()
    const notes = [110, 110, 130.81, 146.83]
    bass.type = 'sawtooth'
    bass.frequency.setValueAtTime(notes[beatInBar % notes.length], when)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(480, when)
    bassGain.gain.setValueAtTime(0.08, when)
    bassGain.gain.exponentialRampToValueAtTime(0.001, when + 0.14)
    bass.connect(lp)
    lp.connect(bassGain)
    bassGain.connect(ctx.destination)
    bass.start(when)
    bass.stop(when + 0.15)
  }

  private scheduleHiHat(ctx: AudioContext, when: number, volume: number): void {
    if (!this.noiseBuffer) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.setValueAtTime(6500, when)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.045)
    src.connect(hp)
    hp.connect(gain)
    gain.connect(ctx.destination)
    src.start(when)
    src.stop(when + 0.05)
  }

  public dispose(): void {
    this.pause()
    if (this.audioCtx) {
      void this.audioCtx.close()
      this.audioCtx = null
    }
  }
}

export class TapTempoCalculator {
  private taps: number[] = []

  public reset(): void {
    this.taps = []
  }

  public tap(): number | null {
    const now = performance.now()
    if (this.taps.length > 0 && now - this.taps[this.taps.length - 1] > 2000) {
      this.taps = []
    }
    this.taps.push(now)
    if (this.taps.length > 10) {
      this.taps.shift()
    }
    if (this.taps.length < 2) return null

    const intervals: number[] = []
    for (let i = 1; i < this.taps.length; i++) {
      const diff = this.taps[i] - this.taps[i - 1]
      if (diff >= 180 && diff <= 2000) {
        intervals.push(diff)
      }
    }
    if (intervals.length === 0) return null

    const sorted = [...intervals].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const filtered = intervals.filter((v) => v >= median * 0.68 && v <= median * 1.42)
    const pool = filtered.length > 0 ? filtered : intervals

    const avgInterval = pool.reduce((sum, v) => sum + v, 0) / pool.length
    if (avgInterval <= 0) return null
    const bpm = Math.round(60000 / avgInterval)
    return Math.max(40, Math.min(260, bpm))
  }
}
