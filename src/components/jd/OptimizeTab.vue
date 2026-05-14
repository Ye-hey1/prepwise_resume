<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useResumeStore } from '@/stores/resume'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { getJDOptimizationSuggestions } from '@/services/jdService'
import type { JDData, JDSuggestion } from '@/services/types/jd'
import DiffView from '@/components/common/DiffView.vue'

const props = defineProps<{
  jdData: JDData | null
  suggestions: JDSuggestion[]
  resumeText: string
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'optimize-done', items: JDSuggestion[]): void
  (e: 'loading-change', loading: boolean, label: string): void
  (e: 'error', msg: string): void
}>()

const aiConfigStore = useAiConfigStore()
const resumeStore = useResumeStore()
const jdAnalysisStore = useJdAnalysisStore()
const router = useRouter()

// ── 批量选择 + 撤销 ──

const appliedSet = ref<Set<number>>(new Set())
const selectedSet = ref<Set<number>>(new Set())

/** 撤销栈：记录每次应用的 { index, section, previousValue } */
interface UndoEntry {
  index: number
  section: string
  previousValue: string
}
const undoStack = ref<UndoEntry[]>([])

async function handleOptimize() {
  if (!props.jdData) return
  emit('loading-change', true, '正在生成优化建议...')

  try {
    const result = await getJDOptimizationSuggestions(
      aiConfigStore.getConfigForFeature('jdAnalysis'),
      props.jdData,
      props.resumeText,
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (msg) => { emit('error', msg) },
      },
      undefined,
      jdAnalysisStore.companyIntel ?? undefined
    )
    emit('optimize-done', result)
  } catch (err) {
    emit('error', err instanceof Error ? err.message : '优化建议生成失败')
  } finally {
    emit('loading-change', false, '')
  }
}

function priorityColor(p: string) {
  if (p === 'high') return 'var(--accent-red)'
  if (p === 'medium') return 'var(--primary-500)'
  return 'var(--text-muted)'
}

function priorityLabel(p: string) {
  if (p === 'high') return '必须改'
  if (p === 'medium') return '建议改'
  return '锦上添花'
}

function sectionLabel(s: string) {
  const map: Record<string, string> = {
    basicInfo: '基本信息',
    education: '教育经历',
    skills: '专业技能',
    workExperience: '工作经历',
    projectExperience: '项目经历',
    awards: '获奖经历',
    selfIntro: '自我评价',
  }
  return map[s] || s
}

const sortedSuggestions = computed(() => props.suggestions)

const summaryStats = computed(() => {
  const total = props.suggestions.length
  const high = props.suggestions.filter((item) => item.priority === 'high').length
  const applied = appliedSet.value.size

  return [
    { label: '建议总数', value: `${total} 条` },
    { label: '必须改', value: `${high} 条` },
    { label: '已应用', value: `${applied} 条` },
  ]
})

const groupedSuggestions = computed(() => {
  const groups = [
    {
      key: 'high',
      title: '必须改',
      items: props.suggestions
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.priority === 'high'),
    },
    {
      key: 'medium',
      title: '建议改',
      items: props.suggestions
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.priority === 'medium'),
    },
    {
      key: 'low',
      title: '锦上添花',
      items: props.suggestions
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.priority === 'low'),
    },
  ]

  return groups.filter((group) => group.items.length)
})

/** 是否可以批量应用 */
const canBatchApply = computed(() => {
  return Array.from(selectedSet.value).some(
    (idx) => !appliedSet.value.has(idx) && resumeStore.canApplySuggestion(props.suggestions[idx]?.section ?? ''),
  )
})

/** 可撤销 */
const canUndo = computed(() => undoStack.value.length > 0)

function buildSuggestionSignals(item: JDSuggestion) {
  const signals: string[] = []
  const gapMatches = (jdAnalysisStore.matchResult?.matches ?? []).filter((m) => m.status !== 'matched')
  const relatedGap = gapMatches.find((match) => {
    const text = `${match.requirement} ${match.suggestion} ${match.riskGaps?.join(' ') || ''}`
    return text.includes(item.section) || item.reason.includes(match.requirement)
  })

  if (relatedGap) {
    signals.push(`对应缺口：${relatedGap.requirement}`)
  }

  if (/证据|量化|结果|匹配|经历/.test(item.reason)) {
    signals.push('补足匹配证据/结果表达')
  }

  if (!signals.length) {
    signals.push('提升岗位相关性与表达完整度')
  }

  return signals.slice(0, 2)
}

/** 切换选中状态 */
function toggleSelect(sortedIndex: number) {
  if (appliedSet.value.has(sortedIndex)) return
  if (selectedSet.value.has(sortedIndex)) {
    selectedSet.value.delete(sortedIndex)
  } else {
    selectedSet.value.add(sortedIndex)
  }
}

/** 全选当前分组 */
function selectGroup(groupKey: string) {
  const group = groupedSuggestions.value.find((g) => g.key === groupKey)
  if (!group) return
  for (const entry of group.items) {
    if (!appliedSet.value.has(entry.index) && resumeStore.canApplySuggestion(entry.item.section)) {
      selectedSet.value.add(entry.index)
    }
  }
}

/** 应用单条建议 */
function applySuggestion(sortedIndex: number) {
  const s = sortedSuggestions.value[sortedIndex]
  if (!s) return

  // 记录撤销信息
  const previousValue = getSectionCurrentValue(s.section)

  const ok = resumeStore.applySuggestionToStore(s.section, s.suggestedText)
  if (!ok) {
    emit('error', `当前建议无法直接应用到「${sectionLabel(s.section)}」，请使用「去编辑」手动调整`)
    return
  }

  appliedSet.value.add(sortedIndex)
  selectedSet.value.delete(sortedIndex)
  undoStack.value.push({ index: sortedIndex, section: s.section, previousValue })

  const sectionNames: Record<string, string> = {
    skills: '专业技能',
    selfIntro: '自我评价',
    basicInfo: '基本信息',
    workExperience: '工作经历',
    projectExperience: '项目经历',
  }
  resumeStore.showImportFeedback(`已将优化建议应用到「${sectionNames[s.section] || s.section}」模块`)
}

/** 批量应用已选中的建议 */
function batchApply() {
  const indices = Array.from(selectedSet.value)
  let appliedCount = 0

  for (const idx of indices) {
    const s = sortedSuggestions.value[idx]
    if (!s || appliedSet.value.has(idx)) continue
    if (!resumeStore.canApplySuggestion(s.section)) continue

    const previousValue = getSectionCurrentValue(s.section)
    const ok = resumeStore.applySuggestionToStore(s.section, s.suggestedText)
    if (ok) {
      appliedSet.value.add(idx)
      undoStack.value.push({ index: idx, section: s.section, previousValue })
      appliedCount++
    }
  }

  selectedSet.value.clear()
  if (appliedCount > 0) {
    resumeStore.showImportFeedback(`已批量应用 ${appliedCount} 条优化建议`)
  }
}

/** 撤销最近一次应用 */
function undoLast() {
  const last = undoStack.value.pop()
  if (!last) return

  // 恢复之前的值
  resumeStore.applySuggestionToStore(last.section, last.previousValue)
  appliedSet.value.delete(last.index)
  resumeStore.showImportFeedback('已撤销最近一次优化应用')
}

/** 获取简历模块当前值（用于撤销） */
function getSectionCurrentValue(section: string): string {
  const data = resumeStore.$state
  switch (section) {
    case 'skills': return data.skills ?? ''
    case 'selfIntro': return data.selfIntro ?? ''
    case 'basicInfo': return data.basicInfo?.jobTitle ?? ''
    default: return ''
  }
}

function goToEditor(section: string) {
  const key = section === 'basicInfo' ? 'basicInfo'
    : section === 'education' ? 'education'
    : section === 'skills' ? 'skills'
    : section === 'workExperience' ? 'workExperience'
    : section === 'projectExperience' ? 'projectExperience'
    : section === 'awards' ? 'awards'
    : section === 'selfIntro' ? 'selfIntro'
    : 'skills'
  resumeStore.requestScrollToModule(key)
  router.push({ name: 'resume-editor' })
}
</script>

<template>
  <div class="optimize-tab">
    <!-- 空态 -->
    <section v-if="!suggestions.length" class="action-card">
      <h3 class="action-title">优化建议</h3>
      <p class="action-desc">AI 会结合当前 JD 与简历内容，产出适合投递的改写文本、补充点和优先级判断。</p>
      <button class="btn-primary" :disabled="isLoading || !jdData" @click="handleOptimize">
        {{ isLoading ? '生成中...' : '生成优化建议' }}
      </button>
      <p v-if="!jdData" class="action-hint">请先在「JD 输入」中解析一份 JD。</p>
    </section>

    <!-- 结果 -->
    <template v-else>
      <!-- 批量操作栏 -->
      <div v-if="canBatchApply || canUndo" class="batch-bar">
        <div class="batch-left">
          <button v-if="canBatchApply" class="btn-sm primary" @click="batchApply">
            批量应用 ({{ Array.from(selectedSet).filter(idx => !appliedSet.has(idx)).length }})
          </button>
          <button v-if="canUndo" class="btn-sm ghost" @click="undoLast">
            撤销上一次
          </button>
        </div>
        <span class="batch-hint">勾选建议后可批量应用 · 支持撤销</span>
      </div>

      <!-- 汇总 -->
      <div class="summary-bar">
        <h3 class="summary-title">建议总数 {{ suggestions.length }}</h3>
        <div class="summary-stats">
          <span v-for="item in summaryStats" :key="item.label" class="summary-chip">
            <strong>{{ item.value }}</strong> {{ item.label }}
          </span>
        </div>
      </div>

      <!-- 建议分组 -->
      <section v-for="group in groupedSuggestions" :key="group.key" class="group-section">
        <div class="group-header">
          <div class="group-title-area">
            <span class="group-priority" :style="{ color: priorityColor(group.key) }">{{ group.title }}</span>
            <span class="group-count">{{ group.items.length }} 条</span>
          </div>
          <button class="btn-sm ghost" @click="selectGroup(group.key)">全选</button>
        </div>

        <div class="suggestion-list">
          <article
            v-for="entry in group.items"
            :key="entry.index"
            class="suggestion-card"
            :class="{ applied: appliedSet.has(entry.index), selected: selectedSet.has(entry.index) }"
          >
            <div class="card-header">
              <label v-if="!appliedSet.has(entry.index) && resumeStore.canApplySuggestion(entry.item.section)" class="card-checkbox">
                <input
                  type="checkbox"
                  :checked="selectedSet.has(entry.index)"
                  @change="toggleSelect(entry.index)"
                />
              </label>
              <div class="header-main">
                <span class="card-section">{{ sectionLabel(entry.item.section) }}</span>
                <span class="card-priority" :style="{ color: priorityColor(entry.item.priority) }">
                  {{ priorityLabel(entry.item.priority) }}
                </span>
              </div>
              <span v-if="appliedSet.has(entry.index)" class="applied-tag">已应用</span>
            </div>

            <!-- 来源信号 -->
            <div class="signal-pills">
              <span v-for="signal in buildSuggestionSignals(entry.item)" :key="signal" class="signal-pill">{{ signal }}</span>
            </div>

            <!-- 原因 -->
            <p class="reason-text">{{ entry.item.reason }}</p>

            <!-- Diff 或新增 -->
            <DiffView
              v-if="entry.item.originalText"
              :original="entry.item.originalText"
              :suggested="entry.item.suggestedText"
            />
            <div v-else class="new-block">
              <span class="new-label">新增建议</span>
              <p class="new-text">{{ entry.item.suggestedText }}</p>
            </div>

            <!-- 操作 -->
            <div class="card-actions">
              <button
                v-if="resumeStore.canApplySuggestion(entry.item.section) && !appliedSet.has(entry.index)"
                class="btn-sm primary"
                @click="applySuggestion(entry.index)"
              >
                应用到简历
              </button>
              <button
                v-if="!appliedSet.has(entry.index)"
                class="btn-sm ghost"
                @click="goToEditor(entry.item.section)"
              >
                去编辑器调整
              </button>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.optimize-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

/* ── Shared ── */
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

.btn-sm.primary:hover { opacity: 0.9; }

.btn-sm.ghost {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
}

.btn-sm.ghost:hover { border-color: var(--primary-500); color: var(--primary-500); }

/* ── Action Card ── */
.action-card {
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
  background: #fafafa;
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
  line-height: 1.6;
}

.action-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
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

/* ── Batch Bar ── */
.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--primary-500) 15%, transparent);
  background: color-mix(in srgb, var(--primary-500) 4%, var(--bg-card));
}

.batch-left {
  display: flex;
  gap: 6px;
}

.batch-hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* ── Summary Bar ── */
.summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
  background: #fafafa;
}

.summary-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
}

.summary-stats {
  display: flex;
  gap: 8px;
}

.summary-chip {
  font-size: 12px;
  color: var(--text-secondary);
}

.summary-chip strong {
  color: var(--primary-600);
  font-weight: 800;
}

/* ── Group Section ── */
.group-section {
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
  background: #fafafa;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.group-title-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-priority {
  font-size: 15px;
  font-weight: 800;
}

.group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 800;
}

.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Suggestion Card ── */
.suggestion-card {
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s ease;
}

.suggestion-card.selected {
  border-color: var(--primary-500);
  background: color-mix(in srgb, var(--primary-500) 3%, var(--bg-card));
}

.suggestion-card.applied {
  opacity: 0.55;
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.card-checkbox {
  display: flex;
  align-items: center;
  padding-top: 2px;
  cursor: pointer;
  flex-shrink: 0;
}

.card-checkbox input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary-500);
  cursor: pointer;
}

.header-main {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  flex: 1;
}

.card-section {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.card-priority {
  font-size: 12px;
  font-weight: 800;
}

.applied-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
  flex-shrink: 0;
  margin-left: auto;
}

/* Signals */
.signal-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.signal-pill {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
}

/* Reason */
.reason-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
}

/* New suggestion block */
.new-block {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--accent-green) 6%, var(--bg-card));
}

.new-label {
  display: inline-block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.new-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
}

/* Actions */
.card-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .summary-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .summary-stats {
    flex-wrap: wrap;
  }

  .batch-bar {
    flex-direction: column;
    align-items: flex-start;
  }

  .group-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .card-header {
    flex-wrap: wrap;
  }

  .btn-primary {
    width: 100%;
    text-align: center;
  }
}
</style>
