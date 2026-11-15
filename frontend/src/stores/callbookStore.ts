import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  checkBackendHealth,
  convertRubyApi,
  parseLyricsApi
} from '../api/client'
import { AudioSyncEngine, TapTempoCalculator } from '../audio/AudioSyncEngine'
import { detectBpmFromAudioUrl, detectBpmFromFile } from '../audio/bpmDetector'
import { createDemoProject } from '../data/demoProject'
import { DEFAULT_CALL_PRESETS } from '../data/presets'
import {
  loadArchiveLibrary,
  loadArchiveSessionState,
  loadWorkspaceState,
  normalizeCallProject,
  resolveAlertTargetLineId,
  sanitizeProjectForJsonExport,
  saveArchiveLibrary,
  saveArchiveSessionState,
  saveWorkspaceState
} from '../storage/projectStorage'
import type {
  CallCategory,
  CallPreset,
  CallProject,
  CallProjectMeta,
  CallbookArchiveEntry,
  DisplayLayers,
  GtAlert,
  LyricLine,
  LyricLineKind,
  SectionDetectOptions,
  TrackDetailResponse
} from '../types/callbook'
import { parseLrcClientFallback } from '../utils/lrcParser'
import {
  DEFAULT_SECTION_THRESHOLDS,
  SECTION_TITLES,
  buildSectionSummary,
  detectAndMergeSections,
  getLineKind,
  sectionKindLabel,
  suggestManualSectionRange,
  type SectionKind
} from '../utils/sectionDetector'

export type TimelineEntry = { kind: 'line'; sortMs: number; line: LyricLine }

export const useCallbookStore = defineStore('callbook', () => {
  const project = ref<CallProject>(createDemoProject())
  const customPresets = ref<CallPreset[]>([])
  const displayLayers = ref<DisplayLayers>({
    showRuby: true,
    showRomaji: false,
    showTranslation: true
  })

  const activeLineId = ref<string | null>(project.value.lines[0]?.id ?? null)
  const isPlaying = ref(false)
  const currentTimeMs = ref(0)
  const durationMs = ref(48000)
  const knownAudioDurationMs = ref(48000)
  const sectionThresholds = ref<SectionDetectOptions>({ ...DEFAULT_SECTION_THRESHOLDS })
  const playbackRate = ref(1.0)
  const metronomeEnabled = ref(true)
  const metronomeVolume = ref(0.95)
  const gtBeepEnabled = ref(true)
  const followPlayback = ref(true)

  const currentBeatInBar = ref(1)
  const currentBar = ref(1)
  const isDetectingBpm = ref(false)
  const bpmNote = ref('')

  const isPracticeMode = ref(false)
  const activeMobileTab = ref<'timeline' | 'audio' | 'export'>('timeline')
  const backendOnline = ref(false)
  const customProxyEnabled = ref(false)
  const statusMessage = ref('')
  const lastSavedAt = ref<number | null>(null)
  const lastAlertBeepId = ref<string | null>(null)
  const archives = ref<CallbookArchiveEntry[]>([])
  const activeArchiveId = ref<string | null>(null)
  const hasUnsavedChanges = ref(false)
  const hasFetchedExternalLyrics = ref(false)

  const sortedArchives = computed(() =>
    [...archives.value].sort((a, b) => b.savedAt - a.savedAt)
  )
  const activeArchiveEntry = computed(() =>
    archives.value.find((entry) => entry.id === activeArchiveId.value) ?? null
  )
  const needsSavePromptBeforeSwitch = computed(() => {
    if (activeArchiveId.value !== null) {
      return hasUnsavedChanges.value
    }
    return hasFetchedExternalLyrics.value || hasUnsavedChanges.value
  })

  let localObjectUrl: string | null = null
  let localAudioFile: File | null = null
  let bpmDetectToken = 0
  let persistTimer: number | null = null
  const tapTracker = new TapTempoCalculator()

  const allPresets = computed<CallPreset[]>(() => [
    ...DEFAULT_CALL_PRESETS,
    ...customPresets.value
  ])

  const presetMap = computed(() => new Map(allPresets.value.map((p) => [p.id, p])))

  const sortedAlerts = computed(() =>
    [...project.value.alerts].sort((a, b) => a.triggerTimeMs - b.triggerTimeMs)
  )

  const sortedLines = computed(() =>
    [...project.value.lines].sort((a, b) => a.startTimeMs - b.startTimeMs)
  )

  const timelineItems = computed<TimelineEntry[]>(() =>
    sortedLines.value.map((line) => ({
      kind: 'line' as const,
      sortMs: line.startTimeMs,
      line
    }))
  )

  const alertByLineIdMap = computed(() => {
    const map = new Map<string, GtAlert>()
    const lines = sortedLines.value
    if (lines.length === 0) return map
    const lineIds = new Set(lines.map((l) => l.id))
    const claimed = new Set<string>()

    for (const alert of sortedAlerts.value) {
      if (alert.targetLineId && lineIds.has(alert.targetLineId) && !map.has(alert.targetLineId)) {
        map.set(alert.targetLineId, alert)
        claimed.add(alert.targetLineId)
      }
    }

    for (const alert of sortedAlerts.value) {
      if (alert.targetLineId && lineIds.has(alert.targetLineId)) continue
      const resolvedId = resolveAlertTargetLineId(alert, lines, claimed)
      if (resolvedId && !map.has(resolvedId)) {
        map.set(resolvedId, alert)
        claimed.add(resolvedId)
      }
    }

    return map
  })

  function getAlertForLine(lineId: string): GtAlert | undefined {
    return alertByLineIdMap.value.get(lineId)
  }

  const playingLineId = computed<string | null>(() => {
    const t = currentTimeMs.value
    const lines = sortedLines.value
    for (let i = 0; i < lines.length; i++) {
      const curr = lines[i]
      const next = lines[i + 1]
      const end = next ? Math.min(curr.endTimeMs, next.startTimeMs) : curr.endTimeMs
      if (t >= curr.startTimeMs && t < end) {
        return curr.id
      }
    }
    return null
  })

  const beatIntervalMs = computed(() => 60000 / Math.max(30, project.value.meta.bpm || 120))

  // Active countdown or recently triggered GT Alert banner
  const activeGtAlertStatus = computed(() => {
    const t = currentTimeMs.value
    const beatMs = beatIntervalMs.value
    for (const alert of sortedAlerts.value) {
      const leadMs = Math.max(1, alert.leadBeats) * beatMs
      const windowStart = alert.triggerTimeMs - leadMs
      const triggerHoldEnd = alert.triggerTimeMs + 1400
      if (t >= windowStart && t <= triggerHoldEnd) {
        const remainingMs = Math.max(0, alert.triggerTimeMs - t)
        const remainingBeats = Math.ceil(remainingMs / beatMs)
        const progress =
          t >= alert.triggerTimeMs
            ? 1
            : Math.min(1, Math.max(0, (t - windowStart) / leadMs))
        let targetLineId =
          alert.targetLineId && sortedLines.value.some((l) => l.id === alert.targetLineId)
            ? alert.targetLineId
            : undefined
        if (!targetLineId) {
          for (const [lid, mapped] of alertByLineIdMap.value.entries()) {
            if (mapped.id === alert.id) {
              targetLineId = lid
              break
            }
          }
        }
        return {
          alert,
          targetLineId,
          isTriggered: t >= alert.triggerTimeMs,
          remainingMs,
          remainingBeats,
          progress
        }
      }
    }
    return null
  })

  const engine = new AudioSyncEngine({
    onTimeUpdate: (timeMs, durMs) => {
      currentTimeMs.value = timeMs
      durationMs.value = durMs
      if (followPlayback.value && playingLineId.value) {
        activeLineId.value = playingLineId.value
      }
      const activeAlert = activeGtAlertStatus.value
      if (
        gtBeepEnabled.value &&
        isPlaying.value &&
        activeAlert &&
        !activeAlert.isTriggered &&
        lastAlertBeepId.value !== activeAlert.alert.id
      ) {
        lastAlertBeepId.value = activeAlert.alert.id
        engine.playGtAlertBeep()
      } else if (!activeAlert) {
        lastAlertBeepId.value = null
      }
    },
    onLoadedDuration: (durMs) => {
      knownAudioDurationMs.value = Math.round(durMs)
      const added = detectSections({ onlyOutro: true, silent: true })
      if (added > 0) {
        setStatus(`已根据音频总长自动补充 ${added} 段尾奏`)
      }
    },
    onPlayStateChange: (playing) => {
      isPlaying.value = playing
    },
    onBeat: (beatInBar, barNumber) => {
      currentBeatInBar.value = beatInBar
      currentBar.value = barNumber
    },
    onError: (msg) => {
      setStatus(msg)
    }
  })

  function setStatus(msg: string): void {
    statusMessage.value = msg
    if (msg) {
      window.setTimeout(() => {
        if (statusMessage.value === msg) statusMessage.value = ''
      }, 4500)
    }
  }

  function persistArchiveSession(): void {
    void saveArchiveSessionState({
      activeArchiveId: activeArchiveId.value,
      hasUnsavedChanges: hasUnsavedChanges.value,
      hasFetchedExternalLyrics: hasFetchedExternalLyrics.value
    })
  }

  function schedulePersist(markDirty = true): void {
    if (markDirty && !hasUnsavedChanges.value) {
      hasUnsavedChanges.value = true
      persistArchiveSession()
    }
    if (persistTimer !== null) window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(async () => {
      const now = Date.now()
      await saveWorkspaceState({
        project: project.value,
        customPresets: customPresets.value,
        displayLayers: displayLayers.value,
        savedAt: now
      })
      persistArchiveSession()
      lastSavedAt.value = now
    }, 300)
  }

  function syncEngineConfig(): void {
    const maxLineEnd = project.value.lines.reduce((acc, l) => Math.max(acc, l.endTimeMs), 0)
    engine.updateConfig({
      bpm: project.value.meta.bpm,
      offsetMs: project.value.meta.offsetMs,
      timeSignature: project.value.meta.timeSignature,
      playbackRate: playbackRate.value,
      metronomeEnabled: metronomeEnabled.value,
      syntheticDurationMs: Math.max(48000, maxLineEnd + 4000)
    })
  }

  async function init(audioEl: HTMLAudioElement | null): Promise<void> {
    engine.attachAudioElement(audioEl)
    const [saved, savedArchives, savedSession] = await Promise.all([
      loadWorkspaceState(),
      loadArchiveLibrary(),
      loadArchiveSessionState()
    ])
    archives.value = savedArchives
    if (saved) {
      project.value = saved.project
      customPresets.value = saved.customPresets || []
      displayLayers.value = saved.displayLayers || displayLayers.value
      activeLineId.value = project.value.lines[0]?.id ?? null
      lastSavedAt.value = saved.savedAt
      knownAudioDurationMs.value = saved.project.meta.platform === 'synthetic' ? 48000 : 0
    }
    if (savedSession) {
      const stillExists =
        savedSession.activeArchiveId !== null &&
        archives.value.some((a) => a.id === savedSession.activeArchiveId)
      activeArchiveId.value = stillExists ? savedSession.activeArchiveId : null
      hasUnsavedChanges.value = savedSession.hasUnsavedChanges
      hasFetchedExternalLyrics.value = savedSession.hasFetchedExternalLyrics
    } else if (saved && saved.project.meta.platform !== 'synthetic') {
      hasFetchedExternalLyrics.value = true
      hasUnsavedChanges.value = true
    }

    const maxLineEnd = project.value.lines.reduce((acc, l) => Math.max(acc, l.endTimeMs), 0)
    engine.setSource(project.value.meta.audioUrl, Math.max(48000, maxLineEnd + 4000))
    syncEngineConfig()

    const health = await checkBackendHealth()
    backendOnline.value = health.ok
    customProxyEnabled.value = health.customProxyEnabled
  }

  function togglePlay(): void {
    void engine.togglePlay()
  }

  function seek(timeMs: number): void {
    engine.seek(timeMs)
  }

  function setPlaybackRate(rate: number): void {
    playbackRate.value = Math.max(0.5, Math.min(1.25, Number(rate.toFixed(2))))
    syncEngineConfig()
  }

  function setBpm(bpm: number): void {
    project.value.meta.bpm = Math.max(30, Math.min(300, Math.round(bpm)))
    syncEngineConfig()
    schedulePersist()
  }

  function setTimeSignature(sig: '4/4' | '3/4'): void {
    project.value.meta.timeSignature = sig
    syncEngineConfig()
    schedulePersist()
  }

  function adjustOffset(deltaMs: number): void {
    project.value.meta.offsetMs += deltaMs
    syncEngineConfig()
    schedulePersist()
  }

  function setOffset(offsetMs: number): void {
    project.value.meta.offsetMs = Math.round(offsetMs)
    syncEngineConfig()
    schedulePersist()
  }

  function setMetronomeVolume(vol: number): void {
    metronomeVolume.value = Math.max(0, Math.min(1.5, Number(vol.toFixed(2))))
    engine.setMetronomeVolume(metronomeVolume.value)
  }

  function testMetronomeClick(): void {
    void engine.playTestClick(true)
  }

  function tapTempo(): number | null {
    const bpm = tapTracker.tap()
    if (bpm !== null) {
      setBpm(bpm)
      bpmNote.value = `Tap 测速 ${bpm} BPM`
    }
    return bpm
  }

  function toggleLineCall(lineId: string, presetId: string, suffix?: string): boolean {
    const line = project.value.lines.find((l) => l.id === lineId)
    if (!line) return false
    const idx = line.calls.findIndex((c) => c.presetId === presetId)
    if (idx >= 0) {
      line.calls.splice(idx, 1)
      schedulePersist()
      return false
    }
    const cleanSuffix = suffix?.trim()
    line.calls.push(cleanSuffix ? { presetId, suffix: cleanSuffix } : { presetId })
    schedulePersist()
    return true
  }

  function setTailUpdraft(lineId: string, enabled: boolean): void {
    const line = project.value.lines.find((l) => l.id === lineId)
    if (!line) return
    line.tailUpdraft = enabled
    schedulePersist()
  }

  function toggleTailUpdraft(lineId?: string): boolean {
    const targetLine = lineId
      ? project.value.lines.find((l) => l.id === lineId)
      : (resolveLineForQuickTag() ?? resolveTargetLine(undefined))
    if (!targetLine) {
      setStatus('暂无可标记尾句上升气流的歌词行')
      return false
    }
    const next = !targetLine.tailUpdraft
    targetLine.tailUpdraft = next
    activeLineId.value = targetLine.id
    schedulePersist()
    setStatus(next ? '已开启该行尾句上升气流' : '已取消该行尾句上升气流')
    return next
  }

  function updateLineCallSuffix(lineId: string, tagIndex: number, suffix: string): void {
    const line = project.value.lines.find((l) => l.id === lineId)
    if (!line || !line.calls[tagIndex]) return
    line.calls[tagIndex].suffix = suffix.trim() || undefined
    schedulePersist()
  }

  function removeLineCallAt(lineId: string, tagIndex: number): void {
    const line = project.value.lines.find((l) => l.id === lineId)
    if (!line) return
    line.calls.splice(tagIndex, 1)
    schedulePersist()
  }

  function updateMeta(patch: Partial<CallProjectMeta>): void {
    const prevBpm = project.value.meta.bpm
    const prevOffset = project.value.meta.offsetMs
    const prevSig = project.value.meta.timeSignature
    Object.assign(project.value.meta, patch)
    if (
      project.value.meta.bpm !== prevBpm ||
      project.value.meta.offsetMs !== prevOffset ||
      project.value.meta.timeSignature !== prevSig
    ) {
      syncEngineConfig()
    }
    schedulePersist()
  }

  function findNearestLineAt(timeMs: number): LyricLine | undefined {
    const lines = sortedLines.value
    if (lines.length === 0) return undefined
    let best = lines[0]
    let bestDist = Math.abs(best.startTimeMs - timeMs)
    for (let i = 1; i < lines.length; i++) {
      const dist = Math.abs(lines[i].startTimeMs - timeMs)
      if (dist < bestDist) {
        bestDist = dist
        best = lines[i]
      }
    }
    return best
  }

  function resolveTargetLine(lineId?: string): LyricLine | undefined {
    if (lineId) {
      return project.value.lines.find((l) => l.id === lineId)
    }
    const candidateId = activeLineId.value ?? playingLineId.value
    if (candidateId) {
      const found = project.value.lines.find((l) => l.id === candidateId)
      if (found) return found
    }
    return findNearestLineAt(currentTimeMs.value)
  }

  /**
   * Resolve target lyric line for touch quick-tagging: prefers selected line,
   * falls back to currently playing line, then first sorted line.
   */
  function resolveLineForQuickTag(): LyricLine | undefined {
    const candidateId = activeLineId.value ?? playingLineId.value
    if (candidateId) {
      const found = project.value.lines.find((l) => l.id === candidateId)
      if (found) return found
    }
    return sortedLines.value[0]
  }

  function quickTagActiveLine(presetId: string, autoAdvance = false, suffix?: string): boolean {
    const targetLine = resolveLineForQuickTag()
    if (!targetLine) {
      setStatus('暂无可打标的歌词行')
      return false
    }
    activeLineId.value = targetLine.id
    const added = toggleLineCall(targetLine.id, presetId, suffix)
    if (added && autoAdvance) {
      stepActiveLine(1)
    }
    return added
  }

  function toggleLineGtAlert(lineId?: string, callTimingCue?: string): GtAlert | null {
    const targetLine = resolveTargetLine(lineId)
    if (!targetLine) {
      setStatus('暂无可标记 GT 警报的歌词行')
      return null
    }
    activeLineId.value = targetLine.id
    const existing = getAlertForLine(targetLine.id)
    if (existing) {
      project.value.alerts = project.value.alerts.filter((a) => a.id !== existing.id)
      schedulePersist()
      setStatus('已取消该行 GT 警报')
      return null
    }
    const newAlert: GtAlert = {
      id: `gt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      triggerTimeMs: targetLine.startTimeMs,
      leadBeats: 4,
      note: '',
      targetLineId: targetLine.id,
      callTimingCue: callTimingCue ?? ''
    }
    project.value.alerts.push(newAlert)
    project.value.alerts.sort((a, b) => a.triggerTimeMs - b.triggerTimeMs)
    schedulePersist()
    setStatus('已开启该行 GT 警报（可手动输入喊声时机）')
    return newAlert
  }

  function updateLineGtAlert(lineId: string, patch: Partial<GtAlert>): void {
    const line = project.value.lines.find((l) => l.id === lineId)
    let alert = getAlertForLine(lineId)
    if (!alert) {
      if (!line) return
      alert = {
        id: `gt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        triggerTimeMs: line.startTimeMs,
        leadBeats: 4,
        note: '',
        targetLineId: line.id,
        callTimingCue: ''
      }
      project.value.alerts.push(alert)
    }
    if (!alert.targetLineId) {
      alert.targetLineId = lineId
    }
    Object.assign(alert, patch)
    project.value.alerts.sort((a, b) => a.triggerTimeMs - b.triggerTimeMs)
    schedulePersist()
  }

  function insertGtAlert(lineIdOrTimeMs?: string | number, note?: string, leadBeats = 4): GtAlert | null {
    const targetLine =
      typeof lineIdOrTimeMs === 'string'
        ? resolveTargetLine(lineIdOrTimeMs)
        : typeof lineIdOrTimeMs === 'number'
          ? findNearestLineAt(lineIdOrTimeMs)
          : resolveTargetLine()
    if (!targetLine) {
      setStatus('暂无可标记 GT 警报的歌词行')
      return null
    }
    const created = toggleLineGtAlert(targetLine.id)
    if (created && (note !== undefined || leadBeats !== 4)) {
      updateLineGtAlert(targetLine.id, {
        ...(note !== undefined ? { note } : {}),
        ...(leadBeats !== 4 ? { leadBeats } : {})
      })
    }
    return created
  }

  function nudgeGtAlert(alertId: string, deltaMs: number): void {
    const alert = project.value.alerts.find((a) => a.id === alertId)
    if (!alert) return
    alert.triggerTimeMs = Math.max(0, alert.triggerTimeMs + deltaMs)
    project.value.alerts.sort((a, b) => a.triggerTimeMs - b.triggerTimeMs)
    schedulePersist()
  }

  function updateGtAlert(alertId: string, patch: Partial<GtAlert>): void {
    const alert = project.value.alerts.find((a) => a.id === alertId)
    if (!alert) return
    Object.assign(alert, patch)
    project.value.alerts.sort((a, b) => a.triggerTimeMs - b.triggerTimeMs)
    schedulePersist()
  }

  function deleteGtAlert(alertId: string): void {
    project.value.alerts = project.value.alerts.filter((a) => a.id !== alertId)
    schedulePersist()
  }

  function addLyricLine(afterLineId?: string): LyricLine {
    const lines = sortedLines.value
    let startTimeMs = Math.round(currentTimeMs.value)
    if (afterLineId) {
      const refLine = lines.find((l) => l.id === afterLineId)
      if (refLine) startTimeMs = refLine.endTimeMs
    } else if (lines.length > 0 && !isPlaying.value) {
      startTimeMs = lines[lines.length - 1].endTimeMs
    }

    const newLine: LyricLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startTimeMs,
      endTimeMs: startTimeMs + 3000,
      calls: [],
      customShout: '',
      text: {
        original: '新しい歌詞行',
        ruby: '<ruby>新<rt>あたら</rt></ruby>しい<ruby>歌詞行<rt>かしぎょう</rt></ruby>',
        romaji: 'atarashii kashigyou',
        translation: '新歌词行（点击可编辑）'
      }
    }
    project.value.lines.push(newLine)
    project.value.lines.sort((a, b) => a.startTimeMs - b.startTimeMs)
    activeLineId.value = newLine.id
    syncEngineConfig()
    schedulePersist()
    return newLine
  }

  function addSectionLine(input: {
    kind: SectionKind
    startTimeMs?: number
    endTimeMs?: number
    label?: string
    note?: string
    afterLineId?: string
  }): LyricLine {
    const suggested = suggestManualSectionRange(input.kind, sortedLines.value, {
      afterLineId: input.afterLineId,
      currentTimeMs: currentTimeMs.value,
      totalDurationMs: knownAudioDurationMs.value > 0 ? knownAudioDurationMs.value : durationMs.value
    })
    const startTimeMs = Math.max(0, Math.round(input.startTimeMs ?? suggested.startTimeMs))
    const endTimeMs = Math.max(startTimeMs + 1000, Math.round(input.endTimeMs ?? suggested.endTimeMs))
    const newLine: LyricLine = {
      id: `sec-manual-${input.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      startTimeMs,
      endTimeMs,
      kind: input.kind,
      autoGenerated: false,
      calls: [],
      customShout: '',
      text: {
        original: input.label?.trim() || SECTION_TITLES[input.kind],
        translation:
          input.note?.trim() || buildSectionSummary(input.kind, Math.max(1000, endTimeMs - startTimeMs))
      }
    }
    project.value.lines = [...project.value.lines, newLine].sort(
      (a, b) => a.startTimeMs - b.startTimeMs || (getLineKind(a) === 'intro' ? -1 : 1)
    )
    activeLineId.value = newLine.id
    syncEngineConfig()
    schedulePersist()
    setStatus(`已手动添加${sectionKindLabel(input.kind)}段落`)
    return newLine
  }

  function setSectionThresholds(patch: Partial<SectionDetectOptions>): void {
    const clampMs = (v: number | undefined, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(2000, Math.min(60000, Math.round(v)))
        : fallback
    sectionThresholds.value = {
      introThresholdMs: clampMs(patch.introThresholdMs, sectionThresholds.value.introThresholdMs),
      interludeThresholdMs: clampMs(
        patch.interludeThresholdMs,
        sectionThresholds.value.interludeThresholdMs
      ),
      outroThresholdMs: clampMs(patch.outroThresholdMs, sectionThresholds.value.outroThresholdMs)
    }
  }

  function detectSections(opts?: { onlyOutro?: boolean; silent?: boolean }): number {
    const protectedLineIds = new Set(
      project.value.alerts.map((a) => a.targetLineId).filter((id): id is string => Boolean(id))
    )
    const effectiveTotalMs = knownAudioDurationMs.value > 0 ? knownAudioDurationMs.value : undefined
    const prevLines = project.value.lines
    const result = detectAndMergeSections(prevLines, {
      ...sectionThresholds.value,
      totalDurationMs: effectiveTotalMs,
      protectedLineIds,
      onlyOutro: opts?.onlyOutro
    })
    const linesChanged =
      result.lines.length !== prevLines.length ||
      result.lines.some(
        (line, idx) =>
          line.id !== prevLines[idx]?.id ||
          line.startTimeMs !== prevLines[idx]?.startTimeMs ||
          line.endTimeMs !== prevLines[idx]?.endTimeMs
      )
    if (linesChanged) {
      project.value.lines = result.lines
      syncEngineConfig()
      schedulePersist()
    }
    if (!opts?.silent) {
      if (result.stats.totalSections > 0) {
        setStatus(
          `已识别 ${result.stats.totalSections} 段（前奏 ${result.stats.intro} / 间奏 ${result.stats.interlude} / 尾奏 ${result.stats.outro}）`
        )
      } else {
        setStatus('当前阈值下未发现新的前奏 / 间奏 / 尾奏空档')
      }
    }
    return result.stats.totalSections
  }

  async function updateLyricLineText(
    lineId: string,
    payload: {
      original: string
      translation?: string
      customShout?: string
      startTimeMs?: number
      endTimeMs?: number
      kind?: LyricLineKind
    }
  ): Promise<void> {
    const line = project.value.lines.find((l) => l.id === lineId)
    if (!line) return
    if (payload.kind) {
      line.kind = payload.kind
      if (payload.kind !== 'lyric') {
        line.autoGenerated = false
      }
    }
    const origChanged = payload.original !== line.text.original
    line.text.original = payload.original
    line.text.translation = payload.translation
    if (typeof payload.customShout === 'string') line.customShout = payload.customShout
    if (typeof payload.startTimeMs === 'number') {
      line.startTimeMs = Math.max(0, payload.startTimeMs)
      const boundAlert = getAlertForLine(lineId)
      if (boundAlert && boundAlert.targetLineId === lineId) {
        boundAlert.triggerTimeMs = line.startTimeMs
      }
    }
    if (typeof payload.endTimeMs === 'number') line.endTimeMs = Math.max(line.startTimeMs + 300, payload.endTimeMs)

    if (origChanged && payload.original.trim() && getLineKind(line) === 'lyric') {
      try {
        const res = await convertRubyApi(payload.original, false)
        line.text.ruby = res.isJapanese ? res.ruby : undefined
        line.text.romaji = res.isJapanese ? res.romaji : undefined
      } catch {
        // Keep editable fallback if offline
      }
    }

    project.value.lines.sort((a, b) => a.startTimeMs - b.startTimeMs)
    project.value.alerts.sort((a, b) => a.triggerTimeMs - b.triggerTimeMs)
    syncEngineConfig()
    schedulePersist()
  }

  function stampLineToCurrentTime(lineId: string): void {
    const line = project.value.lines.find((l) => l.id === lineId)
    if (!line) return
    const t = Math.round(currentTimeMs.value)
    const duration = Math.max(1000, line.endTimeMs - line.startTimeMs)
    line.startTimeMs = t
    line.endTimeMs = t + duration
    const boundAlert = getAlertForLine(lineId)
    if (boundAlert && boundAlert.targetLineId === lineId) {
      boundAlert.triggerTimeMs = t
      project.value.alerts.sort((a, b) => a.triggerTimeMs - b.triggerTimeMs)
    }
    project.value.lines.sort((a, b) => a.startTimeMs - b.startTimeMs)
    schedulePersist()
  }

  function deleteLyricLine(lineId: string): void {
    project.value.lines = project.value.lines.filter((l) => l.id !== lineId)
    project.value.alerts = project.value.alerts.filter((a) => a.targetLineId !== lineId)
    if (activeLineId.value === lineId) {
      activeLineId.value = project.value.lines[0]?.id ?? null
    }
    schedulePersist()
  }

  function addCustomPreset(input: {
    label: string
    color: string
    category: CallCategory
    shortcut: string
  }): CallPreset {
    const preset: CallPreset = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      label: input.label.trim(),
      color: input.color,
      category: input.category,
      shortcut: input.shortcut.trim().toUpperCase().slice(0, 2),
      builtIn: false
    }
    customPresets.value.push(preset)
    schedulePersist()
    return preset
  }

  function updateCustomPreset(
    presetId: string,
    patch: {
      label: string
      color: string
      category?: CallCategory
      shortcut?: string
    }
  ): boolean {
    const idx = customPresets.value.findIndex((p) => p.id === presetId)
    if (idx < 0) return false
    const existing = customPresets.value[idx]
    if (existing.builtIn) return false
    const cleanLabel = patch.label.trim()
    if (!cleanLabel) return false
    const cleanColor = /^#[0-9a-fA-F]{6}$/.test(patch.color.trim())
      ? patch.color.trim().toUpperCase()
      : existing.color
    customPresets.value[idx] = {
      ...existing,
      label: cleanLabel,
      color: cleanColor,
      category: patch.category ?? existing.category,
      shortcut:
        patch.shortcut !== undefined
          ? patch.shortcut.trim().toUpperCase().slice(0, 2)
          : existing.shortcut
    }
    schedulePersist()
    setStatus(`已更新自定义标签「${cleanLabel}」`)
    return true
  }

  function deleteCustomPreset(presetId: string): void {
    const target = customPresets.value.find((p) => p.id === presetId)
    if (!target || target.builtIn) return
    customPresets.value = customPresets.value.filter((p) => p.id !== presetId)
    for (const line of project.value.lines) {
      line.calls = line.calls.filter((c) => c.presetId !== presetId)
    }
    schedulePersist()
    setStatus(`已删除自定义标签「${target.label}」`)
  }

  function stepActiveLine(direction: -1 | 1): void {
    const lines = sortedLines.value
    if (lines.length === 0) return
    const idx = lines.findIndex((l) => l.id === activeLineId.value)
    const nextIdx =
      idx < 0 ? 0 : Math.max(0, Math.min(lines.length - 1, idx + direction))
    activeLineId.value = lines[nextIdx].id
  }

  async function runAutoBpmDetection(options: { file?: File | null; audioUrl?: string }): Promise<void> {
    const token = ++bpmDetectToken
    isDetectingBpm.value = true
    bpmNote.value = '波形测速中...'

    try {
      if (options.file) {
        const res = await detectBpmFromFile(options.file)
        if (token !== bpmDetectToken) return
        if (res) {
          project.value.meta.bpm = res.bpm
          project.value.meta.offsetMs = res.offsetMs
          syncEngineConfig()
          schedulePersist()
          bpmNote.value = `已识别 ${res.bpm} BPM`
          setStatus(`波形测速完成：${res.bpm} BPM（首拍偏移 ${res.offsetMs >= 0 ? '+' : ''}${res.offsetMs}ms）`)
        } else {
          bpmNote.value = '未能识别节拍，可手动 Tap'
        }
        return
      }

      if (options.audioUrl) {
        const { result, blockedByCors } = await detectBpmFromAudioUrl(options.audioUrl)
        if (token !== bpmDetectToken) return
        if (result) {
          project.value.meta.bpm = result.bpm
          project.value.meta.offsetMs = result.offsetMs
          syncEngineConfig()
          schedulePersist()
          bpmNote.value = `已识别 ${result.bpm} BPM`
          setStatus(`波形测速完成：${result.bpm} BPM（首拍偏移 ${result.offsetMs >= 0 ? '+' : ''}${result.offsetMs}ms）`)
        } else if (blockedByCors) {
          bpmNote.value = '外链跨域受限，请点 Tap 测速'
        } else {
          bpmNote.value = '自动测速未命中，请用 Tap 微调'
        }
        return
      }

      bpmNote.value = '当前无实体音频流，请手动设置或 Tap'
    } finally {
      if (token === bpmDetectToken) {
        isDetectingBpm.value = false
      }
    }
  }

  function detectCurrentAudioBpm(): void {
    if (localAudioFile) {
      void runAutoBpmDetection({ file: localAudioFile })
      return
    }
    if (project.value.meta.audioUrl) {
      void runAutoBpmDetection({ audioUrl: project.value.meta.audioUrl })
      return
    }
    setStatus('Demo 模式固定为 175 BPM')
  }

  function loadDemoProject(): void {
    bpmDetectToken++
    isDetectingBpm.value = false
    localAudioFile = null
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl)
      localObjectUrl = null
    }
    project.value = createDemoProject()
    knownAudioDurationMs.value = 48000
    activeLineId.value = project.value.lines[0]?.id ?? null
    engine.setSource('', 48000)
    syncEngineConfig()
    activeArchiveId.value = null
    hasFetchedExternalLyrics.value = false
    hasUnsavedChanges.value = false
    persistArchiveSession()
    schedulePersist(false)
    bpmNote.value = 'Demo 默认 175 BPM'
    setStatus('已加载 175 BPM 合成 Demo')
  }

  function loadFromTrackDetail(detail: TrackDetailResponse): void {
    bpmDetectToken++
    isDetectingBpm.value = false
    localAudioFile = null
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl)
      localObjectUrl = null
    }
    const hasMetaBpm = typeof detail.track.bpm === 'number' && detail.track.bpm > 0
    const rawDurationMs = detail.track.durationMs > 0 ? detail.track.durationMs : 0
    knownAudioDurationMs.value = rawDurationMs
    const detected = detectAndMergeSections(detail.lines, {
      ...sectionThresholds.value,
      totalDurationMs: rawDurationMs > 0 ? rawDurationMs : undefined
    })
    const maxLineEnd = detected.lines.reduce((acc, l) => Math.max(acc, l.endTimeMs), 0)
    project.value = {
      meta: {
        title: detail.track.title,
        artist: detail.track.artist,
        platform: detail.track.platform,
        trackId: detail.track.id,
        audioUrl: detail.audioUrl || '',
        bpm: hasMetaBpm ? Math.round(detail.track.bpm!) : 120,
        timeSignature: '4/4',
        offsetMs: 0,
        composer: '',
        lyricist: '',
        vocalist: '',
        tuner: '',
        showTuner: false,
        editorName: '',
        editorNote: ''
      },
      alerts: [],
      lines: detected.lines
    }
    activeLineId.value = detected.lines[0]?.id ?? null
    engine.setSource(detail.audioUrl || '', Math.max(48000, detail.track.durationMs, maxLineEnd + 4000))
    syncEngineConfig()
    activeArchiveId.value = null
    hasFetchedExternalLyrics.value = true
    hasUnsavedChanges.value = true
    persistArchiveSession()
    schedulePersist(false)

    if (hasMetaBpm) {
      bpmNote.value = `曲目元数据 ${project.value.meta.bpm} BPM`
    } else if (detail.audioUrl) {
      void runAutoBpmDetection({ audioUrl: detail.audioUrl })
    } else {
      bpmNote.value = '默认 120 BPM · 可上传音频或 Tap'
    }

    const secHint =
      detected.stats.totalSections > 0
        ? `（自动识别前奏 ${detected.stats.intro} / 间奏 ${detected.stats.interlude} / 尾奏 ${detected.stats.outro}）`
        : ''
    setStatus(
      detail.audioUrl
        ? `已导入「${detail.track.title}」${secHint}`
        : `已导入「${detail.track.title}」歌词${secHint}`
    )
  }

  function loadLocalAudioFile(file: File): void {
    bpmDetectToken++
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl)
    }
    knownAudioDurationMs.value = 0
    localAudioFile = file
    localObjectUrl = URL.createObjectURL(file)
    project.value.meta.audioUrl = localObjectUrl
    project.value.meta.platform = 'local'
    project.value.meta.offsetMs = 0
    if (project.value.meta.title.includes('Starlight Overdrive')) {
      project.value.meta.title = file.name.replace(/\.[^.]+$/, '')
      project.value.meta.artist = '本地音频'
    }
    engine.setSource(localObjectUrl)
    syncEngineConfig()
    schedulePersist()
    setStatus(`已加载「${file.name}」，正在识别 BPM...`)
    void runAutoBpmDetection({ file })
  }

  async function importLrcText(
    rawLrc: string,
    translationLrc = '',
    forceJapaneseRuby = false
  ): Promise<void> {
    let parsedLines: LyricLine[] = []
    try {
      const res = await parseLyricsApi(rawLrc, translationLrc, forceJapaneseRuby)
      parsedLines = res.lines
    } catch {
      parsedLines = parseLrcClientFallback(rawLrc, translationLrc)
    }

    if (parsedLines.length === 0) {
      setStatus('未解析到有效歌词行，请检查粘贴的文本')
      return
    }

    const detected = detectAndMergeSections(parsedLines, {
      ...sectionThresholds.value,
      totalDurationMs: knownAudioDurationMs.value > 0 ? knownAudioDurationMs.value : undefined
    })

    project.value.lines = detected.lines
    const validIds = new Set(detected.lines.map((l) => l.id))
    project.value.alerts = project.value.alerts.filter(
      (a) => !a.targetLineId || validIds.has(a.targetLineId)
    )
    activeLineId.value = detected.lines[0]?.id ?? null
    syncEngineConfig()
    activeArchiveId.value = null
    hasFetchedExternalLyrics.value = true
    hasUnsavedChanges.value = true
    persistArchiveSession()
    schedulePersist(false)
    const secHint =
      detected.stats.totalSections > 0
        ? `（自动识别前奏 ${detected.stats.intro} / 间奏 ${detected.stats.interlude} / 尾奏 ${detected.stats.outro}）`
        : ''
    setStatus(`已成功解析 ${parsedLines.length} 行歌词${secHint}`)
  }

  function exportProjectJson(): void {
    const clean = sanitizeProjectForJsonExport(project.value)
    const payload =
      customPresets.value.length > 0
        ? { ...clean, customPresets: customPresets.value }
        : clean
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(clean.meta.title || 'call-project').replace(/[\\/:*?"<>|]/g, '_')}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function importProjectJson(rawJson: string): boolean {
    try {
      const parsed = JSON.parse(rawJson) as CallProject & { customPresets?: CallPreset[] }
      if (!parsed?.meta || !Array.isArray(parsed.lines) || !Array.isArray(parsed.alerts)) {
        setStatus('JSON 工程格式无效：缺少 meta / lines / alerts 字段')
        return false
      }
      bpmDetectToken++
      isDetectingBpm.value = false
      const normalized = normalizeCallProject(parsed)
      project.value = normalized
      if (Array.isArray(parsed.customPresets) && parsed.customPresets.length > 0) {
        const merged = [...customPresets.value]
        for (const incoming of parsed.customPresets) {
          if (!incoming?.id || incoming.builtIn) continue
          const idx = merged.findIndex((p) => p.id === incoming.id)
          const sanitized: CallPreset = {
            id: String(incoming.id),
            label: String(incoming.label || 'Call').trim() || 'Call',
            color: String(incoming.color || '#EC4899'),
            category: incoming.category || 'compound',
            shortcut: String(incoming.shortcut || '').trim().toUpperCase().slice(0, 2),
            builtIn: false
          }
          if (idx >= 0) {
            merged[idx] = sanitized
          } else {
            merged.push(sanitized)
          }
        }
        customPresets.value = merged
      }
      knownAudioDurationMs.value = normalized.meta.platform === 'synthetic' ? 48000 : 0
      activeLineId.value = normalized.lines[0]?.id ?? null
      const maxEnd = normalized.lines.reduce((acc, l) => Math.max(acc, l.endTimeMs), 0)
      engine.setSource(normalized.meta.audioUrl || '', Math.max(48000, maxEnd + 4000))
      syncEngineConfig()
      activeArchiveId.value = null
      hasFetchedExternalLyrics.value = true
      hasUnsavedChanges.value = true
      persistArchiveSession()
      schedulePersist(false)
      setStatus(`已导入工程：${normalized.meta.title}`)
      return true
    } catch {
      setStatus('无法解析 JSON 文件')
      return false
    }
  }

  function saveCurrentToArchive(options?: { asNew?: boolean; customName?: string }): CallbookArchiveEntry {
    const now = Date.now()
    const clonedProject = normalizeCallProject(JSON.parse(JSON.stringify(project.value)) as CallProject)
    const clonedPresets = JSON.parse(JSON.stringify(customPresets.value)) as CallPreset[]
    const taggedCount = clonedProject.lines.filter(
      (l) => l.calls.length > 0 || Boolean(l.customShout?.trim()) || Boolean(l.tailUpdraft)
    ).length

    const existing =
      !options?.asNew && activeArchiveId.value
        ? archives.value.find((item) => item.id === activeArchiveId.value)
        : undefined

    const resolvedName =
      options?.customName?.trim() ||
      existing?.name ||
      clonedProject.meta.title.trim() ||
      '未命名 Call 本'

    const entry: CallbookArchiveEntry = {
      id: existing?.id ?? `archive-${now}-${Math.random().toString(36).slice(2, 7)}`,
      name: resolvedName,
      createdAt: existing?.createdAt ?? now,
      savedAt: now,
      project: clonedProject,
      customPresets: clonedPresets,
      lineCount: clonedProject.lines.length,
      taggedCount,
      alertCount: clonedProject.alerts.length
    }

    if (existing) {
      archives.value = archives.value.map((item) => (item.id === entry.id ? entry : item))
    } else {
      archives.value = [entry, ...archives.value]
    }
    activeArchiveId.value = entry.id
    hasUnsavedChanges.value = false
    hasFetchedExternalLyrics.value = false
    void saveArchiveLibrary(archives.value)
    persistArchiveSession()
    schedulePersist(false)
    setStatus(existing ? `已更新存档「${entry.name}」` : `已保存至 Call 本存档「${entry.name}」`)
    return entry
  }

  function switchToArchive(archiveId: string): boolean {
    const found = archives.value.find((item) => item.id === archiveId)
    if (!found) {
      setStatus('未找到对应的 Call 本存档')
      return false
    }
    bpmDetectToken++
    isDetectingBpm.value = false
    localAudioFile = null
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl)
      localObjectUrl = null
    }
    const restoredProject = normalizeCallProject(
      JSON.parse(JSON.stringify(found.project)) as CallProject
    )
    if (restoredProject.meta.audioUrl.startsWith('blob:')) {
      restoredProject.meta.audioUrl = ''
    }
    project.value = restoredProject
    if (Array.isArray(found.customPresets)) {
      customPresets.value = JSON.parse(JSON.stringify(found.customPresets)) as CallPreset[]
    }
    const maxEnd = restoredProject.lines.reduce((acc, l) => Math.max(acc, l.endTimeMs), 0)
    knownAudioDurationMs.value = restoredProject.meta.platform === 'synthetic' ? 48000 : 0
    activeLineId.value = restoredProject.lines[0]?.id ?? null
    engine.setSource(restoredProject.meta.audioUrl || '', Math.max(48000, maxEnd + 4000))
    syncEngineConfig()

    activeArchiveId.value = found.id
    hasUnsavedChanges.value = false
    hasFetchedExternalLyrics.value = false
    persistArchiveSession()
    schedulePersist(false)
    bpmNote.value = `${restoredProject.meta.bpm} BPM · 已加载存档`
    setStatus(`已切换至存档「${found.name}」`)
    return true
  }

  function renameArchive(archiveId: string, nextName: string): boolean {
    const trimmed = nextName.trim()
    if (!trimmed) return false
    let updated = false
    archives.value = archives.value.map((item) => {
      if (item.id !== archiveId) return item
      updated = true
      return {
        ...item,
        name: trimmed,
        savedAt: Date.now()
      }
    })
    if (!updated) return false
    void saveArchiveLibrary(archives.value)
    setStatus(`已将存档重命名为「${trimmed}」`)
    return true
  }

  function deleteArchive(archiveId: string): boolean {
    const target = archives.value.find((item) => item.id === archiveId)
    if (!target) return false
    archives.value = archives.value.filter((item) => item.id !== archiveId)
    if (activeArchiveId.value === archiveId) {
      activeArchiveId.value = null
      hasUnsavedChanges.value = project.value.lines.length > 0
      persistArchiveSession()
    }
    void saveArchiveLibrary(archives.value)
    setStatus(`已删除存档「${target.name}」`)
    return true
  }

  return {
    project,
    customPresets,
    displayLayers,
    archives,
    sortedArchives,
    activeArchiveId,
    activeArchiveEntry,
    hasUnsavedChanges,
    hasFetchedExternalLyrics,
    needsSavePromptBeforeSwitch,
    allPresets,
    presetMap,
    sortedAlerts,
    sortedLines,
    timelineItems,
    activeLineId,
    playingLineId,
    activeGtAlertStatus,
    isPlaying,
    currentTimeMs,
    durationMs,
    knownAudioDurationMs,
    sectionThresholds,
    playbackRate,
    metronomeEnabled,
    metronomeVolume,
    gtBeepEnabled,
    followPlayback,
    currentBeatInBar,
    currentBar,
    isDetectingBpm,
    bpmNote,
    isPracticeMode,
    activeMobileTab,
    backendOnline,
    customProxyEnabled,
    statusMessage,
    lastSavedAt,
    init,
    togglePlay,
    seek,
    setPlaybackRate,
    setBpm,
    setTimeSignature,
    adjustOffset,
    setOffset,
    setMetronomeVolume,
    testMetronomeClick,
    detectCurrentAudioBpm,
    tapTempo,
    updateMeta,
    getAlertForLine,
    toggleLineGtAlert,
    updateLineGtAlert,
    toggleLineCall,
    setTailUpdraft,
    toggleTailUpdraft,
    resolveLineForQuickTag,
    quickTagActiveLine,
    updateLineCallSuffix,
    removeLineCallAt,
    insertGtAlert,
    nudgeGtAlert,
    updateGtAlert,
    deleteGtAlert,
    addLyricLine,
    addSectionLine,
    setSectionThresholds,
    detectSections,
    updateLyricLineText,
    stampLineToCurrentTime,
    deleteLyricLine,
    addCustomPreset,
    updateCustomPreset,
    deleteCustomPreset,
    stepActiveLine,
    loadDemoProject,
    loadFromTrackDetail,
    loadLocalAudioFile,
    importLrcText,
    exportProjectJson,
    importProjectJson,
    saveCurrentToArchive,
    switchToArchive,
    renameArchive,
    deleteArchive,
    syncEngineConfig,
    schedulePersist,
    setStatus
  }
})
