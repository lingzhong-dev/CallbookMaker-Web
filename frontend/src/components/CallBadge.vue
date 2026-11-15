<script setup lang="ts">
import type { CallPreset } from '../types/callbook'

defineProps<{
  preset: CallPreset
  suffix?: string
  interactive?: boolean
  size?: 'sm' | 'md' | 'lg'
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    v-if="interactive"
    type="button"
    @click.stop="$emit('click')"
    :style="{ backgroundColor: preset.color }"
    :class="[
      'inline-flex items-center gap-1 rounded-full font-bold text-white whitespace-nowrap shrink-0 shadow-sm transition-transform active:scale-95 hover:brightness-110',
      size === 'lg'
        ? 'px-3.5 py-1.5 text-base'
        : size === 'sm'
          ? 'px-2 py-0.5 text-[11px]'
          : 'px-2.5 py-0.5 text-xs'
    ]"
    :title="`${preset.label}${suffix ? ' ' + suffix : ''}（点击编辑倍率或移除）`"
  >
    <span>{{ preset.label }}</span>
    <span v-if="suffix" class="rounded bg-black/25 px-1 text-[0.85em] font-semibold">
      {{ suffix }}
    </span>
  </button>

  <span
    v-else
    :style="{ backgroundColor: preset.color }"
    :class="[
      'inline-flex items-center gap-1 rounded-full font-bold text-white whitespace-nowrap shrink-0',
      size === 'lg'
        ? 'px-3.5 py-1.5 text-base'
        : size === 'sm'
          ? 'px-2 py-0.5 text-[11px]'
          : 'px-2.5 py-0.5 text-xs'
    ]"
  >
    <span>{{ preset.label }}</span>
    <span v-if="suffix" class="rounded bg-black/25 px-1 text-[0.85em] font-semibold">
      {{ suffix }}
    </span>
  </span>
</template>
