<script setup lang="ts">
import { computed } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { analyzeResumeOverview } from '@/services/jdService'
import type { ResumeOverview, JdPrepInsight } from '@/services/types/jd'

const props = defineProps<{
  overview: ResumeOverview | null
  prepInsight: JdPrepInsight | null
  resumeText: string
  isLoading: boolean
  /** 面试练习次数 */
  interviewPracticeCount?: number
  /** 最近一次面试总分 */
  lastInterviewScore?: number | null
  /** 最近一次面试暴露的弱项 */
  lastWeaknesses?: string[]
  /** 最近一次面试建议优化的简历模块 */
  lastSuggestedResumeModules?: string[]
}>()

const emit = defineEmits<{
  (e: 'overview-done', data: ResumeOverview): void
  (e: 'loading-change', loading: boolean, label: string): void
  (e: 'error', msg: string): void
  (e: 'generate-interview-suggestions'): void
}>()

const aiConfigStore = useAiConfigStore()

const overviewSections = computed(() => {
  if (!props.overview) return []

  return [
    {
      key: 'highlights',
      title: '简历优势',
      tone: 'positive',
      items: props.overview.highlights,
    },
    {
      key: 'risks',
      title: '潜在风险',
      tone: 'warning',
      items: props.overview.risks,
    },
  ].filter((section) => section.items.length)
})

async function handleAnalyze() {
  emit('loading-change', true, '正在诊断简历...')

  try {
    const result = await analyzeResumeOverview(
      aiConfigStore.getConfigForFeature('jdAnalysis'),
      props.resumeText,
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (msg) => { emit('error', msg) },
      },
    )
    emit('overview-done', result)
  } catch (err) {
    emit('error', err instanceof Error ? err.message : '简历诊断失败')
  } finally {
    emit('loading-change', false, '')
  }
}

function fitColor(fit: string) {
  if (fit === 'high') return 'var(--accent-green)'
  if (fit === 'medium') return 'var(--primary-500)'
  return 'var(--text-muted)'
}

function fitLabel(fit: string) {
  if (fit === 'high') return '高度匹配'
  if (fit === 'medium') return '中度匹配'
  return '可拓展'
}

const hasInterviewData = computed(() =>
  (props.interviewPracticeCount ?? 0) > 0,
)

const scoreColor = computed(() => {
  if (props.lastInterviewScore == null) return 'var(--text-muted)'
  if (props.lastInterviewScore >= 75) return 'var(--accent-green)'
  if (props.lastInterviewScore >= 50) return 'var(--accent-yellow, #f59e0b)'
  return 'var(--accent-red)'
})
</script>

<template>
  <div class="overview-tab">
    <!-- 空态 -->
    <section v-if="!overview" class="action-card">
      <h3 class="action-title">简历诊断</h3>
      <p class="action-desc">分析简历在岗位视角下的优势、风险和更适合的投递方向。</p>
      <button class="btn-primary" :disabled="isLoading" @click="handleAnalyze">
        {{ isLoading ? '诊断中...' : '开始诊断' }}
      </button>
    </section>

    <template v-if="overview">
      <!-- 岗位摘要 -->
      <section class="headline-card">
        <span class="kicker">岗位视角</span>
        <p class="headline-text">{{ overview.headline }}</p>
      </section>

      <!-- 策略卡片 -->
      <div v-if="prepInsight" class="strategy-row">
        <div class="strategy-card">
          <span class="strategy-label">优先准备方向</span>
          <p class="strategy-text">{{ prepInsight.summary }}</p>
        </div>
        <div v-if="prepInsight.focusAreas.length" class="strategy-card">
          <span class="strategy-label">面试聚焦点</span>
          <p class="strategy-text">{{ prepInsight.focusAreas.join(' / ') }}</p>
        </div>
      </div>

      <!-- 备面优先项 -->
      <section v-if="prepInsight?.prepPriorities.length" class="section-block">
        <h4 class="section-title">面试前优先补强</h4>
        <ol class="priority-list">
          <li v-for="(item, index) in prepInsight.prepPriorities" :key="`${item}-${index}`" class="priority-item">
            <span class="priority-index">{{ index + 1 }}</span>
            <span class="priority-text">{{ item }}</span>
          </li>
        </ol>
      </section>

      <!-- 面试发现的可优化项 -->
      <section v-if="hasInterviewData" class="section-block interview-insight-block">
        <div class="interview-header">
          <h4 class="section-title">面试发现的可优化项</h4>
          <span class="interview-score-badge" :style="{ color: scoreColor, borderColor: scoreColor }">
            {{ lastInterviewScore != null ? `${lastInterviewScore}分` : '待评估' }}
          </span>
        </div>
        <p v-if="interviewPracticeCount" class="interview-meta">
          已练习 {{ interviewPracticeCount }} 次
        </p>
        <ul v-if="lastWeaknesses?.length" class="insight-list">
          <li v-for="(w, i) in lastWeaknesses" :key="`weak-${i}`">{{ w }}</li>
        </ul>
        <p v-else class="interview-empty">暂无面试弱项记录</p>
        <button
          v-if="lastWeaknesses?.length"
          class="btn-primary btn-sm"
          @click="emit('generate-interview-suggestions')"
        >
          生成针对性优化建议
        </button>
      </section>

      <!-- 优势 & 风险 -->
      <div v-if="overviewSections.length" class="insights-row">
        <article v-for="section in overviewSections" :key="section.key" class="insight-card">
          <h4 class="insight-title" :class="section.tone">{{ section.title }}</h4>
          <ul class="insight-list">
            <li v-for="(item, index) in section.items" :key="`${section.key}-${index}`">{{ item }}</li>
          </ul>
        </article>
      </div>

      <!-- 投递方向 -->
      <section v-if="overview.roleFit.length" class="section-block">
        <h4 class="section-title">更适合投递的岗位方向</h4>
        <div class="role-grid">
          <div v-for="(rf, i) in overview.roleFit" :key="i" class="role-item">
            <div class="role-header">
              <span class="role-name">{{ rf.role }}</span>
              <span class="role-badge" :style="{ color: fitColor(rf.fit), borderColor: fitColor(rf.fit) }">
                {{ fitLabel(rf.fit) }}
              </span>
            </div>
            <p class="role-reason">{{ rf.reason }}</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.overview-tab {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

/* ── Shared ── */
.kicker {
  display: inline-block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.section-block {
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.section-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
}

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
  line-height: 1.6;
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

/* ── Headline Card ── */
.headline-card {
  padding: 18px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--primary-500) 4%, var(--bg-card-muted)),
    var(--bg-card-muted)
  );
}

.headline-text {
  margin: 4px 0 0;
  font-size: 16px;
  line-height: 1.7;
  font-weight: 700;
  color: var(--text-primary);
}

/* ── Strategy Row ── */
.strategy-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.strategy-card {
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.strategy-label {
  display: inline-block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.strategy-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}

/* ── Priority List ── */
.priority-list {
  margin: 0;
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

/* ── Insights ── */
.insights-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.insight-card {
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.insight-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 800;
}

.insight-title.positive { color: var(--accent-green); }
.insight-title.warning { color: var(--accent-red); }

.insight-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.insight-list li {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.7;
}

.positive .insight-list li::marker { color: var(--accent-green); }
.warning .insight-list li::marker { color: var(--accent-red); }

/* ── Role Grid ── */

/* ── Interview Insight ── */
.interview-insight-block {
  border-color: color-mix(in srgb, var(--primary-500) 20%, var(--border-color));
}

.interview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.interview-score-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  border: 1px solid;
}

.interview-meta {
  margin: 4px 0 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.interview-empty {
  margin: 4px 0;
  font-size: 13px;
  color: var(--text-muted);
}

.btn-sm {
  align-self: flex-start;
  min-height: 34px;
  margin-top: 8px;
  padding: 0 16px;
  font-size: 12px;
}

/* ── Role Grid ── */
.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.role-item {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.role-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.role-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary);
}

.role-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid;
}

.role-reason {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .strategy-row,
  .insights-row {
    grid-template-columns: 1fr;
  }

  .role-header {
    flex-direction: column;
  }
}
</style>
