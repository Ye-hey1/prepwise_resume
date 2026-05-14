/**
 * JD 文本提取服务
 * 从原始 JD 文本中提取结构化的 JDData
 */
import type { StreamCallbacks, JDData } from '../types/jd'
import type { AiConfig } from '../stream'
import { streamAIRequest, cleanJsonResponse } from '../stream'
import { JD_EXTRACT_SYSTEM_PROMPT, JD_EXTRACT_USER_TEMPLATE } from '../prompts/jdExtractPrompt'
import { normalizeJDData } from './normalizers'

/** JD 文本提取 → 结构化 JDData */
export async function extractJD(
  config: AiConfig,
  jdText: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<JDData> {
  const userMessage = JD_EXTRACT_USER_TEMPLATE.replace('{jdText}', jdText)
  const fullText = await streamAIRequest(config, JD_EXTRACT_SYSTEM_PROMPT, userMessage, callbacks, signal)

  const cleaned = cleanJsonResponse(fullText)
  try {
    const raw = JSON.parse(cleaned)
    return normalizeJDData(raw)
  } catch {
    throw new Error('AI 返回的 JD 数据格式异常，请重试。')
  }
}
