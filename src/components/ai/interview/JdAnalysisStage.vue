<script setup lang="ts">
import { computed, ref } from 'vue'

import type { InterviewJdContext } from '@/components/ai/interview/types'

const jdDraft = defineModel<string>('jdDraft', { required: true })

const props = defineProps<{
  canAnalyze: boolean
  hasExistingJd?: boolean
  existingJdSummary?: string
  jdContext?: InterviewJdContext
  canStartInterview?: boolean
  historyRecords?: Array<{
    id: string
    date: string
    mode: string
    targetRole: string
    totalScore: number | null
    passed: boolean | null
  }>
}>()

const showResultModal = ref(false)

const emit = defineEmits<{
  analyze: []
  skip: []
  reuseExisting: []
  startInterview: []
  viewHistory: [id: string]
  deleteHistory: [id: string]
}>()

const hasAnalysis = computed(() => Boolean(props.jdContext?.jdText?.trim()))
const roleLabel = computed(() => props.jdContext?.targetRole?.trim() || '岗位分析结果')
const summaryText = computed(() => props.jdContext?.summary?.trim() || '输入 JD 后，系统会在这里生成岗位摘要与备面方向。')
const prepSummary = computed(() => props.jdContext?.prepSummary?.trim() || '完成解析后，这里会生成匹配度、差距和高风险追问。')
const skillTags = computed(() => props.jdContext?.mustHaveSkills ?? [])
const focusAreas = computed(() => props.jdContext?.focusAreas ?? [])
const resumeGaps = computed(() => props.jdContext?.resumeGaps ?? [])
const prepPriorities = computed(() => props.jdContext?.prepPriorities ?? [])
const recommendedStories = computed(() => props.jdContext?.recommendedStories ?? [])
const highRiskFollowUps = computed(() => props.jdContext?.highRiskFollowUps ?? [])
const historyPreview = computed(() => props.historyRecords?.slice(0, 2) ?? [])

const matchScore = computed(() => {
  if (!hasAnalysis.value) return 0

  const strengths = skillTags.value.length * 10 + focusAreas.value.length * 6
  const penalties = resumeGaps.value.length * 8 + highRiskFollowUps.value.length * 4
  return Math.max(42, Math.min(96, 62 + strengths - penalties))
})

const scoreDashOffset = computed(() => {
  const circumference = 251.2
  return circumference - (matchScore.value / 100) * circumference
})

const primaryQuestions = computed(() => highRiskFollowUps.value.slice(0, 3))
const storyPreview = computed(() => recommendedStories.value.slice(0, 2))
const focusPreview = computed(() => focusAreas.value.slice(0, 3))

const setupStats = computed(() => [
  { label: 'JD 字数', value: `${jdDraft.value.length || 0}` },
  { label: '岗位关键词', value: hasAnalysis.value ? `${skillTags.value.length}` : '--' },
  { label: '高风险追问', value: hasAnalysis.value ? `${highRiskFollowUps.value.length}` : '--' },
])

const statusTitle = computed(() => {
  if (props.canStartInterview) return '可以进入面试配置'
  if (jdDraft.value.trim()) return '等待解析岗位'
  return '等待输入 JD'
})

const statusText = computed(() => {
  if (props.canStartInterview) {
    return '岗位已解析，可以直接进入这轮面试配置。'
  }
  if (jdDraft.value.trim()) {
    return '当前已输入 JD，点击解析后生成岗位准备结果。'
  }
  return '先输入 JD，再进行岗位解析。'
})
</script>

<template>
  <section class="analysis-stage">
    <article class="workbench-card">
      <header class="workbench-head">
        <div class="head-copy">
          <span class="section-kicker">岗位准备</span>
          <h2 class="section-title">输入岗位 JD</h2>
          <p class="section-desc">粘贴岗位描述后直接解析，生成匹配度、差距和预测问题。</p>
        </div>

        <div class="head-actions">
          <button v-if="jdDraft" class="btn-ghost" type="button" @click="jdDraft = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            清空
          </button>
          
          <template v-if="!props.canStartInterview">
            <button class="btn-secondary" type="button" @click="emit('skip')">跳过解析</button>
            <button class="btn-primary" :disabled="!props.canAnalyze" type="button" @click="emit('analyze')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              开始解析
            </button>
          </template>
          
          <template v-else>
            <button class="btn-secondary" :disabled="!props.canAnalyze" type="button" @click="emit('analyze')">重新解析</button>
            <button class="btn-primary" type="button" @click="emit('startInterview')">开始面试</button>
          </template>
        </div>
      </header>

      <div v-if="props.hasExistingJd" class="reuse-banner">
        <div class="reuse-copy">
          <strong>检测到最近分析结果</strong>
          <span>{{ props.existingJdSummary || '可以点击进入最近一次岗位准备面板。' }}</span>
        </div>
        <button class="btn btn-secondary" type="button" @click="emit('reuseExisting')">
          点击进入
        </button>
      </div>

      <div class="setup-layout">
        <div class="editor-panel">
          <label class="editor-field">
            <textarea
              v-model="jdDraft"
              class="field-textarea"
              placeholder="请粘贴职位描述，建议包含职责范围、任职要求、技术栈、业务方向和加分项。"
            />
          </label>

          <div class="editor-toolbar">
            <div class="setup-stats">
              <div v-for="item in setupStats" :key="item.label" class="stat-chip">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </div>
        </div>

        <aside class="guide-panel">
          <section class="guide-card guide-card--status">
            <span class="guide-label">当前状态</span>
            <strong>{{ statusTitle }}</strong>
            <p>{{ statusText }}</p>
            <button
              v-if="hasAnalysis"
              class="btn-primary"
              style="margin-top: 16px; width: 100%; border-radius: 10px; padding: 12px; border: none; font-size: 14px; font-weight: bold; cursor: pointer;"
              @click="showResultModal = true"
            >
              查看深度分析报告
            </button>
          </section>

          <section class="guide-card" v-if="historyPreview.length">
            <div class="guide-title-row">
              <span class="guide-label">最近记录</span>
              <button
                class="text-btn"
                type="button"
                @click="historyPreview[0] && emit('viewHistory', historyPreview[0].id)"
              >
                查看
              </button>
            </div>

            <div class="history-list">
              <button
                v-for="record in historyPreview"
                :key="record.id"
                class="history-item"
                type="button"
                @click="emit('viewHistory', record.id)"
              >
                <strong>{{ record.targetRole || '未识别岗位' }}</strong>
                <span>
                  {{ record.totalScore != null ? `${record.totalScore.toFixed(1)} 分` : '暂无分数' }}
                  · {{ record.date.slice(5, 16).replace('T', ' ') }}
                </span>
              </button>
            </div>
          </section>
        </aside>
      </div>
    </article>

    <!-- 分析结果弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showResultModal" class="result-modal-overlay" @click="showResultModal = false">
          <div class="result-modal-container" @click.stop>
            <header class="rm-header">
              <h3>岗位深度分析报告</h3>
              <button class="rm-close" @click="showResultModal = false">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </header>
            <div class="rm-body">
              <section class="results-shell">
      <header class="results-head">
        <div>
          <span class="section-kicker">分析结果</span>
          <h3 class="results-title">{{ roleLabel }}</h3>
        </div>
        <p class="results-desc">
          {{ hasAnalysis ? prepSummary : '结果区固定为摘要卡和 4 个核心结果模块。' }}
        </p>
      </header>

            <article class="summary-panel">
        <div class="summary-copy">
          <span class="summary-label">{{ hasAnalysis ? '岗位摘要' : '等待岗位摘要' }}</span>
          <strong style="line-height: 1.6; font-size: 15px;">{{ summaryText }}</strong>
        </div>
        
        <div class="summary-tags-block" v-if="hasAnalysis && focusPreview.length">
          <div class="summary-tags">
            <span v-for="item in focusPreview" :key="item" class="summary-tag">{{ item }}</span>
          </div>
        </div>
        
        <div v-if="!hasAnalysis" class="summary-copy" style="margin-top: 8px">
          <p style="color: var(--text-muted); font-size: 14px;">解析完成后会直接显示匹配得分、技能差距、故事切口和预测问题。</p>
        </div>
      </article>

      <div class="results-grid">
        <article class="result-card result-card--score">
          <div class="card-head">
            <span class="card-title">匹配得分</span>
            <span class="card-badge">{{ hasAnalysis ? '已生成' : '待生成' }}</span>
          </div>

          <div class="score-ring">
            <svg viewBox="0 0 100 100">
              <circle class="score-ring-track" cx="50" cy="50" r="40" />
              <circle class="score-ring-progress" cx="50" cy="50" r="40" :style="{ strokeDashoffset: `${scoreDashOffset}` }" />
            </svg>
            <div class="score-value">
              <strong>{{ matchScore }}</strong>
              <span>%</span>
            </div>
          </div>

          <p class="card-desc">
            {{ hasAnalysis ? '这里会显示当前简历与岗位要求的接近程度。' : '这里会显示当前简历与岗位要求的接近程度。' }}
          </p>
        </article>

        <article class="result-card">
          <div class="card-head">
            <span class="card-title">技能差距</span>
            <span class="card-badge">{{ hasAnalysis ? `${resumeGaps.length} 个缺口` : '待生成' }}</span>
          </div>

          <div class="tag-group-block">
            <span class="tag-group-title">岗位关键词</span>
            <div class="tag-group">
              <span v-for="item in skillTags.slice(0, 6)" :key="item" class="tag tag-skill">{{ item }}</span>
              <span v-if="!skillTags.length" class="tag tag-muted">等待解析结果</span>
            </div>
          </div>

          <div class="tag-group-block">
            <span class="tag-group-title">简历缺口</span>
            <div class="tag-group">
              <span v-for="item in resumeGaps.slice(0, 4)" :key="item" class="tag tag-gap">{{ item }}</span>
              <span v-if="!resumeGaps.length" class="tag tag-good">
                {{ hasAnalysis ? '当前未发现明显缺口' : '解析完成后自动识别' }}
              </span>
            </div>
          </div>
        </article>

        <article class="result-card">
          <div class="card-head">
            <span class="card-title">优先故事</span>
            <span class="card-badge">{{ hasAnalysis ? `${recommendedStories.length} 条` : '待生成' }}</span>
          </div>

          <ul class="story-list">
            <li v-for="story in storyPreview" :key="story.title">
              <strong>{{ story.title }}</strong>
              <span>{{ story.reason }}</span>
            </li>
            <li v-if="!storyPreview.length">
              <strong>{{ hasAnalysis ? '结果较少' : '等待生成故事切口' }}</strong>
              <span>系统会结合你的项目经历，挑出最适合本次岗位的表达入口。</span>
            </li>
          </ul>
        </article>

        <article class="result-card">
          <div class="card-head">
            <span class="card-title">预测问题</span>
            <span class="card-badge">{{ hasAnalysis ? `${highRiskFollowUps.length} 条` : '待生成' }}</span>
          </div>

          <div class="question-list">
            <div v-for="(item, index) in primaryQuestions" :key="item.question" class="question-item">
              <div class="question-index">{{ index + 1 }}</div>
              <div class="question-copy">
                <strong>{{ item.question }}</strong>
                <span>{{ item.riskReason }}</span>
              </div>
            </div>
            <div v-if="!primaryQuestions.length" class="question-item question-item--empty">
              <div class="question-index">1</div>
              <div class="question-copy">
                <strong>等待高风险追问</strong>
                <span>完成岗位解析后，这里会自动列出最值得提前准备的问题。</span>
              </div>
            </div>
          </div>
        </article>
      </div>
              </section>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.analysis-stage {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
}

.workbench-card,
.summary-panel,
.result-card,
.guide-card {
  border-radius: 24px;
  border: 1px solid var(--border-color-strong);
  background: var(--bg-card);
  box-shadow: var(--iv-shell-shadow-sm);
}

.workbench-card,
.results-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.workbench-card {
  padding: 24px;
  background: var(--bg-card);
}

.workbench-head,
.results-head,
.summary-panel,
.editor-toolbar,
.guide-title-row,
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.head-copy,
.summary-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.section-kicker,
.guide-label,
.summary-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--primary-600);
}

.section-title,
.results-title {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.2;
}

.section-title {
  font-size: clamp(24px, 2.4vw, 28px);
}

.results-title {
  font-size: clamp(22px, 2vw, 26px);
}

.section-desc,
.results-desc,
.summary-copy p,
.guide-card p,
.card-desc,
.question-copy span,
.story-list span,
.history-item span {
  margin: 0;
  color: var(--iv-text-body);
  font-size: 14px;
  line-height: 1.7;
}

.reuse-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.reuse-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.reuse-copy strong {
  color: var(--text-primary);
  font-size: 14px;
}

.reuse-copy span {
  color: var(--iv-text-body);
  font-size: 13px;
  line-height: 1.6;
}

.setup-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
}

.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 22px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.editor-field {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.field-head-side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.field-label {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 800;
}

.field-note {
  color: var(--text-muted);
  font-size: 12px;
  text-align: right;
}

.field-textarea {
  min-height: 320px;
  width: 100%;
  resize: vertical;
  padding: 18px 20px;
  border-radius: 22px;
  border: 1px solid var(--border-color-strong);
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  line-height: 1.7;
}

.field-textarea:focus {
  outline: none;
  border-color: rgba(43, 123, 184, 0.36);
  box-shadow: 0 0 0 4px rgba(43, 123, 184, 0.08);
}

.editor-toolbar {
  align-items: center;
  flex-wrap: wrap;
}

.setup-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.stat-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.stat-chip span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.stat-chip strong {
  color: var(--text-primary);
  font-size: 15px;
}

.toolbar-actions,
.summary-actions,
.summary-tags {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.field-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-inline {
  min-height: 38px;
  padding: 0 16px;
  font-size: 13px;
}

.btn {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform var(--iv-duration-fast) var(--iv-ease),
    box-shadow var(--iv-duration-fast) var(--iv-ease),
    border-color var(--iv-duration-fast) var(--iv-ease),
    background-color var(--iv-duration-fast) var(--iv-ease);
}

.btn:hover:not(:disabled),
.text-btn:hover,
.history-item:hover {
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 1;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.btn-primary {
  color: #fff;
  background: var(--iv-brand-gradient);
  box-shadow: 0 12px 26px rgba(43, 123, 184, 0.18);
}

.btn-primary:disabled {
  color: var(--text-muted);
  background: var(--bg-card-muted);
  border-color: var(--border-color);
}

.btn-secondary {
  color: var(--primary-600);
  background: rgba(43, 123, 184, 0.08);
  border-color: rgba(43, 123, 184, 0.12);
}

.btn-secondary:disabled {
  color: var(--text-muted);
  background: var(--bg-card-muted);
  border-color: var(--border-color);
}

.text-btn {
  border: none;
  background: transparent;
  color: var(--iv-text-body);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.guide-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.guide-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  background: var(--bg-card-muted);
}

.guide-card--status {
  background: color-mix(in srgb, var(--primary-500) 6%, var(--bg-card-muted));
}

.guide-card strong,
.summary-copy strong,
.question-copy strong,
.story-list strong {
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.5;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
  text-align: left;
  cursor: pointer;
}

.history-item strong {
  color: var(--text-primary);
  font-size: 14px;
}

.summary-panel {
  padding: 22px 24px;
  background: linear-gradient(135deg, var(--bg-elevated), color-mix(in srgb, var(--primary-500) 4%, var(--bg-card)));
}

.summary-copy {
  max-width: 700px;
}

.summary-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-end;
}

.summary-tag,
.tag,
.card-badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.summary-tag,
.card-badge {
  background: rgba(43, 123, 184, 0.08);
  color: var(--primary-600);
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.result-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 22px;
}

.result-card--score {
  align-items: center;
  text-align: center;
}

.card-title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 800;
}

.score-ring {
  position: relative;
  width: 132px;
  height: 132px;
}

.score-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.score-ring-track,
.score-ring-progress {
  fill: transparent;
  stroke-width: 8;
}

.score-ring-track {
  stroke: rgba(43, 123, 184, 0.1);
}

.score-ring-progress {
  stroke: var(--primary-500);
  stroke-linecap: round;
  stroke-dasharray: 251.2;
  transition: stroke-dashoffset var(--iv-duration-slow) var(--iv-ease);
}

.score-value {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transform: translateY(-2px);
}

.score-value strong {
  color: var(--text-primary);
  font-size: clamp(38px, 4vw, 44px);
  line-height: 1;
  display: block;
}

.score-value span {
  color: var(--text-muted);
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  display: block;
}

.tag-group-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tag-group-title {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag-skill {
  background: rgba(43, 123, 184, 0.08);
  color: var(--primary-600);
}

.tag-gap {
  background: rgba(211, 93, 93, 0.12);
  color: var(--iv-danger);
}

.tag-good {
  background: rgba(26, 143, 94, 0.12);
  color: var(--iv-success);
}

.tag-muted {
  background: rgba(118, 136, 161, 0.12);
  color: var(--text-muted);
}

.story-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.story-list li {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.question-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.question-item {
  display: flex;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.question-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(43, 123, 184, 0.1);
  color: var(--iv-brand-700);
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}

.question-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

@media (max-width: 1180px) {
  .setup-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 920px) {
  .results-head,
  .summary-panel,
  .editor-toolbar {
    flex-direction: column;
  }

  .toolbar-actions,
  .summary-actions,
  .summary-side {
    width: 100%;
    align-items: stretch;
  }

  .field-head,
  .field-head-side,
  .field-actions {
    width: 100%;
  }

  .field-head-side {
    justify-content: flex-start;
  }

  .field-note {
    text-align: left;
  }

  .results-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .workbench-card,
  .summary-panel,
  .result-card,
  .guide-card {
    padding: 18px;
  }

  .field-textarea {
    min-height: 240px;
  }

  .setup-stats {
    width: 100%;
  }

  .stat-chip,
  .btn {
    width: 100%;
    justify-content: space-between;
  }

  .toolbar-actions,
  .summary-actions {
    flex-direction: column;
  }

  .field-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-inline,
  .field-actions .text-btn {
    width: 100%;
    text-align: center;
  }
}

/* 头部操作按钮区域 */
.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.head-actions button {
  height: 42px;
  padding: 0 20px;
  border-radius: 12px;
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.head-actions .btn-ghost {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid transparent;
  padding: 0 16px;
}
.head-actions .btn-ghost:hover {
  background: rgba(15, 23, 42, 0.04);
  color: var(--text-primary);
}

.head-actions .btn-secondary {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
}
.head-actions .btn-secondary:hover:not(:disabled) {
  border-color: rgba(43, 123, 184, 0.3);
  box-shadow: 0 4px 12px rgba(0,0,0,0.04);
  transform: translateY(-1px);
}
.head-actions .btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.head-actions .btn-primary {
  background: var(--primary-500);
  color: #fff;
  border: 1px solid transparent;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}
.head-actions .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
.head-actions .btn-primary:not(:disabled):hover {
  background: var(--primary-600);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
}


.summary-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 28px;
}

.summary-tags-block {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px dashed rgba(43, 123, 184, 0.15);
}

.summary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.summary-tag {
  background: var(--bg-card-muted);
  color: var(--primary-600);
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid rgba(43, 123, 184, 0.1);
}

.story-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.story-list li {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  background: var(--bg-card-muted);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}
.story-list li strong {
  font-size: 14px;
  color: var(--text-primary);
}
.story-list li span {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}


/* 分析结果弹窗 */
.result-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.result-modal-container {
  background: var(--bg-elevated);
  width: 100%;
  max-width: 1100px;
  max-height: 85vh;
  border-radius: 20px;
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color-strong);
}
.rm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.rm-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}
.rm-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rm-close:hover {
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-primary);
}
.rm-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* 弹窗动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(10px);
}

</style>

<style>
/* 暗色模式强制覆盖（非 scoped，因为 :root 选择器无法在 scoped 中生效） */
:root[data-theme="dark"] .analysis-stage .workbench-card,
:root[data-theme="dark"] .analysis-stage .summary-panel,
:root[data-theme="dark"] .analysis-stage .result-card,
:root[data-theme="dark"] .analysis-stage .guide-card {
  background: #1a2230;
  border-color: rgba(140, 165, 195, 0.16);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

:root[data-theme="dark"] .analysis-stage .guide-card.guide-card--status {
  background: #1e2a3a;
}

:root[data-theme="dark"] .analysis-stage .field-textarea {
  background: #141c28;
  border-color: rgba(140, 165, 195, 0.16);
  color: #e4eaf2;
}

:root[data-theme="dark"] .analysis-stage .field-textarea::placeholder {
  color: #5e7490;
}

:root[data-theme="dark"] .analysis-stage .stat-chip {
  background: #1e2736;
  border-color: rgba(140, 165, 195, 0.12);
}

:root[data-theme="dark"] .analysis-stage .result-modal-container {
  background: #1a2230;
  border-color: rgba(140, 165, 195, 0.16);
}

:root[data-theme="dark"] .analysis-stage .rm-header {
  background: #1e2736;
  border-color: rgba(140, 165, 195, 0.1);
}

:root[data-theme="dark"] .analysis-stage .head-actions .btn-secondary {
  background: #1e2736;
  border-color: rgba(140, 165, 195, 0.16);
  color: #e4eaf2;
}

:root[data-theme="dark"] .analysis-stage .story-list li {
  background: #1e2736;
  border-color: rgba(140, 165, 195, 0.1);
}

:root[data-theme="dark"] .analysis-stage .history-item {
  background: #1e2736;
  border-color: rgba(140, 165, 195, 0.1);
}

:root[data-theme="dark"] .analysis-stage .history-item:hover {
  background: #242e3e;
}

:root[data-theme="dark"] .analysis-stage .section-kicker,
:root[data-theme="dark"] .analysis-stage .guide-label {
  color: #6da3cc;
}

:root[data-theme="dark"] .analysis-stage .section-title,
:root[data-theme="dark"] .analysis-stage .guide-card strong {
  color: #e4eaf2;
}

:root[data-theme="dark"] .analysis-stage .section-desc,
:root[data-theme="dark"] .analysis-stage .guide-card p,
:root[data-theme="dark"] .analysis-stage .history-item span {
  color: #94a7be;
}
</style>
