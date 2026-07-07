<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  type ApplicationPriority,
  type ApplicationStatus,
  useApplicationTrackerStore,
} from '@/stores/applicationTracker'
import { useJdAnalysisStore, type JdPrepHistoryItem } from '@/stores/jdAnalysis'
import { SKILL_DIMENSIONS, type SkillDimension, useLearningProgressStore } from '@/stores/learningProgress'
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'
import type { InterviewQuestion } from '@/services/jd/interviewBank'
import { isStaleFutureDateRiskText } from '@/utils/currentDateContext'

defineOptions({ name: 'TrainingCenterView' })

const SELECTED_JOB_STORAGE_KEY = 'prepwise-training-center-selected-jd'
const DRILL_SEED_STORAGE_KEY = 'prepwise_question_bank_drill_seed'

type TrainingTone = 'ready' | 'active' | 'warning' | 'pending'

interface TrainingJobRow {
  jd: JdPrepHistoryItem
  title: string
  company: string
  status: ApplicationStatus
  priority: ApplicationPriority
  readiness: number
  matchScore: number | null
  riskCount: number
  questionCount: number
  practiceCount: number
  updatedAt: string
}

interface PlanBlock {
  key: string
  title: string
  metric: string
  desc: string
  tone: TrainingTone
  items: string[]
}

const router = useRouter()
const jdStore = useJdAnalysisStore()
const trackerStore = useApplicationTrackerStore()
const questionStore = useQuestionBankStore()
const learningStore = useLearningProgressStore()

const selectedJdId = ref(readSelectedJobId())
const savingSeeds = ref(false)

function readSelectedJobId(): string {
  try {
    return localStorage.getItem(SELECTED_JOB_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function getSkillLabel(key: SkillDimension): string {
  return SKILL_DIMENSIONS.find((item) => item.key === key)?.label ?? key
}

function calculateReadiness(item: JdPrepHistoryItem): number {
  let score = 0
  if (item.matchResult) score += 20
  if (item.prepInsight) score += 15
  score += Math.min(item.suggestions.length * 5, 20)
  score += Math.min(item.interviewQuestions.length * 4, 20)
  if ((item.practiceCount ?? 0) > 0 || (item.linkedInterviewRecordIds?.length ?? 0) > 0) score += 20
  if (item.lastInterviewScore != null) score += 5
  return Math.min(100, score)
}

function calculateRiskCount(item: JdPrepHistoryItem): number {
  return (item.matchResult?.gaps.length ?? 0)
    + getEffectiveHighRiskFollowUps(item).length
    + (item.lastWeaknesses?.length ?? 0)
}

function parseDifficulty(value: string | undefined): number {
  if (!value) return 3
  if (value.includes('高级') || value.includes('困难')) return 4
  if (value.includes('初级') || value.includes('简单')) return 2
  return 3
}

function normalizeQuestionContent(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

type HighRiskFollowUp = NonNullable<JdPrepHistoryItem['prepInsight']>['highRiskFollowUps'][number]

function getEffectiveHighRiskFollowUps(item: JdPrepHistoryItem | null): HighRiskFollowUp[] {
  return (item?.prepInsight?.highRiskFollowUps ?? []).filter(risk =>
    !isStaleFutureDateRiskText([
      risk.question,
      risk.riskReason,
      risk.suggestion,
    ].join('\n')),
  )
}

function interviewQuestionToSavedQuestion(item: JdPrepHistoryItem, question: InterviewQuestion, index: number): SavedQuestion {
  const tags = [
    'JD分析',
    item.company,
    item.position,
    question.difficulty,
    ...question.keyPoints.slice(0, 3),
  ].filter((tag): tag is string => Boolean(tag?.trim()))

  return {
    content: normalizeQuestionContent(question.question),
    category: question.category || 'JD 定向题',
    tags,
    reference_answer: question.sampleAnswer || question.answerStructure || '',
    source: item.company || item.position || 'JD 分析',
    mastery_level: 0,
    jd_analysis_id: item.id,
    difficulty: parseDifficulty(question.difficulty),
    focus_area: question.context || question.keyPoints[0] || item.position,
    intent: question.context || '验证候选人与目标 JD 的岗位匹配度',
    framework: question.answerStructure,
    source_type: 'jd_analysis',
    is_grounded: true,
    resume_anchor: question.keyPoints.slice(0, 2).join(' / '),
    follow_up_chain: [
      ...question.followUpHints,
      ...(question.followUps?.map((followUp) => followUp.question) ?? []),
    ].slice(0, 4),
    created_at: new Date(Date.now() + index).toISOString(),
  }
}

function buildDrillSeeds(item: JdPrepHistoryItem | null): SavedQuestion[] {
  if (!item) return []

  const highRiskQuestions: SavedQuestion[] = getEffectiveHighRiskFollowUps(item).map((risk, index) => ({
    content: normalizeQuestionContent(risk.question),
    category: '岗位高风险追问',
    tags: ['高风险', 'JD分析', risk.moduleKey, item.company, item.position].filter((tag): tag is string => Boolean(tag?.trim())),
    reference_answer: risk.suggestion,
    source: item.company || item.position || 'JD 分析',
    mastery_level: 0,
    jd_analysis_id: item.id,
    difficulty: 4,
    focus_area: risk.riskReason,
    intent: risk.riskReason,
    framework: '先澄清场景，再用项目证据说明行动和结果',
    source_type: 'jd_analysis',
    is_grounded: true,
    resume_anchor: risk.moduleKey,
    follow_up_chain: [],
    created_at: new Date(Date.now() + index).toISOString(),
  }))

  const likelyQuestions: SavedQuestion[] = (item.prepInsight?.likelyQuestionGroups ?? []).flatMap((group, groupIndex) =>
    group.questions.slice(0, 2).map((question, index) => ({
      content: normalizeQuestionContent(question),
      category: group.title || '高频考点',
      tags: ['高频考点', 'JD分析', item.company, item.position].filter((tag): tag is string => Boolean(tag?.trim())),
      reference_answer: '',
      source: item.company || item.position || 'JD 分析',
      mastery_level: 0,
      jd_analysis_id: item.id,
      difficulty: 3,
      focus_area: group.title,
      intent: group.intent,
      framework: '按概念理解、项目落地、边界场景组织回答',
      source_type: 'jd_analysis',
      is_grounded: true,
      resume_anchor: item.position,
      follow_up_chain: [],
      created_at: new Date(Date.now() + groupIndex * 10 + index).toISOString(),
    })),
  )

  const seeds = [
    ...highRiskQuestions,
    ...item.interviewQuestions.map((question, index) => interviewQuestionToSavedQuestion(item, question, index)),
    ...likelyQuestions,
  ]

  const seen = new Set<string>()
  return seeds
    .filter((question) => {
      const key = question.content.trim()
      if (!key || seen.has(key) || isStaleFutureDateRiskText([
        question.content,
        question.focus_area ?? '',
        question.intent ?? '',
        question.reference_answer ?? '',
        ...(question.follow_up_chain ?? []),
      ].join('\n'))) return false
      seen.add(key)
      return true
    })
    .slice(0, 10)
}

function startPracticeWithSeeds(items: SavedQuestion[]) {
  const seeds = items.slice(0, 8)
  if (!seeds.length) return

  localStorage.setItem(
    DRILL_SEED_STORAGE_KEY,
    JSON.stringify({
      createdAt: Date.now(),
      questions: seeds,
    }),
  )

  void router.push({ name: 'ai-interviewer', query: { from: 'question-bank' } })
}

function startSelectedJobPractice() {
  startPracticeWithSeeds(selectedDrillSeeds.value)
}

function startWeakQuestionPractice() {
  startPracticeWithSeeds(weakQuestionSeeds.value)
}

async function saveSelectedSeedsToBank() {
  const existing = new Set(questionStore.questions.map((item) => item.content.trim()))
  const nextItems = selectedDrillSeeds.value.filter((item) => !existing.has(item.content.trim()))
  if (!nextItems.length || savingSeeds.value) return

  savingSeeds.value = true
  await questionStore.addQuestionBatch(nextItems)
  savingSeeds.value = false
}

function openJd(item: JdPrepHistoryItem) {
  jdStore.openHistoryItem(item.id)
}

const statusRank: Record<ApplicationStatus, number> = {
  interviewing: 0,
  ready: 1,
  applied: 2,
  watching: 3,
  offer: 4,
  rejected: 5,
}

const priorityRank: Record<ApplicationPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

function normalizeJobKeyText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

function buildTrainingJobRow(item: JdPrepHistoryItem): TrainingJobRow {
  const tracker = trackerStore.getTrackerItem(item.id)
  return {
    jd: item,
    title: item.position || item.jdData?.basicInfo.jobTitle || '未命名岗位',
    company: item.company || item.jdData?.basicInfo.company || '未填写公司',
    status: tracker.status,
    priority: tracker.priority,
    readiness: calculateReadiness(item),
    matchScore: item.matchResult?.score.total ?? null,
    riskCount: calculateRiskCount(item),
    questionCount: item.interviewQuestions.length,
    practiceCount: item.practiceCount ?? item.linkedInterviewRecordIds?.length ?? 0,
    updatedAt: item.updatedAt,
  }
}

function compareTrainingJobRows(a: TrainingJobRow, b: TrainingJobRow): number {
  return statusRank[a.status] - statusRank[b.status]
    || priorityRank[a.priority] - priorityRank[b.priority]
    || b.riskCount - a.riskCount
    || b.readiness - a.readiness
    || b.questionCount - a.questionCount
    || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

function trainingJobIdentityKey(item: TrainingJobRow): string {
  const company = item.company === '未填写公司' ? '' : normalizeJobKeyText(item.company)
  const title = item.title === '未命名岗位' ? '' : normalizeJobKeyText(item.title)
  if (!company && !title) return `jd:${item.jd.id}`
  return `${company || 'unknown-company'}::${title || 'unknown-title'}`
}

function dedupeTrainingJobRows(items: TrainingJobRow[]): TrainingJobRow[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = trainingJobIdentityKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const allTrainingJobRows = computed<TrainingJobRow[]>(() =>
  jdStore.history
    .map(buildTrainingJobRow)
    .sort(compareTrainingJobRows),
)

const trainingJobs = computed<TrainingJobRow[]>(() => dedupeTrainingJobRows(allTrainingJobRows.value))

const hiddenDuplicateJobCount = computed(() => allTrainingJobRows.value.length - trainingJobs.value.length)

const effectiveSelectedJdId = computed({
  get: () => selectedJob.value?.jd.id || '',
  set: (value: string) => {
    selectedJdId.value = value
  },
})

const selectedJob = computed(() => {
  if (!trainingJobs.value.length) return null
  if (selectedJdId.value) {
    const exactVisible = trainingJobs.value.find((item) => item.jd.id === selectedJdId.value)
    if (exactVisible) return exactVisible

    const hiddenDuplicate = allTrainingJobRows.value.find((item) => item.jd.id === selectedJdId.value)
    if (hiddenDuplicate) {
      const duplicateKey = trainingJobIdentityKey(hiddenDuplicate)
      return trainingJobs.value.find((item) => trainingJobIdentityKey(item) === duplicateKey) ?? trainingJobs.value[0] ?? null
    }
  }
  return trainingJobs.value[0] ?? null
})

const selectedDrillSeeds = computed(() => buildDrillSeeds(selectedJob.value?.jd ?? null))

const weakQuestionSeeds = computed(() =>
  questionStore.questions
    .filter((item) => (item.mastery_level ?? 0) <= 2)
    .sort((a, b) => (a.mastery_level ?? 0) - (b.mastery_level ?? 0))
    .slice(0, 8),
)

const weakDimensionLabels = computed(() =>
  learningStore.weakDimensions.map((key) => getSkillLabel(key)).slice(0, 4),
)

const activeJobCount = computed(() =>
  trainingJobs.value.filter((item) => !['offer', 'rejected'].includes(item.status)).length,
)

const highRiskQuestionCount = computed(() =>
  trainingJobs.value.reduce((sum, item) => sum + getEffectiveHighRiskFollowUps(item.jd).length, 0),
)

const trainingStats = computed(() => [
  {
    label: '训练岗位',
    value: `${activeJobCount.value}`,
    note: hiddenDuplicateJobCount.value > 0
      ? `共 ${trainingJobs.value.length} 个岗位，已合并 ${hiddenDuplicateJobCount.value} 条重复记录`
      : `共 ${trainingJobs.value.length} 个岗位`,
  },
  {
    label: '高风险追问',
    value: `${highRiskQuestionCount.value}`,
    note: '来自 JD 备面洞察',
  },
  {
    label: '待练题目',
    value: `${weakQuestionSeeds.value.length}`,
    note: questionStore.stats.total ? `题库共 ${questionStore.stats.total} 道` : '题库待沉淀',
  },
])

const selectedTechStack = computed(() =>
  (selectedJob.value?.jd.jdData?.requirements.techStack ?? []).slice(0, 8),
)

const planBlocks = computed<PlanBlock[]>(() => {
  const item = selectedJob.value?.jd
  if (!item) {
    return [
      {
        key: 'empty',
        title: '先建立目标岗位',
        metric: '0 个 JD',
        desc: '从 JD 分析保存一个岗位后，这里会自动生成训练计划。',
        tone: 'pending',
        items: ['粘贴目标 JD', '生成匹配结果', '回到训练中心推进'],
      },
    ]
  }

  const focusAreas = item.prepInsight?.focusAreas ?? []
  const priorities = item.prepInsight?.prepPriorities ?? []
  const highRisk = getEffectiveHighRiskFollowUps(item)
  const stories = item.prepInsight?.recommendedStories ?? []
  const groups = item.prepInsight?.likelyQuestionGroups ?? []
  const weaknesses = item.lastWeaknesses ?? []

  return [
    {
      key: 'knowledge',
      title: '知识底座',
      metric: `${selectedTechStack.value.length || focusAreas.length} 个主题`,
      desc: '按岗位技术栈补基础、原理和边界条件。',
      tone: selectedTechStack.value.length || focusAreas.length ? 'active' : 'pending',
      items: [
        ...selectedTechStack.value,
        ...focusAreas,
        ...groups.map((group) => group.title),
      ].slice(0, 5),
    },
    {
      key: 'story',
      title: '项目追问',
      metric: `${stories.length} 个故事`,
      desc: '把项目经历整理成可防守的 STAR 证据链。',
      tone: stories.length ? 'active' : 'pending',
      items: stories.map((story) => story.title).slice(0, 5),
    },
    {
      key: 'risk',
      title: '高风险追问',
      metric: `${highRisk.length} 道`,
      desc: '优先处理匹配缺口、简历证据不足和面试官可能深挖的问题。',
      tone: highRisk.length ? 'warning' : 'ready',
      items: highRisk.map((risk) => risk.question).slice(0, 5),
    },
    {
      key: 'loop',
      title: '训练复盘',
      metric: `${item.practiceCount ?? item.linkedInterviewRecordIds?.length ?? 0} 次`,
      desc: '用专项题和模拟面试反复更新弱项。',
      tone: (item.practiceCount ?? 0) > 0 ? 'ready' : 'active',
      items: [
        ...weaknesses,
        ...priorities,
        ...weakDimensionLabels.value.map((label) => `强化 ${label}`),
      ].slice(0, 5),
    },
  ]
})

watch(selectedJdId, (value) => {
  try {
    if (value) localStorage.setItem(SELECTED_JOB_STORAGE_KEY, value)
  } catch {
    // ignore
  }
})

onMounted(() => {
  void questionStore.fetchQuestions()
})
</script>

<template>
  <section class="training-center product-page">
    <div class="training-scroll product-scroll">
      <div class="training-shell product-shell">
        <header class="tc-header product-header">
          <div class="tc-title product-header-title">
            <h1>训练中心</h1>
            <p>基于目标 JD 的备面训练，把岗位要求拆成可练的题包</p>
          </div>
          <button
            class="tc-primary-btn"
            type="button"
            :disabled="!selectedDrillSeeds.length"
            @click="startSelectedJobPractice"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
            开始专项训练
          </button>
        </header>

        <div class="tc-stats">
          <article v-for="item in trainingStats" :key="item.label" class="tc-stat">
            <span class="tc-stat-label">{{ item.label }}</span>
            <strong class="tc-stat-value">{{ item.value }}</strong>
            <span class="tc-stat-note">{{ item.note }}</span>
          </article>
        </div>

        <div class="tc-layout">
          <main class="tc-main">
            <!-- 岗位训练队列 -->
            <section class="tc-section">
              <div class="tc-section-head">
                <h2>岗位训练队列</h2>
                <select v-if="trainingJobs.length" v-model="effectiveSelectedJdId" class="tc-select">
                  <option v-for="item in trainingJobs" :key="item.jd.id" :value="item.jd.id">
                    {{ item.company }} · {{ item.title }}
                  </option>
                </select>
              </div>

              <div v-if="trainingJobs.length" class="tc-job-list">
                <article
                  v-for="item in trainingJobs"
                  :key="item.jd.id"
                  class="tc-job-row"
                  :class="{ active: item.jd.id === selectedJob?.jd.id }"
                  role="button"
                  tabindex="0"
                  @click="effectiveSelectedJdId = item.jd.id"
                  @keydown.enter.prevent="effectiveSelectedJdId = item.jd.id"
                >
                  <div class="tc-job-main">
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.company }}</span>
                  </div>
                  <div class="tc-job-meta">
                    <span class="tc-chip" :class="{ 'tc-chip--risk': item.riskCount > 0 }">{{ item.riskCount }} 风险</span>
                    <span class="tc-metric">匹配 {{ item.matchScore ?? '--' }}</span>
                    <span class="tc-metric">准备 {{ item.readiness }}%</span>
                  </div>
                  <RouterLink class="tc-job-link" :to="{ name: 'jd-analysis' }" @click.stop="openJd(item.jd)">JD</RouterLink>
                </article>
              </div>

              <div v-else class="tc-empty">暂无岗位。先到 JD 分析保存一个目标岗位，训练中心会自动承接备面训练。</div>
            </section>

            <!-- 训练计划 -->
            <section class="tc-section">
              <div class="tc-section-head">
                <h2>
                  训练计划
                  <template v-if="selectedJob"><span class="tc-section-sub"> · {{ selectedJob.company }} {{ selectedJob.title }}</span></template>
                </h2>
                <button
                  class="tc-text-btn"
                  type="button"
                  :disabled="!selectedDrillSeeds.length || savingSeeds"
                  @click="saveSelectedSeedsToBank"
                >
                  {{ savingSeeds ? '沉淀中' : '沉淀到题库' }}
                </button>
              </div>

              <div class="tc-plan-grid">
                <article
                  v-for="block in planBlocks"
                  :key="block.key"
                  class="tc-plan-card"
                  :class="`tc-plan--${block.tone}`"
                >
                  <div class="tc-plan-head">
                    <strong>{{ block.title }}</strong>
                    <span>{{ block.metric }}</span>
                  </div>
                  <p>{{ block.desc }}</p>
                  <ul v-if="block.items.length">
                    <li v-for="it in block.items" :key="it">{{ it }}</li>
                  </ul>
                  <p v-else class="tc-plan-empty">暂无数据</p>
                </article>
              </div>
            </section>
          </main>

          <aside class="tc-aside">
            <!-- 专项题包 -->
            <section class="tc-side-card">
              <div class="tc-side-head">
                <h3>专项题包</h3>
                <span class="tc-side-count">{{ selectedDrillSeeds.length }} 道</span>
              </div>
              <div v-if="selectedDrillSeeds.length" class="tc-seed-list">
                <article
                  v-for="question in selectedDrillSeeds.slice(0, 5)"
                  :key="question.content"
                  class="tc-seed-item"
                >
                  <strong>{{ question.content }}</strong>
                  <span>{{ question.category }}</span>
                </article>
              </div>
              <p v-else class="tc-side-note">当前岗位还没有可训练题目。</p>
              <button
                class="tc-wide-btn"
                type="button"
                :disabled="!selectedDrillSeeds.length"
                @click="startSelectedJobPractice"
              >
                用这组题训练
              </button>
            </section>

            <!-- 题库弱项 -->
            <section class="tc-side-card">
              <div class="tc-side-head">
                <h3>题库弱项</h3>
                <RouterLink class="tc-side-link" :to="{ name: 'question-bank' }">查看</RouterLink>
              </div>
              <div v-if="weakQuestionSeeds.length" class="tc-seed-list">
                <article
                  v-for="question in weakQuestionSeeds.slice(0, 4)"
                  :key="question.id ?? question.content"
                  class="tc-seed-item"
                >
                  <strong>{{ question.content }}</strong>
                  <span>{{ question.category || '未分类' }} · 掌握 {{ question.mastery_level ?? 0 }}</span>
                </article>
              </div>
              <p v-else class="tc-side-note">题库暂无弱项记录。</p>
              <button
                class="tc-wide-btn ghost"
                type="button"
                :disabled="!weakQuestionSeeds.length"
                @click="startWeakQuestionPractice"
              >
                练题库弱项
              </button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.training-center {
}

.training-scroll {
}

.training-shell {
  gap: 18px;
  max-width: 1200px;
}

/* ── header ── */
.tc-header {
}

.tc-title h1 {
}

.tc-title p {
}

.tc-primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 18px;
  border: none;
  border-radius: 9px;
  background: var(--primary-600);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.tc-primary-btn:hover:not(:disabled) {
  background: var(--primary-700);
}

.tc-primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tc-primary-btn svg {
  width: 17px;
  height: 17px;
}

.tc-primary-btn circle {
  stroke: currentColor;
  stroke-width: 1.8;
  fill: none;
}

/* ── stats ── */
.tc-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.tc-stat {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.tc-stat-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.tc-stat-value {
  color: var(--text-primary);
  font-size: 26px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.tc-stat-note {
  color: var(--text-secondary);
  font-size: 11px;
}

/* ── layout ── */
.tc-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

.tc-main,
.tc-aside {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

/* ── section ── */
.tc-section,
.tc-side-card {
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.tc-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.tc-section-head h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 800;
}

.tc-section-sub {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 13px;
}

.tc-select {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.tc-select:hover {
  border-color: var(--border-accent);
}

.tc-text-btn {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.tc-text-btn:hover:not(:disabled) {
  background: rgba(43, 123, 184, 0.06);
}

.tc-text-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── job list ── */
.tc-job-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tc-job-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  cursor: pointer;
  position: relative;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.tc-job-row:hover {
  border-color: var(--border-accent);
  background: rgba(43, 123, 184, 0.03);
}

.tc-job-row.active {
  border-color: var(--primary-500);
  background: var(--state-info-bg);
}

.tc-job-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
  flex-shrink: 0;
}

.tc-job-main strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tc-job-main span {
  color: var(--text-secondary);
  font-size: 12px;
}

.tc-job-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  flex-wrap: wrap;
}

.tc-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 6px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.tc-chip--risk {
  border: 1px solid var(--state-warning-border);
  background: var(--state-warning-bg);
  color: var(--state-warning-text);
}

.tc-metric {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tc-job-link {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 800;
  text-decoration: none;
  transition: background-color 0.15s ease;
}

.tc-job-link:hover {
  background: rgba(43, 123, 184, 0.06);
}

/* ── plan grid ── */
.tc-plan-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.tc-plan-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  position: relative;
}

.tc-plan--ready {
  border-color: var(--state-success-border);
  background: var(--state-success-bg);
}

.tc-plan--active {
  border-color: var(--state-info-border);
  background: var(--state-info-bg);
}

.tc-plan--warning {
  border-color: var(--state-warning-border);
  background: var(--state-warning-bg);
}

.tc-plan--pending {
  background: var(--bg-card-muted);
}

.tc-plan-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.tc-plan-head strong {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 800;
}

.tc-plan-head span {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.tc-plan--ready .tc-plan-head span {
  color: var(--state-success-text);
}

.tc-plan--active .tc-plan-head span {
  color: var(--state-info-text);
}

.tc-plan--warning .tc-plan-head span {
  color: var(--state-warning-text);
}

.tc-plan-card > p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.tc-plan-card ul {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tc-plan-card li {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.tc-plan-empty {
  color: var(--text-muted);
  font-size: 12px;
}

/* ── aside ── */
.tc-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.tc-side-head h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 800;
}

.tc-side-count {
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 800;
}

.tc-side-link {
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.tc-side-link:hover {
  color: var(--primary-700);
}

.tc-seed-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 12px;
}

.tc-seed-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card-muted);
}

.tc-seed-item strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.tc-seed-item span {
  color: var(--text-muted);
  font-size: 11px;
}

.tc-side-note {
  margin: 0 0 12px;
  color: var(--text-secondary);
  font-size: 12px;
}

.tc-wide-btn {
  width: 100%;
  min-height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 9px;
  background: var(--primary-600);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.tc-wide-btn:hover:not(:disabled) {
  background: var(--primary-700);
}

.tc-wide-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tc-wide-btn.ghost {
  background: transparent;
  color: var(--primary-600);
  border: 1px solid var(--primary-500);
}

.tc-wide-btn.ghost:hover:not(:disabled) {
  background: var(--state-info-bg);
}

.tc-empty {
  padding: 28px 18px;
  border: 1px dashed var(--border-color-strong);
  border-radius: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  background: var(--bg-card-muted);
}

/* ── 响应式 ── */
@media (max-width: 1024px) {
  .tc-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .tc-plan-grid {
    grid-template-columns: 1fr;
  }

  .tc-stats {
    grid-template-columns: 1fr;
  }

  .tc-job-row {
    flex-wrap: wrap;
  }

  .tc-job-main {
    min-width: 0;
    flex: 1;
  }
}
</style>
