<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useCallbookStore } from '../stores/callbookStore'
import type { LyricLine } from '../types/callbook'
import { getUnalignedCustomShout } from '../utils/alignedCalls'
import { getLineKind, isSectionLine, SECTION_TITLES, type SectionKind } from '../utils/sectionDetector'
import AlignedLyricText from './AlignedLyricText.vue'
import CallBadge from './CallBadge.vue'

const MIN_CALL_COL_WIDTH = 124

const props = defineProps<{
  compact?: boolean
  exportLayout?: boolean
}>()

const store = useCallbookStore()
const cardRootRef = ref<HTMLElement | null>(null)
const callColWidthPx = ref<number>(MIN_CALL_COL_WIDTH)

const usedPresets = computed(() => {
  const usedIds = new Set<string>()
  for (const line of store.project.lines) {
    for (const tag of line.calls) {
      usedIds.add(tag.presetId)
    }
  }
  const filtered = store.allPresets.filter((p) => usedIds.has(p.id))
  return filtered.length > 0 ? filtered : store.allPresets
})

const gtAlertCount = computed(
  () => store.sortedLines.filter((line) => Boolean(store.getAlertForLine(line.id))).length
)

const tailUpdraftCount = computed(
  () => store.sortedLines.filter((line) => Boolean(line.tailUpdraft)).length
)

function sectionDisplayTitle(line: LyricLine): string {
  const kind = getLineKind(line)
  if (kind === 'lyric') return line.text.original
  return SECTION_TITLES[kind as SectionKind]
}

async function measureCallColumnWidth(): Promise<number> {
  await nextTick()
  if (typeof document !== 'undefined' && 'fonts' in document) {
    await document.fonts.ready
  }
  const root = cardRootRef.value
  if (!root) return MIN_CALL_COL_WIDTH

  const strips = root.querySelectorAll<HTMLElement>('[data-call-strip]')
  let maxWidth = MIN_CALL_COL_WIDTH
  strips.forEach((strip) => {
    const prevWrap = strip.style.flexWrap
    const prevWidth = strip.style.width
    strip.style.flexWrap = 'nowrap'
    strip.style.width = 'max-content'
    const rectWidth = Math.ceil(strip.getBoundingClientRect().width)
    strip.style.flexWrap = prevWrap
    strip.style.width = prevWidth
    if (rectWidth > maxWidth) {
      maxWidth = rectWidth
    }
  })

  callColWidthPx.value = props.exportLayout ? maxWidth : Math.min(260, maxWidth)
  return callColWidthPx.value
}

onMounted(() => {
  void measureCallColumnWidth()
})

watch(
  [() => store.sortedLines, () => store.allPresets, () => props.exportLayout],
  () => {
    void measureCallColumnWidth()
  },
  { deep: true, flush: 'post' }
)

defineExpose({
  measureCallColumnWidth
})
</script>

<template>
  <!-- Intentional light paper canvas so PNG capture and A4 PDF print stay legible regardless of Dark/OLED UI -->
  <div
    ref="cardRootRef"
    data-testid="quickref-card"
    class="bg-white text-slate-900 rounded-[22px] overflow-hidden"
    :class="exportLayout ? 'p-6 min-w-[760px]' : compact ? 'p-5' : 'p-6'"
    :style="{ '--call-col-width': `${callColWidthPx}px` }"
  >
    <div class="border-b border-slate-200 pb-3.5 mb-3.5">
      <div
        class="grid gap-3 items-start"
        :class="
          exportLayout
            ? 'grid-cols-[minmax(220px,1.25fr)_minmax(180px,1fr)_auto]'
            : 'grid-cols-1 sm:grid-cols-[minmax(0,1.25fr)_minmax(160px,1fr)_auto]'
        "
      >
        <!-- Left: Title + Artist + Editor Name (directly beneath artist) -->
        <div class="min-w-0">
          <h2 class="text-base font-bold text-slate-900 leading-snug break-words">
            {{ store.project.meta.title || '未命名 Call 本' }}
          </h2>
          <p class="text-xs text-slate-500 mt-0.5 break-words">
            {{ store.project.meta.artist || 'Unknown Artist' }}
          </p>
          <p
            data-testid="quickref-editor-name"
            class="text-xs font-semibold text-slate-700 mt-1"
          >
            编者：{{ store.project.meta.editorName?.trim() || '未署名' }}
          </p>
        </div>

        <!-- Middle-right gap: Editor Note -->
        <div
          data-testid="quickref-editor-note"
          class="min-w-0 rounded-xl px-3 py-2 text-xs leading-relaxed border"
          :class="
            store.project.meta.editorNote?.trim()
              ? 'bg-slate-50 border-slate-200 text-slate-700'
              : 'bg-slate-50/60 border-dashed border-slate-200 text-slate-400'
          "
        >
          <span class="block text-[10px] font-bold tracking-wide text-slate-400 mb-0.5">
            编者语
          </span>
          <p class="break-words whitespace-pre-wrap">
            {{ store.project.meta.editorNote?.trim() || '暂无编者语' }}
          </p>
        </div>

        <!-- Top-right corner: Song Credits -->
        <div
          data-testid="quickref-credits"
          class="flex gap-1.5 text-[11px] shrink-0"
          :class="exportLayout ? 'flex-col items-end' : 'flex-wrap sm:flex-col sm:items-end'"
        >
          <div
            class="flex gap-1.5"
            :class="exportLayout ? 'justify-end' : 'flex-wrap sm:justify-end'"
          >
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap w-max shrink-0">
              <span class="text-slate-400 font-semibold">作曲</span>
              <span class="font-bold text-slate-900">{{ store.project.meta.composer?.trim() || '—' }}</span>
            </span>
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap w-max shrink-0">
              <span class="text-slate-400 font-semibold">作词</span>
              <span class="font-bold text-slate-900">{{ store.project.meta.lyricist?.trim() || '—' }}</span>
            </span>
          </div>
          <div
            class="flex gap-1.5"
            :class="exportLayout ? 'justify-end' : 'flex-wrap sm:justify-end'"
          >
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-900 text-white whitespace-nowrap w-max shrink-0">
              <span class="text-slate-300 font-semibold">演唱</span>
              <span class="font-bold">{{ store.project.meta.vocalist?.trim() || store.project.meta.artist || '—' }}</span>
            </span>
            <span
              v-if="store.project.meta.showTuner"
              data-testid="quickref-tuner-badge"
              class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 whitespace-nowrap w-max shrink-0"
            >
              <span class="text-indigo-500 font-semibold">调教</span>
              <span class="font-bold">{{ store.project.meta.tuner?.trim() || '—' }}</span>
            </span>
          </div>
        </div>
      </div>

      <div class="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
        <span
          v-for="preset in usedPresets"
          :key="preset.id"
          :style="{ backgroundColor: preset.color }"
          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap w-max shrink-0"
        >
          {{ preset.label }}
        </span>
      </div>
    </div>

    <div class="space-y-0.5">
      <template v-for="line in store.sortedLines" :key="line.id">
        <div
          :data-testid="`quickref-line-${line.id}`"
          :data-gt-highlighted="store.getAlertForLine(line.id) ? 'true' : 'false'"
          :data-line-kind="getLineKind(line)"
          class="print-avoid-break px-3 py-2.5 flex items-start gap-3 border-l-4 transition-colors"
          :class="
            store.getAlertForLine(line.id)
              ? 'my-1.5 rounded-xl bg-amber-50/90 border-y border-r border-amber-300 border-l-amber-500'
              : isSectionLine(line)
                ? 'my-1 rounded-xl bg-slate-50 border-y border-r border-slate-200 border-l-indigo-500'
                : 'border-l-transparent border-b border-slate-200 last:border-b-0'
          "
        >
          <!-- Left column: Uniform width aligned across all rows -->
          <div
            data-testid="quickref-line-calls"
            class="pt-0.5 shrink-0 flex items-start"
            :style="{ width: 'var(--call-col-width, 124px)' }"
          >
            <div
              data-call-strip
              class="inline-flex items-start gap-1"
              :class="exportLayout ? 'flex-nowrap w-max' : 'flex-wrap'"
            >
              <template v-if="line.calls.length > 0">
                <template v-for="(tag, idx) in line.calls" :key="idx">
                  <CallBadge
                    v-if="store.presetMap.get(tag.presetId)"
                    :preset="store.presetMap.get(tag.presetId)!"
                    :suffix="tag.suffix"
                    size="sm"
                  />
                </template>
              </template>
              <span v-else class="text-xs font-medium text-slate-400 whitespace-nowrap">—</span>
            </div>
          </div>

          <!-- Right column: GT 警报 + Mix/口上 + Lyric/Section + trailing 尾句上升气流 -->
          <div class="flex-1 min-w-0">
            <div
              v-if="store.getAlertForLine(line.id) || Boolean(getUnalignedCustomShout(line))"
              class="flex items-center gap-1.5 mb-1"
              :class="exportLayout ? 'flex-nowrap' : 'flex-wrap'"
            >
              <template v-if="store.getAlertForLine(line.id)">
                <span
                  data-testid="quickref-gt-badge"
                  class="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-extrabold whitespace-nowrap w-max shrink-0"
                >
                  GT 警报
                </span>
                <span
                  v-if="store.getAlertForLine(line.id)!.callTimingCue?.trim()"
                  class="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[10px] font-bold whitespace-nowrap w-max shrink-0"
                >
                  时机：{{ store.getAlertForLine(line.id)!.callTimingCue!.trim() }}
                </span>
                <span
                  v-if="store.getAlertForLine(line.id)!.note?.trim()"
                  class="text-[11px] font-semibold text-amber-900"
                  :class="exportLayout ? 'whitespace-nowrap' : ''"
                >
                  {{ store.getAlertForLine(line.id)!.note!.trim() }}
                </span>
              </template>

              <span
                v-if="getUnalignedCustomShout(line)"
                data-testid="quickref-mix-pill"
                class="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-extrabold whitespace-nowrap w-max shrink-0"
              >
                {{ getUnalignedCustomShout(line) }}
              </span>
            </div>

            <!-- Primary line (Section title OR word-aligned lyric/ruby) + trailing 尾句上升气流 -->
            <div
              data-testid="quickref-lyric-primary"
              class="flex items-center gap-2"
              :class="exportLayout ? 'flex-nowrap' : 'flex-wrap'"
            >
              <div
                class="text-sm font-semibold text-slate-900"
                :class="exportLayout ? 'whitespace-nowrap' : 'break-words'"
              >
                <AlignedLyricText
                  :line="line"
                  :show-ruby="store.displayLayers.showRuby"
                  :display-text-override="isSectionLine(line) ? sectionDisplayTitle(line) : undefined"
                  :export-layout="exportLayout"
                  variant="quickref"
                />
              </div>

              <span
                v-if="line.tailUpdraft"
                data-testid="quickref-tail-updraft"
                class="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-100 border border-violet-300 text-violet-800 text-[11px] font-bold whitespace-nowrap w-max shrink-0"
              >
                尾句上升气流
              </span>
            </div>

            <div
              v-if="!isSectionLine(line) && store.displayLayers.showRomaji && line.text.romaji"
              class="text-[11px] font-medium text-indigo-700 mt-0.5"
              :class="exportLayout ? 'whitespace-nowrap' : 'break-words'"
            >
              {{ line.text.romaji }}
            </div>

            <div
              v-if="!isSectionLine(line) && store.displayLayers.showTranslation && line.text.translation"
              class="text-xs text-slate-600 mt-0.5"
              :class="exportLayout ? 'whitespace-nowrap' : 'break-words'"
            >
              {{ line.text.translation }}
            </div>
          </div>
        </div>
      </template>

      <div v-if="store.sortedLines.length === 0" class="py-8 text-center text-xs text-slate-400">
        暂无时间轴歌词内容
      </div>
    </div>

    <div
      data-testid="quickref-footer"
      class="mt-4 pt-2.5 border-t border-slate-200 flex items-center justify-between gap-x-4 gap-y-1.5 text-[10px] text-slate-400"
      :class="exportLayout ? 'flex-nowrap whitespace-nowrap' : 'flex-wrap'"
    >
      <span class="whitespace-nowrap shrink-0">Generated by CallbookMaker · Material 3</span>
      <div
        data-testid="quickref-footer-stats"
        class="flex items-center gap-x-2 gap-y-1"
        :class="exportLayout ? 'flex-nowrap whitespace-nowrap shrink-0' : 'flex-wrap'"
      >
        <span class="whitespace-nowrap shrink-0">共 {{ store.sortedLines.length }} 句歌词</span>
        <span aria-hidden="true" :class="exportLayout ? 'inline shrink-0' : 'hidden sm:inline shrink-0'">·</span>
        <span class="whitespace-nowrap shrink-0">{{ gtAlertCount }} 句 GT 警报</span>
        <span aria-hidden="true" :class="exportLayout ? 'inline shrink-0' : 'hidden sm:inline shrink-0'">·</span>
        <span class="inline-flex items-center gap-1 whitespace-nowrap shrink-0">
          <span class="inline-flex items-center px-1.5 py-0.5 rounded-full bg-violet-100 border border-violet-300 text-violet-800 font-bold whitespace-nowrap w-max shrink-0">
            尾句上升气流
          </span>
          <span>{{ tailUpdraftCount }} 处</span>
        </span>
      </div>
    </div>
  </div>
</template>
