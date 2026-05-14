/**
 * JD-简历匹配分析服务
 */
import type { StreamCallbacks, JDData, JDMatchResult } from '../types/jd'
import type { AiConfig } from '../stream'
import { streamAIRequest, cleanJsonResponse } from '../stream'
import { JD_MATCH_SYSTEM_PROMPT, JD_MATCH_USER_TEMPLATE } from '../prompts/jdMatchPrompt'
import { normalizeMatchResult } from './normalizers'
import { formatJDRequirements } from './promptBuilder'

/** JD-简历匹配 → JDMatchResult */
export async function matchResumeToJD(
  config: AiConfig,
  jdData: JDData,
  resumeText: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<JDMatchResult> {
  const jdRequirements = formatJDRequirements(jdData)
  const userMessage = JD_MATCH_USER_TEMPLATE
    .replace('{jdRequirements}', jdRequirements)
    .replace('{resumeText}', resumeText)

  const fullText = await streamAIRequest(config, JD_MATCH_SYSTEM_PROMPT, userMessage, callbacks, signal)

  const cleaned = cleanJsonResponse(fullText)
  try {
    return normalizeMatchResult(JSON.parse(cleaned))
  } catch {
    throw new Error('AI 返回的匹配分析数据格式异常，请重试。')
  }
}
