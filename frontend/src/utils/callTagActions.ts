import { SING_ALONG_PRESET_ID } from '../data/presets'
import { useCallbookStore } from '../stores/callbookStore'
import { useUiStore } from '../stores/uiStore'
import type { CallPreset } from '../types/callbook'

export function triggerCallPresetForLine(opts: {
  presetId: string
  lineId?: string
  autoAdvance?: boolean
}): void {
  const store = useCallbookStore()
  const uiStore = useUiStore()

  const targetLine = opts.lineId
    ? store.project.lines.find((l) => l.id === opts.lineId)
    : store.resolveLineForQuickTag()

  if (!targetLine) {
    store.setStatus('暂无可打标的歌词行')
    return
  }

  store.activeLineId = targetLine.id

  if (opts.presetId === SING_ALONG_PRESET_ID) {
    const alreadyTagged = targetLine.calls.some((c) => c.presetId === SING_ALONG_PRESET_ID)
    if (alreadyTagged) {
      store.toggleLineCall(targetLine.id, SING_ALONG_PRESET_ID)
      return
    }
    uiStore.openSingAlongPrompt({
      lineId: targetLine.id,
      autoAdvance: Boolean(opts.autoAdvance),
      onConfirm: (text: string) => {
        const clean = text.trim()
        if (!clean) return
        const stillExists = targetLine.calls.some((c) => c.presetId === SING_ALONG_PRESET_ID)
        if (stillExists) {
          const idx = targetLine.calls.findIndex((c) => c.presetId === SING_ALONG_PRESET_ID)
          if (idx >= 0) store.updateLineCallSuffix(targetLine.id, idx, clean)
        } else {
          const added = store.toggleLineCall(targetLine.id, SING_ALONG_PRESET_ID, clean)
          if (added && opts.autoAdvance) {
            store.stepActiveLine(1)
          }
        }
      }
    })
    return
  }

  const added = store.toggleLineCall(targetLine.id, opts.presetId)
  if (added && opts.autoAdvance) {
    store.stepActiveLine(1)
  }
}

export function openCustomPresetContextMenu(e: MouseEvent | { clientX: number; clientY: number }, preset: CallPreset): void {
  if (preset.builtIn) return
  if ('preventDefault' in e) {
    e.preventDefault()
    e.stopPropagation()
  }
  const uiStore = useUiStore()
  uiStore.openPresetContextMenu(preset.id, e.clientX, e.clientY)
}

export function requestDeleteCustomPresetWithConfirm(preset: CallPreset): void {
  if (preset.builtIn) return
  const store = useCallbookStore()
  const uiStore = useUiStore()
  const usedCount = store.project.lines.filter((l) =>
    l.calls.some((c) => c.presetId === preset.id)
  ).length
  const usageNote =
    usedCount > 0 ? `（当前已挂载于 ${usedCount} 句歌词，删除后将同步移除对应徽章）` : ''
  uiStore.openConfirm({
    title: '删除自定义标签',
    message: `确定要删除自定义标签「${preset.label}」吗？${usageNote}`,
    confirmLabel: '确认删除',
    destructive: true,
    onConfirm: () => store.deleteCustomPreset(preset.id)
  })
}
