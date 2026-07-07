<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import {
  useOpportunityWorkspaces,
  type OpportunitySignal,
  type OpportunityTone,
  type OpportunityWorkspace,
} from '@/composables/useOpportunityWorkspaces'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { APPLICATION_PRIORITY_OPTIONS, APPLICATION_STATUS_OPTIONS } from '@/stores/applicationTracker'

defineOptions({ name: 'OpportunitiesTab' })

const TRAINING_CENTER_SELECTED_JOB_KEY = 'prepwise-training-center-selected-jd'

const jdStore = useJdAnalysisStore()
const {
  opportunities,
  activeOpportunity,
  resumeCompletion,
  criticalSignalCount,
} = useOpportunityWorkspaces()

const averageReadiness = computed(() => {
  if (!opportunities.value.length) return 0
  const total = opportunities.value.reduce((sum, item) => sum + item.readinessScore, 0)
  return Math.round(total / opportunities.value.length)
})

const readyCount = computed(() =>
  opportunities.value.filter((item) => item.readinessTone === 'ready').length
)

const blockedCount = computed(() =>
  opportunities.value.filter((item) => item.readinessTone === 'blocked').length
)

const summaryCards = computed(() => [
  {
    label: '机会总数',
    value: opportunities.value.length,
    unit: '个',
    note: activeOpportunity.value ? `${activeOpportunity.value.company} · ${activeOpportunity.value.title}` : '暂无目标岗位',
    tone: 'primary',
  },
  {
    label: '平均准备度',
    value: averageReadiness.value,
    unit: '%',
    note: readyCount.value ? `${readyCount.value} 个机会可推进` : '继续补齐闭环资产',
    tone: averageReadiness.value >= 75 ? 'success' : averageReadiness.value >= 50 ? 'warning' : 'neutral',
  },
  {
    label: '阻塞机会',
    value: blockedCount.value,
    unit: '个',
    note: criticalSignalCount.value ? `${criticalSignalCount.value} 条高风险信号` : '暂无高风险信号',
    tone: blockedCount.value ? 'danger' : 'success',
  },
  {
    label: '简历完整度',
    value: resumeCompletion.value,
    unit: '%',
    note: '当前基础简历资产',
    tone: resumeCompletion.value >= 70 ? 'success' : 'warning',
  },
])

function routeName(route: RouteLocationRaw): string {
  return typeof route === 'object' && route !== null && 'name' in route ? String(route.name ?? '') : ''
}

function syncOpportunityContext(opportunity: OpportunityWorkspace, route: RouteLocationRaw) {
  const name = routeName(route)
  if (name === 'jd-analysis') {
    jdStore.openHistoryItem(opportunity.jd.id)
  }
  if (name === 'training-center' && typeof localStorage !== 'undefined') {
    localStorage.setItem(TRAINING_CENTER_SELECTED_JOB_KEY, opportunity.jd.id)
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date)
}

function getStatusLabel(status: string): string {
  return APPLICATION_STATUS_OPTIONS.find((item) => item.key === status)?.label ?? '关注中'
}

function getPriorityLabel(priority: string): string {
  return APPLICATION_PRIORITY_OPTIONS.find((item) => item.key === priority)?.label ?? '中'
}

function getToneLabel(tone: OpportunityTone): string {
  if (tone === 'ready') return '可推进'
  if (tone === 'active') return '推进中'
  if (tone === 'warning') return '需复核'
  if (tone === 'blocked') return '有阻塞'
  return '待启动'
}

function getStepToneLabel(tone: OpportunityTone): string {
  if (tone === 'ready') return '已就绪'
  if (tone === 'active') return '进行中'
  if (tone === 'warning') return '需处理'
  if (tone === 'blocked') return '阻塞'
  return '待开始'
}

function getSignalToneLabel(tone: OpportunitySignal['tone']): string {
  if (tone === 'critical') return '高风险'
  if (tone === 'warning') return '提醒'
  return '关注'
}
</script>

<template>
  <div class="opportunities-tab">
    <section v-if="opportunities.length" class="opportunity-summary">
      <article
        v-for="item in summaryCards"
        :key="item.label"
        class="summary-card"
        :class="`summary-card--${item.tone}`"
      >
        <span class="summary-label">{{ item.label }}</span>
        <div class="summary-value">
          <strong>{{ item.value }}</strong>
          <em>{{ item.unit }}</em>
        </div>
        <span class="summary-note">{{ item.note }}</span>
      </article>
    </section>

    <RouterLink
      v-if="activeOpportunity"
      class="priority-action"
      :to="activeOpportunity.nextAction.route"
      @click="syncOpportunityContext(activeOpportunity, activeOpportunity.nextAction.route)"
    >
      <span class="priority-kicker">推荐推进</span>
      <div class="priority-main">
        <strong>{{ activeOpportunity.company }} · {{ activeOpportunity.title }}</strong>
        <span>{{ activeOpportunity.nextAction.label }}：{{ activeOpportunity.nextAction.detail }}</span>
      </div>
      <span class="priority-cta">处理</span>
    </RouterLink>

    <div v-if="opportunities.length" class="opportunity-list">
      <article
        v-for="opportunity in opportunities"
        :key="opportunity.id"
        class="opportunity-card"
        :class="`opportunity-card--${opportunity.readinessTone}`"
      >
        <header class="opportunity-head">
          <div class="opportunity-identity">
            <div class="title-line">
              <strong>{{ opportunity.title }}</strong>
              <span>{{ opportunity.company }}</span>
            </div>
            <div class="meta-line">
              <span>{{ getStatusLabel(opportunity.tracker.status) }}</span>
              <span>{{ getPriorityLabel(opportunity.tracker.priority) }}优先级</span>
              <time>更新 {{ formatDate(opportunity.updatedAt) }}</time>
            </div>
          </div>

          <div class="score-block">
            <span :class="`tone-badge tone-badge--${opportunity.readinessTone}`">{{ getToneLabel(opportunity.readinessTone) }}</span>
            <strong>{{ opportunity.readinessScore }}</strong>
            <em>闭环准备度</em>
          </div>
        </header>

        <RouterLink
          class="next-action"
          :to="opportunity.nextAction.route"
          @click="syncOpportunityContext(opportunity, opportunity.nextAction.route)"
        >
          <span>下一步</span>
          <strong>{{ opportunity.nextAction.label }}</strong>
          <p>{{ opportunity.nextAction.detail }}</p>
        </RouterLink>

        <div class="loop-flow">
          <RouterLink
            v-for="step in opportunity.loopSteps"
            :key="step.key"
            class="loop-step"
            :class="`loop-step--${step.state}`"
            :to="step.route"
            @click="syncOpportunityContext(opportunity, step.route)"
          >
            <span class="step-status">{{ getStepToneLabel(step.state) }}</span>
            <strong>{{ step.label }}</strong>
            <b>{{ step.metric }}</b>
            <small>{{ step.action }}</small>
          </RouterLink>
        </div>

        <div class="opportunity-body">
          <section class="metric-panel">
            <div class="panel-head">
              <span>关键指标</span>
              <RouterLink
                :to="{ name: 'workspace-dashboard', query: { tab: 'tracker' } }"
                class="panel-link"
              >追踪</RouterLink>
            </div>
            <div class="metric-grid">
              <div class="metric-cell">
                <span>JD 匹配</span>
                <strong>{{ opportunity.jd.matchResult?.score.total ?? '--' }}</strong>
              </div>
              <div class="metric-cell">
                <span>投递准备</span>
                <strong>{{ opportunity.deliveryPackage.readinessScore }}%</strong>
              </div>
              <div class="metric-cell">
                <span>题目</span>
                <strong>{{ opportunity.questionCount }}</strong>
              </div>
              <div class="metric-cell">
                <span>薄弱题</span>
                <strong>{{ opportunity.weakQuestionCount }}</strong>
              </div>
              <div class="metric-cell">
                <span>面试</span>
                <strong>{{ opportunity.linkedInterviews.length }}</strong>
              </div>
              <div class="metric-cell">
                <span>学习记录</span>
                <strong>{{ opportunity.learningRecordCount }}</strong>
              </div>
            </div>
          </section>

          <section class="signal-panel">
            <div class="panel-head">
              <span>待处理信号</span>
              <span v-if="opportunity.signals.length" class="signal-count">{{ opportunity.signals.length }}</span>
            </div>

            <div v-if="opportunity.signals.length" class="signal-list">
              <RouterLink
                v-for="signal in opportunity.signals"
                :key="signal.id"
                class="signal-item"
                :class="`signal-item--${signal.tone}`"
                :to="signal.route"
                @click="syncOpportunityContext(opportunity, signal.route)"
              >
                <b>{{ getSignalToneLabel(signal.tone) }}</b>
                <div>
                  <strong>{{ signal.title }}</strong>
                  <span>{{ signal.detail }}</span>
                </div>
              </RouterLink>
            </div>

            <div v-else class="quiet-state">
              当前没有明显阻塞，继续按下一步推进。
            </div>
          </section>
        </div>

        <footer class="delivery-strip">
          <div>
            <span>投递包</span>
            <strong>{{ opportunity.deliveryPackage.company }} · {{ opportunity.deliveryPackage.title }}</strong>
          </div>
          <p>{{ opportunity.deliveryPackage.greeting }}</p>
          <RouterLink
            :to="{ name: 'workspace-dashboard', query: { tab: 'tracker' } }"
            class="delivery-link"
          >进入投递</RouterLink>
        </footer>
      </article>
    </div>

    <section v-else class="empty-state">
      <div class="empty-copy">
        <span>机会闭环</span>
        <strong>先绑定一个目标岗位</strong>
        <p>完成 JD 分析后，这里会自动聚合岗位画像、简历版本、审查任务、题库训练、模拟面试和投递追踪。</p>
      </div>
      <div class="empty-actions">
        <RouterLink class="empty-btn primary" :to="{ name: 'jd-analysis' }">分析 JD</RouterLink>
        <RouterLink class="empty-btn" :to="{ name: 'resume-editor' }">完善简历</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.opportunities-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 2px 0 8px;
}

.opportunity-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}

.summary-card--primary {
  border-color: var(--state-info-border);
  background: var(--state-info-bg);
}

.summary-card--warning {
  border-color: rgba(224, 138, 58, 0.24);
  background: rgba(224, 138, 58, 0.05);
}

.summary-card--danger {
  border-color: rgba(216, 80, 80, 0.24);
  background: rgba(216, 80, 80, 0.05);
}

.summary-card--success {
  border-color: rgba(26, 143, 94, 0.22);
  background: rgba(26, 143, 94, 0.05);
}

.summary-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
}

.summary-value {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.summary-value strong {
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.summary-card--primary .summary-value strong {
  color: var(--primary-600);
}

.summary-card--warning .summary-value strong {
  color: var(--accent-orange);
}

.summary-card--danger .summary-value strong {
  color: var(--accent-red);
}

.summary-card--success .summary-value strong {
  color: var(--accent-green);
}

.summary-value em {
  color: var(--text-muted);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.summary-note {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.priority-action {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid var(--state-info-border);
  border-radius: 10px;
  background: var(--state-info-bg);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.priority-action:hover {
  border-color: var(--primary-500);
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
}

.priority-kicker {
  padding: 4px 9px;
  border-radius: 99px;
  background: var(--bg-card);
  color: var(--state-info-text);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.priority-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.priority-main strong {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.priority-main span {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.priority-cta {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--primary-600);
  color: #fff;
  font-size: 12px;
  font-weight: 900;
}

.opportunity-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.opportunity-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  transition: border-color 0.16s ease;
}

.opportunity-card:hover {
  border-color: var(--border-accent);
}

.opportunity-card--blocked {
  border-color: rgba(216, 80, 80, 0.28);
}

.opportunity-card--warning {
  border-color: rgba(224, 138, 58, 0.28);
}

.opportunity-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.opportunity-identity {
  min-width: 0;
}

.title-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.title-line strong {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title-line span {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.meta-line {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.meta-line span,
.meta-line time {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--bg-card-muted);
}

.score-block {
  display: grid;
  grid-template-columns: auto auto;
  align-items: baseline;
  column-gap: 8px;
  row-gap: 3px;
  flex-shrink: 0;
  text-align: right;
}

.score-block strong {
  grid-row: span 2;
  color: var(--text-primary);
  font-size: 34px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.score-block em {
  color: var(--text-muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.tone-badge {
  justify-self: end;
  padding: 3px 8px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.tone-badge--ready {
  background: rgba(26, 143, 94, 0.1);
  color: var(--accent-green);
}

.tone-badge--active {
  background: rgba(43, 123, 184, 0.1);
  color: var(--primary-600);
}

.tone-badge--warning,
.tone-badge--pending {
  background: rgba(224, 138, 58, 0.1);
  color: var(--accent-orange);
}

.tone-badge--blocked {
  background: rgba(216, 80, 80, 0.1);
  color: var(--accent-red);
}

.next-action {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-card-muted);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.next-action:hover {
  border-color: var(--primary-500);
  background: rgba(43, 123, 184, 0.05);
}

.next-action span {
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.next-action strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.next-action p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loop-flow {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.loop-step {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-card);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.loop-step:hover {
  border-color: var(--border-accent);
  background: rgba(43, 123, 184, 0.03);
}

.loop-step--ready {
  border-color: rgba(26, 143, 94, 0.22);
}

.loop-step--active {
  border-color: rgba(43, 123, 184, 0.24);
}

.loop-step--warning,
.loop-step--pending {
  border-color: rgba(224, 138, 58, 0.22);
}

.loop-step--blocked {
  border-color: rgba(216, 80, 80, 0.24);
}

.step-status {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 900;
}

.loop-step--ready .step-status {
  color: var(--accent-green);
}

.loop-step--active .step-status {
  color: var(--primary-600);
}

.loop-step--warning .step-status,
.loop-step--pending .step-status {
  color: var(--accent-orange);
}

.loop-step--blocked .step-status {
  color: var(--accent-red);
}

.loop-step strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loop-step b {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loop-step small {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.opportunity-body {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 12px;
}

.metric-panel,
.signal-panel {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.panel-head span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 900;
}

.panel-link {
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 900;
  text-decoration: none;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.metric-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-card);
}

.metric-cell span {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
}

.metric-cell strong {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.signal-count {
  min-width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  background: var(--bg-card);
  color: var(--text-primary);
}

.signal-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.signal-item {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: 8px;
  background: var(--bg-card);
  color: inherit;
  text-decoration: none;
  transition: background-color 0.16s ease;
}

.signal-item:hover {
  background: color-mix(in srgb, var(--primary-500) 5%, var(--bg-card));
}

.signal-item b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  border-radius: 6px;
  background: var(--bg-card-muted);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 900;
}

.signal-item--critical b {
  background: rgba(216, 80, 80, 0.1);
  color: var(--accent-red);
}

.signal-item--warning b {
  background: rgba(224, 138, 58, 0.1);
  color: var(--accent-orange);
}

.signal-item div {
  min-width: 0;
}

.signal-item strong,
.signal-item span {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.signal-item strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
}

.signal-item span {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 11px;
}

.quiet-state {
  min-height: 62px;
  display: flex;
  align-items: center;
  padding: 12px;
  border: 1px dashed var(--border-color-strong);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  background: var(--bg-card);
}

.delivery-strip {
  display: grid;
  grid-template-columns: minmax(180px, 0.35fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-card-muted);
}

.delivery-strip div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.delivery-strip span {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 900;
}

.delivery-strip strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delivery-strip p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delivery-link {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 7px;
  background: var(--primary-600);
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  text-decoration: none;
  white-space: nowrap;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 28px;
  border: 1px dashed var(--border-color-strong);
  border-radius: 12px;
  background: var(--bg-card);
}

.empty-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.empty-copy span {
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 900;
}

.empty-copy strong {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 900;
}

.empty-copy p {
  max-width: 620px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.empty-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.empty-btn {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
  text-decoration: none;
}

.empty-btn.primary {
  border-color: var(--primary-600);
  background: var(--primary-600);
  color: #fff;
}

.priority-action:focus-visible,
.next-action:focus-visible,
.loop-step:focus-visible,
.signal-item:focus-visible,
.delivery-link:focus-visible,
.empty-btn:focus-visible {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
}

@media (max-width: 1024px) {
  .opportunity-summary {
    grid-template-columns: repeat(2, 1fr);
  }

  .loop-flow {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .opportunity-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .opportunity-summary {
    grid-template-columns: 1fr;
  }

  .priority-action,
  .next-action,
  .delivery-strip,
  .empty-state {
    grid-template-columns: 1fr;
  }

  .priority-action,
  .empty-state {
    align-items: stretch;
  }

  .priority-cta,
  .delivery-link,
  .empty-btn {
    justify-content: center;
  }

  .opportunity-head {
    flex-direction: column;
  }

  .score-block {
    align-self: flex-start;
    text-align: left;
  }

  .loop-flow,
  .metric-grid {
    grid-template-columns: 1fr;
  }

  .title-line {
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }

  .priority-main strong,
  .priority-main span,
  .next-action p,
  .delivery-strip p {
    white-space: normal;
  }

  .empty-actions {
    flex-direction: column;
  }
}
</style>
