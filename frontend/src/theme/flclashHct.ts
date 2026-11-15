/**
 * Pure TypeScript Material 3 HCT (Hue, Chroma, Tone) & FlClash Prism UI Scheme Engine.
 * Faithful port of `prism_ui/lib/hct/` and `prism_ui/lib/color.dart` (`seededColorScheme`,
 * `SurfaceLevel`, `ColorStyle`, and `toPureBlack`).
 */

export type ColorStyle = 'vivid' | 'tinted' | 'soft' | 'monochrome'
export type ThemeModeSetting = 'auto' | 'light' | 'dark'

export interface FlClashColorScheme {
  brightness: 'light' | 'dark'
  primary: string
  onPrimary: string
  primaryContainer: string
  onPrimaryContainer: string
  secondary: string
  onSecondary: string
  secondaryContainer: string
  onSecondaryContainer: string
  tertiary: string
  onTertiary: string
  tertiaryContainer: string
  onTertiaryContainer: string
  error: string
  onError: string
  errorContainer: string
  onErrorContainer: string
  success: string
  successContainer: string
  onSuccessContainer: string
  warning: string
  warningContainer: string
  onWarningContainer: string
  outline: string
  outlineVariant: string
  surface: string
  surfaceDim: string
  surfaceBright: string
  surfaceContainerLowest: string
  surfaceContainerLow: string
  surfaceContainer: string
  surfaceContainerHigh: string
  surfaceContainerHighest: string
  onSurface: string
  onSurfaceVariant: string
  inverseSurface: string
  onInverseSurface: string
  inversePrimary: string
  scrim: string
  // FlClash Dashboard extensions (`views/dashboard/style.dart`)
  dashboardPage: string
  dashboardCard: string
  dashboardBlock: string
  dashboardInset: string
  dashboardTone: string
  dashboardTone2: string
  dashboardSeries2: string
}

const SRGB_TO_XYZ = [
  [0.41233895, 0.35762064, 0.18051042],
  [0.2126, 0.7152, 0.0722],
  [0.01932141, 0.11916382, 0.95034478]
] as const

const WHITE_POINT_D65 = [95.047, 100.0, 108.883] as const

// Orthonormal chromatic basis in the plane 0.2126 R + 0.7152 G + 0.0722 B = 0
const PLANE_E1: [number, number, number] = normalizeVec([0.7152, -0.2126, 0])
const PLANE_E2: [number, number, number] = normalizeVec(
  crossVec([0.2126, 0.7152, 0.0722], PLANE_E1)
)

function normalizeVec(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

function crossVec(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

function clamp(min: number, max: number, v: number): number {
  return v < min ? min : v > max ? max : v
}

function sanitizeDegrees(deg: number): number {
  const mod = deg % 360
  return mod < 0 ? mod + 360 : mod
}

function angularDiff(a: number, b: number): number {
  let diff = ((a - b + 540) % 360) - 180
  if (diff < -180) diff += 360
  return diff
}

function linearized(c: number): number {
  const norm = c / 255
  return norm <= 0.040449936
    ? (norm / 12.92) * 100
    : Math.pow((norm + 0.055) / 1.055, 2.4) * 100
}

function delinearized(c: number): number {
  const norm = c / 100
  const val =
    norm <= 0.0031308 ? norm * 12.92 : 1.055 * Math.pow(norm, 1 / 2.4) - 0.055
  return clamp(0, 255, Math.round(val * 255))
}

function labF(t: number): number {
  const e = 216 / 24389
  const kappa = 24389 / 27
  return t > e ? Math.cbrt(t) : (kappa * t + 16) / 116
}

function labInvF(ft: number): number {
  const e = 216 / 24389
  const kappa = 24389 / 27
  const ft3 = ft * ft * ft
  return ft3 > e ? ft3 : (116 * ft - 16) / kappa
}

export function yFromLstar(lstar: number): number {
  return 100 * labInvF((lstar + 16) / 116)
}

export function lstarFromY(y: number): number {
  return labF(y / 100) * 116 - 16
}

export function argbToHex(argb: number): string {
  const r = (argb >> 16) & 255
  const g = (argb >> 8) & 255
  const b = argb & 255
  return (
    '#' +
    [r, g, b]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

export function hexToArgb(hex: string): number {
  const clean = hex.trim().replace('#', '')
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return (0xff << 24) | parseInt(clean, 16)
  }
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    const expanded = clean
      .split('')
      .map((c) => c + c)
      .join('')
    return (0xff << 24) | parseInt(expanded, 16)
  }
  return 0xff0068ff
}

function xyzFromLinRgb(linR: number, linG: number, linB: number): [number, number, number] {
  return [
    SRGB_TO_XYZ[0][0] * linR + SRGB_TO_XYZ[0][1] * linG + SRGB_TO_XYZ[0][2] * linB,
    SRGB_TO_XYZ[1][0] * linR + SRGB_TO_XYZ[1][1] * linG + SRGB_TO_XYZ[1][2] * linB,
    SRGB_TO_XYZ[2][0] * linR + SRGB_TO_XYZ[2][1] * linG + SRGB_TO_XYZ[2][2] * linB
  ]
}

// ViewingConditions.sRgb precomputed constants matching prism_ui/lib/hct/viewing_conditions.dart
const VC = (() => {
  const adaptingLum = ((200 / Math.PI) * yFromLstar(50)) / 100
  const [x, y, z] = WHITE_POINT_D65
  const rW = x * 0.401288 + y * 0.650173 + z * -0.051461
  const gW = x * -0.250268 + y * 1.204414 + z * 0.045854
  const bW = x * -0.002079 + y * 0.048952 + z * 0.953127
  const f = 1.0 // 0.8 + surround(2.0)/10
  const c = 0.69
  const nc = 1.0
  const d = clamp(0, 1, f * (1 - (1 / 3.6) * Math.exp((-adaptingLum - 42) / 92)))
  const rgbD = [
    d * (100 / rW) + 1 - d,
    d * (100 / gW) + 1 - d,
    d * (100 / bW) + 1 - d
  ] as const
  const k = 1 / (5 * adaptingLum + 1)
  const k4 = k * k * k * k
  const k4F = 1 - k4
  const fl = k4 * adaptingLum + 0.1 * k4F * k4F * Math.cbrt(5 * adaptingLum)
  const n = yFromLstar(50) / WHITE_POINT_D65[1]
  const zConst = 1.48 + Math.sqrt(n)
  const nbb = 0.725 / Math.pow(n, 0.2)
  const ncb = nbb
  const rgbAF = [
    Math.pow((fl * rgbD[0] * rW) / 100, 0.42),
    Math.pow((fl * rgbD[1] * gW) / 100, 0.42),
    Math.pow((fl * rgbD[2] * bW) / 100, 0.42)
  ]
  const rgbA = rgbAF.map((v) => (400 * v) / (v + 27.13))
  const aw = (2 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2]) * nbb
  return { n, z: zConst, c, nc, nbb, ncb, rgbD, fl, flRoot: Math.pow(fl, 0.25), aw }
})()

function cam16FromXyz(xyz: [number, number, number]): { hue: number; chroma: number } {
  const [x, y, z] = xyz
  const rC = 0.401288 * x + 0.650173 * y - 0.051461 * z
  const gC = -0.250268 * x + 1.204414 * y + 0.045854 * z
  const bC = -0.002079 * x + 0.048952 * y + 0.953127 * z

  const rD = VC.rgbD[0] * rC
  const gD = VC.rgbD[1] * gC
  const bD = VC.rgbD[2] * bC

  const compA = (v: number) => {
    const af = Math.pow((VC.fl * Math.abs(v)) / 100, 0.42)
    return Math.sign(v) * 400 * (af / (af + 27.13))
  }
  const rA = compA(rD)
  const gA = compA(gD)
  const bA = compA(bD)

  const a = (11 * rA - 12 * gA + bA) / 11
  const b = (rA + gA - 2 * bA) / 9
  const u = (20 * rA + 20 * gA + 21 * bA) / 20
  const p2 = (40 * rA + 20 * gA + bA) / 20

  const hue = sanitizeDegrees((Math.atan2(b, a) * 180) / Math.PI)
  const ac = p2 * VC.nbb
  const j = 100 * Math.pow(Math.max(0, ac / VC.aw), VC.c * VC.z)
  const huePrime = hue < 20.14 ? hue + 360 : hue
  const eHue = 0.25 * (Math.cos((huePrime * Math.PI) / 180 + 2) + 3.8)
  const p1 = (50000 / 13) * eHue * VC.nc * VC.ncb
  const t = (p1 * Math.hypot(a, b)) / (u + 0.305 || 1e-6)
  const alpha = Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73)
  const chroma = alpha * Math.sqrt(Math.max(0, j) / 100)
  return { hue, chroma }
}

export interface HctColor {
  hue: number
  chroma: number
  tone: number
  argb: number
  hex: string
}

export function hctFromArgb(argb: number): HctColor {
  const r = linearized((argb >> 16) & 255)
  const g = linearized((argb >> 8) & 255)
  const b = linearized(argb & 255)
  const xyz = xyzFromLinRgb(r, g, b)
  const { hue, chroma } = cam16FromXyz(xyz)
  const tone = lstarFromY(xyz[1])
  return { hue, chroma, tone, argb, hex: argbToHex(argb) }
}

export function hctFromHex(hex: string): HctColor {
  return hctFromArgb(hexToArgb(hex))
}

function maxTAlongDirection(y: number, dir: [number, number, number]): number {
  let tMax = 1e6
  for (let i = 0; i < 3; i++) {
    if (dir[i] > 1e-7) {
      tMax = Math.min(tMax, (100 - y) / dir[i])
    } else if (dir[i] < -1e-7) {
      tMax = Math.min(tMax, (0 - y) / dir[i])
    }
  }
  return Math.max(0, tMax)
}

export function solveHctToArgb(hueDeg: number, targetChroma: number, tone: number): number {
  const clampedTone = clamp(0, 100, tone)
  if (clampedTone <= 0.001) return 0xff000000
  if (clampedTone >= 99.999) return 0xffffffff
  const y = yFromLstar(clampedTone)

  if (targetChroma < 0.01) {
    const c = delinearized(y)
    return (0xff << 24) | (c << 16) | (c << 8) | c
  }

  const targetHue = sanitizeDegrees(hueDeg)
  const evalPhi = (phi: number, frac = 0.5) => {
    const cos = Math.cos(phi)
    const sin = Math.sin(phi)
    const dir: [number, number, number] = [
      cos * PLANE_E1[0] + sin * PLANE_E2[0],
      cos * PLANE_E1[1] + sin * PLANE_E2[1],
      cos * PLANE_E1[2] + sin * PLANE_E2[2]
    ]
    const tMax = maxTAlongDirection(y, dir)
    const t = tMax * frac
    const linR = clamp(0, 100, y + t * dir[0])
    const linG = clamp(0, 100, y + t * dir[1])
    const linB = clamp(0, 100, y + t * dir[2])
    return {
      dir,
      tMax,
      cam: cam16FromXyz(xyzFromLinRgb(linR, linG, linB))
    }
  }

  // Coarse 24-step scan around the Y=const slice to bracket targetHue without local minima
  let bestPhi = 0
  let bestErr = 999
  for (let i = 0; i < 24; i++) {
    const phi = (i / 24) * Math.PI * 2
    const err = Math.abs(angularDiff(evalPhi(phi, 0.35).cam.hue, targetHue))
    if (err < bestErr) {
      bestErr = err
      bestPhi = phi
    }
  }

  // Fine local ternary / golden search on phi to pinpoint hue
  let loPhi = bestPhi - Math.PI / 10
  let hiPhi = bestPhi + Math.PI / 10
  for (let iter = 0; iter < 14; iter++) {
    const m1 = loPhi + (hiPhi - loPhi) / 3
    const m2 = hiPhi - (hiPhi - loPhi) / 3
    const e1 = Math.abs(angularDiff(evalPhi(m1, 0.45).cam.hue, targetHue))
    const e2 = Math.abs(angularDiff(evalPhi(m2, 0.45).cam.hue, targetHue))
    if (e1 < e2) hiPhi = m2
    else loPhi = m1
  }
  const finalPhi = (loPhi + hiPhi) / 2
  const { dir, tMax } = evalPhi(finalPhi, 1)

  // Binary search radius along ray up to gamut edge to match targetChroma
  let loT = 0
  let hiT = tMax
  const maxCam = cam16FromXyz(
    xyzFromLinRgb(
      clamp(0, 100, y + tMax * dir[0]),
      clamp(0, 100, y + tMax * dir[1]),
      clamp(0, 100, y + tMax * dir[2])
    )
  )
  let finalT = tMax
  if (maxCam.chroma > targetChroma) {
    for (let i = 0; i < 16; i++) {
      const mid = (loT + hiT) * 0.5
      const cMid = cam16FromXyz(
        xyzFromLinRgb(
          clamp(0, 100, y + mid * dir[0]),
          clamp(0, 100, y + mid * dir[1]),
          clamp(0, 100, y + mid * dir[2])
        )
      ).chroma
      if (cMid < targetChroma) loT = mid
      else hiT = mid
    }
    finalT = (loT + hiT) * 0.5
  }

  const r = delinearized(clamp(0, 100, y + finalT * dir[0]))
  const g = delinearized(clamp(0, 100, y + finalT * dir[1]))
  const b = delinearized(clamp(0, 100, y + finalT * dir[2]))
  return (0xff << 24) | (r << 16) | (g << 8) | b
}

export function hctToHex(hue: number, chroma: number, tone: number): string {
  return argbToHex(solveHctToArgb(hue, chroma, tone))
}

function blendHex(fgHex: string, bgHex: string, alpha: number): string {
  const fg = hexToArgb(fgHex)
  const bg = hexToArgb(bgHex)
  const r = Math.round(((fg >> 16) & 255) * alpha + ((bg >> 16) & 255) * (1 - alpha))
  const g = Math.round(((fg >> 8) & 255) * alpha + ((bg >> 8) & 255) * (1 - alpha))
  const b = Math.round((fg & 255) * alpha + (bg & 255) * (1 - alpha))
  return argbToHex((0xff << 24) | (r << 16) | (g << 8) | b)
}

function fixIfDisliked(hue: number, chroma: number, tone: number): { hue: number; chroma: number; tone: number } {
  const disliked = Math.round(hue) >= 90 && Math.round(hue) <= 111 && Math.round(chroma) > 16 && Math.round(tone) < 65
  return { hue, chroma, tone: disliked ? 70 : tone }
}

const DARK_CARD_TONE = 15
const DARK_BLOCK_TONE = 21
const DARK_INSET_TONE = 27
const DARK_ON_SURFACE_TONE = 97
const SURFACE_CHROMA = 3
const PAPER_CHROMA = 1.5
const PRIMARY_CONTAINER_CHROMA = 48

export function buildFlClashColorScheme(options: {
  seedHex: string
  dark: boolean
  style?: ColorStyle
  pureBlack?: boolean
}): FlClashColorScheme {
  const style = options.style ?? 'vivid'
  const dark = options.dark
  const seed = hctFromHex(options.seedHex)

  // Palette parameters per Variant (`prism_ui/lib/color.dart` + `dynamic_scheme.dart`)
  const primaryHue = seed.hue
  const primaryChroma =
    style === 'monochrome' ? 0 : style === 'soft' ? 36 : Math.max(seed.chroma, 24)
  const secondaryChroma =
    style === 'monochrome'
      ? 0
      : style === 'soft'
        ? 16
        : Math.max(seed.chroma - 32, seed.chroma * 0.5)
  const tertiaryHue =
    style === 'soft' ? sanitizeDegrees(seed.hue + 60) : sanitizeDegrees(seed.hue + 48)
  const tertiaryChroma = style === 'monochrome' ? 0 : style === 'soft' ? 24 : Math.max(24, seed.chroma * 0.72)

  const neutralHue = seed.hue
  const neutralRawChroma = style === 'monochrome' ? 0 : style === 'soft' ? 6 : seed.chroma / 8
  const neutralVarChroma = style === 'monochrome' ? 0 : style === 'soft' ? 8 : seed.chroma / 8 + 4

  const containerChroma = Math.min(primaryChroma, PRIMARY_CONTAINER_CHROMA)
  const tintChroma = style === 'tinted' ? Math.min(seed.chroma / 6, 10) : null
  const paperChroma = dark ? SURFACE_CHROMA : PAPER_CHROMA

  const neutralHex = (maxChroma: number, tone: number) =>
    hctToHex(neutralHue, tintChroma ?? Math.min(neutralRawChroma, maxChroma), tone)

  const tonePrimary =
    style === 'vivid' || style === 'tinted'
      ? dark
        ? clamp(50, 75, seed.tone + 3)
        : clamp(35, 60, seed.tone)
      : dark
        ? 80
        : 40

  const primary =
    (style === 'vivid' || style === 'tinted') && Math.abs(tonePrimary - seed.tone) < 0.8
      ? argbToHex(seed.argb)
      : hctToHex(primaryHue, primaryChroma, tonePrimary)

  const onPrimary =
    style === 'vivid' || style === 'tinted'
      ? tonePrimary <= 60
        ? '#FFFFFF'
        : hctToHex(primaryHue, primaryChroma, 10)
      : style === 'monochrome'
        ? hctToHex(primaryHue, 0, dark ? 10 : 90)
        : hctToHex(primaryHue, primaryChroma, dark ? 20 : 100)

  const fixedTertiary = fixIfDisliked(tertiaryHue, tertiaryChroma, dark ? 30 : 90)

  let surface = neutralHex(paperChroma, dark ? 6 : 98)
  let surfaceDim = neutralHex(SURFACE_CHROMA, dark ? 6 : 87)
  let surfaceBright = neutralHex(paperChroma, dark ? 24 : 98)
  let surfaceContainerLowest = neutralHex(SURFACE_CHROMA, dark ? 4 : 100)
  let surfaceContainerLow = neutralHex(SURFACE_CHROMA, dark ? 10 : 96)
  let surfaceContainer = neutralHex(SURFACE_CHROMA, dark ? DARK_CARD_TONE : 94)
  let surfaceContainerHigh = neutralHex(SURFACE_CHROMA, dark ? DARK_BLOCK_TONE : 92)
  let surfaceContainerHighest = neutralHex(SURFACE_CHROMA, dark ? DARK_INSET_TONE : 90)

  if (options.pureBlack && dark) {
    const baseTone = hctFromHex(surface).tone
    const lower = (hex: string) => {
      const h = hctFromHex(hex)
      return hctToHex(h.hue, h.chroma, clamp(0, 100, h.tone - baseTone))
    }
    surface = '#000000'
    surfaceDim = '#000000'
    surfaceContainerLowest = '#000000'
    surfaceContainerLow = lower(surfaceContainerLow)
    surfaceContainer = lower(surfaceContainer)
    surfaceContainerHigh = lower(surfaceContainerHigh)
    surfaceContainerHighest = lower(surfaceContainerHighest)
    surfaceBright = lower(surfaceBright)
  }

  // Exact `FlClash` SurfaceLevel mappings from `prism_ui/lib/surface.dart`
  // page = dark ? surface : surfaceContainer
  // card = dark ? surfaceContainer : surfaceBright
  // block = dark ? surfaceContainerHigh : surfaceContainer
  // inset = surfaceContainerHighest
  const dashboardPage = dark ? surface : surfaceContainer
  const dashboardCard = dark ? surfaceContainer : surfaceBright
  const dashboardBlock = dark ? surfaceContainerHigh : surfaceContainer
  const dashboardInset = surfaceContainerHighest
  const dashboardTone = blendHex(
    hctToHex(neutralHue, neutralVarChroma, 50),
    dashboardCard,
    dark ? 0.14 : 0.08
  )
  const dashboardTone2 = blendHex(
    hctToHex(neutralHue, neutralVarChroma, 50),
    dashboardCard,
    dark ? 0.24 : 0.16
  )

  const successHct = hctFromHex('#4CAF50')
  const warningHct = hctFromHex('#FF9800')

  return {
    brightness: dark ? 'dark' : 'light',
    primary,
    onPrimary,
    primaryContainer: hctToHex(primaryHue, containerChroma, dark ? 30 : 90),
    onPrimaryContainer: hctToHex(primaryHue, containerChroma, dark ? 90 : 30),
    secondary: hctToHex(primaryHue, secondaryChroma, dark ? 80 : 40),
    onSecondary: hctToHex(primaryHue, secondaryChroma, dark ? 20 : 100),
    secondaryContainer: hctToHex(primaryHue, secondaryChroma, dark ? 30 : 90),
    onSecondaryContainer: hctToHex(primaryHue, secondaryChroma, dark ? 90 : 30),
    tertiary: hctToHex(tertiaryHue, tertiaryChroma, dark ? 80 : 40),
    onTertiary: hctToHex(tertiaryHue, tertiaryChroma, dark ? 20 : 100),
    tertiaryContainer: hctToHex(fixedTertiary.hue, fixedTertiary.chroma, dark ? 30 : 90),
    onTertiaryContainer: hctToHex(fixedTertiary.hue, fixedTertiary.chroma, dark ? 90 : 30),
    error: hctToHex(25, 84, dark ? 80 : 40),
    onError: hctToHex(25, 84, dark ? 20 : 100),
    errorContainer: hctToHex(25, 84, dark ? 30 : 90),
    onErrorContainer: hctToHex(25, 84, dark ? 90 : 30),
    success: hctToHex(successHct.hue, successHct.chroma, dark ? 80 : 40),
    successContainer: hctToHex(successHct.hue, successHct.chroma, dark ? 30 : 90),
    onSuccessContainer: hctToHex(successHct.hue, successHct.chroma, dark ? 90 : 30),
    warning: hctToHex(warningHct.hue, warningHct.chroma, dark ? 80 : 40),
    warningContainer: hctToHex(warningHct.hue, warningHct.chroma, dark ? 30 : 90),
    onWarningContainer: hctToHex(warningHct.hue, warningHct.chroma, dark ? 90 : 30),
    outline: hctToHex(neutralHue, neutralVarChroma, dark ? 60 : 50),
    outlineVariant: hctToHex(neutralHue, 4, dark ? 30 : 80),
    surface,
    surfaceDim,
    surfaceBright,
    surfaceContainerLowest,
    surfaceContainerLow,
    surfaceContainer,
    surfaceContainerHigh,
    surfaceContainerHighest,
    onSurface: dark ? hctToHex(neutralHue, neutralRawChroma, DARK_ON_SURFACE_TONE) : hctToHex(neutralHue, neutralRawChroma, 10),
    onSurfaceVariant: hctToHex(neutralHue, neutralVarChroma, dark ? 80 : 30),
    inverseSurface: hctToHex(neutralHue, neutralRawChroma, dark ? 90 : 20),
    onInverseSurface: hctToHex(neutralHue, neutralRawChroma, dark ? 20 : 95),
    inversePrimary: hctToHex(primaryHue, primaryChroma, dark ? 40 : 80),
    scrim: '#000000',
    dashboardPage,
    dashboardCard,
    dashboardBlock,
    dashboardInset,
    dashboardTone,
    dashboardTone2,
    dashboardSeries2: hctToHex(sanitizeDegrees(primaryHue + 38), style === 'monochrome' ? 0 : 42, dark ? 74 : 52)
  }
}

export const FLCLASH_PALETTE_HUES = [230, 262, 285, 310, 340, 20, 40, 60, 80, 100, 120, 145] as const
export const FLCLASH_PALETTE_TONES = [25, 33, 41, 49, 57, 65, 73, 81, 89] as const

export function buildFlClashPaletteGrid(): string[][] {
  const rows: string[][] = []
  rows.push(
    FLCLASH_PALETTE_HUES.map((_, col) =>
      hctToHex(0, 0, 100 - (col * 100) / (FLCLASH_PALETTE_HUES.length - 1))
    )
  )
  for (const tone of FLCLASH_PALETTE_TONES) {
    rows.push(FLCLASH_PALETTE_HUES.map((hue) => hctToHex(hue, 200, tone)))
  }
  return rows
}

export const CURATED_THEME_PRESETS = [
  { id: 'azure', label: '蔚蓝仪表', seedColor: '#0068FF', mode: 'light' as ThemeModeSetting },
  { id: 'amber-dark', label: '琥珀暗黑', seedColor: '#FF9800', mode: 'dark' as ThemeModeSetting },
  { id: 'iris', label: 'Prism 紫域', seedColor: '#6750A4', mode: 'light' as ThemeModeSetting },
  { id: 'mint', label: '翡翠应援', seedColor: '#10B981', mode: 'light' as ThemeModeSetting },
  { id: 'sakura', label: '樱粉舞台', seedColor: '#EC4899', mode: 'dark' as ThemeModeSetting }
] as const
