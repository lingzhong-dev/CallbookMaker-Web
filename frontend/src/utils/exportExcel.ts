import ExcelJS from 'exceljs'
import { resolveAlertTargetLineId } from '../storage/projectStorage'
import type { CallPreset, CallProject, DisplayLayers, GtAlert, LyricLine } from '../types/callbook'
import { getLineKind, isSectionLine, SECTION_TITLES, type SectionKind } from './sectionDetector'

const DEFAULT_DISPLAY_LAYERS: DisplayLayers = {
  showRuby: true,
  showRomaji: false,
  showTranslation: true
}

function stripHtml(html: string): string {
  return html
    .replace(/<rt>(.*?)<\/rt>/gi, '($1)')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function safeFilename(name: string): string {
  return (name || 'live-call-book')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 64)
}

function isWideExcelChar(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
    (codePoint >= 0x3040 && codePoint <= 0x33ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    codePoint >= 0x1f000
  )
}

function measureExcelLineWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (isWideExcelChar(cp)) {
      width += 2.25
    } else if (
      (cp >= 0x41 && cp <= 0x5a) ||
      ch === '@' ||
      ch === 'W' ||
      ch === 'M' ||
      ch === '×'
    ) {
      width += 1.3
    } else {
      width += 1.1
    }
  }
  return width
}

function measureExcelMaxLineWidth(text: string): number {
  if (!text) return 0
  let max = 0
  for (const line of text.split(/\r?\n/)) {
    const w = measureExcelLineWidth(line)
    if (w > max) max = w
  }
  return max
}

function estimateWrappedLines(text: string, availableColWidth: number): number {
  if (!text) return 1
  const usable = Math.max(8, availableColWidth - 4)
  let total = 0
  for (const rawLine of text.split(/\r?\n/)) {
    const w = measureExcelLineWidth(rawLine)
    total += Math.max(1, Math.ceil(w / usable))
  }
  return Math.max(1, total)
}

function computeRowHeightPt(entries: Array<{ text: string; width: number }>): number {
  let maxLines = 1
  for (const { text, width } of entries) {
    if (!text) continue
    const lines = estimateWrappedLines(text, width)
    if (lines > maxLines) maxLines = lines
  }
  return Math.max(25, maxLines * 20 + 8)
}

function clampWidth(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.ceil(val)))
}

function buildAlertByLineMap(project: CallProject): Map<string, GtAlert> {
  const map = new Map<string, GtAlert>()
  const sortedLines = [...project.lines].sort((a, b) => a.startTimeMs - b.startTimeMs)
  if (sortedLines.length === 0) return map

  const lineIds = new Set(sortedLines.map((l) => l.id))
  const claimed = new Set<string>()
  const sortedAlerts = [...project.alerts].sort((a, b) => a.triggerTimeMs - b.triggerTimeMs)

  for (const alert of sortedAlerts) {
    if (alert.targetLineId && lineIds.has(alert.targetLineId) && !map.has(alert.targetLineId)) {
      map.set(alert.targetLineId, alert)
      claimed.add(alert.targetLineId)
    }
  }

  for (const alert of sortedAlerts) {
    if (alert.targetLineId && lineIds.has(alert.targetLineId)) continue
    const resolvedId = resolveAlertTargetLineId(alert, sortedLines, claimed)
    if (resolvedId && !map.has(resolvedId)) {
      map.set(resolvedId, alert)
      claimed.add(resolvedId)
    }
  }

  return map
}

function formatLineCallsAndMix(line: LyricLine, presetMap: Map<string, CallPreset>): string {
  const parts = line.calls.map((tag) => {
    const preset = presetMap.get(tag.presetId)
    const label = preset ? preset.label : tag.presetId
    return tag.suffix ? `${label} ${tag.suffix}` : label
  })
  if (line.customShout?.trim()) {
    parts.push(line.customShout.trim())
  }
  return parts.length > 0 ? `（${parts.join(' / ')}）` : ''
}

function formatLineText(line: LyricLine): string {
  if (isSectionLine(line)) {
    const kind = getLineKind(line) as SectionKind
    return SECTION_TITLES[kind]
  }
  return line.text.original
}

function formatDetailAuxText(line: LyricLine, layers: DisplayLayers): string {
  if (isSectionLine(line)) return ''
  const aux: string[] = []
  if (layers.showRuby && line.text.ruby?.trim()) {
    aux.push(stripHtml(line.text.ruby))
  }
  if (layers.showRomaji && line.text.romaji?.trim()) {
    aux.push(line.text.romaji.trim())
  }
  if (layers.showTranslation && line.text.translation?.trim()) {
    aux.push(line.text.translation.trim())
  }
  return aux.join(' / ')
}

interface ExcelRowPayload {
  colA: string
  colB: string
  colC: string
  colD: string
}

function buildRowPayloads(
  sortedLines: LyricLine[],
  presetMap: Map<string, CallPreset>,
  alertByLineId: Map<string, GtAlert>,
  detailed: boolean,
  layers: DisplayLayers
): ExcelRowPayload[] {
  return sortedLines.map((line) => {
    const colA = formatLineCallsAndMix(line, presetMap)
    const colB = formatLineText(line)
    const matchedAlert = alertByLineId.get(line.id)

    let colC = ''
    if (detailed) {
      const parts: string[] = []
      if (matchedAlert) {
        const details = [
          matchedAlert.callTimingCue?.trim() ? `时机: ${matchedAlert.callTimingCue.trim()}` : '',
          matchedAlert.note?.trim() || ''
        ].filter(Boolean)
        parts.push(details.length > 0 ? `（GT警报） ${details.join(' | ')}` : '（GT警报）')
      }
      if (line.tailUpdraft) {
        parts.push('（尾句上升气流）')
      }
      colC = parts.join('')
    } else {
      const parts: string[] = []
      if (matchedAlert) parts.push('（GT警报）')
      if (line.tailUpdraft) parts.push('（尾句上升气流）')
      colC = parts.join('')
    }

    const colD = detailed ? formatDetailAuxText(line, layers) : ''
    return { colA, colB, colC, colD }
  })
}

function computeSheetColWidths(
  project: CallProject,
  payloads: ExcelRowPayload[],
  detailed: boolean
): [number, number, number, number] {
  const meta = project.meta
  const tunerEnabled =
    meta.showTuner === true || (meta.showTuner === undefined && Boolean(meta.tuner?.trim()))

  const titleText = meta.title?.trim() || '未命名 Call 本'
  const editorText = `编者：${meta.editorName?.trim() || ''}`
  const composerVal = meta.composer?.trim() || ''
  const lyricistVal = meta.lyricist?.trim() || ''
  const tunerVal = tunerEnabled ? meta.tuner?.trim() || '' : ''
  const vocalistVal = meta.vocalist?.trim() || meta.artist?.trim() || ''

  let maxA = 16
  let maxB = 30
  let maxC = 16
  let maxD = Math.max(
    measureExcelMaxLineWidth(composerVal),
    measureExcelMaxLineWidth(lyricistVal),
    measureExcelMaxLineWidth(tunerVal),
    measureExcelMaxLineWidth(vocalistVal)
  )

  for (const row of payloads) {
    maxA = Math.max(maxA, measureExcelMaxLineWidth(row.colA))
    maxB = Math.max(maxB, measureExcelMaxLineWidth(row.colB))
    maxC = Math.max(maxC, measureExcelMaxLineWidth(row.colC))
    if (detailed) {
      maxD = Math.max(maxD, measureExcelMaxLineWidth(row.colD))
    }
  }

  const wA = clampWidth(maxA + 6, 22, 68)
  let wB = clampWidth(maxB + 6, 38, 72)
  const wC = clampWidth(maxC + 6, detailed ? 26 : 22, 54)
  const wD = clampWidth(maxD + 6, detailed ? 28 : 18, detailed ? 68 : 48)

  const editorNeeded = measureExcelMaxLineWidth(editorText) + 6
  if (wA + wB < editorNeeded) {
    wB = Math.min(80, Math.ceil(editorNeeded - wA))
  }

  const titleNeeded = measureExcelMaxLineWidth(titleText) * 1.15 + 8
  const totalWidth = wA + wB + wC + wD
  if (totalWidth < titleNeeded) {
    wB = Math.min(88, Math.ceil(wB + (titleNeeded - totalWidth)))
  }

  return [wA, wB, wC, wD]
}

function populateHeaderBlock(
  sheet: ExcelJS.Worksheet,
  project: CallProject,
  colWidths: [number, number, number, number]
): void {
  const [wA, wB, , wD] = colWidths
  const totalWidth = colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]
  const meta = project.meta
  const tunerEnabled =
    meta.showTuner === true || (meta.showTuner === undefined && Boolean(meta.tuner?.trim()))

  const titleText = meta.title?.trim() || '未命名 Call 本'
  const editorText = `编者：${meta.editorName?.trim() || ''}`
  const noteText = `编者语：${meta.editorNote?.trim() || ''}`
  const composerVal = meta.composer?.trim() || ''
  const lyricistVal = meta.lyricist?.trim() || ''
  const tunerVal = tunerEnabled ? meta.tuner?.trim() || '' : ''
  const vocalistVal = meta.vocalist?.trim() || meta.artist?.trim() || ''

  sheet.mergeCells('A1:D1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = titleText
  titleCell.font = { name: 'Google Sans', size: 12, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

  sheet.mergeCells('A2:B2')
  const editorCell = sheet.getCell('A2')
  editorCell.value = editorText
  editorCell.font = { name: 'Google Sans', size: 11 }
  editorCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

  const c2 = sheet.getCell('C2')
  c2.value = '作曲：'
  c2.font = { name: 'Google Sans', size: 11 }
  c2.alignment = { horizontal: 'right', vertical: 'middle' }

  const d2 = sheet.getCell('D2')
  d2.value = composerVal
  d2.font = { name: 'Google Sans', size: 11 }
  d2.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

  sheet.mergeCells('A3:B5')
  const noteCell = sheet.getCell('A3')
  noteCell.value = noteText
  noteCell.font = { name: 'Google Sans', size: 11 }
  noteCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

  const c3 = sheet.getCell('C3')
  c3.value = '作词：'
  c3.font = { name: 'Google Sans', size: 11 }
  c3.alignment = { horizontal: 'right', vertical: 'middle' }

  const d3 = sheet.getCell('D3')
  d3.value = lyricistVal
  d3.font = { name: 'Google Sans', size: 11 }
  d3.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

  const c4 = sheet.getCell('C4')
  c4.value = tunerEnabled ? '调校：' : ''
  c4.font = { name: 'Google Sans', size: 11 }
  c4.alignment = { horizontal: 'right', vertical: 'middle' }

  const d4 = sheet.getCell('D4')
  d4.value = tunerVal
  d4.font = { name: 'Google Sans', size: 11 }
  d4.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

  const c5 = sheet.getCell('C5')
  c5.value = '演唱：'
  c5.font = { name: 'Google Sans', size: 11 }
  c5.alignment = { horizontal: 'right', vertical: 'middle' }

  const d5 = sheet.getCell('D5')
  d5.value = vocalistVal
  d5.font = { name: 'Google Sans', size: 11 }
  d5.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

  const titleLines = estimateWrappedLines(titleText, Math.max(20, (totalWidth - 4) * 0.85))
  sheet.getRow(1).height = Math.max(30, titleLines * 22 + 10)
  sheet.getRow(2).height = computeRowHeightPt([
    { text: editorText, width: wA + wB },
    { text: composerVal, width: wD }
  ])

  const h3 = computeRowHeightPt([{ text: lyricistVal, width: wD }])
  const h4 = computeRowHeightPt([{ text: tunerVal, width: wD }])
  const h5 = computeRowHeightPt([{ text: vocalistVal, width: wD }])
  const noteLines = estimateWrappedLines(noteText, wA + wB)
  const noteTotalNeeded = Math.max(75, noteLines * 20 + 12)
  const sum345 = h3 + h4 + h5
  const extraPerRow = sum345 < noteTotalNeeded ? Math.ceil((noteTotalNeeded - sum345) / 3) : 0

  sheet.getRow(3).height = h3 + extraPerRow
  sheet.getRow(4).height = h4 + extraPerRow
  sheet.getRow(5).height = h5 + extraPerRow
}

function appendCallbookRows(
  sheet: ExcelJS.Worksheet,
  payloads: ExcelRowPayload[],
  detailed: boolean,
  colWidths: [number, number, number, number]
): void {
  const [wA, wB, wC, wD] = colWidths
  for (const item of payloads) {
    const rowValues = detailed
      ? [item.colA, item.colB, item.colC, item.colD]
      : [item.colA, item.colB, item.colC]
    const row = sheet.addRow(rowValues)
    row.height = computeRowHeightPt([
      { text: item.colA, width: wA },
      { text: item.colB, width: wB },
      { text: item.colC, width: wC },
      ...(detailed ? [{ text: item.colD, width: wD }] : [])
    ])

    const cA = row.getCell(1)
    cA.font = { name: 'Google Sans', size: 11 }
    cA.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

    const cB = row.getCell(2)
    cB.font = { name: 'Google Sans', size: 11 }
    cB.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

    const cC = row.getCell(3)
    cC.font = { name: 'Google Sans', size: 11, color: { argb: 'FF66CCFF' } }
    cC.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true }

    if (detailed) {
      const cD = row.getCell(4)
      cD.font = { name: 'Google Sans', size: 11 }
      cD.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
    }
  }
}

export async function exportCallBookExcel(
  project: CallProject,
  presets: CallPreset[],
  displayLayers: DisplayLayers = DEFAULT_DISPLAY_LAYERS
): Promise<void> {
  const presetMap = new Map(presets.map((p) => [p.id, p]))
  const alertByLineId = buildAlertByLineMap(project)
  const sortedLines = [...project.lines].sort((a, b) => a.startTimeMs - b.startTimeMs)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = project.meta.editorName?.trim() || 'CallbookMaker'
  workbook.created = new Date()

  // Sheet 1: Callbook (matching 越冰船.xlsx: zero fills, Rows 1-5 metadata, Row 6+ A/B/C only)
  const sheet1Payloads = buildRowPayloads(sortedLines, presetMap, alertByLineId, false, displayLayers)
  const sheet1Widths = computeSheetColWidths(project, sheet1Payloads, false)
  const sheet1 = workbook.addWorksheet('Callbook')
  sheet1.columns = [
    { key: 'call', width: sheet1Widths[0] },
    { key: 'lyric', width: sheet1Widths[1] },
    { key: 'cue', width: sheet1Widths[2] },
    { key: 'metaVal', width: sheet1Widths[3] }
  ]
  populateHeaderBlock(sheet1, project, sheet1Widths)
  appendCallbookRows(sheet1, sheet1Payloads, false, sheet1Widths)

  // Sheet 2: 详细版 (zero fills, includes GT timing/note in Col C and optional Col D aux text)
  const sheet2Payloads = buildRowPayloads(sortedLines, presetMap, alertByLineId, true, displayLayers)
  const sheet2Widths = computeSheetColWidths(project, sheet2Payloads, true)
  const sheet2 = workbook.addWorksheet('详细版')
  sheet2.columns = [
    { key: 'call', width: sheet2Widths[0] },
    { key: 'lyric', width: sheet2Widths[1] },
    { key: 'cue', width: sheet2Widths[2] },
    { key: 'aux', width: sheet2Widths[3] }
  ]
  populateHeaderBlock(sheet2, project, sheet2Widths)
  appendCallbookRows(sheet2, sheet2Payloads, true, sheet2Widths)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFilename(project.meta.title)}-call-book.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
