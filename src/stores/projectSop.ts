import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ProjectEntry } from '@/stores/resume'
import type { ProjectSopArtifact, ProjectSopDossier } from '@/services/projectSop/types'
import {
  buildProjectSopDossierSignature,
  createEmptyProjectSopDossier,
  normalizeProjectSopStage,
  validateProjectSopDossier,
} from '@/services/projectSop/validation'
import { stripHtml } from '@/services/stream'

const STORAGE_KEY = 'prepwise-project-sop'
const SCHEMA_VERSION = 1

interface ProjectSopStorageData {
  schemaVersion: number
  activeDossierId: string
  dossiers: ProjectSopDossier[]
  artifacts: ProjectSopArtifact[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeDossier(raw: Partial<ProjectSopDossier>): ProjectSopDossier {
  const base = createEmptyProjectSopDossier()
  return {
    ...base,
    ...raw,
    id: raw.id || createId('project_sop'),
    source: raw.source === 'resume_project' ? 'resume_project' : 'manual',
    resumeProjectId: normalizeString(raw.resumeProjectId),
    linkedJdAnalysisId: normalizeString(raw.linkedJdAnalysisId),
    stage: normalizeProjectSopStage(raw.stage),
    actions: Array.isArray(raw.actions) ? raw.actions : base.actions,
    challenges: Array.isArray(raw.challenges) ? raw.challenges : base.challenges,
    metrics: Array.isArray(raw.metrics) ? raw.metrics : base.metrics,
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
  }
}

function normalizeArtifact(raw: Partial<ProjectSopArtifact>): ProjectSopArtifact | null {
  if (!raw.id || !raw.dossierId) return null
  return {
    id: raw.id,
    dossierId: raw.dossierId,
    sourceSignature: raw.sourceSignature || '',
    linkedJdAnalysisId: raw.linkedJdAnalysisId || '',
    generatedAt: raw.generatedAt || nowIso(),
    schemaVersion: 1,
    sopMarkdown: raw.sopMarkdown || '',
    scriptOneMinute: raw.scriptOneMinute || '',
    scriptThreeMinutes: raw.scriptThreeMinutes || '',
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    roadmap: Array.isArray(raw.roadmap) ? raw.roadmap : [],
    bonusMarkdown: raw.bonusMarkdown || '',
    missingPlaceholders: Array.isArray(raw.missingPlaceholders) ? raw.missingPlaceholders : [],
  }
}

function createEmptyStorage(): ProjectSopStorageData {
  return {
    schemaVersion: SCHEMA_VERSION,
    activeDossierId: '',
    dossiers: [],
    artifacts: [],
  }
}

function loadStorage(): ProjectSopStorageData {
  if (typeof localStorage === 'undefined') return createEmptyStorage()

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createEmptyStorage()
    const parsed = JSON.parse(raw) as Partial<ProjectSopStorageData>
    return {
      schemaVersion: SCHEMA_VERSION,
      activeDossierId: parsed.activeDossierId || '',
      dossiers: Array.isArray(parsed.dossiers) ? parsed.dossiers.map(normalizeDossier) : [],
      artifacts: Array.isArray(parsed.artifacts)
        ? parsed.artifacts.map(normalizeArtifact).filter((item): item is ProjectSopArtifact => Boolean(item))
        : [],
    }
  } catch {
    return createEmptyStorage()
  }
}

function formatProjectText(project: ProjectEntry): string {
  return [
    project.name && `项目名称：${project.name}`,
    project.role && `角色：${project.role}`,
    (project.startDate || project.endDate) && `时间：${project.startDate || ''} ~ ${project.endDate || ''}`,
    project.introduction && `项目介绍：${stripHtml(project.introduction)}`,
    project.mainWork && `主要工作：${stripHtml(project.mainWork)}`,
  ].filter(Boolean).join('\n')
}

export const useProjectSopStore = defineStore('projectSop', () => {
  const stored = loadStorage()
  const activeDossierId = ref(stored.activeDossierId)
  const dossiers = ref<ProjectSopDossier[]>(stored.dossiers)
  const artifacts = ref<ProjectSopArtifact[]>(stored.artifacts)

  const activeDossier = computed(() => dossiers.value.find(item => item.id === activeDossierId.value) ?? null)
  const activeArtifact = computed(() => activeDossier.value
    ? artifacts.value.find(item => item.dossierId === activeDossier.value?.id) ?? null
    : null)
  const activeValidation = computed(() => activeDossier.value
    ? validateProjectSopDossier(activeDossier.value)
    : null)
  const isActiveArtifactStale = computed(() => {
    if (!activeDossier.value || !activeArtifact.value) return false
    return activeArtifact.value.sourceSignature !== buildProjectSopDossierSignature(activeDossier.value)
  })

  function persist() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      activeDossierId: activeDossierId.value,
      dossiers: dossiers.value,
      artifacts: artifacts.value,
    }))
  }

  function setActiveDossier(id: string) {
    activeDossierId.value = id
  }

  function createBlankDossier(): ProjectSopDossier {
    const dossier = createEmptyProjectSopDossier()
    dossiers.value.unshift(dossier)
    activeDossierId.value = dossier.id
    return dossier
  }

  function createDossierFromResumeProject(project: ProjectEntry): ProjectSopDossier {
    const dossier = createEmptyProjectSopDossier()
    dossier.source = 'resume_project'
    dossier.resumeProjectId = project.id
    dossier.name = project.name || '未命名项目'
    dossier.role = project.role
    dossier.startDate = project.startDate
    dossier.endDate = project.endDate
    dossier.background = stripHtml(project.introduction)
    dossier.responsibilities = stripHtml(project.mainWork)
    dossier.notes = formatProjectText(project)
    dossier.updatedAt = nowIso()
    dossiers.value.unshift(dossier)
    activeDossierId.value = dossier.id
    return dossier
  }

  function updateDossier(id: string, patch: Partial<ProjectSopDossier>): ProjectSopDossier | null {
    const index = dossiers.value.findIndex(item => item.id === id)
    if (index < 0) return null
    const next = {
      ...dossiers.value[index]!,
      ...patch,
      updatedAt: nowIso(),
    }
    dossiers.value[index] = next
    return next
  }

  function duplicateDossier(id: string) {
    const source = dossiers.value.find(item => item.id === id)
    if (!source) return null
    const next = clone(source)
    next.id = createId('project_sop')
    next.name = `${source.name || '未命名项目'} 副本`
    next.createdAt = nowIso()
    next.updatedAt = nowIso()
    dossiers.value.unshift(next)
    activeDossierId.value = next.id
    return next
  }

  function deleteDossier(id: string) {
    dossiers.value = dossiers.value.filter(item => item.id !== id)
    artifacts.value = artifacts.value.filter(item => item.dossierId !== id)
    if (activeDossierId.value === id) activeDossierId.value = dossiers.value[0]?.id ?? ''
  }

  function saveArtifact(artifact: ProjectSopArtifact) {
    artifacts.value = [artifact, ...artifacts.value.filter(item => item.dossierId !== artifact.dossierId)]
  }

  watch([activeDossierId, dossiers, artifacts], persist, { deep: true })

  return {
    activeDossierId,
    dossiers,
    artifacts,
    activeDossier,
    activeArtifact,
    activeValidation,
    isActiveArtifactStale,
    setActiveDossier,
    createBlankDossier,
    createDossierFromResumeProject,
    updateDossier,
    duplicateDossier,
    deleteDossier,
    saveArtifact,
  }
})
