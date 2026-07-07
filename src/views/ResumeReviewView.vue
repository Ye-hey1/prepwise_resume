<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import ReviewActionList from '@/components/resumeReview/ReviewActionList.vue'
import ReviewCategoryList from '@/components/resumeReview/ReviewCategoryList.vue'
import ReviewHistoryPanel from '@/components/resumeReview/ReviewHistoryPanel.vue'
import ReviewScoreHero from '@/components/resumeReview/ReviewScoreHero.vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useResumeStore } from '@/stores/resume'
import { buildReviewSignature, useResumeReviewStore } from '@/stores/resumeReview'
import {
  detectJdContextState,
  detectRoleFamily,
  formatResumeForReview,
  hasEnoughResumeContent,
  reviewResume,
  type CompletedJdReviewContext,
  type ResumeReviewInput,
  type ResumeReviewModuleKey,
} from '@/services/resumeReview'

defineOptions({ name: 'ResumeReviewView' })

type ResumeReviewData = Parameters<typeof formatResumeForReview>[0]

interface JdReviewSnapshot {
  jdContextState: ReturnType<typeof detectJdContextState>
  completedJdTitle: string
  completedTechStack: string[]
  completedJdContext: CompletedJdReviewContext | null
}

const router = useRouter()
const resumeStore = useResumeStore()
const jdStore = useJdAnalysisStore()
const aiConfigStore = useAiConfigStore()
const reviewStore = useResumeReviewStore()

const resumeData = computed(() =>
  createResumeSnapshot(),
)

const resumeText = computed(() => formatResumeForReview(resumeData.value))

const jdContextState = computed(() => detectJdContextState({
  jdText: jdStore.jdText,
  jdData: jdStore.jdData,
  matchResult: jdStore.matchResult,
}))

const completedJdTitle = computed(() =>
  jdContextState.value === 'completed'
    ? jdStore.jdData?.basicInfo.jobTitle.trim() ?? ''
    : '',
)

const completedTechStack = computed(() =>
  jdContextState.value === 'completed'
    ? jdStore.jdData?.requirements.techStack ?? []
    : [],
)

const roleFamily = computed(() => detectRoleFamily({
  jobTitle: resumeStore.basicInfo.jobTitle,
  jdPosition: jdStore.targetPosition || completedJdTitle.value,
  techStack: completedTechStack.value,
}))

const targetRole = computed(() =>
  resumeStore.basicInfo.jobTitle.trim()
  || jdStore.targetPosition.trim()
  || completedJdTitle.value
  || '目标岗位未填写',
)

const completedJdContext = computed<CompletedJdReviewContext | null>(() => {
  return createJdSnapshot().completedJdContext
})

const jdUnlockHint = computed(() => jdContextState.value === 'raw')
const config = computed(() => aiConfigStore.getConfigForFeature('resumeReview'))

const currentResult = computed(() => reviewStore.latestResult)
const hasResult = computed(() => Boolean(currentResult.value))
const hasAiConfig = computed(() => Boolean(config.value.apiUrl && config.value.modelName))
const hasReviewableContent = computed(() => hasEnoughResumeContent(resumeData.value))
const roleFamilyLabel = computed(() => roleFamily.value === 'technical' ? '技术岗' : '通用岗')
const jdStateLabel = computed(() => {
  if (jdContextState.value === 'completed') return '已完成 JD 分析'
  if (jdContextState.value === 'raw') return '有原始 JD，待分析'
  return '未使用 JD'
})
const primaryActionLabel = computed(() => {
  if (reviewStore.isLoading) return '审查中...'
  return hasResult.value ? '重新审查' : '开始审查'
})
const readinessItems = computed(() => [
  {
    label: '简历内容',
    value: hasReviewableContent.value ? '可审查' : '待补充',
    ready: hasReviewableContent.value,
  },
  {
    label: 'AI 模型',
    value: hasAiConfig.value ? '已配置' : '未配置',
    ready: hasAiConfig.value,
  },
  {
    label: 'JD 匹配',
    value: jdStateLabel.value,
    ready: jdContextState.value === 'completed',
  },
])

const activeHistoryItem = computed(() =>
  reviewStore.history.find((item) => item.id === reviewStore.activeReviewId) ?? null,
)

const currentResumeSignature = computed(() =>
  buildReviewSignature('resume', resumeData.value),
)

const currentJdSignature = computed(() =>
  completedJdContext.value
    ? buildReviewSignature('jd', completedJdContext.value)
    : '',
)

const isViewingStaleResult = computed(() => {
  const activeItem = activeHistoryItem.value
  if (!activeItem) return false

  return activeItem.resumeSignature !== currentResumeSignature.value
    || activeItem.jdSignature !== currentJdSignature.value
    || activeItem.result.targetRole !== targetRole.value
    || activeItem.result.roleFamily !== roleFamily.value
    || activeItem.result.jdContextState !== jdContextState.value
})

function cloneData<T>(value: T): T {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function createResumeSnapshot(): ResumeReviewData {
  return resumeStore.exportToJSON() as ResumeReviewData
}

function createJdSnapshot(): JdReviewSnapshot {
  const jdContextState = detectJdContextState({
    jdText: jdStore.jdText,
    jdData: jdStore.jdData,
    matchResult: jdStore.matchResult,
  })

  if (jdContextState !== 'completed' || !jdStore.jdData || !jdStore.matchResult) {
    return {
      jdContextState,
      completedJdTitle: '',
      completedTechStack: [],
      completedJdContext: null,
    }
  }

  const jdData = cloneData(jdStore.jdData)
  const matchResult = cloneData(jdStore.matchResult)

  return {
    jdContextState,
    completedJdTitle: jdData.basicInfo.jobTitle.trim(),
    completedTechStack: [...jdData.requirements.techStack],
    completedJdContext: {
      jdData,
      matchResult,
      company: jdStore.targetCompany.trim() || jdData.basicInfo.company,
      position: jdStore.targetPosition.trim() || jdData.basicInfo.jobTitle,
    },
  }
}

function resolveTargetRole(resumeSnapshot: ResumeReviewData, jdSnapshot: JdReviewSnapshot): string {
  const resumeJobTitle = typeof resumeSnapshot.basicInfo?.jobTitle === 'string'
    ? resumeSnapshot.basicInfo.jobTitle.trim()
    : ''

  return resumeJobTitle
    || jdStore.targetPosition.trim()
    || jdSnapshot.completedJdTitle
    || '目标岗位未填写'
}

function resolveRoleFamily(resumeSnapshot: ResumeReviewData, jdSnapshot: JdReviewSnapshot) {
  const resumeJobTitle = typeof resumeSnapshot.basicInfo?.jobTitle === 'string'
    ? resumeSnapshot.basicInfo.jobTitle
    : ''

  return detectRoleFamily({
    jobTitle: resumeJobTitle,
    jdPosition: jdStore.targetPosition || jdSnapshot.completedJdTitle,
    techStack: jdSnapshot.completedTechStack,
  })
}

function buildReviewInput(
  resumeSnapshot: ResumeReviewData,
  jdSnapshot: JdReviewSnapshot,
): ResumeReviewInput {
  const base = {
    resumeText: formatResumeForReview(resumeSnapshot),
    targetRole: resolveTargetRole(resumeSnapshot, jdSnapshot),
    roleFamily: resolveRoleFamily(resumeSnapshot, jdSnapshot),
  }

  if (jdSnapshot.jdContextState === 'completed' && jdSnapshot.completedJdContext) {
    return {
      ...base,
      jdContextState: 'completed',
      completedJdContext: jdSnapshot.completedJdContext,
    }
  }

  return {
    ...base,
    jdContextState: jdSnapshot.jdContextState === 'raw' ? 'raw' : 'none',
    completedJdContext: null,
  }
}

async function startReview() {
  if (reviewStore.isLoading) return

  const resumeSnapshot = createResumeSnapshot()
  const jdSnapshot = createJdSnapshot()

  if (!hasEnoughResumeContent(resumeSnapshot)) {
    reviewStore.setError('简历内容太少，请至少补充基本信息，并填写技能、项目或工作经历之一。')
    return
  }

  if (!config.value.apiUrl || !config.value.modelName) {
    reviewStore.setError('请先在 AI 配置中设置可用模型。')
    return
  }

  reviewStore.setLoading(true)

  try {
    const input = buildReviewInput(resumeSnapshot, jdSnapshot)
    const resumeSignature = buildReviewSignature('resume', resumeSnapshot)
    const jdSignature = input.jdContextState === 'completed'
      ? buildReviewSignature('jd', input.completedJdContext)
      : ''
    const result = await reviewResume(config.value, input)
    reviewStore.saveResult(result, {
      resumeSignature,
      jdSignature,
    })
  } catch (error) {
    reviewStore.setError(error instanceof Error ? error.message : '简历审查失败，请稍后重试。')
  } finally {
    reviewStore.setLoading(false)
  }
}

function openModule(moduleKey: ResumeReviewModuleKey) {
  resumeStore.requestScrollToModule(moduleKey)
  void router.push({ name: 'resume-editor' })
}

function handleDeleteReview(id: string) {
  if (!window.confirm('确定删除该审查记录？')) return
  reviewStore.deleteReview(id)
}
</script>

<template>
  <section class="view-workspace resume-review-workspace">
    <div class="review-dashboard">
      <header class="review-header-bar" aria-label="简历审查概览">
        <div class="review-header-main">
          <span class="review-tag">AI 简历审查</span>
          <h1>简历审查打分</h1>
          <p>从完整度、表达证据和岗位匹配三个角度生成评分，并给出可直接回到模块修改的优先任务。</p>
        </div>

        <div class="review-header-meta">
          <span class="meta-item">
            <span class="meta-label">目标岗位</span>
            <strong>{{ targetRole }}</strong>
          </span>
          <span class="meta-item">
            <span class="meta-label">岗位类型</span>
            <strong>{{ roleFamilyLabel }}</strong>
          </span>
          <span class="meta-item">
            <span class="meta-label">JD 状态</span>
            <strong>{{ jdStateLabel }}</strong>
          </span>
        </div>

        <button
          class="review-btn"
          type="button"
          :disabled="reviewStore.isLoading"
          @click="startReview"
        >
          {{ primaryActionLabel }}
        </button>
      </header>

      <div class="review-layout">
        <main class="review-main" aria-label="简历审查">
          <ReviewScoreHero
            :result="currentResult"
            :loading="reviewStore.isLoading"
            :jd-unlock-hint="jdUnlockHint"
          />

          <div v-if="isViewingStaleResult || reviewStore.errorMsg" class="notice-stack">
            <p v-if="isViewingStaleResult" class="stale-message" role="status">
              当前显示的是历史审查结果，简历或 JD 已变化，建议重新审查。
            </p>

            <p v-if="reviewStore.errorMsg" class="error-message" role="alert">
              {{ reviewStore.errorMsg }}
            </p>
          </div>

          <template v-if="currentResult">
            <section class="review-summary" aria-label="审查摘要">
              <div class="summary-head">
                <h2>审查摘要</h2>
                <span>{{ currentResult.generatedAt ? '最新结果' : '结果' }}</span>
              </div>
              <p>{{ currentResult.summary }}</p>
              <p class="fairness-note">{{ currentResult.fairnessNotes }}</p>
            </section>

            <div class="review-results-grid">
              <ReviewActionList
                class="review-block review-block-actions"
                :tasks="currentResult.tasks"
                @open-module="openModule"
              />

              <ReviewCategoryList
                class="review-block"
                title="通用评分"
                :categories="currentResult.generalCategories"
              />

              <ReviewCategoryList
                v-if="currentResult.jdContextState === 'completed'"
                class="review-block"
                title="JD 匹配评分"
                :categories="currentResult.jdFitCategories"
              />
            </div>
          </template>

          <section v-else class="empty-state" aria-label="空状态">
            <div class="empty-copy">
              <h2>先跑一次审查，拿到修改优先级</h2>
              <p>审查会读取当前简历结构化内容；如果已完成 JD 分析，还会追加岗位匹配评分。</p>
            </div>

            <div class="readiness-list" aria-label="审查准备状态">
              <div
                v-for="item in readinessItems"
                :key="item.label"
                class="readiness-item"
                :class="{ ready: item.ready }"
              >
                <span class="readiness-dot" aria-hidden="true"></span>
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </section>
        </main>

        <ReviewHistoryPanel
          class="review-side"
          :history="reviewStore.history"
          :active-id="reviewStore.activeReviewId"
          @open="reviewStore.openHistoryItem"
          @delete="handleDeleteReview"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.view-workspace {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-app);
}

.resume-review-workspace {
  padding: 16px;
}

.review-dashboard {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
  min-height: 0;
}

.review-header-bar {
  display: grid;
  grid-template-columns: minmax(300px, 1.05fr) minmax(320px, 0.95fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.review-header-main {
  min-width: 0;
}

.review-tag {
  display: block;
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
}

.review-header-main h1 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: -0.01em;
  text-wrap: balance;
}

.review-header-main p {
  max-width: 60ch;
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
  text-wrap: pretty;
}

.review-header-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.review-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.review-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.review-side {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card-muted);
}

.meta-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.35;
}

.meta-item strong {
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.review-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 108px;
  height: 38px;
  padding: 0 16px;
  border: 1px solid var(--border-accent);
  border-radius: 8px;
  background: var(--primary-600);
  color: white;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.review-btn:hover {
  background: var(--primary-700);
}

.review-btn:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.notice-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-message {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(216, 80, 80, 0.28);
  border-radius: 8px;
  background: rgba(216, 80, 80, 0.08);
  color: var(--accent-red);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.stale-message {
  margin: 0;
  padding: 9px 12px;
  border: 1px solid rgba(224, 138, 58, 0.28);
  border-radius: 8px;
  background: rgba(224, 138, 58, 0.08);
  color: var(--accent-orange);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.review-summary,
.empty-state {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.summary-head h2,
.empty-state h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 850;
  line-height: 1.35;
  text-wrap: balance;
}

.summary-head span {
  flex: 0 0 auto;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 8px;
  background: rgba(43, 123, 184, 0.08);
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 800;
}

.review-summary p,
.empty-state p {
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.review-summary .fairness-note {
  color: var(--text-muted);
  font-size: 12px;
}

.empty-state {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.55fr);
  gap: 16px;
  align-items: center;
  border-style: solid;
}

.empty-copy {
  min-width: 0;
}

.readiness-list {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.readiness-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card-muted);
}

.readiness-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent-orange);
}

.readiness-item.ready .readiness-dot {
  background: var(--accent-green);
}

.readiness-item span:not(.readiness-dot) {
  min-width: 0;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 750;
  overflow-wrap: anywhere;
}

.readiness-item strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.review-results-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.review-block-actions {
  grid-row: span 2;
}

@media (max-width: 1180px) {
  .review-header-bar {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .review-header-meta {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .review-btn {
    justify-self: start;
  }

  .review-layout {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .review-main {
    overflow: visible;
  }

  .review-side {
    min-height: 280px;
  }
}

@media (max-width: 760px) {
  .resume-review-workspace {
    padding: 64px 12px 12px;
  }

  .review-header-meta,
  .empty-state,
  .review-results-grid {
    grid-template-columns: 1fr;
  }

  .review-header-bar {
    padding: 12px;
  }

  .review-header-main h1 {
    font-size: 20px;
  }

  .review-btn {
    width: 100%;
  }
}
</style>
