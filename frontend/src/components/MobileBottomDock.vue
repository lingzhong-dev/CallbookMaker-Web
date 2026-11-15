<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileOutput,
  LayoutDashboard,
  Maximize2,
  Palette,
  Pause,
  Play
} from 'lucide-vue-next'
import { useCallbookStore } from '../stores/callbookStore'
import { useThemeStore } from '../stores/themeStore'
import { useUiStore, type NavRoute } from '../stores/uiStore'
import { formatMsToClock } from '../utils/time'

const store = useCallbookStore()
const themeStore = useThemeStore()
const uiStore = useUiStore()
const showTagTray = ref(true)
const autoAdvanceOnTag = ref(false)

const destinations: Array<{ id: NavRoute; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: '控制台', icon: LayoutDashboard },
  { id: 'export', label: '导出', icon: FileOutput },
  { id: 'theme', label: '主题', icon: Palette }
]

const activeIndex = computed(() =>
  Math.max(
    0,
    destinations.findIndex((d) => d.id === uiStore.activeRoute)
  )
)

const activeTargetInfo = computed(() => {
  const target = store.resolveLineForQuickTag()
  if (!target) {
    return { index: -1, total: 0, label: '暂无歌词行' }
  }
  const idx = store.sortedLines.findIndex((l) => l.id === target.id)
  const rawText = target.text.original || target.text.translation || '空歌词行'
  const snippet = rawText.length > 14 ? `${rawText.slice(0, 14)}…` : rawText
  return {
    index: idx,
    total: store.sortedLines.length,
    label: `#${idx + 1} · ${snippet}`
  }
})

function stepTargetLine(direction: -1 | 1): void {
  if (!store.activeLineId) {
    const target = store.resolveLineForQuickTag()
    if (target) store.activeLineId = target.id
  }
  store.stepActiveLine(direction)
}

function isPresetActive(presetId: string): boolean {
  const line = store.resolveLineForQuickTag()
  return Boolean(line?.calls.some((c) => c.presetId === presetId))
}

function handleThumbTag(presetId: string): void {
  store.quickTagActiveLine(presetId, autoAdvanceOnTag.value)
}

function isTailUpdraftActive(): boolean {
  const line = store.resolveLineForQuickTag()
  return Boolean(line?.tailUpdraft)
}

function handleToggleTailUpdraft(): void {
  const target = store.resolveLineForQuickTag()
  if (!target) return
  store.toggleTailUpdraft(target.id)
}
</script>

<template>
  <div class="lg:hidden fixed inset-x-0 bottom-0 z-40 pointer-events-none no-print">
    <!-- Quick GT Alert FAB -->
    <div
      class="flex justify-end px-4 mb-2.5"
      v-if="uiStore.activeRoute === 'dashboard'"
    >
      <div class="flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          data-testid="mobile-tray-toggle"
          @click="showTagTray = !showTagTray"
          class="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold shadow-lg prism-press"
          :class="themeStore.liquidGlass ? 'fc-liquid-glass' : ''"
          :style="
            themeStore.liquidGlass
              ? { color: 'var(--md-on-surface)' }
              : { backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }
          "
        >
          <span>{{ showTagTray ? '收起速标' : '速标栏' }}</span>
          <ChevronDown v-if="showTagTray" class="w-3.5 h-3.5" />
          <ChevronUp v-else class="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          @click="store.insertGtAlert()"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-extrabold shadow-lg prism-press"
          :style="{
            backgroundColor: 'var(--md-warning-container)',
            color: 'var(--md-on-warning-container)'
          }"
        >
          <AlertTriangle class="w-3.5 h-3.5" />
          <span>+ GT 警报</span>
        </button>
      </div>
    </div>

    <!-- Collapsible Mini Player & 1-Thumb Call Quick-Tag Strip -->
    <div
      v-if="showTagTray && uiStore.activeRoute === 'dashboard'"
      data-testid="mobile-quick-tag-dock"
      class="pointer-events-auto mx-4 mb-2.5 rounded-[24px] overflow-hidden shadow-xl transition-all"
      :class="themeStore.liquidGlass ? 'fc-liquid-glass' : ''"
      :style="
        themeStore.liquidGlass
          ? {}
          : { backgroundColor: 'var(--fc-card)', boxShadow: 'var(--fc-shadow-e2)' }
      "
    >
      <!-- Active Line Stepper + Auto-Advance Toggle -->
      <div
        class="px-3 py-2 flex items-center justify-between gap-2 border-b text-[11px]"
        :style="{ borderColor: 'var(--md-outline-variant)' }"
      >
        <span
          class="font-semibold truncate min-w-0"
          :style="{ color: 'var(--md-on-surface-variant)' }"
        >
          {{ activeTargetInfo.label }}
        </span>
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="mobile-prev-line"
            @click="stepTargetLine(-1)"
            :disabled="activeTargetInfo.index <= 0"
            class="inline-flex items-center gap-0.5 px-2 py-1 rounded-full font-semibold disabled:opacity-40 prism-press"
            :style="{
              backgroundColor: 'var(--fc-tone)',
              color: 'var(--md-on-surface)'
            }"
          >
            <ChevronLeft class="w-3.5 h-3.5" />
            <span>上一句</span>
          </button>
          <button
            type="button"
            data-testid="mobile-next-line"
            @click="stepTargetLine(1)"
            :disabled="activeTargetInfo.index < 0 || activeTargetInfo.index >= activeTargetInfo.total - 1"
            class="inline-flex items-center gap-0.5 px-2 py-1 rounded-full font-semibold disabled:opacity-40 prism-press"
            :style="{
              backgroundColor: 'var(--fc-tone)',
              color: 'var(--md-on-surface)'
            }"
          >
            <span>下一句</span>
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-testid="mobile-auto-advance"
            @click="autoAdvanceOnTag = !autoAdvanceOnTag"
            class="px-2.5 py-1 rounded-full border font-semibold transition prism-press"
            :style="
              autoAdvanceOnTag
                ? {
                    borderColor: 'var(--md-primary)',
                    backgroundColor: 'var(--md-primary-container)',
                    color: 'var(--md-on-primary-container)'
                  }
                : {
                    borderColor: 'var(--md-outline-variant)',
                    backgroundColor: 'transparent',
                    color: 'var(--md-on-surface-variant)'
                  }
            "
          >
            打完跳下句
          </button>
        </div>
      </div>

      <div
        class="flex items-center gap-1.5 px-3 py-2 border-b"
        :style="{ borderColor: 'var(--md-outline-variant)' }"
      >
        <div
          data-testid="mobile-quick-tag-strip"
          class="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
        >
          <button
            v-for="preset in store.allPresets"
            :key="'mobile-' + preset.id"
            type="button"
            @click="handleThumbTag(preset.id)"
            :style="{
              backgroundColor: isPresetActive(preset.id) ? preset.color : 'var(--fc-tone)',
              color: isPresetActive(preset.id) ? '#FFFFFF' : 'var(--md-on-surface)',
              borderColor: preset.color
            }"
            class="shrink-0 whitespace-nowrap px-3 py-1 rounded-full border text-xs font-bold prism-press"
          >
            {{ preset.label }}
          </button>
        </div>

        <button
          type="button"
          data-testid="mobile-tail-updraft-btn"
          @click="handleToggleTailUpdraft"
          :aria-pressed="isTailUpdraftActive()"
          :style="
            isTailUpdraftActive()
              ? {
                  backgroundColor: '#8B5CF6',
                  color: '#FFFFFF',
                  borderColor: '#8B5CF6'
                }
              : {
                  backgroundColor: 'var(--fc-tone)',
                  color: 'var(--md-on-surface)',
                  borderColor: '#8B5CF6'
                }
          "
          class="shrink-0 whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold prism-press"
          title="切换当前行尾句上升气流（独立于行首军Call）"
        >
          <span>尾句上升气流</span>
        </button>
      </div>

      <div class="px-3.5 py-2 flex items-center justify-between gap-2.5">
        <button
          type="button"
          @click="store.togglePlay()"
          class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 prism-press shadow-sm"
          :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
          aria-label="播放或暂停"
        >
          <Pause v-if="store.isPlaying" class="w-4 h-4" />
          <Play v-else class="w-4 h-4 translate-x-[1px]" />
        </button>

        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold truncate">{{ store.project.meta.title }}</div>
          <div class="text-[11px] font-mono tabular-nums" :style="{ color: 'var(--md-on-surface-variant)' }">
            {{ formatMsToClock(store.currentTimeMs) }} · {{ store.project.meta.bpm }} BPM · {{ store.currentBar }}.{{ store.currentBeatInBar }}
          </div>
        </div>

        <button
          type="button"
          @click="store.isPracticeMode = true"
          class="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold prism-press"
          :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
        >
          <Maximize2 class="w-3.5 h-3.5" />
          <span>演练</span>
        </button>
      </div>
    </div>

    <!-- FlClash NavigationDock (`height=62px`, `edgeMargin=20px` when floating) -->
    <nav
      class="pointer-events-auto transition-all duration-300"
      :class="[
        themeStore.floatingNavDock ? 'mx-5 mb-4 rounded-full p-1' : 'rounded-t-[24px] px-2 pt-1.5 pb-2 border-t',
        themeStore.liquidGlass ? 'fc-liquid-glass' : ''
      ]"
      :style="
        themeStore.liquidGlass
          ? { borderColor: 'var(--md-outline-variant)' }
          : {
              backgroundColor: 'var(--fc-card)',
              boxShadow: 'var(--fc-shadow-e2)',
              borderColor: 'var(--md-outline-variant)'
            }
      "
      aria-label="底部导航"
    >
      <div class="relative grid grid-cols-3 h-[54px] items-center">
        <div
          class="absolute left-0 top-1 bottom-1 w-1/3 px-1 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] pointer-events-none"
          :style="{ transform: `translateX(${activeIndex * 100}%)` }"
        >
          <div
            class="w-full h-full rounded-full"
            :style="{ backgroundColor: 'var(--md-primary-container)' }"
          />
        </div>

        <button
          v-for="dest in destinations"
          :key="'dock-' + dest.id"
          type="button"
          @click="uiStore.activeRoute = dest.id"
          class="relative z-10 h-full flex flex-col items-center justify-center gap-0.5 rounded-full transition-colors prism-press"
          :style="{
            color:
              uiStore.activeRoute === dest.id
                ? 'var(--md-on-primary-container)'
                : 'var(--md-on-surface-variant)'
          }"
        >
          <component :is="dest.icon" class="w-4 h-4" />
          <span class="text-[11px] font-semibold">{{ dest.label }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>
