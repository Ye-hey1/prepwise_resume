/**
 * JD 定向优化建议服务
 */
import type { StreamCallbacks, JDData, JDSuggestion } from '../types/jd'
import type { AiConfig } from '../stream'
import { runJsonTask, type AiTaskIssue } from '../aiTaskRuntime'
import { JD_OPTIMIZE_SYSTEM_PROMPT, JD_OPTIMIZE_USER_TEMPLATE } from '../prompts/jdOptimizePrompt'
import { normalizeOptimizationSuggestions } from './normalizers'
import { formatJDRequirements } from './promptBuilder'
import type { CompanyIntelData } from '../types/jd'

const JD_OPTIMIZE_SCHEMA_HINT = `{
  "suggestions": [
    {
      "section": string,
      "issueType": string,
      "originalText": string,
      "suggestedText": string,
      "priority": "high|medium|low",
      "reason": string
    }
  ]
}`

function validateOptimizationSuggestions(result: JDSuggestion[]): AiTaskIssue[] {
  if (result.length > 0) return []
  return [{
    path: 'suggestions',
    message: 'JD 定向优化建议为空',
    severity: 'error',
  }]
}

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

  try {
    return await runJsonTask({
      taskName: 'jd.getJDOptimizationSuggestions',
      category: 'jd-optimize',
      config,
      systemPrompt: JD_OPTIMIZE_SYSTEM_PROMPT,
      userMessage,
      normalize: normalizeOptimizationSuggestions,
      validate: validateOptimizationSuggestions,
      schemaHint: JD_OPTIMIZE_SCHEMA_HINT,
      transport: 'stream',
      streamCallbacks: callbacks,
      signal,
      repair: true,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (error instanceof Error && /API 请求失败|AI 请求超时|请求已取消/.test(error.message)) throw error
    throw new Error('AI 返回的优化建议数据格式异常，请重试。')
  }
}
