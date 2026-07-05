<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ProjectSopArtifactTabs from '@/components/projectSop/ProjectSopArtifactTabs.vue'
import ProjectSopDossierForm from '@/components/projectSop/ProjectSopDossierForm.vue'
import ProjectSopList from '@/components/projectSop/ProjectSopList.vue'
import ProjectSopValidationPanel from '@/components/projectSop/ProjectSopValidationPanel.vue'
import type { ProjectSopDossier, ProjectSopQuestion } from '@/services/projectSop/types'
import { generateProjectSopArtifact } from '@/services/projectSop/generator'
import { validateProjectSopDossier } from '@/services/projectSop/validation'
import { stripHtml } from '@/services/stream'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useProjectSopStore } from '@/stores/projectSop'
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'
import { useResumeStore, type ProjectEntry } from '@/stores/resume'
import { toast } from '@/utils/toast'

defineOptions({ name: 'ProjectSopView' })

const projectSopStore = useProjectSopStore()
const resumeStore = useResumeStore()
const jdStore = useJdAnalysisStore()
const aiConfigStore = useAiConfigStore()
const questionStore = useQuestionBankStore()

const {
  activeArtifact,
  activeDossier,
  activeDossierId,
  activeValidation,
  dossiers,
  isActiveArtifactStale,
} = storeToRefs(projectSopStore)

const showImportDialog = ref(false)
const isGenerating = ref(false)
const streamText = ref('')
const errorText = ref('')
let abortController: AbortController | null = null
let lastImportOpenAt = 0

const config = computed(() => aiConfigStore.getConfigForFeature('default'))
const hasAiConfig = computed(() => Boolean(
  config.value.apiUrl
  && config.value.modelName
  && (config.value.providerId === 'ollama' || config.value.apiToken),
))

const currentAnalysisId = computed(() => jdStore.analysisMeta?.analysisId ?? '')
const currentJdLabel = computed(() => {
  const company = jdStore.targetCompany || jdStore.jdData?.basicInfo.company
  const position = jdStore.targetPosition || jdStore.jdData?.basicInfo.jobTitle
  return [company, position].filter(Boolean).join(' / ') || '当前 JD'
})

const resumeProjects = computed(() =>
  resumeStore.projectList.filter(project =>
    project.name.trim()
    || project.role.trim()
    || stripHtml(project.introduction).trim()
    || stripHtml(project.mainWork).trim(),
  ),
)

const validationById = computed(() => Object.fromEntries(
  dossiers.value.map(dossier => [dossier.id, validateProjectSopDossier(dossier)]),
))

const jdContextText = computed(() => {
  const lines = [
    jdStore.targetCompany && `目标公司：${jdStore.targetCompany}`,
    jdStore.targetPosition && `目标岗位：${jdStore.targetPosition}`,
    jdStore.jdData?.basicInfo.jobTitle && `JD 岗位：${jdStore.jdData.basicInfo.jobTitle}`,
    jdStore.jdData?.requirements.techStack.length && `技术栈：${jdStore.jdData.requirements.techStack.join('、')}`,
    jdStore.matchResult && `匹配优势：${jdStore.matchResult.strengths.join('、')}`,
    jdStore.matchResult && `匹配缺口：${jdStore.matchResult.gaps.join('、')}`,
    jdStore.prepInsight && `备面重点：${jdStore.prepInsight.prepPriorities.join('、')}`,
  ]
  return lines.filter(Boolean).join('\n')
})

const activeResumeProjectText = computed(() => {
  const dossier = activeDossier.value
  if (!dossier?.resumeProjectId) return dossier?.notes ?? ''
  const project = resumeStore.projectList.find(item => item.id === dossier.resumeProjectId)
  return project ? formatResumeProject(project) : dossier.notes
})

function formatResumeProject(project: ProjectEntry): string {
  return [
    project.name && `项目名称：${project.name}`,
    project.role && `角色：${project.role}`,
    (project.startDate || project.endDate) && `时间：${project.startDate || ''} ~ ${project.endDate || ''}`,
    project.introduction && `项目介绍：${stripHtml(project.introduction)}`,
    project.mainWork && `主要工作：${stripHtml(project.mainWork)}`,
  ].filter(Boolean).join('\n')
}

function createBlankDossier() {
  projectSopStore.createBlankDossier()
}

function openImportDialog() {
  const now = Date.now()
  if (showImportDialog.value && now - lastImportOpenAt < 600) return
  lastImportOpenAt = now
  showImportDialog.value = true
  if (!resumeProjects.value.length) {
    toast.info('当前简历没有可导入项目，也可以新建空白档案')
  }
}

function importResumeProject(projectId: string) {
  const project = resumeStore.projectList.find(item => item.id === projectId)
  if (!project) return
  projectSopStore.createDossierFromResumeProject(project)
  showImportDialog.value = false
  toast.success('已从简历项目创建 SOP 档案')
}

function duplicateDossier(id: string) {
  projectSopStore.duplicateDossier(id)
  toast.success('已复制项目档案')
}

function deleteDossier(id: string) {
  const dossier = dossiers.value.find(item => item.id === id)
  const name = dossier?.name || '未命名项目'
  if (!window.confirm(`确定删除「${name}」的项目 SOP 档案吗？`)) return
  projectSopStore.deleteDossier(id)
  toast.success('已删除项目档案')
}

function updateActiveDossier(patch: Partial<ProjectSopDossier>) {
  if (!activeDossier.value) return
  projectSopStore.updateDossier(activeDossier.value.id, patch)
}

function linkCurrentJd() {
  if (!activeDossier.value) return
  if (!currentAnalysisId.value) {
    toast.warning('当前还没有可关联的 JD 分析记录')
    return
  }
  projectSopStore.updateDossier(activeDossier.value.id, {
    linkedJdAnalysisId: currentAnalysisId.value,
  })
  toast.success(`已关联 ${currentJdLabel.value}`)
}

async function generateArtifact() {
  const dossier = activeDossier.value
  const validation = activeValidation.value
  if (!dossier || !validation) return
  if (!hasAiConfig.value) {
    toast.warning('请先配置默认 AI 模型')
    return
  }
  if (!validation.canGenerate) {
    toast.warning('项目信息仍有阻断级缺口，请先补齐')
    return
  }

  abortController?.abort()
  abortController = new AbortController()
  streamText.value = ''
  errorText.value = ''
  isGenerating.value = true

  try {
    const artifact = await generateProjectSopArtifact(
      config.value,
      {
        dossier,
        validation,
        resumeProjectText: activeResumeProjectText.value,
        jdContextText: jdContextText.value,
      },
      {
        onChunk: chunk => {
          streamText.value += chunk
        },
        onDone: () => {
          streamText.value = ''
        },
        onError: message => {
          errorText.value = message
        },
      },
      abortController.signal,
    )
    projectSopStore.saveArtifact(artifact)
    toast.success('项目 SOP 资产已生成')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      errorText.value = '生成已取消'
    } else {
      errorText.value = error instanceof Error ? error.message : '生成失败，请稍后重试'
      toast.error(errorText.value)
    }
  } finally {
    isGenerating.value = false
    abortController = null
  }
}

function cancelGeneration() {
  abortController?.abort()
}

async function copyMarkdown(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    toast.success('已复制到剪贴板')
  } catch {
    toast.error('复制失败，请手动选择内容')
  }
}

function downloadMarkdown(filename: string, content: string) {
  const baseName = activeDossier.value?.name?.trim() || 'project-sop'
  const safeBase = baseName.replace(/[\\/:*?"<>|]/g, '-')
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeBase}-${filename}`
  link.click()
  URL.revokeObjectURL(url)
}

function projectSopQuestionToSavedQuestion(question: ProjectSopQuestion, index: number): SavedQuestion {
  const tags = ['项目SOP', activeDossier.value?.name, question.area, question.difficulty]
    .filter((tag): tag is string => Boolean(tag?.trim()))

  return {
    content: question.question.trim(),
    category: question.difficulty === 'pressure' ? '项目压力追问' : '项目深挖追问',
    tags,
    reference_answer: question.answer,
    source: '项目 SOP',
    mastery_level: 0,
    jd_analysis_id: activeDossier.value?.linkedJdAnalysisId || '',
    difficulty: question.difficulty === 'pressure' ? 4 : 3,
    focus_area: question.area,
    intent: question.interviewerIntent,
    framework: question.answerStrategy,
    source_type: activeDossier.value?.linkedJdAnalysisId ? 'jd_analysis' : 'ai_generated',
    is_grounded: true,
    resume_anchor: activeDossier.value?.name || '',
    follow_up_chain: [],
    created_at: new Date(Date.now() + index).toISOString(),
  }
}

async function saveQuestionsToBank(questions: ProjectSopQuestion[]) {
  const existing = new Set(questionStore.questions.map(item => item.content.trim()))
  const next = questions
    .map(projectSopQuestionToSavedQuestion)
    .filter(item => item.content && !existing.has(item.content))

  if (!next.length) {
    toast.info('题库中已有这些问题')
    return
  }

  const count = await questionStore.addQuestionBatch(next)
  if (count > 0) {
    toast.success(`已加入 ${count} 道项目追问`)
  } else {
    toast.error(questionStore.mutationErrorMsg || '加入题库失败')
  }
}
</script>

<template>
  <section class="project-sop-view">
    <ProjectSopList
      :active-id="activeDossierId"
      :dossiers="dossiers"
      :validation-by-id="validationById"
      @create-blank="createBlankDossier"
      @delete="deleteDossier"
      @duplicate="duplicateDossier"
      @import-resume-project="openImportDialog"
      @select="projectSopStore.setActiveDossier"
    />

    <main class="project-sop-main">
      <header class="topbar">
        <div>
          <p>项目 SOP 工作台</p>
          <h1>{{ activeDossier?.name || '把项目经历讲清楚' }}</h1>
        </div>
        <div class="topbar-actions">
          <button type="button" :disabled="!activeDossier || !currentAnalysisId" @click="linkCurrentJd">
            关联当前 JD
          </button>
          <button
            type="button"
            class="primary"
            :disabled="!activeDossier || !activeValidation?.canGenerate || !hasAiConfig || isGenerating"
            @click="generateArtifact"
          >
            {{ isGenerating ? '生成中...' : activeArtifact ? '重新生成' : '生成 SOP' }}
          </button>
          <button v-if="isGenerating" type="button" @click="cancelGeneration">
            取消
          </button>
        </div>
      </header>

      <p v-if="errorText" class="error-note">{{ errorText }}</p>

      <section v-if="showImportDialog" class="inline-import-panel">
        <header>
          <div>
            <p>从简历项目导入</p>
            <h2>选择一个项目作为档案起点</h2>
          </div>
          <button type="button" @click="showImportDialog = false">收起</button>
        </header>

        <div v-if="resumeProjects.length" class="import-list">
          <button
            v-for="project in resumeProjects"
            :key="project.id"
            type="button"
            @click="importResumeProject(project.id)"
          >
            <strong>{{ project.name || '未命名项目' }}</strong>
            <span>{{ project.role || '未填写角色' }}</span>
          </button>
        </div>
        <div v-else class="import-empty">
          <p>当前简历里还没有可导入的项目经历。</p>
          <button type="button" @click="createBlankDossier(); showImportDialog = false">
            新建空白档案
          </button>
        </div>
      </section>

      <ProjectSopValidationPanel :validation="activeValidation" />

      <div class="form-scroll">
        <ProjectSopDossierForm :dossier="activeDossier" @update="updateActiveDossier" />
      </div>
    </main>

    <div class="artifact-column">
      <ProjectSopArtifactTabs
        :artifact="activeArtifact"
        :is-generating="isGenerating"
        :stale="isActiveArtifactStale"
        :stream-text="streamText"
        @copy-markdown="copyMarkdown"
        @download-markdown="downloadMarkdown"
        @save-questions="saveQuestionsToBank"
      />
    </div>

  </section>
</template>

<style scoped>
.project-sop-view {
  display: grid;
  grid-template-columns: 280px minmax(420px, 1fr) minmax(380px, 460px);
  width: 100%;
  height: 100%;
  min-width: 0;
  background: var(--bg-shell);
  overflow: hidden;
}

.project-sop-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}

.topbar p,
.inline-import-panel header p {
  margin: 0 0 4px;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--primary-600);
}

.topbar h1,
.inline-import-panel header h2 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.topbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.topbar-actions button,
.inline-import-panel button,
.import-list button {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
}

.topbar-actions button:hover:not(:disabled),
.inline-import-panel button:hover,
.import-list button:hover {
  border-color: var(--primary-300);
  background: var(--primary-50);
}

.topbar-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.topbar-actions .primary {
  border-color: var(--primary-500);
  background: var(--primary-600);
  color: var(--text-inverse, #fff);
}

.form-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.artifact-column {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.error-note {
  margin: 12px 20px 0;
  padding: 10px 12px;
  border: 1px solid var(--danger-200, #fecaca);
  border-radius: var(--radius-sm);
  background: var(--danger-50, #fef2f2);
  color: var(--danger-700, #b91c1c);
}

.project-sop-main > :deep(.validation-panel) {
  margin: 14px 20px 0;
}

.inline-import-panel {
  margin: 14px 20px 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  overflow: hidden;
}

.inline-import-panel header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.import-list {
  display: grid;
  gap: 10px;
  padding: 16px;
  overflow: auto;
}

.import-list button {
  display: grid;
  gap: 4px;
  min-height: 54px;
  text-align: left;
}

.import-list strong {
  color: var(--text-primary);
}

.import-list span,
.import-empty {
  color: var(--text-secondary);
}

.import-empty {
  display: grid;
  place-items: center;
  gap: 12px;
  min-height: 180px;
  padding: 20px;
  text-align: center;
}

.import-empty p {
  margin: 0;
}

@media (max-width: 1180px) {
  .project-sop-view {
    grid-template-columns: 260px minmax(420px, 1fr);
    overflow: auto;
  }

  .artifact-column {
    grid-column: 1 / -1;
    min-height: 560px;
    border-top: 1px solid var(--border-color);
  }
}

@media (max-width: 820px) {
  .project-sop-view {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .project-sop-main,
  .artifact-column {
    min-height: 640px;
  }

  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
