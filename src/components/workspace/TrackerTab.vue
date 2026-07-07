<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  useApplicationTrackerStore,
  APPLICATION_STATUS_OPTIONS,
  APPLICATION_PRIORITY_OPTIONS,
  type ApplicationStatus,
  type ApplicationPriority,
  type ApplicationTrackerItem,
} from '@/stores/applicationTracker'
import { useJdAnalysisStore, type JdPrepHistoryItem } from '@/stores/jdAnalysis'
import { useResumeStore } from '@/stores/resume'
import { useResumeReviewStore } from '@/stores/resumeReview'
import {
  buildDeliveryPackage,
  formatBossHelperConfig,
  type DeliveryReadinessState,
  type DeliveryReadinessStatus,
} from '@/services/applicationDelivery'
import { toast } from '@/utils/toast'

defineOptions({ name: 'TrackerTab' })

const jdStore = useJdAnalysisStore()
const trackerStore = useApplicationTrackerStore()
const resumeStore = useResumeStore()
const reviewStore = useResumeReviewStore()

const filters = reactive<{ status: 'all' | ApplicationStatus; priority: 'all' | ApplicationPriority; keyword: string }>({
  status: 'all',
  priority: 'all',
  keyword: '',
})

const expandedId = ref<string | null>(null)

function formatDate(value: string | null | undefined): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date)
}

function getStatusLabel(status: ApplicationStatus): string {
  return APPLICATION_STATUS_OPTIONS.find((o) => o.key === status)?.label ?? '关注中'
}

function getPriorityLabel(priority: ApplicationPriority): string {
  return APPLICATION_PRIORITY_OPTIONS.find((o) => o.key === priority)?.label ?? '中'
}

function getDeliveryStateLabel(state: DeliveryReadinessState): string {
  if (state === 'ready') return '可投递'
  if (state === 'review') return '建议复核'
  return '先处理'
}

function getReadinessStatusLabel(status: DeliveryReadinessStatus): string {
  if (status === 'pass') return '通过'
  if (status === 'warning') return '复核'
  return '阻塞'
}

function getReadiness(item: JdPrepHistoryItem): number {
  let score = 0
  if (item.matchResult) score += 25
  if (item.suggestions.length) score += 20
  if (item.interviewQuestions.length) score += 20
  if ((item.practiceCount ?? 0) > 0 || (item.linkedInterviewRecordIds?.length ?? 0) > 0) score += 20
  if (reviewStore.latestResult) score += 15
  return Math.min(100, score)
}

function getRiskLabel(item: JdPrepHistoryItem): string {
  if (!item.matchResult) return '待匹配'
  const matchScore = item.matchResult.score.total
  if (matchScore < 60) return '匹配偏低'
  if (!item.suggestions.length) return '缺少建议'
  if (!item.interviewQuestions.length) return '未备题'
  if (getReadiness(item) < 80) return '待训练'
  return '可推进'
}

function getRiskTone(label: string): string {
  if (label === '匹配偏低' || label === '待匹配') return 'danger'
  if (label === '缺少建议' || label === '未备题' || label === '待训练') return 'warning'
  return 'success'
}

const resumeSnapshot = computed(() => ({
  name: resumeStore.basicInfo.name,
  phone: resumeStore.basicInfo.phone,
  email: resumeStore.basicInfo.email,
  jobTitle: resumeStore.basicInfo.jobTitle,
  expectedLocation: resumeStore.basicInfo.expectedLocation || resumeStore.basicInfo.currentCity || resumeStore.basicInfo.location,
  expectedSalary: resumeStore.basicInfo.expectedSalary,
  skills: resumeStore.skills,
  workHighlights: resumeStore.workList
    .map((item) => [item.position, item.description].filter(Boolean).join('：'))
    .filter(Boolean),
  projectHighlights: resumeStore.projectList
    .map((item) => [item.name, item.mainWork || item.introduction].filter(Boolean).join('：'))
    .filter(Boolean),
}))

interface TrackerRow {
  id: string
  jd: JdPrepHistoryItem
  tracker: ApplicationTrackerItem
  title: string
  company: string
  status: ApplicationStatus
  priority: ApplicationPriority
  matchScore: number | null
  readiness: number
  riskLabel: string
  suggestions: number
  questions: number
  practiceCount: number
  updatedAt: string
  deliveryPackage: ReturnType<typeof buildDeliveryPackage>
}

const rows = computed<TrackerRow[]>(() =>
  jdStore.history.map((item) => {
    const tracker = trackerStore.getTrackerItem(item.id)
    return {
      id: item.id,
      jd: item,
      tracker,
      title: item.position || '未命名岗位',
      company: item.company || '未填写',
      status: tracker.status,
      priority: tracker.priority,
      matchScore: item.matchResult?.score.total ?? null,
      readiness: getReadiness(item),
      riskLabel: getRiskLabel(item),
      suggestions: item.suggestions.length,
      questions: item.interviewQuestions.length,
      practiceCount: item.practiceCount ?? item.linkedInterviewRecordIds?.length ?? 0,
      updatedAt: item.updatedAt,
      deliveryPackage: buildDeliveryPackage({
        jd: item,
        tracker,
        resume: resumeSnapshot.value,
        review: reviewStore.latestResult,
      }),
    }
  }),
)

const filteredRows = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return rows.value.filter((row) => {
    if (filters.status !== 'all' && row.status !== filters.status) return false
    if (filters.priority !== 'all' && row.priority !== filters.priority) return false
    if (!keyword) return true
    return `${row.title} ${row.company} ${row.tracker.channel} ${row.tracker.nextAction} ${row.tracker.note}`.toLowerCase().includes(keyword)
  })
})

const boardColumns = computed(() =>
  APPLICATION_STATUS_OPTIONS.map((option) => ({
    ...option,
    count: rows.value.filter((r) => r.status === option.key).length,
  })),
)

type TrackerPatch = Partial<Omit<ApplicationTrackerItem, 'jdId' | 'createdAt' | 'updatedAt'>>

function handleStatusChange(jdId: string, status: ApplicationStatus) {
  trackerStore.upsertTrackerItem(jdId, { status })
}

function handlePriorityChange(jdId: string, priority: ApplicationPriority) {
  trackerStore.upsertTrackerItem(jdId, { priority })
}

function handleFieldChange(jdId: string, field: 'channel' | 'nextAction' | 'note', value: string) {
  trackerStore.upsertTrackerItem(jdId, { [field]: value } as TrackerPatch)
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
  } catch {
    toast.error('复制失败，请检查浏览器剪贴板权限')
  }
}

function persistDeliveryPackage(row: TrackerRow, patch: TrackerPatch = {}) {
  trackerStore.upsertTrackerItem(row.jd.id, {
    platform: row.deliveryPackage.platform,
    channel: row.tracker.channel || 'Boss 直聘',
    jobUrl: row.deliveryPackage.searchUrl,
    greeting: row.deliveryPackage.greeting,
    ...patch,
  })
}

async function copyDeliveryGreeting(row: TrackerRow) {
  persistDeliveryPackage(row)
  await copyText(row.deliveryPackage.greeting, '已复制投递招呼语')
}

async function copyBossHelperConfig(row: TrackerRow) {
  persistDeliveryPackage(row)
  await copyText(formatBossHelperConfig(row.deliveryPackage.bossHelperConfig), '已复制 boss-helper 迁移配置')
}

function openDelivery(row: TrackerRow) {
  persistDeliveryPackage(row, {
    status: row.tracker.status === 'watching' ? 'ready' : row.tracker.status,
    nextAction: row.deliveryPackage.nextAction,
  })
  window.open(row.deliveryPackage.searchUrl, '_blank', 'noopener,noreferrer')
}

function markApplied(row: TrackerRow) {
  persistDeliveryPackage(row, {
    status: 'applied',
    appliedAt: new Date().toISOString(),
    nextAction: '等待 HR 回复，24-48 小时后跟进',
  })
  toast.success('已标记为已投递')
}

function openJd(item: JdPrepHistoryItem) {
  jdStore.openHistoryItem(item.id)
}

function removeTracking(jdId: string) {
  if (!window.confirm('确定移除该岗位的投递追踪记录？岗位分析记录会保留，可重新追踪。')) return
  trackerStore.removeTrackerItem(jdId)
  if (expandedId.value === jdId) expandedId.value = null
  toast.success('已移除投递追踪')
}
</script>

<template>
  <div class="tracker-tab">
    <!-- 筛选 + 概览 -->
    <div class="tracker-toolbar">
      <div class="filter-group">
        <input v-model="filters.keyword" type="search" class="filter-input" placeholder="搜索岗位、公司、渠道或备注" />
        <select v-model="filters.status" class="filter-select">
          <option value="all">全部状态</option>
          <option v-for="opt in APPLICATION_STATUS_OPTIONS" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
        </select>
        <select v-model="filters.priority" class="filter-select">
          <option value="all">全部优先级</option>
          <option v-for="opt in APPLICATION_PRIORITY_OPTIONS" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
        </select>
      </div>
      <RouterLink class="add-btn" :to="{ name: 'jd-analysis' }">新增 JD</RouterLink>
    </div>

    <div class="board-summary">
      <div v-for="col in boardColumns" :key="col.key" class="board-chip">
        <span>{{ col.label }}</span>
        <strong>{{ col.count }}</strong>
      </div>
    </div>

    <!-- 岗位列表（可展开投递执行台） -->
    <div v-if="filteredRows.length" class="tracker-list">
      <article
        v-for="row in filteredRows"
        :key="row.id"
        class="tracker-card"
        :class="{ expanded: expandedId === row.id }"
      >
        <!-- 行头部 -->
        <div class="card-head" @click="toggleExpand(row.id)">
          <div class="card-identity">
            <strong>{{ row.title }}</strong>
            <span>{{ row.company }}</span>
          </div>
          <div class="card-metrics">
            <span class="metric-pill">匹配 {{ row.matchScore ?? '--' }}</span>
            <span class="metric-pill">准备 {{ row.readiness }}%</span>
            <span class="metric-pill" :class="`risk-${getRiskTone(row.riskLabel)}`">{{ row.riskLabel }}</span>
            <span
              class="delivery-badge"
              :class="`delivery-badge--${row.deliveryPackage.readinessState}`"
            >{{ getDeliveryStateLabel(row.deliveryPackage.readinessState) }}</span>
          </div>
          <div class="card-controls" @click.stop>
            <select :value="row.status" class="inline-select" @change="handleStatusChange(row.id, ($event.target as HTMLSelectElement).value as ApplicationStatus)">
              <option v-for="opt in APPLICATION_STATUS_OPTIONS" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
            </select>
            <select :value="row.priority" class="inline-select" @change="handlePriorityChange(row.id, ($event.target as HTMLSelectElement).value as ApplicationPriority)">
              <option v-for="opt in APPLICATION_PRIORITY_OPTIONS" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
            </select>
            <button type="button" class="expand-btn" :class="{ open: expandedId === row.id }" :aria-expanded="expandedId === row.id">
              <svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>
        </div>

        <!-- 展开的投递执行台 -->
        <div v-if="expandedId === row.id" class="delivery-panel">
          <div class="delivery-head">
            <div class="delivery-head-left">
              <strong>{{ row.deliveryPackage.readinessScore }}%</strong>
              <span>投递准备度</span>
            </div>
            <p class="delivery-next">{{ row.deliveryPackage.nextAction }}</p>
          </div>

          <div class="greeting-block">
            <div class="greeting-top">
              <span class="greeting-label">投递招呼语</span>
              <div class="delivery-actions">
                <button type="button" class="d-btn" @click="copyDeliveryGreeting(row)">复制招呼语</button>
                <button type="button" class="d-btn primary" @click="openDelivery(row)">打开 Boss</button>
                <button type="button" class="d-btn" @click="markApplied(row)">标记已投递</button>
                <button type="button" class="d-btn ghost" @click="copyBossHelperConfig(row)">复制配置</button>
              </div>
            </div>
            <p class="greeting-text">{{ row.deliveryPackage.greeting }}</p>
          </div>

          <div class="readiness-grid">
            <div
              v-for="item in row.deliveryPackage.readinessItems"
              :key="item.key"
              class="readiness-cell"
              :class="`readiness-cell--${item.status}`"
            >
              <div>
                <strong>{{ item.label }}</strong>
                <span>{{ item.message }}</span>
              </div>
              <b>{{ getReadinessStatusLabel(item.status) }}</b>
            </div>
          </div>

          <div class="inline-fields">
            <label>
              <span>渠道</span>
              <input
                :value="row.tracker.channel"
                placeholder="Boss / 官网 / 内推"
                @change="handleFieldChange(row.id, 'channel', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label>
              <span>下一步</span>
              <input
                :value="row.tracker.nextAction"
                placeholder="补项目 / 约面 / 跟进"
                @change="handleFieldChange(row.id, 'nextAction', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label>
              <span>备注</span>
              <input
                :value="row.tracker.note"
                placeholder="联系人、时间或风险"
                @change="handleFieldChange(row.id, 'note', ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>

          <div class="card-footer">
            <div class="footer-left">
              <RouterLink class="jd-link" :to="{ name: 'jd-analysis' }" @click="openJd(row.jd)">查看 JD 详情</RouterLink>
              <button type="button" class="remove-btn" @click="removeTracking(row.id)">移除追踪</button>
            </div>
            <time>更新 {{ formatDate(row.updatedAt) }}</time>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="empty-state">
      暂无目标岗位。通过 JD 分析添加岗位后，追踪状态和投递包会自动显示在这里。
    </div>
  </div>
</template>

<style scoped>
.tracker-tab {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 2px 0 8px;
}

/* ── 工具栏 ── */
.tracker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 200px;
}

.filter-input,
.filter-select,
.inline-select {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  transition: border-color 0.15s ease;
}

.filter-input {
  flex: 1;
  min-width: 180px;
  font-weight: 500;
}

.filter-input:focus,
.filter-select:focus,
.inline-select:focus {
  outline: none;
  border-color: var(--primary-500);
}

.filter-select:hover,
.inline-select:hover {
  border-color: var(--border-accent);
}

.add-btn {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--primary-600);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  transition: background-color 0.15s ease;
}

.add-btn:hover {
  background: var(--primary-700);
}

/* ── 看板概览 ── */
.board-summary {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.board-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 11px;
  border-radius: 7px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.board-chip span {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.board-chip strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
}

/* ── 岗位卡片 ── */
.tracker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tracker-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.tracker-card:hover {
  border-color: var(--border-accent);
}

.tracker-card.expanded {
  border-color: var(--primary-500);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  cursor: pointer;
}

.card-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
  flex-shrink: 0;
}

.card-identity strong {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-identity span {
  color: var(--text-secondary);
  font-size: 12px;
}

.card-metrics {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.metric-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 6px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.metric-pill.risk-danger {
  background: rgba(216, 80, 80, 0.08);
  color: var(--accent-red);
}

.metric-pill.risk-warning {
  background: rgba(224, 138, 58, 0.08);
  color: var(--accent-orange);
}

.metric-pill.risk-success {
  background: rgba(26, 143, 94, 0.08);
  color: var(--accent-green);
}

.delivery-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
}

.delivery-badge--ready {
  background: rgba(26, 143, 94, 0.1);
  color: var(--accent-green);
}

.delivery-badge--review {
  background: rgba(224, 138, 58, 0.1);
  color: var(--accent-orange);
}

.delivery-badge--blocked {
  background: rgba(216, 80, 80, 0.1);
  color: var(--accent-red);
}

.card-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.inline-select {
  min-height: 30px;
  padding: 0 8px;
  font-size: 11px;
}

.expand-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.2s ease;
}

.expand-btn:hover {
  background: var(--bg-card-muted);
}

.expand-btn.open {
  transform: rotate(180deg);
  background: rgba(43, 123, 184, 0.08);
  color: var(--primary-600);
}

.expand-btn svg {
  width: 15px;
  height: 15px;
}

.expand-btn path {
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

/* ── 投递执行台 ── */
.delivery-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px 18px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.delivery-head {
  display: flex;
  align-items: center;
  gap: 16px;
}

.delivery-head-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.delivery-head-left strong {
  color: var(--primary-600);
  font-size: 24px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.delivery-head-left span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.delivery-next {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.greeting-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.greeting-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.greeting-label {
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 800;
}

.greeting-text {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.delivery-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.d-btn {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.d-btn:hover {
  border-color: var(--primary-500);
  background: rgba(43, 123, 184, 0.05);
}

.d-btn.primary {
  background: var(--primary-600);
  border-color: var(--primary-600);
  color: #fff;
}

.d-btn.primary:hover {
  background: var(--primary-700);
  border-color: var(--primary-700);
}

.d-btn.ghost {
  background: transparent;
  color: var(--text-secondary);
}

.readiness-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.readiness-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.readiness-cell > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.readiness-cell strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 800;
}

.readiness-cell span {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.readiness-cell b {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 800;
}

.readiness-cell--pass b {
  background: rgba(26, 143, 94, 0.1);
  color: var(--accent-green);
}

.readiness-cell--warning b {
  background: rgba(224, 138, 58, 0.1);
  color: var(--accent-orange);
}

.readiness-cell--blocked b {
  background: rgba(216, 80, 80, 0.1);
  color: var(--accent-red);
}

.inline-fields {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.inline-fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.inline-fields span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.inline-fields input {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
}

.inline-fields input:focus {
  outline: none;
  border-color: var(--primary-500);
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.jd-link {
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.jd-link:hover {
  color: var(--primary-700);
}

.remove-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s ease;
}

.remove-btn:hover {
  color: var(--accent-red);
}

.card-footer time {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.empty-state {
  padding: 36px 18px;
  border: 1px dashed var(--border-color-strong);
  border-radius: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  background: var(--bg-card);
}

@media (max-width: 768px) {
  .card-head {
    flex-wrap: wrap;
  }

  .card-identity {
    min-width: 0;
    flex: 1;
  }

  .card-controls {
    width: 100%;
    justify-content: flex-start;
  }

  .inline-fields {
    grid-template-columns: 1fr;
  }
}
</style>
