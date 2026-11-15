<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next'
import ColorPalettePicker from '../components/prism/ColorPalettePicker.vue'
import PrismSegmented from '../components/prism/PrismSegmented.vue'
import PrismSwitch from '../components/prism/PrismSwitch.vue'
import { useThemeStore, type FontFamilyMode } from '../stores/themeStore'
import type { ColorStyle, ThemeModeSetting } from '../theme/flclashHct'

const themeStore = useThemeStore()

const modeSegments: Array<{ value: ThemeModeSetting; label: string }> = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '浅色 Light' },
  { value: 'dark', label: '深色 Dark' }
]

const styleSegments: Array<{ value: ColorStyle; label: string }> = [
  { value: 'vivid', label: 'Vivid 鲜明' },
  { value: 'tinted', label: 'Tinted 淡染' },
  { value: 'soft', label: 'Soft 柔和' },
  { value: 'monochrome', label: 'Monochrome' }
]
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
    <!-- Left Column: Live Theme Preview & Mode Controls (ported from flclash_ui/views/theme_preview.dart) -->
    <div class="lg:col-span-5 space-y-5">
      <section class="fc-card p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold">实时设计预览 (Theme Preview)</h3>
          <button
            type="button"
            @click="themeStore.resetTheme()"
            class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold prism-press"
            :style="{ backgroundColor: 'var(--fc-tone)', color: 'var(--md-on-surface-variant)' }"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            <span>恢复默认</span>
          </button>
        </div>

        <!-- Mini Dashboard Surface Hierarchy Demonstration -->
        <div
          class="rounded-[24px] p-4 space-y-3 border"
          :style="{
            backgroundColor: 'var(--fc-page)',
            borderColor: 'var(--md-outline-variant)'
          }"
        >
          <div class="flex items-center justify-between">
            <div class="text-xs font-bold">Dashboard Surface</div>
            <span
              class="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
              :style="{ backgroundColor: 'var(--md-success-container)', color: 'var(--md-on-success-container)' }"
            >
              HCT {{ themeStore.colorStyle.toUpperCase() }}
            </span>
          </div>

          <div
            class="rounded-[20px] p-3.5 flex items-center justify-between"
            :style="{ backgroundColor: 'var(--fc-card)', boxShadow: 'var(--fc-shadow-e1)' }"
          >
            <div class="space-y-1">
              <div class="text-xs font-bold">Elevated Card Tier</div>
              <div class="text-[11px]" :style="{ color: 'var(--md-on-surface-variant)' }">
                Primary {{ themeStore.scheme.primary }}
              </div>
            </div>
            <div
              class="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs shadow-sm"
              :style="{ backgroundColor: 'var(--md-primary)', color: 'var(--md-on-primary)' }"
            >
              M3
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-xl p-2 text-center text-[10px] font-semibold" :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }">
              Primary
            </div>
            <div class="rounded-xl p-2 text-center text-[10px] font-semibold" :style="{ backgroundColor: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)' }">
              Secondary
            </div>
            <div class="rounded-xl p-2 text-center text-[10px] font-semibold" :style="{ backgroundColor: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)' }">
              Tertiary
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <div class="text-xs font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">外观亮度模式</div>
          <PrismSegmented
            :model-value="themeStore.themeMode"
            @update:model-value="themeStore.themeMode = $event as ThemeModeSetting"
            :segments="modeSegments"
          />
        </div>

        <div class="space-y-2">
          <div class="text-xs font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">HCT 色彩渲染风格</div>
          <PrismSegmented
            :model-value="themeStore.colorStyle"
            @update:model-value="themeStore.colorStyle = $event as ColorStyle"
            :segments="styleSegments"
            compact
          />
        </div>
      </section>

      <!-- Visual Effects & Typography Settings -->
      <section class="fc-card p-5 space-y-4">
        <h3 class="text-sm font-bold">Prism UI 材质与排版</h3>

        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-xs font-bold">Pure Black OLED 纯黑深色</div>
            <div class="text-[11px]" :style="{ color: 'var(--md-on-surface-variant)' }">
              深色模式下压低背景 Tone 至纯黑 #000000
            </div>
          </div>
          <PrismSwitch v-model="themeStore.pureBlack" label="OLED 纯黑模式" />
        </div>

        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-xs font-bold">Liquid Glass 液态毛玻璃</div>
            <div class="text-[11px]" :style="{ color: 'var(--md-on-surface-variant)' }">
              侧栏、浮动底栏与通知栏启用镜面高光与背板模糊
            </div>
          </div>
          <PrismSwitch v-model="themeStore.liquidGlass" label="液态玻璃效果" />
        </div>

        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-xs font-bold">Mobile 悬浮胶囊底栏</div>
            <div class="text-[11px]" :style="{ color: 'var(--md-on-surface-variant)' }">
              移动端采用圆角悬浮 NavigationDock 样式
            </div>
          </div>
          <PrismSwitch v-model="themeStore.floatingNavDock" label="悬浮底栏" />
        </div>

        <div class="pt-2 border-t space-y-3" :style="{ borderColor: 'var(--md-outline-variant)' }">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <div class="text-xs font-semibold" :style="{ color: 'var(--md-on-surface-variant)' }">主界面字体</div>
              <span
                class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                :style="{ backgroundColor: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }"
              >
                Google Sans
              </span>
            </div>
            <PrismSegmented
              :model-value="themeStore.fontFamily"
              @update:model-value="themeStore.fontFamily = $event as FontFamilyMode"
              :segments="[
                { value: 'google-sans', label: 'Google Sans (全站默认)' },
                { value: 'google-sans-tabular', label: 'Google Sans · 等宽数字' }
              ]"
              compact
            />
          </div>

          <div class="space-y-1">
            <div class="flex justify-between text-xs font-mono">
              <span :style="{ color: 'var(--md-on-surface-variant)' }">界面字号缩放</span>
              <span>{{ Math.round(themeStore.textScale * 100) }}%</span>
            </div>
            <input
              v-model.number="themeStore.textScale"
              type="range"
              min="0.9"
              max="1.15"
              step="0.05"
              class="w-full m3-slider"
              aria-label="字号缩放"
            />
          </div>
        </div>
      </section>
    </div>

    <!-- Right Column: HCT Seed Palette Grid -->
    <section class="lg:col-span-7 fc-card p-5 space-y-3">
      <div>
        <h3 class="text-sm font-bold">主题色板与 HCT 动态取色引擎</h3>
        <p class="text-xs" :style="{ color: 'var(--md-on-surface-variant)' }">
          基于 Material 3 HCT 与动态色板算法：点选任意主色即时生成整套 Material 3 Surface/Container 色阶。
        </p>
      </div>
      <ColorPalettePicker />
    </section>
  </div>
</template>
