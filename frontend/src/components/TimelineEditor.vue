<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  AlertTriangle,
  Edit3,
  HelpCircle,
  ListPlus,
  Plus,
  Sparkles,
  Trash2
} from 'lucide-vue-next'
import { CATEGORY_LABELS, SING_ALONG_PRESET_ID } from '../data/presets'
import { useCallbookStore } from '../stores/callbookStore'
import { useUiStore } from '../stores/uiStore'
import type { CallCategory, CallPreset, LyricLine, LyricLineKind } from '../types/callbook'
import {
  getUnalignedCustomShout,
  resolveLineAlignedCalls,
  type ResolvedAlignedCue
} from '../utils/alignedCalls'
import {
  openCustomPresetContextMenu,
  requestDeleteCustomPresetWithConfirm,
  triggerCallPresetForLine
} from '../utils/callTagActions'
import {
  SECTION_TITLES,
  formatGapSec,
  getLineKind,
  isSectionLine,
  sectionKindLabel,
  suggestManualSectionRange,
  type SectionKind
} from '../utils/sectionDetector'
import { formatMsToClock, parseClockToMs } from '../utils/time'
import AlignedLyricText from './AlignedLyricText.vue'
import CallBadge from './CallBadge.vue'
import PrismSwitch from './prism/PrismSwitch.vue'

const props = withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  {
    compact: false
  }
)

const store = useCallbookStore()
const uiStore = useUiStore()
const timelineListRef = ref<HTMLElement | null>(null)

const showShortcuts = ref(false)
const showNewPresetForm = ref(false)
const showInlinePresetCreator = ref(false)
const newPresetLabel = ref('')
const inlinePresetLabel = ref('')
const newPresetColor = ref('#EC4899')
const newPresetCategory = ref<CallCategory>('compound')
const newPresetShortcut = ref('Q')
let presetLongPressTimer: number | null = null

const editingTagKey = ref<string | null>(null)
const editingTagSuffix = ref('')

const editingLineId = ref<string | null>(null)
const lineDraft = ref({
  original: '',
  translation: '',
  customShout: '',
  startTimeStr: '',
  endTimeStr: '',
  kind: 'lyric' as LyricLineKind
})

const showSectionPanel = ref(false)
const manualSectionKind = ref<SectionKind>('interlude')
const manualSectionStartStr = ref('00:00.00')
const manualSectionEndStr = ref('00:08.00')
const manualSectionLabel = ref('')
const manualSectionNote = ref('')

const sectionCount = computed(() => store.sortedLines.filter((l) => isSectionLine(l)).length)

const SECTION_KIND_OPTIONS: Array<{ kind: SectionKind; label: string; color: string }> = [
  { kind: 'intro', label: '前奏', color: '#0891B2' },
  { kind: 'interlude', label: '间奏', color: '#6366F1' },
  { kind: 'outro', label: '尾奏', color: '#E11D48' }
]

const LINE_KIND_OPTIONS: Array<{ kind: LyricLineKind; label: string }> = [
  { kind: 'lyric', label: '歌词' },
  { kind: 'intro', label: '前奏' },
  { kind: 'interlude', label: '间奏' },
  { kind: 'outro', label: '尾奏' }
]

function sectionAccentColor(kind: LyricLineKind): string {
  if (kind === 'intro') return '#0891B2'
  if (kind === 'interlude') return '#6366F1'
  if (kind === 'outro') return '#E11D48'
  return 'var(--md-primary)'
}

function syncManualSectionSuggestedRange(kind: SectionKind): void {
  const suggested = suggestManualSectionRange(kind, store.sortedLines, {
    afterLineId: store.activeLineId || undefined,
    currentTimeMs: store.currentTimeMs,
    totalDurationMs: store.knownAudioDurationMs > 0 ? store.knownAudioDurationMs : store.durationMs
  })
  manualSectionStartStr.value = formatMsToClock(suggested.startTimeMs)
  manualSectionEndStr.value = formatMsToClock(suggested.endTimeMs)
}

function selectManualSectionKind(kind: SectionKind): void {
  manualSectionKind.value = kind
  syncManualSectionSuggestedRange(kind)
}

function toggleSectionPanel(): void {
  showSectionPanel.value = !showSectionPanel.value
  if (showSectionPanel.value) {
    syncManualSectionSuggestedRange(manualSectionKind.value)
  }
}

function submitManualSection(): void {
  const startMs = parseClockToMs(manualSectionStartStr.value)
  const endMs = parseClockToMs(manualSectionEndStr.value)
  store.addSectionLine({
    kind: manualSectionKind.value,
    startTimeMs: startMs ?? undefined,
    endTimeMs: endMs ?? undefined,
    label: manualSectionLabel.value,
    note: manualSectionNote.value,
    afterLineId: store.activeLineId || undefined
  })
  manualSectionLabel.value = ''
  manualSectionNote.value = ''
  showSectionPanel.value = false
}

function updateThresholdSec(field: 'introThresholdMs' | 'interludeThresholdMs' | 'outroThresholdMs', rawVal: string): void {
  const sec = Number(rawVal)
  if (!Number.isFinite(sec)) return
  store.setSectionThresholds({ [field]: sec * 1000 })
}

const lineElRefs = new Map<string, HTMLElement>()
function setLineRef(id: string, el: unknown): void {
  if (el instanceof HTMLElement) {
    lineElRefs.set(id, el)
  } else {
    lineElRefs.delete(id)
  }
}

async function scrollToLine(lineId: string): Promise<void> {
  await nextTick()
  const el = lineElRefs.get(lineId)
  if (!el) return
  const container = timelineListRef.value
  if (props.compact && container) {
    const targetTop = el.offsetTop - container.offsetTop - container.clientHeight / 2 + el.clientHeight / 2
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

watch(
  () => store.playingLineId,
  async (newId) => {
    if (!newId || !store.followPlayback || store.isPracticeMode) return
    await scrollToLine(newId)
  }
)

watch(
  () => store.activeLineId,
  async (newId) => {
    showInlinePresetCreator.value = false
    alignedPickerLineId.value = null
    if (!newId || store.isPracticeMode) return
    await scrollToLine(newId)
  }
)

function isPresetActiveOnLine(lineId: string | null, presetId: string): boolean {
  if (!lineId) return false
  const line = store.project.lines.find((l) => l.id === lineId)
  return Boolean(line?.calls.some((c) => c.presetId === presetId))
}

function isPresetActiveOnCurrentLine(presetId: string): boolean {
  return isPresetActiveOnLine(store.activeLineId, presetId)
}

function handleToolbarPresetClick(presetId: string): void {
  triggerCallPresetForLine({ presetId })
}

function handleInlinePresetClick(lineId: string, presetId: string): void {
  triggerCallPresetForLine({ lineId, presetId })
}

function startPresetLongPress(e: TouchEvent, preset: CallPreset): void {
  if (preset.builtIn) return
  cancelPresetLongPress()
  const touch = e.touches[0]
  if (!touch) return
  presetLongPressTimer = window.setTimeout(() => {
    openCustomPresetContextMenu({ clientX: touch.clientX, clientY: touch.clientY }, preset)
    presetLongPressTimer = null
  }, 500)
}

function cancelPresetLongPress(): void {
  if (presetLongPressTimer !== null) {
    window.clearTimeout(presetLongPressTimer)
    presetLongPressTimer = null
  }
}

function handleCreatePreset(targetLineId?: string): void {
  const raw = targetLineId ? inlinePresetLabel.value : newPresetLabel.value
  const label = raw.trim()
  if (!label) return
  const created = store.addCustomPreset({
    label,
    color: newPresetColor.value,
    category: newPresetCategory.value,
    shortcut: targetLineId ? '' : newPresetShortcut.value
  })
  if (targetLineId) {
    inlinePresetLabel.value = ''
    showInlinePresetCreator.value = false
    const added = store.toggleLineCall(targetLineId, created.id)
    if (added && store.autoAdvanceOnTag) {
      store.stepActiveLine(1)
    }
  } else {
    newPresetLabel.value = ''
    showNewPresetForm.value = false
  }
}

const ALIGNED_CALL_COLORS = ['', '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#0EA5E9', '#8B5CF6'] as const
const alignedPickerLineId = ref<string | null>(null)
const alignedAnchorStart = ref<number | null>(null)
const alignedSelStart = ref(0)
const alignedSelEnd = ref(0)
const alignedCallText = ref('')
const alignedCallColor = ref('')
const alignedCallTextTouched = ref(false)

function canMergeWithNext(lineId: string): boolean {
  const items = store.timelineItems
  const idx = items.findIndex((it) => it.line.id === lineId)
  if (idx < 0 || idx + 1 >= items.length) return false
  return !isSectionLine(items[idx].line) && !isSectionLine(items[idx + 1].line)
}

function getLineAutoAlignedCues(line: LyricLine): ResolvedAlignedCue[] {
  return resolveLineAlignedCalls(line).aligned.filter((c) => Boolean(c.isAuto))
}

function lyricCharOffsets(original: string): Array<{ char: string; start: number; end: number }> {
  const out: Array<{ char: string; start: number; end: number }> = []
  let pos = 0
  for (const ch of original) {
    out.push({ char: ch, start: pos, end: pos + ch.length })
    pos += ch.length
  }
  return out
}

function openAlignedPicker(line: LyricLine): void {
  if (alignedPickerLineId.value === line.id) {
    alignedPickerLineId.value = null
    return
  }
  const chars = lyricCharOffsets(line.text.original)
  alignedPickerLineId.value = line.id
  alignedAnchorStart.value = chars[0]?.start ?? null
  alignedSelStart.value = chars[0]?.start ?? 0
  alignedSelEnd.value = chars[0]?.end ?? 0
  alignedCallText.value = line.text.original.slice(alignedSelStart.value, alignedSelEnd.value)
  alignedCallColor.value = ''
  alignedCallTextTouched.value = false
}

function handleAlignedCharTap(line: LyricLine, start: number, end: number): void {
  if (alignedAnchorStart.value === null) {
    alignedAnchorStart.value = start
    alignedSelStart.value = start
    alignedSelEnd.value = end
  } else if (alignedAnchorStart.value === start && alignedSelStart.value === start && alignedSelEnd.value === end) {
    alignedSelStart.value = start
    alignedSelEnd.value = end
  } else {
    const minStart = Math.min(alignedAnchorStart.value, start)
    const chars = lyricCharOffsets(line.text.original)
    const anchorEnd = chars.find((c) => c.start === alignedAnchorStart.value)?.end ?? alignedAnchorStart.value + 1
    const maxEnd = Math.max(anchorEnd, end)
    alignedSelStart.value = minStart
    alignedSelEnd.value = maxEnd
    alignedAnchorStart.value = null
  }
  if (!alignedCallTextTouched.value || !alignedCallText.value.trim()) {
    alignedCallText.value = line.text.original.slice(alignedSelStart.value, alignedSelEnd.value)
  }
}

function submitAlignedCall(line: LyricLine): void {
  const start = alignedSelStart.value
  const end = alignedSelEnd.value
  if (end <= start) return
  const text = alignedCallText.value.trim() || line.text.original.slice(start, end).trim()
  if (!text) return
  store.upsertAlignedCall(line.id, {
    start,
    end,
    text,
    color: alignedCallColor.value || undefined
  })
  alignedPickerLineId.value = null
  if (store.autoAdvanceOnTag) {
    store.stepActiveLine(1)
  }
}

function activeEditingTagIndexForLine(lineId: string): number | null {
  if (!editingTagKey.value?.startsWith(`${lineId}:`)) return null
  const idx = Number(editingTagKey.value.slice(lineId.length + 1))
  return Number.isInteger(idx) && idx >= 0 ? idx : null
}

function openTagEditor(lineId: string, tagIndex: number, currentSuffix?: string): void {
  const line = store.project.lines.find((l) => l.id === lineId)
  const tag = line?.calls[tagIndex]
  if (tag?.presetId === SING_ALONG_PRESET_ID) {
    editingTagKey.value = null
    uiStore.openSingAlongPrompt({
      lineId,
      tagIndex,
      initialValue: currentSuffix || '',
      onConfirm: (text: string) => {
        store.updateLineCallSuffix(lineId, tagIndex, text)
      }
    })
    return
  }
  const key = `${lineId}:${tagIndex}`
  if (editingTagKey.value === key) {
    editingTagKey.value = null
    return
  }
  editingTagKey.value = key
  editingTagSuffix.value = currentSuffix || ''
}

function saveTagSuffix(lineId: string, tagIndex: number, suffixValue?: string): void {
  store.updateLineCallSuffix(lineId, tagIndex, suffixValue ?? editingTagSuffix.value)
  editingTagKey.value = null
}

function removeTag(lineId: string, tagIndex: number): void {
  store.removeLineCallAt(lineId, tagIndex)
  editingTagKey.value = null
}

function startEditLine(line: LyricLine): void {
  if (editingLineId.value === line.id) {
    editingLineId.value = null
    return
  }
  editingLineId.value = line.id
  lineDraft.value = {
    original: line.text.original,
    translation: line.text.translation || '',
    customShout: line.customShout || '',
    startTimeStr: formatMsToClock(line.startTimeMs),
    endTimeStr: formatMsToClock(line.endTimeMs),
    kind: getLineKind(line)
  }
}

async function saveEditLine(lineId: string): Promise<void> {
  const startMs = parseClockToMs(lineDraft.value.startTimeStr)
  const endMs = parseClockToMs(lineDraft.value.endTimeStr)
  await store.updateLyricLineText(lineId, {
    original: lineDraft.value.original,
    translation: lineDraft.value.translation || undefined,
    customShout: lineDraft.value.customShout,
    startTimeMs: startMs ?? undefined,
    endTimeMs: endMs ?? undefined,
    kind: lineDraft.value.kind
  })
  editingLineId.value = null
}

function requestDeleteLine(lineId: string, snippet: string): void {
  uiStore.openConfirm({
    title: '删除时间轴歌词行',
    message: `确定要移除「${snippet.slice(0, 28)}」及其挂载的全部 Call 徽章吗？`,
    confirmLabel: '确认删除',
    destructive: true,
    onConfirm: () => store.deleteLyricLine(lineId)
  })
}

const QUICK_TIMING_CUES = ['se-no', 'hi hi', 'hi hi hihihihi', 'はいせーの！'] as const

function getLineAlert(lineId: string) {
  return store.getAlertForLine(lineId)
}

function isLineGtPulsing(lineId: string): boolean {
  return store.activeGtAlertStatus?.targetLineId === lineId
}

function lineCardStyle(line: LyricLine): Record<string, string> {
  const lineId = line.id
  const kind = getLineKind(line)
  const alert = getLineAlert(lineId)
  const isPlaying = store.playingLineId === lineId
  const isActive = store.activeLineId === lineId
  const isPulsing = isLineGtPulsing(lineId)
  const triggered = isPulsing && Boolean(store.activeGtAlertStatus?.isTriggered)
  const accent = sectionAccentColor(kind)
  const isSection = kind !== 'lyric'

  let backgroundColor = isPlaying
    ? 'var(--md-primary-container)'
    : isSection
      ? `color-mix(in srgb, ${accent} 9%, var(--fc-card))`
      : 'var(--fc-card)'
  let color = isPlaying ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)'
  let boxShadow = isActive ? '0 0 0 2px var(--md-primary), var(--fc-shadow-e1)' : 'var(--fc-shadow-e1)'

  if (alert) {
    backgroundColor = triggered
      ? 'var(--md-error-container)'
      : isPlaying || isPulsing
        ? 'var(--md-warning-container)'
        : 'color-mix(in srgb, var(--md-warning-container) 42%, var(--fc-card))'
    color = triggered
      ? 'var(--md-on-error-container)'
      : isPlaying || isPulsing
        ? 'var(--md-on-warning-container)'
        : 'var(--md-on-surface)'
    const accentRing = isPulsing
      ? '0 0 0 2.5px var(--md-warning), 0 0 22px rgba(245, 158, 11, 0.35)'
      : '0 0 0 1.5px rgba(245, 158, 11, 0.55), var(--fc-shadow-e1)'
    boxShadow = isActive ? `0 0 0 2px var(--md-primary), ${accentRing}` : accentRing
  }

  return {
    backgroundColor,
    color,
    boxShadow,
    ...(alert
      ? { borderLeft: '5px solid var(--md-warning)' }
      : isSection
        ? { borderLeft: `4px solid ${accent}` }
        : {})
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Timeline Toolbar & Call Tag Matrix (FlClash Card) -->
    <section class="fc-card p-5 space-y-3.5">
      <div class="flex flex-wrap items-center justify-between gap-2.5">
        <div class="flex items-center gap-2.5">
          <h3 class="text-sm font-bold">打标时间轴</h3>
          <span
            class="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold whitespace-nowrap shrink-0"
            :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }"
          >
            {{ store.sortedLines.length }} 句 · {{ sectionCount }} 段落 · {{ store.sortedAlerts.length }} GT 警报
          </span>
          <button
            type="button"
            @click="showShortcuts = !showShortcuts"
            class="w-7 h-7 rounded-full flex items-center justify-center prism-press"
            :style="{ color: 'var(--md-on-surface-variant)' }"
            title="键盘快捷键说明"
          >
            <HelpCircle class="w-4 h-4" />
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <label class="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer pr-1">
            <span :style="{ color: 'var(--md-on-surface-variant)' }">跟随滚动</span>
            <PrismSwitch v-model="store.followPlayback" label="跟随播放进度滚动" />
          </label>

          <label class="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer pr-1">
            <span :style="{ color: 'var(--md-on-surface-variant)' }">打完跳下句</span>
            <PrismSwitch
              v-model="store.autoAdvanceOnTag"
              data-testid="auto-advance-switch"
              label="打标后自动跳转下一句"
            />
          </label>

          <button
            type="button"
            @click="store.insertGtAlert()"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold prism-press"
            :style="{
              backgroundColor: 'var(--md-warning-container)',
              color: 'var(--md-on-warning-container)'
            }"
          >
            <AlertTriangle class="w-3.5 h-3.5" />
            <span>GT 警报</span>
          </button>

          <button
            type="button"
            data-testid="toggle-section-panel"
            @click="toggleSectionPanel"
            class="inline-flex items-center gap-1 px-3.5 py-2 rounded-full text-xs font-semibold prism-press border"
            :style="
              showSectionPanel
                ? {
                    backgroundColor: 'var(--md-secondary-container)',
                    color: 'var(--md-on-secondary-container)',
                    borderColor: 'var(--md-primary)'
                  }
                : {
                    backgroundColor: 'var(--fc-block)',
                    color: 'var(--md-on-surface)',
                    borderColor: 'var(--md-outline-variant)'
                  }
            "
          >
            <ListPlus class="w-3.5 h-3.5" />
            <span>前/间/尾奏</span>
          </button>

          <button
            type="button"
            @click="store.addLyricLine(store.activeLineId || undefined)"
            class="inline-flex items-center gap-1 px-3.5 py-2 rounded-full text-xs font-semibold prism-press"
            :style="{
              backgroundColor: 'var(--md-primary-container)',
              color: 'var(--md-on-primary-container)'
            }"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>加行</span>
          </button>
        </div>
      </div>

      <!-- Intro / Interlude / Outro Composer & Auto-Detection Controls -->
      <div
        v-if="showSectionPanel"
        data-testid="section-composer-panel"
        class="p-3.5 rounded-2xl border space-y-3"
        :style="{
          backgroundColor: 'var(--fc-block)',
          borderColor: 'var(--md-outline-variant)'
        }"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-bold">手动插入前奏 / 间奏 / 尾奏</span>
          <div class="flex items-center gap-1.5">
            <button
              v-for="opt in SECTION_KIND_OPTIONS"
              :key="opt.kind"
              type="button"
              :data-testid="`manual-kind-${opt.kind}`"
              @click="selectManualSectionKind(opt.kind)"
              class="px-3 py-1 rounded-full text-xs font-bold transition prism-press"
              :style="
                manualSectionKind === opt.kind
                  ? { backgroundColor: opt.color, color: '#FFFFFF' }
                  : { backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface-variant)' }
              "
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <form @submit.prevent="submitManualSection" class="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <div>
            <label class="block text-[11px] font-semibold mb-1 opacity-70">开始时间</label>
            <input
              v-model="manualSectionStartStr"
              data-testid="manual-section-start"
              type="text"
              placeholder="00:00.00"
              class="w-full px-2.5 py-1.5 text-xs font-mono rounded-xl border focus:outline-none"
              :style="{ backgroundColor: 'var(--fc-card)', borderColor: 'var(--md-outline-variant)' }"
            />
          </div>
          <div>
            <label class="block text-[11px] font-semibold mb-1 opacity-70">结束时间</label>
            <input
              v-model="manualSectionEndStr"
              data-testid="manual-section-end"
              type="text"
              placeholder="00:12.00"
              class="w-full px-2.5 py-1.5 text-xs font-mono rounded-xl border focus:outline-none"
              :style="{ backgroundColor: 'var(--fc-card)', borderColor: 'var(--md-outline-variant)' }"
            />
          </div>
          <div class="col-span-2">
            <label class="block text-[11px] font-semibold mb-1 opacity-70">段落标题（选填）</label>
            <input
              v-model="manualSectionLabel"
              data-testid="manual-section-label"
              type="text"
              :placeholder="SECTION_TITLES[manualSectionKind]"
              class="w-full px-2.5 py-1.5 text-xs rounded-xl border focus:outline-none"
              :style="{ backgroundColor: 'var(--fc-card)', borderColor: 'var(--md-outline-variant)' }"
            />
          </div>
          <div>
            <label class="block text-[11px] font-semibold mb-1 opacity-70">说明（选填）</label>
            <input
              v-model="manualSectionNote"
              type="text"
              placeholder="例如：标准虎火 Mix"
              class="w-full px-2.5 py-1.5 text-xs rounded-xl border focus:outline-none"
              :style="{ backgroundColor: 'var(--fc-card)', borderColor: 'var(--md-outline-variant)' }"
            />
          </div>
          <div class="flex items-center gap-1.5 col-span-2 sm:col-span-1">
            <button
              type="button"
              @click="manualSectionStartStr = formatMsToClock(store.currentTimeMs)"
              class="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold prism-press shrink-0"
              :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }"
              title="填入当前播放时间"
            >
              现时
            </button>
            <button
              type="submit"
              data-testid="submit-manual-section"
              class="flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold prism-press"
              :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
            >
              插入
            </button>
          </div>
        </form>

        <div
          class="pt-2.5 border-t flex flex-wrap items-center justify-between gap-2"
          :style="{ borderColor: 'var(--md-outline-variant)' }"
        >
          <div class="flex flex-wrap items-center gap-2 text-[11px]">
            <span class="font-bold opacity-80">自动识别阈值（秒）</span>
            <label class="inline-flex items-center gap-1">
              <span class="opacity-75">前奏≥</span>
              <input
                :value="Math.round(store.sectionThresholds.introThresholdMs / 1000)"
                @change="(e) => updateThresholdSec('introThresholdMs', (e.target as HTMLInputElement).value)"
                data-testid="threshold-intro-sec"
                type="number"
                min="2"
                max="60"
                class="w-12 px-1.5 py-0.5 rounded-lg border text-center font-mono text-xs"
                :style="{ backgroundColor: 'var(--fc-card)', borderColor: 'var(--md-outline-variant)' }"
              />
            </label>
            <label class="inline-flex items-center gap-1">
              <span class="opacity-75">间奏≥</span>
              <input
                :value="Math.round(store.sectionThresholds.interludeThresholdMs / 1000)"
                @change="(e) => updateThresholdSec('interludeThresholdMs', (e.target as HTMLInputElement).value)"
                data-testid="threshold-interlude-sec"
                type="number"
                min="2"
                max="60"
                class="w-12 px-1.5 py-0.5 rounded-lg border text-center font-mono text-xs"
                :style="{ backgroundColor: 'var(--fc-card)', borderColor: 'var(--md-outline-variant)' }"
              />
            </label>
            <label class="inline-flex items-center gap-1">
              <span class="opacity-75">尾奏≥</span>
              <input
                :value="Math.round(store.sectionThresholds.outroThresholdMs / 1000)"
                @change="(e) => updateThresholdSec('outroThresholdMs', (e.target as HTMLInputElement).value)"
                data-testid="threshold-outro-sec"
                type="number"
                min="2"
                max="60"
                class="w-12 px-1.5 py-0.5 rounded-lg border text-center font-mono text-xs"
                :style="{ backgroundColor: 'var(--fc-card)', borderColor: 'var(--md-outline-variant)' }"
              />
            </label>
          </div>

          <button
            type="button"
            data-testid="re-detect-sections-btn"
            @click="store.detectSections()"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold prism-press"
            :style="{
              backgroundColor: 'var(--md-primary-container)',
              color: 'var(--md-on-primary-container)'
            }"
          >
            <Sparkles class="w-3.5 h-3.5" />
            <span>重新识别前间尾奏</span>
          </button>
        </div>
      </div>

      <div
        v-if="showShortcuts"
        class="text-[11px] rounded-2xl px-3.5 py-2.5 flex flex-wrap gap-x-4 gap-y-1 font-mono"
        :style="{ backgroundColor: 'var(--fc-block)', color: 'var(--md-on-surface-variant)' }"
      >
        <span><b>Space</b> 播放/暂停</span>
        <span><b>1~0</b> 切换军 Call</span>
        <span><b>G</b> 切换当前行 GT 警报</span>
        <span><b>↑/↓</b> 切行 · <b>←/→</b> 跳 2s</span>
        <span><b>F</b> 现场演练</span>
      </div>

      <!-- Call Preset Palette (M3 Filter Chips) -->
      <div class="flex flex-wrap items-center gap-2">
        <div
          v-for="preset in store.allPresets"
          :key="preset.id"
          :data-testid="`palette-preset-${preset.id}`"
          @contextmenu="(e) => openCustomPresetContextMenu(e, preset)"
          @touchstart.passive="(e) => startPresetLongPress(e, preset)"
          @touchend="cancelPresetLongPress"
          @touchmove="cancelPresetLongPress"
          @touchcancel="cancelPresetLongPress"
          :title="preset.builtIn ? undefined : '右键修改名称/颜色或删除'"
          class="inline-flex items-center rounded-full border transition prism-press"
          :style="
            isPresetActiveOnCurrentLine(preset.id)
              ? {
                  borderColor: 'var(--md-primary)',
                  backgroundColor: 'var(--md-primary-container)',
                  color: 'var(--md-on-primary-container)'
                }
              : {
                  borderColor: 'var(--md-outline-variant)',
                  backgroundColor: 'var(--fc-block)',
                  color: 'var(--md-on-surface)'
                }
          "
        >
          <button
            type="button"
            @click="handleToolbarPresetClick(preset.id)"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
          >
            <span
              class="w-2.5 h-2.5 rounded-full shrink-0"
              :style="{ backgroundColor: preset.color }"
            />
            <span>{{ preset.label }}</span>
            <span
              v-if="preset.shortcut"
              class="hidden sm:inline text-[10px] font-mono opacity-65"
            >
              {{ preset.shortcut }}
            </span>
          </button>
          <button
            v-if="!preset.builtIn"
            type="button"
            @click.stop="requestDeleteCustomPresetWithConfirm(preset)"
            class="pr-2.5 text-xs opacity-60 hover:opacity-100"
            title="删除自定义标签（右键可改名/改色）"
          >
            ×
          </button>
        </div>

        <button
          type="button"
          @click="showNewPresetForm = !showNewPresetForm"
          class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed text-xs font-semibold prism-press"
          :style="{
            borderColor: 'var(--md-outline)',
            color: 'var(--md-on-surface-variant)'
          }"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>自定义标签</span>
        </button>
      </div>

      <!-- Custom Call Preset Creator -->
      <form
        v-if="showNewPresetForm"
        @submit.prevent="handleCreatePreset()"
        class="p-3.5 rounded-2xl grid grid-cols-2 sm:grid-cols-5 gap-2.5 items-end"
        :style="{ backgroundColor: 'var(--fc-block)' }"
      >
        <div class="col-span-2">
          <label class="block text-[11px] font-semibold mb-1" :style="{ color: 'var(--md-on-surface-variant)' }">标签名</label>
          <input
            v-model="newPresetLabel"
            type="text"
            required
            placeholder="例如：园长 / 克拉普"
            class="w-full px-3 py-1.5 text-xs rounded-xl border focus:outline-none"
            :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)', borderColor: 'var(--md-outline-variant)' }"
          />
        </div>
        <div>
          <label class="block text-[11px] font-semibold mb-1" :style="{ color: 'var(--md-on-surface-variant)' }">分类</label>
          <select
            v-model="newPresetCategory"
            class="w-full px-2.5 py-1.5 text-xs rounded-xl border focus:outline-none"
            :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)', borderColor: 'var(--md-outline-variant)' }"
          >
            <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <div>
            <label class="block text-[11px] font-semibold mb-1" :style="{ color: 'var(--md-on-surface-variant)' }">主色</label>
            <input v-model="newPresetColor" type="color" class="w-8 h-8 rounded-lg cursor-pointer bg-transparent" />
          </div>
          <div class="flex-1">
            <label class="block text-[11px] font-semibold mb-1" :style="{ color: 'var(--md-on-surface-variant)' }">热键</label>
            <input
              v-model="newPresetShortcut"
              type="text"
              maxlength="1"
              class="w-full px-2.5 py-1.5 text-xs font-mono rounded-xl border uppercase focus:outline-none"
              :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)', borderColor: 'var(--md-outline-variant)' }"
            />
          </div>
        </div>
        <div class="col-span-2 sm:col-span-1 flex gap-1.5">
          <button
            type="submit"
            class="flex-1 py-1.5 px-3 rounded-full text-xs font-semibold prism-press"
            :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
          >
            添加
          </button>
          <button
            type="button"
            @click="showNewPresetForm = false"
            class="py-1.5 px-3 rounded-full text-xs font-semibold prism-press"
            :style="{ backgroundColor: 'var(--fc-tone2)', color: 'var(--md-on-surface)' }"
          >
            取消
          </button>
        </div>
      </form>

      <!-- Active GT Alert Lead-Beat Countdown Banner -->
      <div
        v-if="store.activeGtAlertStatus"
        class="rounded-2xl px-4 py-2.5 transition-all"
        :style="
          store.activeGtAlertStatus.isTriggered
            ? { backgroundColor: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }
            : { backgroundColor: 'var(--md-warning-container)', color: 'var(--md-on-warning-container)' }
        "
      >
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-bold mb-1.5">
          <span class="inline-flex items-center gap-1.5">
            <AlertTriangle class="w-4 h-4" />
            <span>
              {{
                store.activeGtAlertStatus.isTriggered
                  ? 'GT 警报触发!'
                  : `倒数 ${store.activeGtAlertStatus.remainingBeats} 拍进场`
              }}
            </span>
            <span
              v-if="store.activeGtAlertStatus.alert.callTimingCue"
              class="px-2 py-0.5 rounded-full bg-black/15 font-extrabold"
            >
              {{ store.activeGtAlertStatus.alert.callTimingCue }}
            </span>
          </span>
          <span v-if="store.activeGtAlertStatus.alert.note">{{ store.activeGtAlertStatus.alert.note }}</span>
        </div>
        <div class="w-full h-1.5 rounded-full overflow-hidden bg-black/15">
          <div
            class="h-full transition-all duration-75"
            :style="{
              width: `${Math.round(store.activeGtAlertStatus.progress * 100)}%`,
              backgroundColor: store.activeGtAlertStatus.isTriggered ? 'var(--md-error)' : 'var(--md-warning)'
            }"
          />
        </div>
      </div>
    </section>

    <!-- Chronological Lyric Timeline (GT alerts bind directly to lyric rows) -->
    <div ref="timelineListRef" :class="compact ? 'space-y-2.5 max-h-[560px] overflow-y-auto pr-1' : 'space-y-2.5'">
      <template
        v-for="item in store.timelineItems"
        :key="'line-' + item.line.id"
      >
        <!-- Lyric Line Card -->
        <div
          :ref="(el) => setLineRef(item.line.id, el)"
          :data-line-id="item.line.id"
          :data-line-kind="getLineKind(item.line)"
          :data-gt-highlighted="getLineAlert(item.line.id) ? 'true' : undefined"
          :data-gt-pulsing="isLineGtPulsing(item.line.id) ? 'true' : undefined"
          @click="store.activeLineId = item.line.id"
          class="group rounded-[22px] px-4 py-3.5 transition-all cursor-pointer relative overflow-hidden"
          :style="lineCardStyle(item.line)"
        >
          <!-- Row Header -->
          <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                @click.stop="store.seek(item.line.startTimeMs)"
                class="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full transition tabular-nums"
                :style="{
                  backgroundColor: 'var(--fc-tone)',
                  color: 'var(--md-primary)'
                }"
                title="跳转到此句"
              >
                {{ formatMsToClock(item.line.startTimeMs) }}
              </button>

              <span
                v-if="isSectionLine(item.line)"
                :data-testid="`section-badge-${item.line.id}`"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold text-white whitespace-nowrap shrink-0"
                :style="{ backgroundColor: sectionAccentColor(getLineKind(item.line)) }"
              >
                <span>{{ sectionKindLabel(getLineKind(item.line)) }}</span>
                <span class="font-mono opacity-85">
                  {{ formatGapSec(Math.max(1000, item.line.endTimeMs - item.line.startTimeMs)) }}
                </span>
              </span>

              <span
                v-if="getLineAlert(item.line.id)"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap shrink-0"
                :class="isLineGtPulsing(item.line.id) ? 'animate-pulse' : ''"
                :style="{
                  backgroundColor: 'var(--md-warning)',
                  color: '#FFFFFF'
                }"
              >
                <AlertTriangle class="w-3 h-3" />
                <span>GT 警报</span>
                <span
                  v-if="getLineAlert(item.line.id)?.callTimingCue"
                  class="px-1.5 rounded-full bg-black/20 font-bold"
                >
                  {{ getLineAlert(item.line.id)?.callTimingCue }}
                </span>
              </span>
            </div>

            <div class="flex flex-wrap items-center justify-end gap-1">
              <button
                type="button"
                :data-testid="`toggle-tail-updraft-${item.line.id}`"
                @click.stop="store.toggleTailUpdraft(item.line.id)"
                :aria-pressed="Boolean(item.line.tailUpdraft)"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold prism-press transition whitespace-nowrap shrink-0"
                :style="
                  item.line.tailUpdraft
                    ? { backgroundColor: '#8B5CF6', color: '#FFFFFF' }
                    : { backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }
                "
                :title="item.line.tailUpdraft ? '取消本行尾句上升气流' : '为本行开启尾句上升气流（独立于行首军Call）'"
              >
                <span>尾句上升气流</span>
              </button>

              <button
                type="button"
                :data-testid="`toggle-line-gt-${item.line.id}`"
                @click.stop="store.toggleLineGtAlert(item.line.id)"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold prism-press transition whitespace-nowrap shrink-0"
                :style="
                  getLineAlert(item.line.id)
                    ? { backgroundColor: 'var(--md-warning)', color: '#FFFFFF' }
                    : { backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }
                "
                :title="getLineAlert(item.line.id) ? '取消本行 GT 警报' : '为本行开启 GT 警报'"
              >
                <AlertTriangle class="w-3 h-3" />
                <span>{{ getLineAlert(item.line.id) ? '取消 GT' : 'GT' }}</span>
              </button>

              <div
                class="flex items-center gap-1 transition-opacity"
                :class="
                  store.activeLineId === item.line.id
                    ? 'opacity-100'
                    : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                "
              >
                <button
                  v-if="canMergeWithNext(item.line.id)"
                  type="button"
                  :data-testid="`merge-next-line-${item.line.id}`"
                  @click.stop="store.mergeWithNextLine(item.line.id)"
                  class="px-2.5 py-1 rounded-full text-[11px] font-semibold prism-press whitespace-nowrap shrink-0"
                  :style="{ backgroundColor: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)' }"
                  title="将本句与下一句歌词合并为一行"
                >
                  合并下句
                </button>
                <button
                  v-if="store.activeLineId === item.line.id && getLineKind(item.line) !== 'outro'"
                  type="button"
                  data-testid="insert-interlude-after-active"
                  @click.stop="store.addSectionLine({ kind: 'interlude', afterLineId: item.line.id })"
                  class="px-2.5 py-1 rounded-full text-[11px] font-semibold prism-press"
                  :style="{ backgroundColor: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)' }"
                  title="在此行后手动插入间奏段落"
                >
                  +间奏
                </button>
                <button
                  type="button"
                  @click.stop="store.stampLineToCurrentTime(item.line.id)"
                  class="px-2.5 py-1 rounded-full text-[11px] font-semibold prism-press"
                  :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
                  title="将当前播放时刻设为本行起始"
                >
                  校时
                </button>
                <button
                  type="button"
                  @click.stop="startEditLine(item.line)"
                  class="p-1.5 rounded-full prism-press"
                  :style="{ color: 'var(--md-on-surface-variant)' }"
                  title="编辑歌词与时间"
                >
                  <Edit3 class="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  @click.stop="requestDeleteLine(item.line.id, item.line.text.original)"
                  class="p-1.5 rounded-full prism-press"
                  :style="{ color: 'var(--md-error)' }"
                  title="删除本行"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- Attached Call Badges + Inline Shout Chip -->
          <div
            v-if="item.line.calls.length > 0 || Boolean(getUnalignedCustomShout(item.line)) || store.activeLineId === item.line.id"
            class="mb-2 space-y-2"
          >
            <div class="flex flex-wrap items-center gap-1.5">
              <template v-for="(tag, idx) in item.line.calls" :key="idx">
                <CallBadge
                  v-if="store.presetMap.get(tag.presetId)"
                  :preset="store.presetMap.get(tag.presetId)!"
                  :suffix="tag.suffix"
                  interactive
                  @click="openTagEditor(item.line.id, idx, tag.suffix)"
                  @contextmenu="(e) => openCustomPresetContextMenu(e, store.presetMap.get(tag.presetId)!)"
                />
              </template>

              <span
                v-if="getUnalignedCustomShout(item.line) && store.activeLineId !== item.line.id"
                class="px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0"
                :style="{
                  backgroundColor: 'var(--md-tertiary-container)',
                  color: 'var(--md-on-tertiary-container)'
                }"
              >
                {{ getUnalignedCustomShout(item.line) }}
              </span>

              <span
                v-if="item.line.calls.length === 0 && store.activeLineId === item.line.id"
                class="text-[11px] opacity-65"
              >
                <span class="hidden sm:inline">按键盘 1~0 或点击上方 / 下方 Call 标签快速打标</span>
                <span class="sm:hidden">轻触下方 Call 胶囊或底部速标栏快速打标</span>
              </span>
            </div>

            <!-- Full-Width Touch-Friendly Multiplier / Suffix Editor -->
            <div
              v-if="activeEditingTagIndexForLine(item.line.id) !== null"
              @click.stop
              data-testid="tag-suffix-editor"
              class="w-full p-2 rounded-2xl shadow-lg flex flex-wrap items-center gap-1.5 text-xs"
              :style="{
                backgroundColor: 'var(--md-inverse-surface)',
                color: 'var(--md-inverse-on-surface)'
              }"
            >
              <input
                v-model="editingTagSuffix"
                type="text"
                placeholder="备注如 ×4"
                class="flex-1 min-w-[84px] max-w-[140px] px-2.5 py-1 rounded-xl bg-black/25 border border-white/20 text-xs focus:outline-none"
                @keyup.enter="saveTagSuffix(item.line.id, activeEditingTagIndexForLine(item.line.id)!)"
              />
              <button
                v-for="quick in ['×2', '×4', '全员', '加速']"
                :key="quick"
                type="button"
                @click="saveTagSuffix(item.line.id, activeEditingTagIndexForLine(item.line.id)!, quick)"
                class="px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 text-[11px] font-semibold prism-press"
              >
                {{ quick }}
              </button>
              <button
                type="button"
                @click="saveTagSuffix(item.line.id, activeEditingTagIndexForLine(item.line.id)!)"
                class="px-2.5 py-1 rounded-xl font-semibold prism-press"
                :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
              >
                确定
              </button>
              <button
                type="button"
                @click="removeTag(item.line.id, activeEditingTagIndexForLine(item.line.id)!)"
                class="px-2.5 py-1 rounded-xl font-semibold prism-press"
                :style="{ backgroundColor: 'var(--md-error)', color: 'var(--md-on-error)' }"
              >
                删除
              </button>
              <button
                type="button"
                @click="editingTagKey = null"
                class="px-2 py-1 rounded-xl bg-white/10 text-[11px] prism-press"
              >
                收起
              </button>
            </div>
          </div>

          <!-- Lyrics Multi-Layer Display (supports word-aligned Call cues above target spans) -->
          <div class="space-y-0.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="min-w-0 flex-1 text-[15px] font-semibold break-words">
                <AlignedLyricText
                  :line="item.line"
                  :show-ruby="store.displayLayers.showRuby"
                  variant="editor"
                />
              </div>

              <span
                v-if="item.line.tailUpdraft"
                :data-testid="`line-tail-updraft-pill-${item.line.id}`"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0"
                :style="{
                  backgroundColor: '#8B5CF6',
                  color: '#FFFFFF'
                }"
              >
                <span aria-hidden="true">↗</span>
                <span>尾句上升气流</span>
              </span>
            </div>

            <div
              v-if="store.displayLayers.showRomaji && item.line.text.romaji"
              class="text-xs font-mono"
              :style="{ color: 'var(--md-primary)' }"
            >
              {{ item.line.text.romaji }}
            </div>

            <div
              v-if="store.displayLayers.showTranslation && item.line.text.translation"
              class="text-xs opacity-75"
            >
              {{ item.line.text.translation }}
            </div>
          </div>

          <!-- Active Line Inline Touch Call Picker -->
          <div
            v-if="store.activeLineId === item.line.id"
            data-testid="inline-call-picker"
            class="mt-2.5 pt-2.5 border-t space-y-2"
            :style="{ borderColor: 'var(--md-outline-variant)' }"
            @click.stop
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-[11px] font-bold tracking-wide" :style="{ color: 'var(--md-primary)' }">
                Call 法速选
              </span>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  :data-testid="`inline-tail-updraft-${item.line.id}`"
                  @click="store.toggleTailUpdraft(item.line.id)"
                  class="shrink-0 whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold transition prism-press"
                  :style="
                    item.line.tailUpdraft
                      ? { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6', color: '#FFFFFF' }
                      : { backgroundColor: 'var(--fc-block)', borderColor: '#8B5CF6', color: 'var(--md-on-surface)' }
                  "
                >
                  <span>尾句上升气流</span>
                </button>
                <span class="text-[11px] opacity-65 hidden sm:inline">轻触胶囊添加 / 取消</span>
              </div>
            </div>

            <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                v-for="preset in store.allPresets"
                :key="preset.id"
                type="button"
                @click="handleInlinePresetClick(item.line.id, preset.id)"
                @contextmenu="(e) => openCustomPresetContextMenu(e, preset)"
                @touchstart.passive="(e) => startPresetLongPress(e, preset)"
                @touchend="cancelPresetLongPress"
                @touchmove="cancelPresetLongPress"
                @touchcancel="cancelPresetLongPress"
                :title="preset.builtIn ? undefined : '右键修改名称/颜色或删除'"
                class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition prism-press"
                :style="
                  isPresetActiveOnLine(item.line.id, preset.id)
                    ? {
                        borderColor: preset.color,
                        backgroundColor: 'var(--md-primary-container)',
                        color: 'var(--md-on-primary-container)'
                      }
                    : {
                        borderColor: 'var(--md-outline-variant)',
                        backgroundColor: 'var(--fc-block)',
                        color: 'var(--md-on-surface)'
                      }
                "
              >
                <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: preset.color }" />
                <span>{{ preset.label }}</span>
              </button>

              <button
                type="button"
                @click="showInlinePresetCreator = !showInlinePresetCreator"
                class="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-dashed text-xs font-semibold prism-press"
                :style="{
                  borderColor: 'var(--md-outline)',
                  color: 'var(--md-on-surface-variant)'
                }"
              >
                <Plus class="w-3.5 h-3.5" />
                <span>自定义</span>
              </button>
            </div>

            <form
              v-if="showInlinePresetCreator"
              @submit.prevent="handleCreatePreset(item.line.id)"
              class="flex items-center gap-1.5"
            >
              <input
                v-model="inlinePresetLabel"
                type="text"
                required
                placeholder="输入新 Call 法名称..."
                class="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-xl border focus:outline-none"
                :style="{
                  backgroundColor: 'var(--fc-block)',
                  color: 'var(--md-on-surface)',
                  borderColor: 'var(--md-outline-variant)'
                }"
              />
              <button
                type="submit"
                class="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold prism-press"
                :style="{
                  backgroundColor: 'var(--md-primary)',
                  color: 'var(--md-on-primary)'
                }"
              >
                添加并打标
              </button>
            </form>
          </div>

          <!-- Custom Shout Input -->
          <div
            v-if="store.activeLineId === item.line.id"
            class="mt-2.5 pt-2.5 border-t flex items-center gap-2"
            :style="{ borderColor: 'var(--md-outline-variant)' }"
            @click.stop
          >
            <span class="text-[11px] font-bold shrink-0" :style="{ color: 'var(--md-tertiary)' }">喊声 / 口上</span>
            <input
              v-model="item.line.customShout"
              @change="store.schedulePersist()"
              type="text"
              placeholder="输入自定义 Mix / 口上..."
              class="flex-1 min-w-0 bg-transparent text-xs font-semibold focus:outline-none placeholder:opacity-50"
            />
          </div>

          <!-- Word-Aligned Call Cue Editor -->
          <div
            v-if="store.activeLineId === item.line.id && !isSectionLine(item.line) && item.line.text.original.length > 0"
            class="mt-2 pt-2 border-t space-y-2"
            :style="{ borderColor: 'var(--md-outline-variant)' }"
            @click.stop
          >
            <div class="flex flex-wrap items-center justify-between gap-1.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[11px] font-bold shrink-0" :style="{ color: 'var(--md-primary)' }">
                  CALL 词对位
                </span>
                <span
                  v-for="cue in item.line.alignedCalls ?? []"
                  :key="cue.id"
                  :data-testid="`aligned-call-chip-${cue.id}`"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                  :style="
                    cue.color
                      ? { backgroundColor: cue.color, color: '#FFFFFF' }
                      : { backgroundColor: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)' }
                  "
                >
                  <span>{{ item.line.text.original.slice(cue.start, cue.end) }} → {{ cue.text }}</span>
                  <button
                    type="button"
                    @click.stop="store.removeAlignedCall(item.line.id, cue.id)"
                    class="ml-0.5 opacity-75 hover:opacity-100"
                    title="移除该词对位 Call"
                  >
                    ×
                  </button>
                </span>
                <span
                  v-for="autoCue in getLineAutoAlignedCues(item.line)"
                  :key="autoCue.id"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                  :style="{
                    borderColor: 'var(--md-outline-variant)',
                    color: 'var(--md-on-surface-variant)'
                  }"
                >
                  {{ autoCue.text }} (自动对位)
                </span>
              </div>

              <button
                type="button"
                :data-testid="`toggle-aligned-picker-${item.line.id}`"
                @click.stop="openAlignedPicker(item.line)"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed text-[11px] font-semibold prism-press shrink-0"
                :style="{
                  borderColor: 'var(--md-primary)',
                  color: 'var(--md-primary)'
                }"
              >
                <Plus class="w-3 h-3" />
                <span>{{ alignedPickerLineId === item.line.id ? '收起对位' : '对位 Call' }}</span>
              </button>
            </div>

            <div
              v-if="alignedPickerLineId === item.line.id"
              :data-testid="`aligned-picker-panel-${item.line.id}`"
              class="p-2.5 rounded-2xl border space-y-2"
              :style="{
                backgroundColor: 'var(--fc-block)',
                borderColor: 'var(--md-outline-variant)'
              }"
            >
              <div class="text-[11px] opacity-75">
                点选起止字符锁定歌词片段，Call 将居中显示在该片段正上方：
              </div>
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="(ch, cIdx) in lyricCharOffsets(item.line.text.original)"
                  :key="cIdx"
                  type="button"
                  @click.stop="handleAlignedCharTap(item.line, ch.start, ch.end)"
                  class="min-w-[24px] h-7 px-1.5 rounded-lg text-xs font-bold transition prism-press"
                  :style="
                    ch.start >= alignedSelStart && ch.end <= alignedSelEnd
                      ? { backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }
                      : { backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }
                  "
                >
                  {{ ch.char === ' ' ? '␣' : ch.char }}
                </button>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <span class="text-[11px] font-semibold opacity-75 shrink-0">
                  已选：「{{ item.line.text.original.slice(alignedSelStart, alignedSelEnd) }}」
                </span>
                <input
                  v-model="alignedCallText"
                  @input="alignedCallTextTouched = true"
                  type="text"
                  placeholder="上方显示的 Call 内容"
                  class="flex-1 min-w-[120px] px-2.5 py-1 text-xs rounded-xl border focus:outline-none"
                  :style="{
                    backgroundColor: 'var(--fc-card)',
                    color: 'var(--md-on-surface)',
                    borderColor: 'var(--md-outline-variant)'
                  }"
                  @keyup.enter="submitAlignedCall(item.line)"
                />
                <div class="flex items-center gap-1">
                  <button
                    v-for="clr in ALIGNED_CALL_COLORS"
                    :key="clr || 'default'"
                    type="button"
                    @click="alignedCallColor = clr"
                    class="w-4 h-4 rounded-full border transition"
                    :style="{
                      backgroundColor: clr || 'var(--md-tertiary-container)',
                      borderColor: alignedCallColor === clr ? 'var(--md-on-surface)' : 'transparent',
                      transform: alignedCallColor === clr ? 'scale(1.18)' : 'scale(1)'
                    }"
                    :title="clr || '默认配色'"
                  />
                </div>
                <button
                  type="button"
                  :data-testid="`submit-aligned-call-${item.line.id}`"
                  @click.stop="submitAlignedCall(item.line)"
                  class="px-3 py-1 rounded-xl text-xs font-semibold prism-press shrink-0"
                  :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
                >
                  添加对位
                </button>
              </div>
            </div>
          </div>

          <!-- Inline GT Highlight & Timing Cue Editor -->
          <div
            v-if="getLineAlert(item.line.id)"
            @click.stop
            class="mt-2.5 p-2.5 rounded-2xl border space-y-2"
            :style="{
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              borderColor: 'rgba(245, 158, 11, 0.4)'
            }"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[11px] font-extrabold" :style="{ color: 'var(--md-warning)' }">
                  喊声时机
                </span>
                <button
                  v-for="cue in QUICK_TIMING_CUES"
                  :key="cue"
                  type="button"
                  @click="store.updateLineGtAlert(item.line.id, { callTimingCue: cue })"
                  class="px-2 py-0.5 rounded-full text-[11px] font-bold prism-press transition"
                  :style="
                    getLineAlert(item.line.id)?.callTimingCue === cue
                      ? { backgroundColor: 'var(--md-warning)', color: '#FFFFFF' }
                      : { backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }
                  "
                >
                  {{ cue }}
                </button>
              </div>

              <div class="flex items-center gap-1.5">
                <select
                  :value="getLineAlert(item.line.id)!.leadBeats"
                  @change="(e) => store.updateLineGtAlert(item.line.id, { leadBeats: Number((e.target as HTMLSelectElement).value) })"
                  aria-label="GT 前置预警拍数"
                  class="px-2 py-1 rounded-full text-[11px] font-mono font-semibold border focus:outline-none"
                  :style="{
                    backgroundColor: 'var(--fc-card)',
                    color: 'var(--md-on-surface)',
                    borderColor: 'var(--md-outline-variant)'
                  }"
                >
                  <option :value="1">前 1 拍</option>
                  <option :value="2">前 2 拍</option>
                  <option :value="4">前 4 拍</option>
                  <option :value="8">前 8 拍</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                :value="getLineAlert(item.line.id)!.callTimingCue || ''"
                @input="(e) => store.updateLineGtAlert(item.line.id, { callTimingCue: (e.target as HTMLInputElement).value })"
                :data-testid="`gt-cue-input-${item.line.id}`"
                type="text"
                placeholder="编者手动输入喊声时机，如 se-no / hi hi / hihihihi"
                class="w-full px-3 py-1.5 rounded-xl border text-xs font-bold focus:outline-none"
                :style="{
                  backgroundColor: 'var(--fc-card)',
                  color: 'var(--md-on-surface)',
                  borderColor: 'rgba(245, 158, 11, 0.45)'
                }"
              />
              <input
                :value="getLineAlert(item.line.id)!.note || ''"
                @input="(e) => store.updateLineGtAlert(item.line.id, { note: (e.target as HTMLInputElement).value })"
                :data-testid="`gt-note-input-${item.line.id}`"
                type="text"
                placeholder="可选备注（如：吉他进场，4拍后进PPPH）"
                class="w-full px-3 py-1.5 rounded-xl border text-xs font-medium focus:outline-none"
                :style="{
                  backgroundColor: 'var(--fc-card)',
                  color: 'var(--md-on-surface)',
                  borderColor: 'var(--md-outline-variant)'
                }"
              />
            </div>
          </div>

          <!-- Expanded Inline Text / Timing Editor -->
          <div
            v-if="editingLineId === item.line.id"
            @click.stop
            class="mt-3 pt-3 border-t space-y-2.5"
            :style="{ borderColor: 'var(--md-outline-variant)' }"
          >
            <div>
              <label class="block text-[11px] font-semibold mb-1 opacity-70">段落类型</label>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="opt in LINE_KIND_OPTIONS"
                  :key="opt.kind"
                  type="button"
                  @click="lineDraft.kind = opt.kind"
                  class="px-2.5 py-1 rounded-full text-[11px] font-semibold prism-press"
                  :style="
                    lineDraft.kind === opt.kind
                      ? { backgroundColor: sectionAccentColor(opt.kind), color: '#FFFFFF' }
                      : { backgroundColor: 'var(--fc-block)', color: 'var(--md-on-surface-variant)' }
                  "
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-[11px] font-semibold mb-1 opacity-70">开始时间</label>
                <input
                  v-model="lineDraft.startTimeStr"
                  type="text"
                  class="w-full px-3 py-1.5 text-xs font-mono rounded-xl border"
                  :style="{ backgroundColor: 'var(--fc-block)', borderColor: 'var(--md-outline-variant)' }"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold mb-1 opacity-70">结束时间</label>
                <input
                  v-model="lineDraft.endTimeStr"
                  type="text"
                  class="w-full px-3 py-1.5 text-xs font-mono rounded-xl border"
                  :style="{ backgroundColor: 'var(--fc-block)', borderColor: 'var(--md-outline-variant)' }"
                />
              </div>
            </div>
            <div>
              <label class="block text-[11px] font-semibold mb-1 opacity-70">歌词原文</label>
              <input
                v-model="lineDraft.original"
                type="text"
                class="w-full px-3 py-1.5 text-xs rounded-xl border"
                :style="{ backgroundColor: 'var(--fc-block)', borderColor: 'var(--md-outline-variant)' }"
              />
            </div>
            <div>
              <label class="block text-[11px] font-semibold mb-1 opacity-70">中文翻译</label>
              <input
                v-model="lineDraft.translation"
                type="text"
                class="w-full px-3 py-1.5 text-xs rounded-xl border"
                :style="{ backgroundColor: 'var(--fc-block)', borderColor: 'var(--md-outline-variant)' }"
              />
            </div>
            <div class="flex justify-end gap-2 pt-1">
              <button
                type="button"
                @click="editingLineId = null"
                class="px-4 py-1.5 rounded-full text-xs font-semibold prism-press"
                :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
              >
                取消
              </button>
              <button
                type="button"
                @click="saveEditLine(item.line.id)"
                class="px-4 py-1.5 rounded-full text-xs font-semibold prism-press"
                :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      </template>

      <div
        v-if="store.timelineItems.length === 0"
        class="fc-card p-10 text-center text-xs"
        :style="{ color: 'var(--md-on-surface-variant)' }"
      >
        时间轴为空，点击「导入音源 / LRC」或右上角「加行」开始制作 Call 本。
      </div>
    </div>
  </div>
</template>
