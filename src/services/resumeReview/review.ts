import type { AiConfig } from '@/services/stream'
import { cleanJsonResponse, nonStreamAIRequest } from '@/services/stream'
import { buildResumeReviewPrompt, RESUME_REVIEW_SYSTEM_PROMPT } from './prompt'
import { JD_FIT_RUBRIC, getRoleRubric, type RubricItem } from './rubrics'
import type {
  ResumeReviewInput,
  ResumeReviewModuleKey,
  ResumeReviewResult,
  ReviewCategory,
  ReviewPriority,
  ReviewTask,
  ReviewVerdict,
} from './types'

const REVIEW_PARSE_ERROR = 'AI 返回的简历审查数据格式异常，请重试。'

const MODULE_KEYS: ResumeReviewModuleKey[] = [
  'basicInfo',
  'education',
  'skills',
  'workExperience',
  'projectExperience',
  'awards',
  'selfIntro',
]

const MODULE_KEY_ALIASES: Record<string, ResumeReviewModuleKey> = {
  basic: 'basicInfo',
  basic_info: 'basicInfo',
  basicinfo: 'basicInfo',
  profile: 'basicInfo',
  personal: 'basicInfo',
  personalinfo: 'basicInfo',
  personal_info: 'basicInfo',
  education: 'education',
  edu: 'education',
  skills: 'skills',
  skill: 'skills',
  work: 'workExperience',
  workexperience: 'workExperience',
  work_experience: 'workExperience',
  experience: 'workExperience',
  employment: 'workExperience',
  project: 'projectExperience',
  projects: 'projectExperience',
  projectexperience: 'projectExperience',
  project_experience: 'projectExperience',
  awards: 'awards',
  award: 'awards',
  honors: 'awards',
  selfintro: 'selfIntro',
  self_intro: 'selfIntro',
  summary: 'selfIntro',
  introduction: 'selfIntro',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function toBoolean(value: unknown): boolean {
  return value === true
}

export function clampScore(value: unknown, max = 100): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(Math.max(Math.round(numeric), 0), max)
}

function normalizeModuleKey(value: unknown): ResumeReviewModuleKey {
  if (typeof value !== 'string') return 'selfIntro'
  if ((MODULE_KEYS as string[]).includes(value)) return value as ResumeReviewModuleKey

  const normalized = value.replace(/[\s-]/g, '_').toLowerCase()
  return MODULE_KEY_ALIASES[normalized] ?? 'selfIntro'
}

function normalizePriority(value: unknown): ReviewPriority {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

function normalizeCategory(raw: unknown, rubric: RubricItem): ReviewCategory {
  const item = isRecord(raw) ? raw : {}
  const max = rubric.max

  return {
    key: rubric.key,
    label: toText(item.label, rubric.label),
    score: clampScore(item.score, max),
    max,
    evidence: toText(item.evidence),
    deductions: toText(item.deductions),
    actionableAdvice: toText(item.actionableAdvice),
    relatedModuleKey: normalizeModuleKey(item.relatedModuleKey),
    missingHardRequirement: toBoolean(item.missingHardRequirement),
  }
}

function normalizeCategories(raw: unknown, rubric: RubricItem[]): ReviewCategory[] {
  const source = Array.isArray(raw) ? raw : []

  return rubric.map((rubricItem) => {
    const match = source.find((item) => isRecord(item) && item.key === rubricItem.key)
    return normalizeCategory(match, rubricItem)
  })
}

function rollupCategories(categories: ReviewCategory[]): number {
  const maxTotal = categories.reduce((sum, category) => sum + category.max, 0)
  if (maxTotal <= 0) return 0

  const scoreTotal = categories.reduce((sum, category) => sum + clampScore(category.score, category.max), 0)
  return clampScore((scoreTotal / maxTotal) * 100)
}

function hasHighPriorityMissingHardRequirement(tasks: ReviewTask[]): boolean {
  return tasks.some((task) => task.priority === 'high' && task.missingHardRequirement)
}

function deriveVerdict(overallScore: number, tasks: ReviewTask[]): ReviewVerdict {
  if (overallScore < 60 || hasHighPriorityMissingHardRequirement(tasks)) return 'high_risk'
  if (overallScore >= 80) return 'ready'
  return 'needs_work'
}

function normalizeTask(raw: unknown, index: number): ReviewTask | null {
  if (!isRecord(raw)) return null

  const title = toText(raw.title)
  const reason = toText(raw.reason)
  const suggestion = toText(raw.suggestion)
  if (!title && !reason && !suggestion) return null

  return {
    id: toText(raw.id, `task-${index + 1}`),
    priority: normalizePriority(raw.priority),
    title,
    reason,
    suggestion,
    relatedModuleKey: normalizeModuleKey(raw.relatedModuleKey),
    sourceCategoryKey: toText(raw.sourceCategoryKey, 'general'),
    missingHardRequirement: toBoolean(raw.missingHardRequirement),
  }
}

function normalizeTasks(raw: unknown): ReviewTask[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item, index) => normalizeTask(item, index))
    .filter((item): item is ReviewTask => Boolean(item))
    .slice(0, 8)
    .map((task, index) => ({
      ...task,
      id: task.id || `task-${index + 1}`,
    }))
}

function normalizeGeneratedAt(value: unknown): string {
  if (typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return new Date().toISOString()
}

export function normalizeReviewResult(raw: unknown, input: ResumeReviewInput): ResumeReviewResult {
  if (!isRecord(raw)) throw new Error(REVIEW_PARSE_ERROR)

  const generalCategories = normalizeCategories(raw.generalCategories, getRoleRubric(input.roleFamily))
  const jdFitCategories = input.jdContextState === 'completed'
    ? normalizeCategories(raw.jdFitCategories, JD_FIT_RUBRIC)
    : []
  const tasks = normalizeTasks(raw.tasks)
  const generalScore = rollupCategories(generalCategories)
  const jdFitScore = input.jdContextState === 'completed'
    ? rollupCategories(jdFitCategories)
    : null
  const overallScore = jdFitScore === null
    ? generalScore
    : clampScore(generalScore * 0.7 + jdFitScore * 0.3)

  return {
    id: toText(raw.id, `resume-review-${Date.now()}`),
    generatedAt: normalizeGeneratedAt(raw.generatedAt),
    targetRole: input.targetRole,
    roleFamily: input.roleFamily,
    jdContextState: input.jdContextState,
    overallScore,
    generalScore,
    jdFitScore,
    verdict: deriveVerdict(overallScore, tasks),
    summary: toText(raw.summary, '简历审查已完成，请根据下方任务优先补强影响筛选结果的内容。'),
    generalCategories,
    jdFitCategories,
    tasks,
    fairnessNotes: toText(
      raw.fairnessNotes,
      '本次审查未基于姓名、性别、年龄、学校名气、GPA/成绩、城市/地区进行评分。',
    ),
  }
}

export async function reviewResume(
  config: AiConfig,
  input: ResumeReviewInput,
  signal?: AbortSignal,
): Promise<ResumeReviewResult> {
  const rawText = await nonStreamAIRequest(
    config,
    RESUME_REVIEW_SYSTEM_PROMPT,
    buildResumeReviewPrompt(input),
    { temperature: 0.2, maxTokens: 6000 },
    signal,
  )

  try {
    return normalizeReviewResult(JSON.parse(cleanJsonResponse(rawText)), input)
  } catch {
    throw new Error(REVIEW_PARSE_ERROR)
  }
}
