<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  ProjectSopArtifact,
  ProjectSopArtifactTabKey,
  ProjectSopQuestion,
  ProjectSopRoadmapItem,
} from '@/services/projectSop/types'

defineOptions({ name: 'ProjectSopArtifactTabs' })

const props = defineProps<{
  artifact: ProjectSopArtifact | null
  stale: boolean
  isGenerating: boolean
  streamText: string
}>()

const emit = defineEmits<{
  (e: 'copy-markdown', content: string): void
  (e: 'download-markdown', filename: string, content: string): void
  (e: 'save-questions', questions: ProjectSopQuestion[]): void
}>()

const activeTab = ref<ProjectSopArtifactTabKey>('sop')
const selectedQuestionIds = ref<string[]>([])

const tabs: Array<{ key: ProjectSopArtifactTabKey; label: string }> = [
  { key: 'sop', label: 'SOP 文档' },
  { key: 'script1m', label: '1 分钟稿' },
  { key: 'script3m', label: '3 分钟稿' },
  { key: 'qa', label: '深挖问答' },
  { key: 'roadmap', label: '优化路线图' },
  { key: 'bonus', label: '加分项' },
]

const selectedQuestions = computed(() => {
  const ids = new Set(selectedQuestionIds.value)
  return props.artifact?.questions.filter(question => ids.has(question.id)) ?? []
})

function buildQaMarkdown(questions: ProjectSopQuestion[]): string {
  return questions.map((question, index) => [
    `### ${index + 1}. ${question.question}`,
    `- 类型：${question.area}`,
    `- 难度：${question.difficulty === 'pressure' ? '压力面' : '常规追问'}`,
    `- 考察点：${question.interviewerIntent || '待补充'}`,
    `- 回答思路：${question.answerStrategy || '待补充'}`,
    '',
    question.answer || '[待补充：标准答案]',
  ].join('\n')).join('\n\n')
}

function buildRoadmapMarkdown(items: ProjectSopRoadmapItem[]): string {
  return items.map((item, index) => [
    `### ${index + 1}. ${item.direction}`,
    `- 周期：${item.horizon === 'short_term' ? '短期 1-3 个月' : '长期 6-12 个月'}`,
    `- 原因：${item.reason || '待补充'}`,
    `- 预期收益：${item.expectedBenefit || '待补充'}`,
    '',
    ...(item.actions.length ? item.actions.map(action => `- ${action}`) : ['- [待补充：落地动作]']),
  ].join('\n')).join('\n\n')
}

const activeMarkdown = computed(() => {
  const artifact = props.artifact
  if (!artifact) return ''
  switch (activeTab.value) {
    case 'script1m':
      return artifact.scriptOneMinute
    case 'script3m':
      return artifact.scriptThreeMinutes
    case 'qa':
      return buildQaMarkdown(artifact.questions)
    case 'roadmap':
      return buildRoadmapMarkdown(artifact.roadmap)
    case 'bonus':
      return artifact.bonusMarkdown
    case 'sop':
    default:
      return artifact.sopMarkdown
  }
})

function copyActive() {
  if (!activeMarkdown.value) return
  emit('copy-markdown', activeMarkdown.value)
}

function downloadActive() {
  if (!activeMarkdown.value) return
  const label = tabs.find(tab => tab.key === activeTab.value)?.label ?? 'project-sop'
  emit('download-markdown', `${label}.md`, activeMarkdown.value)
}

function toggleQuestion(id: string) {
  selectedQuestionIds.value = selectedQuestionIds.value.includes(id)
    ? selectedQuestionIds.value.filter(item => item !== id)
    : [...selectedQuestionIds.value, id]
}

function selectAllQuestions() {
  selectedQuestionIds.value = props.artifact?.questions.map(question => question.id) ?? []
}

function clearQuestions() {
  selectedQuestionIds.value = []
}

watch(
  () => props.artifact?.id,
  () => {
    selectedQuestionIds.value = props.artifact?.questions.map(question => question.id) ?? []
  },
  { immediate: true },
)
</script>

<template>
  <section class="artifact-tabs">
    <div class="artifact-header">
      <div>
        <p>生成资产</p>
        <span v-if="artifact">生成于 {{ new Date(artifact.generatedAt).toLocaleString('zh-CN') }}</span>
        <span v-else>完成档案后生成 SOP、逐字稿和深挖问答</span>
      </div>
      <div class="artifact-actions">
        <button type="button" :disabled="!artifact" @click="copyActive">复制</button>
        <button type="button" :disabled="!artifact" @click="downloadActive">下载 Markdown</button>
      </div>
    </div>

    <p v-if="stale" class="stale-note">
      档案已更新，当前生成结果可能不是最新版本。
    </p>

    <div v-if="isGenerating" class="stream-panel">
      <strong>生成中</strong>
      <pre>{{ streamText || '正在请求 AI 生成项目 SOP 资产...' }}</pre>
    </div>

    <template v-if="artifact">
      <div class="tab-list" role="tablist" aria-label="项目 SOP 生成资产">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="artifact.missingPlaceholders.length" class="placeholder-note">
        <strong>仍需补充</strong>
        <span>{{ artifact.missingPlaceholders.join('、') }}</span>
      </div>

      <div v-if="activeTab === 'qa'" class="qa-panel">
        <div class="qa-toolbar">
          <span>已选 {{ selectedQuestions.length }} / {{ artifact.questions.length }}</span>
          <div>
            <button type="button" @click="selectAllQuestions">全选</button>
            <button type="button" @click="clearQuestions">清空</button>
            <button type="button" :disabled="!selectedQuestions.length" @click="emit('save-questions', selectedQuestions)">
              加入题库
            </button>
          </div>
        </div>
        <article v-for="question in artifact.questions" :key="question.id" class="question-card">
          <label class="question-check">
            <input
              type="checkbox"
              :checked="selectedQuestionIds.includes(question.id)"
              @change="toggleQuestion(question.id)"
            />
            <strong>{{ question.question }}</strong>
          </label>
          <p>{{ question.interviewerIntent }}</p>
          <div class="answer-block">
            <span>回答思路：{{ question.answerStrategy || '待补充' }}</span>
            <pre>{{ question.answer || '[待补充：标准答案]' }}</pre>
          </div>
        </article>
      </div>

      <div v-else-if="activeTab === 'roadmap'" class="roadmap-panel">
        <article v-for="item in artifact.roadmap" :key="item.id" class="roadmap-card">
          <span>{{ item.horizon === 'short_term' ? '短期 1-3 个月' : '长期 6-12 个月' }}</span>
          <h3>{{ item.direction }}</h3>
          <p>{{ item.reason }}</p>
          <ul>
            <li v-for="action in item.actions" :key="action">{{ action }}</li>
          </ul>
          <strong>{{ item.expectedBenefit }}</strong>
        </article>
      </div>

      <pre v-else class="markdown-output">{{ activeMarkdown }}</pre>
    </template>

    <div v-else-if="!isGenerating" class="empty-artifact">
      <h3>还没有生成内容</h3>
      <p>档案通过阻断级校验后，可以生成完整项目 SOP 资产。</p>
    </div>
  </section>
</template>

<style scoped>
.artifact-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 16px;
  border-left: 1px solid var(--border-color);
  background: var(--bg-card);
}

.artifact-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.artifact-header p {
  margin: 0 0 4px;
  font-weight: 700;
  color: var(--text-primary);
}

.artifact-header span,
.qa-toolbar span {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.artifact-actions,
.qa-toolbar div {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

button {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
}

button:hover:not(:disabled),
.tab-list button.active {
  border-color: var(--primary-300);
  background: var(--primary-50);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.stale-note,
.placeholder-note,
.stream-panel {
  margin: 0 0 12px;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--warning-50, #fffbeb);
  color: var(--text-primary);
}

.placeholder-note {
  display: grid;
  gap: 4px;
  background: var(--primary-50);
}

.placeholder-note span {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.stream-panel {
  display: grid;
  gap: 8px;
  max-height: 180px;
  overflow: auto;
}

.stream-panel pre,
.markdown-output,
.answer-block pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.65;
}

.tab-list {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  overflow-x: auto;
}

.tab-list button {
  flex: 0 0 auto;
}

.markdown-output {
  flex: 1;
  min-height: 0;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  overflow: auto;
  color: var(--text-primary);
}

.qa-panel,
.roadmap-panel {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow: auto;
}

.qa-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.question-card,
.roadmap-card {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
}

.question-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.question-check input {
  margin-top: 3px;
}

.question-check strong,
.roadmap-card h3 {
  color: var(--text-primary);
}

.question-card p,
.roadmap-card p,
.roadmap-card li {
  color: var(--text-secondary);
}

.answer-block {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.answer-block span,
.roadmap-card span {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.roadmap-card h3 {
  margin: 4px 0 8px;
  font-size: 0.95rem;
}

.roadmap-card ul {
  margin: 8px 0;
  padding-left: 18px;
}

.roadmap-card strong {
  display: block;
  margin-top: 8px;
  color: var(--primary-600);
}

.empty-artifact {
  display: grid;
  place-content: center;
  gap: 8px;
  flex: 1;
  text-align: center;
  color: var(--text-secondary);
}

.empty-artifact h3,
.empty-artifact p {
  margin: 0;
}

.empty-artifact h3 {
  color: var(--text-primary);
}
</style>
