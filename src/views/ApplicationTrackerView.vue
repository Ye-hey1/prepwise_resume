<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useApplicationTrackerStore, APPLICATION_PRIORITY_OPTIONS, APPLICATION_STATUS_OPTIONS, type ApplicationPriority, type ApplicationStatus, type ApplicationTrackerItem } from '@/stores/applicationTracker'
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

defineOptions({ name: 'ApplicationTrackerView' })

const jdStore = useJdAnalysisStore()
const resumeStore = useResumeStore()
const reviewStore = useResumeReviewStore()
const trackerStore = useApplicationTrackerStore()
const selectedJdId = ref('')

const filters = reactive<{
  status: 'all' | ApplicationStatus
  priority: 'all' | ApplicationPriority
  keyword: string
}>({
  status: 'all',
  priority: 'all',
  keyword: '',
})

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
  const readiness = getReadiness(item)
  if (!item.matchResult) return '待匹配'
  const matchScore = item.matchResult.score.total
  if (matchScore < 60) return '匹配偏低'
  if (!item.suggestions.length) return '缺少建议'
  if (!item.interviewQuestions.length) return '未备题'
  if (readiness < 80) return '待训练'
  return '可推进'
}

function openJd(item: JdPrepHistoryItem) {
  jdStore.openHistoryItem(item.id)
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

const trackerRows = computed(() =>
  jdStore.history.map((item) => {
    const tracker = trackerStore.getTrackerItem(item.id)
    const title = item.position || '未命名岗位'
    const company = item.company || '未填写公司'

    return {
      jd: item,
      tracker,
      title,
      company,
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

type TrackerRow = typeof trackerRows.value[number]
type ApplicationTrackerPatch = Partial<Omit<ApplicationTrackerItem, 'jdId' | 'createdAt' | 'updatedAt'>>

const filteredRows = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()

  return trackerRows.value.filter((row) => {
    if (filters.status !== 'all' && row.tracker.status !== filters.status) return false
    if (filters.priority !== 'all' && row.tracker.priority !== filters.priority) return false
    if (!keyword) return true
    return `${row.title} ${row.company} ${row.tracker.channel} ${row.tracker.nextAction} ${row.tracker.note}`.toLowerCase().includes(keyword)
  })
})

const deliveryReadyRows = computed(() =>
  trackerRows.value.filter((row) => row.deliveryPackage.readinessState !== 'blocked'),
)

const selectedDeliveryRow = computed({
  get: () => trackerRows.value.find((row) => row.jd.id === selectedJdId.value) ?? deliveryReadyRows.value[0] ?? trackerRows.value[0] ?? null,
  set: (row: TrackerRow | null) => {
    selectedJdId.value = row?.jd.id ?? ''
  },
})

const selectedDeliveryJdId = computed({
  get: () => selectedDeliveryRow.value?.jd.id ?? '',
  set: (value: string) => {
    selectedJdId.value = value
  },
})

const selectedDeliveryPackage = computed(() => selectedDeliveryRow.value?.deliveryPackage ?? null)

const summaryCards = computed(() => {
  const rows = trackerRows.value
  const appliedCount = rows.filter((row) => ['applied', 'interviewing', 'offer'].includes(row.tracker.status)).length
  const interviewingCount = rows.filter((row) => row.tracker.status === 'interviewing').length
  const highPriorityCount = rows.filter((row) => row.tracker.priority === 'high').length
  const deliveryReadyCount = rows.filter((row) => row.deliveryPackage.readinessState === 'ready').length
  const averageReadiness = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.readiness, 0) / rows.length) : 0

  return [
    { label: '目标岗位', value: `${rows.length}`, note: '来自 JD 分析历史' },
    { label: '可投递', value: `${deliveryReadyCount}`, note: '通过投递前检查' },
    { label: '已推进', value: `${appliedCount}`, note: '已投递/面试/Offer' },
    { label: '准备度', value: rows.length ? `${averageReadiness}%` : '--', note: `${highPriorityCount} 个高优先级，${interviewingCount} 个面试中` },
  ]
})

const boardColumns = computed(() =>
  APPLICATION_STATUS_OPTIONS.map((option) => ({
    ...option,
    rows: trackerRows.value.filter((row) => row.tracker.status === option.key).slice(0, 4),
  })),
)

function getReadinessTone(readiness: number): 'high' | 'medium' | 'low' {
  if (readiness >= 80) return 'high'
  if (readiness >= 55) return 'medium'
  return 'low'
}

function getRiskTone(label: string): 'danger' | 'warning' | 'success' {
  if (label === '匹配偏低' || label === '待匹配') return 'danger'
  if (label === '缺少建议' || label === '未备题' || label === '待训练') return 'warning'
  return 'success'
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
  } catch {
    toast.error('复制失败，请检查浏览器剪贴板权限')
  }
}

function persistDeliveryPackage(row: TrackerRow, patch: ApplicationTrackerPatch = {}) {
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

function selectDeliveryRow(row: TrackerRow) {
  selectedDeliveryRow.value = row
}
</script>

<template>
  <section class="application-tracker">
    <div class="tracker-scroll">
      <div class="tracker-shell">
        <header class="tracker-header">
          <div>
            <span class="kicker">投递追踪</span>
            <h1>把目标岗位、简历准备和面试推进放在一张本地看板里</h1>
            <p>投递状态只保存在本机，岗位信息直接读取 JD 分析历史，用来承接工作台里的目标岗位准备池。</p>
          </div>
          <RouterLink class="primary-action" :to="{ name: 'jd-analysis' }">新增 JD</RouterLink>
        </header>

        <div class="summary-grid">
          <article v-for="item in summaryCards" :key="item.label" class="summary-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <p>{{ item.note }}</p>
          </article>
        </div>

        <section class="tracker-card delivery-console">
          <div class="section-head toolbar-head">
            <div>
              <span class="panel-label">投递执行台</span>
              <h2>生成投递包并连接 Boss 投递动作</h2>
            </div>
            <select v-if="trackerRows.length" v-model="selectedDeliveryJdId" class="delivery-select">
              <option v-for="row in trackerRows" :key="row.jd.id" :value="row.jd.id">
                {{ row.company }} · {{ row.title }}
              </option>
            </select>
          </div>

          <div v-if="selectedDeliveryRow && selectedDeliveryPackage" class="delivery-workbench">
            <div class="delivery-summary">
              <div>
                <span :class="`delivery-state delivery-state--${selectedDeliveryPackage.readinessState}`">
                  {{ getDeliveryStateLabel(selectedDeliveryPackage.readinessState) }}
                </span>
                <h3>{{ selectedDeliveryPackage.company }} · {{ selectedDeliveryPackage.title }}</h3>
                <p>{{ selectedDeliveryPackage.nextAction }}</p>
              </div>
              <strong>{{ selectedDeliveryPackage.readinessScore }}%</strong>
            </div>

            <div class="delivery-greeting">
              <span>招呼语</span>
              <p>{{ selectedDeliveryPackage.greeting }}</p>
              <div class="delivery-actions">
                <button type="button" @click="copyDeliveryGreeting(selectedDeliveryRow)">复制招呼语</button>
                <button type="button" @click="openDelivery(selectedDeliveryRow)">打开 Boss</button>
                <button type="button" @click="markApplied(selectedDeliveryRow)">标记已投递</button>
                <button type="button" class="ghost" @click="copyBossHelperConfig(selectedDeliveryRow)">复制配置</button>
              </div>
            </div>

            <div class="readiness-list">
              <article
                v-for="item in selectedDeliveryPackage.readinessItems"
                :key="item.key"
                class="readiness-item"
                :class="`readiness-item--${item.status}`"
              >
                <div>
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.message }}</span>
                </div>
                <b>{{ getReadinessStatusLabel(item.status) }}</b>
              </article>
            </div>
          </div>

          <div v-else class="empty-block">
            暂无可生成投递包的岗位。先完成一次 JD 分析并保存岗位后，这里会自动承接投递链路。
          </div>
        </section>

        <section class="tracker-card">
          <div class="section-head">
            <div>
              <span class="panel-label">流程看板</span>
              <h2>按投递状态归档</h2>
            </div>
          </div>

          <div class="board-grid">
            <article v-for="column in boardColumns" :key="column.key" class="board-column" :class="`board-column--${column.key}`">
              <div class="board-column-head">
                <strong>{{ column.label }}</strong>
                <span>{{ column.rows.length }}</span>
              </div>
              <p>{{ column.description }}</p>
              <div v-if="column.rows.length" class="board-items">
                <RouterLink
                  v-for="row in column.rows"
                  :key="row.jd.id"
                  class="board-item"
                  :to="{ name: 'jd-analysis' }"
                  @click="openJd(row.jd)"
                >
                  <strong>{{ row.title }}</strong>
                  <span>{{ row.company }}</span>
                  <b>{{ row.matchScore ?? '--' }} 匹配</b>
                </RouterLink>
              </div>
              <div v-else class="board-empty">暂无</div>
            </article>
          </div>
        </section>

        <section class="tracker-card">
          <div class="section-head toolbar-head">
            <div>
              <span class="panel-label">岗位清单</span>
              <h2>投递记录与下一步</h2>
            </div>
            <div class="tracker-filters">
              <input v-model="filters.keyword" type="search" placeholder="搜索岗位、公司、渠道或备注" />
              <select v-model="filters.status">
                <option value="all">全部状态</option>
                <option v-for="item in APPLICATION_STATUS_OPTIONS" :key="item.key" :value="item.key">{{ item.label }}</option>
              </select>
              <select v-model="filters.priority">
                <option value="all">全部优先级</option>
                <option v-for="item in APPLICATION_PRIORITY_OPTIONS" :key="item.key" :value="item.key">优先级 {{ item.label }}</option>
              </select>
            </div>
          </div>

          <div v-if="filteredRows.length" class="tracker-list">
            <article v-for="row in filteredRows" :key="row.jd.id" class="tracker-row">
              <div class="row-main">
                <div class="row-title">
                  <div>
                    <strong>{{ row.title }}</strong>
                    <span>{{ row.company }}</span>
                  </div>
                  <RouterLink :to="{ name: 'jd-analysis' }" @click="openJd(row.jd)">查看 JD</RouterLink>
                </div>

                <div class="row-metrics">
                  <span>匹配 {{ row.matchScore ?? '--' }}</span>
                  <span :class="`metric-pill--${getReadinessTone(row.readiness)}`">准备 {{ row.readiness }}%</span>
                  <span>建议 {{ row.suggestions }}</span>
                  <span>题目 {{ row.questions }}</span>
                  <span>训练 {{ row.practiceCount }}</span>
                  <span :class="`risk-pill--${getRiskTone(row.riskLabel)}`">{{ row.riskLabel }}</span>
                </div>
              </div>

              <div class="row-controls">
                <label>
                  <span>状态</span>
                  <select
                    :value="row.tracker.status"
                    @change="trackerStore.upsertTrackerItem(row.jd.id, { status: ($event.target as HTMLSelectElement).value as ApplicationStatus })"
                  >
                    <option v-for="item in APPLICATION_STATUS_OPTIONS" :key="item.key" :value="item.key">{{ item.label }}</option>
                  </select>
                </label>
                <label>
                  <span>优先级</span>
                  <select
                    :value="row.tracker.priority"
                    @change="trackerStore.upsertTrackerItem(row.jd.id, { priority: ($event.target as HTMLSelectElement).value as ApplicationPriority })"
                  >
                    <option v-for="item in APPLICATION_PRIORITY_OPTIONS" :key="item.key" :value="item.key">{{ item.label }}</option>
                  </select>
                </label>
                <label>
                  <span>渠道</span>
                  <input
                    :value="row.tracker.channel"
                    placeholder="Boss / 官网 / 内推"
                    @change="trackerStore.upsertTrackerItem(row.jd.id, { channel: ($event.target as HTMLInputElement).value })"
                  />
                </label>
                <label>
                  <span>下一步</span>
                  <input
                    :value="row.tracker.nextAction"
                    placeholder="补项目 / 约面 / 跟进"
                    @change="trackerStore.upsertTrackerItem(row.jd.id, { nextAction: ($event.target as HTMLInputElement).value })"
                  />
                </label>
                <label class="note-field">
                  <span>备注</span>
                  <input
                    :value="row.tracker.note"
                    placeholder="记录联系人、时间或风险"
                    @change="trackerStore.upsertTrackerItem(row.jd.id, { note: ($event.target as HTMLInputElement).value })"
                  />
                </label>
              </div>

              <div class="delivery-inline">
                <div class="delivery-inline-head">
                  <button
                    type="button"
                    :class="`delivery-state delivery-state--${row.deliveryPackage.readinessState}`"
                    @click="selectDeliveryRow(row)"
                  >
                    投递包 {{ getDeliveryStateLabel(row.deliveryPackage.readinessState) }}
                  </button>
                  <span>{{ row.deliveryPackage.nextAction }}</span>
                </div>
                <p>{{ row.deliveryPackage.greeting }}</p>
                <div class="delivery-actions compact">
                  <button type="button" @click="copyDeliveryGreeting(row)">复制招呼语</button>
                  <button type="button" @click="openDelivery(row)">打开 Boss</button>
                  <button type="button" @click="markApplied(row)">标记已投递</button>
                  <button type="button" class="ghost" @click="copyBossHelperConfig(row)">复制配置</button>
                </div>
              </div>

              <div class="row-footer">
              <span class="row-status-line">
                <b :class="`status-pill status-pill--${row.tracker.status}`">{{ getStatusLabel(row.tracker.status) }}</b>
                <b :class="`priority-pill priority-pill--${row.tracker.priority}`">优先级 {{ getPriorityLabel(row.tracker.priority) }}</b>
                <b v-if="row.tracker.appliedAt" class="applied-pill">投递 {{ formatDate(row.tracker.appliedAt) }}</b>
              </span>
              <time>更新 {{ formatDate(row.tracker.updatedAt || row.updatedAt) }}</time>
            </div>
            </article>
          </div>

          <div v-else class="empty-block">
            暂无可追踪岗位。先到 JD 分析页保存目标岗位，再回到这里维护投递状态。
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.application-tracker {
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: var(--bg-app);
}

.tracker-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 20px;
}

.tracker-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.tracker-header,
.summary-card,
.tracker-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.tracker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
}

.tracker-header h1 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 900;
  line-height: 1.25;
}

.tracker-header p {
  max-width: 78ch;
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--primary-600);
  color: white;
  font-size: 13px;
  font-weight: 850;
  white-space: nowrap;
  transition: background-color var(--transition-fast);
}

.primary-action:hover,
.primary-action:focus-visible {
  background: var(--primary-700);
}

.primary-action:focus-visible,
.board-item:focus-visible,
.row-title a:focus-visible,
.delivery-select:focus-visible,
.delivery-state:focus-visible,
.delivery-actions button:focus-visible,
.tracker-filters input:focus-visible,
.tracker-filters select:focus-visible,
.row-controls input:focus-visible,
.row-controls select:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-500) 58%, transparent);
  outline-offset: 2px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-card {
  min-width: 0;
  padding: 14px;
}

.summary-card span,
.panel-label,
.kicker {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.35;
}

.summary-card strong {
  display: block;
  margin-top: 5px;
  color: var(--text-primary);
  font-size: 26px;
  font-weight: 900;
  line-height: 1;
}

.summary-card p {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.tracker-card {
  padding: 16px;
}

.delivery-console {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--primary-500) 5%, transparent), transparent 54%),
    var(--bg-card);
}

.delivery-select {
  width: min(380px, 100%);
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

.delivery-select:hover,
.delivery-select:focus {
  border-color: var(--border-accent);
  background: var(--bg-card);
}

.delivery-workbench {
  display: grid;
  grid-template-columns: minmax(260px, 0.72fr) minmax(320px, 1fr) minmax(300px, 0.95fr);
  gap: 10px;
  align-items: stretch;
}

.delivery-summary,
.delivery-greeting,
.readiness-list,
.delivery-inline {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
}

.delivery-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 13px;
}

.delivery-summary > div {
  min-width: 0;
}

.delivery-summary h3 {
  margin: 8px 0 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 900;
  line-height: 1.35;
}

.delivery-summary p,
.delivery-greeting p,
.delivery-inline p {
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.delivery-summary strong {
  flex: 0 0 auto;
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
}

.delivery-state {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border: 0;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

button.delivery-state {
  cursor: pointer;
}

.delivery-state--ready {
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
}

.delivery-state--review {
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-card));
  color: var(--accent-orange);
}

.delivery-state--blocked {
  background: color-mix(in srgb, var(--accent-red) 9%, var(--bg-card));
  color: var(--accent-red);
}

.delivery-greeting {
  padding: 13px;
}

.delivery-greeting > span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 850;
}

.delivery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

.delivery-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--primary-600);
  color: white;
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.delivery-actions button:hover {
  background: var(--primary-700);
}

.delivery-actions button.ghost {
  border-color: color-mix(in srgb, var(--primary-500) 16%, transparent);
  background: color-mix(in srgb, var(--primary-500) 7%, var(--bg-card));
  color: var(--primary-600);
}

.delivery-actions button.ghost:hover {
  border-color: color-mix(in srgb, var(--primary-500) 28%, transparent);
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
  color: var(--primary-700);
}

.readiness-list {
  display: grid;
  gap: 7px;
  padding: 10px;
}

.readiness-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.readiness-item--blocker {
  border-color: color-mix(in srgb, var(--accent-red) 28%, var(--border-color));
  background: color-mix(in srgb, var(--accent-red) 5%, var(--bg-card));
}

.readiness-item--warning {
  border-color: color-mix(in srgb, var(--accent-orange) 26%, var(--border-color));
  background: color-mix(in srgb, var(--accent-orange) 5%, var(--bg-card));
}

.readiness-item--pass {
  border-color: color-mix(in srgb, var(--accent-green) 20%, var(--border-color));
  background: color-mix(in srgb, var(--accent-green) 4%, var(--bg-card));
}

.readiness-item div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.readiness-item strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.35;
}

.readiness-item span {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.readiness-item b {
  min-height: 22px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.4;
  white-space: nowrap;
}

.readiness-item--blocker b {
  background: color-mix(in srgb, var(--accent-red) 10%, var(--bg-card));
  color: var(--accent-red);
}

.readiness-item--warning b {
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-card));
  color: var(--accent-orange);
}

.readiness-item--pass b {
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  margin-bottom: 12px;
}

.section-head h2 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 900;
  line-height: 1.3;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(168px, 1fr));
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.board-column {
  position: relative;
  min-width: 0;
  padding: 11px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
}

.board-column::before {
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  border-radius: 10px 10px 0 0;
  background: var(--border-color-strong);
  content: "";
}

.board-column--watching::before,
.status-pill--watching {
  background: color-mix(in srgb, var(--gray-500) 16%, var(--bg-card));
  color: var(--text-secondary);
}

.board-column--ready::before,
.status-pill--ready {
  background: color-mix(in srgb, var(--primary-500) 14%, var(--bg-card));
  color: var(--primary-600);
}

.board-column--applied::before,
.status-pill--applied {
  background: color-mix(in srgb, var(--accent-info) 14%, var(--bg-card));
  color: var(--accent-info);
}

.board-column--interviewing::before,
.status-pill--interviewing {
  background: color-mix(in srgb, var(--accent-orange) 14%, var(--bg-card));
  color: var(--accent-orange);
}

.board-column--offer::before,
.status-pill--offer {
  background: color-mix(in srgb, var(--accent-green) 14%, var(--bg-card));
  color: var(--accent-green);
}

.board-column--rejected::before,
.status-pill--rejected {
  background: color-mix(in srgb, var(--accent-red) 11%, var(--bg-card));
  color: var(--accent-red);
}

.board-column-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.board-column-head strong,
.board-item strong,
.tracker-row strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
}

.board-column-head span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-500) 8%, var(--bg-card));
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 900;
}

.board-column p {
  min-height: 34px;
  margin: 6px 0 10px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.board-items {
  display: grid;
  gap: 7px;
}

.board-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: inherit;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.board-item:hover {
  border-color: color-mix(in srgb, var(--primary-500) 28%, var(--border-color));
  background: color-mix(in srgb, var(--primary-500) 5%, var(--bg-card));
}

.board-item strong,
.board-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-item span,
.tracker-row span,
.row-footer time,
.board-empty {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.board-item b {
  margin-top: 4px;
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 900;
}

.board-empty {
  padding: 14px 8px;
  border: 1px dashed var(--border-color-strong);
  border-radius: 8px;
  text-align: center;
}

.toolbar-head {
  align-items: center;
}

.tracker-filters {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 120px 130px;
  gap: 8px;
  min-width: min(100%, 520px);
}

.tracker-filters input,
.tracker-filters select,
.row-controls input,
.row-controls select {
  width: 100%;
  min-width: 0;
  min-height: 34px;
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

.tracker-filters input:hover,
.tracker-filters select:hover,
.row-controls input:hover,
.row-controls select:hover {
  border-color: color-mix(in srgb, var(--primary-500) 22%, var(--border-color));
}

.tracker-filters input:focus,
.tracker-filters select:focus,
.row-controls input:focus,
.row-controls select:focus {
  border-color: var(--border-accent);
  background: var(--bg-card);
}

.tracker-list {
  display: grid;
  gap: 10px;
}

.tracker-row {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(420px, 1.3fr);
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.tracker-row:hover {
  border-color: color-mix(in srgb, var(--primary-500) 22%, var(--border-color));
  background: color-mix(in srgb, var(--primary-500) 4%, var(--bg-card));
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.row-title > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.row-title strong,
.row-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-title a {
  flex: 0 0 auto;
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

.row-title a:hover {
  background: color-mix(in srgb, var(--primary-500) 8%, var(--bg-card));
  color: var(--primary-700);
}

.row-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.row-metrics span {
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.row-metrics .metric-pill--high {
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
}

.row-metrics .metric-pill--medium {
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-card));
  color: var(--accent-orange);
}

.row-metrics .metric-pill--low {
  background: color-mix(in srgb, var(--accent-red) 9%, var(--bg-card));
  color: var(--accent-red);
}

.row-metrics .risk-pill--danger {
  background: color-mix(in srgb, var(--accent-red) 9%, var(--bg-card));
  color: var(--accent-red);
}

.row-metrics .risk-pill--warning {
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-card));
  color: var(--accent-orange);
}

.row-metrics .risk-pill--success {
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
}

.row-controls {
  display: grid;
  grid-template-columns: 110px 86px minmax(120px, 1fr) minmax(140px, 1fr);
  gap: 8px;
  min-width: 0;
}

.row-controls label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.row-controls label > span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 850;
}

.note-field {
  grid-column: 1 / -1;
}

.delivery-inline {
  grid-column: 1 / -1;
  padding: 11px;
}

.delivery-inline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.delivery-inline-head span {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delivery-actions.compact {
  margin-top: 9px;
}

.delivery-actions.compact button {
  min-height: 30px;
  padding: 0 9px;
}

.row-footer {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.row-footer span {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 850;
}

.row-status-line {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.status-pill,
.priority-pill,
.applied-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}

.priority-pill--high {
  background: color-mix(in srgb, var(--accent-red) 9%, var(--bg-card));
  color: var(--accent-red);
}

.priority-pill--medium {
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-card));
  color: var(--accent-orange);
}

.priority-pill--low {
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
}

.applied-pill {
  background: color-mix(in srgb, var(--accent-info) 10%, var(--bg-card));
  color: var(--accent-info);
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

@media (max-width: 1180px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .delivery-workbench {
    grid-template-columns: 1fr;
  }

  .toolbar-head,
  .tracker-header {
    align-items: stretch;
    flex-direction: column;
  }

  .tracker-filters {
    grid-template-columns: 1fr;
    min-width: 0;
  }

  .tracker-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .tracker-scroll {
    padding: 64px 12px 12px;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .tracker-header h1 {
    font-size: 21px;
  }

  .row-controls {
    grid-template-columns: 1fr;
  }

  .delivery-inline-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .delivery-inline-head span {
    text-align: left;
    white-space: normal;
  }

  .delivery-actions button {
    flex: 1 1 140px;
  }

  .row-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
