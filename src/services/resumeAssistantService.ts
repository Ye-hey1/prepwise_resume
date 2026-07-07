import { RESUME_APPLY_SYSTEM_PROMPT, buildResumeApplyUserPrompt } from './prompts/resumeApplyPrompt'
import { runJsonTask, type AiTaskIssue } from './aiTaskRuntime'
import type {
  ResumeAdviceApplyResult,
  ResumeAssistantApplyItem,
  ResumeFieldAiContext,
} from './types/resumeAssistant'

export interface ResumeAssistantConfig {
  apiUrl: string
  apiToken: string
  modelName: string
}

export interface ResumeAssistantCallbacks {
  onChunk: (text: string) => void
  onDone: (fullText: string) => void
  onError: (message: string) => void
}

const RESUME_ASSISTANT_APPLY_SCHEMA_HINT = `{
  "applyItems": [
    {
      "id": string,
      "sectionId": string,
      "original": string,
      "suggested": string,
      "reason": string,
      "category": "grammar|content|structure|formatting",
      "severity": "low|medium|high",
      "riskLevel": "low|medium|high",
      "evidenceState": "provided|inferred|needs_user_input",
      "requiresConfirmation": boolean,
      "evidenceNote": string,
      "patchType": "replace|rewrite|insert|delete"
    }
  ]
}`

function normalizeApplyItem(item: Partial<ResumeAssistantApplyItem>, index: number): ResumeAssistantApplyItem | null {
  const original = typeof item.original === 'string' ? item.original.trim() : ''
  const suggested = typeof item.suggested === 'string' ? item.suggested.trim() : ''
  const reason = typeof item.reason === 'string' ? item.reason.trim() : ''

  if (!original || !suggested || !reason) return null

  const validCategories = ['grammar', 'content', 'structure', 'formatting']
  const category = validCategories.includes(item.category || '') ? item.category : undefined

  const validSeverities = ['low', 'medium', 'high']
  const severity = validSeverities.includes(item.severity || '') ? item.severity : undefined
  const validRiskLevels = ['low', 'medium', 'high']
  const riskLevel = validRiskLevels.includes(item.riskLevel || '') ? item.riskLevel : severity
  const validEvidenceStates = ['provided', 'inferred', 'needs_user_input']
  const evidenceState = validEvidenceStates.includes(item.evidenceState || '')
    ? item.evidenceState
    : riskLevel === 'high'
      ? 'needs_user_input'
      : 'provided'
  const requiresConfirmation = Boolean(item.requiresConfirmation || evidenceState === 'needs_user_input' || riskLevel === 'high')
  const validPatchTypes = ['replace', 'rewrite', 'insert', 'delete']
  const patchType = validPatchTypes.includes(item.patchType || '') ? item.patchType : 'replace'

  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `apply-${index + 1}`,
    original,
    suggested,
    reason,
    category,
    severity,
    riskLevel,
    evidenceState,
    requiresConfirmation,
    evidenceNote: typeof item.evidenceNote === 'string' ? item.evidenceNote.trim() : '',
    patchType,
    sectionId: typeof item.sectionId === 'string' ? item.sectionId : undefined,
    applied: false,
  }
}

function normalizeApplyResult(raw: unknown): ResumeAdviceApplyResult {
  const applyItems = Array.isArray((raw as { applyItems?: unknown[] } | null)?.applyItems)
    ? (raw as { applyItems: unknown[] }).applyItems
        .map((item, index) => normalizeApplyItem(item as Partial<ResumeAssistantApplyItem>, index))
        .filter((item): item is ResumeAssistantApplyItem => Boolean(item))
    : []

  return {
    applyItems: applyItems.slice(0, 8),
  }
}

async function requestJsonResult<T>(
  config: ResumeAssistantConfig,
  systemPrompt: string,
  userMessage: string,
  callbacks: ResumeAssistantCallbacks,
  normalize: (raw: unknown) => T,
  taskName: string,
  schemaHint: string,
  validate: (value: T) => AiTaskIssue[],
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await runJsonTask({
      taskName,
      category: 'resume-optimize',
      config,
      systemPrompt,
      userMessage,
      normalize,
      validate,
      schemaHint,
      transport: 'stream',
      streamCallbacks: {
        onChunk: callbacks.onChunk,
        onDone: callbacks.onDone,
      },
      signal,
      requestOptions: { maxTokens: 2048 },
      repair: true,
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err
    }
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
    throw err
  }
}

function validateApplyResult(result: ResumeAdviceApplyResult): AiTaskIssue[] {
  return result.applyItems.length > 0
    ? []
    : [{ path: 'applyItems', message: '逐条优化未返回可应用修改项', severity: 'error' }]
}

export async function generateResumeApplySuggestions(
  config: ResumeAssistantConfig,
  context: ResumeFieldAiContext,
  callbacks: ResumeAssistantCallbacks,
  signal?: AbortSignal,
): Promise<ResumeAdviceApplyResult> {
  return requestJsonResult(
    config,
    RESUME_APPLY_SYSTEM_PROMPT,
    buildResumeApplyUserPrompt(context),
    callbacks,
    normalizeApplyResult,
    'resumeOptimize.generateApplySuggestions',
    RESUME_ASSISTANT_APPLY_SCHEMA_HINT,
    validateApplyResult,
    signal,
  )
}
