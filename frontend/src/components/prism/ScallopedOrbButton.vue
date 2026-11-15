<script setup lang="ts">
import { computed } from 'vue'
import { Pause, Play } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    running: boolean
    size?: number
    lobes?: 9 | 12
    watermark?: boolean
  }>(),
  {
    size: 84,
    lobes: 9,
    watermark: false
  }
)

defineEmits<{
  toggle: []
}>()

/**
 * Generates a smooth scalloped "cookie" SVG path approximating `MaterialShapes.cookie9Sided`
 * and `MaterialShapes.cookie12Sided` from `prism_ui/lib/shapes/material_shapes.dart`.
 */
function buildScallopedPath(lobes: number, outerR: number, innerR: number, cx = 50, cy = 50): string {
  const steps = lobes * 2
  const pts: Array<{ x: number; y: number }> = []
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    pts.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r
    })
  }
  const len = pts.length
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  })
  const firstMid = mid(pts[len - 1], pts[0])
  let d = `M ${firstMid.x.toFixed(2)} ${firstMid.y.toFixed(2)}`
  for (let i = 0; i < len; i++) {
    const curr = pts[i]
    const next = pts[(i + 1) % len]
    const m = mid(curr, next)
    d += ` Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${m.x.toFixed(2)} ${m.y.toFixed(2)}`
  }
  return d + ' Z'
}

const circlePath = computed(() => buildScallopedPath(props.lobes, 46, 46))
const scallopedPath = computed(() =>
  buildScallopedPath(props.lobes, 48, props.lobes === 12 ? 38.5 : 37.5)
)
</script>

<template>
  <svg
    v-if="watermark"
    :width="size"
    :height="size"
    viewBox="0 0 100 100"
    class="pointer-events-none select-none transition-transform duration-700 ease-out"
    :style="{ transform: running ? 'rotate(18deg) scale(1.06)' : 'rotate(0deg) scale(1)' }"
    aria-hidden="true"
  >
    <path :d="scallopedPath" fill="currentColor" />
  </svg>

  <button
    v-else
    type="button"
    @click="$emit('toggle')"
    class="relative inline-flex items-center justify-center shrink-0 prism-press focus:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--md-primary-container)]"
    :style="{
      width: `${size}px`,
      height: `${size}px`
    }"
    :aria-label="running ? '暂停播放' : '开始播放'"
    :title="running ? '暂停 (Space)' : '播放 (Space)'"
  >
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 100 100"
      class="transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
      :style="{
        filter: 'drop-shadow(0 10px 20px rgba(var(--md-primary-rgb), 0.34))',
        transform: running ? 'rotate(20deg) scale(1.02)' : 'rotate(0deg) scale(1)'
      }"
    >
      <path
        :d="running ? scallopedPath : circlePath"
        fill="var(--md-primary)"
        class="transition-all duration-500 ease-out"
      />
    </svg>
    <span
      class="absolute inset-0 flex items-center justify-center transition-transform duration-300"
      :style="{ color: 'var(--md-on-primary)' }"
    >
      <Pause v-if="running" :size="Math.round(size * 0.34)" class="fill-current" />
      <Play v-else :size="Math.round(size * 0.34)" class="fill-current translate-x-[2px]" />
    </span>
  </button>
</template>
