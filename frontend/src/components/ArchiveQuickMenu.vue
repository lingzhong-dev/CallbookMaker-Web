<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  Archive,
  BookmarkPlus,
  Check,
  ChevronDown,
  FolderOpen,
  Music2,
  Pencil,
  Save,
  Trash2,
  X
} from 'lucide-vue-next'
import { useCallbookStore } from '../stores/callbookStore'
import { useThemeStore } from '../stores/themeStore'
import { useUiStore } from '../stores/uiStore'
import type { CallbookArchiveEntry } from '../types/callbook'
import { runWithArchiveSavePrompt } from '../utils/archiveGuard'

const store = useCallbookStore()
const uiStore = useUiStore()
const themeStore = useThemeStore()

const editingId = ref<string | null>(null)
const editingName = ref('')
const saveAsMode = ref(false)
const saveAsName = ref('')

const currentLabel = computed(() => {
  if (store.activeArchiveEntry) return store.activeArchiveEntry.name
  return store.project.meta.title.trim() || '未命名 Call 本'
})

function formatSavedTime(ts: number): string {
  try {
    const d = new Date(ts)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${mm}-${dd} ${hh}:${mi}`
  } catch {
    return ''
  }
}

function toggleMenu(): void {
  uiStore.showArchiveMenu = !uiStore.showArchiveMenu
  if (!uiStore.showArchiveMenu) {
    editingId.value = null
    saveAsMode.value = false
  }
}

function closeMenu(): void {
  uiStore.showArchiveMenu = false
  editingId.value = null
  saveAsMode.value = false
}

function handleSaveCurrent(): void {
  store.saveCurrentToArchive()
  saveAsMode.value = false
}

function openSaveAsInput(): void {
  saveAsMode.value = true
  saveAsName.value = `${currentLabel.value} (副本)`
}

function confirmSaveAs(): void {
  const targetName = saveAsName.value.trim() || `${currentLabel.value} (副本)`
  store.saveCurrentToArchive({ asNew: true, customName: targetName })
  saveAsMode.value = false
  saveAsName.value = ''
}

function handleSwitchArchive(entry: CallbookArchiveEntry): void {
  if (entry.id === store.activeArchiveId && !store.needsSavePromptBeforeSwitch) {
    closeMenu()
    store.setStatus(`当前已处于存档「${entry.name}」`)
    return
  }
  closeMenu()
  runWithArchiveSavePrompt({
    actionLabel: '切换存档',
    targetLabel: entry.name,
    onProceed: () => {
      store.switchToArchive(entry.id)
    }
  })
}

function startRename(entry: CallbookArchiveEntry): void {
  editingId.value = entry.id
  editingName.value = entry.name
}

function commitRename(entryId: string): void {
  if (store.renameArchive(entryId, editingName.value)) {
    editingId.value = null
  }
}

function requestDeleteArchive(entry: CallbookArchiveEntry): void {
  uiStore.openConfirm({
    title: '删除 Call 本存档？',
    message: `确定要删除存档「${entry.name}」吗？该操作不可撤销。`,
    confirmLabel: '删除存档',
    destructive: true,
    onConfirm: () => {
      store.deleteArchive(entry.id)
    }
  })
}

function handleOpenImportSource(): void {
  closeMenu()
  uiStore.showSourceModal = true
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && uiStore.showArchiveMenu) {
    closeMenu()
  }
}

onMounted(() => window.addEventListener('keydown', handleKeyDown))
onUnmounted(() => window.removeEventListener('keydown', handleKeyDown))
</script>

<template>
  <div class="relative" data-no-site-edit="true">
    <!-- Top Header Quick-Switch Trigger -->
    <button
      type="button"
      data-testid="archive-menu-trigger"
      data-no-site-edit="true"
      @click="toggleMenu"
      class="h-8 sm:h-10 px-2.5 sm:px-3.5 rounded-full inline-flex items-center gap-1.5 text-xs font-bold prism-press transition-all max-w-[170px] sm:max-w-[230px]"
      :style="
        uiStore.showArchiveMenu
          ? {
              backgroundColor: 'var(--md-primary)',
              color: 'var(--md-on-primary)',
              boxShadow: '0 4px 14px rgba(var(--md-primary-rgb), 0.28)'
            }
          : {
              backgroundColor: 'var(--fc-card)',
              color: 'var(--md-on-surface)',
              boxShadow: 'var(--fc-shadow-e1)'
            }
      "
      title="Call 本存档与快捷切换菜单"
    >
      <Archive
        class="w-3.5 h-3.5 shrink-0"
        :style="{ color: uiStore.showArchiveMenu ? 'var(--md-on-primary)' : 'var(--md-primary)' }"
      />
      <span class="truncate hidden md:inline">{{ currentLabel }}</span>
      <span class="md:hidden">存档</span>
      <span
        class="px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none shrink-0"
        :style="
          uiStore.showArchiveMenu
            ? { backgroundColor: 'rgba(255,255,255,0.22)', color: 'var(--md-on-primary)' }
            : { backgroundColor: 'var(--fc-tone)', color: 'var(--md-primary)' }
        "
      >
        {{ store.archives.length }}
      </span>
      <span
        v-if="store.needsSavePromptBeforeSwitch"
        data-testid="archive-unsaved-dot"
        class="w-2 h-2 rounded-full shrink-0"
        style="background-color: #f59e0b"
        title="当前 Call 本尚未存入存档"
      />
      <ChevronDown class="w-3.5 h-3.5 shrink-0 opacity-75" />
    </button>

    <!-- Click-away Backdrop -->
    <div
      v-if="uiStore.showArchiveMenu"
      @click="closeMenu"
      class="fixed inset-0 z-[72] bg-black/25 backdrop-blur-[1px] no-print"
    />

    <!-- Quick-Switch Popover / Sheet -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 -translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 -translate-y-1"
    >
      <div
        v-if="uiStore.showArchiveMenu"
        data-testid="archive-quick-menu"
        data-no-site-edit="true"
        class="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-14 sm:top-12 z-[75] sm:w-[400px] max-h-[78vh] flex flex-col rounded-[26px] border overflow-hidden shadow-2xl no-print"
        :class="themeStore.liquidGlass ? 'fc-liquid-glass' : ''"
        :style="{
          backgroundColor: 'var(--fc-card)',
          borderColor: 'var(--md-outline-variant)',
          color: 'var(--md-on-surface)'
        }"
      >
        <!-- Header -->
        <div
          class="px-4 py-3.5 border-b flex items-center justify-between gap-2"
          :style="{ borderColor: 'var(--md-outline-variant)' }"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div
              class="w-8 h-8 rounded-2xl flex items-center justify-center shrink-0"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-primary)' }"
            >
              <FolderOpen class="w-4 h-4" />
            </div>
            <div class="min-w-0">
              <div class="text-sm font-bold leading-tight">Call 本存档快捷切换</div>
              <div class="text-[11px] truncate" :style="{ color: 'var(--md-on-surface-variant)' }">
                共 {{ store.archives.length }} 个已保存工程
              </div>
            </div>
          </div>

          <button
            type="button"
            @click="closeMenu"
            class="w-7 h-7 rounded-full flex items-center justify-center prism-press"
            :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }"
            aria-label="关闭存档菜单"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Current Workspace Quick Save Actions -->
        <div
          class="px-4 py-3 border-b space-y-2.5"
          :style="{ backgroundColor: 'var(--fc-tone)', borderColor: 'var(--md-outline-variant)' }"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-bold truncate">{{ currentLabel }}</span>
                <span
                  class="px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                  :style="
                    store.activeArchiveId && !store.hasUnsavedChanges
                      ? { backgroundColor: 'rgba(16,185,129,0.16)', color: '#059669' }
                      : store.needsSavePromptBeforeSwitch
                        ? { backgroundColor: 'rgba(245,158,11,0.18)', color: '#d97706' }
                        : { backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface-variant)' }
                  "
                >
                  {{
                    store.activeArchiveId && !store.hasUnsavedChanges
                      ? '已同步存档'
                      : store.activeArchiveId
                        ? '有未保存更改'
                        : store.hasFetchedExternalLyrics || store.hasUnsavedChanges
                          ? '待归档'
                          : '示例工程'
                  }}
                </span>
              </div>
              <div class="text-[11px] mt-0.5" :style="{ color: 'var(--md-on-surface-variant)' }">
                {{ store.project.lines.length }} 行歌词 · {{ store.project.alerts.length }} 条 GT 警报
              </div>
            </div>
          </div>

          <div v-if="!saveAsMode" class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="archive-save-btn"
              @click="handleSaveCurrent"
              class="flex-1 h-8 px-3 rounded-full inline-flex items-center justify-center gap-1.5 text-xs font-bold prism-press"
              :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
            >
              <Save class="w-3.5 h-3.5" />
              <span>{{ store.activeArchiveId ? '更新当前存档' : '保存到存档' }}</span>
            </button>

            <button
              type="button"
              data-testid="archive-save-new-btn"
              @click="openSaveAsInput"
              class="h-8 px-3 rounded-full inline-flex items-center justify-center gap-1 text-xs font-semibold prism-press"
              :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }"
            >
              <BookmarkPlus class="w-3.5 h-3.5" />
              <span>另存副本</span>
            </button>

            <button
              type="button"
              @click="handleOpenImportSource"
              class="h-8 px-3 rounded-full inline-flex items-center justify-center gap-1 text-xs font-semibold prism-press"
              :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-primary)' }"
              title="搜索或导入新歌曲歌词"
            >
              <Music2 class="w-3.5 h-3.5" />
              <span>拉取新歌</span>
            </button>
          </div>

          <div v-else class="flex items-center gap-1.5">
            <input
              v-model="saveAsName"
              data-testid="archive-save-as-input"
              type="text"
              placeholder="输入新存档名称..."
              @keyup.enter="confirmSaveAs"
              class="flex-1 h-8 px-3 rounded-full text-xs border outline-none"
              :style="{
                backgroundColor: 'var(--fc-card)',
                borderColor: 'var(--md-outline-variant)',
                color: 'var(--md-on-surface)'
              }"
            />
            <button
              type="button"
              data-testid="archive-save-as-confirm"
              @click="confirmSaveAs"
              class="h-8 px-3 rounded-full text-xs font-bold prism-press"
              :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
            >
              确定
            </button>
            <button
              type="button"
              @click="saveAsMode = false"
              class="h-8 px-2.5 rounded-full text-xs font-semibold prism-press"
              :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface-variant)' }"
            >
              取消
            </button>
          </div>
        </div>

        <!-- Saved Archive List -->
        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          <div
            v-if="store.sortedArchives.length === 0"
            class="py-8 px-4 text-center space-y-1.5 rounded-2xl"
            :style="{ backgroundColor: 'var(--fc-tone)' }"
          >
            <Archive class="w-7 h-7 mx-auto opacity-45" />
            <div class="text-xs font-semibold">暂无已保存的 Call 本存档</div>
            <div class="text-[11px] leading-relaxed" :style="{ color: 'var(--md-on-surface-variant)' }">
              点击上方「保存到存档」，或在拉取新歌词切换曲目时选择保存，即可在这里一键来回切换。
            </div>
          </div>

          <div
            v-for="entry in store.sortedArchives"
            :key="entry.id"
            :data-testid="`archive-item-${entry.id}`"
            class="rounded-2xl p-3 border transition-all"
            :style="
              entry.id === store.activeArchiveId
                ? {
                    backgroundColor: 'var(--fc-tone)',
                    borderColor: 'var(--md-primary)'
                  }
                : {
                    backgroundColor: 'var(--fc-card)',
                    borderColor: 'var(--md-outline-variant)'
                  }
            "
          >
            <div v-if="editingId === entry.id" class="flex items-center gap-1.5">
              <input
                v-model="editingName"
                data-testid="archive-rename-input"
                type="text"
                @keyup.enter="commitRename(entry.id)"
                class="flex-1 h-8 px-2.5 rounded-xl text-xs border outline-none"
                :style="{
                  backgroundColor: 'var(--fc-card)',
                  borderColor: 'var(--md-outline-variant)',
                  color: 'var(--md-on-surface)'
                }"
              />
              <button
                type="button"
                data-testid="archive-rename-save"
                @click="commitRename(entry.id)"
                class="w-8 h-8 rounded-xl flex items-center justify-center prism-press"
                :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
                aria-label="确认重命名"
              >
                <Check class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                @click="editingId = null"
                class="w-8 h-8 rounded-xl flex items-center justify-center prism-press"
                :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }"
                aria-label="取消重命名"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>

            <div v-else class="flex items-start justify-between gap-2">
              <button
                type="button"
                :data-testid="`archive-switch-${entry.id}`"
                @click="handleSwitchArchive(entry)"
                class="flex-1 min-w-0 text-left space-y-1 group"
              >
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-bold truncate group-hover:underline">
                    {{ entry.name }}
                  </span>
                  <span
                    v-if="entry.id === store.activeArchiveId"
                    class="px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                    :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
                  >
                    当前
                  </span>
                </div>
                <div
                  class="text-[11px] truncate"
                  :style="{ color: 'var(--md-on-surface-variant)' }"
                >
                  {{ entry.project.meta.artist || '未知歌手' }}
                  <span v-if="entry.project.meta.editorName"> · 编者 {{ entry.project.meta.editorName }}</span>
                </div>
                <div class="flex flex-wrap items-center gap-2 text-[10px]" :style="{ color: 'var(--md-on-surface-variant)' }">
                  <span>{{ entry.lineCount }} 句</span>
                  <span>{{ entry.taggedCount }} 打标</span>
                  <span>{{ entry.alertCount }} GT</span>
                  <span>{{ entry.project.meta.bpm }} BPM</span>
                  <span class="ml-auto">{{ formatSavedTime(entry.savedAt) }}</span>
                </div>
              </button>

              <div class="flex items-center gap-1 shrink-0 pt-0.5">
                <button
                  type="button"
                  :data-testid="`archive-rename-${entry.id}`"
                  @click.stop="startRename(entry)"
                  class="w-7 h-7 rounded-xl flex items-center justify-center prism-press"
                  :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }"
                  title="重命名存档"
                >
                  <Pencil class="w-3 h-3" />
                </button>
                <button
                  type="button"
                  :data-testid="`archive-delete-${entry.id}`"
                  @click.stop="requestDeleteArchive(entry)"
                  class="w-7 h-7 rounded-xl flex items-center justify-center prism-press"
                  :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-error)' }"
                  title="删除存档"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
