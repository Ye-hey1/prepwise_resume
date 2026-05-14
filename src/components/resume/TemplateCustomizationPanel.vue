<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useResumeStore, type TemplateCustomization } from '@/stores/resume'
import { getAvailableFonts, loadFont } from '@/utils/fontLoader'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useResumeStore()

const form = reactive<TemplateCustomization>({})

// 当面板打开时，加载当前模板的自定义配置
watch(
  () => props.visible,
  (val) => {
    if (val) {
      const custom = store.getCustomization(store.selectedTemplateKey)
      Object.assign(form, {
        primaryColor: custom.primaryColor ?? '',
        accentColor: custom.accentColor ?? '',
        fontFamily: custom.fontFamily ?? '',
        fontSize: custom.fontSize ?? 14,
        sectionSpacing: custom.sectionSpacing ?? 10,
        pagePaddingX: custom.pagePaddingX ?? 28,
        pagePaddingY: custom.pagePaddingY ?? 20,
        titleMarginTop: custom.titleMarginTop ?? 0,
        titleMarginBottom: custom.titleMarginBottom ?? 8,
        lineHeight: custom.lineHeight ?? 1.85,
      })
    }
  },
  { immediate: true },
)

const fonts = getAvailableFonts()

const colorPresets = [
  { label: '经典蓝', primary: '#4d76e1', accent: '#3a5db8' },
  { label: '活力橙', primary: '#e07a3a', accent: '#c4652e' },
  { label: '雅致绿', primary: '#2e9e5a', accent: '#238048' },
  { label: '沉稳黑', primary: '#2d2521', accent: '#555555' },
  { label: '优雅紫', primary: '#7c5cbf', accent: '#6244a0' },
  { label: '温柔粉', primary: '#d4727a', accent: '#bb5f66' },
  { label: '深空灰', primary: '#4a5568', accent: '#2d3748' },
  { label: '珊瑚红', primary: '#e05252', accent: '#c43c3c' },
]

function applyPreset(preset: (typeof colorPresets)[number]) {
  form.primaryColor = preset.primary
  form.accentColor = preset.accent
  apply()
}

function apply() {
  const custom: Partial<TemplateCustomization> = {}
  if (form.primaryColor) custom.primaryColor = form.primaryColor
  if (form.accentColor) custom.accentColor = form.accentColor
  if (form.fontFamily) {
    custom.fontFamily = form.fontFamily
    loadFont(form.fontFamily)
  }
  if (form.fontSize && form.fontSize !== 14) custom.fontSize = form.fontSize
  if (form.sectionSpacing !== undefined) custom.sectionSpacing = form.sectionSpacing
  if (form.pagePaddingX !== undefined) custom.pagePaddingX = form.pagePaddingX
  if (form.pagePaddingY !== undefined) custom.pagePaddingY = form.pagePaddingY
  if (form.titleMarginTop !== undefined) custom.titleMarginTop = form.titleMarginTop
  if (form.titleMarginBottom !== undefined) custom.titleMarginBottom = form.titleMarginBottom
  if (form.lineHeight !== undefined) custom.lineHeight = form.lineHeight
  store.setCustomization(store.selectedTemplateKey, custom)
}

function handleReset() {
  store.resetCustomization(store.selectedTemplateKey)
  Object.assign(form, {
    primaryColor: '',
    accentColor: '',
    fontFamily: '',
    fontSize: 14,
    sectionSpacing: 10,
    pagePaddingX: 28,
    pagePaddingY: 20,
    titleMarginTop: 0,
    titleMarginBottom: 8,
    lineHeight: 1.85,
  })
}

function handleOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('customization-overlay')) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="props.visible" class="customization-overlay" @click="handleOverlayClick">
      <div class="customization-panel">
        <header class="panel-header">
          <h3 class="panel-title">模板自定义</h3>
          <button class="close-btn" type="button" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="panel-body">
          <!-- 左列：外观与字体 -->
          <div class="panel-column">
            <!-- 配色方案 -->
            <section class="form-section">
              <h4 class="section-label">配色方案</h4>
              <div class="preset-grid">
                <button
                  v-for="preset in colorPresets"
                  :key="preset.label"
                  class="preset-btn"
                  type="button"
                  :title="preset.label"
                  @click="applyPreset(preset)"
                >
                  <span class="preset-swatch" :style="{ background: preset.primary }"></span>
                  <span class="preset-swatch accent" :style="{ background: preset.accent }"></span>
                  <span class="preset-name">{{ preset.label }}</span>
                </button>
              </div>
            </section>

            <!-- 自定义颜色 -->
            <section class="form-section">
              <h4 class="section-label">自定义颜色</h4>
              <div class="color-row">
                <label class="color-field">
                  <span class="field-name">主色调</span>
                  <div class="color-input-wrap">
                    <input v-model="form.primaryColor" type="color" class="color-input" @input="apply" />
                    <span class="color-value">{{ form.primaryColor || '默认' }}</span>
                  </div>
                </label>
                <label class="color-field">
                  <span class="field-name">辅助色</span>
                  <div class="color-input-wrap">
                    <input v-model="form.accentColor" type="color" class="color-input" @input="apply" />
                    <span class="color-value">{{ form.accentColor || '默认' }}</span>
                  </div>
                </label>
              </div>
            </section>

            <!-- 字体 -->
            <section class="form-section">
              <h4 class="section-label">字体</h4>
              <select v-model="form.fontFamily" class="font-select" @change="apply">
                <option v-for="font in fonts" :key="font.value" :value="font.value">
                  {{ font.label }}
                </option>
              </select>
            </section>

            <!-- 字号 -->
            <section class="form-section">
              <h4 class="section-label">字号 ({{ form.fontSize ?? 14 }}px)</h4>
              <input
                v-model.number="form.fontSize"
                type="range"
                min="10"
                max="18"
                step="1"
                class="range-input"
                @input="apply"
              />
              <div class="range-labels">
                <span>10px</span>
                <span>18px</span>
              </div>
            </section>
          </div>

          <!-- 右列：间距 -->
          <div class="panel-column">
            <!-- 间距设置 -->
            <section class="form-section">
              <h4 class="section-label">页面边距</h4>
              <div class="form-group-compact">
                <div class="range-field">
                  <span class="range-name">左右边距 ({{ form.pagePaddingX }}px)</span>
                  <input v-model.number="form.pagePaddingX" type="range" min="0" max="60" step="2" class="range-input" @input="apply" />
                </div>
                <div class="range-field">
                  <span class="range-name">上下边距 ({{ form.pagePaddingY }}px)</span>
                  <input v-model.number="form.pagePaddingY" type="range" min="0" max="60" step="2" class="range-input" @input="apply" />
                </div>
              </div>
              
              <h4 class="section-label" style="margin-top: 10px;">模块间距</h4>
              <div class="form-group-compact">
                <div class="range-field">
                  <span class="range-name">模块上下间距 ({{ form.sectionSpacing }}px)</span>
                  <input v-model.number="form.sectionSpacing" type="range" min="0" max="40" step="2" class="range-input" @input="apply" />
                </div>
                <div class="range-field">
                  <span class="range-name">标题上方间距 ({{ form.titleMarginTop }}px)</span>
                  <input v-model.number="form.titleMarginTop" type="range" min="0" max="30" step="1" class="range-input" @input="apply" />
                </div>
                <div class="range-field">
                  <span class="range-name">标题下方间距 ({{ form.titleMarginBottom }}px)</span>
                  <input v-model.number="form.titleMarginBottom" type="range" min="0" max="30" step="1" class="range-input" @input="apply" />
                </div>
                <div class="range-field">
                  <span class="range-name">正文行间距 ({{ form.lineHeight }})</span>
                  <input v-model.number="form.lineHeight" type="range" min="1.0" max="2.5" step="0.05" class="range-input" @input="apply" />
                </div>
              </div>
            </section>
          </div>
        </div>

        <div class="panel-footer">
          <button class="reset-btn" type="button" @click="handleReset">重置为默认设置</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.customization-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.customization-panel {
  width: 760px;
  max-width: 90vw;
  max-height: 85vh;
  background: var(--bg-card);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--bg-sidebar);
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.close-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: var(--gray-50);
  color: var(--gray-500);
  font-size: 18px;
  cursor: pointer;
  transition: background 0.15s;
}

.close-btn:hover {
  background: var(--bg-sidebar);
}

.panel-body {
  padding: 24px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

.panel-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--bg-sidebar);
  display: flex;
  justify-content: flex-end;
  background: var(--bg-card);
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.preset-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 1px solid var(--gray-300);
  border-radius: 8px;
  background: var(--gray-50);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.preset-btn:hover {
  border-color: var(--primary-500);
  box-shadow: 0 2px 8px rgba(43, 123, 184, 0.15);
}

.preset-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-block;
}

.preset-swatch.accent {
  width: 14px;
  height: 14px;
  margin-top: -4px;
}

.preset-name {
  font-size: 10px;
  color: var(--gray-500);
}

.color-row {
  display: flex;
  gap: 16px;
}

.color-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-name {
  font-size: 12px;
  color: var(--gray-500);
}

.color-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-input {
  width: 36px;
  height: 36px;
  border: 1px solid var(--gray-300);
  border-radius: 8px;
  padding: 2px;
  cursor: pointer;
}

.color-value {
  font-size: 12px;
  color: var(--text-primary);
  font-family: monospace;
}

.font-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--gray-300);
  border-radius: 8px;
  background: var(--gray-50);
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.range-input {
  width: 100%;
  accent-color: var(--primary-500);
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--gray-500);
}

.reset-btn {
  padding: 10px;
  border: 1px solid var(--gray-300);
  border-radius: 8px;
  background: var(--gray-50);
  color: var(--gray-500);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.reset-btn:hover {
  border-color: var(--primary-500);
  color: var(--primary-500);
}

.form-group-compact {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--gray-50);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--gray-200);
}

.range-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.range-name {
  font-size: 11px;
  color: var(--gray-600);
}

.range-labels span {
  color: var(--gray-500);
}
</style>
