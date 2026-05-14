<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useQuestionBankStore } from '@/stores/questionBank'
import { generateInterviewBank, generateFollowUpQuestions, generateQuestionInsightBase, generateQuestionSampleAnswer } from '@/services/jd/interviewBank'
import type { InterviewQuestion, FollowUpQuestion } from '@/services/jd/interviewBank'
import type { JDData, JDMatchResult, CompanyIntelData } from '@/services/types/jd'

const props = defineProps<{
  jdData: JDData
  resumeText: string
  matchResult: JDMatchResult | null
  companyIntel?: CompanyIntelData | null
}>()

const emit = defineEmits<{
  close: []
}>()

const aiConfigStore = useAiConfigStore()
const jdAnalysisStore = useJdAnalysisStore()
const qbStore = useQuestionBankStore()

// ── 题库数据（引用 Store 实现持久化） ──
const saveSuccessMarker = ref<Record<string, boolean>>({})
const isSavingBatch = ref(false)

const allQuestions = computed(() => jdAnalysisStore.interviewQuestions)
const currentBatch = ref(1)
const focusInput = ref('')
const isGenerating = ref(false)
const isGeneratingFollowUp = ref(false)
const isGeneratingInsight = ref(false) // 正在获取基础解析
const isGeneratingAnswer = ref(false)  // 新增：正在手动生成专家答案
const errorMsg = ref('')

// ── 模型配置 ──
const useCustomModel = ref(false)
const selectedChannelId = ref(aiConfigStore.channels[0]?.id || '')
const selectedModelId = ref('')

const channels = computed(() => aiConfigStore.channels)

const currentChannel = computed(() =>
  channels.value.find(c => c.id === selectedChannelId.value)
)

const modelOptions = computed(() => {
  const ch = currentChannel.value
  if (!ch) return []
  return ch.fetchedModels.length > 0
    ? ch.fetchedModels.map(m => typeof m === 'string' ? { id: m, name: m } : m)
    : (ch.modelName ? [{ id: ch.modelName, name: ch.modelName }] : [])
})

const effectiveConfig = computed(() => {
  if (!useCustomModel.value) {
    return aiConfigStore.getConfigForFeature('jdInterview')
  }
  const ch = currentChannel.value
  if (!ch) return aiConfigStore.getConfigForFeature('jdInterview')
  return {
    providerId: ch.providerId,
    apiUrl: ch.apiUrl.trim(),
    apiToken: ch.apiToken.trim(),
    modelName: selectedModelId.value || ch.modelName,
    isFreeTier: false,
  }
})

// ── 已有题目列表（避免重复） ──
const previousQuestionTexts = computed(() =>
  allQuestions.value.map(q => q.question)
)

// ── 状态：当前选中题 ──
const activeQuestionId = ref<string | null>(null)

const activeQuestion = computed(() => {
  return allQuestions.value.find(q => q.id === activeQuestionId.value) || null
})

const activeQuestionIndex = computed(() => {
  if (!activeQuestion.value) return -1
  return allQuestions.value.findIndex((q) => q.id === activeQuestion.value?.id)
})

const activeQuestionFollowUps = computed<FollowUpQuestion[]>(() => activeQuestion.value?.followUps ?? [])

async function selectQuestion(id: string) {
  activeQuestionId.value = id
  const target = allQuestions.value.find(q => q.id === id)
  
  // 核心优化：点击后仅自动获取“基础解析”（意图、逻辑、要点等），不含答案
  if (target && !target.context && !isGeneratingInsight.value) {
    isGeneratingInsight.value = true
    try {
      const insight = await generateQuestionInsightBase(
        effectiveConfig.value,
        target.question,
        props.jdData,
        props.resumeText
      )
      Object.assign(target, insight)
    } catch (err: any) {
      console.error('Insight failed:', err)
    } finally {
      isGeneratingInsight.value = false
    }
  }
}

async function handleCollectQuestion() {
  const q = activeQuestion.value
  if (!q || saveSuccessMarker.value[q.id] || qbStore.isLoading) return

  const success = await qbStore.addQuestion({
    content: q.question,
    category: q.category,
    tags: q.followUpHints || [],
    reference_answer: q.sampleAnswer || q.answerStructure || '',
    user_notes: q.context || '',
    source: 'JD深挖题',
    difficulty: q.difficulty === '高级' ? 5 : q.difficulty === '中级' ? 3 : 1,
    focus_area: q.keyPoints[0] || '',
    intent: q.context,
    framework: q.answerStructure,
    jd_analysis_id: jdAnalysisStore.analysisMeta?.analysisId || undefined,
  })

  if (success) {
    saveSuccessMarker.value = { ...saveSuccessMarker.value, [q.id]: true }
  }
}

/** 批量收藏所有题目 */
async function handleCollectAll() {
  const uncollected = allQuestions.value.filter((q) => !saveSuccessMarker.value[q.id])
  if (!uncollected.length || isSavingBatch.value) return

  isSavingBatch.value = true
  const items = uncollected.map((q) => ({
    content: q.question,
    category: q.category,
    tags: q.followUpHints || [],
    reference_answer: q.sampleAnswer || q.answerStructure || '',
    user_notes: q.context || '',
    source: 'JD深挖题',
    difficulty: q.difficulty === '高级' ? 5 : q.difficulty === '中级' ? 3 : 1,
    focus_area: q.keyPoints[0] || '',
    intent: q.context,
    framework: q.answerStructure,
    jd_analysis_id: jdAnalysisStore.analysisMeta?.analysisId || undefined,
  }))

  const count = await qbStore.addQuestionBatch(items)
  if (count > 0) {
    const newMarkers: Record<string, boolean> = { ...saveSuccessMarker.value }
    uncollected.forEach((q) => { newMarkers[q.id] = true })
    saveSuccessMarker.value = newMarkers
  }
  isSavingBatch.value = false
}

// 新增：手动触发生成专家级参考答案
async function handleGenerateSampleAnswer(question: InterviewQuestion) {
  if (isGeneratingAnswer.value) return
  isGeneratingAnswer.value = true
  try {
    const answer = await generateQuestionSampleAnswer(
      effectiveConfig.value,
      question.question,
      props.jdData,
      props.resumeText
    )
    question.sampleAnswer = answer
  } catch (err: any) {
    errorMsg.value = err?.message || '生成参考答案失败喵'
  } finally {
    isGeneratingAnswer.value = false
  }
}

// ── 生成题库 ──
async function handleGenerate() {
  if (isGenerating.value) return
  if (!aiConfigStore.isConfigured) {
    errorMsg.value = '请先在 AI 设置中配置接口'
    return
  }

  isGenerating.value = true
  errorMsg.value = ''
  let hasSetFirst = false

  const config = effectiveConfig.value
  const focusAreas = focusInput.value.trim()
    ? focusInput.value.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean)
    : []

  try {
    await generateInterviewBank(
      config,
      props.jdData,
      props.resumeText,
      props.matchResult,
      previousQuestionTexts.value,
      focusAreas,
      {
        onChunk: (chunk: string) => {
          try {
            const batch = JSON.parse(chunk)
            if (batch.questions?.length) {
              jdAnalysisStore.interviewQuestions.push(...batch.questions)
              
              // ⚡️ 即时响应：只要有了第一组题目，就自动选中首题
              if (!hasSetFirst) {
                hasSetFirst = true
                const firstId = batch.questions[0].id
                selectQuestion(firstId) // 使用 selectQuestion 触发异步加载解析
                isGenerating.value = false 
              }
            }
          } catch { /* 忽略分片解析异常 */ }
        },
        onDone: () => {},
        onError: (msg: string) => { errorMsg.value = msg }
      },
      undefined,
      props.companyIntel,
    )
    currentBatch.value++
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      errorMsg.value = err?.message || '方案生成遇到异常，请检查网络或重试。'
    }
  } finally {
    isGenerating.value = false
  }
}

// ── 重新生成（清空并重来） ──
async function handleRegenerate() {
  if (isGenerating.value) return
  
  jdAnalysisStore.interviewQuestions = []
  jdAnalysisStore.interviewBatchSummary = ''
  activeQuestionId.value = null
  errorMsg.value = ''
  
  await handleGenerate()
}

// ── 深度追问 ──
const followUpTargetId = ref<string | null>(null)

async function handleGenerateFollowUp(question: InterviewQuestion) {
  if (isGeneratingFollowUp.value) return
  if (!aiConfigStore.isConfigured) {
    errorMsg.value = '请先在 AI 设置中配置接口'
    return
  }

  isGeneratingFollowUp.value = true
  followUpTargetId.value = question.id
  errorMsg.value = ''

  const config = effectiveConfig.value
  const existingFollowUps = (question.followUps || []).map(f => f.question)

  try {
    const followUps = await generateFollowUpQuestions(
      config,
      question.question,
      question.sampleAnswer,
      props.jdData,
      props.resumeText,
      existingFollowUps,
      { onChunk: () => {}, onDone: () => {}, onError: (msg: string) => { throw new Error(msg) } },
    )

    const target = allQuestions.value.find(q => q.id === question.id)
    if (target) {
      target.followUps = [...(target.followUps || []), ...followUps]
    }
  } catch (err: any) {
    errorMsg.value = err?.message || '生成追问失败，请重试'
  } finally {
    isGeneratingFollowUp.value = false
    followUpTargetId.value = null
  }
}

// ── UI 辅助属性 ──
const difficultyColor: Record<string, string> = {
  '初级': '#16a34a',
  '中级': '#d97706',
  '高级': '#dc2626',
}

const categoryIcon: Record<string, string> = {
  '技术原理': '🔬',
  '项目实战': '🛠',
  '系统设计': '🏗',
  '行为面试': '💬',
}
</script>

<template>
  <section class="interview-bank-panel">
    <div class="panel-container glass-panel">
      <!-- 顶部控制台 -->
      <header class="bank-header">
        <div class="header-left">
          <div class="header-titles">
            <h2 class="bank-title">面试演练</h2>
            <span class="bank-subtitle">基于岗位画像与个人背景的深度测验方案</span>
          </div>
          <span class="bank-badge" v-if="allQuestions.length">{{ allQuestions.length }} 题</span>
          <div class="header-actions" v-if="allQuestions.length && !isGenerating">
            <button class="regen-action-btn" @click="handleRegenerate">
              <span class="icon">🔄</span> 重新生成
            </button>
          </div>
        </div>
        <div class="header-right">
          <button class="close-btn action-ghost" @click="emit('close')">关闭视窗</button>
        </div>
      </header>

      <div class="dual-pane-workspace">
        <!-- 左栏：控制与题单池 -->
        <aside class="left-pane">
          <div class="config-zone">
            <!-- 关注领域 -->
            <div class="focus-bar">
              <input class="focus-input" v-model="focusInput" placeholder="输入你想被深挖的领域、项目或技术栈..." />
            </div>

            <button v-if="allQuestions.length === 0 || isGenerating" class="gen-btn glow-btn" :disabled="isGenerating" @click="handleGenerate">
              <span v-if="isGenerating" class="spinner"></span>
              <span>{{ isGenerating ? '正在命题中...' : '启动智能演练' }}</span>
            </button>
            <div class="error-toast" v-if="errorMsg">{{ errorMsg }}</div>
          </div>

          <div class="question-list">
            <div class="empty-list" v-if="!allQuestions.length && !isGenerating">
              <div class="empty-list-icon">📝</div>
              <span>左侧出题，右侧解析</span>
            </div>
            
            <div
              v-for="(q, index) in allQuestions"
              :key="q.id"
              class="q-list-item"
              :class="{ active: activeQuestionId === q.id }"
              @click="selectQuestion(q.id)"
            >
              <div class="q-list-meta">
                <span class="q-list-cat">{{ categoryIcon[q.category] || '📝' }} {{ q.category }}</span>
                <span class="q-list-diff" :style="{ color: difficultyColor[q.difficulty] || '#64748b' }">{{ q.difficulty }}</span>
              </div>
              <p class="q-list-title"><b>{{ index + 1 }}. </b>{{ q.question }}</p>
            </div>
            
            <!-- 生成占位动画 -->
            <div class="loading-skeletons" v-if="isGenerating">
              <div class="skeleton-card" v-for="i in 3" :key="i"></div>
            </div>
          </div>
        </aside>

        <!-- 右栏：深度解析与对抗 -->
        <main class="right-pane">
          <template v-if="activeQuestion">
            <div class="active-q-header">
              <div class="active-q-header-top">
                <h3 class="active-q-title">
                  <span class="active-q-num">{{ activeQuestionIndex + 1 }}.</span>
                  {{ activeQuestion.question }}
                </h3>
                <div class="collect-actions">
                  <button class="collect-btn" :class="{ saved: saveSuccessMarker[activeQuestion.id] }" :disabled="saveSuccessMarker[activeQuestion.id] || qbStore.isLoading" @click="handleCollectQuestion" title="保存到题库">
                    <svg width="16" height="16" viewBox="0 0 24 24" :fill="saveSuccessMarker[activeQuestion.id] ? '#f59e0b' : 'none'" :stroke="saveSuccessMarker[activeQuestion.id] ? '#f59e0b' : 'currentColor'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    <span>{{ saveSuccessMarker[activeQuestion.id] ? '已保存' : '收藏' }}</span>
                  </button>
                  <button v-if="allQuestions.length > 1" class="collect-btn batch" :disabled="isSavingBatch" @click="handleCollectAll" title="收藏全部题目">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><circle cx="12" cy="15" r="2"/></svg>
                    <span>{{ isSavingBatch ? '保存中...' : '全部收藏' }}</span>
                  </button>
                </div>
              </div>
              <p class="active-q-context" v-if="activeQuestion.context"><strong>出题意图：</strong>{{ activeQuestion.context }}</p>
            </div>

            <div class="active-q-content" :class="{ 'insight-loading': isGeneratingInsight }">
              <!-- 解析加载中的骨架屏覆盖 -->
              <div class="insight-loading-overlay" v-if="isGeneratingInsight">
                <div class="loading-spinner-container">
                  <span class="spinner-blue"></span>
                  <p>AI 专家正在深度拆解本题...</p>
                </div>
              </div>

              <!-- 答题框架 -->
              <div class="content-block logic-block" v-if="activeQuestion.answerStructure">
                <h4 class="block-title"><span class="icon">🧠</span> 回答逻辑</h4>
                <p class="block-text">{{ activeQuestion.answerStructure }}</p>
              </div>

              <!-- 参考答案（手动生成模式） -->
              <div class="content-block answer-block">
                <h4 class="block-title"><span class="icon">✨</span> 参考回答</h4>
                
                <div v-if="activeQuestion.sampleAnswer" class="answer-ready-area">
                  <details open class="ref-details">
                    <summary class="ref-summary">查看 AI 推荐口径</summary>
                    <div class="ref-content-p">
                      <p class="block-text answer-text">{{ activeQuestion.sampleAnswer }}</p>
                    </div>
                  </details>
                </div>
                
                <div v-else class="answer-trigger-area">
                  <button 
                    class="gen-answer-btn" 
                    :disabled="isGeneratingAnswer || isGeneratingInsight"
                    @click="handleGenerateSampleAnswer(activeQuestion)"
                  >
                    <span v-if="isGeneratingAnswer" class="spinner-sm-blue"></span>
                    <span>{{ isGeneratingAnswer ? '正在定制回答...' : '生成参考答案' }}</span>
                  </button>
                </div>
              </div>

              <!-- 避坑与要点 -->
              <div class="split-blocks" v-if="activeQuestion.keyPoints.length">
                <div class="content-block highlight-block">
                  <h4 class="block-title"><span class="icon">✅</span> 加分要点</h4>
                  <ul class="styled-list">
                    <li v-for="(point, i) in activeQuestion.keyPoints" :key="i">{{ point }}</li>
                  </ul>
                </div>
                <div class="content-block pitfall-block" v-if="activeQuestion.pitfalls.length">
                  <h4 class="block-title"><span class="icon">💣</span> 避坑指南</h4>
                  <ul class="styled-list">
                    <li v-for="(point, i) in activeQuestion.pitfalls" :key="i">{{ point }}</li>
                  </ul>
                </div>
              </div>

              <!-- 连环追问模块 -->
              <div class="followup-zone">
                <div class="followup-header">
                  <h4 class="block-title"><span class="icon">🔥</span> 面试追问项</h4>
                  <button 
                    class="followup-trigger-btn" 
                    :disabled="(isGeneratingFollowUp && followUpTargetId === activeQuestion.id) || isGeneratingInsight"
                    @click="handleGenerateFollowUp(activeQuestion)"
                  >
                    <span v-if="isGeneratingFollowUp && followUpTargetId === activeQuestion.id" class="spinner-sm"></span>
                    {{ (isGeneratingFollowUp && followUpTargetId === activeQuestion.id) ? '正在生成追问...' : '生成连环追问' }}
                  </button>
                </div>
                
                <div class="followup-list" v-if="activeQuestionFollowUps.length">
                  <div class="followup-card" v-for="fu in activeQuestionFollowUps" :key="fu.id">
                    <div class="fu-header">
                      <span class="fu-badge">Depth {{ fu.depth }}</span>
                      <strong class="fu-question">{{ fu.question }}</strong>
                    </div>
                    <div class="fu-intent">{{ fu.intent }}</div>
                    <div class="fu-answer"><strong>应对口径：</strong>{{ fu.sampleAnswer }}</div>
                  </div>
                </div>
                
                <div class="hints-tags" v-else-if="activeQuestion.followUpHints?.length">
                  <span class="hint-lbl">可能追问方向预判：</span>
                  <span class="hint-tag" v-for="(h, i) in activeQuestion.followUpHints" :key="i">{{ h }}</span>
                </div>
              </div>
            </div>
          </template>
          
          <div class="right-empty-state" v-else>
            <div class="empty-visual">
               <svg class="radar-svg" viewBox="0 0 100 100">
                 <circle cx="50" cy="50" r="40" stroke="rgba(56,189,248,0.2)" stroke-width="1" fill="none"/>
                 <circle cx="50" cy="50" r="25" stroke="rgba(56,189,248,0.4)" stroke-width="1" fill="none"/>
                 <circle cx="50" cy="50" r="10" fill="rgba(56,189,248,0.6)"/>
                 <path class="scanner" d="M50 50 L50 10 A40 40 0 0 1 90 50 Z" fill="rgba(56,189,248,0.2)"/>
               </svg>
            </div>
            <h3>实战演练区</h3>
            <p>在左侧生成题库后，点击题目即可查看深度解析与标准回答框架。</p>
          </div>
        </main>
      </div>
    </div>
  </section>
</template>

<style scoped>
.interview-bank-panel {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  animation: fade-in 0.3s ease;
}

@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

.panel-container {
  width: 100%;
  max-width: 1400px;
  height: 100%;
  max-height: 900px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 1);
}

/* Header */
.bank-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 30px;
  background: #fff;
  border-bottom: 1px solid #f1f5f9;
}

.header-left { display: flex; align-items: center; gap: 16px; }
.header-titles { display: flex; flex-direction: column; }
.bank-title { margin: 0; font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
.bank-subtitle { font-size: 13px; color: #64748b; font-weight: 600; }
.bank-badge { padding: 4px 12px; background: #f1f5f9; border-radius: 20px; font-size: 13px; font-weight: 800; color: #3b82f6; }

.action-ghost { border: 1px solid #cbd5e1; background: #fff; padding: 10px 20px; border-radius: 12px; font-weight: 700; color: #475569; cursor: pointer; transition: all 0.2s; }
.action-ghost:hover { border-color: #ef4444; color: #ef4444; background: #fef2f2; }

/* Dual Pane Layout */
.dual-pane-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Left Pane */
.left-pane {
  width: 380px;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.config-zone {
  padding: 20px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.focus-input { width: 100%; height: 44px; padding: 0 16px; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 14px; background: #f8fafc; transition: all 0.3s; }
.focus-input:focus { outline: none; border-color: #3b82f6; background: #fff; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

.gen-btn { width: 100%; height: 48px; border: none; border-radius: 12px; background: linear-gradient(135deg, #0ea5e9, #6366f1); color: #fff; font-size: 15px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 8px 20px rgba(99, 102, 241, 0.25); }
.gen-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(99, 102, 241, 0.35); }
.gen-btn:disabled { filter: grayscale(0.5); opacity: 0.7; cursor: not-allowed; }

.error-toast { color: #dc2626; font-size: 12px; font-weight: 700; background: #fef2f2; padding: 8px 12px; border-radius: 8px; }

.question-list { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }

.empty-list { text-align: center; color: #94a3b8; font-size: 14px; padding: 40px 0; }
.empty-list-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }

.q-list-item { 
  padding: 14px 16px; 
  background: #fff; 
  border: 1px solid #f1f5f9; 
  border-radius: 16px; 
  cursor: pointer; 
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
  position: relative; 
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 90px;
  height: auto; /* 允许根据内容高度自适应 */
  overflow: hidden; 
}

.q-list-item:hover { 
  border-color: #e2e8f0; 
  transform: translateX(4px); 
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.q-list-item.active { 
  border-color: #3b82f6; 
  background: #eff6ff; 
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.12); 
}

.q-list-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #3b82f6;
}

.q-list-meta { 
  display: flex; 
  gap: 8px; 
  align-items: center;
  flex-shrink: 0;
}

.q-list-cat { 
  font-size: 11px; 
  font-weight: 800; 
  color: #6366f1; 
  background: #f5f3ff; 
  padding: 2px 8px; 
  border-radius: 6px; 
}

.q-list-diff { 
  font-size: 11px; 
  font-weight: 800; 
}

.q-list-title { 
  margin: 0; 
  font-size: 14px; 
  font-weight: 700; 
  color: #1e293b; 
  line-height: 1.5; 
  /* 严格显示两行喵 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  height: 2.8em; /* 确保刚好容纳两行文字的高度 */
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
}

/* Right Pane */
.right-pane { flex: 1; min-width: 0; background: #fff; overflow-y: auto; position: relative; }

.active-q-header { padding: 32px 40px 24px; background: linear-gradient(180deg, #f8fafc 0%, #fff 100%); border-bottom: 1px solid #f1f5f9; }
.active-q-header-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
.active-q-title { margin: 0; font-size: 24px; font-weight: 900; color: #0f172a; line-height: 1.4; letter-spacing: -0.5px; flex: 1; }
.active-q-context { margin: 0; font-size: 15px; color: #64748b; line-height: 1.6; }

.collect-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.collect-btn:hover:not(:disabled) {
  background: #f8fafc;
  color: #3b82f6;
  border-color: #bfdbfe;
}

.collect-btn.saved {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.3);
  color: #f59e0b;
}

.active-q-content { padding: 32px 40px; display: flex; flex-direction: column; gap: 24px; }

.content-block { padding: 24px; border-radius: 16px; border: 1px solid #f1f5f9; background: #fff; }
.block-title { margin: 0 0 16px; font-size: 16px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px; }
.block-text { margin: 0; font-size: 15px; color: #334155; line-height: 1.8; }
.answer-text { white-space: pre-wrap; font-weight: 500; }

.logic-block { background: #f8fafc; border-color: #e2e8f0; }
.answer-block { background: #eff6ff; border-color: #bfdbfe; border-left: 4px solid #3b82f6; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.05); }

.split-blocks { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.highlight-block { background: #f0fdf4; border-color: #bbf7d0; }
.pitfall-block { background: #fef2f2; border-color: #fecaca; }

.styled-list { margin: 0; padding-left: 20px; }
.styled-list li { margin-bottom: 8px; font-size: 14px; line-height: 1.6; color: #334155; }
.highlight-block li::marker { content: '✨ '; }
.pitfall-block li::marker { content: '❌ '; }

/* Follow-up / Radar Empty State */
.followup-zone { margin-top: 16px; padding: 24px; background: #faf5ff; border: 1px solid #e9e5ff; border-radius: 16px; }
.followup-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.followup-trigger-btn { height: 40px; padding: 0 20px; border-radius: 10px; background: #8b5cf6; color: #fff; border: none; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.2s; }
.followup-trigger-btn:hover:not(:disabled) { background: #7c3aed; }
.followup-trigger-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.followup-card { padding: 16px; background: #fff; border-radius: 12px; border: 1px solid #ddd6fe; margin-bottom: 12px; }
.fu-header { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 8px; }
.fu-badge { background: #8b5cf6; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 900; white-space: nowrap; }
.fu-question { font-size: 15px; color: #1e293b; line-height: 1.5; margin: 0; }
.fu-intent { font-size: 13px; color: #8b5cf6; font-weight: 600; margin-bottom: 8px; }
.fu-answer { font-size: 14px; color: #475569; line-height: 1.6; margin: 0; white-space: pre-wrap; }

.hints-tags { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hint-lbl { font-size: 13px; font-weight: 700; color: #64748b; }
.hint-tag { background: #fff; padding: 4px 12px; border-radius: 8px; border: 1px solid #ddd6fe; font-size: 12px; color: #7c3aed; font-weight: 600; }

.right-empty-state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.7; }
.right-empty-state h3 { font-size: 24px; color: #0f172a; margin: 24px 0 12px; }
.right-empty-state p { color: #64748b; font-size: 15px; }

/* Radar SVG Animation */
.radar-svg { width: 120px; height: 120px; }
.scanner { transform-origin: 50px 50px; animation: scan 3s linear infinite; }
@keyframes scan { 100% { transform: rotate(360deg); } }

/* Loaders */
/* ═══ 按需解析加载动画 ═══ */
.active-q-content {
  position: relative;
}

.insight-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
}

.loading-spinner-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.spinner-blue {
  width: 40px;
  height: 40px;
  border: 4px solid #eff6ff;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.loading-spinner-container p {
  color: #3b82f6;
  font-size: 14px;
  font-weight: 700;
  margin: 0;
}

/* 渐显效果 */
.active-q-content {
  animation: slide-up-subtle 0.4s ease-out;
}

@keyframes slide-up-subtle {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ═══ 细节微调 ═══ */
.q-list-item { margin-bottom: 12px; }
.q-list-title { -webkit-line-clamp: 2; }
.content-block { border-radius: 12px; border: 1px solid #f1f5f9; box-shadow: none; background: #fafafa; }
.logic-block { background: #fdfdfd; border-color: #f1f1f1; }
.answer-block { background: #f8fafc; border-color: #e5eef5; border-left: none; }
.ref-details { border-radius: 8px; background: transparent; border: 1px solid #e2e8f0; }
.ref-summary { font-size: 13px; color: #64748b; font-weight: 700; padding: 10px 14px; }
.ref-summary:hover { background: #f8fafc; }
.block-title { font-size: 14px; color: #475569; margin-bottom: 12px; }
.active-q-title { font-size: 22px; color: #1e293b; margin-bottom: 16px; }

/* 修正左侧间距堆叠 */
.question-list { padding: 16px; gap: 12px; }

/* 专家答案生成按钮样式 */
.gen-answer-btn {
  width: 100%;
  height: 44px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.gen-answer-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.3);
}

.gen-answer-btn:disabled {
  filter: grayscale(0.5);
  opacity: 0.7;
}

.answer-hint {
  margin-top: 10px;
  font-size: 12px;
  color: #64748b;
  text-align: center;
  font-weight: 600;
}

.spinner-sm-blue {
  width: 16px;
  height: 16px;
  border: 3px solid rgba(255,255,255,0.3);
  border-top: 3px solid #fff;
  border-radius: 50%;
  animation: rotate 0.8s linear infinite;
}

/* 列表项微调确保两行 */
.q-list-item {
  min-height: 100px; /* 稍微增加一点确保两行稳稳当当 */
}

/* 顶部重新生成按钮 */
.header-actions {
  margin-left: 20px;
}

.regen-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.regen-action-btn:hover {
  background: #e2e8f0;
  color: #1e293b;
  border-color: #cbd5e1;
}

.regen-action-btn .icon {
  font-size: 14px;
  transition: transform 0.4s ease;
}

.regen-action-btn:hover .icon {
  transform: rotate(180deg);
}
</style>
