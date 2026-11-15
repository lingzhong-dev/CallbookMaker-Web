<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Check,
  Download,
  ListChecks,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Upload,
  X
} from 'lucide-vue-next'
import { useCallbookStore } from '../stores/callbookStore'
import { useSiteEditStore } from '../stores/siteEditStore'
import { useThemeStore } from '../stores/themeStore'
import { useUiStore } from '../stores/uiStore'
import { createSiteTextEngine } from '../utils/siteTextEngine'

const callbookStore = useCallbookStore()
const editStore = useSiteEditStore()
const themeStore = useThemeStore()
const uiStore = useUiStore()

const draftText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
const managerSearch = ref('')
const importInputRef = ref<HTMLInputElement | null>(null)

let stopEngine: (() => void) | null = null
let engineSync: (() => void) | null = null

const isMultilineOriginal = computed(() =>
  Boolean(editStore.activeTarget?.original.includes('\n'))
)

const isCurrentTargetModified = computed(() => {
  const target = editStore.activeTarget
  if (!target) return false
  return Boolean(editStore.entries[target.key])
})

const hoverBoxStyle = computed(() => {
  const target = editStore.hoveredTarget
  if (!target) return {}
  return {
    top: `${Math.max(2, target.rect.top - 4)}px`,
    left: `${Math.max(2, target.rect.left - 5)}px`,
    width: `${Math.max(24, target.rect.width + 10)}px`,
    height: `${Math.max(20, target.rect.height + 8)}px`,
    borderColor: 'var(--md-primary)',
    backgroundColor: 'rgba(var(--md-primary-rgb), 0.10)'
  }
})

const hoverBadgeBelow = computed(() => {
  const target = editStore.hoveredTarget
  return target ? target.rect.top < 84 : false
})

const popoverStyle = computed(() => {
  const target = editStore.activeTarget
  if (!target || typeof window === 'undefined') return {}
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(370, vw - 24)
  const estHeight = 230
  const left = Math.max(12, Math.min(target.rect.left, vw - width - 12))
  const canPlaceBelow = target.rect.top + target.rect.height + 12 + estHeight <= vh - 16
  const top = canPlaceBelow
    ? Math.max(12, target.rect.top + target.rect.height + 10)
    : Math.max(12, Math.min(target.rect.top - estHeight - 10, vh - estHeight - 12))
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`
  }
})

const filteredManagerEntries = computed(() => {
  const q = managerSearch.value.trim().toLowerCase()
  if (!q) return editStore.entriesList
  return editStore.entriesList.filter(
    (item) =>
      item.original.toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q) ||
      item.route.toLowerCase().includes(q)
  )
})

function openEditorForHit(hit: {
  key: string
  original: string
  current: string
  route: string
  scope: string
  tagName: string
  rect: { top: number; left: number; width: number; height: number }
}): void {
  editStore.activeTarget = {
    key: hit.key,
    original: hit.original,
    current: hit.current,
    route: hit.route,
    scope: hit.scope,
    tagName: hit.tagName,
    rect: hit.rect
  }
  draftText.value = hit.current
  void nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

function commitInlineEdit(): void {
  const target = editStore.activeTarget
  if (!target) return
  editStore.setOverride(target.key, target.original, draftText.value, target.route)
  editStore.activeTarget = null
  void nextTick(() => engineSync?.())
}

function restoreInlineDefault(): void {
  const target = editStore.activeTarget
  if (!target) return
  editStore.removeOverride(target.key)
  editStore.activeTarget = null
  void nextTick(() => engineSync?.())
}

function cancelInlineEdit(): void {
  editStore.activeTarget = null
}

function handleTextareaKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelInlineEdit()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    commitInlineEdit()
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !isMultilineOriginal.value) {
    e.preventDefault()
    commitInlineEdit()
  }
}

function confirmResetAll(): void {
  uiStore.openConfirm({
    title: '恢复全部默认文案？',
    message: `即将清除全部 ${editStore.overrideCount} 处自定义网页文字并同步重置服务端/项目持久化文件。`,
    confirmLabel: '确认恢复默认',
    destructive: true,
    onConfirm: () => {
      void editStore.resetAllToDefault().then(() => nextTick(() => engineSync?.()))
    }
  })
}

function handleDownloadJson(): void {
  const jsonText = editStore.exportOverridesJson()
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'site-copy-overrides.json'
  link.click()
  URL.revokeObjectURL(url)
  callbookStore.setStatus('已导出网站文案修改配置 JSON')
}

async function handleImportJsonFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const content = await file.text()
    const count = editStore.importOverridesJson(content)
    await nextTick()
    engineSync?.()
    callbookStore.setStatus(`已导入 ${count} 处文案修改，可点击「写回项目」同步持久化`)
  } catch {
    callbookStore.setStatus('导入失败：请确认文件为有效的 JSON 文案配置')
  } finally {
    input.value = ''
  }
}

function handleWindowKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && editStore.activeTarget) {
    e.preventDefault()
    e.stopPropagation()
    cancelInlineEdit()
  }
}

onMounted(() => {
  const appRoot = document.getElementById('app')
  if (appRoot) {
    const engine = createSiteTextEngine({
      rootEl: appRoot,
      getRoute: () => uiStore.activeRoute,
      getEntries: () => editStore.entries,
      isEditMode: () => editStore.isEditMode && !editStore.showManagerModal,
      onHoverChange: (hit) => {
        editStore.hoveredTarget = hit
          ? {
              key: hit.key,
              original: hit.original,
              current: hit.current,
              route: hit.route,
              scope: hit.scope,
              tagName: hit.tagName,
              rect: hit.rect
            }
          : null
      },
      onEditSelect: (hit) => {
        openEditorForHit(hit)
      }
    })
    engineSync = engine.syncNow
    stopEngine = engine.start()
  }

  void editStore.hydrateFromBackend().then(() => {
    void nextTick(() => engineSync?.())
  })
  window.addEventListener('keydown', handleWindowKeyDown, true)
})

onUnmounted(() => {
  stopEngine?.()
  stopEngine = null
  engineSync = null
  window.removeEventListener('keydown', handleWindowKeyDown, true)
})

watch(
  () => [editStore.entries, uiStore.activeRoute, editStore.isEditMode],
  () => {
    void nextTick(() => engineSync?.())
  },
  { deep: true }
)
</script>

<template>
  <!-- Top Sticky Edit Mode Banner (zero overlap with content or mobile dock) -->
  <div
    v-if="editStore.isEditMode"
    data-site-edit-ui="true"
    class="sticky top-0 z-[65] px-3 sm:px-6 py-2.5 border-b backdrop-blur-md no-print transition-all"
    :style="{
      backgroundColor: themeStore.isDark
        ? 'rgba(18, 24, 38, 0.92)'
        : 'rgba(232, 240, 255, 0.95)',
      borderColor: 'var(--md-primary)',
      color: 'var(--md-on-surface)'
    }"
  >
    <div class="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <span
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold shrink-0"
          :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
        >
          <Pencil class="w-3.5 h-3.5" />
          <span>文字编辑模式</span>
        </span>
        <span class="text-xs font-medium truncate" :style="{ color: 'var(--md-on-surface-variant)' }">
          点击页面任意文字原地改字 · 已改 {{ editStore.overrideCount }} 处
          <template v-if="editStore.hasUnsyncedChanges">
            （有未写回项目的修改）
          </template>
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          data-testid="site-edit-manager-btn"
          @click="editStore.showManagerModal = true"
          class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }"
        >
          <ListChecks class="w-3.5 h-3.5" />
          <span>修改清单 ({{ editStore.overrideCount }})</span>
        </button>

        <button
          type="button"
          data-testid="site-edit-persist-btn"
          :disabled="editStore.syncing"
          @click="editStore.persistToProject()"
          class="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold prism-press disabled:opacity-60"
          :style="{
            backgroundColor: editStore.hasUnsyncedChanges
              ? 'var(--md-primary)'
              : 'var(--md-success-container)',
            color: editStore.hasUnsyncedChanges
              ? 'var(--md-on-primary)'
              : 'var(--md-on-success-container)'
          }"
        >
          <Save class="w-3.5 h-3.5" />
          <span>
            {{
              editStore.syncing
                ? '正在写入...'
                : editStore.hasUnsyncedChanges
                  ? '写回项目持久化'
                  : '已与项目同步'
            }}
          </span>
        </button>

        <button
          v-if="editStore.overrideCount > 0"
          type="button"
          data-testid="site-edit-reset-btn"
          @click="confirmResetAll"
          class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold prism-press"
          :style="{
            backgroundColor: 'var(--md-error-container)',
            color: 'var(--md-on-error-container)'
          }"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>恢复默认</span>
        </button>

        <button
          type="button"
          data-testid="site-edit-exit-btn"
          @click="editStore.toggleEditMode(false)"
          class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
        >
          <X class="w-3.5 h-3.5" />
          <span>退出编辑</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Live Hover Highlight Frame -->
  <Teleport to="body">
    <div
      v-if="editStore.isEditMode && editStore.hoveredTarget && !editStore.activeTarget && !editStore.showManagerModal"
      data-site-edit-ui="true"
      class="fixed pointer-events-none z-[60] rounded-lg border-2 border-dashed transition-all duration-75 no-print"
      :style="hoverBoxStyle"
    >
      <span
        class="absolute left-0 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap shadow-sm"
        :class="hoverBadgeBelow ? 'top-full mt-1' : '-top-5'"
        :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
      >
        {{
          editStore.entries[editStore.hoveredTarget.key]
            ? `已修改 · 点击编辑 <${editStore.hoveredTarget.tagName}>`
            : `点击编辑文字 <${editStore.hoveredTarget.tagName}>`
        }}
      </span>
    </div>

    <!-- Inline WYSIWYG Popover Editor -->
    <div
      v-if="editStore.isEditMode && editStore.activeTarget"
      data-site-edit-ui="true"
      class="fixed z-[70] rounded-[24px] p-4 shadow-2xl border space-y-3 no-print"
    :style="[
      popoverStyle,
      {
        backgroundColor: 'var(--fc-card)',
        borderColor: 'var(--md-primary)',
        color: 'var(--md-on-surface)',
        boxShadow: 'var(--fc-shadow-e2)'
      }
    ]"
    role="dialog"
    aria-label="编辑页面文字"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5">
          <span
            class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
            :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
          >
            &lt;{{ editStore.activeTarget.tagName }}&gt;
          </span>
          <span class="text-[11px] font-mono truncate" :style="{ color: 'var(--md-on-surface-variant)' }">
            {{ editStore.activeTarget.scope }}
          </span>
        </div>
        <div
          class="text-[11px] mt-1 truncate"
          :style="{ color: 'var(--md-on-surface-variant)' }"
          :title="editStore.activeTarget.original"
        >
          默认原文：{{ editStore.activeTarget.original }}
        </div>
      </div>

      <button
        type="button"
        @click="cancelInlineEdit"
        class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 prism-press"
        :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }"
        aria-label="关闭编辑框"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <textarea
      ref="inputRef"
      v-model="draftText"
      rows="2"
      data-testid="site-edit-inline-input"
      @keydown="handleTextareaKeyDown"
      class="w-full px-3 py-2 rounded-2xl border text-sm font-medium focus:outline-none resize-y"
      :style="{
        backgroundColor: 'var(--fc-block)',
        color: 'var(--md-on-surface)',
        borderColor: 'var(--md-outline-variant)'
      }"
      placeholder="输入新的网站文字..."
    />

    <div class="flex items-center justify-between gap-2">
      <span class="text-[10px]" :style="{ color: 'var(--md-on-surface-variant)' }">
        Enter 保存 · Esc 取消
      </span>
      <div class="flex items-center gap-1.5">
        <button
          v-if="isCurrentTargetModified"
          type="button"
          data-testid="site-edit-inline-restore"
          @click="restoreInlineDefault"
          class="px-3 py-1.5 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-error)' }"
        >
          恢复默认
        </button>
        <button
          type="button"
          data-testid="site-edit-inline-save"
          @click="commitInlineEdit"
          class="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold prism-press"
          :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
        >
          <Check class="w-3.5 h-3.5" />
          <span>确认修改</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Centralized Overrides Manager Modal -->
  <div
    v-if="editStore.showManagerModal"
    data-site-edit-ui="true"
    @click.self="editStore.showManagerModal = false"
    class="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm no-print"
  >
    <div
      class="w-full max-w-2xl max-h-[86vh] flex flex-col rounded-[28px] p-5 sm:p-6 shadow-2xl space-y-4"
      :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }"
      role="dialog"
      aria-modal="true"
      aria-label="全站文字修改清单"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-extrabold">全站文字修改清单</h3>
          <p class="text-xs" :style="{ color: 'var(--md-on-surface-variant)' }">
            实时缓存在浏览器；点击「写回项目持久化」可永久保存至本地与服务端
          </p>
        </div>
        <button
          type="button"
          @click="editStore.showManagerModal = false"
          class="w-9 h-9 rounded-full flex items-center justify-center prism-press"
          :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }"
          aria-label="关闭清单"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div
          class="flex-1 min-w-[200px] flex items-center gap-2 px-3 py-2 rounded-full border"
          :style="{ backgroundColor: 'var(--fc-block)', borderColor: 'var(--md-outline-variant)' }"
        >
          <Search class="w-3.5 h-3.5 shrink-0" :style="{ color: 'var(--md-on-surface-variant)' }" />
          <input
            v-model="managerSearch"
            type="text"
            placeholder="搜索原文或修改后文字..."
            class="w-full bg-transparent text-xs focus:outline-none"
          />
        </div>

        <button
          type="button"
          @click="handleDownloadJson"
          class="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
        >
          <Download class="w-3.5 h-3.5" />
          <span>导出 JSON</span>
        </button>

        <button
          type="button"
          @click="importInputRef?.click()"
          class="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
        >
          <Upload class="w-3.5 h-3.5" />
          <span>导入 JSON</span>
        </button>
        <input
          ref="importInputRef"
          type="file"
          accept=".json,application/json"
          class="hidden"
          @change="handleImportJsonFile"
        />
      </div>

      <div class="flex-1 overflow-y-auto space-y-2.5 pr-1">
        <div
          v-if="filteredManagerEntries.length === 0"
          class="py-10 text-center text-xs rounded-2xl"
          :style="{ backgroundColor: 'var(--fc-block)', color: 'var(--md-on-surface-variant)' }"
        >
          暂无已修改的网站文字。关闭本窗口后直接点击页面任意标题、按钮或标签即可修改。
        </div>

        <div
          v-for="item in filteredManagerEntries"
          :key="item.key"
          class="p-3.5 rounded-2xl border space-y-2"
          :style="{ backgroundColor: 'var(--fc-block)', borderColor: 'var(--md-outline-variant)' }"
        >
          <div class="flex items-center justify-between gap-2 text-[11px]">
            <span class="font-mono truncate" :style="{ color: 'var(--md-on-surface-variant)' }">
              原文：{{ item.original }}
            </span>
            <button
              type="button"
              @click="editStore.removeOverride(item.key)"
              class="shrink-0 font-semibold hover:underline"
              :style="{ color: 'var(--md-error)' }"
            >
              还原默认
            </button>
          </div>
          <input
            :value="item.value"
            @change="(ev) => editStore.setOverride(item.key, item.original, (ev.target as HTMLInputElement).value, item.route)"
            type="text"
            class="w-full px-3 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none"
            :style="{
              backgroundColor: 'var(--fc-card)',
              color: 'var(--md-on-surface)',
              borderColor: 'var(--md-outline-variant)'
            }"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t" :style="{ borderColor: 'var(--md-outline-variant)' }">
        <button
          v-if="editStore.overrideCount > 0"
          type="button"
          @click="confirmResetAll"
          class="inline-flex items-center gap-1 px-3.5 py-2 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>全部恢复默认</span>
        </button>
        <div class="flex items-center gap-2 ml-auto">
          <button
            type="button"
            data-testid="site-edit-modal-persist-btn"
            @click="editStore.persistToProject()"
            :disabled="editStore.syncing"
            class="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold prism-press disabled:opacity-60"
            :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
          >
            <Save class="w-3.5 h-3.5" />
            <span>{{ editStore.syncing ? '写入中...' : '写回项目持久化' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  </Teleport>
</template>
