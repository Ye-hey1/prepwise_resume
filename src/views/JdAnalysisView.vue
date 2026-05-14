<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useAiConfigStore } from '@/stores/aiConfig'

defineOptions({ name: 'JdAnalysisView' })
import { useResumeStore } from '@/stores/resume'
import { matchResumeToJD, generateJdPrepInsight, generateCompanyIntel, analyzeResumeOverview, getJDOptimizationSuggestions, formatResumeForAI } from '@/services/jdService'

import JdInputTab from '@/components/jd/JdInputTab.vue'
import JdPrepHistoryPanel from '@/components/jd/JdPrepHistoryPanel.vue'
import OverviewTab from '@/components/jd/OverviewTab.vue'
import JdActionEnhanceCard from '@/components/jd/JdActionEnhanceCard.vue'
import JdMatchScoreCard from '@/components/jd/JdMatchScoreCard.vue'
import JdInterviewPrepCard from '@/components/jd/JdInterviewPrepCard.vue'
import JdInterviewBankPanel from '@/components/jd/JdInterviewBankPanel.vue'
import MatchResultTab from '@/components/jd/MatchResultTab.vue'
import OptimizeTab from '@/components/jd/OptimizeTab.vue'
import CompanyIntelCard from '@/components/jd/CompanyIntelCard.vue'
import CompanyIntelDialog from '@/components/jd/CompanyIntelDialog.vue'
import InterviewPerformanceCard from '@/components/jd/InterviewPerformanceCard.vue'
import NextActionCard from '@/components/jd/NextActionCard.vue'
import LoopStepper from '@/components/jd/LoopStepper.vue'
import LearningRadarChart from '@/components/jd/LearningRadarChart.vue'
import ScoreTrendTimeline from '@/components/jd/ScoreTrendTimeline.vue'
import { useJdInterviewLoop } from '@/composables/useJdInterviewLoop'
import { useLearningProgressStore } from '@/stores/learningProgress'

const store = useJdAnalysisStore()
const aiConfigStore = useAiConfigStore()
const resumeStore = useResumeStore()
const router = useRouter()
const learningStore = useLearningProgressStore()

const config = computed(() => aiConfigStore.getConfigForFeature('jdAnalysis'))
const resumeText = computed(() => formatResumeForAI(resumeStore.exportToJSON() as Parameters<typeof formatResumeForAI>[0]))
const showBankPanel = ref(false)
const showMatchResultPanel = ref(false)
const showOptimizePanel = ref(false)
const showCompanyIntelDialog = ref(false)
const activeTab = ref('overview')

/** 当前分析对应的历史记录项（用于读取面试表现数据） */
const currentHistoryItem = computed(() =>
  store.analysisMeta?.analysisId
    ? store.findHistoryItemByAnalysisId(store.analysisMeta.analysisId)
    : null,
)

/** 闭环状态机 */
const loop = useJdInterviewLoop(computed(() => store.analysisMeta?.analysisId ?? null))

/** 基于面试弱项生成针对性优化建议 */
function handleGenerateInterviewSuggestions() {
  const analysisId = store.analysisMeta?.analysisId
  if (!analysisId) return
  store.generateInterviewDrivenOptimizations(analysisId)
}

/** 面试分数趋势 */
const interviewScoreTrend = computed(() => {
  const recordIds = currentHistoryItem.value?.linkedInterviewRecordIds ?? []
  if (!recordIds.length) return []
  const records = store.loadLinkedInterviewRecords(recordIds)
  return records
    .map((r) => ({ date: r.date, score: r.totalScore ?? 0, passed: r.passed ?? false }))
    .reverse()
})

/** 跳转到面试页面 */
function goToInterview() {
  router.push({ name: 'ai-interviewer', query: buildInterviewRouteQuery('simulation') })
}

/** 处理闭环下一步操作 */
function handleLoopAction() {
  const phase = loop.currentPhase.value
  switch (phase) {
    case 'jd-input':
    case 'analysis':
      // 滚动到 JD 输入区
      activeTab.value = 'jd'
      break
    case 'match-review':
    case 'interview-prep':
      goToInterview()
      break
    case 'interview-done':
    case 'weakness-analysis':
      handleGenerateInterviewSuggestions()
      break
    case 'resume-optimize':
    case 're-match':
      showOptimizePanel.value = true
      break
    default:
      break
  }
}

function simpleHash(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

function buildCurrentJdSignature(): string {
  return `jd_${simpleHash(store.jdText.trim())}`
}

function buildCurrentResumeSignature(): string {
  return `resume_${simpleHash(JSON.stringify(resumeStore.exportToJSON() ?? {}))}`
}

function ensureCurrentAnalysisMeta() {
  if (!store.jdText.trim()) return

  const jdSignature = buildCurrentJdSignature()
  const resumeSignature = buildCurrentResumeSignature()
  const hasCurrentMeta = store.analysisMeta?.jdSignature === jdSignature
    && store.analysisMeta?.resumeSignature === resumeSignature

  if (!hasCurrentMeta) {
    store.markAnalysisMeta(jdSignature, resumeSignature)
  }

  if (store.allStagesCompleted) {
    store.saveCurrentToHistory()
  }
}

function buildInterviewRouteQuery(autoStart: 'prep' | 'simulation') {
  ensureCurrentAnalysisMeta()
  const query: Record<string, string> = { autoStart }
  const analysisId = store.analysisMeta?.analysisId?.trim()

  if (analysisId) {
    query.analysisId = analysisId
    query.source = 'jd-analysis'
  }

  return query
}

type AnalysisStageKey = 'match' | 'overview' | 'suggestions' | 'prepInsight' | 'companyIntel'

const stageCards = computed(() => {
  const hasSuggestionsResult = store.suggestions.length > 0 || (!!store.analysisMeta && !store.stageLoading.suggestions && !store.stageError.suggestions)
  const cards: Array<{
    key: AnalysisStageKey
    title: string
    description: string
    loading: boolean
    error: string
    completed: boolean
  }> = [
    {
      key: 'match',
      title: '人岗匹配',
      description: '逐条核对 JD 要求与简历证据，沉淀优势与缺口。',
      loading: store.stageLoading.match,
      error: store.stageError.match,
      completed: Boolean(store.matchResult),
    },
    {
      key: 'overview',
      title: '全局诊断',
      description: '从岗位视角总结简历亮点、风险和更适合的投递方向。',
      loading: store.stageLoading.overview,
      error: store.stageError.overview,
      completed: Boolean(store.overview),
    },
    {
      key: 'suggestions',
      title: '优化建议',
      description: '输出可直接落地的改写建议，服务于投递和后续回写。',
      loading: store.stageLoading.suggestions,
      error: store.stageError.suggestions,
      completed: hasSuggestionsResult,
    },
    {
      key: 'prepInsight',
      title: '备面洞察',
      description: '沉淀推荐项目故事、备面优先级和高风险追问。',
      loading: store.stageLoading.prepInsight,
      error: store.stageError.prepInsight,
      completed: Boolean(store.prepInsight),
    },
    {
      key: 'companyIntel' as AnalysisStageKey,
      title: '公司情报',
      description: '搜索公司业务方向、面试风格、技术栈与工程文化。',
      loading: store.stageLoading.companyIntel,
      error: store.stageError.companyIntel,
      completed: Boolean(store.companyIntel),
    },
  ]

  // 从自动分析卡片中排除公司情报（改为手动触发），然后添加状态信息
  return cards.filter(c => c.key !== 'companyIntel').map((card) => {
    const status = card.loading ? 'loading' : card.error ? 'error' : card.completed ? 'completed' : 'idle'
    return {
      ...card,
      status,
      statusLabel: status === 'loading'
        ? '进行中'
        : status === 'error'
          ? '失败'
          : status === 'completed'
            ? '已完成'
            : '待执行',
      actionLabel: card.error ? '重试' : card.completed ? '重跑' : '执行',
    }
  })
})

const completedStageCount = computed(() => stageCards.value.filter(card => card.status === 'completed').length)
const failedStageCount = computed(() => stageCards.value.filter(card => card.status === 'error').length)
const loadingStageLabel = computed(() => {
  const active = stageCards.value.find(card => card.status === 'loading')
  return active?.title || ''
})
const dashSummaryLabel = computed(() => {
  if (failedStageCount.value > 0) return '分析需关注'
  if (store.isAnyStageLoading) return '分析进行中'
  return '分析状态'
})
const dashSummaryValue = computed(() => {
  if (failedStageCount.value > 0) return `${failedStageCount.value} 个模块待修复`
  if (store.isAnyStageLoading && loadingStageLabel.value) return `正在生成 ${loadingStageLabel.value}`
  return `已完成 ${completedStageCount.value} / ${stageCards.value.length}`
})
const dashSummarySub = computed(() => {
  if (failedStageCount.value > 0) return '可在下方阶段卡片中直接重试失败模块。'
  if (store.isAnyStageLoading) return '分析结果会在各模块完成后逐步呈现。'
  return '可以继续查看明细，或在下方结果区重新解析。'
})

function handleLoadingChange(loading: boolean, label: string) {
  // 拦截来自 JdInputTab finally 块的强制 false，以防覆盖我们后续阶段的 loading
  if (!loading && store.jdData) {
    return
  }
  store.setLoading(loading, label)
}

async function handleParsed(data: any) {
  store.clearComputedResults()
  store.clearStageStreamText()
  store.analysisAbortController = new AbortController()
  store.jdData = data
  // JD 解析完成后立刻进入 Dashboard（hasCompletedAnalysis 现在只检查 jdData）
  // 后续阶段并行启动，不阻塞 UI

  // 并行启动 4 个互不依赖的阶段
  runMatchStage(data)
  runOverviewStage()
  runSuggestionsStage(data)
  // 公司情报不再自动执行，改为手动触发
}

/** 阶段 2：人岗匹配 → 完成后串行启动备面洞察 */
async function runMatchStage(data: any) {
  store.stageLoading.match = true
  store.stageError.match = ''
  store.stageStartTime.match = Date.now()
  const signal = store.analysisAbortController?.signal ?? undefined
  try {
    const matchRes = await matchResumeToJD(
      config.value, data, resumeText.value,
      {
        onChunk: (text: string) => { store.stageStreamText.match = text },
        onDone: () => {},
        onError: (msg) => { throw new Error(msg) },
      },
      signal,
    )
    store.matchResult = matchRes
    // 备面洞察只依赖匹配结果，立即启动不等全局诊断
    runPrepInsightStage(data, matchRes, store.overview)
  } catch (e: any) {
    if (e.name === 'AbortError') return
    store.stageError.match = e.message || '人岗匹配失败'
  } finally {
    store.stageLoading.match = false
    trySaveHistory()
  }
}

/** 阶段 3：简历全局诊断（独立并行） */
async function runOverviewStage() {
  store.stageLoading.overview = true
  store.stageError.overview = ''
  store.stageStartTime.overview = Date.now()
  const signal = store.analysisAbortController?.signal ?? undefined
  try {
    const overviewRes = await analyzeResumeOverview(
      config.value, resumeText.value,
      {
        onChunk: (text: string) => { store.stageStreamText.overview = text },
        onDone: () => {},
        onError: (msg) => { throw new Error(msg) },
      },
      signal,
    )
    store.overview = overviewRes
  } catch (e: any) {
    if (e.name === 'AbortError') return
    store.stageError.overview = e.message || '全局诊断失败'
  } finally {
    store.stageLoading.overview = false
    trySaveHistory()
  }
}

/** 阶段 4：简历优化建议（独立并行） */
async function runSuggestionsStage(data: any) {
  store.stageLoading.suggestions = true
  store.stageError.suggestions = ''
  store.stageStartTime.suggestions = Date.now()
  const signal = store.analysisAbortController?.signal ?? undefined
  try {
    const suggestionsRes = await getJDOptimizationSuggestions(
      config.value, data, resumeText.value,
      {
        onChunk: (text: string) => { store.stageStreamText.suggestions = text },
        onDone: () => {},
        onError: (msg) => { throw new Error(msg) },
      },
      signal,
      store.companyIntel ?? undefined,
    )
    store.suggestions = suggestionsRes
  } catch (e: any) {
    if (e.name === 'AbortError') return
    store.stageError.suggestions = e.message || '优化建议生成失败'
  } finally {
    store.stageLoading.suggestions = false
    trySaveHistory()
  }
}

/** 阶段 5：备面洞察（依赖匹配结果，overview 可选增强） */
async function runPrepInsightStage(data: any, matchRes: any, overview: any = null) {
  store.stageLoading.prepInsight = true
  store.stageError.prepInsight = ''
  store.stageStartTime.prepInsight = Date.now()
  const signal = store.analysisAbortController?.signal ?? undefined
  try {
    const insightRes = await generateJdPrepInsight(
      config.value,
      data,
      resumeText.value,
      matchRes,
      overview,
      {
        onChunk: (text: string) => { store.stageStreamText.prepInsight = text },
        onDone: () => {},
        onError: (msg: string) => { throw new Error(msg) },
      },
      signal,
      store.companyIntel,
    )
    store.prepInsight = insightRes
  } catch (e: any) {
    if (e.name === 'AbortError') return
    store.stageError.prepInsight = e.message || '备面洞察生成失败'
  } finally {
    store.stageLoading.prepInsight = false
    trySaveHistory()
  }
}

/** 阶段 6：公司情报（多搜索渠道 + LLM 提取） */
async function runCompanyIntelStage() {
  const searchProviders = aiConfigStore.getEnabledSearchProviders()
  if (!searchProviders.length) {
    // 未配置可用搜索渠道，静默跳过
    return
  }
  const company = store.targetCompany || store.jdData?.basicInfo.company || ''
  const position = store.targetPosition || store.jdData?.basicInfo.jobTitle || ''
  if (!company.trim()) return

  store.stageLoading.companyIntel = true
  store.stageError.companyIntel = ''
  store.stageStartTime.companyIntel = Date.now()
  const signal = store.analysisAbortController?.signal ?? undefined
  try {
    const intelConfig = aiConfigStore.getConfigForFeature('jdCompanyIntel')
    const result = await generateCompanyIntel(
      intelConfig,
      searchProviders,
      company,
      position,
      store.jdText,
      {
        onChunk: (text: string) => { store.stageStreamText.companyIntel = text },
        onDone: () => {},
        onError: (msg) => { throw new Error(msg) },
      },
      signal,
    )
    store.companyIntel = result
  } catch (e: any) {
    if (e.name === 'AbortError') return
    store.stageError.companyIntel = e.message || '公司情报搜索失败'
  } finally {
    store.stageLoading.companyIntel = false
    trySaveHistory()
  }
}

/** 尝试保存历史——所有阶段完成后自动存档 */
function trySaveHistory() {
  if (!store.isAnyStageLoading && store.allStagesCompleted) {
    store.markAnalysisMeta(buildCurrentJdSignature(), buildCurrentResumeSignature())
    store.saveCurrentToHistory()
  }
}

function handleStartInterview() {
  // 携带 autoStart 参数，告诉面试模块直接进入模拟面试
  router.push({ name: 'ai-interviewer', query: buildInterviewRouteQuery('simulation') })
}
function handleStartInterviewPrep() {
  router.push({ name: 'ai-interviewer', query: buildInterviewRouteQuery('prep') })
}

function retryStage(stage: AnalysisStageKey) {
  if (!store.jdData) return

  // 如果 controller 已 abort 或不存在，新建一个
  if (!store.analysisAbortController || store.analysisAbortController.signal.aborted) {
    store.analysisAbortController = new AbortController()
  }

  if (stage === 'match') {
    store.matchResult = null
    store.prepInsight = null
    store.stageError.match = ''
    store.stageError.prepInsight = ''
    void runMatchStage(store.jdData)
    return
  }

  if (stage === 'overview') {
    store.overview = null
    store.stageError.overview = ''
    void runOverviewStage()
    return
  }

  if (stage === 'suggestions') {
    store.suggestions = []
    store.stageError.suggestions = ''
    void runSuggestionsStage(store.jdData)
    return
  }

  if (stage === 'companyIntel') {
    store.companyIntel = null
    store.stageError.companyIntel = ''
    void runCompanyIntelStage()
    return
  }

  store.prepInsight = null
  store.stageError.prepInsight = ''
  if (store.matchResult) {
    void runPrepInsightStage(store.jdData, store.matchResult)
  } else {
    void runMatchStage(store.jdData)
  }
}

// ── 计时器：每秒刷新，用于显示阶段已用时间 ──
const now = ref(Date.now())
let timerHandle: ReturnType<typeof setInterval> | null = null

function startTimer() {
  if (timerHandle) return
  timerHandle = setInterval(() => { now.value = Date.now() }, 1000)
}

function stopTimer() {
  if (timerHandle) {
    clearInterval(timerHandle)
    timerHandle = null
  }
}

// 监听是否有阶段在 loading，自动启停计时器
import { watch } from 'vue'
watch(() => store.isAnyStageLoading, (loading) => {
  if (loading) startTimer()
  else stopTimer()
}, { immediate: true })

/** 格式化流式预览文本：清理 JSON 标记并截断 */
function formatStreamPreview(text: string): string {
  if (!text) return ''
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  if (cleaned.length > 200) cleaned = `${cleaned.slice(0, 200)}...`
  return cleaned
}

/** 格式化已用时间 */
function formatElapsed(startTime: number): string {
  if (!startTime) return ''
  const diff = Math.max(0, Math.floor((now.value - startTime) / 1000))
  if (diff < 60) return `${diff}s`
  const m = Math.floor(diff / 60)
  const s = diff % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

</script>

<template>
  <section class="view-workspace jd-workspace">
    <div class="dashboard-layout">
      <!-- 状态区 1: 还未完成完整分析，展示输入入口与历史列表 -->
      <template v-if="!store.hasCompletedAnalysis">
        <div class="entry-grid">
          <div class="left-col" style="--entry-delay: 0">
            <JdInputTab
              :config="config"
              v-model:jd-text="store.jdText"
              v-model:target-company="store.targetCompany"
              v-model:target-position="store.targetPosition"
              :jd-data="store.jdData"
              :is-loading="store.isLoading"
              @parsed="handleParsed"
              @loading-change="handleLoadingChange"
              @error="store.setError"
              @reset-analysis="store.resetAnalysisState"
            />
          </div>
          <div class="right-col" style="--entry-delay: 1">
            <JdPrepHistoryPanel 
              :items="store.history"
              :active-id="store.analysisMeta?.analysisId"
              @open="store.openHistoryItem"
              @delete="store.deleteHistoryItem"
              @clear="store.clearHistory"
            />
          </div>
        </div>
      </template>

      <!-- 状态区 2: 分析完成，展示 Prep Dashboard -->
      <template v-else>
        <header class="ds-header-bar">
          <div class="ds-hb-left">
            <h1 class="ds-hb-title">岗位分析</h1>
            <div class="ds-hb-divider"></div>
            <div class="ds-hb-meta-item">
              <span class="lbl">目标公司</span>
              <strong class="val">{{ store.targetCompany || '未填写' }}</strong>
            </div>
            <div class="ds-hb-meta-item">
              <span class="lbl">目标岗位</span>
              <strong class="val">{{ store.targetPosition || '未填写' }}</strong>
            </div>
          </div>

          <div class="ds-hb-right">
            <div class="ds-hb-status">
              <div class="status-ring" :class="{ loading: store.isAnyStageLoading }"></div>
              <span class="val">{{ dashSummaryValue }}</span>
            </div>
            <button class="ds-hb-btn ghost" type="button" @click="store.resetAnalysisState">
              重新解析
            </button>
            <button class="ds-hb-btn primary" type="button" @click="handleStartInterviewPrep">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              进入 AI 面试
            </button>
          </div>
        </header>

        <!-- 闭环进度步骤条（始终可见） -->
        <LoopStepper
          v-if="store.hasCompletedAnalysis"
          :current-phase="loop.currentPhase.value"
          :progress="loop.loopProgress.value"
          @step-click="handleLoopAction"
        />

        <!-- 渐进式分析进度条（后台还有阶段在跑时显示） -->
        <div v-if="store.isAnyStageLoading" class="progressive-bar">
          <div class="progressive-track">
            <div class="progressive-fill"></div>
          </div>
          <div class="progressive-info">
            <span class="progressive-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>
              正在深度分析中...
              <template v-if="store.stageLoading.match">人岗匹配</template>
              <template v-else-if="store.stageLoading.overview">全局诊断</template>
              <template v-else-if="store.stageLoading.suggestions">优化建议</template>
              <template v-else-if="store.stageLoading.prepInsight">备面洞察</template>
              <template v-else-if="store.stageLoading.companyIntel">公司情报</template>
              — 各模块完成后将逐个呈现
            </span>
            <button class="cancel-all-btn" type="button" @click="store.cancelAllStages()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              取消全部
            </button>
          </div>
        </div>

        <div class="ds-hero-section">
          <JdMatchScoreCard 
            :match-result="store.matchResult"
            :is-loading="store.stageLoading.match"
          />
        </div>

        <div class="stage-grid stage-grid-after-score">
          <article
            v-for="card in stageCards"
            :key="card.key"
            class="stage-card"
            :class="[`is-${card.status}`]"
          >
            <div class="stage-card-head">
              <div>
                <h3 class="stage-card-title">{{ card.title }}</h3>
                <p class="stage-card-desc">{{ card.description }}</p>
              </div>
              <span class="stage-chip" :class="[`is-${card.status}`]">{{ card.statusLabel }}</span>
            </div>

            <p v-if="card.error" class="stage-error-text">{{ card.error }}</p>

            <!-- loading 时显示流式预览 + 计时 -->
            <div v-if="card.loading && store.stageStreamText[card.key]" class="stage-stream-preview">
              <p class="stream-text">{{ formatStreamPreview(store.stageStreamText[card.key]) }}</p>
              <span v-if="store.stageStartTime[card.key]" class="stream-elapsed">{{ formatElapsed(store.stageStartTime[card.key]) }}</span>
            </div>
            <div v-else-if="card.loading" class="stage-stream-preview">
              <span v-if="store.stageStartTime[card.key]" class="stream-elapsed">{{ formatElapsed(store.stageStartTime[card.key]) }}</span>
            </div>

            <div class="stage-card-actions">
              <button
                class="stage-action-btn"
                type="button"
                :disabled="card.loading || !store.jdData"
                @click="retryStage(card.key)"
              >
                {{ card.actionLabel }}
              </button>
            </div>
          </article>
        </div>

        <!-- 下行：四张操作入口卡 -->
        <div class="tools-row">
          <article class="bank-entry-card secondary" @click="showMatchResultPanel = true">
            <div class="bank-entry-content">
              <div class="bank-icon-wrap purple">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <h3>岗位拆解</h3>
              <p>扫描 JD 所有要求，逐行核对匹配度和风险并提供雷达视角。</p>
              <span class="bank-act">展开明细 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></span>
            </div>
          </article>

          <article class="bank-entry-card warning" @click="showOptimizePanel = true">
            <div class="bank-entry-content">
              <div class="bank-icon-wrap amber">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </div>
              <h3>简历优化</h3>
              <p>集中查看改写建议，支持比对并批量应用回简历编辑器。</p>
              <span class="bank-act">展开明细 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></span>
            </div>
          </article>

          <article class="bank-entry-card" @click="showBankPanel = true">
            <div class="bank-entry-content">
              <div class="bank-icon-wrap fire">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
              </div>
              <h3>备面演练</h3>
              <p>提取岗位能力模型与简历弱势项，自动生成结构化考题。</p>
              <span class="bank-act">
                演练题库
                <span v-if="store.interviewQuestions.length" class="bank-count-badge">{{ store.interviewQuestions.length }} 题</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </span>
            </div>
          </article>

          <article class="bank-entry-card intel-card" @click="showCompanyIntelDialog = true">
            <div class="bank-entry-content">
              <div class="bank-icon-wrap teal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <h3>公司情报</h3>
              <p>搜索目标公司的业务方向、技术栈、面试风格与工程文化。</p>
              <span class="bank-act">
                {{ store.companyIntel ? '查看详情' : '开始搜集' }}
                <span v-if="store.companyIntel" class="bank-count-badge">已完成</span>
                <span v-else-if="store.stageLoading.companyIntel" class="bank-count-badge">搜集中...</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </span>
            </div>
          </article>
        </div>

        <!-- 面试表现追踪（有面试记录时显示） -->
        <InterviewPerformanceCard
          v-if="currentHistoryItem && (currentHistoryItem.practiceCount ?? 0) > 0"
          :practiceCount="currentHistoryItem.practiceCount ?? 0"
          :lastInterviewScore="currentHistoryItem.lastInterviewScore ?? null"
          :lastInterviewPassed="currentHistoryItem.lastInterviewPassed ?? null"
          :lastWeaknesses="currentHistoryItem.lastWeaknesses ?? []"
          :lastSuggestedResumeModules="currentHistoryItem.lastSuggestedResumeModules ?? []"
          :lastPracticedAt="currentHistoryItem.lastPracticedAt ?? ''"
          :scoreTrend="interviewScoreTrend"
          @start-interview="goToInterview"
          @view-details="activeTab = 'overview'"
          @optimize-resume="handleGenerateInterviewSuggestions"
        />

        <!-- 闭环下一步建议 -->
        <NextActionCard
          v-if="loop.nextAction.value"
          :nextAction="loop.nextAction.value"
          :progress="loop.loopProgress.value"
          :scoreImprovement="loop.scoreImprovement.value"
          @action="handleLoopAction"
        />

        <!-- 学习进度可视化（有练习记录时显示） -->
        <div v-if="learningStore.records.length > 0" class="learning-progress-section">
          <h3 class="section-title">能力成长追踪</h3>
          <div class="progress-grid">
            <div class="progress-card">
              <LearningRadarChart :size="260" />
            </div>
            <div class="progress-card">
              <ScoreTrendTimeline :width="360" :height="180" />
              <div v-if="learningStore.weakDimensions.length > 0" class="weak-dimensions">
                <p class="weak-title">薄弱维度</p>
                <div class="weak-tags">
                  <span
                    v-for="dim in learningStore.weakDimensions"
                    :key="dim"
                    class="weak-tag"
                  >
                    {{ learningStore.generatePracticeRecommendations().find(r => r.dimension === dim)?.suggestion?.slice(0, 20) ?? dim }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 聚合 Tab 控制栏 -->
        <div class="main-tabs-nav">
          <button class="tbtn" :class="{ on: activeTab === 'overview' }" @click="activeTab = 'overview'">全局概览</button>
          <button class="tbtn" :class="{ on: activeTab === 'jd' }" @click="activeTab = 'jd'">原始岗位 JD</button>
          <button class="tbtn" :class="{ on: activeTab === 'history' }" @click="activeTab = 'history'">分析历史</button>
        </div>

        <!-- 聚合 Tab 主内容区 -->
        <div class="main-tabs-content">
          <div v-show="activeTab === 'overview'" class="tab-pane fade-in">
            <!-- 简历全局诊断视图 -->
            <OverviewTab
              :overview="store.overview"
              :prepInsight="store.prepInsight"
              :resumeText="resumeText"
              :isLoading="store.stageLoading.overview"
              :interviewPracticeCount="currentHistoryItem?.practiceCount ?? 0"
              :lastInterviewScore="currentHistoryItem?.lastInterviewScore ?? null"
              :lastWeaknesses="currentHistoryItem?.lastWeaknesses ?? []"
              :lastSuggestedResumeModules="currentHistoryItem?.lastSuggestedResumeModules ?? []"
              @overview-done="o => store.overview = o"
              @loading-change="store.setLoading"
              @error="store.setError"
              @generate-interview-suggestions="handleGenerateInterviewSuggestions"
            />
          </div>

          <!-- 之前的差距、演练模块现在已全部转移到沉浸式弹窗中 -->

          <div v-show="activeTab === 'jd'" class="tab-pane fade-in">
            <!-- 结构化 JD 结果面板 -->
            <JdInputTab
              :config="config"
              v-model:jd-text="store.jdText"
              v-model:target-company="store.targetCompany"
              v-model:target-position="store.targetPosition"
              :jd-data="store.jdData"
              :is-loading="store.isLoading"
              @parsed="handleParsed"
              @loading-change="handleLoadingChange"
              @error="store.setError"
              @reset-analysis="store.resetAnalysisState"
            />
          </div>

          <div v-show="activeTab === 'history'" class="tab-pane fade-in">
            <!-- 附带历史记录块 -->
            <JdPrepHistoryPanel 
              :items="store.history"
              :active-id="store.analysisMeta?.analysisId"
              @open="store.openHistoryItem"
              @delete="store.deleteHistoryItem"
              @clear="store.clearHistory"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- 全屏题库弹窗 -->
    <Teleport to="body">
      <JdInterviewBankPanel
        v-if="showBankPanel && store.jdData"
        :jd-data="store.jdData"
        :resume-text="resumeText"
        :match-result="store.matchResult"
        :company-intel="store.companyIntel"
        @close="showBankPanel = false"
      />

      <!-- 公司情报弹窗 -->
      <CompanyIntelDialog
        v-if="showCompanyIntelDialog"
        @close="showCompanyIntelDialog = false"
      />

      <!-- 岗位拆解弹窗 (视窗化) -->
      <div v-if="showMatchResultPanel && store.jdData" class="modal-viewport-overlay">
        <div class="modal-glass-window">
          <div class="modal-header">
            <h2>岗位拆解</h2>
            <button class="close-btn" @click="showMatchResultPanel = false">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div class="modal-body custom-scroll">
            <MatchResultTab
              :jd-data="store.jdData"
              :match-result="store.matchResult"
              :prep-insight="store.prepInsight"
              :resume-text="resumeText"
              :is-loading="store.isLoading"
              @loading-change="store.setLoading"
              @error="store.setError"
              @go-to-optimize="() => { showMatchResultPanel = false; showOptimizePanel = true; }"
            />
          </div>
        </div>
      </div>

      <!-- 简历优化建议弹窗 (视窗化) -->
      <div v-if="showOptimizePanel && store.jdData" class="modal-viewport-overlay">
        <div class="modal-glass-window">
          <div class="modal-header">
            <h2>简历优化</h2>
            <button class="close-btn" @click="showOptimizePanel = false">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div class="modal-body custom-scroll">
            <OptimizeTab
              :jd-data="store.jdData"
              :suggestions="store.suggestions"
              :resume-text="resumeText"
              :is-loading="store.isLoading"
              @loading-change="store.setLoading"
              @error="store.setError"
              @optimize-done="o => store.suggestions = o"
            />
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 全局 Loading 拦截层（仅在 JD 初始解析阶段显示，进入 Dashboard 后不再遮罩） -->
    <div v-if="store.isLoading && !store.jdData" class="global-loader-overlay">
      <div class="loader-box">
        <div class="loader-spinner"></div>
        <p class="loader-label">{{ store.loadingLabel || '正在解析 JD...' }}</p>
        <div class="loader-progress-track"><div class="loader-progress-bar"></div></div>
      </div>
    </div>

    <!-- 全局 Error 提示 -->
    <div v-if="store.errorMsg" class="global-error-toast">
      <div class="err-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
      </div>
      <div class="err-text">{{ store.errorMsg }}</div>
      <button class="err-close" @click="store.setError('')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  </section>
</template>

<style scoped>
@keyframes entryFadeUp {
  from { opacity: 0; transform: translateY(20px); filter: blur(6px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

@keyframes shimmerProgress {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}

@keyframes progressPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@keyframes spinSlow {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* ═══ 渐进式分析进度条 ═══ */
.progressive-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--primary-500) 4%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--primary-500) 12%, transparent);
  animation: entryFadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.progressive-track {
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card-muted));
  overflow: hidden;
}

.progressive-fill {
  width: 35%;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--primary-400), var(--primary-600));
  animation: shimmerProgress 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.progressive-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--primary-600);
  animation: progressPulse 2s ease-in-out infinite;
}

.progressive-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cancel-all-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent-red) 24%, transparent);
  background: color-mix(in srgb, var(--accent-red) 4%, var(--bg-card));
  color: var(--accent-red);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-all-btn:hover {
  background: color-mix(in srgb, var(--accent-red) 10%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-red) 36%, transparent);
}

/* ═══ 视窗化弹窗容器 (Viewport Modal) ═══ */
.stage-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.stage-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  flex: 1;
  min-width: 160px;
}

.stage-card.is-loading {
  border-color: color-mix(in srgb, var(--primary-500) 18%, transparent);
}

.stage-card.is-error {
  border-color: color-mix(in srgb, var(--accent-red) 28%, transparent);
}

.stage-card.is-completed {
  border-color: color-mix(in srgb, var(--accent-green) 24%, transparent);
}

.stage-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.stage-card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}

.stage-card-desc {
  display: none;
}

.stage-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-muted);
}

.stage-chip.is-loading {
  background: color-mix(in srgb, var(--primary-500) 12%, var(--bg-card));
  color: var(--primary-600);
}

.stage-chip.is-error {
  background: color-mix(in srgb, var(--accent-red) 12%, var(--bg-card));
  color: var(--accent-red);
}

.stage-chip.is-completed {
  background: color-mix(in srgb, var(--accent-green) 12%, var(--bg-card));
  color: var(--accent-green);
}

.stage-error-text {
  display: none;
}

/* ═══ 流式预览 + 计时 ═══ */
.stage-stream-preview {
  display: none;
}

.stream-text {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 72px;
  overflow: hidden;
}

.stream-elapsed {
  align-self: flex-end;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.stage-card-actions {
  display: none;
}

.stage-action-btn {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.stage-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.modal-viewport-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  padding: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: entryFadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-glass-window {
  width: 100%;
  max-width: 1400px;
  height: 100%;
  background: var(--bg-app);
  border-radius: 24px;
  border: 1px solid var(--border-color);
  box-shadow: 0 32px 64px -16px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.modal-header {
  padding: 20px 32px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
}

.modal-body.custom-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
}

.close-btn {
  width: 40px; height: 40px; border-radius: 12px; border: none; background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.close-btn:hover { background: var(--accent-red); color: white; transform: rotate(90deg); }

.view-workspace {
  display: flex;
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  background: var(--bg-app);
}

.dashboard-layout {
  width: 100%;
  max-width: none;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ═══ 不对称入口布局（7:3） ═══ */
.entry-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 24px;
  align-items: start;
}

.entry-grid > [style*="--entry-delay"] {
  animation: entryFadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  animation-delay: calc(var(--entry-delay) * 120ms);
}

/* ═══ 工业风横向顶栏 ═══ */
.ds-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-radius: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  margin-bottom: 0;
}

.ds-hb-left { display: flex; align-items: center; gap: 14px; }
.ds-hb-tag { font-size: 10px; font-weight: 900; background: color-mix(in srgb, var(--primary-500) 10%, white); color: var(--primary-600); padding: 4px 8px; border-radius: 6px; letter-spacing: 0.1em; }
.ds-hb-title { margin: 0; font-size: 16px; font-weight: 800; color: var(--text-primary); }
.ds-hb-divider { width: 1px; height: 16px; background: var(--border-color); opacity: 0.6; margin: 0 4px; }
.ds-hb-meta-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.ds-hb-meta-item .lbl { color: var(--text-muted); font-weight: 600; }
.ds-hb-meta-item .val { color: var(--text-primary); font-weight: 800; }

.ds-hb-right { display: flex; align-items: center; gap: 12px; }
.ds-hb-status { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--text-secondary); padding-right: 12px; border-right: 1px solid var(--border-color); }
.status-ring { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-green); }
.status-ring.loading { background: var(--primary-500); animation: progressPulse 2s infinite; }

.ds-hb-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer; transition: all 0.2s; }
.ds-hb-btn.ghost { background: transparent; border: 1px solid transparent; color: var(--text-secondary); }
.ds-hb-btn.ghost:hover { background: var(--bg-hover); color: var(--text-primary); }
.ds-hb-btn.primary { background: var(--primary-600); border: none; color: white; box-shadow: 0 4px 10px color-mix(in srgb, var(--primary-500) 25%, transparent); }
.ds-hb-btn.primary:hover { background: var(--primary-700); transform: translateY(-1px); }

.ds-hero-section {
  width: 100%;
}

@media (max-width: 900px) {
  .ds-header-bar { flex-direction: column; align-items: stretch; gap: 12px; }
  .ds-hb-left, .ds-hb-right { flex-wrap: wrap; }
  .ds-hb-status { border-right: none; }
  .tools-row { grid-template-columns: repeat(2, 1fr); }
}

.stage-grid-after-score {
  margin-top: 0;
}

/* ═══ Tools Row（三列等宽工具入口） ═══ */
.tools-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

/* ═══ 入口卡片（Double-Bezel + 顶部强调线） ═══ */
.bank-entry-card {
  padding: 20px;
  border-radius: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow:
    0 4px 16px rgba(0,0,0,0.03),
    inset 0 1px 0 rgba(255,255,255,0.1);
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
  display: flex;
}

.bank-entry-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, var(--primary-400), var(--primary-600));
  opacity: 0;
  transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.bank-entry-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 32px color-mix(in srgb, var(--primary-500) 12%, transparent);
  border-color: color-mix(in srgb, var(--primary-500) 20%, transparent);
}

.bank-entry-card:hover::after { opacity: 1; }

.bank-entry-card:active {
  transform: translateY(-1px) scale(0.99);
}

.bank-entry-card.secondary::after { background: linear-gradient(90deg, #8b5cf6, #a855f7); }
.bank-entry-card.secondary:hover {
  border-color: rgba(139, 92, 246, 0.2);
  box-shadow: 0 16px 32px rgba(139, 92, 246, 0.1);
}

.bank-entry-card.warning::after { background: linear-gradient(90deg, #f59e0b, #ef4444); }
.bank-entry-card.warning:hover {
  border-color: rgba(245, 158, 11, 0.2);
  box-shadow: 0 16px 32px rgba(245, 158, 11, 0.1);
}

.bank-entry-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}

/* SVG 图标容器取代 Emoji */
.bank-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  margin-bottom: 12px;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.bank-icon-wrap.fire {
  background: color-mix(in srgb, var(--primary-500) 8%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--primary-500) 14%, transparent);
  color: var(--primary-600);
}

.bank-icon-wrap.purple {
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.14);
  color: #7c3aed;
}

.bank-icon-wrap.amber {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.14);
  color: #d97706;
}

.bank-icon-wrap.teal {
  background: rgba(14, 165, 183, 0.08);
  border: 1px solid rgba(14, 165, 183, 0.14);
  color: #0ea5b7;
}

.bank-entry-card.intel-card .bank-act { color: #0ea5b7; }

.bank-entry-card:hover .bank-icon-wrap {
  transform: scale(1.08);
}

.bank-entry-content h3 {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.bank-entry-content p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  flex-grow: 1;
}

.bank-act {
  margin-top: 14px;
  font-size: 12px;
  font-weight: 700;
  color: var(--primary-600);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: gap 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.bank-entry-card:hover .bank-act { gap: 10px; }

.bank-entry-card.secondary .bank-act { color: #7c3aed; }
.bank-entry-card.warning .bank-act { color: #d97706; }

.bank-count-badge {
  font-size: 10px;
  font-weight: 800;
  padding: 1px 7px;
  border-radius: 10px;
  background: color-mix(in srgb, currentColor 12%, transparent);
}

/* ═══ 聚合 Tabs ═══ */
.main-tabs-nav {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  padding: 5px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  width: max-content;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
}

.tbtn {
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.tbtn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tbtn.on {
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
  color: var(--primary-600);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--primary-500) 10%, transparent);
}

.main-tabs-content {
  background: transparent;
  min-height: 400px;
}

.fade-in {
  animation: fadeInTab 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeInTab {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ═══ 按钮组 ═══ */
.btn-primary, .btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 20px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-primary {
  border: none;
  background: linear-gradient(135deg, var(--primary-500), var(--primary-700));
  color: var(--text-inverse);
  box-shadow:
    0 6px 16px color-mix(in srgb, var(--primary-500) 22%, transparent),
    inset 0 1px 0 rgba(255,255,255,0.1);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--primary-500) 28%, transparent);
}

.btn-primary:active {
  transform: translateY(0) scale(0.98);
}

.btn-ghost {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
}

.btn-ghost:hover {
  border-color: color-mix(in srgb, var(--primary-500) 25%, transparent);
  color: var(--primary-600);
  transform: translateY(-1px);
}

.btn-ghost:active {
  transform: translateY(0) scale(0.98);
}

/* ═══ 响应式 ═══ */
@media (max-width: 1200px) {
  .metrics-grid { grid-template-columns: 1fr 1fr; }
  .dash-hero-card { grid-template-columns: 1fr; }
  .dash-hero-side { align-items: stretch; }
}

@media (max-width: 1000px) {
  .view-workspace { padding: 16px; }
  .entry-grid { grid-template-columns: 1fr; }
  .metrics-grid { grid-template-columns: 1fr; }
  .main-tabs-nav { flex-wrap: wrap; width: 100%; }
  .tbtn { flex: 1 1 auto; text-align: center; }
  .hero-row { grid-template-columns: 1fr; }
  .quick-actions-col { min-width: 0; }
  .dash-target-meta { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .dash-hero-card {
    padding: 16px;
    border-radius: 16px;
  }

  .dash-title h1 { font-size: 22px; }
  .action-card.primary {
    min-height: 144px;
  }

  .action-text strong {
    font-size: 24px;
  }

  .action-text span:not(.action-kicker) {
    max-width: none;
    font-size: 12px;
  }

  .dash-target-chip,
  .dash-target-chip.company,
  .dash-target-chip.position {
    width: 100%;
    min-width: 0;
    flex: 1 1 100%;
  }

  .dash-target-value {
    font-size: 14px;
  }
}

/* ═══ 全局加载遮罩（磨砂质感） ═══ */
.global-loader-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-app) 60%, transparent);
  backdrop-filter: blur(12px) saturate(1.2);
  z-index: 1000;
  border-radius: var(--radius-xl);
  animation: entryFadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.loader-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 36px 48px;
  background: var(--bg-card);
  border-radius: 22px;
  box-shadow:
    0 20px 50px rgba(0,0,0,0.08),
    inset 0 1px 0 rgba(255,255,255,0.15);
  border: 1px solid var(--border-color);
}

.loader-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-500);
  border-radius: 50%;
  animation: spin 0.8s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loader-label {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.loader-progress-track {
  width: 160px;
  height: 3px;
  border-radius: 2px;
  background: var(--bg-card-muted);
  overflow: hidden;
}

.loader-progress-bar {
  width: 40%;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--primary-400), var(--primary-600));
  animation: shimmerProgress 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

/* ═══ 全局错误提示 ═══ */
.global-error-toast {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--accent-red);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.1);
  z-index: 2000;
  animation: slide-down 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-down {
  0% { opacity: 0; transform: translate(-50%, -20px); }
  100% { opacity: 1; transform: translate(-50%, 0); }
}

.err-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent-red) 8%, var(--bg-card));
  color: var(--accent-red);
  flex-shrink: 0;
}

.err-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-right: 10px;
}

.err-close {
  background: none;
  border: none;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
}

.err-close:hover {
  background: color-mix(in srgb, var(--accent-red) 6%, var(--bg-card));
  color: var(--accent-red);
}

/* 学习进度区域 */
.learning-progress-section {
  margin-top: 24px;
  padding: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.learning-progress-section .section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 16px;
}

.progress-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 24px;
  align-items: start;
}

.progress-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.weak-dimensions {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.weak-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  margin: 0 0 8px;
}

.weak-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.weak-tag {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--accent-orange) 10%, transparent);
  color: var(--accent-orange);
  font-weight: 600;
}

@media (max-width: 768px) {
  .progress-grid {
    grid-template-columns: 1fr;
  }
}

</style>

<style>
/* 全局工具弹窗 (Teleport 到 body 需要全局样式) */
.fullscreen-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: var(--bg-body, #f4f6fa);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modal-fade-in 0.2s ease-out;
}

@keyframes modal-fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--bg-card, #ffffff);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  z-index: 2;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary, #1e293b);
}

.close-btn {
  background: none;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--bg-hover, #f1f5f9);
  color: var(--accent-red, #ef4444);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: var(--bg-body, #f4f6fa);
  display: flex;
  flex-direction: column;
}

.modal-body > * {
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
}
</style>
