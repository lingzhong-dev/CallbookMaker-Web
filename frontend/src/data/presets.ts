import type { CallPreset } from '../types/callbook'

// 内置默认军Call库（不可删，支持扩展自定义标签）：
// 1. 前挥 (#EF4444)  2. 平敲 (#F59E0B)  3. 上升气流 (#8B5CF6)  4. 雨刷 (#06B6D4)
// 5. 里打 (#10B981)  6. 里打hai (#059669)  7. 里跳 (#16A34A)  8. PPPH (#2563EB)
// 9. 跟唱 (#EC4899)  0. 拍手 (#14B8A6)
export const SING_ALONG_PRESET_ID = 'sing-along'

export const DEFAULT_CALL_PRESETS: CallPreset[] = [
  {
    id: 'front-wave',
    label: '前挥',
    color: '#EF4444',
    category: 'downbeat',
    shortcut: '1',
    builtIn: true
  },
  {
    id: 'flat-chop',
    label: '平敲',
    color: '#F59E0B',
    category: 'downbeat',
    shortcut: '2',
    builtIn: true
  },
  {
    id: 'updraft',
    label: '上升气流',
    color: '#8B5CF6',
    category: 'build',
    shortcut: '3',
    builtIn: true
  },
  {
    id: 'wiper',
    label: '雨刷',
    color: '#06B6D4',
    category: 'compound',
    shortcut: '4',
    builtIn: true
  },
  {
    id: 'ura-uchi',
    label: '里打',
    color: '#10B981',
    category: 'upbeat',
    shortcut: '5',
    builtIn: true
  },
  {
    id: 'ura-uchi-hai',
    label: '里打hai',
    color: '#059669',
    category: 'upbeat',
    shortcut: '6',
    builtIn: true
  },
  {
    id: 'ura-jump',
    label: '里跳',
    color: '#16A34A',
    category: 'upbeat',
    shortcut: '7',
    builtIn: true
  },
  {
    id: 'ppph',
    label: 'PPPH',
    color: '#2563EB',
    category: 'build',
    shortcut: '8',
    builtIn: true
  },
  {
    id: 'sing-along',
    label: '跟唱',
    color: '#EC4899',
    category: 'compound',
    shortcut: '9',
    builtIn: true
  },
  {
    id: 'clap',
    label: '拍手',
    color: '#14B8A6',
    category: 'downbeat',
    shortcut: '0',
    builtIn: true
  }
]

export const CATEGORY_LABELS: Record<CallPreset['category'], string> = {
  downbeat: '正拍',
  upbeat: '反拍 / 里拍',
  build: '推升 / 过渡',
  compound: '复合动作'
}

export function hexToLightTint(hex: string, mixRatio = 0.85): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return 'F8FAFC'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const tintR = Math.round(r + (255 - r) * mixRatio)
  const tintG = Math.round(g + (255 - g) * mixRatio)
  const tintB = Math.round(b + (255 - b) * mixRatio)
  return [tintR, tintG, tintB].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}
