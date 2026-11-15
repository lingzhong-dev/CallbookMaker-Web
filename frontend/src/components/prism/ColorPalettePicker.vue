<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Plus, Trash2 } from 'lucide-vue-next'
import {
  buildFlClashPaletteGrid,
  CURATED_THEME_PRESETS,
  hctFromHex,
  hctToHex
} from '../../theme/flclashHct'
import { useThemeStore } from '../../stores/themeStore'
import PrismSegmented from './PrismSegmented.vue'

const themeStore = useThemeStore()
const paletteMode = ref<'grid' | 'sliders'>('grid')
const gridRows = computed(() => buildFlClashPaletteGrid())

const sliderHue = ref(216)
const sliderChroma = ref(72)
const sliderTone = ref(52)

watch(
  () => themeStore.seedColor,
  (hex) => {
    const h = hctFromHex(hex)
    sliderHue.value = Math.round(h.hue)
    sliderChroma.value = Math.round(h.chroma)
    sliderTone.value = Math.round(h.tone)
  },
  { immediate: true }
)

function applySliderColor(): void {
  themeStore.seedColor = hctToHex(sliderHue.value, sliderChroma.value, sliderTone.value)
}

function selectColor(hex: string): void {
  themeStore.seedColor = hex
}
</script>

<template>
  <div class="space-y-4">
    <!-- Quick FlClash Snapshot Presets -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="preset in CURATED_THEME_PRESETS"
        :key="preset.id"
        type="button"
        @click="themeStore.applyPreset(preset.id)"
        class="prism-press inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition"
        :style="{
          backgroundColor:
            themeStore.seedColor.toUpperCase() === preset.seedColor &&
            ((preset.mode === 'dark') === themeStore.isDark)
              ? 'var(--md-primary-container)'
              : 'var(--fc-tone)',
          color:
            themeStore.seedColor.toUpperCase() === preset.seedColor &&
            ((preset.mode === 'dark') === themeStore.isDark)
              ? 'var(--md-on-primary-container)'
              : 'var(--md-on-surface)'
        }"
      >
        <span class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: preset.seedColor }" />
        <span>{{ preset.label }}</span>
      </button>
    </div>

    <!-- Saved Color Swatches (matches flclash_ui/views/theme.dart) -->
    <div class="flex flex-wrap items-center gap-2.5">
      <div
        v-for="hex in themeStore.savedColors"
        :key="hex"
        class="relative group"
      >
        <button
          type="button"
          @click="selectColor(hex)"
          class="w-10 h-10 rounded-2xl flex items-center justify-center prism-press transition-transform"
          :style="{
            backgroundColor: hex,
            boxShadow:
              themeStore.seedColor.toUpperCase() === hex.toUpperCase()
                ? '0 0 0 3px var(--fc-card), 0 0 0 5px var(--md-primary)'
                : '0 2px 8px rgba(0,0,0,0.12)'
          }"
          :title="`选择主色 ${hex}`"
        >
          <Check
            v-if="themeStore.seedColor.toUpperCase() === hex.toUpperCase()"
            class="w-4 h-4 text-white drop-shadow"
          />
        </button>
        <button
          v-if="themeStore.savedColors.length > 1"
          type="button"
          @click.stop="themeStore.removeSavedColor(hex)"
          class="opacity-0 group-hover:opacity-100 absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] shadow transition-opacity"
          title="移除此色板"
        >
          <Trash2 class="w-2.5 h-2.5" />
        </button>
      </div>

      <button
        type="button"
        @click="themeStore.addSavedColor(themeStore.seedColor)"
        class="w-10 h-10 rounded-2xl border-2 border-dashed flex items-center justify-center prism-press transition hover:opacity-80"
        :style="{ borderColor: 'var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }"
        title="保存当前主色到常用色板"
      >
        <Plus class="w-4 h-4" />
      </button>

      <label
        class="inline-flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-mono cursor-pointer ml-auto"
        :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface)' }"
      >
        <input
          v-model="themeStore.seedColor"
          type="color"
          class="w-5 h-5 rounded-md border-0 bg-transparent cursor-pointer p-0"
        />
        <span>{{ themeStore.seedColor.toUpperCase() }}</span>
      </label>
    </div>

    <!-- Mode Switcher: Grid / HCT Sliders (port of palette.dart) -->
    <PrismSegmented
      v-model="paletteMode"
      compact
      :segments="[
        { value: 'grid', label: '网格矩阵 (Grid)' },
        { value: 'sliders', label: 'HCT 色相与明度滑块' }
      ]"
    />

    <!-- 12 x 10 Seamless Color Grid -->
    <div
      v-if="paletteMode === 'grid'"
      class="rounded-2xl overflow-hidden grid grid-cols-12 shadow-inner"
      role="listbox"
      aria-label="HCT 调色矩阵"
    >
      <template v-for="(row, rIdx) in gridRows" :key="rIdx">
        <button
          v-for="(hex, cIdx) in row"
          :key="`${rIdx}-${cIdx}`"
          type="button"
          @click="selectColor(hex)"
          class="aspect-square relative focus:outline-none transition-transform hover:scale-110 hover:z-10"
          :style="{ backgroundColor: hex }"
          :title="hex"
        >
          <span
            v-if="themeStore.seedColor.toUpperCase() === hex.toUpperCase()"
            class="absolute inset-0.5 rounded-full border-2 border-white shadow"
          />
        </button>
      </template>
    </div>

    <!-- HCT Sliders -->
    <div v-else class="space-y-3 p-3.5 rounded-2xl" :style="{ backgroundColor: 'var(--fc-block)' }">
      <div class="space-y-1">
        <div class="flex justify-between text-xs font-mono">
          <span :style="{ color: 'var(--md-on-surface-variant)' }">Hue 色相</span>
          <span>{{ sliderHue }}°</span>
        </div>
        <input
          v-model.number="sliderHue"
          @input="applySliderColor"
          type="range"
          min="0"
          max="360"
          class="w-full m3-slider"
        />
      </div>
      <div class="space-y-1">
        <div class="flex justify-between text-xs font-mono">
          <span :style="{ color: 'var(--md-on-surface-variant)' }">Chroma 彩度</span>
          <span>{{ sliderChroma }}</span>
        </div>
        <input
          v-model.number="sliderChroma"
          @input="applySliderColor"
          type="range"
          min="0"
          max="120"
          class="w-full m3-slider"
        />
      </div>
      <div class="space-y-1">
        <div class="flex justify-between text-xs font-mono">
          <span :style="{ color: 'var(--md-on-surface-variant)' }">Tone 明度 (L*)</span>
          <span>{{ sliderTone }}</span>
        </div>
        <input
          v-model.number="sliderTone"
          @input="applySliderColor"
          type="range"
          min="15"
          max="90"
          class="w-full m3-slider"
        />
      </div>
    </div>
  </div>
</template>
