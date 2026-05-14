import { RESUME_ADVICE_SYSTEM_PROMPT, buildResumeAdviceUserPrompt } from './prompts/resumeAdvicePrompt'
import { RESUME_ASSISTANT_SYSTEM_PROMPT, buildResumeAssistantUserPrompt } from './prompts/resumeAssistantPrompt'
import type {
  ResumeAssistantAdviceItem,
  ResumeAssistantAdviceResult,
  ResumeAssistantResult,
  ResumeAssistantSuggestion,
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

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  }
  return cleaned.trim()
}

function normalizeSuggestion(item: Partial<ResumeAssistantSuggestion>, index: number): ResumeAssistantSuggestion | null {
  const text = typeof item.text === 'string' ? item.text.trim() : ''
  if (!text) return null
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `suggestion-${index + 1}`,
    text,
    tone: typeof item.tone === 'string' ? item.tone.trim() : '',
    highlight: typeof item.highlight === 'string' ? item.highlight.trim() : '',
  }
}

function normalizeAdvice(item: Partial<ResumeAssistantAdviceItem>, index: number): ResumeAssistantAdviceItem | null {
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  const problem = typeof item.problem === 'string' ? item.problem.trim() : ''
  const suggestion = typeof item.suggestion === 'string' ? item.suggestion.trim() : ''
  const example = typeof item.example === 'string' ? item.example.trim() : ''
  if (!title || !problem || !suggestion) return null
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `advice-${index + 1}`,
    title,
    problem,
    suggestion,
    example,
  }
}

function normalizeSuggestionResult(raw: unknown): ResumeAssistantResult {
  const suggestions = Array.isArray((raw as ResumeAssistantResult | null)?.suggestions)
    ? (raw as ResumeAssistantResult).suggestions
        .map((item, index) => normalizeSuggestion(item, index))
        .filter((item): item is ResumeAssistantSuggestion => Boolean(item))
    : []

  return {
    suggestions: suggestions.slice(0, 5),
  }
}

function normalizeAdviceResult(raw: unknown): ResumeAssistantAdviceResult {
  const advice = Array.isArray((raw as ResumeAssistantAdviceResult | null)?.advice)
    ? (raw as ResumeAssistantAdviceResult).advice
        .map((item, index) => normalizeAdvice(item, index))
        .filter((item): item is ResumeAssistantAdviceItem => Boolean(item))
    : []

  return {
    advice: advice.slice(0, 5),
  }
}

async function requestJsonResult<T>(
  config: ResumeAssistantConfig,
  systemPrompt: string,
  userMessage: string,
  callbacks: ResumeAssistantCallbacks,
  normalize: (raw: unknown) => T,
  signal?: AbortSignal,
): Promise<T> {
  let baseUrl: string
  if (/(^https?:\/\/)?(localhost|127\.0\.0\.1):11434(\/|$)/i.test(config.apiUrl) || /(^https?:\/\/)?ollama\.com(\/|$)/i.test(config.apiUrl)) {
    const normalized = config.apiUrl
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/chat\/completions$/i, '')
      .replace(/\/api$/i, '')
      .replace(/\/v1$/i, '')
    baseUrl = `${normalized}/v1/chat/completions`
  } else {
    baseUrl = config.apiUrl.trim().replace(/\/+$/, '')
    if (!baseUrl.includes('/v1/chat/completions')) {
      if (!baseUrl.endsWith('/v1')) {
        baseUrl += '/v1'
      }
      baseUrl += '/chat/completions'
    }
  }

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`API 请求失败 (${response.status}): ${errorText || response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法读取 API 响应流')

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content
          if (content) {
            fullText += content
            callbacks.onChunk(fullText)
          }
        } catch {
          // 忽略异常分片
        }
      }
    }

    callbacks.onDone(fullText)
    const cleaned = cleanJsonResponse(fullText)
    const parsed = JSON.parse(cleaned)
    return normalize(parsed)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
    throw err
  }
}

export async function generateResumeAssistantSuggestions(
  config: ResumeAssistantConfig,
  context: ResumeFieldAiContext,
  callbacks: ResumeAssistantCallbacks,
  signal?: AbortSignal,
): Promise<ResumeAssistantResult> {
  return requestJsonResult(
    config,
    RESUME_ASSISTANT_SYSTEM_PROMPT,
    buildResumeAssistantUserPrompt(context),
    callbacks,
    normalizeSuggestionResult,
    signal,
  )
}

export async function generateResumeAssistantAdvice(
  config: ResumeAssistantConfig,
  context: ResumeFieldAiContext,
  callbacks: ResumeAssistantCallbacks,
  signal?: AbortSignal,
): Promise<ResumeAssistantAdviceResult> {
  return requestJsonResult(
    config,
    RESUME_ADVICE_SYSTEM_PROMPT,
    buildResumeAdviceUserPrompt(context),
    callbacks,
    normalizeAdviceResult,
    signal,
  )
}
