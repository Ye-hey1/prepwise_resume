<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import type {
  ProjectSopArtifact,
  ProjectSopArtifactTabKey,
  ProjectSopQuestion,
  ProjectSopRoadmapItem,
} from '@/services/projectSop/types'
import { sanitizeMarkdownForRender } from '@/services/aiOptimizeFormatter'
import { sanitizeMarkdownHtml } from '@/utils/sanitize'

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
  (e: 'update-artifact', patch: Partial<ProjectSopArtifact>): void
  (e: 'save-questions', questions: ProjectSopQuestion[]): void
}>()

const activeTab = ref<ProjectSopArtifactTabKey>('sop')
const selectedQuestionIds = ref<string[]>([])
const isEditing = ref(false)
const markdownDraft = ref('')

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

const tabs: Array<{ key: ProjectSopArtifactTabKey; label: string; eyebrow: string }> = [
  { key: 'sop', label: 'SOP 文档', eyebrow: '流程沉淀' },
  { key: 'script1m', label: '1 分钟稿', eyebrow: '自我介绍' },
  { key: 'script3m', label: '3 分钟稿', eyebrow: '项目主讲' },
  { key: 'qa', label: '深挖问答', eyebrow: '面试防御' },
  { key: 'roadmap', label: '优化路线图', eyebrow: '复盘规划' },
  { key: 'bonus', label: '加分项', eyebrow: '亮点补充' },
]

const editableTabs = new Set<ProjectSopArtifactTabKey>(['sop', 'script1m', 'script3m', 'bonus'])

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

const activeTabMeta = computed(() => tabs.find(tab => tab.key === activeTab.value) ?? tabs[0]!)
const canEditActiveMarkdown = computed(() => Boolean(props.artifact) && editableTabs.has(activeTab.value))
const actionMarkdown = computed(() => (isEditing.value ? markdownDraft.value : activeMarkdown.value))
const renderedActiveHtml = computed(() => {
  const normalized = sanitizeMarkdownForRender(activeMarkdown.value || '')
  return sanitizeMarkdownHtml(markdown.render(normalized))
})
const renderedDraftHtml = computed(() => {
  const normalized = sanitizeMarkdownForRender(markdownDraft.value || '')
  return sanitizeMarkdownHtml(markdown.render(normalized))
})

const artifactStats = computed(() => {
  const artifact = props.artifact
  if (!artifact) return [
    { label: '文档', value: '0' },
    { label: '逐字稿', value: '0' },
    { label: '追问', value: '0' },
  ]
  return [
    { label: '文档', value: artifact.sopMarkdown ? '1' : '0' },
    { label: '逐字稿', value: [artifact.scriptOneMinute, artifact.scriptThreeMinutes].filter(Boolean).length.toString() },
    { label: '追问', value: artifact.questions.length.toString() },
  ]
})

function copyActive() {
  if (!actionMarkdown.value) return
  emit('copy-markdown', actionMarkdown.value)
}

function downloadActive() {
  if (!actionMarkdown.value) return
  const label = tabs.find(tab => tab.key === activeTab.value)?.label ?? 'project-sop'
  emit('download-markdown', `${label}.md`, actionMarkdown.value)
}

function startEditing() {
  if (!canEditActiveMarkdown.value) return
  markdownDraft.value = activeMarkdown.value
  isEditing.value = true
}

function cancelEditing() {
  markdownDraft.value = activeMarkdown.value
  isEditing.value = false
}

function saveEditing() {
  if (!props.artifact || !canEditActiveMarkdown.value) return
  const value = markdownDraft.value
  switch (activeTab.value) {
    case 'script1m':
      emit('update-artifact', { scriptOneMinute: value })
      break
    case 'script3m':
      emit('update-artifact', { scriptThreeMinutes: value })
      break
    case 'bonus':
      emit('update-artifact', { bonusMarkdown: value })
      break
    case 'sop':
    default:
      emit('update-artifact', { sopMarkdown: value })
      break
  }
  isEditing.value = false
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

watch(
  () => [props.artifact?.id, activeTab.value] as const,
  () => {
    markdownDraft.value = activeMarkdown.value
    isEditing.value = false
  },
  { immediate: true },
)
</script>

<template>
  <section class="artifact-tabs">
    <div class="artifact-header">
      <div class="artifact-title-block">
        <p>AI SOP Studio</p>
        <h2>{{ artifact ? activeTabMeta.label : '等待生成项目 SOP' }}</h2>
        <span v-if="artifact">生成于 {{ new Date(artifact.generatedAt).toLocaleString('zh-CN') }}</span>
        <span v-else>从简历项目导入后，会自动整理为可宣讲、可追问、可复盘的项目材料。</span>
      </div>
      <div class="artifact-actions">
        <template v-if="isEditing">
          <button type="button" @click="cancelEditing">取消</button>
          <button type="button" class="primary-action" @click="saveEditing">保存修改</button>
        </template>
        <button v-else type="button" :disabled="!canEditActiveMarkdown" @click="startEditing">编辑正文</button>
        <button type="button" :disabled="!artifact" @click="copyActive">复制</button>
        <button type="button" :disabled="!artifact" @click="downloadActive">下载 Markdown</button>
      </div>
    </div>

    <div v-if="artifact" class="artifact-overview">
      <div v-for="item in artifactStats" :key="item.label">
        <strong>{{ item.value }}</strong>
        <span>{{ item.label }}</span>
      </div>
      <p v-if="stale">档案已更新，建议联网重生成。</p>
      <p v-else>当前结果可直接复制、下载或继续微调。</p>
    </div>

    <div v-if="isGenerating" class="stream-panel">
      <div class="stream-spinner" aria-hidden="true"></div>
      <div>
        <strong>正在生成</strong>
        <p>{{ streamText || '正在请求 AI 生成项目 SOP 资产...' }}</p>
      </div>
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
          <span>{{ tab.eyebrow }}</span>
          <strong>{{ tab.label }}</strong>
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
            <div class="answer-text" v-html="sanitizeMarkdownHtml(markdown.render(sanitizeMarkdownForRender(question.answer || '[待补充：标准答案]')))"></div>
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

      <div v-else-if="isEditing && canEditActiveMarkdown" class="document-editor">
        <header>
          <span>{{ activeTabMeta.eyebrow }}</span>
          <h3>{{ activeTabMeta.label }} · 编辑中</h3>
        </header>
        <div class="editor-grid">
          <label class="markdown-editor-pane">
            <span>Markdown 原文</span>
            <textarea
              v-model="markdownDraft"
              spellcheck="false"
              aria-label="编辑项目 SOP Markdown 正文"
            ></textarea>
          </label>

          <article class="document-output preview-output">
            <header>
              <span>实时预览</span>
              <h3>{{ activeTabMeta.label }}</h3>
            </header>
            <div class="markdown-body" v-html="renderedDraftHtml"></div>
          </article>
        </div>
      </div>

      <article v-else class="document-output">
        <header>
          <span>{{ activeTabMeta.eyebrow }}</span>
          <h3>{{ activeTabMeta.label }}</h3>
        </header>
        <div class="markdown-body" v-html="renderedActiveHtml"></div>
      </article>
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
  min-height: 520px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: hidden;
}

.artifact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}

.artifact-title-block {
  min-width: 0;
}

.artifact-title-block p {
  margin: 0 0 4px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--primary-600);
}

.artifact-title-block h2 {
  margin: 0;
  font-size: var(--text-lg);
  line-height: 1.35;
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
  justify-content: flex-end;
}

button {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 700;
}

button:hover:not(:disabled),
.tab-list button.active {
  border-color: var(--primary-300);
  background: var(--primary-50);
}

.primary-action {
  border-color: var(--primary-600);
  background: var(--primary-600);
  color: var(--text-inverse, #fff);
}

.primary-action:hover:not(:disabled) {
  border-color: var(--primary-700);
  background: var(--primary-700);
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

.artifact-overview {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.artifact-overview div {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.artifact-overview strong {
  font-size: 1rem;
  color: var(--text-primary);
}

.artifact-overview span,
.artifact-overview p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.artifact-overview p {
  margin-left: auto;
  line-height: 1.6;
}

.placeholder-note {
  display: grid;
  gap: 4px;
  margin: 0 20px 14px;
  padding: 12px 14px;
  background: var(--state-warning-bg);
  border: 1px solid var(--state-warning-border);
}

.placeholder-note span {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.stream-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 20px;
  max-height: none;
  overflow: auto;
  border: 1px solid var(--state-info-border);
  background: var(--state-info-bg);
}

.stream-panel p,
.answer-text :deep(p) {
  margin: 0;
}

.stream-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-accent);
  border-top-color: var(--primary-600);
  border-radius: 999px;
  animation: project-sop-spin 0.9s linear infinite;
  flex: 0 0 auto;
}

@keyframes project-sop-spin {
  to { transform: rotate(360deg); }
}

.tab-list {
  display: flex;
  gap: 4px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  overflow-x: auto;
}

.tab-list button {
  display: grid;
  gap: 2px;
  justify-items: start;
  flex: 1 0 128px;
  min-width: 0;
  min-height: 50px;
  padding: 8px 10px;
  border-color: transparent;
  background: transparent;
  text-align: left;
}

.tab-list button span {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-weight: 700;
}

.tab-list button strong {
  font-size: 0.9rem;
  color: var(--text-primary);
}

.document-output {
  flex: 1;
  min-height: 480px;
  margin: 0 20px 20px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-elevated);
  overflow: auto;
  color: var(--text-primary);
}

.document-editor {
  margin: 0 20px 20px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-elevated);
  overflow: hidden;
}

.document-editor > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.document-editor > header span {
  color: var(--primary-600);
  font-size: 0.76rem;
  font-weight: 800;
}

.document-editor > header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1rem;
}

.editor-grid {
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.1fr);
  min-height: 560px;
}

.markdown-editor-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  min-height: 0;
  padding: 18px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-card);
}

.markdown-editor-pane span {
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 800;
}

.markdown-editor-pane textarea {
  width: 100%;
  min-height: 0;
  height: 100%;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  font: 0.92rem/1.75 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  resize: none;
}

.markdown-editor-pane textarea:focus {
  outline: 2px solid var(--primary-200);
  border-color: var(--primary-400);
}

.preview-output {
  min-height: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
}

.document-output > header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-elevated);
}

.document-output > header span {
  color: var(--primary-600);
  font-size: 0.76rem;
  font-weight: 800;
}

.document-output > header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1rem;
}

.markdown-body {
  max-width: 76ch;
  margin: 0 auto;
  padding: 28px 34px 40px;
  color: var(--text-primary);
  line-height: 1.85;
  font-size: 0.98rem;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: var(--text-primary);
  line-height: 1.35;
  letter-spacing: 0;
}

.markdown-body :deep(h1) {
  margin: 0 0 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 1.38rem;
}

.markdown-body :deep(h2) {
  margin: 28px 0 12px;
  font-size: 1.12rem;
}

.markdown-body :deep(h3) {
  margin: 22px 0 10px;
  font-size: 1rem;
}

.markdown-body :deep(p) {
  margin: 0 0 12px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  display: grid;
  gap: 8px;
  margin: 0 0 16px;
  padding-left: 1.3em;
}

.markdown-body :deep(li) {
  padding-left: 2px;
}

.markdown-body :deep(strong) {
  color: var(--primary-700);
  font-weight: 800;
}

.markdown-body :deep(blockquote) {
  margin: 18px 0;
  padding: 12px 14px;
  border: 1px solid var(--state-info-border);
  border-radius: 8px;
  background: var(--primary-50);
  color: var(--text-secondary);
}

.markdown-body :deep(code) {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--bg-card-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}

.qa-panel,
.roadmap-panel {
  display: grid;
  gap: 12px;
  max-height: 720px;
  overflow: auto;
  padding: 0 20px 20px;
}

.qa-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.question-card,
.roadmap-card {
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
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

.answer-text {
  color: var(--text-primary);
  line-height: 1.75;
  font-size: 0.92rem;
}

.answer-text :deep(ul),
.answer-text :deep(ol) {
  margin: 6px 0 0;
  padding-left: 18px;
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
  width: min(320px, 100%);
  margin: 0 auto;
  padding: 24px 16px;
  text-align: center;
  color: var(--text-secondary);
}

.empty-artifact h3,
.empty-artifact p {
  margin: 0;
  line-height: 1.6;
}

.empty-artifact h3 {
  color: var(--text-primary);
}

@media (max-width: 1280px) {
  .artifact-overview {
    align-items: flex-start;
  }

  .artifact-overview p {
    flex-basis: 100%;
    margin-left: 0;
  }
}

@media (max-width: 760px) {
  .artifact-header,
  .qa-toolbar {
    flex-direction: column;
  }

  .tab-list {
    flex-direction: column;
  }

  .markdown-body {
    padding: 18px;
  }

  .editor-grid {
    grid-template-columns: 1fr;
  }

  .markdown-editor-pane {
    min-height: 360px;
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }
}
</style>
