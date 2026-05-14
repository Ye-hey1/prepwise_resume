/**
 * JD 岗位备面洞察服务
 */
import type { StreamCallbacks, JDData, JDMatchResult, ResumeOverview, JdPrepInsight, CompanyIntelData } from '../types/jd'
import type { AiConfig } from '../stream'
import { streamAIRequest, cleanJsonResponse, safeJsonStringify } from '../stream'
import { JD_PREP_SYSTEM_PROMPT, JD_PREP_USER_TEMPLATE } from '../prompts/jdPrepPrompt'
import { normalizePrepInsight } from './normalizers'
import { formatJDRequirements } from './promptBuilder'

/** JD 岗位备面洞察 → JdPrepInsight */
export async function generateJdPrepInsight(
  config: AiConfig,
  jdData: JDData,
  resumeText: string,
  matchResult: JDMatchResult,
  overview: ResumeOverview | null,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  companyIntel?: CompanyIntelData | null,
): Promise<JdPrepInsight> {
  const jdRequirements = formatJDRequirements(jdData)
  const companyIntelSection = companyIntel
    ? `公司：${companyIntel.companyName}\n主要业务：${companyIntel.businessScope}\n技术栈：${companyIntel.techStack.join('、')}\n工程文化：${companyIntel.cultureNotes}\n面试切入点：${companyIntel.howToReference || '暂无'}\n推荐反问：${companyIntel.reverseQuestions.join('；') || '暂无'}`
    : '暂无公司情报数据。'
  const userMessage = JD_PREP_USER_TEMPLATE
    .replace('{jdRequirements}', jdRequirements)
    .replace('{resumeText}', resumeText)
    .replace('{matchResult}', safeJsonStringify(matchResult))
    .replace('{overview}', overview ? safeJsonStringify(overview) : '暂无诊断数据。')
    .replace('{companyIntel}', companyIntelSection)

  const fullText = await streamAIRequest(config, JD_PREP_SYSTEM_PROMPT, userMessage, callbacks, signal)

  const cleaned = cleanJsonResponse(fullText)
  try {
    const parsed = JSON.parse(cleaned)
    return normalizePrepInsight(parsed)
  } catch {
    throw new Error('AI 返回的岗位备面数据格式异常，请重试。')
  }
}
