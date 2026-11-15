<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label?: string
  disabled?: boolean
  compact?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
}>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label || '切换开关'"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
    class="relative inline-flex items-center shrink-0 rounded-full p-1 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--md-primary)] disabled:opacity-45"
    :class="compact ? 'w-[44px] h-[26px]' : 'w-[52px] h-[32px]'"
    :style="{
      backgroundColor: modelValue ? 'var(--md-primary)' : 'var(--fc-tone2)'
    }"
  >
    <span
      class="block rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-sm"
      :style="
        compact
          ? {
              width: modelValue ? '18px' : '14px',
              height: modelValue ? '18px' : '14px',
              transform: modelValue ? 'translateX(18px)' : 'translateX(2px)',
              backgroundColor: modelValue ? 'var(--md-on-primary)' : 'var(--md-on-surface-variant)'
            }
          : {
              width: modelValue ? '24px' : '18px',
              height: modelValue ? '24px' : '18px',
              transform: modelValue ? 'translateX(20px)' : 'translateX(3px)',
              backgroundColor: modelValue ? 'var(--md-on-primary)' : 'var(--md-on-surface-variant)'
            }
      "
    />
  </button>
</template>
