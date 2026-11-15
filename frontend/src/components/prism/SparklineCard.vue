<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    values: number[]
    color?: string
    height?: number
  }>(),
  {
    color: 'var(--md-primary)',
    height: 62
  }
)

const gradientId = `spark-grad-${useId()}`

/**
 * Gaussian smoothing kernel (_sigma = 1.5, matching `prism_ui/lib/line_chart.dart`)
 */
const smoothed = computed(() => {
  const src = props.values.length > 1 ? props.values : [0.2, 0.2]
  const sigma = 1.5
  const radius = Math.ceil(sigma * 2.5)
  const kernel: number[] = []
  let kernelSum = 0
  for (let d = -radius; d <= radius; d++) {
    const w = Math.exp(-(d * d) / (2 * sigma * sigma))
    kernel.push(w)
    kernelSum += w
  }
  return src.map((_, idx) => {
    let acc = 0
    for (let k = -radius; k <= radius; k++) {
      const sampleIdx = Math.max(0, Math.min(src.length - 1, idx + k))
      acc += src[sampleIdx] * kernel[k + radius]
    }
    return Math.max(0.04, Math.min(1, acc / kernelSum))
  })
})

const paths = computed(() => {
  const vals = smoothed.value
  const w = 240
  const h = 64
  const padTop = 6
  const usableH = h - padTop - 2
  const stepX = w / Math.max(1, vals.length - 1)
  const pts = vals.map((v, i) => ({
    x: i * stepX,
    y: padTop + (1 - v) * usableH
  }))
  if (pts.length < 2) {
    return { line: '', area: '' }
  }
  let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const cx = ((prev.x + curr.x) / 2).toFixed(1)
    line += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${cx} ${((prev.y + curr.y) / 2).toFixed(1)}`
  }
  const last = pts[pts.length - 1]
  line += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`
  const area = `${line} L ${w} ${h} L 0 ${h} Z`
  return { line, area }
})
</script>

<template>
  <svg
    viewBox="0 0 240 64"
    preserveAspectRatio="none"
    class="w-full block overflow-visible"
    :style="{ height: `${height}px` }"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.28" />
        <stop offset="100%" :stop-color="color" stop-opacity="0.01" />
      </linearGradient>
    </defs>
    <path :d="paths.area" :fill="`url(#${gradientId})`" />
    <path
      :d="paths.line"
      fill="none"
      :stroke="color"
      stroke-width="2.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
