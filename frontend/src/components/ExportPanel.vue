<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Download, FileSpreadsheet, Image, Printer, Upload, X } from 'lucide-vue-next'
import { useCallbookStore } from '../stores/callbookStore'
import { runWithArchiveSavePrompt } from '../utils/archiveGuard'
import { printCallBookPdf } from '../utils/exportPdf'
import PrismSwitch from './prism/PrismSwitch.vue'
import QuickRefCard from './QuickRefCard.vue'

type PendingExportType = 'png' | 'excel' | 'pdf'

const store = useCallbookStore()
const exportCaptureRef = ref<HTMLElement | null>(null)
const exportQuickRefRef = ref<InstanceType<typeof QuickRefCard> | null>(null)
const exportingPng = ref(false)
const exportingXlsx = ref(false)
const isCapturingPng = ref(false)

const exportDialogOpen = ref(false)
const pendingExportType = ref<PendingExportType | null>(null)
const isConfirmingExport = ref(false)

const draftMeta = ref({
  editorName: '',
  editorNote: '',
  composer: '',
  lyricist: '',
  vocalist: '',
  showTuner: false,
  tuner: ''
})

const pendingFormatLabel = computed(() => {
  switch (pendingExportType.value) {
    case 'png':
      return 'PNG 速查长图'
    case 'excel':
      return 'Excel (.xlsx)'
    case 'pdf':
      return 'A4 矢量 PDF'
    default:
      return ''
  }
})

function openExportPrompt(type: PendingExportType): void {
  const meta = store.project.meta
  draftMeta.value = {
    editorName: meta.editorName ?? '',
    editorNote: meta.editorNote ?? '',
    composer: meta.composer ?? '',
    lyricist: meta.lyricist ?? '',
    vocalist: meta.vocalist?.trim() || meta.artist || '',
    showTuner: Boolean(meta.showTuner),
    tuner: meta.tuner ?? ''
  }
  pendingExportType.value = type
  exportDialogOpen.value = true
}

function closeExportDialog(): void {
  if (isConfirmingExport.value) return
  exportDialogOpen.value = false
  pendingExportType.value = null
}

async function runExportPng(): Promise<void> {
  exportingPng.value = true
  isCapturingPng.value = true
  try {
    await nextTick()
    if (typeof document !== 'undefined' && 'fonts' in document) {
      await document.fonts.ready
    }
    await exportQuickRefRef.value?.measureCallColumnWidth()
    await nextTick()
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
    if (!exportCaptureRef.value) {
      throw new Error('未能初始化离屏导出画布')
    }
    const { exportQuickRefPng } = await import('../utils/exportPng')
    await exportQuickRefPng(exportCaptureRef.value, store.project.meta.title)
    store.setStatus('PNG 速查长图已导出')
  } catch (err) {
    store.setStatus(err instanceof Error ? `PNG 导出失败：${err.message}` : 'PNG 导出失败')
  } finally {
    isCapturingPng.value = false
    exportingPng.value = false
  }
}

async function runExportExcel(): Promise<void> {
  exportingXlsx.value = true
  try {
    const { exportCallBookExcel } = await import('../utils/exportExcel')
    await exportCallBookExcel(store.project, store.allPresets, store.displayLayers)
    store.setStatus('Excel (.xlsx) 已导出')
  } catch (err) {
    store.setStatus(err instanceof Error ? `Excel 导出失败：${err.message}` : 'Excel 导出失败')
  } finally {
    exportingXlsx.value = false
  }
}

function handlePrintPdf(): void {
  printCallBookPdf(store.project.meta.title)
}

async function confirmAndExport(): Promise<void> {
  const targetType = pendingExportType.value
  if (!targetType || isConfirmingExport.value) return

  isConfirmingExport.value = true
  try {
    store.updateMeta({
      editorName: draftMeta.value.editorName.trim(),
      editorNote: draftMeta.value.editorNote.trim(),
      composer: draftMeta.value.composer.trim(),
      lyricist: draftMeta.value.lyricist.trim(),
      vocalist: draftMeta.value.vocalist.trim(),
      showTuner: draftMeta.value.showTuner,
      tuner: draftMeta.value.tuner.trim()
    })

    exportDialogOpen.value = false
    pendingExportType.value = null

    await nextTick()
    if (typeof document !== 'undefined' && 'fonts' in document) {
      await document.fonts.ready
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )

    if (targetType === 'png') {
      await runExportPng()
    } else if (targetType === 'excel') {
      await runExportExcel()
    } else {
      handlePrintPdf()
    }
  } finally {
    isConfirmingExport.value = false
  }
}

function handleImportJson(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      const content = reader.result
      runWithArchiveSavePrompt({
        actionLabel: '导入 JSON 工程',
        targetLabel: file.name,
        onProceed: () => {
          store.importProjectJson(content)
        }
      })
    }
  }
  reader.readAsText(file)
  input.value = ''
}
</script>

<template>
  <div class="space-y-4">
    <!-- FlClash Export Actions Card -->
    <section class="fc-card p-5 space-y-3.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-bold">速查卡与多格式导出</h3>
          <p class="text-[11px]" :style="{ color: 'var(--md-on-surface-variant)' }">
            支持无水印高清 PNG、结构化 Excel 表、A4 矢量 PDF 与 JSON 工程备份
          </p>
        </div>

        <div class="flex items-center gap-2 text-xs">
          <button
            type="button"
            @click="store.exportProjectJson()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold prism-press"
            :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
          >
            <Download class="w-3.5 h-3.5" />
            <span>导出 JSON</span>
          </button>
          <label
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold cursor-pointer prism-press"
            :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
          >
            <Upload class="w-3.5 h-3.5" />
            <span>导入工程</span>
            <input type="file" accept=".json,application/json" class="hidden" @change="handleImportJson" />
          </label>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          type="button"
          data-testid="export-png-btn"
          :disabled="exportingPng"
          @click="openExportPrompt('png')"
          class="h-11 inline-flex items-center justify-center gap-2 px-4 rounded-2xl text-xs font-bold disabled:opacity-50 prism-press shadow-sm"
          :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
        >
          <Image class="w-4 h-4" />
          <span>{{ exportingPng ? '导出中...' : '生成 PNG 速查长图' }}</span>
        </button>

        <button
          type="button"
          data-testid="export-excel-btn"
          :disabled="exportingXlsx"
          @click="openExportPrompt('excel')"
          class="h-11 inline-flex items-center justify-center gap-2 px-4 rounded-2xl text-xs font-bold disabled:opacity-50 prism-press"
          :style="{ backgroundColor: 'var(--md-success-container)', color: 'var(--md-on-success-container)' }"
        >
          <FileSpreadsheet class="w-4 h-4" />
          <span>{{ exportingXlsx ? '生成中...' : '导出 Excel (.xlsx)' }}</span>
        </button>

        <button
          type="button"
          data-testid="export-pdf-btn"
          @click="openExportPrompt('pdf')"
          class="h-11 inline-flex items-center justify-center gap-2 px-4 rounded-2xl text-xs font-bold prism-press"
          :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
        >
          <Printer class="w-4 h-4" />
          <span>打印 / 导出矢量 PDF</span>
        </button>
      </div>
    </section>

    <!-- Live Quick-Ref Card Paper Preview -->
    <div class="fc-card p-2 sm:p-3 overflow-x-auto">
      <div class="bg-white rounded-[22px] overflow-hidden">
        <QuickRefCard compact />
      </div>
    </div>

    <!-- Offscreen Resolution-Independent Capture Host for PNG Export -->
    <Teleport to="body">
      <div
        v-if="isCapturingPng"
        aria-hidden="true"
        data-no-site-edit="true"
        class="fixed top-0 left-[-100000px] pointer-events-none select-none no-print"
        style="width: max-content; max-width: none;"
      >
        <div
          ref="exportCaptureRef"
          data-testid="quickref-export-capture"
          class="bg-white text-slate-900 rounded-[22px] overflow-hidden"
          style="width: max-content; max-width: none; min-width: 760px;"
        >
          <QuickRefCard ref="exportQuickRefRef" export-layout />
        </div>
      </div>
    </Teleport>

    <!-- Material 3 Pre-Export Editor & Credits Prompt Dialog -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="exportDialogOpen"
        data-testid="export-meta-dialog"
        data-no-site-edit="true"
        @click.self="closeExportDialog"
        @keydown.escape.window="closeExportDialog"
        class="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45 backdrop-blur-sm no-print"
        role="dialog"
        aria-modal="true"
        aria-label="确认编者与署名信息"
      >
        <div
          class="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] p-5 sm:p-6 space-y-4 shadow-2xl"
          :style="{ backgroundColor: 'var(--fc-card)', color: 'var(--md-on-surface)' }"
          @keydown.stop
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold">导出前确认编者与曲目署名</h3>
                <span
                  v-if="pendingFormatLabel"
                  class="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                  :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
                >
                  {{ pendingFormatLabel }}
                </span>
              </div>
              <p class="text-xs" :style="{ color: 'var(--md-on-surface-variant)' }">
                确认后将立即同步至速查卡与导出文件
              </p>
            </div>
            <button
              type="button"
              @click="closeExportDialog"
              class="w-9 h-9 rounded-full flex items-center justify-center prism-press shrink-0"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }"
              aria-label="关闭导出确认弹窗"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- Primary Editor Info -->
          <div class="space-y-3">
            <div class="space-y-1">
              <label class="block text-xs font-semibold" :style="{ color: 'var(--md-on-surface)' }">
                编者
              </label>
              <input
                v-model="draftMeta.editorName"
                data-testid="export-editor-name-input"
                type="text"
                placeholder="请输入编者署名（你的圈名/cn）"
                class="w-full px-3.5 py-2 rounded-2xl text-xs border focus:outline-none focus:ring-2"
                :style="{
                  backgroundColor: 'var(--fc-block)',
                  borderColor: 'var(--md-outline-variant)',
                  color: 'var(--md-on-surface)'
                }"
              />
            </div>

            <div class="space-y-1">
              <label class="block text-xs font-semibold" :style="{ color: 'var(--md-on-surface)' }">
                编者语
              </label>
              <textarea
                v-model="draftMeta.editorNote"
                data-testid="export-editor-note-input"
                rows="3"
                placeholder="写给现场打 Call 同好的备注、切拍提示或寄语..."
                class="w-full px-3.5 py-2 rounded-2xl text-xs border resize-none focus:outline-none focus:ring-2"
                :style="{
                  backgroundColor: 'var(--fc-block)',
                  borderColor: 'var(--md-outline-variant)',
                  color: 'var(--md-on-surface)'
                }"
              />
            </div>
          </div>

          <!-- Credits Review / Optional Tuner Toggle -->
          <div
            class="rounded-2xl p-3.5 space-y-3 border"
            :style="{ backgroundColor: 'var(--fc-block)', borderColor: 'var(--md-outline-variant)' }"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold">曲目署名确认</span>
              <div class="flex items-center gap-2">
                <span class="text-[11px] font-medium" :style="{ color: 'var(--md-on-surface-variant)' }">
                  添加调教
                </span>
                <PrismSwitch
                  v-model="draftMeta.showTuner"
                  data-testid="export-show-tuner-switch"
                  label="添加调教"
                  compact
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div class="space-y-1">
                <label class="block text-[11px] font-medium" :style="{ color: 'var(--md-on-surface-variant)' }">
                  作曲
                </label>
                <input
                  v-model="draftMeta.composer"
                  data-testid="export-composer-input"
                  type="text"
                  placeholder="作曲者"
                  class="w-full px-3 py-1.5 rounded-xl text-xs border focus:outline-none"
                  :style="{
                    backgroundColor: 'var(--fc-card)',
                    borderColor: 'var(--md-outline-variant)',
                    color: 'var(--md-on-surface)'
                  }"
                />
              </div>

              <div class="space-y-1">
                <label class="block text-[11px] font-medium" :style="{ color: 'var(--md-on-surface-variant)' }">
                  作词
                </label>
                <input
                  v-model="draftMeta.lyricist"
                  data-testid="export-lyricist-input"
                  type="text"
                  placeholder="作词者"
                  class="w-full px-3 py-1.5 rounded-xl text-xs border focus:outline-none"
                  :style="{
                    backgroundColor: 'var(--fc-card)',
                    borderColor: 'var(--md-outline-variant)',
                    color: 'var(--md-on-surface)'
                  }"
                />
              </div>

              <div class="space-y-1">
                <label class="block text-[11px] font-medium" :style="{ color: 'var(--md-on-surface-variant)' }">
                  演唱
                </label>
                <input
                  v-model="draftMeta.vocalist"
                  data-testid="export-vocalist-input"
                  type="text"
                  placeholder="演唱者"
                  class="w-full px-3 py-1.5 rounded-xl text-xs border focus:outline-none"
                  :style="{
                    backgroundColor: 'var(--fc-card)',
                    borderColor: 'var(--md-outline-variant)',
                    color: 'var(--md-on-surface)'
                  }"
                />
              </div>
            </div>

            <div v-if="draftMeta.showTuner" class="space-y-1">
              <label class="block text-[11px] font-medium" :style="{ color: 'var(--md-on-surface-variant)' }">
                调教
              </label>
              <input
                v-model="draftMeta.tuner"
                data-testid="export-tuner-input"
                type="text"
                placeholder="请输入调教作者"
                class="w-full px-3 py-1.5 rounded-xl text-xs border focus:outline-none"
                :style="{
                  backgroundColor: 'var(--fc-card)',
                  borderColor: 'var(--md-outline-variant)',
                  color: 'var(--md-on-surface)'
                }"
              />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              :disabled="isConfirmingExport"
              @click="closeExportDialog"
              class="px-4 py-2 rounded-full text-xs font-semibold prism-press disabled:opacity-50"
              :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="confirm-export-btn"
              :disabled="isConfirmingExport"
              @click="confirmAndExport"
              class="px-5 py-2 rounded-full text-xs font-bold prism-press disabled:opacity-50 shadow-sm"
              :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
            >
              {{ isConfirmingExport ? '准备导出...' : '确认并导出' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
