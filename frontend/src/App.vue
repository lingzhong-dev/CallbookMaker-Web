<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Maximize2, Moon, Music2, Pencil, Sun } from 'lucide-vue-next'
import MobileBottomDock from './components/MobileBottomDock.vue'
import ArchiveQuickMenu from './components/ArchiveQuickMenu.vue'
import PracticeModeOverlay from './components/PracticeModeOverlay.vue'
import QuickRefCard from './components/QuickRefCard.vue'
import SiteEditOverlay from './components/SiteEditOverlay.vue'
import NavigationSidebar from './components/layout/NavigationSidebar.vue'
import MaterialOverlays from './components/prism/MaterialOverlays.vue'
import DashboardView from './views/DashboardView.vue'
import ExportView from './views/ExportView.vue'
import ThemeView from './views/ThemeView.vue'
import { useCallbookStore } from './stores/callbookStore'
import { useSiteEditStore } from './stores/siteEditStore'
import { useThemeStore } from './stores/themeStore'
import { useUiStore } from './stores/uiStore'
import { triggerCallPresetForLine } from './utils/callTagActions'

const store = useCallbookStore()
const editStore = useSiteEditStore()
const themeStore = useThemeStore()
const uiStore = useUiStore()
const audioElRef = ref<HTMLAudioElement | null>(null)

const pageTitle = computed(() => {
  switch (uiStore.activeRoute) {
    case 'dashboard':
      return 'Live Call 控制台'
    case 'export':
      return '速查卡与多格式导出'
    case 'theme':
      return '外观主题与 Prism 设计系统'
  }
})

watch(
  () => uiStore.activeRoute,
  () => {
    window.scrollTo({ top: 0 })
  }
)

watch(
  () => [store.currentBeatInBar, store.currentBar] as const,
  ([beat]) => {
    uiStore.pushBeatSample(beat === 1, store.project.meta.bpm)
  }
)

watch(
  () =>
    store.sortedLines.map(
      (line) => line.calls.length + (line.customShout.trim() ? 1 : 0)
    ),
  (counts) => {
    uiStore.refreshCallDensitySeries(counts)
  },
  { immediate: true, deep: true }
)

function isTypingElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (uiStore.editPresetDialog.open) {
      uiStore.closeEditPresetDialog()
      return
    }
    if (uiStore.presetContextMenu.open) {
      uiStore.closePresetContextMenu()
      return
    }
    if (uiStore.singAlongPrompt.open) {
      uiStore.closeSingAlongPrompt()
      return
    }
    if (uiStore.savePromptDialog?.open) {
      uiStore.savePromptDialog.onCancel?.() ?? uiStore.closeSavePrompt()
      return
    }
    if (uiStore.confirmDialog.open) {
      uiStore.closeConfirm()
      return
    }
    if (uiStore.showSourceModal) {
      uiStore.showSourceModal = false
      return
    }
    if (store.isPracticeMode) {
      store.isPracticeMode = false
      return
    }
  }

  if (isTypingElement(e.target)) return

  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault()
    store.togglePlay()
    return
  }

  if (e.key.toLowerCase() === 'f') {
    e.preventDefault()
    store.isPracticeMode = !store.isPracticeMode
    return
  }

  if (e.key.toLowerCase() === 'g') {
    e.preventDefault()
    store.insertGtAlert()
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    store.stepActiveLine(-1)
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    store.stepActiveLine(1)
    return
  }

  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    store.seek(store.currentTimeMs - 2000)
    return
  }

  if (e.key === 'ArrowRight') {
    e.preventDefault()
    store.seek(store.currentTimeMs + 2000)
    return
  }

  const pressed = e.key.toUpperCase()
  const matched = store.allPresets.find((p) => p.shortcut.toUpperCase() === pressed)
  if (matched && store.activeLineId) {
    e.preventDefault()
    triggerCallPresetForLine({
      lineId: store.activeLineId,
      presetId: matched.id
    })
  }
}

onMounted(() => {
  themeStore.syncDomCssVars()
  void store.init(audioElRef.value)
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="min-h-screen flex fc-page">
    <!-- Standalone HTML5 Audio Element (Anti-CORS: never piped to Web Audio MediaElementSource) -->
    <audio ref="audioElRef" preload="auto" />

    <!-- Desktop Left NavigationSidebar (`prism_ui/lib/sidebar.dart`) -->
    <NavigationSidebar />

    <!-- Main Scrollable Content Region -->
    <div class="flex-1 min-w-0 flex flex-col no-print">
      <SiteEditOverlay />

      <!-- FlClash AppBar Header (`Dashboard` large title) -->
      <header class="px-4 sm:px-7 pt-4 sm:pt-5 pb-3 flex items-center justify-between gap-2.5">
        <div class="min-w-0 flex items-center gap-2.5 sm:gap-3">
          <div class="min-w-0">
            <h1 class="text-base sm:text-2xl font-extrabold tracking-tight truncate">
              {{ pageTitle }}
            </h1>
            <p class="text-[11px] sm:text-xs truncate" :style="{ color: 'var(--md-on-surface-variant)' }">
              {{ store.project.meta.title }} · {{ store.project.meta.bpm }} BPM ({{ store.project.meta.timeSignature }})
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ArchiveQuickMenu />

          <!-- Mobile quick source / dark buttons -->
          <button
            type="button"
            @click="uiStore.showSourceModal = true"
            class="lg:hidden w-8 h-8 rounded-full flex items-center justify-center prism-press"
            :style="{ backgroundColor: 'var(--fc-card)', boxShadow: 'var(--fc-shadow-e1)' }"
            title="导入音源 / LRC"
            aria-label="导入音源或LRC"
          >
            <Music2 class="w-4 h-4" :style="{ color: 'var(--md-primary)' }" />
          </button>

          <button
            type="button"
            @click="themeStore.themeMode = themeStore.isDark ? 'light' : 'dark'"
            class="lg:hidden w-8 h-8 rounded-full flex items-center justify-center prism-press"
            :style="{ backgroundColor: 'var(--fc-card)', boxShadow: 'var(--fc-shadow-e1)' }"
            title="切换深/浅模式"
            aria-label="切换深浅模式"
          >
            <Sun v-if="themeStore.isDark" class="w-4 h-4" />
            <Moon v-else class="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="mobile-practice-btn"
            @click="store.isPracticeMode = true"
            class="lg:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold prism-press"
            :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
          >
            <Maximize2 class="w-3 h-3" />
            <span>演练</span>
          </button>

          <button
            type="button"
            data-site-edit-ui="true"
            data-testid="toggle-site-edit-btn"
            @click="editStore.toggleEditMode()"
            class="w-8 h-8 sm:w-auto sm:h-10 sm:px-3.5 rounded-full inline-flex items-center justify-center gap-1.5 text-xs font-bold prism-press transition-all"
            :style="
              editStore.isEditMode
                ? {
                    backgroundColor: 'var(--md-primary)',
                    color: 'var(--md-on-primary)',
                    boxShadow: '0 4px 14px rgba(var(--md-primary-rgb), 0.28)'
                  }
                : {
                    backgroundColor: 'var(--fc-card)',
                    color: editStore.overrideCount > 0 ? 'var(--md-primary)' : 'var(--md-on-surface)',
                    boxShadow: 'var(--fc-shadow-e1)'
                  }
            "
            :title="editStore.isEditMode ? '退出全站文字编辑模式' : '开启全站文字编辑模式'"
            aria-label="切换网站文字编辑模式"
          >
            <Pencil class="w-3.5 h-3.5 shrink-0" />
            <span class="hidden sm:inline">
              {{
                editStore.isEditMode
                  ? '编辑中'
                  : editStore.overrideCount > 0
                    ? `改字 (${editStore.overrideCount})`
                    : '文字编辑'
              }}
            </span>
          </button>
        </div>
      </header>

      <!-- Route Content -->
      <main class="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-7 pt-2 pb-56 lg:pb-10">
        <DashboardView v-if="uiStore.activeRoute === 'dashboard'" />
        <ExportView v-else-if="uiStore.activeRoute === 'export'" />
        <ThemeView v-else />
      </main>
    </div>

    <!-- Mobile Persistent NavigationDock + Collapsible Quick-Tag Bar -->
    <MobileBottomDock v-if="!store.isPracticeMode" />

    <!-- Fullscreen Pure-Black Live Practice Teleprompter Mode -->
    <PracticeModeOverlay v-if="store.isPracticeMode" />

    <!-- Material 3 Dialogs, Sheets & Snackbar -->
    <MaterialOverlays />

    <!-- Dedicated Print / Vector PDF Sheet (hidden on screen, shown on @media print) -->
    <div class="hidden print-only-sheet">
      <QuickRefCard />
    </div>
  </div>
</template>
