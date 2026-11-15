<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  ChevronDown,
  Edit3,
  FileOutput,
  Gauge,
  LocateFixed,
  Music2,
  SlidersHorizontal,
  Tags,
  Volume2,
  Wand2
} from 'lucide-vue-next'
import AudioSourcePanel from '../components/AudioSourcePanel.vue'
import TimelineEditor from '../components/TimelineEditor.vue'
import PrismSegmented from '../components/prism/PrismSegmented.vue'
import PrismSwitch from '../components/prism/PrismSwitch.vue'
import ScallopedOrbButton from '../components/prism/ScallopedOrbButton.vue'
import SparklineCard from '../components/prism/SparklineCard.vue'
import WavyProgressBar from '../components/prism/WavyProgressBar.vue'
import { useCallbookStore } from '../stores/callbookStore'
import { useUiStore } from '../stores/uiStore'
import { formatMsToClock } from '../utils/time'

const store = useCallbookStore()
const uiStore = useUiStore()
const showOffsetTools = ref(false)

const beatDots = computed(() => {
  const count = store.project.meta.timeSignature === '3/4' ? 3 : 4
  return Array.from({ length: count }, (_, i) => i + 1)
})

const sourceModeLabel = computed(() => {
  if (store.project.meta.audioUrl) {
    return store.project.meta.platform === 'local' ? '本地音频' : '在线音源'
  }
  return '合成节拍 Demo'
})

const taggedLinesCount = computed(
  () => store.project.lines.filter((l) => l.calls.length > 0 || l.customShout.trim().length > 0).length
)

const speedSegments = [
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.1, label: '1.1x' },
  { value: 1.25, label: '1.25x' }
]

function handleTapTempo(): void {
  const bpm = store.tapTempo()
  if (bpm !== null) {
    store.setStatus(`Tap 测速：${bpm} BPM`)
  }
}

function handleVolumeInput(e: Event): void {
  const val = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(val)) store.setMetronomeVolume(val)
}

function scrollToTimeline(): void {
  document.getElementById('timeline-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
    <!-- Left Column: Compacted & Merged Controls stacked top-to-bottom above Source Importer -->
    <div class="xl:col-span-4 space-y-3">
      <!-- Card 1 (Merged): Playback Status Hero + Speed, Offset & Display Layers -->
      <section class="fc-card relative overflow-hidden p-4 space-y-3">
        <!-- Scalloped 12-lobe watermark shape behind card right edge -->
        <div
          class="absolute -right-6 -top-8 pointer-events-none select-none transition-colors duration-300"
          :style="{
            color: store.isPlaying ? 'var(--md-primary-container)' : 'var(--fc-tone)',
            opacity: store.isPlaying ? 0.65 : 0.9
          }"
        >
          <ScallopedOrbButton watermark :running="store.isPlaying" :size="150" :lobes="12" />
        </div>

        <!-- Soft pastel wave wash inside card -->
        <svg
          viewBox="0 0 600 180"
          preserveAspectRatio="none"
          class="absolute inset-x-0 bottom-0 h-24 w-full pointer-events-none opacity-35"
          aria-hidden="true"
        >
          <path
            d="M0,120 C140,40 280,150 420,90 C500,55 560,85 600,65 L600,180 L0,180 Z"
            fill="var(--fc-tone)"
          />
        </svg>

        <!-- Header Row -->
        <div class="relative z-10 flex flex-wrap items-center justify-between gap-1.5">
          <div class="flex flex-wrap items-center gap-1.5">
            <Activity class="w-3.5 h-3.5" :style="{ color: 'var(--md-on-surface-variant)' }" />
            <span class="text-[11px] font-bold tracking-wide" :style="{ color: 'var(--md-on-surface-variant)' }">
              控制台状态
            </span>

            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              :style="
                store.isPlaying
                  ? { backgroundColor: 'var(--md-success-container)', color: 'var(--md-on-success-container)' }
                  : { backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }
              "
            >
              <span
                class="w-1.5 h-1.5 rounded-full"
                :style="{ backgroundColor: store.isPlaying ? 'var(--md-success)' : 'var(--md-outline)' }"
              />
              {{ store.isPlaying ? 'Running' : 'Standby' }}
            </span>

            <span
              class="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
            >
              {{ sourceModeLabel }}
            </span>
          </div>

          <!-- Beat Dots Indicator -->
          <div class="flex items-center gap-1.5">
            <div class="flex items-center gap-1">
              <span
                v-for="dot in beatDots"
                :key="dot"
                class="w-2 h-2 rounded-full transition-transform duration-100"
                :style="{
                  backgroundColor:
                    store.isPlaying && store.currentBeatInBar === dot
                      ? dot === 1
                        ? 'var(--md-error)'
                        : 'var(--md-primary)'
                      : 'var(--fc-tone2)',
                  transform:
                    store.isPlaying && store.currentBeatInBar === dot ? 'scale(1.3)' : 'scale(1)'
                }"
              />
            </div>
            <span class="text-[11px] font-mono font-bold tabular-nums" :style="{ color: 'var(--md-on-surface-variant)' }">
              {{ store.currentBar }}.{{ store.currentBeatInBar }}
            </span>
          </div>
        </div>

        <!-- Middle Title + Compact Scalloped Start/Stop Orb -->
        <div class="relative z-10 flex items-center justify-between gap-3">
          <div class="min-w-0 flex-1 space-y-1">
            <input
              v-model="store.project.meta.title"
              @change="store.schedulePersist()"
              type="text"
              class="w-full text-sm sm:text-base font-extrabold tracking-tight bg-transparent border-b border-transparent hover:border-[color:var(--md-outline-variant)] focus:border-[color:var(--md-primary)] focus:outline-none py-0.5 text-ellipsis"
              placeholder="输入当前歌曲名称"
            />
            <div class="flex flex-wrap items-center gap-1.5">
              <input
                v-model="store.project.meta.artist"
                @change="store.schedulePersist()"
                type="text"
                class="flex-1 min-w-[110px] text-[11px] font-medium bg-transparent border-b border-transparent hover:border-[color:var(--md-outline-variant)] focus:border-[color:var(--md-primary)] focus:outline-none text-ellipsis"
                :style="{ color: 'var(--md-on-surface-variant)' }"
                placeholder="歌手 / 企划"
              />
              <button
                type="button"
                @click="uiStore.showSourceModal = true"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold prism-press shrink-0"
                :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-primary)', boxShadow: 'var(--fc-shadow-e1)' }"
              >
                <Music2 class="w-3 h-3" />
                <span>切换曲库 / 导入</span>
              </button>
            </div>
          </div>

          <ScallopedOrbButton
            :running="store.isPlaying"
            :size="58"
            @toggle="store.togglePlay()"
          />
        </div>

        <!-- Wavy Scrubber & Clock -->
        <div class="relative z-10 space-y-1">
          <WavyProgressBar
            :value="store.currentTimeMs"
            :max="Math.max(1000, store.durationMs)"
            :active="store.isPlaying"
            @seek="store.seek($event)"
          />
          <div
            class="flex items-center justify-between text-[11px] font-mono font-semibold tabular-nums"
            :style="{ color: 'var(--md-on-surface-variant)' }"
          >
            <span>{{ formatMsToClock(store.currentTimeMs) }}</span>
            <span>{{ formatMsToClock(store.durationMs) }}</span>
          </div>
        </div>

        <!-- Merged Speed, Offset Calibration & Display Layer Filters -->
        <div
          class="relative z-10 pt-3 border-t space-y-2.5"
          :style="{ borderColor: 'var(--md-outline-variant)' }"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="text-[11px] font-bold tracking-wide" :style="{ color: 'var(--md-on-surface-variant)' }">
              播放倍速与校准偏移
            </div>
            <button
              type="button"
              @click="showOffsetTools = !showOffsetTools"
              class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold prism-press"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
            >
              <SlidersHorizontal class="w-3 h-3" />
              <span>首拍 {{ store.project.meta.offsetMs > 0 ? '+' : '' }}{{ store.project.meta.offsetMs }}ms</span>
              <ChevronDown class="w-3 h-3 transition-transform" :class="showOffsetTools ? 'rotate-180' : ''" />
            </button>
          </div>

          <PrismSegmented
            compact
            :model-value="store.playbackRate"
            @update:model-value="(val) => store.setPlaybackRate(Number(val))"
            :segments="speedSegments"
          />

          <div v-if="showOffsetTools" class="flex items-center gap-1.5">
            <button
              v-for="delta in [-100, -20]"
              :key="delta"
              type="button"
              @click="store.adjustOffset(delta)"
              class="flex-1 py-1 rounded-xl text-[11px] font-mono font-semibold prism-press"
              :style="{ backgroundColor: 'var(--fc-block)', color: 'var(--md-on-surface)' }"
            >
              {{ delta }}
            </button>
            <button
              type="button"
              @click="store.setOffset(0)"
              class="flex-1 py-1 rounded-xl text-[11px] font-semibold prism-press"
              :style="{ backgroundColor: 'var(--fc-block)', color: 'var(--md-on-surface-variant)' }"
            >
              归零
            </button>
            <button
              v-for="delta in [20, 100]"
              :key="delta"
              type="button"
              @click="store.adjustOffset(delta)"
              class="flex-1 py-1 rounded-xl text-[11px] font-mono font-semibold prism-press"
              :style="{ backgroundColor: 'var(--fc-block)', color: 'var(--md-on-surface)' }"
            >
              +{{ delta }}
            </button>
          </div>

          <!-- Layer Filter Chips -->
          <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button
              type="button"
              @click="store.displayLayers.showRuby = !store.displayLayers.showRuby; store.schedulePersist()"
              class="px-2.5 py-1 rounded-full text-[11px] font-semibold prism-press"
              :style="
                store.displayLayers.showRuby
                  ? { backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }
                  : { backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }
              "
            >
              {{ store.displayLayers.showRuby ? '✓ ' : '' }}日语注音 (Furigana)
            </button>

            <button
              type="button"
              @click="store.displayLayers.showRomaji = !store.displayLayers.showRomaji; store.schedulePersist()"
              class="px-2.5 py-1 rounded-full text-[11px] font-semibold prism-press"
              :style="
                store.displayLayers.showRomaji
                  ? { backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }
                  : { backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }
              "
            >
              {{ store.displayLayers.showRomaji ? '✓ ' : '' }}罗马音 (Romaji)
            </button>

            <button
              type="button"
              @click="store.displayLayers.showTranslation = !store.displayLayers.showTranslation; store.schedulePersist()"
              class="px-2.5 py-1 rounded-full text-[11px] font-semibold prism-press"
              :style="
                store.displayLayers.showTranslation
                  ? { backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }
                  : { backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }
              "
            >
              {{ store.displayLayers.showTranslation ? '✓ ' : '' }}中文翻译
            </button>
          </div>
        </div>
      </section>

      <!-- Card 1.5 (Compact): Song Credits & Editor Info -->
      <section class="fc-card p-4 space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <div class="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide" :style="{ color: 'var(--md-on-surface-variant)' }">
            <Edit3 class="w-3.5 h-3.5" :style="{ color: 'var(--md-primary)' }" />
            <span>曲目制作与编者信息</span>
          </div>

          <label
            class="inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer select-none"
            :style="{ color: 'var(--md-on-surface)' }"
          >
            <input
              type="checkbox"
              data-testid="dashboard-show-tuner-checkbox"
              :checked="Boolean(store.project.meta.showTuner)"
              @change="store.updateMeta({ showTuner: ($event.target as HTMLInputElement).checked })"
              class="w-3.5 h-3.5 rounded accent-[var(--md-primary)] cursor-pointer"
            />
            <span>添加调教</span>
          </label>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <label class="block space-y-1">
            <span class="block text-[10px] font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">作曲</span>
            <input
              type="text"
              data-testid="dashboard-composer-input"
              :value="store.project.meta.composer || ''"
              @input="store.updateMeta({ composer: ($event.target as HTMLInputElement).value })"
              placeholder="如：SAWTOWNE"
              class="w-full px-2.5 py-1.5 rounded-xl text-xs border focus:outline-none"
              :style="{
                backgroundColor: 'var(--fc-block)',
                color: 'var(--md-on-surface)',
                borderColor: 'var(--md-outline-variant)'
              }"
            />
          </label>

          <label class="block space-y-1">
            <span class="block text-[10px] font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">作词</span>
            <input
              type="text"
              data-testid="dashboard-lyricist-input"
              :value="store.project.meta.lyricist || ''"
              @input="store.updateMeta({ lyricist: ($event.target as HTMLInputElement).value })"
              placeholder="如：SAWTOWNE"
              class="w-full px-2.5 py-1.5 rounded-xl text-xs border focus:outline-none"
              :style="{
                backgroundColor: 'var(--fc-block)',
                color: 'var(--md-on-surface)',
                borderColor: 'var(--md-outline-variant)'
              }"
            />
          </label>

          <label class="block space-y-1" :class="store.project.meta.showTuner ? '' : 'col-span-2'">
            <span class="block text-[10px] font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">演唱</span>
            <input
              type="text"
              data-testid="dashboard-vocalist-input"
              :value="store.project.meta.vocalist || ''"
              @input="store.updateMeta({ vocalist: ($event.target as HTMLInputElement).value })"
              :placeholder="store.project.meta.artist || '如：初音ミク'"
              class="w-full px-2.5 py-1.5 rounded-xl text-xs border focus:outline-none"
              :style="{
                backgroundColor: 'var(--fc-block)',
                color: 'var(--md-on-surface)',
                borderColor: 'var(--md-outline-variant)'
              }"
            />
          </label>

          <label v-if="store.project.meta.showTuner" class="block space-y-1">
            <span class="block text-[10px] font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">调教</span>
            <input
              type="text"
              data-testid="dashboard-tuner-input"
              :value="store.project.meta.tuner || ''"
              @input="store.updateMeta({ tuner: ($event.target as HTMLInputElement).value })"
              placeholder="调教师 / 调声"
              class="w-full px-2.5 py-1.5 rounded-xl text-xs border focus:outline-none"
              :style="{
                backgroundColor: 'var(--fc-block)',
                color: 'var(--md-on-surface)',
                borderColor: 'var(--md-outline-variant)'
              }"
            />
          </label>
        </div>

        <div
          class="pt-2 border-t grid grid-cols-1 sm:grid-cols-2 gap-2"
          :style="{ borderColor: 'var(--md-outline-variant)' }"
        >
          <label class="block space-y-1">
            <span class="block text-[10px] font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">编者</span>
            <input
              type="text"
              data-testid="dashboard-editor-name-input"
              :value="store.project.meta.editorName || ''"
              @input="store.updateMeta({ editorName: ($event.target as HTMLInputElement).value })"
              placeholder="编者署名（导出前也可填）"
              class="w-full px-2.5 py-1.5 rounded-xl text-xs border focus:outline-none"
              :style="{
                backgroundColor: 'var(--fc-block)',
                color: 'var(--md-on-surface)',
                borderColor: 'var(--md-outline-variant)'
              }"
            />
          </label>

          <label class="block space-y-1">
            <span class="block text-[10px] font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">编者语</span>
            <input
              type="text"
              data-testid="dashboard-editor-note-input"
              :value="store.project.meta.editorNote || ''"
              @input="store.updateMeta({ editorNote: ($event.target as HTMLInputElement).value })"
              placeholder="Call 本说明 / 寄语（可选）"
              class="w-full px-2.5 py-1.5 rounded-xl text-xs border focus:outline-none"
              :style="{
                backgroundColor: 'var(--fc-block)',
                color: 'var(--md-on-surface)',
                borderColor: 'var(--md-outline-variant)'
              }"
            />
          </label>
        </div>
      </section>

      <!-- Card 2 (Merged): Metronome Audio + GT Pre-Alert Beep + Lyric Timeline Follow -->
      <section class="fc-card p-4 space-y-2.5">
        <!-- Row 1: Metronome Switch + Volume -->
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
              >
                <Volume2 class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <div class="text-xs font-bold leading-snug">节拍器音频</div>
                <div class="text-[11px] leading-snug" :style="{ color: 'var(--md-on-surface-variant)' }">
                  {{ store.metronomeEnabled ? `音量 ${Math.round(store.metronomeVolume * 100)}%` : '已静音' }}
                </div>
              </div>
            </div>
            <PrismSwitch
              compact
              :model-value="store.metronomeEnabled"
              @update:model-value="store.metronomeEnabled = $event; store.syncEngineConfig()"
              label="节拍器开关"
            />
          </div>

          <div class="flex items-center gap-2">
            <input
              type="range"
              min="0.2"
              max="1.5"
              step="0.05"
              :disabled="!store.metronomeEnabled"
              :value="store.metronomeVolume"
              @input="handleVolumeInput"
              class="flex-1 m3-slider disabled:opacity-40"
              aria-label="节拍器音量"
            />
            <button
              type="button"
              @click="store.testMetronomeClick()"
              class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold prism-press shrink-0"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
            >
              试听
            </button>
          </div>
        </div>

        <!-- Row 2: GT Pre-Alert Beep -->
        <div
          class="pt-2.5 border-t flex items-center justify-between gap-2"
          :style="{ borderColor: 'var(--md-outline-variant)' }"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              :style="{ backgroundColor: 'var(--md-warning-container)', color: 'var(--md-on-warning-container)' }"
            >
              <Bell class="w-4 h-4" />
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold leading-snug">GT 前置警报音</div>
              <div class="text-[11px] leading-snug" :style="{ color: 'var(--md-on-surface-variant)' }">
                {{ store.gtBeepEnabled ? '进场前自动提示' : '已关闭提示音' }}
              </div>
            </div>
          </div>
          <PrismSwitch compact v-model="store.gtBeepEnabled" label="GT 警报提示音开关" />
        </div>

        <!-- Row 3: Timeline Auto Follow -->
        <div
          class="pt-2.5 border-t flex items-center justify-between gap-2"
          :style="{ borderColor: 'var(--md-outline-variant)' }"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
            >
              <LocateFixed class="w-4 h-4" />
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold leading-snug">歌词时间轴跟随</div>
              <div class="text-[11px] leading-snug" :style="{ color: 'var(--md-on-surface-variant)' }">
                {{ store.followPlayback ? '自动居中高亮句' : '手动自由滚动' }}
              </div>
            </div>
          </div>
          <PrismSwitch compact v-model="store.followPlayback" label="跟随播放进度开关" />
        </div>
      </section>

      <!-- Card 3 (Compact): BPM & Tempo Sparkline -->
      <section class="fc-card p-4 pb-0 overflow-hidden flex flex-col justify-between">
        <div class="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
          <div class="inline-flex items-center gap-1.5 text-[11px] font-bold" :style="{ color: 'var(--md-on-surface-variant)' }">
            <Gauge class="w-3.5 h-3.5" :style="{ color: 'var(--md-primary)' }" />
            <span>节拍速率 (BPM)</span>
          </div>

          <div class="flex items-center gap-1">
            <button
              type="button"
              :disabled="store.isDetectingBpm"
              @click="store.detectCurrentAudioBpm()"
              class="px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 prism-press disabled:opacity-50"
              :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
            >
              <Wand2 class="w-3 h-3" />
              <span>{{ store.isDetectingBpm ? '分析...' : '波形测速' }}</span>
            </button>
            <button
              type="button"
              @click="handleTapTempo"
              class="px-2 py-0.5 rounded-full text-[10px] font-bold prism-press"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
            >
              Tap
            </button>
            <button
              type="button"
              @click="store.setTimeSignature(store.project.meta.timeSignature === '4/4' ? '3/4' : '4/4')"
              class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold prism-press"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
            >
              {{ store.project.meta.timeSignature }}
            </button>
          </div>
        </div>

        <div class="flex items-baseline justify-between gap-2 mb-0.5">
          <div class="flex items-baseline gap-1.5">
            <input
              type="number"
              min="30"
              max="300"
              :value="store.project.meta.bpm"
              @change="(e) => store.setBpm(Number((e.target as HTMLInputElement).value))"
              class="w-16 bg-transparent text-2xl font-extrabold font-mono tabular-nums tracking-tight focus:outline-none"
              aria-label="BPM 数值"
            />
            <span class="text-[11px] font-bold" :style="{ color: 'var(--md-on-surface-variant)' }">BPM</span>
          </div>

          <div class="flex items-center gap-1">
            <button
              type="button"
              @click="store.setBpm(store.project.meta.bpm - 1)"
              class="w-6 h-6 rounded-full font-mono text-xs font-bold prism-press"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
              title="BPM -1"
            >
              −
            </button>
            <button
              type="button"
              @click="store.setBpm(store.project.meta.bpm + 1)"
              class="w-6 h-6 rounded-full font-mono text-xs font-bold prism-press"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
              title="BPM +1"
            >
              +
            </button>
          </div>
        </div>

        <div class="-mx-4 mt-1">
          <SparklineCard :values="uiStore.beatPulseSeries" color="var(--md-primary)" :height="32" />
        </div>
      </section>

      <!-- Card 4 (Compact): Call Coverage Sparkline -->
      <section class="fc-card p-4 pb-0 overflow-hidden flex flex-col justify-between">
        <div class="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
          <div class="inline-flex items-center gap-1.5 text-[11px] font-bold" :style="{ color: 'var(--md-on-surface-variant)' }">
            <Tags class="w-3.5 h-3.5" :style="{ color: 'var(--fc-series2)' }" />
            <span>打标覆盖率</span>
          </div>

          <div class="flex items-center gap-1">
            <button
              type="button"
              @click="store.insertGtAlert()"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold prism-press"
              :style="{ backgroundColor: 'var(--md-warning-container)', color: 'var(--md-on-warning-container)' }"
            >
              <AlertTriangle class="w-3 h-3" />
              <span>+ GT 警报</span>
            </button>
            <button
              type="button"
              @click="scrollToTimeline"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold prism-press"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
            >
              <span>定位时间轴</span>
              <ChevronDown class="w-3 h-3" />
            </button>
          </div>
        </div>

        <div class="flex items-baseline gap-1.5 mb-0.5">
          <span class="text-2xl font-extrabold font-mono tabular-nums tracking-tight">
            {{ taggedLinesCount }}
          </span>
          <span class="text-[11px] font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">
            / {{ store.sortedLines.length }} 句已标 Call · {{ store.sortedAlerts.length }} GT 警报
          </span>
        </div>

        <div class="-mx-4 mt-1">
          <SparklineCard :values="uiStore.callDensitySeries" color="var(--fc-series2)" :height="32" />
        </div>
      </section>

      <!-- Card 5 (Compact): Jump to Export Studio -->
      <button
        type="button"
        @click="uiStore.activeRoute = 'export'"
        class="w-full fc-card-interactive px-4 py-3 flex items-center justify-between gap-2 text-left"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            :style="{ backgroundColor: 'var(--md-success-container)', color: 'var(--md-on-success-container)' }"
          >
            <FileOutput class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <div class="text-xs font-bold leading-snug">速查卡与导出</div>
            <div class="text-[11px] leading-snug" :style="{ color: 'var(--md-on-surface-variant)' }">
              PNG 长图 · Excel · PDF
            </div>
          </div>
        </div>
        <ArrowRight class="w-4 h-4 shrink-0" :style="{ color: 'var(--md-on-surface-variant)' }" />
      </button>

      <!-- Card 6: Source & Lyrics Importer -->
      <AudioSourcePanel hide-transport />
    </div>

    <!-- Right Column: Full Timeline Editor -->
    <div id="timeline-workspace" class="xl:col-span-8 scroll-mt-16">
      <TimelineEditor />
    </div>
  </div>
</template>
