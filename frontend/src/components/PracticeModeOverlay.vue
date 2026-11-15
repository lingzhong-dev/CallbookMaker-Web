<script setup lang="ts">
import { nextTick, watch } from 'vue'
import { AlertTriangle, RotateCcw, RotateCw, X } from 'lucide-vue-next'
import { useCallbookStore } from '../stores/callbookStore'
import { formatGapSec, getLineKind, isSectionLine, sectionKindLabel } from '../utils/sectionDetector'
import { formatMsToClock } from '../utils/time'
import CallBadge from './CallBadge.vue'
import ScallopedOrbButton from './prism/ScallopedOrbButton.vue'
import WavyProgressBar from './prism/WavyProgressBar.vue'

const store = useCallbookStore()
const itemElRefs = new Map<string, HTMLElement>()

function setPracticeRef(id: string, el: unknown): void {
  if (el instanceof HTMLElement) {
    itemElRefs.set(id, el)
  } else {
    itemElRefs.delete(id)
  }
}

watch(
  () => store.playingLineId,
  async (newId) => {
    if (!newId || !store.isPracticeMode) return
    await nextTick()
    const el = itemElRefs.get(newId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
)

function closePractice(): void {
  store.isPracticeMode = false
}

function getLineAlert(lineId: string) {
  return store.getAlertForLine(lineId)
}

function isLineGtPulsing(lineId: string): boolean {
  return store.activeGtAlertStatus?.targetLineId === lineId
}

function practiceCardStyle(lineId: string): Record<string, string | number> {
  const isPlaying = store.playingLineId === lineId
  const alert = getLineAlert(lineId)
  const isPulsing = isLineGtPulsing(lineId)

  if (isPulsing) {
    return {
      borderColor: '#f59e0b',
      backgroundColor: '#261805',
      boxShadow: '0 0 38px rgba(245, 158, 11, 0.35)',
      opacity: 1
    }
  }
  if (isPlaying && alert) {
    return {
      borderColor: '#f59e0b',
      backgroundColor: '#1f1608',
      boxShadow: '0 0 36px rgba(245, 158, 11, 0.25)',
      opacity: 1
    }
  }
  if (isPlaying) {
    return {
      borderColor: 'var(--md-primary)',
      backgroundColor: '#12151c',
      boxShadow: '0 0 36px rgba(var(--md-primary-rgb), 0.24)',
      opacity: 1
    }
  }
  if (alert) {
    return {
      borderColor: '#b45309',
      backgroundColor: '#1a1307',
      opacity: 0.88
    }
  }
  return {
    borderColor: '#27272a',
    backgroundColor: '#09090b',
    opacity: 0.56
  }
}
</script>

<template>
  <!-- OLED Pure Black Live Practice Teleprompter Mode (Preserves clean removal of edge beat flash) -->
  <div class="fixed inset-0 z-50 bg-black text-white flex flex-col overflow-hidden no-print">
    <!-- Top High-Contrast Flashing GT Alert Banner -->
    <div
      v-if="store.activeGtAlertStatus"
      class="z-40 px-4 py-3 text-center border-b border-white/20"
      :class="store.activeGtAlertStatus.isTriggered ? 'gt-alert-strobe' : 'bg-amber-500 text-black'"
    >
      <div class="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
        <span class="inline-flex items-center gap-1.5 text-sm sm:text-base font-black uppercase tracking-wider">
          <AlertTriangle class="w-5 h-5" />
          {{
            store.activeGtAlertStatus.isTriggered
              ? 'GT 警报触发！NOW!'
              : `即将进场 · 倒数 ${store.activeGtAlertStatus.remainingBeats} 拍`
          }}
        </span>
        <span
          v-if="store.activeGtAlertStatus.alert.callTimingCue"
          class="px-3.5 py-0.5 rounded-full bg-black/30 text-white text-base sm:text-xl font-black tracking-wide"
        >
          {{ store.activeGtAlertStatus.alert.callTimingCue }}
        </span>
        <span v-if="store.activeGtAlertStatus.alert.note" class="text-base sm:text-xl font-black">
          {{ store.activeGtAlertStatus.alert.note }}
        </span>
      </div>
      <div class="max-w-2xl mx-auto mt-2 h-1.5 bg-black/25 rounded-full overflow-hidden">
        <div
          class="h-full bg-white transition-all duration-75"
          :style="{ width: `${Math.round(store.activeGtAlertStatus.progress * 100)}%` }"
        />
      </div>
    </div>

    <!-- Header Bar -->
    <header class="px-5 py-3.5 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
      <div class="min-w-0">
        <div class="text-xs font-mono font-bold" :style="{ color: 'var(--md-primary)' }">
          LIVE PRACTICE MODE · {{ store.project.meta.bpm }} BPM · 小节 {{ store.currentBar }}.{{ store.currentBeatInBar }}
        </div>
        <h2 class="text-base font-extrabold text-white truncate">
          {{ store.project.meta.title }}
        </h2>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          @click="store.displayLayers.showRuby = !store.displayLayers.showRuby"
          class="px-3 py-1.5 rounded-full text-xs font-bold transition prism-press"
          :style="
            store.displayLayers.showRuby
              ? { backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }
              : { backgroundColor: '#18181b', color: '#a1a1aa' }
          "
        >
          注音
        </button>
        <button
          type="button"
          @click="store.displayLayers.showRomaji = !store.displayLayers.showRomaji"
          class="px-3 py-1.5 rounded-full text-xs font-bold transition prism-press"
          :style="
            store.displayLayers.showRomaji
              ? { backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }
              : { backgroundColor: '#18181b', color: '#a1a1aa' }
          "
        >
          罗马音
        </button>
        <button
          type="button"
          @click="store.displayLayers.showTranslation = !store.displayLayers.showTranslation"
          class="px-3 py-1.5 rounded-full text-xs font-bold transition prism-press"
          :style="
            store.displayLayers.showTranslation
              ? { backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }
              : { backgroundColor: '#18181b', color: '#a1a1aa' }
          "
        >
          翻译
        </button>

        <button
          type="button"
          @click="closePractice"
          class="ml-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold prism-press"
        >
          <X class="w-4 h-4" />
          <span>退出演练</span>
        </button>
      </div>
    </header>

    <!-- Teleprompter Feed -->
    <main class="flex-1 overflow-y-auto px-4 sm:px-10 py-10">
      <div class="max-w-4xl mx-auto space-y-5">
        <template
          v-for="item in store.timelineItems"
          :key="'practice-line-' + item.line.id"
        >
          <div
            :ref="(el) => setPracticeRef(item.line.id, el)"
            :data-line-id="item.line.id"
            :data-gt-highlighted="getLineAlert(item.line.id) ? 'true' : undefined"
            @click="store.seek(item.line.startTimeMs)"
            class="p-5 sm:p-7 rounded-[26px] border transition-all duration-200 cursor-pointer"
            :style="practiceCardStyle(item.line.id)"
          >
            <div class="flex flex-wrap items-center gap-2 mb-3">
              <span class="font-mono text-xs text-zinc-400 mr-1 tabular-nums">
                {{ formatMsToClock(item.line.startTimeMs) }}
              </span>
              <span
                v-if="isSectionLine(item.line)"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/80 text-white text-xs font-extrabold"
              >
                <span>{{ sectionKindLabel(getLineKind(item.line)) }}</span>
                <span class="font-mono opacity-85">
                  {{ formatGapSec(Math.max(1000, item.line.endTimeMs - item.line.startTimeMs)) }}
                </span>
              </span>
              <span
                v-if="getLineAlert(item.line.id)"
                class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500 text-black text-xs sm:text-sm font-black"
                :class="isLineGtPulsing(item.line.id) ? 'animate-pulse' : ''"
              >
                <AlertTriangle class="w-3.5 h-3.5" />
                <span>GT 警报</span>
                <span v-if="getLineAlert(item.line.id)?.callTimingCue">
                  · {{ getLineAlert(item.line.id)?.callTimingCue }}
                </span>
              </span>
              <span
                v-if="getLineAlert(item.line.id)?.note"
                class="text-xs sm:text-sm font-bold text-amber-300"
              >
                {{ getLineAlert(item.line.id)?.note }}
              </span>
              <template v-for="(tag, idx) in item.line.calls" :key="idx">
                <CallBadge
                  v-if="store.presetMap.get(tag.presetId)"
                  :preset="store.presetMap.get(tag.presetId)!"
                  :suffix="tag.suffix"
                  size="lg"
                />
              </template>
              <span
                v-if="item.line.customShout"
                class="px-3.5 py-1 rounded-full bg-rose-600 text-white text-sm sm:text-base font-black tracking-wide"
              >
                {{ item.line.customShout }}
              </span>
            </div>

            <div
              v-if="store.displayLayers.showRuby && item.line.text.ruby"
              class="lyric-ruby font-extrabold tracking-wide text-white"
              :class="store.playingLineId === item.line.id ? 'text-3xl sm:text-5xl' : 'text-xl sm:text-3xl'"
              v-html="item.line.text.ruby"
            />
            <div
              v-else
              class="font-extrabold tracking-wide text-white"
              :class="store.playingLineId === item.line.id ? 'text-3xl sm:text-5xl' : 'text-xl sm:text-3xl'"
            >
              {{ item.line.text.original }}
            </div>

            <div
              v-if="store.displayLayers.showRomaji && item.line.text.romaji"
              class="mt-2 font-mono text-sky-300"
              :class="store.playingLineId === item.line.id ? 'text-base sm:text-lg' : 'text-sm'"
            >
              {{ item.line.text.romaji }}
            </div>

            <div
              v-if="store.displayLayers.showTranslation && item.line.text.translation"
              class="mt-1.5 text-zinc-300 font-medium"
              :class="store.playingLineId === item.line.id ? 'text-lg sm:text-2xl' : 'text-sm sm:text-base'"
            >
              {{ item.line.text.translation }}
            </div>
          </div>
        </template>
      </div>
    </main>

    <!-- Bottom Stage Controls -->
    <footer class="px-5 py-3.5 bg-zinc-950/95 border-t border-zinc-800/80 shrink-0">
      <div class="max-w-4xl mx-auto space-y-2.5">
        <WavyProgressBar
          :value="store.currentTimeMs"
          :max="Math.max(1000, store.durationMs)"
          :active="store.isPlaying"
          @seek="store.seek($event)"
        />

        <div class="flex items-center justify-between gap-3">
          <div class="font-mono text-xs sm:text-sm text-zinc-300 tabular-nums">
            {{ formatMsToClock(store.currentTimeMs) }} / {{ formatMsToClock(store.durationMs) }}
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              @click="store.seek(store.currentTimeMs - 2000)"
              class="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center prism-press"
              title="快退 2 秒"
            >
              <RotateCcw class="w-4 h-4" />
            </button>

            <ScallopedOrbButton :running="store.isPlaying" :size="58" @toggle="store.togglePlay()" />

            <button
              type="button"
              @click="store.seek(store.currentTimeMs + 2000)"
              class="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center prism-press"
              title="快进 2 秒"
            >
              <RotateCw class="w-4 h-4" />
            </button>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              v-for="spd in [0.75, 1.0, 1.25]"
              :key="spd"
              type="button"
              @click="store.setPlaybackRate(spd)"
              class="px-3 py-1.5 rounded-full text-xs font-mono font-bold prism-press"
              :style="
                Math.abs(store.playbackRate - spd) < 0.01
                  ? { backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }
                  : { backgroundColor: '#18181b', color: '#d4d4d8' }
              "
            >
              {{ spd }}x
            </button>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
