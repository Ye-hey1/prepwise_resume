/**
 * 简历全局诊断服务
 */
import type { StreamCallbacks, ResumeOverview } from '../types/jd'
import type { AiConfig } from '../stream'
import { streamAIRequest, cleanJsonResponse } from '../stream'
import { RESUME_OVERVIEW_SYSTEM_PROMPT, RESUME_OVERVIEW_USER_TEMPLATE } from '../prompts/resumeOverviewPrompt'
import { normalizeResumeOverview } from './normalizers'

/** 尝试从可能不完整的 JSON 文本中解析出 ResumeOverview */
function tryParseOverview(text: string): unknown {
  // 第一次尝试：直接解析
  try {
    return JSON.parse(text)
  } catch {
    // 继续尝试恢复
  }

  // 第二次尝试：补全不完整的 JSON（缺少闭合括号）
  let depth = 0
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (escaped) { escaped = false; continue }
    if (ch === '\\' && inString) { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') depth--
  }

  // 补全缺失的闭合括号
  let patched = text
  // 关闭未闭合的字符串
  if (inString) patched += '"'
  // 补全缺失的 }
  for (let i = 0; i < depth; i++) patched += '}'

  try {
    return JSON.parse(patched)
  } catch {
    // 最终尝试：截取到最后一个完整的 key-value
    const lastComma = patched.lastIndexOf('",')
    if (lastComma > 0) {
      try {
        return JSON.parse(patched.slice(0, lastComma + 1) + '}')
      } catch {
        // 放弃恢复
      }
    }
  }

  return null
}

/** 简历全局诊断 → ResumeOverview */
export async function analyzeResumeOverview(
  config: AiConfig,
  resumeText: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<ResumeOverview> {
  const userMessage = RESUME_OVERVIEW_USER_TEMPLATE.replace('{resumeText}', resumeText)

  const fullText = await streamAIRequest(config, RESUME_OVERVIEW_SYSTEM_PROMPT, userMessage, callbacks, signal)

  const cleaned = cleanJsonResponse(fullText)

  // 空响应检测
  if (!cleaned) {
    console.error('[JD Overview] AI 返回为空, fullText length:', fullText.length)
    throw new Error('AI 返回了空内容，请重试。如果持续出现请检查 AI 配置。')
  }

  const parsed = tryParseOverview(cleaned)
  if (parsed) {
    return normalizeResumeOverview(parsed)
  }

  // 所有恢复尝试都失败
  console.error('[JD Overview] JSON 解析失败:', {
    rawLength: fullText.length,
    cleanedLength: cleaned.length,
    cleanedPreview: cleaned.slice(0, 500),
  })
  throw new Error('AI 返回的简历诊断数据格式异常，请重试。')
}
