<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ResumeTemplateDefinition, ResumeTemplateKey } from '@/templates/resume'

const props = defineProps<{
  modelValue: boolean
  templates: ResumeTemplateDefinition[]
  selectedKey: ResumeTemplateKey
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'select', key: ResumeTemplateKey): void
}>()

const brokenTemplateImageKeys = ref<Set<string>>(new Set())

const selectedTemplateIndex = computed(() => {
  const index = props.templates.findIndex((item) => item.key === props.selectedKey)
  return index >= 0 ? index + 1 : 1
})

const templateCountText = computed(() => `${selectedTemplateIndex.value}/${props.templates.length}`)
const selectedTemplateName = computed(
  () => props.templates.find((item) => item.key === props.selectedKey)?.name ?? '未选择模板',
)

function closeDialog() {
  emit('update:modelValue', false)
}

function chooseTemplate(key: ResumeTemplateKey) {
  emit('select', key)
  emit('update:modelValue', false)
}

function isTemplateImageBroken(key: string): boolean {
  return brokenTemplateImageKeys.value.has(key)
}

function markTemplateImageBroken(key: string) {
  if (brokenTemplateImageKeys.value.has(key)) return
  const next = new Set(brokenTemplateImageKeys.value)
  next.add(key)
  brokenTemplateImageKeys.value = next
}

function resolvePreviewImageSrc(value: string): string {
  const src = value.trim()
  if (!src) return ''
  if (src.startsWith('//')) return `https:${src}`
  if (/^(https?:|data:|blob:)/i.test(src)) return src
  return src
}
</script>

<template>
  <div v-if="props.modelValue" class="template-picker-mask" @click.self="closeDialog">
    <div class="template-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="template-picker-title">
      <div class="template-picker-head">
        <div class="template-picker-heading">
          <div class="template-picker-title-row">
            <h3 id="template-picker-title" class="template-picker-title">选择模板</h3>
            <span class="template-picker-count">{{ templateCountText }}</span>
          </div>
        </div>

        <div class="template-picker-actions">
          <span class="template-picker-current">当前：{{ selectedTemplateName }}</span>
          <button class="template-picker-close" type="button" @click="closeDialog">关闭</button>
        </div>
      </div>

      <div class="template-picker-body">
        <div class="template-picker-list">
          <article
            v-for="item in props.templates"
            :key="item.key"
            class="template-card"
            :class="{ 'template-card-active': item.key === props.selectedKey }"
            @click="chooseTemplate(item.key)"
          >
            <div class="template-thumb-shell">
              <div class="template-thumb-meta">
                <span class="template-preview-label">A4 预览</span>
                <span v-if="item.key === props.selectedKey" class="template-selected-badge">当前使用</span>
              </div>

              <div class="template-thumb-frame">
                <img
                  v-if="item.previewImage && !isTemplateImageBroken(item.key)"
                  :src="resolvePreviewImageSrc(item.previewImage)"
                  :alt="`${item.name} 预览图`"
                  class="template-thumb-image"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  @error="markTemplateImageBroken(item.key)"
                />
                <div v-else class="template-thumb-fallback">
                  <span class="template-thumb-fallback-mark">A4</span>
                  <span class="template-thumb-fallback-text">模板预览加载失败</span>
                </div>

                <div class="template-thumb-overlay">
                  <button class="use-btn" type="button" @click.stop="chooseTemplate(item.key)">
                    {{ item.key === props.selectedKey ? '当前模板' : '使用模板' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="template-info">
              <div class="template-info-top">
                <p class="template-name">{{ item.name }}</p>
                <p class="template-card-tip">
                  {{ item.key === props.selectedKey ? '已选中该模板' : '点击卡片即可切换' }}
                </p>
              </div>

              <div v-if="item.tags && item.tags.length" class="template-tags">
                <span v-for="tag in item.tags" :key="tag" class="template-tag">{{ tag }}</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(22, 30, 42, 0.3);
  backdrop-filter: blur(10px);
}

.template-picker-dialog {
  width: min(1120px, calc(100vw - 40px));
  max-height: min(90vh, 920px);
  overflow: hidden;
  border-radius: 20px;
  background: linear-gradient(180deg, #fbfcfe 0%, #f4f7fb 100%);
  border: 1px solid rgba(197, 210, 228, 0.95);
  box-shadow: 0 24px 64px rgba(38, 52, 78, 0.18);
  display: flex;
  flex-direction: column;
}

.template-picker-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 24px 14px;
  border-bottom: 1px solid rgba(205, 216, 232, 0.95);
  background: rgba(255, 255, 255, 0.72);
}

.template-picker-heading {
  min-width: 0;
  flex: 1;
}

.template-picker-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.template-picker-title {
  margin: 0;
  color: #1d2738;
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
}

.template-picker-count,
.template-picker-current {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(186, 202, 224, 0.95);
  color: #577392;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.template-picker-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.template-picker-close {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(186, 202, 224, 0.95);
  background: rgba(255, 255, 255, 0.96);
  color: #445973;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.template-picker-close:hover {
  background: #ffffff;
  border-color: rgba(128, 162, 214, 0.95);
  transform: translateY(-1px);
}

.template-picker-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px 24px 24px;
  background: linear-gradient(180deg, rgba(247, 250, 255, 0.9), rgba(241, 245, 250, 0.96));
  scrollbar-width: thin;
  scrollbar-color: rgba(142, 164, 195, 0.7) transparent;
}

.template-picker-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
}

.template-card {
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(204, 217, 234, 0.95);
  box-shadow: 0 10px 24px rgba(65, 84, 116, 0.08);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.template-card:hover {
  transform: translateY(-3px);
  border-color: rgba(126, 160, 220, 0.96);
  box-shadow: 0 16px 32px rgba(65, 84, 116, 0.12);
}

.template-card-active {
  border-color: rgba(108, 149, 220, 0.96);
  box-shadow:
    0 0 0 3px rgba(121, 165, 235, 0.18),
    0 18px 36px rgba(65, 84, 116, 0.14);
}

.template-thumb-shell {
  padding: 14px 14px 0;
  background: linear-gradient(180deg, #f7faff 0%, #eef3fa 100%);
}

.template-thumb-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.template-preview-label,
.template-selected-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}

.template-preview-label {
  color: #6f849f;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(196, 210, 230, 0.95);
}

.template-selected-badge {
  color: #5078bc;
  background: rgba(101, 149, 229, 0.12);
  border: 1px solid rgba(128, 166, 225, 0.95);
}

.template-thumb-frame {
  position: relative;
  width: 100%;
  height: 300px;
  border-radius: 16px 16px 6px 6px;
  background: linear-gradient(180deg, #fbfcff 0%, #f3f7fc 100%);
  border: 1px solid rgba(205, 217, 233, 0.96);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
  overflow: hidden;
}

.template-thumb-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: top center;
}

.template-thumb-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #8796aa;
}

.template-thumb-fallback-mark {
  font-size: 34px;
  font-weight: 800;
}

.template-thumb-fallback-text {
  font-size: 13px;
  font-weight: 600;
}

.template-thumb-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(28, 42, 64, 0.12), rgba(28, 42, 64, 0.46));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.template-card:hover .template-thumb-overlay,
.template-card:focus-within .template-thumb-overlay {
  opacity: 1;
  pointer-events: auto;
}

.template-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.template-info-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.template-name {
  margin: 0;
  color: #1f2a3c;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.25;
}

.template-card-tip {
  flex-shrink: 0;
  color: #74849b;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  text-align: right;
}

.template-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.template-tag {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 9px;
  background: #edf3ff;
  color: #6389d4;
  font-size: 12px;
  font-weight: 700;
}

.use-btn {
  min-height: 40px;
  padding: 0 18px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #77a8f8 0%, #5b89dd 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(91, 137, 221, 0.26);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  white-space: nowrap;
}

.use-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 24px rgba(91, 137, 221, 0.32);
}

.template-card-active .use-btn {
  background: linear-gradient(135deg, #7a90b4 0%, #627390 100%);
  box-shadow: 0 10px 18px rgba(98, 115, 144, 0.22);
}

@media (max-width: 820px) {
  .template-picker-mask {
    padding: 14px;
  }

  .template-picker-dialog {
    width: min(100vw - 28px, 920px);
  }

  .template-picker-head {
    flex-direction: column;
    align-items: stretch;
  }

  .template-picker-actions {
    justify-content: space-between;
  }

  .template-picker-list {
    grid-template-columns: 1fr;
  }

  .template-thumb-frame {
    height: 280px;
  }

  .template-thumb-overlay {
    opacity: 1;
    pointer-events: auto;
    background: linear-gradient(180deg, rgba(28, 42, 64, 0.08), rgba(28, 42, 64, 0.24));
  }
}

@media (max-width: 560px) {
  .template-picker-head,
  .template-picker-body {
    padding-left: 16px;
    padding-right: 16px;
  }

  .template-picker-title {
    font-size: 22px;
  }

  .template-picker-actions,
  .template-info-top {
    flex-direction: column;
    align-items: stretch;
  }

  .template-picker-current,
  .template-picker-close {
    width: 100%;
    justify-content: center;
  }

  .template-card-tip {
    text-align: left;
  }
}
</style>
