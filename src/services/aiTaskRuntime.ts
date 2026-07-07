import {
  cleanJsonResponse,
  nonStreamAIRequest,
  streamAIRequest,
  type AiConfig,
  type StreamOptions,
} from './stream'
import type { PromptCategory } from './prompts/registry'

export type AiTaskTransport = 'stream' | 'non-stream'
export type AiTaskIssueSeverity = 'warning' | 'error'

export interface AiTaskIssue {
  path: string
  message: string
  severity?: AiTaskIssueSeverity
}

export interface AiJsonTaskOptions<T> {
  taskName: string
  category: PromptCategory
  config: AiConfig
  systemPrompt: string
  userMessage: string
  normalize: (raw: unknown) => T
  validate?: (value: T) => AiTaskIssue[]
  schemaHint?: string
  transport?: AiTaskTransport
  streamCallbacks?: {
    onChunk?: (text: string) => void
    onDone?: (fullText: string) => void
  }
  signal?: AbortSignal
  streamOptions?: StreamOptions
  requestOptions?: {
    temperature?: number
    maxTokens?: number
  }
  repair?: boolean | {
    maxAttempts?: number
  }
}

class AiTaskValidationError extends Error {
  issues: AiTaskIssue[]

  constructor(issues: AiTaskIssue[]) {
    super(formatIssueMessages(issues).join('；') || 'AI 输出未通过结构校验')
    this.name = 'AiTaskValidationError'
    this.issues = issues
  }
}

function formatIssueMessages(issues: AiTaskIssue[]): string[] {
  return issues
    .map(issue => `${issue.path || '$'}: ${issue.message}`)
    .filter(Boolean)
}

function getBlockingIssues(issues: AiTaskIssue[]): AiTaskIssue[] {
  return issues.filter(issue => (issue.severity ?? 'error') === 'error')
}

function truncateForRepair(text: string, maxLength = 12_000): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n\n[已截断，原始长度 ${text.length} 字符]`
}

function normalizeUnknownError(error: unknown): Error {
  if (error instanceof DOMException) {
    const normalized = new Error(error.message)
    normalized.name = error.name
    return normalized
  }
  return error instanceof Error ? error : new Error(String(error))
}

async function requestTaskText<T>(options: AiJsonTaskOptions<T>): Promise<string> {
  if (options.transport === 'stream') {
    const fullText = await streamAIRequest(
      options.config,
      options.systemPrompt,
      options.userMessage,
      options.streamCallbacks ?? {},
      options.signal,
      options.streamOptions,
    )
    options.streamCallbacks?.onDone?.(fullText)
    return fullText
  }

  return nonStreamAIRequest(
    options.config,
    options.systemPrompt,
    options.userMessage,
    options.requestOptions,
    options.signal,
  )
}

async function requestJsonRepair<T>(
  options: AiJsonTaskOptions<T>,
  rawText: string,
  error: Error,
): Promise<string> {
  const systemPrompt = `你是一个严格的 JSON 修复器。
你的任务是把上游模型输出修复为可被 JSON.parse 解析的 JSON。
只返回 JSON 本体，不要 Markdown 代码块，不要解释。`

  const userMessage = [
    `任务名称：${options.taskName}`,
    `Prompt 类别：${options.category}`,
    '',
    '期望输出契约：',
    options.schemaHint?.trim() || '保持原任务要求的 JSON 结构，不要新增无关字段。',
    '',
    '解析/校验错误：',
    error.message,
    '',
    '需要修复的原始输出：',
    truncateForRepair(rawText),
  ].join('\n')

  return nonStreamAIRequest(
    options.config,
    systemPrompt,
    userMessage,
    { temperature: 0, maxTokens: options.requestOptions?.maxTokens },
    options.signal,
  )
}

function parseAndNormalizeJson<T>(
  rawText: string,
  options: AiJsonTaskOptions<T>,
): { value: T; issues: AiTaskIssue[] } {
  const parsed = JSON.parse(cleanJsonResponse(rawText)) as unknown
  const value = options.normalize(parsed)
  const issues = options.validate?.(value) ?? []
  const blockingIssues = getBlockingIssues(issues)
  if (blockingIssues.length > 0) {
    throw new AiTaskValidationError(blockingIssues)
  }
  return { value, issues }
}

function getRepairMaxAttempts<T>(options: AiJsonTaskOptions<T>): number {
  if (!options.repair) return 0
  if (options.repair === true) return 1
  return Math.max(0, options.repair.maxAttempts ?? 1)
}

export async function runJsonTask<T>(options: AiJsonTaskOptions<T>): Promise<T> {
  const transport = options.transport ?? 'non-stream'
  const maxRepairAttempts = getRepairMaxAttempts(options)

  let rawText = ''

  try {
    rawText = await requestTaskText({ ...options, transport })

    for (let attempt = 0; attempt <= maxRepairAttempts; attempt++) {
      try {
        const result = parseAndNormalizeJson(rawText, options)
        return result.value
      } catch (error) {
        const normalizedError = normalizeUnknownError(error)
        if (attempt >= maxRepairAttempts) throw normalizedError

        rawText = await requestJsonRepair(options, rawText, normalizedError)
      }
    }

    throw new Error('AI JSON 任务未返回可用结果')
  } catch (error) {
    throw normalizeUnknownError(error)
  }
}
