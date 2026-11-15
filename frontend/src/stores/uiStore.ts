import { ref } from 'vue'
import { defineStore } from 'pinia'

export type NavRoute = 'dashboard' | 'export' | 'theme'

export const useUiStore = defineStore('flclashUi', () => {
  const activeRoute = ref<NavRoute>('dashboard')
  const showSourceModal = ref(false)
  const showQuickTagSheet = ref(false)
  const confirmDialog = ref<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    destructive?: boolean
    onConfirm?: () => void
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: '确认'
  })

  // Gaussian sparkline samples for FlClash-style telemetry cards (tempo pulse + call energy)
  const beatPulseSeries = ref<number[]>(Array.from({ length: 28 }, (_, i) => (i % 4 === 0 ? 0.55 : 0.16)))
  const callDensitySeries = ref<number[]>(Array.from({ length: 28 }, () => 0.22))

  function pushBeatSample(isAccent: boolean, bpm: number): void {
    const normalized = Math.min(1, Math.max(0.15, (bpm / 220) * (isAccent ? 0.95 : 0.58)))
    beatPulseSeries.value = [...beatPulseSeries.value.slice(1), normalized]
  }

  function refreshCallDensitySeries(counts: number[]): void {
    if (counts.length === 0) {
      callDensitySeries.value = Array.from({ length: 28 }, () => 0.12)
      return
    }
    const maxVal = Math.max(2, ...counts)
    const targetLen = 28
    const out: number[] = []
    for (let i = 0; i < targetLen; i++) {
      const idx = Math.min(counts.length - 1, Math.floor((i / targetLen) * counts.length))
      out.push(0.12 + (counts[idx] / maxVal) * 0.88)
    }
    callDensitySeries.value = out
  }

  function openConfirm(opts: {
    title: string
    message: string
    confirmLabel?: string
    destructive?: boolean
    onConfirm: () => void
  }): void {
    confirmDialog.value = {
      open: true,
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? '确认',
      destructive: opts.destructive,
      onConfirm: opts.onConfirm
    }
  }

  function closeConfirm(): void {
    confirmDialog.value.open = false
  }

  const showArchiveMenu = ref(false)
  const savePromptDialog = ref<{
    open: boolean
    title: string
    message: string
    saveLabel: string
    discardLabel: string
    cancelLabel: string
    onSaveAndContinue: () => void | Promise<void>
    onDiscardAndContinue: () => void | Promise<void>
    onCancel?: () => void
  } | null>(null)

  function openSavePrompt(opts: {
    title: string
    message: string
    saveLabel?: string
    discardLabel?: string
    cancelLabel?: string
    onSaveAndContinue: () => void | Promise<void>
    onDiscardAndContinue: () => void | Promise<void>
    onCancel?: () => void
  }): void {
    savePromptDialog.value = {
      open: true,
      title: opts.title,
      message: opts.message,
      saveLabel: opts.saveLabel ?? '保存并继续',
      discardLabel: opts.discardLabel ?? '不保存，直接替换',
      cancelLabel: opts.cancelLabel ?? '取消',
      onSaveAndContinue: opts.onSaveAndContinue,
      onDiscardAndContinue: opts.onDiscardAndContinue,
      onCancel: opts.onCancel
    }
  }

  function closeSavePrompt(): void {
    savePromptDialog.value = null
  }

  return {
    activeRoute,
    showSourceModal,
    showQuickTagSheet,
    showArchiveMenu,
    confirmDialog,
    savePromptDialog,
    beatPulseSeries,
    callDensitySeries,
    pushBeatSample,
    refreshCallDensitySeries,
    openConfirm,
    closeConfirm,
    openSavePrompt,
    closeSavePrompt
  }
})
