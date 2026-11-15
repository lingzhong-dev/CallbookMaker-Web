<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    max: number
    active?: boolean
  }>(),
  {
    active: false
  }
)

const emit = defineEmits<{
  seek: [value: number]
}>()

const trackRef = ref<HTMLElement | null>(null)
const dragging = ref(false)

const ratio = computed(() => {
  if (props.max <= 0) return 0
  return Math.max(0, Math.min(1, props.value / props.max))
})

/**
 * M3 Expressive wavy path modeled on `_WavyProgressPainter` in
 * `flclash_ui/views/dashboard/widgets/profiles.dart`.
 */
const wavePath = computed(() => {
  const totalW = 360
  const fillW = Math.max(4, totalW * ratio.value)
  const midY = 7
  const amp = props.active ? 2.6 : 1.4
  const wavelength = 18
  let d = `M 2 ${midY}`
  for (let x = 2; x <= fillW; x += 2) {
    const y = midY + Math.sin((x / wavelength) * Math.PI * 2) * amp
    d += ` L ${x.toFixed(1)} ${y.toFixed(2)}`
  }
  return d
})

function updateFromPointer(clientX: number): void {
  const el = trackRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const frac = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
  emit('seek', Math.round(frac * Math.max(1000, props.max)))
}

function handlePointerDown(e: PointerEvent): void {
  dragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  updateFromPointer(e.clientX)
}

function handlePointerMove(e: PointerEvent): void {
  if (!dragging.value) return
  updateFromPointer(e.clientX)
}

function handlePointerUp(): void {
  dragging.value = false
}
</script>

<template>
  <div
    ref="trackRef"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerUp"
    class="relative w-full h-6 flex items-center cursor-pointer select-none touch-none group"
    role="slider"
    :aria-valuenow="Math.round(value)"
    :aria-valuemax="Math.round(max)"
    aria-valuemin="0"
    aria-label="音频播放进度"
  >
    <svg viewBox="0 0 360 14" preserveAspectRatio="none" class="w-full h-3.5 overflow-visible">
      <line
        :x1="Math.min(358, Math.max(4, 360 * ratio) + 6)"
        y1="7"
        x2="358"
        y2="7"
        stroke="var(--fc-tone2)"
        stroke-width="3.2"
        stroke-linecap="round"
      />
      <path
        :d="wavePath"
        fill="none"
        stroke="var(--md-primary)"
        stroke-width="3.2"
        stroke-linecap="round"
      />
    </svg>
    <div
      class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-5 rounded-full transition-transform duration-150 group-hover:scale-y-125"
      :style="{
        left: `${ratio * 100}%`,
        backgroundColor: 'var(--md-primary)'
      }"
    />
  </div>
</template>
