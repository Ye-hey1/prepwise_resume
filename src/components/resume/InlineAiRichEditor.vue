<script setup lang="ts">
import RichEditor from '@/components/common/RichEditor.vue'
import AiInlineActions from '@/components/resume/AiInlineActions.vue'
import ResumeAssistantPanel from '@/components/resume/ResumeAssistantPanel.vue'
import { optimizeField, parseAiResponse } from '@/services/aiService'
import { getJdOptimizeContext, buildJdAwarePromptSuffix } from '@/services/jdAwareOptimize'
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
import { useOptimizeHistoryStore } from '@/stores/optimizeHistory'
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
const optimizeHistoryStore = useOptimizeHistoryStore()

const isBusy = ref(false)
const aiError = ref('')
const optimizeSuggestions = ref('')
const optimizedContent = ref('')
const assistantExamples = ref<ResumeAssistantExampleItem[]>([])
const assistantAdvice = ref<ResumeAssistantAdviceItem[]>([])
const assistantPanelVisible = ref(false)
const assistantAnchorEl = ref<HTMLElement | null>(null)
const assistBtnRef = ref<HTMLElement | null>(null)

const canOptimize = computed(() => props.modelValue.replace(/<[^>]+>/g, '').trim().length > 0)
const isEmptyField = computed(() => !canOptimize.value)
const optimizedContentHtml = computed(() => renderOptimizedPreviewHtml(props.context, optimizedContent.value))
const assistantMaterials = computed(() => resumeAssistantStore.getMaterialsByModule(props.context.moduleKey))
const hasInlineOptimizeResult = computed(() => Boolean(isBusy.value || aiError.value || optimizeSuggestions.value || optimizedContent.value))

/** 字数统计 */
const wordCount = computed(() => {
  const text = props.modelValue.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
  return text.length
})

/** 建议字数范围 */
const suggestedWordRange = computed<{ min: number; max: number }>(() => {
  const key = props.context.moduleKey
  const field = props.context.fieldKey
  if (key === 'skills') return { min: 80, max: 300 }
  if (key === 'selfIntro') return { min: 100, max: 400 }
  if (key === 'workExperience') return { min: 100, max: 500 }
  if (key === 'projectExperience' && field === 'introduction') return { min: 30, max: 150 }
  if (key === 'projectExperience' && field === 'mainWork') return { min: 100, max: 500 }
  if (key === 'awards') return { min: 20, max: 200 }
  if (key === 'education') return { min: 0, max: 200 }
  return { min: 0, max: 500 }
})

/** 字数状态 */
const wordCountStatus = computed<'empty' | 'short' | 'good' | 'long'>(() => {
  if (wordCount.value === 0) return 'empty'
  if (wordCount.value < suggestedWordRange.value.min) return 'short'
  if (wordCount.value > suggestedWordRange.value.max) return 'long'
  return 'good'
})

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

  // 记录优化历史
  optimizeHistoryStore.addRecord({
    moduleKey: props.context.moduleKey,
    moduleLabel: props.context.moduleLabel,
    fieldKey: props.context.fieldKey,
    version: 'A',
    originalText: props.modelValue.replace(/<[^>]+>/g, '').trim(),
    optimizedText: rawText,
    suggestions: optimizeSuggestions.value,
    applied: true,
  })

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
  if (isBusy.value) return

  // 空字段时切换为"AI 生成"模式
  if (isEmptyField.value) {
    await handleGenerate()
    return
  }

  isBusy.value = true
  aiError.value = ''
  resetOptimizePanel()
  assistantPanelVisible.value = false

  const config = aiConfigStore.getConfigForFeature('resumeOptimize')

  // JD 感知：注入岗位要求到优化上下文
  const jdContext = getJdOptimizeContext()
  const enrichedContext = { ...props.context }
  if (jdContext.hasJdData && !enrichedContext.targetJob) {
    enrichedContext.targetJob = jdContext.targetPosition
  }

  await optimizeField(config, enrichedContext, 'A', {
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

/** 空字段 AI 内容生成 */
async function handleGenerate() {
  isBusy.value = true
  aiError.value = ''
  resetOptimizePanel()
  assistantPanelVisible.value = false

  const config = aiConfigStore.getConfigForFeature('resumeOptimize')
  if (!config.apiToken) {
    aiError.value = '请先配置 AI 模型'
    isBusy.value = false
    return
  }

  // 构建生成 prompt（与优化不同，这里是从零生成）
  const { nonStreamAIRequest } = await import('@/services/stream')
  const { moduleKey, moduleLabel, fieldKey, fieldLabel, entryMeta, targetJob } = props.context

  // JD 感知
  const jdContext = getJdOptimizeContext()
  const effectiveTargetJob = targetJob || jdContext.targetPosition

  const contextParts: string[] = []
  if (effectiveTargetJob) contextParts.push(`目标岗位：${effectiveTargetJob}`)
  if (jdContext.hasJdData && jdContext.mustHaveSkills.length > 0) {
    contextParts.push(`岗位核心技能：${jdContext.mustHaveSkills.slice(0, 5).join('、')}`)
  }
  if (entryMeta) {
    Object.entries(entryMeta).forEach(([k, v]) => {
      if (v?.trim()) contextParts.push(`${k}：${v}`)
    })
  }

  const systemPrompt = `你是一位专业的简历撰写顾问。请根据提供的上下文信息，为简历的指定字段生成初始内容。

要求：
1. 内容专业、简洁、有针对性
2. 使用要点列表格式（每条以 - 开头）
3. 包含具体的技术细节和可量化的成果
4. 字数控制在 ${suggestedWordRange.value.min}-${suggestedWordRange.value.max} 字
5. 不要使用 Markdown 加粗标记
6. 直接输出内容，不要加任何前缀说明`

  const userPrompt = `请为简历的「${moduleLabel}」模块中的「${fieldLabel || fieldKey}」字段生成内容。

已知信息：
${contextParts.join('\n') || '暂无额外信息'}

请直接生成内容：`

  try {
    const result = await nonStreamAIRequest(config, systemPrompt, userPrompt, { temperature: 0.7 })
    if (result.trim()) {
      optimizedContent.value = result.trim()
      optimizeSuggestions.value = '已为你生成初始内容，可直接应用或修改后使用。'
    } else {
      aiError.value = '生成结果为空，请重试'
    }
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : '生成失败'
  } finally {
    isBusy.value = false
  }
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

async function handleAssist(anchorEl: HTMLElement | null) {
  if (isBusy.value) return
  assistantAnchorEl.value = anchorEl
  aiError.value = ''
  resetOptimizePanel()
  assistantPanelVisible.value = true

  // 首次打开时自动加载内置例句
  if (assistantExamples.value.length === 0) {
    bootstrapBuiltinExamples()
  }

  // 自动生成 AI 建议（如果有配置且尚未生成）
  if (assistantAdvice.value.length === 0) {
    const config = aiConfigStore.getConfigForFeature('resumeOptimize')
    if (config.apiToken) {
      refreshAdvice()
    }
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
        <button type="button" class="editor-ai-btn" :disabled="isBusy" @click.stop="handleOptimize">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          {{ isBusy && !assistantPanelVisible ? '处理中...' : isEmptyField ? 'AI生成' : 'AI优化' }}
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
      <template #footer>
        <div v-if="suggestedWordRange.min > 0" class="word-count-bar" :class="`wc-${wordCountStatus}`">
          <span class="wc-text">{{ wordCount }} 字</span>
          <span class="wc-hint">
            <template v-if="wordCountStatus === 'empty'">建议 {{ suggestedWordRange.min }}-{{ suggestedWordRange.max }} 字</template>
            <template v-else-if="wordCountStatus === 'short'">偏短，建议补充到 {{ suggestedWordRange.min }} 字以上</template>
            <template v-else-if="wordCountStatus === 'good'">长度合适</template>
            <template v-else>偏长，建议精简到 {{ suggestedWordRange.max }} 字以内</template>
          </span>
        </div>
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

/* 字数统计条 */
.word-count-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
}

.wc-text {
  font-weight: 700;
  min-width: 42px;
}

.wc-hint {
  color: var(--text-muted);
}

.wc-empty .wc-text { color: var(--text-muted); }
.wc-short .wc-text { color: var(--accent-orange); }
.wc-good .wc-text { color: var(--accent-green); }
.wc-long .wc-text { color: var(--accent-orange); }
</style>
