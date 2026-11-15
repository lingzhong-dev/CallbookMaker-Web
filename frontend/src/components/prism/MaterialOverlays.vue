<script setup lang="ts">
import { Sparkles, X } from 'lucide-vue-next'
import AudioSourcePanel from '../AudioSourcePanel.vue'
import { useCallbookStore } from '../../stores/callbookStore'
import { useThemeStore } from '../../stores/themeStore'
import { useUiStore } from '../../stores/uiStore'

const store = useCallbookStore()
const uiStore = useUiStore()
const themeStore = useThemeStore()
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
</template>
