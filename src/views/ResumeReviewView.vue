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

const router = useRouter()
const resumeStore = useResumeStore()
const jdStore = useJdAnalysisStore()
const aiConfigStore = useAiConfigStore()
const reviewStore = useResumeReviewStore()

const resumeData = computed(() =>
  resumeStore.exportToJSON() as Parameters<typeof formatResumeForReview>[0],
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
  if (jdContextState.value !== 'completed' || !jdStore.jdData || !jdStore.matchResult) return null

  return {
    jdData: jdStore.jdData,
    matchResult: jdStore.matchResult,
    company: jdStore.targetCompany.trim() || jdStore.jdData.basicInfo.company,
    position: jdStore.targetPosition.trim() || jdStore.jdData.basicInfo.jobTitle,
  }
})

const jdUnlockHint = computed(() => jdContextState.value === 'raw')
const config = computed(() => aiConfigStore.getConfigForFeature('resumeReview'))

const currentResult = computed(() => reviewStore.latestResult)
const hasResult = computed(() => Boolean(currentResult.value))
const roleFamilyLabel = computed(() => roleFamily.value === 'technical' ? '技术岗' : '通用岗')
const jdStateLabel = computed(() => {
  if (jdContextState.value === 'completed') return '已完成 JD 分析'
  if (jdContextState.value === 'raw') return '有原始 JD，待分析'
  return '未使用 JD'
})

function buildReviewInput(): ResumeReviewInput {
  const base = {
    resumeText: resumeText.value,
    targetRole: targetRole.value,
    roleFamily: roleFamily.value,
  }

  if (jdContextState.value === 'completed' && completedJdContext.value) {
    return {
      ...base,
      jdContextState: 'completed',
      completedJdContext: completedJdContext.value,
    }
  }

  return {
    ...base,
    jdContextState: jdContextState.value === 'raw' ? 'raw' : 'none',
    completedJdContext: null,
  }
}

async function startReview() {
  if (reviewStore.isLoading) return

  if (!hasEnoughResumeContent(resumeData.value)) {
    reviewStore.setError('简历内容太少，请至少补充基本信息，并填写技能、项目或工作经历之一。')
    return
  }

  if (!config.value.apiUrl || !config.value.modelName) {
    reviewStore.setError('请先在 AI 配置中设置可用模型。')
    return
  }

  reviewStore.setLoading(true)

  try {
    const input = buildReviewInput()
    const result = await reviewResume(config.value, input)
    reviewStore.saveResult(result, {
      resumeSignature: buildReviewSignature('resume', resumeData.value),
      jdSignature: input.jdContextState === 'completed'
        ? buildReviewSignature('jd', input.completedJdContext)
        : '',
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
</script>

<template>
  <section class="resume-review-view">
    <main class="review-main" aria-label="简历审查">
      <ReviewScoreHero
        :result="currentResult"
        :loading="reviewStore.isLoading"
        :jd-unlock-hint="jdUnlockHint"
      />

      <section class="review-toolbar" aria-label="审查操作">
        <div class="toolbar-meta">
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
          {{ reviewStore.isLoading ? '审查中...' : hasResult ? '重新审查' : '开始审查' }}
        </button>
      </section>

      <p v-if="reviewStore.errorMsg" class="error-message" role="alert">
        {{ reviewStore.errorMsg }}
      </p>

      <template v-if="currentResult">
        <section class="review-summary" aria-label="审查摘要">
          <h3>摘要</h3>
          <p>{{ currentResult.summary }}</p>
          <p class="fairness-note">{{ currentResult.fairnessNotes }}</p>
        </section>

        <ReviewActionList
          :tasks="currentResult.tasks"
          @open-module="openModule"
        />

        <ReviewCategoryList
          title="通用评分"
          :categories="currentResult.generalCategories"
        />

        <ReviewCategoryList
          v-if="currentResult.jdContextState === 'completed'"
          title="JD 匹配评分"
          :categories="currentResult.jdFitCategories"
        />
      </template>

      <section v-else class="empty-state" aria-label="空状态">
        <h3>还没有审查结果</h3>
        <p>补充简历内容后点击开始审查，系统会生成评分和可执行优化任务。</p>
      </section>
    </main>

    <ReviewHistoryPanel
      class="review-side"
      :history="reviewStore.history"
      :active-id="reviewStore.activeReviewId"
      @open="reviewStore.openHistoryItem"
    />
  </section>
</template>

<style scoped>
.resume-review-view {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 14px;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px;
  overflow: hidden;
  background: var(--bg-page);
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
  min-height: 0;
  overflow: hidden;
}

.review-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.toolbar-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
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
  font-weight: 850;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.review-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border-accent);
  border-radius: 8px;
  background: var(--primary-600);
  color: white;
  font-size: 13px;
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.review-btn:disabled {
  cursor: not-allowed;
  opacity: 0.62;
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

.review-summary,
.empty-state {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.review-summary h3,
.empty-state h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 850;
  line-height: 1.35;
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
  border-style: dashed;
  text-align: center;
}

@media (max-width: 980px) {
  .resume-review-view {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .review-main {
    overflow: visible;
  }
}

@media (max-width: 680px) {
  .resume-review-view {
    padding: 10px;
  }

  .review-toolbar {
    grid-template-columns: 1fr;
  }

  .toolbar-meta {
    grid-template-columns: 1fr;
  }

  .review-btn {
    width: 100%;
  }
}
</style>
