<script setup lang="ts" generic="T extends string | number">
import { computed } from 'vue'

export interface SegmentItem<V = string | number> {
  value: V
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: T
    segments: Array<SegmentItem<T>>
    compact?: boolean
    filled?: boolean
  }>(),
  {
    compact: false,
    filled: true
  }
)

const emit = defineEmits<{
  'update:modelValue': [val: T]
}>()

const activeIndex = computed(() =>
  Math.max(
    0,
    props.segments.findIndex((s) => s.value === props.modelValue)
  )
)

const pillStyle = computed(() => {
  const count = Math.max(1, props.segments.length)
  return {
    width: `calc((100% - 8px) / ${count})`,
    transform: `translateX(${activeIndex.value * 100}%)`,
    backgroundColor: props.filled ? 'var(--md-primary)' : 'var(--fc-card)',
    boxShadow: props.filled
      ? '0 2px 10px rgba(var(--md-primary-rgb), 0.25)'
      : '0 2px 6px rgba(0, 0, 0, 0.08)'
  }
})
</script>

<template>
  <div
    class="relative grid items-center rounded-full p-1 select-none"
    :class="compact ? 'h-9 text-[11px]' : 'h-11 text-xs sm:text-[13px]'"
    :style="{
      gridTemplateColumns: `repeat(${Math.max(1, segments.length)}, minmax(0, 1fr))`,
      backgroundColor: 'var(--fc-tone)'
    }"
    role="tablist"
  >
    <div
      class="absolute left-1 top-1 bottom-1 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] pointer-events-none"
      :style="pillStyle"
    />
    <button
      v-for="seg in segments"
      :key="String(seg.value)"
      type="button"
      role="tab"
      :aria-selected="seg.value === modelValue"
      @click="emit('update:modelValue', seg.value)"
      class="relative z-10 h-full rounded-full font-semibold truncate transition-colors duration-200 flex items-center justify-center"
      :class="compact ? 'px-0.5' : 'px-2'"
      :style="{
        color:
          seg.value === modelValue
            ? filled
              ? 'var(--md-on-primary)'
              : 'var(--md-on-surface)'
            : 'var(--md-on-surface-variant)'
      }"
    >
      {{ seg.label }}
    </button>
  </div>
</template>
