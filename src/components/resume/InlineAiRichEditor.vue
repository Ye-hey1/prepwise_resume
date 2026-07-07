<script setup lang="ts">
import RichEditor from '@/components/common/RichEditor.vue'
import AiInlineActions from '@/components/resume/AiInlineActions.vue'
import SuggestionApplyPanel from '@/components/ai/SuggestionApplyPanel.vue'
import { optimizeField, parseAiResponse } from '@/services/aiService'
import { getJdOptimizeContext } from '@/services/jdAwareOptimize'
import { renderOptimizedApplyHtml, renderOptimizedPreviewHtml } from '@/services/aiOptimizeFormatter'
import { generateResumeApplySuggestions } from '@/services/resumeAssistantService'
import type {
  ResumeAssistantApplyItem,
  ResumeFieldAiContext,
} from '@/services/types/resumeAssistant'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useOptimizeHistoryStore } from '@/stores/optimizeHistory'
import { computed, nextTick, ref, watch } from 'vue'

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
const optimizeHistoryStore = useOptimizeHistoryStore()

const isBusy = ref(false)
const aiError = ref('')
const optimizeSuggestions = ref('')
const optimizedContent = ref('')

// 逐条应用相关状态
const applyPanelVisible = ref(false)
const applyItems = ref<ResumeAssistantApplyItem[]>([])
const applyPanelBusy = ref(false)
const applyPanelError = ref('')
const applyPanelRef = ref<HTMLElement | null>(null)

const canOptimize = computed(() => props.modelValue.replace(/<[^>]+>/g, '').trim().length > 0)
const isEmptyField = computed(() => !canOptimize.value)
const optimizedContentHtml = computed(() => renderOptimizedPreviewHtml(props.context, optimizedContent.value))
const hasInlineOptimizeResult = computed(() => Boolean(isBusy.value || aiError.value || optimizeSuggestions.value || optimizedContent.value))
const applyButtonLabel = computed(() => {
  if (applyPanelBusy.value) return '分析中...'
  return applyPanelVisible.value ? '收起逐条' : '逐条优化'
})

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
  if (key === 'trainingExperience') return { min: 30, max: 260 }
  if (key === 'customSections') return { min: 20, max: 300 }
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

function resetOptimizePanel() {
  optimizeSuggestions.value = ''
  optimizedContent.value = ''
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function textToHtml(text: string): string {
  return renderOptimizedApplyHtml(props.context, text, props.modelValue) || text
}

// 逐条应用相关函数
async function refreshApplyItems() {
  const config = aiConfigStore.getConfigForFeature('resumeOptimize')
  applyPanelBusy.value = true
  applyPanelError.value = ''
  applyItems.value = []

  if (!config.apiUrl || !config.modelName) {
    applyPanelError.value = '请先在 AI 设置中配置简历优化可用的模型渠道。'
    applyPanelBusy.value = false
    return
  }

  try {
    const result = await generateResumeApplySuggestions(config, props.context, {
      onChunk: () => {},
      onDone: () => {},
      onError: (message) => {
        applyPanelError.value = message
      },
    })
    applyItems.value = result.applyItems
    if (result.applyItems.length === 0 && !applyPanelError.value) {
      applyPanelError.value = '当前内容很好，暂无优化建议。'
    }
  } catch (err) {
    if (!applyPanelError.value) {
      applyPanelError.value = err instanceof Error ? err.message : '逐条优化失败，请稍后重试。'
    }
  } finally {
    applyPanelBusy.value = false
  }
}

function applySingleItem(item: ResumeAssistantApplyItem) {
  // 在当前内容中查找并替换原文
  const currentText = props.modelValue
  const plainCurrent = currentText.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  const plainOriginal = item.original.replace(/\s+/g, ' ').trim()
  const plainSuggested = item.suggested.trim()
  const suggestedHtml = textToHtml(plainSuggested)

  // 尝试精确匹配替换
  let replaced = false
  let newText = currentText

  if (currentText.includes(item.original)) {
    newText = currentText.replace(item.original, suggestedHtml)
    replaced = true
  }

  if (!replaced && currentText.includes(plainOriginal)) {
    newText = currentText.replace(plainOriginal, suggestedHtml)
    replaced = true
  }

  if (!replaced) {
    const htmlFriendlyPattern = escapeRegExp(plainOriginal)
      .replace(/\\ /g, '(?:\\s|&nbsp;|<br\\s*\\/?>(?:\\s)*)+')
    const matcher = new RegExp(htmlFriendlyPattern)
    if (matcher.test(currentText)) {
      newText = currentText.replace(matcher, suggestedHtml)
      replaced = true
    }
  }

  if (!replaced && plainCurrent.includes(plainOriginal)) {
    newText = plainCurrent.replace(plainOriginal, plainSuggested)
    replaced = true
  }

  if (replaced) {
    updateValue(newText)
    // 标记为已应用
    const target = applyItems.value.find(i => i.id === item.id)
    if (target) target.applied = true
  } else {
    applyPanelError.value = '无法自动应用：原文片段在当前内容中未找到精确匹配。请手动应用建议。'
  }
}

function applyAllItems() {
  for (const item of applyItems.value) {
    if (!item.applied && !item.requiresConfirmation && item.riskLevel !== 'high') {
      applySingleItem(item)
    }
  }
}

function dismissApplyItem(id: string) {
  applyItems.value = applyItems.value.filter(item => item.id !== id)
}

async function handleShowApplyPanel(event?: Event) {
  event?.preventDefault()
  event?.stopPropagation()
  if (applyPanelBusy.value) return

  applyPanelVisible.value = !applyPanelVisible.value
  applyPanelError.value = ''

  if (applyPanelVisible.value && applyItems.value.length === 0) {
    await nextTick()
    applyPanelRef.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    await refreshApplyItems()
    await nextTick()
    applyPanelRef.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
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
          {{ isBusy ? '处理中...' : isEmptyField ? 'AI生成' : 'AI优化' }}
        </button>
        <button
          v-if="!isEmptyField"
          type="button"
          class="editor-ai-btn ghost"
          :class="{ active: applyPanelVisible }"
          :disabled="isBusy || applyPanelBusy"
          @mousedown.prevent.stop="handleShowApplyPanel"
          @click.prevent.stop
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {{ applyButtonLabel }}
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
          :busy="isBusy"
          :error="aiError"
          :optimize-suggestions="optimizeSuggestions"
          :optimized-content="optimizedContent"
          :optimized-content-html="optimizedContentHtml"
          @apply-optimized="(mode) => applyOptimizedContent(optimizedContent, mode)"
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
    <div v-if="applyPanelVisible" ref="applyPanelRef" class="inline-apply-panel-wrap">
      <SuggestionApplyPanel
        :items="applyItems"
        :busy="applyPanelBusy"
        :error="applyPanelError"
        @apply-item="applySingleItem"
        @apply-all="applyAllItems"
        @dismiss-item="dismissApplyItem"
        @refresh="refreshApplyItems"
      />
    </div>
  </div>
</template>

<style scoped>
.inline-ai-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.inline-apply-panel-wrap {
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  overflow: hidden;
}

.inline-apply-panel-wrap :deep(.suggestion-apply-panel) {
  max-height: 520px;
  border-radius: 0;
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

.editor-ai-btn.ghost.active {
  background: var(--accent-blue-500);
  color: #fff;
  box-shadow: 0 2px 8px rgba(43, 123, 184, 0.18);
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
