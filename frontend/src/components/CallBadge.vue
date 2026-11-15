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
  contextmenu: [event: MouseEvent]
}>()
</script>

<template>
  <button
    v-if="interactive"
    type="button"
    @click.stop="$emit('click')"
    @contextmenu="(e) => $emit('contextmenu', e)"
    :style="{ backgroundColor: preset.color }"
    :class="[
      'inline-flex items-center gap-1 rounded-full font-bold text-white max-w-full shadow-sm transition-transform active:scale-95 hover:brightness-110',
      suffix && suffix.length > 8 ? 'flex-wrap text-left' : 'whitespace-nowrap shrink-0',
      size === 'lg'
        ? 'px-3.5 py-1.5 text-base'
        : size === 'sm'
          ? 'px-2 py-0.5 text-[11px]'
          : 'px-2.5 py-0.5 text-xs'
    ]"
    :title="
      preset.id === 'sing-along'
        ? `${preset.label}${suffix ? ' ' + suffix : ''}（点击编辑跟唱部分或移除）`
        : preset.builtIn
          ? `${preset.label}${suffix ? ' ' + suffix : ''}（点击编辑倍率或移除）`
          : `${preset.label}${suffix ? ' ' + suffix : ''}（点击编辑倍率，右键编辑或删除自定义标签）`
    "
  >
    <span class="shrink-0">{{ preset.label }}</span>
    <span
      v-if="suffix"
      class="rounded bg-black/25 px-1 text-[0.85em] font-semibold break-words"
    >
      {{ suffix }}
    </span>
  </button>

  <span
    v-else
    :style="{ backgroundColor: preset.color }"
    :class="[
      'inline-flex items-center gap-1 rounded-full font-bold text-white max-w-full',
      suffix && suffix.length > 8 ? 'flex-wrap text-left' : 'whitespace-nowrap shrink-0',
      size === 'lg'
        ? 'px-3.5 py-1.5 text-base'
        : size === 'sm'
          ? 'px-2 py-0.5 text-[11px]'
          : 'px-2.5 py-0.5 text-xs'
    ]"
  >
    <span class="shrink-0">{{ preset.label }}</span>
    <span
      v-if="suffix"
      class="rounded bg-black/25 px-1 text-[0.85em] font-semibold break-words"
    >
      {{ suffix }}
    </span>
  </span>
</template>
