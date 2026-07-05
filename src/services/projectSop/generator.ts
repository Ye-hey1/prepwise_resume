import type { AiConfig, StreamCallbacks } from '@/services/stream'
import { cleanJsonResponse, safeJsonStringify, streamAIRequest } from '@/services/stream'
import { buildProjectSopDossierSignature } from './validation'
import type {
  ProjectSopArtifact,
  ProjectSopGenerationInput,
  ProjectSopQuestion,
  ProjectSopRoadmapItem,
} from './types'
import { PROJECT_SOP_SYSTEM_PROMPT, PROJECT_SOP_USER_TEMPLATE } from './prompt'

interface RawProjectSopResponse {
  sopMarkdown?: string
  scriptOneMinute?: string
  scriptThreeMinutes?: string
  questions?: Array<Partial<ProjectSopQuestion>>
  roadmap?: Array<Partial<ProjectSopRoadmapItem>>
  bonusMarkdown?: string
  missingPlaceholders?: string[]
}

function id(prefix: string, index = 0): string {
  return `${prefix}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`
}

function normalizeQuestions(items: RawProjectSopResponse['questions']): ProjectSopQuestion[] {
  return (items ?? []).map((item, index) => ({
    id: item.id || id('project_sop_question', index),
    question: item.question || '',
    area: item.area || 'execution',
    difficulty: item.difficulty || 'normal',
    interviewerIntent: item.interviewerIntent || '',
    answerStrategy: item.answerStrategy || '',
    answer: item.answer || '',
  })).filter(item => item.question.trim())
}

function normalizeRoadmap(items: RawProjectSopResponse['roadmap']): ProjectSopRoadmapItem[] {
  return (items ?? []).map((item, index) => ({
    id: item.id || id('project_sop_roadmap', index),
    horizon: item.horizon || 'short_term',
    direction: item.direction || '',
    reason: item.reason || '',
    actions: Array.isArray(item.actions) ? item.actions : [],
    expectedBenefit: item.expectedBenefit || '',
  })).filter(item => item.direction.trim())
}

function buildUserPrompt(input: ProjectSopGenerationInput): string {
  return PROJECT_SOP_USER_TEMPLATE
    .replace('{dossier}', safeJsonStringify(input.dossier))
    .replace('{validation}', safeJsonStringify(input.validation))
    .replace('{resumeProjectText}', input.resumeProjectText || '无')
    .replace('{jdContextText}', input.jdContextText || '无')
}

export async function generateProjectSopArtifact(
  config: AiConfig,
  input: ProjectSopGenerationInput,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<ProjectSopArtifact> {
  if (!input.validation.canGenerate) {
    throw new Error('项目信息仍有阻断级缺口，请先补全后再生成。')
  }

  const fullText = await streamAIRequest(
    config,
    PROJECT_SOP_SYSTEM_PROMPT,
    buildUserPrompt(input),
    { onChunk: callbacks.onChunk },
    signal,
    { timeoutMs: 180_000, maxRetries: 1 },
  )

  let raw: RawProjectSopResponse
  try {
    raw = JSON.parse(cleanJsonResponse(fullText)) as RawProjectSopResponse
  } catch (error) {
    callbacks.onError('AI 返回内容不是合法 JSON，请重试。')
    throw error
  }

  const artifact: ProjectSopArtifact = {
    id: id('project_sop_artifact'),
    dossierId: input.dossier.id,
    sourceSignature: buildProjectSopDossierSignature(input.dossier),
    linkedJdAnalysisId: input.dossier.linkedJdAnalysisId,
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sopMarkdown: raw.sopMarkdown || '',
    scriptOneMinute: raw.scriptOneMinute || '',
    scriptThreeMinutes: raw.scriptThreeMinutes || '',
    questions: normalizeQuestions(raw.questions),
    roadmap: normalizeRoadmap(raw.roadmap),
    bonusMarkdown: raw.bonusMarkdown || '',
    missingPlaceholders: Array.isArray(raw.missingPlaceholders) ? raw.missingPlaceholders : [],
  }

  callbacks.onDone(fullText)
  return artifact
}
