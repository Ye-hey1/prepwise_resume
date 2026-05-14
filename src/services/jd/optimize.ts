/**
 * JD 定向优化建议服务
 */
import type { StreamCallbacks, JDData, JDSuggestion } from '../types/jd'
import type { AiConfig } from '../stream'
import { streamAIRequest, cleanJsonResponse } from '../stream'
import { JD_OPTIMIZE_SYSTEM_PROMPT, JD_OPTIMIZE_USER_TEMPLATE } from '../prompts/jdOptimizePrompt'
import { normalizeOptimizationSuggestions } from './normalizers'
import { formatJDRequirements } from './promptBuilder'
import type { CompanyIntelData } from '../types/jd'

/** JD 定向优化 → JDSuggestion[] */
export async function getJDOptimizationSuggestions(
  config: AiConfig,
  jdData: JDData,
  resumeText: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  companyIntel?: CompanyIntelData,
): Promise<JDSuggestion[]> {
  const jdRequirements = formatJDRequirements(jdData)
  const companyIntelSection = companyIntel
    ? `公司：${companyIntel.companyName}\n主要业务/竞品：${companyIntel.businessScope}\n工程文化/黑话：${companyIntel.cultureNotes}\n最近新闻/方向：${companyIntel.companyHistory}`
    : '暂无公司情报数据。'

  const userMessage = JD_OPTIMIZE_USER_TEMPLATE
    .replace('{jdRequirements}', jdRequirements)
    .replace('{companyIntelSection}', companyIntelSection)
    .replace('{resumeText}', resumeText)

  const fullText = await streamAIRequest(config, JD_OPTIMIZE_SYSTEM_PROMPT, userMessage, callbacks, signal)

  const cleaned = cleanJsonResponse(fullText)
  try {
    const parsed = JSON.parse(cleaned)
    return normalizeOptimizationSuggestions(parsed)
  } catch {
    throw new Error('AI 返回的优化建议数据格式异常，请重试。')
  }
}
