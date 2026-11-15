import { useCallbookStore } from '../stores/callbookStore'
import { useUiStore } from '../stores/uiStore'

export function runWithArchiveSavePrompt(opts: {
  actionLabel: string
  targetLabel?: string
  onProceed: () => void | Promise<void>
}): void {
  const store = useCallbookStore()
  const ui = useUiStore()
  if (!store.needsSavePromptBeforeSwitch) {
    void opts.onProceed()
    return
  }

  const currentName =
    store.activeArchiveEntry?.name || store.project.meta.title.trim() || '当前 Call 本'
  const reasonHint = store.hasFetchedExternalLyrics
    ? `你已拉取/导入「${currentName}」的歌词，尚未保存至 Call 本存档。`
    : `当前 Call 本「${currentName}」包含尚未保存至存档的修改。`
  const targetHint = opts.targetLabel ? `（目标：${opts.targetLabel}）` : ''

  ui.openSavePrompt({
    title: `保存当前 Call 本再${opts.actionLabel}？`,
    message: `${reasonHint}在${opts.actionLabel}${targetHint}之前，是否先将当前 Call 本存入存档？`,
    saveLabel: store.activeArchiveId ? '更新存档并继续' : '保存至存档并继续',
    discardLabel: '不保存，直接替换',
    cancelLabel: '取消',
    onSaveAndContinue: async () => {
      store.saveCurrentToArchive()
      ui.closeSavePrompt()
      await opts.onProceed()
    },
    onDiscardAndContinue: async () => {
      ui.closeSavePrompt()
      await opts.onProceed()
    },
    onCancel: () => {
      ui.closeSavePrompt()
    }
  })
}
