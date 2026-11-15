import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  buildFlClashColorScheme,
  CURATED_THEME_PRESETS,
  hexToArgb,
  type ColorStyle,
  type FlClashColorScheme,
  type ThemeModeSetting
} from '../theme/flclashHct'

const STORAGE_KEY = 'flclash_live_call_theme_v1'

export type FontFamilyMode = 'google-sans' | 'google-sans-tabular'

interface PersistedTheme {
  themeMode: ThemeModeSetting
  seedColor: string
  colorStyle: ColorStyle
  pureBlack: boolean
  liquidGlass: boolean
  floatingNavDock: boolean
  sidebarCollapsed: boolean
  fontFamily: FontFamilyMode | 'system' | 'jetbrains'
  textScale: number
  savedColors: string[]
}

function normalizeFontFamily(val: unknown): FontFamilyMode {
  return val === 'google-sans-tabular' ? 'google-sans-tabular' : 'google-sans'
}

const DEFAULT_SAVED_COLORS = ['#0068FF', '#FF9800', '#6750A4', '#10B981', '#EC4899', '#06B6D4']

function loadPersisted(): Partial<PersistedTheme> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<PersistedTheme>) : {}
  } catch {
    return {}
  }
}

export const useThemeStore = defineStore('flclashTheme', () => {
  const initial = typeof window !== 'undefined' ? loadPersisted() : {}

  const themeMode = ref<ThemeModeSetting>(initial.themeMode ?? 'light')
  const seedColor = ref<string>(initial.seedColor ?? '#0068FF')
  const colorStyle = ref<ColorStyle>(initial.colorStyle ?? 'vivid')
  const pureBlack = ref<boolean>(initial.pureBlack ?? false)
  const liquidGlass = ref<boolean>(initial.liquidGlass ?? true)
  const floatingNavDock = ref<boolean>(initial.floatingNavDock ?? true)
  const sidebarCollapsed = ref<boolean>(initial.sidebarCollapsed ?? false)
  const fontFamily = ref<FontFamilyMode>(normalizeFontFamily(initial.fontFamily))
  const textScale = ref<number>(initial.textScale ?? 1.0)
  const savedColors = ref<string[]>(
    Array.isArray(initial.savedColors) && initial.savedColors.length > 0
      ? initial.savedColors
      : [...DEFAULT_SAVED_COLORS]
  )

  const systemDark = ref(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
  )

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', (e) => {
      systemDark.value = e.matches
    })
  }

  const isDark = computed(() =>
    themeMode.value === 'auto' ? systemDark.value : themeMode.value === 'dark'
  )

  const scheme = computed<FlClashColorScheme>(() =>
    buildFlClashColorScheme({
      seedHex: seedColor.value,
      dark: isDark.value,
      style: colorStyle.value,
      pureBlack: pureBlack.value
    })
  )

  function applyPreset(presetId: string): void {
    const found = CURATED_THEME_PRESETS.find((p) => p.id === presetId)
    if (!found) return
    seedColor.value = found.seedColor
    themeMode.value = found.mode
  }

  function addSavedColor(hex: string): void {
    const norm = hex.toUpperCase()
    if (!savedColors.value.includes(norm)) {
      savedColors.value = [...savedColors.value, norm]
    }
    seedColor.value = norm
  }

  function removeSavedColor(hex: string): void {
    if (savedColors.value.length <= 1) return
    savedColors.value = savedColors.value.filter((c) => c !== hex)
    if (seedColor.value === hex) {
      seedColor.value = savedColors.value[0]
    }
  }

  function resetTheme(): void {
    themeMode.value = 'light'
    seedColor.value = '#0068FF'
    colorStyle.value = 'vivid'
    pureBlack.value = false
    liquidGlass.value = true
    floatingNavDock.value = true
    fontFamily.value = 'google-sans'
    textScale.value = 1.0
    savedColors.value = [...DEFAULT_SAVED_COLORS]
  }

  function syncDomCssVars(): void {
    if (typeof document === 'undefined') return
    const s = scheme.value
    const root = document.documentElement
    root.dataset.theme = s.brightness
    root.classList.toggle('dark', s.brightness === 'dark')

    const argb = hexToArgb(s.primary)
    const pr = (argb >> 16) & 255
    const pg = (argb >> 8) & 255
    const pb = argb & 255

    const cardArgb = hexToArgb(s.dashboardCard)
    const cr = (cardArgb >> 16) & 255
    const cg = (cardArgb >> 8) & 255
    const cb = cardArgb & 255

    const vars: Record<string, string> = {
      '--md-primary': s.primary,
      '--md-primary-rgb': `${pr}, ${pg}, ${pb}`,
      '--md-on-primary': s.onPrimary,
      '--md-primary-container': s.primaryContainer,
      '--md-on-primary-container': s.onPrimaryContainer,
      '--md-secondary': s.secondary,
      '--md-on-secondary': s.onSecondary,
      '--md-secondary-container': s.secondaryContainer,
      '--md-on-secondary-container': s.onSecondaryContainer,
      '--md-tertiary': s.tertiary,
      '--md-on-tertiary': s.onTertiary,
      '--md-tertiary-container': s.tertiaryContainer,
      '--md-on-tertiary-container': s.onTertiaryContainer,
      '--md-error': s.error,
      '--md-on-error': s.onError,
      '--md-error-container': s.errorContainer,
      '--md-on-error-container': s.onErrorContainer,
      '--md-success': s.success,
      '--md-success-container': s.successContainer,
      '--md-on-success-container': s.onSuccessContainer,
      '--md-warning': s.warning,
      '--md-warning-container': s.warningContainer,
      '--md-on-warning-container': s.onWarningContainer,
      '--md-outline': s.outline,
      '--md-outline-variant': s.outlineVariant,
      '--md-surface': s.surface,
      '--md-surface-bright': s.surfaceBright,
      '--md-surface-container-lowest': s.surfaceContainerLowest,
      '--md-surface-container-low': s.surfaceContainerLow,
      '--md-surface-container': s.surfaceContainer,
      '--md-surface-container-high': s.surfaceContainerHigh,
      '--md-surface-container-highest': s.surfaceContainerHighest,
      '--md-on-surface': s.onSurface,
      '--md-on-surface-variant': s.onSurfaceVariant,
      '--md-inverse-surface': s.inverseSurface,
      '--md-inverse-on-surface': s.onInverseSurface,
      '--fc-page': s.dashboardPage,
      '--fc-card': s.dashboardCard,
      '--fc-card-rgb': `${cr}, ${cg}, ${cb}`,
      '--fc-block': s.dashboardBlock,
      '--fc-inset': s.dashboardInset,
      '--fc-tone': s.dashboardTone,
      '--fc-tone2': s.dashboardTone2,
      '--fc-series2': s.dashboardSeries2,
      '--fc-shadow-e1':
        s.brightness === 'dark'
          ? '0 2px 6px rgba(0,0,0,0.45), 0 18px 40px -12px rgba(0,0,0,0.65)'
          : '0 2px 6px rgba(0,0,0,0.03), 0 18px 40px -10px rgba(0,0,0,0.055)',
      '--fc-shadow-e2':
        s.brightness === 'dark'
          ? '0 4px 12px rgba(0,0,0,0.5), 0 32px 64px -12px rgba(0,0,0,0.72)'
          : '0 4px 12px rgba(0,0,0,0.045), 0 28px 56px -12px rgba(0,0,0,0.09)',
      '--fc-text-scale': String(textScale.value)
    }

    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v)
    }
    root.style.fontSize = `${Math.round(16 * textScale.value)}px`
    root.dataset.fontMode = fontFamily.value
  }

  watch(
    [
      themeMode,
      seedColor,
      colorStyle,
      pureBlack,
      liquidGlass,
      floatingNavDock,
      sidebarCollapsed,
      fontFamily,
      textScale,
      savedColors,
      isDark
    ],
    () => {
      syncDomCssVars()
      try {
        const snapshot: PersistedTheme = {
          themeMode: themeMode.value,
          seedColor: seedColor.value,
          colorStyle: colorStyle.value,
          pureBlack: pureBlack.value,
          liquidGlass: liquidGlass.value,
          floatingNavDock: floatingNavDock.value,
          sidebarCollapsed: sidebarCollapsed.value,
          fontFamily: fontFamily.value,
          textScale: textScale.value,
          savedColors: savedColors.value
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
      } catch {
        // ignore storage restrictions
      }
    },
    { immediate: true, deep: true }
  )

  return {
    themeMode,
    seedColor,
    colorStyle,
    pureBlack,
    liquidGlass,
    floatingNavDock,
    sidebarCollapsed,
    fontFamily,
    textScale,
    savedColors,
    isDark,
    scheme,
    applyPreset,
    addSavedColor,
    removeSavedColor,
    resetTheme,
    syncDomCssVars
  }
})
