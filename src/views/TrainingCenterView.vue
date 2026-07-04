<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  APPLICATION_PRIORITY_OPTIONS,
  APPLICATION_STATUS_OPTIONS,
  type ApplicationPriority,
  type ApplicationStatus,
  useApplicationTrackerStore,
} from '@/stores/applicationTracker'
import { useJdAnalysisStore, type JdPrepHistoryItem } from '@/stores/jdAnalysis'
import { SKILL_DIMENSIONS, type SkillDimension, useLearningProgressStore } from '@/stores/learningProgress'
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'
import type { InterviewSessionRecord } from '@/components/ai/interview/types'
import type { InterviewQuestion } from '@/services/jd/interviewBank'

defineOptions({ name: 'TrainingCenterView' })

const SELECTED_JOB_STORAGE_KEY = 'prepwise-training-center-selected-jd'
const DRILL_SEED_STORAGE_KEY = 'prepwise_question_bank_drill_seed'
const INTERVIEW_HISTORY_STORAGE_KEY = 'prepwise_interview_history'

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

function formatDate(value: string | null | undefined): string {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '暂无'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getStatusLabel(status: ApplicationStatus): string {
  return APPLICATION_STATUS_OPTIONS.find((item) => item.key === status)?.label ?? '关注中'
}

function getPriorityLabel(priority: ApplicationPriority): string {
  return APPLICATION_PRIORITY_OPTIONS.find((item) => item.key === priority)?.label ?? '中'
}

function getSkillLabel(key: SkillDimension): string {
  return SKILL_DIMENSIONS.find((item) => item.key === key)?.label ?? key
}

function loadInterviewRecords(): InterviewSessionRecord[] {
  try {
    const raw = localStorage.getItem(INTERVIEW_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is InterviewSessionRecord => Boolean(item && typeof item === 'object' && typeof item.id === 'string'))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  } catch {
    return []
  }
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
    + (item.prepInsight?.highRiskFollowUps.length ?? 0)
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

  const highRiskQuestions: SavedQuestion[] = (item.prepInsight?.highRiskFollowUps ?? []).map((risk, index) => ({
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
      if (!key || seen.has(key)) return false
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

const interviewRecords = computed(() => loadInterviewRecords())
const latestInterview = computed(() => interviewRecords.value[0] ?? null)

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

const trainingJobs = computed<TrainingJobRow[]>(() =>
  jdStore.history
    .map((item) => {
      const tracker = trackerStore.getTrackerItem(item.id)
      return {
        jd: item,
        title: item.position || '未命名岗位',
        company: item.company || '未填写公司',
        status: tracker.status,
        priority: tracker.priority,
        readiness: calculateReadiness(item),
        matchScore: item.matchResult?.score.total ?? null,
        riskCount: calculateRiskCount(item),
        questionCount: item.interviewQuestions.length,
        practiceCount: item.practiceCount ?? item.linkedInterviewRecordIds?.length ?? 0,
        updatedAt: item.updatedAt,
      }
    })
    .sort((a, b) =>
      statusRank[a.status] - statusRank[b.status]
      || priorityRank[a.priority] - priorityRank[b.priority]
      || b.riskCount - a.riskCount
      || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
)

const effectiveSelectedJdId = computed({
  get: () => selectedJdId.value || trainingJobs.value[0]?.jd.id || '',
  set: (value: string) => {
    selectedJdId.value = value
  },
})

const selectedJob = computed(() =>
  trainingJobs.value.find((item) => item.jd.id === effectiveSelectedJdId.value) ?? trainingJobs.value[0] ?? null,
)

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

const averageLearningScore = computed(() => {
  const scores = Object.values(learningStore.currentScores).filter((score) => score > 0)
  if (!scores.length) return 0
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
})

const activeJobCount = computed(() =>
  trainingJobs.value.filter((item) => !['offer', 'rejected'].includes(item.status)).length,
)

const highRiskQuestionCount = computed(() =>
  jdStore.history.reduce((sum, item) => sum + (item.prepInsight?.highRiskFollowUps.length ?? 0), 0),
)

const trainingStats = computed(() => [
  {
    label: '训练岗位',
    value: `${activeJobCount.value}`,
    note: `共 ${trainingJobs.value.length} 个 JD 记录`,
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
  {
    label: '能力均分',
    value: averageLearningScore.value ? `${averageLearningScore.value}` : '--',
    note: weakDimensionLabels.value.length ? weakDimensionLabels.value.join(' / ') : '等待面试评分',
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
  const highRisk = item.prepInsight?.highRiskFollowUps ?? []
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

const guideTracks = computed(() => {
  const item = selectedJob.value?.jd
  const gaps = item?.matchResult?.gaps ?? []
  const mustHave = item?.jdData?.requirements.mustHave.map((entry) => entry.text) ?? []
  const duties = item?.jdData?.requirements.jobDuties ?? []
  const likelyGroups = item?.prepInsight?.likelyQuestionGroups ?? []

  return [
    {
      title: '基础知识',
      desc: '把硬性要求拆成可复述的概念、原理和使用边界。',
      topics: [...selectedTechStack.value, ...mustHave].slice(0, 5),
    },
    {
      title: '项目实战',
      desc: '把职责要求映射到简历项目，准备场景、动作和结果。',
      topics: [
        ...(item?.prepInsight?.recommendedStories.map((story) => story.title) ?? []),
        ...duties,
      ].slice(0, 5),
    },
    {
      title: '薄弱补齐',
      desc: '优先补匹配缺口和最近面试暴露的问题。',
      topics: [
        ...gaps,
        ...(item?.lastWeaknesses ?? []),
        ...weakDimensionLabels.value.map((label) => `${label}表达`),
      ].slice(0, 5),
    },
    {
      title: '高频题组',
      desc: '按题组练习，保证每类问题都有稳定答题框架。',
      topics: likelyGroups.map((group) => group.title).slice(0, 5),
    },
  ]
})

const recentReviews = computed(() =>
  interviewRecords.value.slice(0, 4).map((item) => ({
    id: item.id,
    title: item.targetRole || item.companyOrRoleSummary || '模拟面试',
    score: item.totalScore,
    passed: item.passed,
    date: item.date,
    weakness: item.reviewData?.weaknesses?.[0] ?? item.summary,
  })),
)

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
  <section class="training-center">
    <div class="training-scroll">
      <div class="training-shell">
        <header class="training-header">
          <div>
            <span class="kicker">训练中心</span>
            <h1>把岗位要求拆成知识、项目追问和专项练习</h1>
            <p>训练计划读取本地 JD、投递状态、题库与面试复盘记录，用来承接投递前后的备面闭环。</p>
          </div>

          <div class="header-actions">
            <RouterLink class="secondary-action" :to="{ name: 'question-bank' }">题库</RouterLink>
            <button class="primary-action" type="button" :disabled="!selectedDrillSeeds.length" @click="startSelectedJobPractice">
              开始专项训练
            </button>
          </div>
        </header>

        <div class="stats-grid">
          <article v-for="item in trainingStats" :key="item.label" class="stat-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <p>{{ item.note }}</p>
          </article>
        </div>

        <div class="training-layout">
          <main class="training-main">
            <section class="section-card">
              <div class="section-head toolbar-head">
                <div>
                  <span class="panel-label">岗位训练队列</span>
                  <h2>按投递阶段和风险排序</h2>
                </div>

                <select v-if="trainingJobs.length" v-model="effectiveSelectedJdId" class="job-select">
                  <option v-for="item in trainingJobs" :key="item.jd.id" :value="item.jd.id">
                    {{ item.company }} · {{ item.title }}
                  </option>
                </select>
              </div>

              <div v-if="trainingJobs.length" class="job-list">
                <article
                  v-for="item in trainingJobs"
                  :key="item.jd.id"
                  class="job-row"
                  :class="[
                    { active: item.jd.id === selectedJob?.jd.id },
                    item.riskCount >= 3 ? 'job-row--high-risk' : item.riskCount > 0 ? 'job-row--medium-risk' : 'job-row--stable',
                  ]"
                  role="button"
                  tabindex="0"
                  @click="effectiveSelectedJdId = item.jd.id"
                  @keydown.enter.prevent="effectiveSelectedJdId = item.jd.id"
                  @keydown.space.prevent="effectiveSelectedJdId = item.jd.id"
                >
                  <div class="job-main">
                    <div>
                      <strong>{{ item.title }}</strong>
                      <span>{{ item.company }}</span>
                    </div>
                    <div class="tag-row">
                      <span :class="`tag-pill tag-pill--${item.status}`">{{ getStatusLabel(item.status) }}</span>
                      <span :class="`tag-pill priority-pill--${item.priority}`">优先级 {{ getPriorityLabel(item.priority) }}</span>
                      <span
                        :class="[
                          'tag-pill',
                          item.riskCount >= 3 ? 'tag-pill--risk-high' : item.riskCount > 0 ? 'tag-pill--risk-medium' : 'tag-pill--risk-low',
                        ]"
                      >
                        {{ item.riskCount }} 个风险
                      </span>
                    </div>
                  </div>

                  <dl class="job-metrics">
                    <div>
                      <dt>匹配</dt>
                      <dd>{{ item.matchScore ?? '--' }}</dd>
                    </div>
                    <div>
                      <dt>准备</dt>
                      <dd>{{ item.readiness }}%</dd>
                    </div>
                    <div>
                      <dt>题目</dt>
                      <dd>{{ item.questionCount }}</dd>
                    </div>
                    <div>
                      <dt>训练</dt>
                      <dd>{{ item.practiceCount }}</dd>
                    </div>
                  </dl>

                  <div class="job-actions">
                    <RouterLink :to="{ name: 'jd-analysis' }" @click.stop="openJd(item.jd)">JD</RouterLink>
                    <RouterLink :to="{ name: 'application-tracker' }" @click.stop>投递</RouterLink>
                  </div>
                </article>
              </div>

              <div v-else class="empty-block">
                暂无岗位训练队列。先完成一次 JD 分析，训练中心会自动把岗位、追问和题目沉淀到这里。
              </div>
            </section>

            <section class="section-card">
              <div class="section-head">
                <div>
                  <span class="panel-label">今日训练计划</span>
                  <h2>{{ selectedJob ? `${selectedJob.company} · ${selectedJob.title}` : '等待目标岗位' }}</h2>
                </div>
                <button class="text-action" type="button" :disabled="!selectedDrillSeeds.length || savingSeeds" @click="saveSelectedSeedsToBank">
                  {{ savingSeeds ? '沉淀中' : '沉淀到题库' }}
                </button>
              </div>

              <div class="plan-grid">
                <article v-for="block in planBlocks" :key="block.key" class="plan-card" :class="`plan-card--${block.tone}`">
                  <div class="plan-card-head">
                    <strong>{{ block.title }}</strong>
                    <span>{{ block.metric }}</span>
                  </div>
                  <p>{{ block.desc }}</p>
                  <ul v-if="block.items.length">
                    <li v-for="item in block.items" :key="item">{{ item }}</li>
                  </ul>
                  <div v-else class="mini-empty">暂无数据</div>
                </article>
              </div>
            </section>

            <section class="section-card">
              <div class="section-head">
                <div>
                  <span class="panel-label">面试知识路径</span>
                  <h2>按基础、项目、薄弱点和题组推进</h2>
                </div>
              </div>

              <div class="guide-grid">
                <article v-for="track in guideTracks" :key="track.title" class="guide-card">
                  <strong>{{ track.title }}</strong>
                  <p>{{ track.desc }}</p>
                  <div v-if="track.topics.length" class="topic-list">
                    <span v-for="topic in track.topics" :key="topic">{{ topic }}</span>
                  </div>
                  <div v-else class="mini-empty">等待 JD 画像</div>
                </article>
              </div>
            </section>
          </main>

          <aside class="training-side">
            <section class="side-card">
              <div class="section-head compact">
                <div>
                  <span class="panel-label">专项题包</span>
                  <h2>{{ selectedDrillSeeds.length }} 道题</h2>
                </div>
              </div>

              <div v-if="selectedDrillSeeds.length" class="seed-list">
                <article v-for="question in selectedDrillSeeds.slice(0, 5)" :key="question.content" class="seed-item">
                  <strong>{{ question.content }}</strong>
                  <span>{{ question.category }}</span>
                </article>
              </div>
              <p v-else class="side-note">当前岗位还没有可训练题目。</p>

              <button class="wide-action" type="button" :disabled="!selectedDrillSeeds.length" @click="startSelectedJobPractice">
                用这组题训练
              </button>
            </section>

            <section class="side-card">
              <div class="section-head compact">
                <div>
                  <span class="panel-label">题库弱项</span>
                  <h2>{{ weakQuestionSeeds.length }} 道待练</h2>
                </div>
                <RouterLink :to="{ name: 'question-bank' }">查看</RouterLink>
              </div>

              <div v-if="weakQuestionSeeds.length" class="seed-list">
                <article v-for="question in weakQuestionSeeds.slice(0, 4)" :key="question.id ?? question.content" class="seed-item">
                  <strong>{{ question.content }}</strong>
                  <span>{{ question.category || '未分类' }} · 掌握度 {{ question.mastery_level ?? 0 }}</span>
                </article>
              </div>
              <p v-else class="side-note">题库暂无弱项记录。</p>

              <button class="wide-action ghost" type="button" :disabled="!weakQuestionSeeds.length" @click="startWeakQuestionPractice">
                练题库弱项
              </button>
            </section>

            <section class="side-card">
              <div class="section-head compact">
                <div>
                  <span class="panel-label">能力短板</span>
                  <h2>{{ averageLearningScore || '--' }} 分</h2>
                </div>
              </div>

              <div v-if="weakDimensionLabels.length" class="dimension-list">
                <span v-for="item in weakDimensionLabels" :key="item">{{ item }}</span>
              </div>
              <p v-else class="side-note">完成带评分的模拟面试后显示薄弱维度。</p>
            </section>

            <section class="side-card">
              <div class="section-head compact">
                <div>
                  <span class="panel-label">最近复盘</span>
                  <h2>{{ latestInterview?.totalScore ?? '--' }}</h2>
                </div>
                <RouterLink :to="{ name: 'ai-interviewer' }">面试</RouterLink>
              </div>

              <div v-if="recentReviews.length" class="review-list">
                <article v-for="item in recentReviews" :key="item.id" class="review-item">
                  <div>
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.weakness || '暂无复盘摘要' }}</span>
                  </div>
                  <time>{{ formatDate(item.date) }}</time>
                </article>
              </div>
              <p v-else class="side-note">暂无面试复盘记录。</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.training-center {
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: var(--bg-app);
}

.training-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 20px;
}

.training-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.training-header,
.stat-card,
.section-card,
.side-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.training-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
}

.training-header h1 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 900;
  line-height: 1.25;
}

.training-header p {
  max-width: 78ch;
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.primary-action,
.secondary-action,
.text-action,
.wide-action,
.job-actions a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.primary-action,
.wide-action {
  padding: 0 14px;
  background: var(--primary-600);
  color: white;
}

.primary-action:hover,
.primary-action:focus-visible,
.wide-action:hover,
.wide-action:focus-visible {
  background: var(--primary-700);
}

.secondary-action,
.text-action,
.job-actions a,
.wide-action.ghost {
  padding: 0 12px;
  border-color: color-mix(in srgb, var(--primary-500) 16%, transparent);
  background: color-mix(in srgb, var(--primary-500) 7%, var(--bg-card));
  color: var(--primary-600);
}

.secondary-action:hover,
.secondary-action:focus-visible,
.text-action:hover,
.text-action:focus-visible,
.job-actions a:hover,
.job-actions a:focus-visible,
.wide-action.ghost:hover,
.wide-action.ghost:focus-visible {
  border-color: color-mix(in srgb, var(--primary-500) 28%, transparent);
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
  color: var(--primary-700);
}

.primary-action:disabled,
.text-action:disabled,
.wide-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.primary-action:disabled:hover,
.wide-action:disabled:not(.ghost):hover {
  background: var(--primary-600);
  color: white;
}

.text-action:disabled:hover,
.wide-action.ghost:disabled:hover {
  border-color: color-mix(in srgb, var(--primary-500) 16%, transparent);
  background: color-mix(in srgb, var(--primary-500) 7%, var(--bg-card));
  color: var(--primary-600);
}

.secondary-action:focus-visible,
.text-action:focus-visible,
.primary-action:focus-visible,
.wide-action:focus-visible,
.job-select:focus-visible,
.job-row:focus-visible,
.job-actions a:focus-visible,
.section-head a:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-500) 58%, transparent);
  outline-offset: 2px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  min-width: 0;
  padding: 14px;
}

.kicker,
.panel-label,
.stat-card span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.35;
}

.stat-card strong {
  display: block;
  margin-top: 5px;
  color: var(--text-primary);
  font-size: 26px;
  font-weight: 900;
  line-height: 1;
}

.stat-card p {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.training-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: start;
}

.training-main,
.training-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.section-card,
.side-card {
  padding: 16px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  margin-bottom: 12px;
}

.section-head.compact,
.toolbar-head {
  align-items: center;
}

.section-head h2 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 900;
  line-height: 1.3;
}

.section-head a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 9px;
  border-radius: 8px;
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 850;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.section-head a:hover {
  background: color-mix(in srgb, var(--primary-500) 8%, var(--bg-card));
  color: var(--primary-700);
}

.job-select {
  width: min(360px, 100%);
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.job-select:hover,
.job-select:focus {
  border-color: var(--border-accent);
  background: var(--bg-card);
}

.job-list {
  display: grid;
  gap: 9px;
}

.job-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr) auto;
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.job-row:hover {
  border-color: color-mix(in srgb, var(--primary-500) 24%, var(--border-color));
  background: color-mix(in srgb, var(--primary-500) 5%, var(--bg-card));
}

.job-row.active {
  border-color: var(--border-accent);
  background: color-mix(in srgb, var(--accent-info) 7%, var(--bg-card));
}

.job-row.active::before {
  position: absolute;
  inset: 10px auto 10px 0;
  width: 3px;
  border-radius: 999px;
  background: var(--primary-600);
  content: "";
}

.job-row--high-risk:not(.active) {
  border-color: color-mix(in srgb, var(--accent-red) 22%, var(--border-color));
}

.job-row--medium-risk:not(.active) {
  border-color: color-mix(in srgb, var(--accent-orange) 20%, var(--border-color));
}

.job-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.job-main > div:first-child,
.seed-item,
.review-item > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.job-main strong,
.plan-card strong,
.guide-card strong,
.seed-item strong,
.review-item strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
}

.job-main span,
.plan-card p,
.guide-card p,
.seed-item span,
.review-item span,
.side-note,
.mini-empty {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.job-main strong,
.job-main > div:first-child span,
.seed-item strong,
.review-item strong,
.review-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-row,
.topic-list,
.dimension-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-row span,
.topic-list span,
.dimension-list span {
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.tag-row .tag-pill--watching {
  background: color-mix(in srgb, var(--gray-500) 14%, var(--bg-card));
  color: var(--text-secondary);
}

.tag-row .tag-pill--ready,
.tag-row .tag-pill--applied {
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
  color: var(--primary-600);
}

.tag-row .tag-pill--interviewing,
.tag-row .tag-pill--risk-medium,
.tag-row .priority-pill--medium {
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-card));
  color: var(--accent-orange);
}

.tag-row .tag-pill--offer,
.tag-row .tag-pill--risk-low,
.tag-row .priority-pill--low {
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
}

.tag-row .tag-pill--rejected,
.tag-row .tag-pill--risk-high,
.tag-row .priority-pill--high {
  background: color-mix(in srgb, var(--accent-red) 9%, var(--bg-card));
  color: var(--accent-red);
}

.job-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin: 0;
}

.job-metrics div {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  transition: border-color var(--transition-fast);
}

.job-row:hover .job-metrics div,
.job-row.active .job-metrics div {
  border-color: color-mix(in srgb, var(--primary-500) 20%, var(--border-color));
}

.job-metrics dt,
.review-item time {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 850;
}

.job-metrics dd {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 900;
}

.job-actions {
  display: flex;
  gap: 6px;
}

.plan-grid,
.guide-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.plan-card,
.guide-card,
.seed-item,
.review-item {
  position: relative;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
}

.plan-card,
.guide-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 164px;
  padding: 12px;
}

.plan-card::before {
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  border-radius: 10px 10px 0 0;
  background: var(--border-color-strong);
  content: "";
}

.plan-card--active::before {
  background: var(--primary-600);
}

.plan-card--warning::before {
  background: var(--accent-orange);
}

.plan-card--ready::before {
  background: var(--accent-green);
}

.plan-card--pending::before {
  background: var(--gray-400);
}

.plan-card--warning {
  border-color: color-mix(in srgb, var(--accent-orange) 30%, var(--border-color));
  background: color-mix(in srgb, var(--accent-orange) 7%, var(--bg-card));
}

.plan-card--active {
  border-color: color-mix(in srgb, var(--primary-500) 26%, var(--border-color));
  background: color-mix(in srgb, var(--primary-500) 5%, var(--bg-card));
}

.plan-card--ready {
  border-color: color-mix(in srgb, var(--accent-green) 24%, var(--border-color));
  background: color-mix(in srgb, var(--accent-green) 5%, var(--bg-card));
}

.plan-card--pending {
  background: var(--bg-card-muted);
}

.plan-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plan-card-head span {
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-500) 9%, var(--bg-card));
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.plan-card p,
.guide-card p {
  margin: 0;
}

.plan-card ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 16px;
}

.plan-card li {
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.5;
}

.seed-list,
.review-list {
  display: grid;
  gap: 8px;
}

.seed-item,
.review-item {
  padding: 10px;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.seed-item:hover,
.review-item:hover {
  border-color: color-mix(in srgb, var(--primary-500) 22%, var(--border-color));
  background: color-mix(in srgb, var(--primary-500) 5%, var(--bg-card));
}

.review-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.wide-action {
  width: 100%;
  margin-top: 12px;
}

.empty-block {
  padding: 18px;
  border: 1px dashed var(--border-color-strong);
  border-radius: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
  background: var(--bg-card-muted);
}

.mini-empty {
  padding: 10px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
}

@media (max-width: 1180px) {
  .stats-grid,
  .plan-grid,
  .guide-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .training-layout {
    grid-template-columns: 1fr;
  }

  .job-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .job-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .training-scroll {
    padding: 64px 12px 12px;
  }

  .training-header,
  .header-actions,
  .toolbar-head,
  .section-head {
    align-items: stretch;
    flex-direction: column;
  }

  .primary-action,
  .secondary-action,
  .text-action {
    width: 100%;
  }

  .stats-grid,
  .plan-grid,
  .guide-grid,
  .job-metrics {
    grid-template-columns: 1fr;
  }

  .training-header h1 {
    font-size: 21px;
  }
}
</style>
