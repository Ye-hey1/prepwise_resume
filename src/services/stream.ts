/**
 * 共享 SSE 流式请求工具
 * 统一 jdService / aiService / interviewService 中的 SSE 调用模式
 */

/** AI 服务配置 */
export interface AiConfig {
  apiUrl: string
  apiToken: string
  modelName: string
}

/** 流式回调 */
export interface StreamCallbacks {
  onChunk: (text: string) => void
  onDone: (fullText: string) => void
  onError: (msg: string) => void
}

type StreamChunkCallbacks = {
  onChunk?: (text: string) => void
}

/** 流式请求选项 */
export interface StreamOptions {
  /** 请求超时时间（毫秒），默认 120000 (2分钟) */
  timeoutMs?: number
  /** 失败重试次数，默认 1 */
  maxRetries?: number
  /** 重试间隔（毫秒），默认 1000 */
  retryDelayMs?: number
}

/** 移除 HTML 标签，保留纯文本 */
export function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 清理 AI 返回中可能存在的 markdown 代码块标记，并尝试提取 JSON */
export function cleanJsonResponse(text: string): string {
  let cleaned = text.trim()

  // 1. 尝试提取 ```json ... ``` 代码块
  const fencedMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  // 2. 去掉开头可能的 ``` 标记（未闭合的情况）
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
    // 尝试去掉结尾的 ```
    cleaned = cleaned.replace(/\n?```\s*$/i, '')
    return cleaned.trim()
  }

  // 3. 尝试从文本中提取 JSON 对象或数组
  //    找到第一个 { 或 [ 开始的位置
  const jsonStartChar = findFirstJsonChar(cleaned)
  if (jsonStartChar !== null) {
    const startIdx = cleaned.indexOf(jsonStartChar)
    if (startIdx > 0) {
      // 去掉 JSON 之前的说明文字
      cleaned = cleaned.slice(startIdx)
    }
    // 去掉 JSON 之后可能的说明文字
    cleaned = trimTrailingNonJson(cleaned, jsonStartChar)
  }

  return cleaned.trim()
}

/** 找到文本中最先出现的 JSON 起始字符 { 或 [ */
function findFirstJsonChar(text: string): '{' | '[' | null {
  for (const ch of text) {
    if (ch === '{') return '{'
    if (ch === '[') return '['
    // 跳过空白
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue
    // 遇到其他字符说明还没到 JSON
    break
  }
  // 如果开头没有 { 或 [，在文本中搜索
  const braceIdx = text.indexOf('{')
  const bracketIdx = text.indexOf('[')
  if (braceIdx < 0 && bracketIdx < 0) return null
  if (braceIdx < 0) return '['
  if (bracketIdx < 0) return '{'
  return braceIdx < bracketIdx ? '{' : '['
}

/** 去掉 JSON 主体之后可能存在的额外文本 */
function trimTrailingNonJson(text: string, startChar: '{' | '['): string {
  const endChar = startChar === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\' && inString) {
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === startChar) depth++
    if (ch === endChar) {
      depth--
      if (depth === 0) {
        // 找到了匹配的闭合括号
        return text.slice(0, i + 1)
      }
    }
  }

  // 没有找到完整闭合，返回原文（可能是截断的 JSON）
  return text
}

/** 安全地 JSON 序列化 */
export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '{}'
  }
}

function isOllamaCompatibleHost(rawUrl: string): boolean {
  return /(^https?:\/\/)?(localhost|127\.0\.0\.1):11434(\/|$)/i.test(rawUrl)
    || /(^https?:\/\/)?ollama\.com(\/|$)/i.test(rawUrl)
}

function normalizeOllamaCompatibleBase(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/api$/i, '')
    .replace(/\/v1$/i, '')
}

/** 构建完整的 API URL */
function buildApiUrl(rawUrl: string): string {
  if (isOllamaCompatibleHost(rawUrl)) {
    return `${normalizeOllamaCompatibleBase(rawUrl)}/v1/chat/completions`
  }

  let baseUrl = rawUrl.trim().replace(/\/+$/, '')
  if (!baseUrl.includes('/v1/chat/completions')) {
    if (!baseUrl.endsWith('/v1')) baseUrl += '/v1'
    baseUrl += '/chat/completions'
  }
  return baseUrl
}

/**
 * SSE 流式 AI 请求
 * 向 OpenAI 兼容的 /v1/chat/completions 端点发送流式请求，累积完整文本后返回
 * 支持超时和重试机制
 */
export async function streamAIRequest(
  config: AiConfig,
  systemPrompt: string,
  userMessage: string,
  callbacks: StreamChunkCallbacks,
  signal?: AbortSignal,
  options?: StreamOptions,
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 120_000
  const maxRetries = options?.maxRetries ?? 1
  const retryDelayMs = options?.retryDelayMs ?? 1000

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 被外部取消时不重试
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')

    try {
      return await doStreamRequest(config, systemPrompt, userMessage, callbacks, signal, timeoutMs)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // 不可重试的错误直接抛出
      if (isNonRetryableError(err)) throw lastError
      // 最后一次尝试失败直接抛出
      if (attempt >= maxRetries) throw lastError

      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }

  throw lastError ?? new Error('请求失败')
}

/** 判断是否为不可重试的错误 */
function isNonRetryableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error) {
    // 401/403 认证错误不重试
    if (/API 请求失败 \(4[0-9][0-9]\)/.test(err.message)) return true
  }
  return false
}

/** 执行单次 SSE 流式请求（含超时） */
async function doStreamRequest(
  config: AiConfig,
  systemPrompt: string,
  userMessage: string,
  callbacks: StreamChunkCallbacks,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<string> {
  const url = buildApiUrl(config.apiUrl)

  // 创建超时 AbortController
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)

  // 合并外部 signal 和超时 signal
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal

  try {
    const response = await fetch(url, {
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
      }),
      signal: combinedSignal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`API 请求失败 (${response.status}): ${errorText || response.statusText}`)
    }

    // 检查是否为非流式响应（部分提供商忽略 stream:true 返回普通 JSON）
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/event-stream') && !contentType.includes('application/octet-stream')) {
      const body = await response.text()
      try {
        const parsed = JSON.parse(body)
        const content = parsed.choices?.[0]?.message?.content ?? parsed.choices?.[0]?.text ?? ''
        if (content) {
          callbacks.onChunk?.(content)
          return content
        }
      } catch {
        // 非 JSON 响应，可能是纯文本
        if (body.trim()) {
          callbacks.onChunk?.(body)
          return body
        }
      }
      throw new Error('API 返回了空响应，请检查模型是否支持该请求。')
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法读取 API 响应流')

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    const handleSsePayload = (payload: string): boolean => {
      const data = payload.trim()
      if (!data) return false
      if (data === '[DONE]') return true

      try {
        const parsed = JSON.parse(data)
        const choice = parsed.choices?.[0]
        const content = choice?.delta?.content ?? choice?.message?.content
        if (typeof content === 'string' && content) {
          fullText += content
          callbacks.onChunk?.(fullText)
        }
        return Boolean(choice?.finish_reason)
      } catch {
        return false
      }
    }

    const processBuffer = (): boolean => {
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      let shouldStop = false
      for (const part of parts) {
        const lines = part.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue
          if (handleSsePayload(trimmed.slice(5))) {
            shouldStop = true
          }
        }
      }

      return shouldStop
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        // 处理缓冲区剩余数据
        if (buffer.trim()) {
          const segments = buffer.split('\n\n').map(s => s.trim()).filter(Boolean)
          for (const segment of segments) {
            const lines = segment.split('\n')
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith('data:')) continue
              handleSsePayload(trimmed.slice(5))
            }
          }
        }
        break
      }

      buffer += decoder.decode(value, { stream: true })
      if (processBuffer()) {
        await reader.cancel().catch(() => {})
        break
      }
    }

    return fullText
  } catch (err) {
    // 区分超时和其他错误
    if (err instanceof DOMException && err.name === 'AbortError' && timeoutController.signal.aborted) {
      throw new Error(`AI 请求超时 (${Math.round(timeoutMs / 1000)}秒)，请检查网络连接或稍后重试。`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 回调驱动的 SSE 流式请求（兼容 aiService / interviewService 的调用模式）
 * 内部调用 streamAIRequest，将 Promise 结果分发到 callbacks
 */
export async function streamWithCallbacks(
  config: AiConfig,
  systemPrompt: string,
  userMessage: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  options?: StreamOptions,
): Promise<void> {
  try {
    const fullText = await streamAIRequest(config, systemPrompt, userMessage, {
      onChunk: callbacks.onChunk,
    }, signal, options)

    callbacks.onDone(fullText)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(message)
  }
}

/**
 * 非流式 AI 请求（单次返回完整结果）
 * 适用于生成题目、评估、提示等不需要流式的场景
 */
export async function nonStreamAIRequest(
  config: AiConfig,
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number },
  signal?: AbortSignal,
): Promise<string> {
  const url = buildApiUrl(config.apiUrl)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiToken}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      temperature: options?.temperature ?? 0.5,
      max_tokens: options?.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`API 请求失败 (${response.status}): ${errorText || response.statusText}`)
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return (payload.choices?.[0]?.message?.content ?? '').trim()
}

/** 导出内部函数供复用 */
export { buildApiUrl }
