<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useResumeStore } from '@/stores/resume'
import { matchResumeToJD } from '@/services/jdService'
import type { JDData, JDMatchResult, RequirementMatch, JdPrepInsight, JdPrepModuleKey, RequirementCategory } from '@/services/types/jd'

const props = defineProps<{
  jdData: JDData | null
  matchResult: JDMatchResult | null
  prepInsight: JdPrepInsight | null
  resumeText: string
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'match-done', result: JDMatchResult): void
  (e: 'loading-change', loading: boolean, label: string): void
  (e: 'error', msg: string): void
  (e: 'go-to-optimize'): void
}>()

const aiConfigStore = useAiConfigStore()
const resumeStore = useResumeStore()
const router = useRouter()

const topCriticalGaps = computed(() => {
  if (!props.matchResult) return []
  return props.matchResult.matches
    .filter((m: RequirementMatch) => (
      m.status === 'missing' || (m.riskGaps?.length ?? 0) > 0
    ) && (m.category === 'mustHave' || m.category === 'techStack'))
    .slice(0, 3)
})

const scoreCategories = [
  { key: 'mustHave', label: '必须条件' },
  { key: 'techStack', label: '技术栈' },
  { key: 'experience', label: '经验' },
  { key: 'degree', label: '学历' },
  { key: 'jobDuties', label: '职责匹配' },
  { key: 'niceToHave', label: '加分项' },
] as const

const overviewStats = computed(() => {
  if (!props.matchResult) return []

  const matched = props.matchResult.matches.filter((item) => item.status === 'matched').length
  const partial = props.matchResult.matches.filter((item) => item.status === 'partial').length
  const missing = props.matchResult.matches.filter((item) => item.status === 'missing').length

  return [
    { label: '完全匹配', value: `${matched} 条`, hint: '可作为投递优势' },
    { label: '部分匹配', value: `${partial} 条`, hint: '建议补足证据' },
    { label: '明显缺口', value: `${missing} 条`, hint: '优先处理' },
  ]
})

const gapModuleMap: Record<string, JdPrepModuleKey> = {
  mustHave: 'skills',
  techStack: 'skills',
  experience: 'workExperience',
  degree: 'education',
  jobDuties: 'workExperience',
  niceToHave: 'skills',
}

const evidenceMatchCount = computed(() => props.matchResult?.matches.filter((item) => item.evidenceList?.length).length ?? 0)
const riskGapCount = computed(() => props.matchResult?.matches.filter((item) => item.riskGaps?.length).length ?? 0)
const questionGroupCount = computed(() => props.prepInsight?.likelyQuestionGroups.length ?? 0)

const prepMetrics = computed(() => {
  if (!props.prepInsight) return []

  return [
    { label: '推荐讲述经历', value: `${props.prepInsight.recommendedStories.length} 条` },
    { label: '备面优先项', value: `${props.prepInsight.prepPriorities.length} 条` },
    { label: '高风险追问', value: `${props.prepInsight.highRiskFollowUps.length} 条` },
    { label: '追问组', value: `${props.prepInsight.likelyQuestionGroups.length} 组` },
  ]
})

function goToModule(moduleKey: JdPrepModuleKey) {
  resumeStore.requestScrollToModule(moduleKey)
  router.push({ name: 'resume-editor' })
}

function goToEditorForGap(category: string) {
  const key = gapModuleMap[category] || 'skills'
  goToModule(key)
}

async function handleMatch() {
  if (!props.jdData) return
  emit('loading-change', true, '正在匹配分析...')

  try {
    const result = await matchResumeToJD(
      aiConfigStore.getConfigForFeature('jdAnalysis'),
      props.jdData,
      props.resumeText,
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (msg) => { emit('error', msg) },
      },
    )
    emit('match-done', result)
  } catch (err) {
    emit('error', err instanceof Error ? err.message : '匹配分析失败')
  } finally {
    emit('loading-change', false, '')
  }
}

function statusLabel(status: string) {
  if (status === 'matched') return '匹配'
  if (status === 'partial') return '部分'
  return '缺失'
}

function statusColor(status: string) {
  if (status === 'matched') return 'var(--accent-green)'
  if (status === 'partial') return 'var(--primary-500)'
  return 'var(--accent-red)'
}

function scoreColor(score: number) {
  if (score >= 80) return 'var(--accent-green)'
  if (score >= 60) return 'var(--primary-500)'
  if (score >= 40) return '#e8a838'
  return 'var(--accent-red)'
}

function categoryLabel(category: RequirementCategory) {
  const labels: Record<RequirementCategory, string> = {
    mustHave: '必备要求',
    niceToHave: '加分项',
    degree: '学历',
    experience: '经验',
    techStack: '技术栈',
    jobDuties: '职责',
  }
  return labels[category]
}
</script>

<template>
  <div class="match-tab">
    <!-- 空态 -->
    <section v-if="!matchResult" class="action-card">
      <h3 class="action-title">匹配分析</h3>
      <p class="action-desc">对比当前简历和目标 JD，快速找出优势与缺口。</p>
      <button class="btn-primary" :disabled="isLoading || !jdData" @click="handleMatch">
        {{ isLoading ? '分析中...' : '开始匹配分析' }}
      </button>
    </section>

    <!-- 匹配结果 -->
    <template v-else>
      <header class="score-card">
        <div class="score-info">
          <h3 class="score-title">适配评分</h3>
          <div class="score-number" :style="{ color: scoreColor(matchResult.score.total) }">
            {{ matchResult.score.total }}
          </div>
          <p class="score-desc">{{ matchResult.summary }}</p>
        </div>
      </header>

      <!-- 概览统计 -->
      <div class="stats-row">
        <article v-for="item in overviewStats" :key="item.label" class="stat-item">
          <strong>{{ item.value }}</strong>
          <span>{{ item.label }}</span>
        </article>
      </div>

      <!-- 增强信号 -->
      <div class="signal-row">
        <div class="signal-item">
          <span class="signal-label">命中证据</span>
          <strong>{{ evidenceMatchCount }}</strong>
        </div>
        <div class="signal-item risk">
          <span class="signal-label">风险缺口</span>
          <strong>{{ riskGapCount }}</strong>
        </div>
        <div class="signal-item neutral">
          <span class="signal-label">追问组</span>
          <strong>{{ questionGroupCount }}</strong>
        </div>
      </div>

      <!-- 高优先级缺口 -->
      <section v-if="topCriticalGaps.length" class="section-block">
        <div class="section-header">
          <h4 class="section-title">高优先级缺口</h4>
          <span class="section-badge">先补硬要求</span>
        </div>
        <div class="gap-list">
          <article v-for="(gap, i) in topCriticalGaps" :key="i" class="gap-item">
            <div class="gap-header">
              <span class="gap-req">{{ gap.requirement }}</span>
              <span class="gap-badge" :class="gap.category">{{ categoryLabel(gap.category) }}</span>
            </div>
            <ul v-if="gap.riskGaps?.length" class="nested-list">
              <li v-for="(item, index) in gap.riskGaps" :key="`${gap.requirement}-risk-${index}`">{{ item }}</li>
            </ul>
            <p v-if="gap.suggestion" class="gap-suggestion">{{ gap.suggestion }}</p>
            <div class="item-actions">
              <button class="btn-sm primary" @click="emit('go-to-optimize')">去优化</button>
              <button class="btn-sm ghost" @click="goToEditorForGap(gap.category)">去编辑</button>
            </div>
          </article>
        </div>
      </section>

      <!-- 备面洞察 -->
      <section v-if="prepInsight" class="section-block accent">
        <div class="section-header">
          <h4 class="section-title">备面洞察</h4>
        </div>
        <p v-if="prepInsight.summary" class="prep-summary">{{ prepInsight.summary }}</p>

        <div class="stats-row">
          <article v-for="item in prepMetrics" :key="item.label" class="stat-item">
            <strong>{{ item.value }}</strong>
            <span>{{ item.label }}</span>
          </article>
        </div>

        <!-- 备面优先项 -->
        <ol v-if="prepInsight.prepPriorities.length" class="priority-list">
          <li v-for="(item, index) in prepInsight.prepPriorities" :key="`${item}-${index}`" class="priority-item">
            <span class="priority-index">{{ index + 1 }}</span>
            <span class="priority-text">{{ item }}</span>
          </li>
        </ol>
      </section>

      <!-- 推荐讲述经历 -->
      <section v-if="prepInsight?.recommendedStories.length" class="section-block">
        <div class="section-header">
          <h4 class="section-title">推荐讲述经历</h4>
        </div>
        <div class="card-grid">
          <article v-for="(story, index) in prepInsight.recommendedStories" :key="`${story.title}-${index}`" class="story-card">
            <div class="card-top">
              <div>
                <h5 class="card-title">{{ story.title }}</h5>
                <p class="card-desc">{{ story.reason }}</p>
              </div>
              <button class="btn-sm ghost" @click="goToModule(story.moduleKey)">去编辑</button>
            </div>
            <ul v-if="story.talkingPoints.length" class="nested-list">
              <li v-for="(point, pi) in story.talkingPoints" :key="`${story.title}-${pi}`">{{ point }}</li>
            </ul>
          </article>
        </div>
      </section>

      <!-- 追问路径 -->
      <section v-if="prepInsight?.likelyQuestionGroups.length" class="section-block">
        <div class="section-header">
          <h4 class="section-title">大概率追问路径</h4>
        </div>
        <div class="card-grid">
          <article v-for="(group, index) in prepInsight.likelyQuestionGroups" :key="`${group.title}-${index}`" class="story-card">
            <div class="card-top">
              <h5 class="card-title">{{ group.title }}</h5>
            </div>
            <p v-if="group.intent" class="card-desc">{{ group.intent }}</p>
            <ul class="nested-list">
              <li v-for="(q, qi) in group.questions" :key="`${group.title}-${qi}`">{{ q }}</li>
            </ul>
          </article>
        </div>
      </section>

      <!-- 高风险追问点 -->
      <section v-if="prepInsight?.highRiskFollowUps.length" class="section-block">
        <div class="section-header">
          <h4 class="section-title">高风险追问点</h4>
        </div>
        <div class="card-grid">
          <article v-for="(item, index) in prepInsight.highRiskFollowUps" :key="`${item.question}-${index}`" class="story-card risk">
            <div class="card-top">
              <h5 class="card-title">{{ item.question }}</h5>
              <button class="btn-sm ghost" @click="goToModule(item.moduleKey)">去编辑</button>
            </div>
            <div class="risk-detail">
              <p class="risk-line"><span class="detail-label">风险原因</span>{{ item.riskReason }}</p>
              <p v-if="item.suggestion" class="risk-line"><span class="detail-label">建议回答</span>{{ item.suggestion }}</p>
            </div>
          </article>
        </div>
      </section>

      <!-- 分类评分 -->
      <section class="section-block">
        <div class="section-header">
          <h4 class="section-title">分类评分</h4>
        </div>
        <div class="score-bars">
          <div v-for="cat in scoreCategories" :key="cat.key" class="bar-item">
            <span class="bar-label">{{ cat.label }}</span>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{
                  width: matchResult.score[cat.key] + '%',
                  background: scoreColor(matchResult.score[cat.key]),
                }"
              />
            </div>
            <span class="bar-value" :style="{ color: scoreColor(matchResult.score[cat.key]) }">
              {{ matchResult.score[cat.key] }}
            </span>
          </div>
        </div>
      </section>

      <!-- 优势 / 差距 -->
      <div class="insights-row">
        <article class="insight-card">
          <h4 class="insight-title green">匹配优势</h4>
          <ul class="insight-list">
            <li v-for="(s, i) in matchResult.strengths" :key="i">{{ s }}</li>
          </ul>
        </article>
        <article class="insight-card">
          <h4 class="insight-title red">关键差距</h4>
          <ul class="insight-list">
            <li v-for="(g, i) in matchResult.gaps" :key="i">{{ g }}</li>
          </ul>
        </article>
      </div>

      <!-- 逐条匹配 -->
      <section class="section-block">
        <div class="section-header">
          <h4 class="section-title">逐条匹配分析</h4>
        </div>
        <div class="match-list">
          <article
            v-for="(m, i) in matchResult.matches"
            :key="i"
            class="match-item"
            :class="m.status"
          >
            <div class="match-header">
              <div class="match-title-group">
                <span class="match-req">{{ m.requirement }}</span>
                <span class="match-category">{{ categoryLabel(m.category) }}</span>
              </div>
              <span class="match-badge" :style="{ color: statusColor(m.status) }">{{ statusLabel(m.status) }}</span>
            </div>

            <p v-if="m.matchReason" class="match-detail">
              <span class="detail-label">匹配判断</span>{{ m.matchReason }}
            </p>

            <div v-if="m.evidenceList?.length" class="evidence-block">
              <span class="detail-label">匹配证据</span>
              <ul class="nested-list evidence">
                <li v-for="(item, ei) in m.evidenceList" :key="`${m.requirement}-evidence-${ei}`">{{ item }}</li>
              </ul>
            </div>
            <p v-else-if="m.evidence && m.evidence !== '简历中未提及'" class="match-detail">
              <span class="detail-label">简历证据</span>{{ m.evidence }}
            </p>

            <div v-if="m.riskGaps?.length" class="risk-block">
              <span class="detail-label">风险缺口</span>
              <ul class="nested-list risk">
                <li v-for="(item, gi) in m.riskGaps" :key="`${m.requirement}-gap-${gi}`">{{ item }}</li>
              </ul>
            </div>

            <p v-if="m.suggestion" class="match-detail">
              <span class="detail-label">建议动作</span>{{ m.suggestion }}
            </p>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.match-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

/* ── Shared & Standardization ── */
.section-block {
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
  background: #fafafa;
}

.section-block.accent {
  background: #fdfdfd;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
}

.section-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  background: color-mix(in srgb, var(--accent-red) 8%, var(--bg-card));
  color: var(--accent-red);
}

.detail-label {
  display: inline-block;
  margin-right: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.nested-list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nested-list li {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}

.nested-list.evidence li::marker { color: var(--accent-green); }
.nested-list.risk li::marker { color: var(--accent-red); }

/* ── Action Card ── */
.action-card {
  padding: 24px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}

.action-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.btn-primary {
  align-self: flex-start;
  min-height: 42px;
  padding: 0 22px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: var(--text-inverse);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--primary-500) 22%, transparent);
  transition: all 0.2s ease;
}

.btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

.btn-sm {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-sm.primary {
  border: none;
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: var(--text-inverse);
}

.btn-sm.ghost {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
}

.btn-sm.ghost:hover { border-color: var(--primary-500); color: var(--primary-500); }

/* ── Score Card ── */
.score-card {
  display: flex;
  flex-direction: column;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
  background: #fafafa;
}

.score-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}

.score-number {
  font-size: 42px;
  font-weight: 800;
  line-height: 1;
}

.score-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* ── Stats Row ── */
.stats-row {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.stat-item {
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-item strong {
  font-size: 16px;
  font-weight: 800;
  color: var(--primary-600);
}

.stat-item span {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

/* ── Signal Row ── */
.signal-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.signal-item {
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.signal-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.signal-item strong {
  font-size: 18px;
  font-weight: 800;
  color: var(--primary-600);
}

.signal-item.risk strong { color: var(--accent-red); }
.signal-item.neutral strong { color: #e8a838; }

/* ── Critical Gaps ── */
.gap-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gap-item {
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gap-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.gap-req {
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.5;
}

.gap-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.gap-badge.mustHave {
  background: color-mix(in srgb, var(--accent-red) 10%, var(--bg-card));
  color: var(--accent-red);
}

.gap-badge.techStack {
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
  color: var(--primary-500);
}

.gap-suggestion {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.item-actions {
  display: flex;
  gap: 6px;
}

/* ── Prep Section ── */
.prep-summary {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

/* Priority List */
.priority-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.priority-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.priority-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  min-height: 20px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card-muted));
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
}

.priority-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}

/* ── Card Grid ── */
.card-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.story-card {
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.story-card.risk {
  background: color-mix(in srgb, var(--accent-red) 3%, var(--bg-card));
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.5;
}

.card-desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.risk-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.risk-line {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}

/* ── Score Bars ── */
.score-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bar-label {
  width: 72px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.bar-track {
  flex: 1;
  height: 6px;
  background: var(--border-color);
  border-radius: 999px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
}

.bar-value {
  width: 28px;
  text-align: right;
  font-size: 13px;
  font-weight: 800;
}

/* ── Insights ── */
.insights-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.insight-card {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.insight-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 800;
}

.insight-title.green { color: var(--accent-green); }
.insight-title.red { color: var(--accent-red); }

.insight-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.insight-list li {
  position: relative;
  padding-left: 16px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.7;
}

.insight-title.green + .insight-list li::before,
.insight-title.red + .insight-list li::before {
  position: absolute;
  left: 0;
  font-weight: 800;
}

.insight-title.green + .insight-list li::before {
  content: '✓';
  color: var(--accent-green);
}

.insight-title.red + .insight-list li::before {
  content: '!';
  color: var(--accent-red);
}

/* ── Match List ── */
.match-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.match-item {
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.match-item.matched { background: color-mix(in srgb, var(--accent-green) 3%, var(--bg-card)); }
.match-item.partial { background: color-mix(in srgb, var(--primary-500) 3%, var(--bg-card)); }
.match-item.missing { background: color-mix(in srgb, var(--accent-red) 3%, var(--bg-card)); }

.match-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.match-title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.match-req {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.5;
}

.match-category {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background: var(--bg-card-muted);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  width: fit-content;
}

.match-badge {
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}

.match-detail {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}

.evidence-block {
  margin-top: 4px;
}

.risk-block {
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-red) 4%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--accent-red) 10%, transparent);
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .score-card {
    flex-direction: column;
    text-align: center;
  }

  .insights-row,
  .signal-row {
    grid-template-columns: 1fr;
  }

  .card-grid {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .gap-header,
  .card-top,
  .match-header {
    flex-direction: column;
  }
}
</style>
