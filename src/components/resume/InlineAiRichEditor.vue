<script setup lang="ts">
import RichEditor from '@/components/common/RichEditor.vue'
import AiInlineActions from '@/components/resume/AiInlineActions.vue'
import ResumeAssistantPanel from '@/components/resume/ResumeAssistantPanel.vue'
import { optimizeField, parseAiResponse } from '@/services/aiService'
import { renderOptimizedApplyHtml, renderOptimizedPreviewHtml } from '@/services/aiOptimizeFormatter'
import { getBuiltinResumeAssistantExamples } from '@/services/resumeAssistantBuiltin'
import {
  generateResumeAssistantAdvice,
  generateResumeAssistantSuggestions,
} from '@/services/resumeAssistantService'
import type {
  ResumeAssistantAdviceItem,
  ResumeAssistantExampleItem,
  ResumeFieldAiContext,
} from '@/services/types/resumeAssistant'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useResumeAssistantStore } from '@/stores/resumeAssistant'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  rows?: number
  label?: string
  context: ResumeFieldAiContext
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const aiConfigStore = useAiConfigStore()
const resumeAssistantStore = useResumeAssistantStore()

const isBusy = ref(false)
const aiError = ref('')
const optimizeSuggestions = ref('')
const optimizedContent = ref('')
const assistantExamples = ref<ResumeAssistantExampleItem[]>([])
const assistantAdvice = ref<ResumeAssistantAdviceItem[]>([])
const assistantPanelVisible = ref(false)
const assistantAnchorEl = ref<HTMLElement | null>(null)

const canOptimize = computed(() => props.modelValue.replace(/<[^>]+>/g, '').trim().length > 0)
const optimizedContentHtml = computed(() => renderOptimizedPreviewHtml(props.context, optimizedContent.value))
const assistantMaterials = computed(() => resumeAssistantStore.getMaterialsByModule(props.context.moduleKey))
const hasInlineOptimizeResult = computed(() => Boolean(isBusy.value || aiError.value || optimizeSuggestions.value || optimizedContent.value))

watch(() => props.context, () => {
  aiError.value = ''
  optimizeSuggestions.value = ''
  optimizedContent.value = ''
  assistantPanelVisible.value = false
  assistantAnchorEl.value = null
  // 切换模块时才清空助手数据，保留同模块上次状态
  assistantAdvice.value = []
  assistantExamples.value = []
}, { deep: true })

function updateValue(value: string) {
  emit('update:modelValue', value)
}

function applyOptimizedContent(rawText: string, mode: 'replace' | 'append') {
  const nextHtml = renderOptimizedApplyHtml(props.context, rawText, props.modelValue)
  if (!nextHtml) return

  if (mode === 'replace' || !props.modelValue.trim()) {
    updateValue(nextHtml)
    return
  }

  const current = props.modelValue.trim()
  const separator = current.endsWith('</li>') || current.endsWith('</p>') || current.endsWith('</div>') || current.endsWith('</ul>') || current.endsWith('</ol>')
    ? ''
    : '<br><br>'
  updateValue(`${current}${separator}${nextHtml}`)
}

function applyAssistantText(text: string, mode: 'replace' | 'append') {
  applyOptimizedContent(text, mode)
}

function resetOptimizePanel() {
  optimizeSuggestions.value = ''
  optimizedContent.value = ''
}

function bootstrapBuiltinExamples() {
  assistantExamples.value = getBuiltinResumeAssistantExamples(props.context.moduleKey)
}

async function handleOptimize() {
  if (isBusy.value || !canOptimize.value) return
  isBusy.value = true
  aiError.value = ''
  resetOptimizePanel()
  assistantPanelVisible.value = false

  const config = aiConfigStore.getConfigForFeature('resumeOptimize')
  await optimizeField(config, props.context, 'A', {
    onChunk: (text) => {
      const parsed = parseAiResponse(text)
      optimizeSuggestions.value = parsed.suggestions
      optimizedContent.value = parsed.optimizedContent
    },
    onDone: (text) => {
      const parsed = parseAiResponse(text)
      optimizeSuggestions.value = parsed.suggestions
      optimizedContent.value = parsed.optimizedContent
      isBusy.value = false
    },
    onError: (message) => {
      aiError.value = message
      isBusy.value = false
    },
  }).finally(() => {
    isBusy.value = false
  })
}

async function refreshExamples() {
  const config = aiConfigStore.getConfigForFeature('resumeOptimize')
  isBusy.value = true
  bootstrapBuiltinExamples()
  try {
    const result = await generateResumeAssistantSuggestions(config, props.context, {
      onChunk: () => {},
      onDone: () => {},
      onError: (message) => {
        aiError.value = message
      },
    })
    const aiExamples: ResumeAssistantExampleItem[] = result.suggestions.map((item) => ({
      id: item.id,
      moduleKey: props.context.moduleKey,
      text: item.text,
      tags: [item.tone, item.highlight].filter(Boolean) as string[],
      source: 'ai',
      tone: item.tone,
      highlight: item.highlight,
    }))
    assistantExamples.value = [...getBuiltinResumeAssistantExamples(props.context.moduleKey), ...aiExamples]
  } catch {
    bootstrapBuiltinExamples()
  } finally {
    isBusy.value = false
  }
}

async function refreshAdvice() {
  const config = aiConfigStore.getConfigForFeature('resumeOptimize')
  isBusy.value = true
  try {
    const result = await generateResumeAssistantAdvice(config, props.context, {
      onChunk: () => {},
      onDone: () => {},
      onError: (message) => {
        aiError.value = message
      },
    })
    assistantAdvice.value = result.advice
    if (result.advice.length === 0 && !aiError.value) {
      aiError.value = '暂未生成可用建议，请稍后重试。'
    }
  } catch {
    // 错误文案已由 service 设置
  } finally {
    isBusy.value = false
  }
}

const assistBtnRef = ref<HTMLElement | null>(null)

async function handleAssist(anchorEl: HTMLElement | null) {
  if (isBusy.value) return
  assistantAnchorEl.value = anchorEl
  aiError.value = ''
  resetOptimizePanel()
  assistantPanelVisible.value = true

  // 首次打开当前模块时加载内置例句骨架
  if (assistantExamples.value.length === 0) {
    bootstrapBuiltinExamples()
  }
}

function handleSaveMaterial() {
  const saved = resumeAssistantStore.saveMaterialFromContext({
    ...props.context,
    currentText: props.modelValue,
  })
  if (!saved) {
    aiError.value = '当前内容为空，暂时无法保存为素材。'
    return
  }
  aiError.value = ''
}

function handleRemoveMaterial(id: string) {
  resumeAssistantStore.removeMaterial(id)
}

async function copySuggestion(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    aiError.value = '复制失败，请手动复制内容。'
  }
}
</script>

<template>
  <div class="inline-ai-editor">
    <div v-if="label" class="field-label-row">
      <span class="field-label">{{ label }}</span>
      <div class="field-ai-actions">
        <button type="button" class="editor-ai-btn" :disabled="isBusy || !canOptimize" @click.stop="handleOptimize">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          {{ isBusy && !assistantPanelVisible ? '处理中...' : 'AI优化' }}
        </button>
        <button ref="assistBtnRef" type="button" class="editor-ai-btn ghost" :disabled="isBusy" @click.stop="handleAssist(assistBtnRef)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 0 1 4 12.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26A7 7 0 0 1 12 2zM9 21h6M10 17v4M14 17v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          简历助手
        </button>
      </div>
    </div>
    <RichEditor
      :model-value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      @update:model-value="updateValue"
    >
      <template #ai-panel>
        <AiInlineActions
          v-if="hasInlineOptimizeResult"
          :busy="isBusy && !assistantPanelVisible"
          :error="!assistantPanelVisible ? aiError : ''"
          :optimize-suggestions="optimizeSuggestions"
          :optimized-content="optimizedContent"
          :optimized-content-html="optimizedContentHtml"
          @apply-optimized="(mode) => applyOptimizedContent(optimizedContent, mode)"
        />
        <ResumeAssistantPanel
          :visible="assistantPanelVisible"
          :anchor-el="assistantAnchorEl"
          :busy="isBusy"
          :error="aiError"
          :examples="assistantExamples"
          :advice="assistantAdvice"
          :materials="assistantMaterials"
          @close="assistantPanelVisible = false"
          @refresh-examples="refreshExamples"
          @refresh-advice="refreshAdvice"
          @save-material="handleSaveMaterial"
          @apply-example="applyAssistantText"
          @apply-material="applyAssistantText"
          @copy-text="copySuggestion"
          @remove-material="handleRemoveMaterial"
        />
      </template>
    </RichEditor>
  </div>
</template>

<style scoped>
.inline-ai-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.field-ai-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.editor-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid var(--accent-blue-500);
  background: linear-gradient(135deg, var(--accent-blue-500), var(--accent-blue-600));
  color: #ffffff;
  cursor: pointer;
  transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  box-shadow: 0 2px 8px rgba(43, 123, 184, 0.18);
}

.editor-ai-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(43, 123, 184, 0.24);
}

.editor-ai-btn.ghost {
  background: var(--glass-high);
  color: var(--accent-blue-500);
  border-color: var(--accent-blue-500);
  box-shadow: 0 2px 8px rgba(43, 123, 184, 0.12);
}

.editor-ai-btn.ghost:hover:not(:disabled) {
  background: rgba(43, 123, 184, 0.06);
}

.editor-ai-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
</style>
