<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useOptimizeHistoryStore } from '@/stores/optimizeHistory'
import { useResumeReviewStore } from '@/stores/resumeReview'
import { useResumeStore } from '@/stores/resume'
import { loadInterviewRecords } from '@/composables/useInterviewHistory'

const resumeStore = useResumeStore()
const jdStore = useJdAnalysisStore()
const reviewStore = useResumeReviewStore()
const optimizeStore = useOptimizeHistoryStore()

function isFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

const interviewRecords = computed(() => loadInterviewRecords())
const latestInterview = computed(() => interviewRecords.value[0] ?? null)
const latestJdItem = computed(() => jdStore.history[0] ?? null)
const latestReview = computed(() => reviewStore.latestResult)
const unappliedOptimizations = computed(() => optimizeStore.items.filter((item) => !item.applied).length)
const pendingHighPriorityTasks = computed(() => latestReview.value?.tasks.filter((item) => item.priority === 'high').length ?? 0)

const resumeFilledModules = computed(() => {
  let count = 0
  if (isFilled(resumeStore.basicInfo.name) || isFilled(resumeStore.basicInfo.jobTitle)) count += 1
  if (resumeStore.educationList.some((item) => isFilled(item.school) || isFilled(item.major))) count += 1
  if (isFilled(resumeStore.skills)) count += 1
  if (resumeStore.workList.some((item) => isFilled(item.company) || isFilled(item.description))) count += 1
  if (resumeStore.projectList.some((item) => isFilled(item.name) || isFilled(item.mainWork))) count += 1
  if (resumeStore.personalWorkList.some((item) => isFilled(item.name) || isFilled(item.description))) count += 1
  if (resumeStore.awardList.some((item) => isFilled(item.name))) count += 1
  if (isFilled(resumeStore.selfIntro)) count += 1
  return count
})

const resumeCompletion = computed(() => Math.round((resumeFilledModules.value / 8) * 100))

const nextAction = computed(() => {
  if (resumeCompletion.value < 50) {
    return { title: '补齐简历主干', desc: '先完善基本信息、技能和项目经历，后续匹配与追问会更稳。', route: { name: 'resume-editor' } as RouteLocationRaw, label: '继续编辑' }
  }
  if (!latestReview.value) {
    return { title: '跑一次简历审查', desc: '拿到完整度、表达证据和岗位匹配的优先任务。', route: { name: 'resume-review' } as RouteLocationRaw, label: '开始审查' }
  }
  if (!latestJdItem.value) {
    return { title: '绑定一个目标 JD', desc: '把简历放到真实岗位要求里，快速发现硬性缺口。', route: { name: 'jd-analysis' } as RouteLocationRaw, label: '分析 JD' }
  }
  if (!latestInterview.value) {
    return { title: '用最新 JD 做模拟面试', desc: '基于岗位要求练习高风险追问，结果反哺优化。', route: { name: 'training-center' } as RouteLocationRaw, label: '制定训练' }
  }
  return { title: '处理优化建议', desc: '优先应用高优先级审查任务和 JD 定向建议。', route: { name: 'resume-review' } as RouteLocationRaw, label: '查看任务' }
})

type PipelineTone = 'ready' | 'active' | 'warning' | 'pending'

const pipelineSteps = computed(() => [
  {
    key: 'resume',
    title: '简历资产',
    metric: `${resumeCompletion.value}%`,
    action: resumeCompletion.value >= 70 ? '维护中' : '待补齐',
    tone: (resumeCompletion.value >= 70 ? 'ready' : 'active') as PipelineTone,
    route: { name: 'resume-editor' } as RouteLocationRaw,
  },
  {
    key: 'jd',
    title: '岗位画像',
    metric: latestJdItem.value?.matchResult ? `${latestJdItem.value.matchResult.score.total} 分` : `${jdStore.history.length} 份`,
    action: latestJdItem.value ? '已绑定' : '待分析',
    tone: (latestJdItem.value ? 'ready' : resumeCompletion.value >= 50 ? 'active' : 'pending') as PipelineTone,
    route: { name: 'jd-analysis' } as RouteLocationRaw,
  },
  {
    key: 'review',
    title: '简历审查',
    metric: latestReview.value ? `${latestReview.value.overallScore} 分` : '--',
    action: latestReview.value ? '已出分' : '待审查',
    tone: (pendingHighPriorityTasks.value > 0 ? 'warning' : latestReview.value ? 'ready' : 'pending') as PipelineTone,
    route: { name: 'resume-review' } as RouteLocationRaw,
  },
  {
    key: 'training',
    title: '面试训练',
    metric: latestInterview.value?.totalScore != null ? `${latestInterview.value.totalScore} 分` : `${interviewRecords.value.length} 次`,
    action: latestInterview.value ? '已复盘' : '待训练',
    tone: (latestInterview.value ? 'ready' : latestJdItem.value ? 'active' : 'pending') as PipelineTone,
    route: { name: 'training-center' } as RouteLocationRaw,
  },
])

const statsCards = computed(() => [
  { label: '简历完整度', value: `${resumeCompletion.value}`, unit: '%', note: `${resumeFilledModules.value}/8 模块已填`, tone: 'primary' },
  { label: '目标岗位', value: `${jdStore.history.length}`, unit: '份', note: latestJdItem.value?.company || '暂无 JD 记录', tone: 'neutral' },
  { label: '审查待办', value: `${pendingHighPriorityTasks.value}`, unit: '项', note: '高优先级任务', tone: pendingHighPriorityTasks.value ? 'warning' : 'neutral' },
  { label: '优化建议', value: `${unappliedOptimizations.value}`, unit: '条', note: '未应用的 AI 优化', tone: unappliedOptimizations.value ? 'warning' : 'neutral' },
])

const quickActions = [
  { title: '机会闭环', desc: '按岗位推进全链路', route: { name: 'workspace-dashboard', query: { tab: 'opportunities' } } as RouteLocationRaw },
  { title: '导入简历', desc: 'PDF / Word / 图片解析', route: { name: 'resume-import' } as RouteLocationRaw },
  { title: '编辑简历', desc: '内容、模板与导出', route: { name: 'resume-editor' } as RouteLocationRaw },
  { title: 'JD 分析', desc: '匹配岗位生成备面重点', route: { name: 'jd-analysis' } as RouteLocationRaw },
  { title: '训练中心', desc: '按 JD 生成专项训练', route: { name: 'training-center' } as RouteLocationRaw },
  { title: 'AI 面试', desc: '模拟问答与复盘', route: { name: 'ai-interviewer' } as RouteLocationRaw },
  { title: '简历审查', desc: '全维度诊断打分', route: { name: 'resume-review' } as RouteLocationRaw },
]
</script>

<template>
  <div class="overview-tab">
    <!-- 推荐下一步：视觉锚点 -->
    <RouterLink class="next-hero" :to="nextAction.route">
      <span class="next-hero-label">推荐下一步</span>
      <div class="next-hero-body">
        <strong>{{ nextAction.title }}</strong>
        <span>{{ nextAction.desc }}</span>
      </div>
      <span class="next-hero-cta">
        {{ nextAction.label }}
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>
    </RouterLink>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <article v-for="item in statsCards" :key="item.label" class="stat-card" :class="`stat-card--${item.tone}`">
        <span class="stat-label">{{ item.label }}</span>
        <div class="stat-figure">
          <strong>{{ item.value }}</strong>
          <em>{{ item.unit }}</em>
        </div>
        <span class="stat-note">{{ item.note }}</span>
      </article>
    </div>

    <!-- 推进链路 -->
    <section class="block">
      <div class="block-head">
        <h2>推进链路</h2>
        <span class="block-sub">从简历到面试的当前进度</span>
      </div>
      <div class="pipeline-flow">
        <template v-for="(step, i) in pipelineSteps" :key="step.key">
          <RouterLink class="pipeline-node" :class="`pipeline-node--${step.tone}`" :to="step.route">
            <span class="pipeline-no">{{ i + 1 }}</span>
            <strong class="pipeline-name">{{ step.title }}</strong>
            <span class="pipeline-metric">{{ step.metric }}</span>
            <span class="pipeline-state">{{ step.action }}</span>
          </RouterLink>
          <span v-if="i < pipelineSteps.length - 1" class="pipeline-link" aria-hidden="true" />
        </template>
      </div>
    </section>

    <!-- 快速入口 -->
    <section class="block">
      <div class="block-head">
        <h2>快速入口</h2>
        <span class="block-sub">常用工作流</span>
      </div>
      <div class="quick-grid">
        <RouterLink v-for="item in quickActions" :key="item.title" class="quick-card" :to="item.route">
          <div class="quick-card-main">
            <strong>{{ item.title }}</strong>
            <span>{{ item.desc }}</span>
          </div>
          <span class="quick-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overview-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 2px 0 8px;
}

/* ── 推荐下一步横幅 ── */
.next-hero {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  padding: 20px 24px;
  border-radius: 12px;
  background: var(--state-info-bg);
  border: 1px solid var(--state-info-border);
  text-decoration: none;
  color: inherit;
  overflow: hidden;
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

.next-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(43, 123, 184, 0.09), transparent 58%);
  opacity: 0.7;
}

.next-hero:hover {
  border-color: var(--primary-500);
  background: color-mix(in srgb, var(--primary-500) 12%, var(--bg-card));
}

.next-hero-label {
  position: relative;
  color: var(--state-info-text);
  font-size: 11px;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-card);
  border: 1px solid var(--state-info-border);
  white-space: nowrap;
}

.next-hero-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.next-hero-body strong {
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 800;
  line-height: 1.3;
}

.next-hero-body span {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.next-hero-cta {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 9px;
  background: var(--primary-600);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
  transition: background-color 0.16s ease;
}

.next-hero:hover .next-hero-cta {
  background: var(--primary-700);
}

.next-hero-cta svg {
  width: 15px;
  height: 15px;
}

.next-hero-cta path {
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

/* ── 统计卡片 ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

.stat-card--primary {
  border-color: var(--state-info-border);
  background: var(--state-info-bg);
}

.stat-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.stat-figure {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.stat-figure strong {
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.stat-card--primary .stat-figure strong {
  color: var(--primary-600);
}

.stat-card--warning .stat-figure strong {
  color: var(--state-warning-text);
}

.stat-figure em {
  color: var(--text-muted);
  font-size: 13px;
  font-style: normal;
  font-weight: 700;
}

.stat-note {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 区块通用 ── */
.block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.block-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.block-head h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 800;
}

.block-sub {
  color: var(--text-muted);
  font-size: 12px;
}

/* ── 推进链路 ── */
.pipeline-flow {
  display: flex;
  align-items: stretch;
  gap: 0;
}

.pipeline-node {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 11px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  text-decoration: none;
  color: inherit;
  transition: border-color 0.16s ease, background-color 0.16s ease;
  min-width: 0;
}

.pipeline-node:hover {
  border-color: var(--border-accent);
  background: rgba(43, 123, 184, 0.03);
}

.pipeline-no {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card-muted);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
}

.pipeline-node--ready .pipeline-no {
  background: rgba(26, 143, 94, 0.12);
  color: var(--accent-green);
}

.pipeline-node--active .pipeline-no {
  background: rgba(43, 123, 184, 0.12);
  color: var(--primary-600);
}

.pipeline-node--warning .pipeline-no {
  background: rgba(224, 138, 58, 0.12);
  color: var(--accent-orange);
}

.pipeline-node--active {
  border-color: var(--border-accent);
}

.pipeline-node--warning {
  border-color: rgba(224, 138, 58, 0.3);
}

.pipeline-name {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
}

.pipeline-metric {
  color: var(--text-secondary);
  font-size: 16px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.pipeline-state {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.pipeline-node--ready .pipeline-state {
  color: var(--accent-green);
}

.pipeline-link {
  flex: 0 0 24px;
  align-self: center;
  height: 2px;
  background: linear-gradient(90deg, var(--border-color), var(--border-color-strong));
  margin: 0 -1px;
  border-radius: 2px;
  position: relative;
  z-index: 0;
}

/* ── 快速入口 ── */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.quick-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  text-decoration: none;
  color: inherit;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.quick-card:hover {
  border-color: var(--primary-500);
  background: rgba(43, 123, 184, 0.04);
}

.quick-card-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.quick-card-main strong {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 800;
}

.quick-card-main span {
  color: var(--text-secondary);
  font-size: 12px;
}

.quick-arrow {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--bg-card-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: background-color 0.16s ease, color 0.16s ease;
}

.quick-card:hover .quick-arrow {
  background: var(--primary-600);
  color: #fff;
}

.quick-arrow svg {
  width: 14px;
  height: 14px;
}

.quick-arrow path {
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

/* ── 可访问性：键盘焦点 ── */
.next-hero:focus-visible,
.pipeline-node:focus-visible,
.quick-card:focus-visible {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
  border-radius: 12px;
}

/* ── 可访问性：尊重减少动效 ── */
@media (prefers-reduced-motion: reduce) {
  .next-hero,
  .stat-card,
  .pipeline-node,
  .quick-card,
  .quick-arrow {
    transition: none;
  }
}

/* ── 响应式 ── */
@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .quick-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .pipeline-flow {
    flex-wrap: wrap;
    gap: 8px;
  }

  .pipeline-node {
    flex: 1 1 calc(50% - 4px);
  }

  .pipeline-link {
    display: none;
  }
}

@media (max-width: 640px) {
  .next-hero {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .next-hero-cta {
    justify-content: center;
  }

  .stats-grid,
  .quick-grid {
    grid-template-columns: 1fr;
  }

  .pipeline-node {
    flex: 1 1 100%;
  }
}
</style>
