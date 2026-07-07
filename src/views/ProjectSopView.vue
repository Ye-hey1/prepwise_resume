<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ProjectSopArtifactTabs from '@/components/projectSop/ProjectSopArtifactTabs.vue'
import ProjectSopDossierForm from '@/components/projectSop/ProjectSopDossierForm.vue'
import ProjectSopList from '@/components/projectSop/ProjectSopList.vue'
import ProjectSopValidationPanel from '@/components/projectSop/ProjectSopValidationPanel.vue'
import type { ProjectSopArtifact, ProjectSopDossier, ProjectSopQuestion } from '@/services/projectSop/types'
import { generateProjectSopArtifact } from '@/services/projectSop/generator'
import { inferProjectSopDossier } from '@/services/projectSop/inference'
import { buildProjectSopResearchBrief } from '@/services/projectSop/research'
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
const showFactModal = ref(false)
const isGenerating = ref(false)
const generationStage = ref('')
const streamText = ref('')
const errorText = ref('')
const artifactSectionRef = ref<HTMLElement | null>(null)
let abortController: AbortController | null = null
let lastImportOpenAt = 0

const config = computed(() => aiConfigStore.getConfigForFeature('default'))
const searchProviders = computed(() => aiConfigStore.getEnabledSearchProviders())
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

const primaryGenerateLabel = computed(() => {
  if (isGenerating.value) return generationStage.value || '生成中...'
  if (activeDossier.value?.resumeProjectId) return activeArtifact.value ? '联网重生成' : 'AI 一键生成'
  return activeArtifact.value ? '重新生成' : '生成 SOP'
})

const factCalibrationLabel = computed(() => activeValidation.value
  ? `事实校准 ${activeValidation.value.completeness}%`
  : '事实校准')

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

function openFactModal() {
  if (!activeDossier.value) return
  showFactModal.value = true
}

async function importResumeProject(projectId: string) {
  const project = resumeStore.projectList.find(item => item.id === projectId)
  if (!project) return
  const dossier = projectSopStore.createDossierFromResumeProject(project)
  showImportDialog.value = false
  await autoGenerateFromResumeProject(project, dossier)
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

function updateActiveArtifact(patch: Partial<ProjectSopArtifact>) {
  if (!activeArtifact.value) return
  projectSopStore.saveArtifact({
    ...activeArtifact.value,
    ...patch,
  })
  toast.success('已保存正文修改')
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

function getActiveResumeProject(): ProjectEntry | null {
  const resumeProjectId = activeDossier.value?.resumeProjectId
  if (!resumeProjectId) return null
  return resumeStore.projectList.find(item => item.id === resumeProjectId) ?? null
}

function ensureAiReady(): boolean {
  if (hasAiConfig.value) return true
  toast.warning('请先配置默认 AI 模型')
  return false
}

function setGenerationStage(stage: string) {
  generationStage.value = stage
  streamText.value = stage
}

async function scrollToArtifact() {
  await nextTick()
  artifactSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function generateActiveProjectSop() {
  const project = getActiveResumeProject()
  if (project && activeDossier.value) {
    await autoGenerateFromResumeProject(project, activeDossier.value)
    return
  }

  await generateArtifactStrict()
}

async function autoGenerateFromResumeProject(project: ProjectEntry, sourceDossier: ProjectSopDossier) {
  if (!ensureAiReady()) return

  abortController?.abort()
  abortController = new AbortController()
  errorText.value = ''
  isGenerating.value = true
  generationStage.value = ''

  try {
    setGenerationStage('正在整理简历项目...')
    const resumeProjectText = formatResumeProject(project)

    setGenerationStage(searchProviders.value.length ? '正在联网检索相关资料...' : '未配置搜索渠道，先基于简历和 JD 生成...')
    const researchBrief = await buildProjectSopResearchBrief(
      searchProviders.value,
      project,
      jdContextText.value,
      abortController.signal,
    )

    setGenerationStage('正在让 AI 补全项目档案...')
    const inferredPatch = await inferProjectSopDossier(
      config.value,
      {
        baseDossier: sourceDossier,
        resumeProjectText,
        jdContextText: jdContextText.value,
        webResearchText: researchBrief.markdown,
      },
      abortController.signal,
    )

    const enrichedDossier = projectSopStore.updateDossier(sourceDossier.id, inferredPatch)
      ?? { ...sourceDossier, ...inferredPatch }
    const validation = validateProjectSopDossier(enrichedDossier)

    setGenerationStage('正在生成 SOP 与面试逐字稿...')
    const artifact = await generateProjectSopArtifact(
      config.value,
      {
        dossier: enrichedDossier,
        validation,
        resumeProjectText,
        jdContextText: jdContextText.value,
        webResearchText: researchBrief.markdown,
        generationMode: 'autoDraft',
      },
      {
        onChunk: chunk => {
          streamText.value = chunk
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
    toast.success(researchBrief.sources.length
      ? `已联网参考 ${researchBrief.sources.length} 条资料并生成 SOP`
      : '已基于简历和 JD 生成 SOP 草稿')
    await scrollToArtifact()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      errorText.value = '生成已取消'
    } else {
      errorText.value = error instanceof Error ? error.message : '生成失败，请稍后重试'
      toast.error(errorText.value)
    }
  } finally {
    isGenerating.value = false
    generationStage.value = ''
    abortController = null
  }
}

async function generateArtifactStrict() {
  const dossier = activeDossier.value
  const validation = activeValidation.value
  if (!dossier || !validation) return
  if (!ensureAiReady()) return
  if (!validation.canGenerate) {
    toast.warning('手动档案仍有阻断级缺口；从简历项目导入可直接 AI 补全生成')
    return
  }

  abortController?.abort()
  abortController = new AbortController()
  streamText.value = ''
  errorText.value = ''
  generationStage.value = '正在生成 SOP 与面试逐字稿...'
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
          streamText.value = chunk
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
    await scrollToArtifact()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      errorText.value = '生成已取消'
    } else {
      errorText.value = error instanceof Error ? error.message : '生成失败，请稍后重试'
      toast.error(errorText.value)
    }
  } finally {
    isGenerating.value = false
    generationStage.value = ''
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
  <section class="project-sop-view product-page">
    <div class="project-sop-scroll product-scroll">
      <div class="project-sop-shell product-shell">
        <header class="project-sop-header product-header">
          <div class="product-header-title">
            <h1>项目 SOP 工作台</h1>
            <p>{{ activeDossier?.name || '从简历项目导入，生成 SOP 文档、面试逐字稿和深挖问答。' }}</p>
          </div>
          <div class="topbar-actions">
            <button type="button" :disabled="!activeDossier" @click="openFactModal">
              {{ factCalibrationLabel }}
            </button>
            <button type="button" :disabled="!activeDossier || !currentAnalysisId" @click="linkCurrentJd">
              关联当前 JD
            </button>
            <button
              type="button"
              class="primary"
              :disabled="!activeDossier || !hasAiConfig || isGenerating"
              @click="generateActiveProjectSop"
            >
              {{ primaryGenerateLabel }}
            </button>
            <button v-if="isGenerating" type="button" @click="cancelGeneration">
              取消
            </button>
          </div>
        </header>

        <p v-if="errorText" class="error-note">{{ errorText }}</p>

        <div class="sop-workbench">
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
            <section v-if="showImportDialog" class="inline-import-panel">
              <header>
                <div>
                  <p>从简历项目导入</p>
                  <h2>选择项目后自动联网研究并生成 SOP</h2>
                </div>
                <button type="button" @click="showImportDialog = false">收起</button>
              </header>

              <div v-if="resumeProjects.length" class="import-list">
                <button
                  v-for="project in resumeProjects"
                  :key="project.id"
                  type="button"
                  :disabled="isGenerating"
                  @click="importResumeProject(project.id)"
                >
                  <strong>{{ project.name || '未命名项目' }}</strong>
                  <span>{{ project.role || '未填写角色' }} · AI 一键生成</span>
                </button>
              </div>
              <div v-else class="import-empty">
                <p>当前简历里还没有可导入的项目经历。</p>
                <button type="button" @click="createBlankDossier(); showImportDialog = false">
                  新建空白档案
                </button>
              </div>
            </section>

            <section
              ref="artifactSectionRef"
              class="artifact-section"
              aria-label="项目 SOP 生成资产"
            >
              <ProjectSopArtifactTabs
                :artifact="activeArtifact"
                :is-generating="isGenerating"
                :stale="isActiveArtifactStale"
                :stream-text="streamText"
                @copy-markdown="copyMarkdown"
                @download-markdown="downloadMarkdown"
                @update-artifact="updateActiveArtifact"
                @save-questions="saveQuestionsToBank"
              />
            </section>
          </main>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="showFactModal"
        class="calibration-modal-overlay"
        role="presentation"
        @click.self="showFactModal = false"
      >
        <section
          class="calibration-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-sop-calibration-title"
        >
          <header class="calibration-modal-header">
            <div>
              <p>项目事实校准</p>
              <h2 id="project-sop-calibration-title">
                {{ activeDossier?.name || '项目档案' }}
              </h2>
              <span>核对 AI 补全内容、补齐事实缺口，再回到主文档生成或重生成。</span>
            </div>
            <button type="button" class="modal-close" aria-label="关闭事实校准弹窗" @click="showFactModal = false">
              ×
            </button>
          </header>

          <div class="calibration-modal-body">
            <aside class="calibration-summary-column" aria-label="档案完整度校验">
              <ProjectSopValidationPanel :validation="activeValidation" />
              <div class="calibration-source-pill">
                {{ activeDossier?.source === 'resume_project' ? '简历导入' : '手动档案' }}
              </div>
            </aside>

            <section class="calibration-form-column" aria-label="项目事实档案编辑">
              <ProjectSopDossierForm :dossier="activeDossier" @update="updateActiveDossier" />
            </section>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.project-sop-shell {
  max-width: 1360px;
  gap: 18px;
}

.project-sop-header {
  align-items: center;
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
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 700;
  transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
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

.sop-workbench {
  display: grid;
  grid-template-columns: 304px minmax(0, 1fr);
  align-items: start;
  gap: 18px;
}

.project-sop-main,
.artifact-section {
  min-width: 0;
}

.error-note {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--danger-200, #fecaca);
  border-radius: var(--radius-sm);
  background: var(--danger-50, #fef2f2);
  color: var(--danger-700, #b91c1c);
}

.inline-import-panel {
  margin: 0 0 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: hidden;
}

.inline-import-panel header p {
  margin: 0 0 4px;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--primary-600);
}

.inline-import-panel header h2 {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--text-primary);
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
  min-height: 56px;
  text-align: left;
}

.import-list button:disabled {
  cursor: wait;
  opacity: 0.58;
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

.calibration-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal) + 260);
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgba(10, 16, 28, 0.42);
  backdrop-filter: blur(10px);
}

.calibration-modal {
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
  height: min(86vh, 920px);
  border: 1px solid var(--border-color-strong);
  border-radius: 14px;
  background: var(--bg-card);
  color: var(--text-primary);
  overflow: hidden;
}

.calibration-modal-header {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px 18px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(180deg, var(--bg-card), var(--bg-card-muted));
}

.calibration-modal-header p {
  margin: 0 0 4px;
  font-size: 0.76rem;
  font-weight: 800;
  color: var(--primary-600);
}

.calibration-modal-header h2 {
  margin: 0;
  font-size: 1.16rem;
  line-height: 1.35;
}

.calibration-modal-header span {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.modal-close {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
}

.modal-close:hover {
  border-color: var(--primary-300);
  background: var(--primary-50);
}

.calibration-modal-body {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-shell);
}

.calibration-summary-column {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 18px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-card-muted);
  overflow: auto;
}

.calibration-source-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  border: 1px solid var(--state-info-border);
  border-radius: 9px;
  background: var(--state-info-bg);
  color: var(--state-info-text);
  font-size: 0.78rem;
  font-weight: 800;
}

.calibration-form-column {
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--bg-card);
  overflow: auto;
}

.calibration-form-column :deep(.dossier-form) {
  min-height: 100%;
}

.calibration-form-column :deep(.form-section) {
  grid-template-columns: 1fr;
  gap: 14px;
  padding: 22px 28px;
  background: var(--bg-card);
}

.calibration-form-column :deep(.section-heading) {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.calibration-form-column :deep(.section-heading p) {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.3;
}

.calibration-form-column :deep(.section-heading span) {
  max-width: 46ch;
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.45;
  text-align: right;
}

.calibration-form-column :deep(.inline-heading) {
  align-items: center;
}

.calibration-form-column :deep(.inline-heading > div) {
  display: grid;
  gap: 3px;
}

.calibration-form-column :deep(.inline-heading span) {
  text-align: left;
}

.calibration-form-column :deep(.form-grid) {
  grid-template-columns: repeat(2, minmax(240px, 1fr));
  gap: 14px 16px;
}

.calibration-form-column :deep(.feedback-grid) {
  grid-column: auto;
}

.calibration-form-column :deep(.block-label),
.calibration-form-column :deep(.repeat-list) {
  width: 100%;
}

.calibration-form-column :deep(input),
.calibration-form-column :deep(select) {
  height: 44px;
}

.calibration-form-column :deep(textarea) {
  min-height: 96px;
  overflow: auto;
}

.calibration-form-column :deep(label span),
.calibration-form-column :deep(.block-label span) {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

@media (max-width: 1500px) {
  .project-sop-shell {
    max-width: 1240px;
  }
}

@media (max-width: 1120px) {
  .sop-workbench {
    grid-template-columns: 1fr;
  }

  .calibration-modal-body {
    grid-template-columns: 1fr;
  }

  .calibration-summary-column {
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
    max-height: 260px;
  }

  .calibration-form-column :deep(.section-heading) {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .calibration-form-column :deep(.section-heading span) {
    max-width: none;
    text-align: left;
  }

  .calibration-form-column :deep(.form-grid) {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .project-sop-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .topbar-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .topbar-actions button {
    flex: 1 1 150px;
  }

  .calibration-modal-overlay {
    padding: 12px;
  }

  .calibration-modal {
    height: 92vh;
  }

  .calibration-modal-header {
    padding: 16px;
  }

  .calibration-summary-column {
    padding: 14px;
  }

  .calibration-form-column :deep(.form-section) {
    padding: 18px 16px;
  }
}
</style>
