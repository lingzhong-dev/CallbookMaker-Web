<script setup lang="ts">
import {
  Archive,
  FileOutput,
  LayoutDashboard,
  Maximize2,
  Moon,
  Music2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Sun
} from 'lucide-vue-next'
import { useCallbookStore } from '../../stores/callbookStore'
import { useSiteEditStore } from '../../stores/siteEditStore'
import { useThemeStore } from '../../stores/themeStore'
import { useUiStore, type NavRoute } from '../../stores/uiStore'

const store = useCallbookStore()
const editStore = useSiteEditStore()
const themeStore = useThemeStore()
const uiStore = useUiStore()

const navItems: Array<{ id: NavRoute; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: '控制台', icon: LayoutDashboard },
  { id: 'export', label: '速查卡导出', icon: FileOutput },
  { id: 'theme', label: '外观主题', icon: Palette }
]

function toggleQuickDark(): void {
  themeStore.themeMode = themeStore.isDark ? 'light' : 'dark'
}
</script>

<template>
  <aside
    class="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen py-4 pl-4 pr-2 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] select-none no-print"
    :class="themeStore.sidebarCollapsed ? 'w-[88px]' : 'w-[244px]'"
  >
    <div
      class="flex-1 flex flex-col rounded-[28px] p-3 overflow-hidden transition-all duration-300"
      :class="themeStore.liquidGlass ? 'fc-liquid-glass' : 'fc-card'"
    >
      <!-- Top Brand & Collapse Toggle (FlClash NavigationSidebar Header) -->
      <div class="flex items-center justify-between gap-2 px-2 py-1.5 mb-3">
        <div v-if="!themeStore.sidebarCollapsed" class="min-w-0">
          <div class="text-sm font-bold tracking-tight truncate">Live Call</div>
          <div class="text-[10px] font-mono truncate" :style="{ color: 'var(--md-on-surface-variant)' }">
            Prism Studio
          </div>
        </div>

        <button
          type="button"
          @click="themeStore.sidebarCollapsed = !themeStore.sidebarCollapsed"
          class="w-9 h-9 rounded-xl flex items-center justify-center prism-press shrink-0"
          :class="themeStore.sidebarCollapsed ? 'mx-auto' : 'ml-auto'"
          :style="{ color: 'var(--md-on-surface-variant)' }"
          :title="themeStore.sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
        >
          <PanelLeftOpen v-if="themeStore.sidebarCollapsed" class="w-4 h-4" />
          <PanelLeftClose v-else class="w-4 h-4" />
        </button>
      </div>

      <!-- Primary Navigation Destinations with Active 3x18 Left Indicator Bar -->
      <nav class="space-y-1.5 flex-1" aria-label="主导航">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          @click="uiStore.activeRoute = item.id"
          class="relative w-full h-11 rounded-2xl flex items-center gap-3 px-3 transition-all duration-200 prism-press group"
          :style="
            uiStore.activeRoute === item.id
              ? {
                  backgroundColor: 'var(--md-primary-container)',
                  color: 'var(--md-on-primary-container)'
                }
              : {
                  color: 'var(--md-on-surface-variant)'
                }
          "
          :title="themeStore.sidebarCollapsed ? item.label : undefined"
        >
          <!-- FlClash signature 3px x 16px active left indicator bar -->
          <span
            class="absolute left-0.5 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-200"
            :style="{
              height: uiStore.activeRoute === item.id ? '18px' : '0px',
              opacity: uiStore.activeRoute === item.id ? 1 : 0,
              backgroundColor: 'var(--md-primary)'
            }"
          />
          <component
            :is="item.icon"
            class="w-[18px] h-[18px] shrink-0"
            :class="themeStore.sidebarCollapsed ? 'mx-auto' : ''"
          />
          <span
            v-if="!themeStore.sidebarCollapsed"
            class="text-[13px] font-semibold truncate"
          >
            {{ item.label }}
          </span>
        </button>
      </nav>

      <!-- Bottom Quick Action Stack -->
      <div class="pt-3 mt-3 border-t space-y-2" :style="{ borderColor: 'var(--md-outline-variant)' }">
        <button
          type="button"
          data-site-edit-ui="true"
          data-testid="sidebar-site-edit-btn"
          @click="editStore.toggleEditMode()"
          class="w-full h-10 rounded-2xl flex items-center justify-center gap-2 px-3 text-xs font-semibold prism-press"
          :style="
            editStore.isEditMode
              ? {
                  backgroundColor: 'var(--md-primary-container)',
                  color: 'var(--md-on-primary-container)'
                }
              : {
                  backgroundColor: 'var(--fc-tone)',
                  color: 'var(--md-on-surface)'
                }
          "
          :title="themeStore.sidebarCollapsed ? '全站文字编辑模式' : undefined"
        >
          <Pencil class="w-4 h-4 shrink-0" :style="{ color: 'var(--md-primary)' }" />
          <span v-if="!themeStore.sidebarCollapsed" class="truncate">
            {{
              editStore.isEditMode
                ? '退出文字编辑'
                : editStore.overrideCount > 0
                  ? `文字编辑 · ${editStore.overrideCount}`
                  : '文字编辑模式'
            }}
          </span>
        </button>

        <button
          type="button"
          @click="uiStore.showSourceModal = true"
          class="w-full h-10 rounded-2xl flex items-center justify-center gap-2 px-3 text-xs font-semibold prism-press"
          :style="{
            backgroundColor: 'var(--fc-tone)',
            color: 'var(--md-on-surface)'
          }"
          :title="themeStore.sidebarCollapsed ? '音源与歌词导入' : undefined"
        >
          <Music2 class="w-4 h-4 shrink-0" :style="{ color: 'var(--md-primary)' }" />
          <span v-if="!themeStore.sidebarCollapsed" class="truncate">导入音源 / LRC</span>
        </button>

        <button
          type="button"
          data-no-site-edit="true"
          data-testid="sidebar-archive-btn"
          @click="uiStore.showArchiveMenu = true"
          class="w-full h-10 rounded-2xl flex items-center justify-center gap-2 px-3 text-xs font-semibold prism-press"
          :style="{
            backgroundColor: 'var(--fc-tone)',
            color: 'var(--md-on-surface)'
          }"
          :title="themeStore.sidebarCollapsed ? 'Call 本存档快捷切换' : undefined"
        >
          <Archive class="w-4 h-4 shrink-0" :style="{ color: 'var(--md-primary)' }" />
          <span v-if="!themeStore.sidebarCollapsed" class="truncate">
            Call 本存档 · {{ store.archives.length }}
          </span>
        </button>

        <button
          type="button"
          data-testid="sidebar-practice-btn"
          @click="store.isPracticeMode = true"
          class="w-full h-10 rounded-2xl flex items-center justify-center gap-2 px-3 text-xs font-semibold prism-press"
          :style="{
            backgroundColor: 'var(--md-primary)',
            color: 'var(--md-on-primary)',
            boxShadow: '0 4px 14px rgba(var(--md-primary-rgb), 0.28)'
          }"
          :title="themeStore.sidebarCollapsed ? '现场演练模式 (F)' : undefined"
        >
          <Maximize2 class="w-4 h-4 shrink-0" />
          <span v-if="!themeStore.sidebarCollapsed">
            演练模式 <span class="opacity-70 font-mono">F</span>
          </span>
        </button>

        <!-- Compact Status + Quick Theme Toggle -->
        <div
          class="flex items-center pt-1 px-1"
          :class="themeStore.sidebarCollapsed ? 'justify-center' : 'justify-between'"
        >
          <div
            v-if="!themeStore.sidebarCollapsed"
            class="inline-flex items-center gap-1.5 text-[11px] font-mono"
            :style="{ color: 'var(--md-on-surface-variant)' }"
          >
            <span
              class="w-2 h-2 rounded-full"
              :style="{ backgroundColor: store.backendOnline ? 'var(--md-success)' : 'var(--md-warning)' }"
            />
            <span>{{ store.backendOnline ? 'API 在线' : '离线模式' }}</span>
          </div>
          <button
            type="button"
            data-testid="sidebar-toggle-dark"
            @click="toggleQuickDark"
            aria-label="切换深浅模式"
            class="w-8 h-8 rounded-full flex items-center justify-center prism-press"
            :style="{
              backgroundColor: 'var(--fc-tone)',
              color: 'var(--md-on-surface)'
            }"
            :title="themeStore.isDark ? '切换到浅色模式' : '切换到深色模式'"
          >
            <Sun v-if="themeStore.isDark" class="w-3.5 h-3.5" />
            <Moon v-else class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
