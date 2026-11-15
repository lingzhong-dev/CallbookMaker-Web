<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Edit3, Sparkles, Trash2, X } from 'lucide-vue-next'
import AudioSourcePanel from '../AudioSourcePanel.vue'
import { useCallbookStore } from '../../stores/callbookStore'
import { useThemeStore } from '../../stores/themeStore'
import { useUiStore } from '../../stores/uiStore'
import { requestDeleteCustomPresetWithConfirm } from '../../utils/callTagActions'

const store = useCallbookStore()
const uiStore = useUiStore()
const themeStore = useThemeStore()

const COLOR_PALETTE = [
  '#EF4444',
  '#F59E0B',
  '#8B5CF6',
  '#06B6D4',
  '#10B981',
  '#EC4899',
  '#14B8A6',
  '#2563EB'
]

const singAlongDraft = ref('')
const singAlongInputRef = ref<HTMLInputElement | null>(null)
const editPresetLabelDraft = ref('')
const editPresetColorDraft = ref('#EC4899')
const editPresetInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => uiStore.singAlongPrompt.open,
  async (open) => {
    if (!open) return
    singAlongDraft.value = uiStore.singAlongPrompt.initialValue
    await nextTick()
    singAlongInputRef.value?.focus()
    singAlongInputRef.value?.select()
  }
)

watch(
  () => uiStore.editPresetDialog.open,
  async (open) => {
    if (!open) return
    editPresetLabelDraft.value = uiStore.editPresetDialog.label
    editPresetColorDraft.value = uiStore.editPresetDialog.color
    await nextTick()
    editPresetInputRef.value?.focus()
    editPresetInputRef.value?.select()
  }
)

const contextPreset = computed(() =>
  uiStore.presetContextMenu.open
    ? store.customPresets.find((p) => p.id === uiStore.presetContextMenu.presetId) ?? null
    : null
)

const contextMenuPosition = computed(() => {
  const menuW = 196
  const menuH = 128
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  const left = Math.max(8, Math.min(uiStore.presetContextMenu.x, vw - menuW - 8))
  const top = Math.max(8, Math.min(uiStore.presetContextMenu.y, vh - menuH - 8))
  return { left: `${left}px`, top: `${top}px` }
})

function submitSingAlong(): void {
  const trimmed = singAlongDraft.value.trim()
  if (!trimmed) {
    store.setStatus('请输入跟唱内容后再添加')
    return
  }
  const cb = uiStore.singAlongPrompt.onConfirm
  uiStore.closeSingAlongPrompt()
  cb?.(trimmed)
}

function handleContextEdit(): void {
  const preset = contextPreset.value
  uiStore.closePresetContextMenu()
  if (!preset || preset.builtIn) return
  uiStore.openEditPresetDialog({
    presetId: preset.id,
    label: preset.label,
    color: preset.color
  })
}

function handleContextDelete(): void {
  const preset = contextPreset.value
  uiStore.closePresetContextMenu()
  if (!preset || preset.builtIn) return
  requestDeleteCustomPresetWithConfirm(preset)
}

function submitEditPreset(): void {
  const cleanLabel = editPresetLabelDraft.value.trim()
  if (!cleanLabel) {
    store.setStatus('自定义标签名称不能为空')
    return
  }
  store.updateCustomPreset(uiStore.editPresetDialog.presetId, {
    label: cleanLabel,
    color: editPresetColorDraft.value
  })
  uiStore.closeEditPresetDialog()
}
</script>

<template>
  <!-- Material 3 Floating Snackbar -->
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-2 scale-95"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-2 scale-95"
  >
    <div
      v-if="store.statusMessage"
      data-no-site-edit="true"
      class="fixed top-4 right-4 z-[80] max-w-sm px-4 py-2.5 rounded-full text-xs font-semibold shadow-xl flex items-center gap-2 no-print"
      :class="themeStore.liquidGlass ? 'fc-liquid-glass' : ''"
      :style="
        themeStore.liquidGlass
          ? { color: 'var(--md-on-surface)' }
          : { backgroundColor: 'var(--md-inverse-surface)', color: 'var(--md-inverse-on-surface)' }
      "
      role="status"
    >
      <Sparkles class="w-3.5 h-3.5 shrink-0" :style="{ color: 'var(--md-primary)' }" />
      <span class="truncate">{{ store.statusMessage }}</span>
    </div>
  </Transition>

  <!-- Material 3 Modal Dialog for Audio Source & LRC Import -->
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="uiStore.showSourceModal"
      @click.self="uiStore.showSourceModal = false"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45 backdrop-blur-sm no-print"
    >
      <div
        class="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] p-5 sm:p-6 shadow-2xl transition-all"
        :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }"
      >
        <div class="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 class="text-base font-bold">音源搜索与歌词导入</h3>
            <p class="text-xs" :style="{ color: 'var(--md-on-surface-variant)' }">
              支持聚合网关 / LRCLIB / 本地音频波形测速 / 日语注音 LRC
            </p>
          </div>
          <button
            type="button"
            @click="uiStore.showSourceModal = false"
            class="w-9 h-9 rounded-full flex items-center justify-center prism-press"
            :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }"
            aria-label="关闭弹窗"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        <AudioSourcePanel modal-mode @imported="uiStore.showSourceModal = false" />
      </div>
    </div>
  </Transition>

  <!-- Material 3 Confirmation Dialog -->
  <div
    v-if="uiStore.confirmDialog.open"
    data-no-site-edit="true"
    data-site-edit-ui="true"
    @click.self="uiStore.closeConfirm()"
    class="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm no-print"
  >
    <div
      class="w-full max-w-sm rounded-[28px] p-6 space-y-4 shadow-2xl"
      :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }"
      role="alertdialog"
      aria-modal="true"
    >
      <h3 class="text-base font-bold">{{ uiStore.confirmDialog.title }}</h3>
      <p class="text-xs leading-relaxed" :style="{ color: 'var(--md-on-surface-variant)' }">
        {{ uiStore.confirmDialog.message }}
      </p>
      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          @click="uiStore.closeConfirm()"
          class="px-4 py-2 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
        >
          取消
        </button>
        <button
          type="button"
          data-testid="confirm-dialog-accept"
          @click="uiStore.confirmDialog.onConfirm?.(); uiStore.closeConfirm()"
          class="px-4 py-2 rounded-full text-xs font-semibold prism-press"
          :style="{
            backgroundColor: uiStore.confirmDialog.destructive ? 'var(--md-error)' : 'var(--md-primary)',
            color: uiStore.confirmDialog.destructive ? 'var(--md-on-error)' : 'var(--md-on-primary)'
          }"
        >
          {{ uiStore.confirmDialog.confirmLabel }}
        </button>
      </div>
    </div>
  </div>

  <!-- Save Before Switch / Replace Prompt Dialog -->
  <div
    v-if="uiStore.savePromptDialog?.open"
    data-no-site-edit="true"
    data-site-edit-ui="true"
    @click.self="uiStore.savePromptDialog?.onCancel ? uiStore.savePromptDialog.onCancel() : uiStore.closeSavePrompt()"
    class="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm no-print"
  >
    <div
      data-testid="archive-save-prompt-dialog"
      class="w-full max-w-md rounded-[28px] p-6 space-y-4 shadow-2xl"
      :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }"
      role="alertdialog"
      aria-modal="true"
    >
      <h3 class="text-base font-bold">{{ uiStore.savePromptDialog.title }}</h3>
      <p class="text-xs leading-relaxed" :style="{ color: 'var(--md-on-surface-variant)' }">
        {{ uiStore.savePromptDialog.message }}
      </p>
      <div class="flex flex-wrap justify-end gap-2 pt-1">
        <button
          type="button"
          data-testid="save-prompt-cancel"
          @click="uiStore.savePromptDialog.onCancel ? uiStore.savePromptDialog.onCancel() : uiStore.closeSavePrompt()"
          class="px-4 py-2 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
        >
          {{ uiStore.savePromptDialog.cancelLabel }}
        </button>
        <button
          type="button"
          data-testid="save-prompt-discard"
          @click="void uiStore.savePromptDialog.onDiscardAndContinue()"
          class="px-4 py-2 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-error)' }"
        >
          {{ uiStore.savePromptDialog.discardLabel }}
        </button>
        <button
          type="button"
          data-testid="save-prompt-confirm"
          @click="void uiStore.savePromptDialog.onSaveAndContinue()"
          class="px-4 py-2 rounded-full text-xs font-bold prism-press"
          :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
        >
          {{ uiStore.savePromptDialog.saveLabel }}
        </button>
      </div>
    </div>
  </div>

  <!-- Sing-Along ("跟唱") Input Dialog -->
  <div
    v-if="uiStore.singAlongPrompt.open"
    data-no-site-edit="true"
    data-site-edit-ui="true"
    data-testid="sing-along-dialog"
    @click.self="uiStore.closeSingAlongPrompt()"
    class="fixed inset-0 z-[92] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm no-print"
  >
    <form
      @submit.prevent="submitSingAlong"
      class="w-full max-w-sm rounded-[28px] p-6 space-y-4 shadow-2xl"
      :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }"
      role="dialog"
      aria-modal="true"
    >
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full shrink-0" style="background-color: #EC4899" />
        <h3 class="text-base font-bold">
          {{ uiStore.singAlongPrompt.tagIndex !== null ? '编辑跟唱部分' : '输入跟唱部分' }}
        </h3>
      </div>
      <p class="text-xs leading-relaxed" :style="{ color: 'var(--md-on-surface-variant)' }">
        请输入需要观众/同好一起跟唱的歌词或旋律片段，确认后将显示在「跟唱」徽章与导出速查卡中。
      </p>
      <input
        ref="singAlongInputRef"
        v-model="singAlongDraft"
        data-testid="sing-along-input"
        type="text"
        placeholder="例如：La la la~ / 副歌跟唱句"
        class="w-full px-3.5 py-2.5 text-sm rounded-2xl border focus:outline-none"
        :style="{
          backgroundColor: 'var(--fc-block)',
          color: 'var(--md-on-surface)',
          borderColor: 'var(--md-outline-variant)'
        }"
      />
      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          data-testid="sing-along-cancel"
          @click="uiStore.closeSingAlongPrompt()"
          class="px-4 py-2 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
        >
          取消
        </button>
        <button
          type="submit"
          data-testid="sing-along-confirm"
          :disabled="!singAlongDraft.trim()"
          class="px-4 py-2 rounded-full text-xs font-bold prism-press disabled:opacity-45"
          :style="{ backgroundColor: '#EC4899', color: '#FFFFFF' }"
        >
          确认跟唱
        </button>
      </div>
    </form>
  </div>

  <!-- Custom Preset Right-Click Context Menu -->
  <div
    v-if="uiStore.presetContextMenu.open && contextPreset"
    data-no-site-edit="true"
    data-site-edit-ui="true"
    @click="uiStore.closePresetContextMenu()"
    @contextmenu.prevent="uiStore.closePresetContextMenu()"
    class="fixed inset-0 z-[94] no-print"
  >
    <div
      data-testid="preset-context-menu"
      @click.stop
      class="fixed w-48 rounded-2xl p-1.5 shadow-2xl border space-y-1"
      :style="{
        ...contextMenuPosition,
        backgroundColor: 'var(--fc-card)',
        color: 'var(--md-on-surface)',
        borderColor: 'var(--md-outline-variant)'
      }"
      role="menu"
    >
      <div
        class="px-3 py-1.5 flex items-center gap-2 text-[11px] font-bold border-b"
        :style="{ borderColor: 'var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }"
      >
        <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: contextPreset.color }" />
        <span class="truncate">{{ contextPreset.label }}</span>
      </div>
      <button
        type="button"
        data-testid="context-menu-edit-preset"
        @click="handleContextEdit"
        class="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center gap-2 hover:opacity-90 prism-press"
        :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
        role="menuitem"
      >
        <Edit3 class="w-3.5 h-3.5" :style="{ color: 'var(--md-primary)' }" />
        <span>修改名称 / 颜色</span>
      </button>
      <button
        type="button"
        data-testid="context-menu-delete-preset"
        @click="handleContextDelete"
        class="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center gap-2 hover:opacity-90 prism-press"
        :style="{ backgroundColor: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }"
        role="menuitem"
      >
        <Trash2 class="w-3.5 h-3.5" />
        <span>删除自定义标签</span>
      </button>
    </div>
  </div>

  <!-- Edit Custom Preset Modal -->
  <div
    v-if="uiStore.editPresetDialog.open"
    data-no-site-edit="true"
    data-site-edit-ui="true"
    data-testid="edit-preset-dialog"
    @click.self="uiStore.closeEditPresetDialog()"
    class="fixed inset-0 z-[96] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm no-print"
  >
    <form
      @submit.prevent="submitEditPreset"
      class="w-full max-w-sm rounded-[28px] p-6 space-y-4 shadow-2xl"
      :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }"
      role="dialog"
      aria-modal="true"
    >
      <h3 class="text-base font-bold">修改自定义标签</h3>
      <div>
        <label class="block text-[11px] font-semibold mb-1.5" :style="{ color: 'var(--md-on-surface-variant)' }">
          标签名称
        </label>
        <input
          ref="editPresetInputRef"
          v-model="editPresetLabelDraft"
          data-testid="edit-preset-label-input"
          type="text"
          required
          placeholder="输入新的标签名称"
          class="w-full px-3.5 py-2 text-sm rounded-2xl border focus:outline-none"
          :style="{
            backgroundColor: 'var(--fc-block)',
            color: 'var(--md-on-surface)',
            borderColor: 'var(--md-outline-variant)'
          }"
        />
      </div>
      <div>
        <label class="block text-[11px] font-semibold mb-2" :style="{ color: 'var(--md-on-surface-variant)' }">
          徽章颜色
        </label>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="hex in COLOR_PALETTE"
            :key="hex"
            type="button"
            @click="editPresetColorDraft = hex"
            class="w-7 h-7 rounded-full transition-transform active:scale-95"
            :style="{
              backgroundColor: hex,
              boxShadow:
                editPresetColorDraft.toUpperCase() === hex.toUpperCase()
                  ? '0 0 0 2px var(--fc-card), 0 0 0 4px var(--md-primary)'
                  : 'none'
            }"
            :aria-label="`选择颜色 ${hex}`"
          />
          <input
            v-model="editPresetColorDraft"
            data-testid="edit-preset-color-input"
            type="color"
            class="w-8 h-8 rounded-lg cursor-pointer bg-transparent"
            title="自定义颜色"
          />
        </div>
      </div>
      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          @click="uiStore.closeEditPresetDialog()"
          class="px-4 py-2 rounded-full text-xs font-semibold prism-press"
          :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
        >
          取消
        </button>
        <button
          type="submit"
          data-testid="edit-preset-save"
          :disabled="!editPresetLabelDraft.trim()"
          class="px-4 py-2 rounded-full text-xs font-bold prism-press disabled:opacity-45"
          :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
        >
          保存修改
        </button>
      </div>
    </form>
  </div>
</template>
