<script setup lang="ts">
import { computed } from 'vue'
import type { LyricLine } from '../types/callbook'
import { buildAlignedLyricRuns, type ResolvedAlignedCue } from '../utils/alignedCalls'

const props = withDefaults(
  defineProps<{
    line: LyricLine
    showRuby: boolean
    displayTextOverride?: string
    variant?: 'editor' | 'quickref' | 'practice'
    exportLayout?: boolean
  }>(),
  {
    variant: 'editor',
    exportLayout: false
  }
)

const runs = computed(() => {
  if (props.displayTextOverride !== undefined) return []
  return buildAlignedLyricRuns(props.line, props.showRuby)
})

const hasAligned = computed(() => runs.value.some((r) => Boolean(r.call)))

function pillStyle(cue: ResolvedAlignedCue): Record<string, string> {
  if (cue.color) {
    return {
      backgroundColor: cue.color,
      color: '#FFFFFF',
      borderColor: cue.color
    }
  }
  if (props.variant === 'quickref') {
    return {
      backgroundColor: '#E0E7FF',
      color: '#3730A3',
      borderColor: '#C7D2FE'
    }
  }
  if (props.variant === 'practice') {
    return {
      backgroundColor: '#E11D48',
      color: '#FFFFFF',
      borderColor: '#FB7185'
    }
  }
  return {
    backgroundColor: 'var(--md-tertiary-container)',
    color: 'var(--md-on-tertiary-container)',
    borderColor: 'transparent'
  }
}

function pillSizeClass(): string {
  if (props.variant === 'practice') {
    return 'px-2.5 py-0.5 text-xs sm:text-sm font-black mb-1'
  }
  if (props.variant === 'quickref') {
    return 'px-1.5 py-0.5 text-[10px] font-extrabold mb-0.5 border'
  }
  return 'px-1.5 py-0.5 text-[10px] font-bold mb-0.5'
}
</script>

<template>
  <template v-if="displayTextOverride !== undefined">
    {{ displayTextOverride }}
  </template>
  <template v-else-if="!hasAligned">
    <span
      v-if="showRuby && line.text.ruby"
      class="lyric-ruby"
      v-html="line.text.ruby"
    />
    <span v-else>{{ line.text.original }}</span>
  </template>
  <span
    v-else
    data-testid="aligned-lyric-line"
    class="inline leading-[1.4]"
    :class="exportLayout ? 'whitespace-nowrap' : 'break-words'"
  >
    <template v-for="(run, rIdx) in runs" :key="rIdx">
      <span
        v-if="run.call"
        data-testid="aligned-call-segment"
        class="inline-flex flex-col items-center justify-end align-bottom mx-[1px]"
      >
        <span
          data-testid="aligned-call-pill"
          class="rounded-full leading-tight whitespace-nowrap shrink-0"
          :class="pillSizeClass()"
          :style="pillStyle(run.call)"
        >
          {{ run.call.text }}
        </span>
        <span
          class="lyric-ruby inline-block leading-[1.35] border-b-2 border-indigo-400/50 pb-[1px]"
        >
          <template v-for="(seg, sIdx) in run.rubyParts" :key="sIdx">
            <ruby v-if="seg.rt">
              {{ seg.base }}<rt>{{ seg.rt }}</rt>
            </ruby>
            <template v-else>{{ seg.base }}</template>
          </template>
        </span>
      </span>
      <span v-else class="lyric-ruby inline align-bottom leading-[1.35]">
        <template v-for="(seg, sIdx) in run.rubyParts" :key="sIdx">
          <ruby v-if="seg.rt">
            {{ seg.base }}<rt>{{ seg.rt }}</rt>
          </ruby>
          <template v-else>{{ seg.base }}</template>
        </template>
      </span>
    </template>
  </span>
</template>
