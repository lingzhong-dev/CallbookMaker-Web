<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Bell,
  ChevronDown,
  Disc3,
  FileAudio,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Upload,
  Volume2,
  VolumeX,
  Wand2
} from 'lucide-vue-next'
import {
  fetchProviders,
  fetchTrackDetailApi,
  searchTracksApi,
  type ProviderOption
} from '../api/client'
import { useCallbookStore } from '../stores/callbookStore'
import type { TrackSummary } from '../types/callbook'
import { runWithArchiveSavePrompt } from '../utils/archiveGuard'
import { formatMsToClock } from '../utils/time'
import PrismSegmented from './prism/PrismSegmented.vue'
import PrismSwitch from './prism/PrismSwitch.vue'
import WavyProgressBar from './prism/WavyProgressBar.vue'

withDefaults(
  defineProps<{
    modalMode?: boolean
    hideTransport?: boolean
  }>(),
  {
    modalMode: false,
    hideTransport: false
  }
)

const emit = defineEmits<{
  imported: []
}>()

const store = useCallbookStore()

const sourceTab = ref<'search' | 'local' | 'demo'>('search')
const searchSource = ref<ProviderOption['id']>('auto')
const searchQuery = ref('Starlight')
const searching = ref(false)
const searchResults = ref<TrackSummary[]>([])
const lastProviderUsed = ref('')
const fallbackHint = ref(false)
const loadingTrackId = ref('')
const providers = ref<ProviderOption[]>([])

const showOffsetTools = ref(false)
const showTranslationBox = ref(false)

const rawLrcInput = ref(`[00:01.37]夜空を見上げて 響けメロディ
[00:01.37]仰望夜空 让旋律回响吧
[00:04.11]高鳴る鼓動が 今 始まる
[00:04.11]沸腾的心跳 此刻正式开启`)
const translationLrcInput = ref('')
const forceJapaneseRuby = ref(false)
const parsingLrc = ref(false)

void fetchProviders().then((list) => {
  providers.value = list
})

const speeds = [0.5, 0.75, 1.0, 1.1, 1.25]

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

async function handleSearch(): Promise<void> {
  if (!searchQuery.value.trim()) return
  searching.value = true
  try {
    const res = await searchTracksApi(searchQuery.value.trim(), searchSource.value)
    searchResults.value = res.results
    lastProviderUsed.value = res.providerUsed
    fallbackHint.value = res.fallbackTriggered
  } catch (err) {
    store.setStatus(err instanceof Error ? err.message : '搜索失败，请确认后端服务状态')
  } finally {
    searching.value = false
  }
}

function handleImportTrack(track: TrackSummary): void {
  runWithArchiveSavePrompt({
    actionLabel: '拉取新曲目歌词',
    targetLabel: track.title,
    onProceed: async () => {
      loadingTrackId.value = track.id
      try {
        const detail = await fetchTrackDetailApi(track.provider, track.id)
        store.loadFromTrackDetail(detail)
        emit('imported')
      } catch (err) {
        store.setStatus(err instanceof Error ? err.message : '曲目拉取失败')
      } finally {
        loadingTrackId.value = ''
      }
    }
  })
}

function handleAudioFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    store.loadLocalAudioFile(file)
    emit('imported')
  }
  input.value = ''
}

function handleParseLrc(): void {
  if (!rawLrcInput.value.trim()) return
  runWithArchiveSavePrompt({
    actionLabel: '导入新 LRC 歌词',
    onProceed: async () => {
      parsingLrc.value = true
      try {
        await store.importLrcText(rawLrcInput.value, translationLrcInput.value, forceJapaneseRuby.value)
        emit('imported')
      } finally {
        parsingLrc.value = false
      }
    }
  })
}

function handleLoadDemo(): void {
  runWithArchiveSavePrompt({
    actionLabel: '加载演练 Demo',
    targetLabel: '175 BPM 合成 Demo',
    onProceed: () => {
      store.loadDemoProject()
      emit('imported')
    }
  })
}

function handleTapTempo(): void {
  const bpm = store.tapTempo()
  if (bpm !== null) {
    store.setStatus(`Tap 测速：${bpm} BPM`)
  }
}

function handleMetronomeVolumeInput(e: Event): void {
  const val = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(val)) store.setMetronomeVolume(val)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Tempo & Transport Console Card (Hidden when inside Modal Importer or Unified Dashboard) -->
    <section v-if="!modalMode && !hideTransport" class="fc-card p-5 space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
          >
            {{ sourceModeLabel }}
          </span>
          <input
            v-model="store.project.meta.title"
            @change="store.schedulePersist()"
            type="text"
            class="mt-1.5 w-full text-base font-bold bg-transparent border-b border-transparent hover:border-[color:var(--md-outline-variant)] focus:border-[color:var(--md-primary)] focus:outline-none py-0.5"
            placeholder="歌曲标题"
          />
          <input
            v-model="store.project.meta.artist"
            @change="store.schedulePersist()"
            type="text"
            class="w-full text-xs bg-transparent border-b border-transparent hover:border-[color:var(--md-outline-variant)] focus:border-[color:var(--md-primary)] focus:outline-none"
            :style="{ color: 'var(--md-on-surface-variant)' }"
            placeholder="歌手 / 组合"
          />
        </div>

        <div class="shrink-0 flex flex-col items-end gap-1.5 pt-1">
          <div class="flex items-center gap-1.5">
            <span
              v-for="dot in beatDots"
              :key="dot"
              class="w-2.5 h-2.5 rounded-full transition-transform duration-100"
              :style="{
                backgroundColor:
                  store.isPlaying && store.currentBeatInBar === dot
                    ? dot === 1
                      ? 'var(--md-error)'
                      : 'var(--md-primary)'
                    : 'var(--fc-tone2)',
                transform:
                  store.isPlaying && store.currentBeatInBar === dot ? 'scale(1.25)' : 'scale(1)'
              }"
            />
          </div>
          <span class="text-[11px] font-mono tabular-nums" :style="{ color: 'var(--md-on-surface-variant)' }">
            小节 {{ store.currentBar }}.{{ store.currentBeatInBar }}
          </span>
        </div>
      </div>

      <!-- M3 Expressive Wavy Scrubber -->
      <div class="space-y-1">
        <WavyProgressBar
          :value="store.currentTimeMs"
          :max="Math.max(1000, store.durationMs)"
          :active="store.isPlaying"
          @seek="store.seek($event)"
        />
        <div
          class="flex justify-between text-[11px] font-mono tabular-nums"
          :style="{ color: 'var(--md-on-surface-variant)' }"
        >
          <span>{{ formatMsToClock(store.currentTimeMs) }}</span>
          <span>{{ formatMsToClock(store.durationMs) }}</span>
        </div>
      </div>

      <!-- Play / Pause + Connected Speed Pills -->
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          @click="store.togglePlay()"
          class="flex-1 min-w-[96px] h-10 inline-flex items-center justify-center gap-1.5 px-4 rounded-full font-semibold text-xs prism-press shadow-sm"
          :style="{
            backgroundColor: store.isPlaying ? 'var(--md-error)' : 'var(--md-primary)',
            color: store.isPlaying ? 'var(--md-on-error)' : 'var(--md-on-primary)'
          }"
        >
          <Pause v-if="store.isPlaying" class="w-4 h-4 shrink-0" />
          <Play v-else class="w-4 h-4 shrink-0" />
          <span>{{ store.isPlaying ? '暂停播放' : '开始播放' }}</span>
        </button>

        <div class="inline-flex items-center rounded-full p-1" :style="{ backgroundColor: 'var(--fc-tone)' }">
          <button
            v-for="spd in speeds"
            :key="spd"
            type="button"
            @click="store.setPlaybackRate(spd)"
            class="px-2 py-1 rounded-full text-[11px] font-mono font-semibold transition-all"
            :style="
              Math.abs(store.playbackRate - spd) < 0.01
                ? { backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }
                : { color: 'var(--md-on-surface-variant)' }
            "
          >
            {{ spd }}x
          </button>
        </div>
      </div>

      <!-- BPM + Auto Detect + Tap + Time Sig -->
      <div class="pt-3 border-t space-y-2.5" :style="{ borderColor: 'var(--md-outline-variant)' }">
        <div class="flex items-center gap-1.5">
          <div
            class="flex items-center gap-1.5 flex-1 min-w-0 rounded-2xl px-3 py-2"
            :style="{ backgroundColor: 'var(--fc-block)' }"
          >
            <span class="text-[11px] font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">BPM</span>
            <input
              type="number"
              min="30"
              max="300"
              :value="store.project.meta.bpm"
              @change="(e) => store.setBpm(Number((e.target as HTMLInputElement).value))"
              class="w-full min-w-0 bg-transparent text-sm font-mono font-bold tabular-nums focus:outline-none"
            />
          </div>

          <button
            type="button"
            :disabled="store.isDetectingBpm"
            @click="store.detectCurrentAudioBpm()"
            class="px-3 py-2 rounded-2xl text-xs font-semibold inline-flex items-center gap-1 prism-press disabled:opacity-50"
            :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
            title="从当前音频波形自动分析 BPM"
          >
            <Wand2 class="w-3.5 h-3.5" />
            <span>{{ store.isDetectingBpm ? '分析中' : '测速' }}</span>
          </button>

          <button
            type="button"
            @click="handleTapTempo"
            class="px-3 py-2 rounded-2xl text-xs font-semibold prism-press"
            :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
            title="随音乐节拍连续点击"
          >
            Tap
          </button>

          <button
            type="button"
            @click="store.setTimeSignature(store.project.meta.timeSignature === '4/4' ? '3/4' : '4/4')"
            class="px-2.5 py-2 rounded-2xl text-xs font-mono font-bold prism-press"
            :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
          >
            {{ store.project.meta.timeSignature }}
          </button>
        </div>

        <div v-if="store.bpmNote" class="text-[11px] px-1" :style="{ color: 'var(--md-on-surface-variant)' }">
          {{ store.bpmNote }}
        </div>

        <!-- Audio Controls Strip -->
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="store.metronomeEnabled = !store.metronomeEnabled; store.syncEngineConfig()"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold transition"
              :style="
                store.metronomeEnabled
                  ? { backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }
                  : { backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }
              "
            >
              <Volume2 v-if="store.metronomeEnabled" class="w-3.5 h-3.5" />
              <VolumeX v-else class="w-3.5 h-3.5" />
              <span>节拍器</span>
            </button>

            <button
              type="button"
              @click="store.testMetronomeClick()"
              class="px-2.5 py-1.5 rounded-full text-[11px] font-medium prism-press"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
            >
              试听
            </button>

            <input
              v-if="store.metronomeEnabled"
              type="range"
              min="0.2"
              max="1.5"
              step="0.05"
              :value="store.metronomeVolume"
              @input="handleMetronomeVolumeInput"
              class="w-16 m3-slider"
              title="节拍器音量"
            />
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              @click="store.gtBeepEnabled = !store.gtBeepEnabled"
              class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition"
              :style="
                store.gtBeepEnabled
                  ? { backgroundColor: 'var(--md-warning-container)', color: 'var(--md-on-warning-container)' }
                  : { backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }
              "
            >
              <Bell class="w-3 h-3" />
              <span>警报音</span>
            </button>

            <button
              type="button"
              @click="showOffsetTools = !showOffsetTools"
              class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-mono"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }"
            >
              <SlidersHorizontal class="w-3 h-3" />
              <span>{{ store.project.meta.offsetMs > 0 ? '+' : '' }}{{ store.project.meta.offsetMs }}ms</span>
              <ChevronDown
                class="w-3 h-3 transition-transform"
                :class="showOffsetTools ? 'rotate-180' : ''"
              />
            </button>
          </div>
        </div>

        <div v-if="showOffsetTools" class="pt-1 flex items-center gap-1.5">
          <button
            v-for="delta in [-100, -20]"
            :key="delta"
            type="button"
            @click="store.adjustOffset(delta)"
            class="flex-1 py-1.5 rounded-xl text-[11px] font-mono font-semibold prism-press"
            :style="{ backgroundColor: 'var(--fc-block)', color: 'var(--md-on-surface)' }"
          >
            {{ delta }}
          </button>
          <button
            type="button"
            @click="store.setOffset(0)"
            class="flex-1 py-1.5 rounded-xl text-[11px] font-semibold prism-press"
            :style="{ backgroundColor: 'var(--fc-block)', color: 'var(--md-on-surface-variant)' }"
          >
            归零
          </button>
          <button
            v-for="delta in [20, 100]"
            :key="delta"
            type="button"
            @click="store.adjustOffset(delta)"
            class="flex-1 py-1.5 rounded-xl text-[11px] font-mono font-semibold prism-press"
            :style="{ backgroundColor: 'var(--fc-block)', color: 'var(--md-on-surface)' }"
          >
            +{{ delta }}
          </button>
        </div>
      </div>
    </section>

    <!-- Source & Lyrics Importer Card -->
    <section :class="modalMode ? 'space-y-3.5' : 'fc-card p-5 space-y-3.5'">
      <div v-if="!modalMode" class="flex items-center justify-between">
        <span class="text-xs font-bold tracking-wide" :style="{ color: 'var(--md-on-surface-variant)' }">
          音源与歌词导入
        </span>
        <span
          class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
          :style="
            store.backendOnline
              ? { backgroundColor: 'var(--md-success-container)', color: 'var(--md-on-success-container)' }
              : { backgroundColor: 'var(--md-warning-container)', color: 'var(--md-on-warning-container)' }
          "
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :style="{ backgroundColor: store.backendOnline ? 'var(--md-success)' : 'var(--md-warning)' }"
          />
          {{ store.backendOnline ? '服务在线' : '离线模式' }}
        </span>
      </div>

      <PrismSegmented
        v-model="sourceTab"
        compact
        :segments="[
          { value: 'search', label: '搜索曲库' },
          { value: 'local', label: '本地音轨 + LRC' },
          { value: 'demo', label: '内置 Demo' }
        ]"
      />

      <!-- Tab 1: Search -->
      <div v-if="sourceTab === 'search'" class="space-y-2.5">
        <select
          v-model="searchSource"
          class="w-full px-3 py-2 text-xs rounded-2xl focus:outline-none border"
          :style="{
            backgroundColor: 'var(--fc-block)',
            color: 'var(--md-on-surface)',
            borderColor: 'var(--md-outline-variant)'
          }"
        >
          <option v-for="opt in providers" :key="opt.id" :value="opt.id">
            {{ opt.label }}{{ opt.id === 'custom_proxy' && !opt.enabled ? ' (未配置)' : '' }}
          </option>
        </select>

        <form @submit.prevent="handleSearch" class="flex gap-2">
          <div class="relative flex-1 min-w-0">
            <Search
              class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              :style="{ color: 'var(--md-on-surface-variant)' }"
            />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="输入歌名或歌手..."
              class="w-full pl-8 pr-3 py-2 text-xs rounded-2xl focus:outline-none border"
              :style="{
                backgroundColor: 'var(--fc-block)',
                color: 'var(--md-on-surface)',
                borderColor: 'var(--md-outline-variant)'
              }"
            />
          </div>
          <button
            type="submit"
            :disabled="searching"
            class="px-4 py-2 rounded-2xl text-xs font-semibold disabled:opacity-50 prism-press shrink-0"
            :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
          >
            {{ searching ? '检索...' : '搜索' }}
          </button>
        </form>

        <div
          v-if="lastProviderUsed"
          class="text-[11px] flex items-center justify-between px-1"
          :style="{ color: 'var(--md-on-surface-variant)' }"
        >
          <span>来源：{{ lastProviderUsed }}</span>
          <span v-if="fallbackHint" :style="{ color: 'var(--md-warning)' }">已自动回退</span>
        </div>

        <div v-if="searchResults.length > 0" class="max-h-56 overflow-y-auto space-y-1.5 pr-1">
          <div
            v-for="item in searchResults"
            :key="item.provider + '-' + item.id"
            class="px-3 py-2.5 rounded-2xl flex items-center justify-between gap-2 transition"
            :style="{ backgroundColor: 'var(--fc-block)' }"
          >
            <div class="min-w-0">
              <div class="text-xs font-bold truncate">{{ item.title }}</div>
              <div class="text-[11px] truncate" :style="{ color: 'var(--md-on-surface-variant)' }">
                {{ item.artist }} · {{ item.platform }}
              </div>
            </div>
            <button
              type="button"
              :disabled="loadingTrackId === item.id"
              @click="handleImportTrack(item)"
              class="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold prism-press"
              :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
            >
              {{ loadingTrackId === item.id ? '导入中' : '导入' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Tab 2: Local Audio + LRC -->
      <div v-else-if="sourceTab === 'local'" class="space-y-3">
        <label
          class="flex items-center justify-center gap-2 border-2 border-dashed rounded-2xl py-3 px-3 text-xs font-semibold cursor-pointer transition hover:opacity-90"
          :style="{
            borderColor: 'var(--md-outline-variant)',
            backgroundColor: 'var(--fc-block)',
            color: 'var(--md-on-surface)'
          }"
        >
          <Upload class="w-4 h-4" :style="{ color: 'var(--md-primary)' }" />
          <span class="inline-flex items-center gap-1.5">
            <FileAudio class="w-3.5 h-3.5" />
            <span>选择本地音频（自动测算 BPM）</span>
          </span>
          <input type="file" accept="audio/*" class="hidden" @change="handleAudioFileChange" />
        </label>

        <div class="space-y-2.5">
          <textarea
            v-model="rawLrcInput"
            rows="4"
            class="w-full px-3 py-2 text-xs font-mono rounded-2xl border focus:outline-none"
            :style="{
              backgroundColor: 'var(--fc-block)',
              color: 'var(--md-on-surface)',
              borderColor: 'var(--md-outline-variant)'
            }"
            placeholder="粘贴 LRC 歌词：[00:12.34]歌詞..."
          />

          <div class="flex items-center justify-between text-xs px-1">
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <PrismSwitch v-model="forceJapaneseRuby" label="日语注音" />
              <span :style="{ color: 'var(--md-on-surface-variant)' }">强制日语注音</span>
            </label>
            <button
              type="button"
              @click="showTranslationBox = !showTranslationBox"
              class="font-semibold"
              :style="{ color: 'var(--md-primary)' }"
            >
              {{ showTranslationBox ? '收起翻译框' : '+ 中文翻译 LRC' }}
            </button>
          </div>

          <textarea
            v-if="showTranslationBox"
            v-model="translationLrcInput"
            rows="2"
            class="w-full px-3 py-2 text-xs font-mono rounded-2xl border focus:outline-none"
            :style="{
              backgroundColor: 'var(--fc-block)',
              color: 'var(--md-on-surface)',
              borderColor: 'var(--md-outline-variant)'
            }"
            placeholder="粘贴中文翻译 LRC（按时间戳对齐）"
          />

          <div
            class="px-3 py-1.5 rounded-xl text-[11px] flex items-center justify-between gap-2"
            :style="{
              backgroundColor: 'var(--fc-block)',
              color: 'var(--md-on-surface-variant)'
            }"
          >
            <span>导入后将自动按空白时长识别前奏 / 间奏 / 尾奏</span>
            <span class="font-mono shrink-0">
              {{ Math.round(store.sectionThresholds.introThresholdMs / 1000) }}s /
              {{ Math.round(store.sectionThresholds.interludeThresholdMs / 1000) }}s /
              {{ Math.round(store.sectionThresholds.outroThresholdMs / 1000) }}s
            </span>
          </div>

          <button
            type="button"
            data-testid="parse-lrc-btn"
            :disabled="parsingLrc"
            @click="handleParseLrc"
            class="w-full py-2.5 rounded-full text-xs font-semibold prism-press disabled:opacity-50"
            :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
          >
            {{ parsingLrc ? '解析中...' : '解析并导入歌词' }}
          </button>
        </div>
      </div>

      <!-- Tab 3: Demo -->
      <div v-else class="space-y-3 text-xs p-3.5 rounded-2xl" :style="{ backgroundColor: 'var(--fc-block)' }">
        <p class="leading-relaxed inline-flex items-start gap-2" :style="{ color: 'var(--md-on-surface-variant)' }">
          <Disc3 class="w-4 h-4 shrink-0 mt-0.5" :style="{ color: 'var(--md-primary)' }" />
          <span>使用浏览器 Web Audio 实时合成 175 BPM 无版权鼓点与演示歌词，适合离线测试节拍同步与打标。</span>
        </p>
        <button
          type="button"
          @click="handleLoadDemo"
          class="w-full py-2.5 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
        >
          加载 175 BPM 演示曲目
        </button>
      </div>
    </section>
  </div>
</template>
