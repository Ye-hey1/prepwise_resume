/**
 * JD 岗位备面洞察服务
 */
import type { StreamCallbacks, JDData, JDMatchResult, ResumeOverview, JdPrepInsight, CompanyIntelData } from '../types/jd'
import type { AiConfig } from '../stream'
import { safeJsonStringify } from '../stream'
import { runJsonTask, type AiTaskIssue } from '../aiTaskRuntime'
import { JD_PREP_SYSTEM_PROMPT, JD_PREP_USER_TEMPLATE } from '../prompts/jdPrepPrompt'
import { normalizePrepInsight } from './normalizers'
import { formatJDRequirements } from './promptBuilder'
import { buildCurrentDateContextPrompt, isStaleFutureDateRiskText } from '@/utils/currentDateContext'

const JD_PREP_SCHEMA_HINT = `{
  "summary": string,
  "focusAreas": string[],
  "recommendedStories": [
    {
      "title": string,
      "reason": string,
      "moduleKey": string,
      "talkingPoints": string[]
    }
  ],
  "highRiskFollowUps": [
    {
      "question": string,
      "riskReason": string,
      "suggestion": string,
      "moduleKey": string
    }
  ],
  "prepPriorities": string[],
  "likelyQuestionGroups": [
    { "title": string, "intent": string, "questions": string[] }
  ]
}`

function validatePrepInsight(result: JdPrepInsight): AiTaskIssue[] {
  const issues: AiTaskIssue[] = []
  if (!result.summary.trim() && result.focusAreas.length === 0 && result.prepPriorities.length === 0) {
    issues.push({
      path: '$',
      message: '备面洞察缺少摘要、重点领域和准备优先级',
      severity: 'error',
    })
  }
  return issues
}

function sanitizePrepInsightDateRisks(result: JdPrepInsight): JdPrepInsight {
  return {
    ...result,
    highRiskFollowUps: result.highRiskFollowUps.filter(item =>
      !isStaleFutureDateRiskText([
        item.question,
        item.riskReason,
        item.suggestion,
      ].join('\n')),
    ),
    likelyQuestionGroups: result.likelyQuestionGroups.map(group => ({
      ...group,
      questions: group.questions.filter(question => !isStaleFutureDateRiskText(question)),
    })).filter(group => group.questions.length > 0),
  }
}

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
    .replace('{dateContext}', buildCurrentDateContextPrompt())
    .replace('{jdRequirements}', jdRequirements)
    .replace('{resumeText}', resumeText)
    .replace('{matchResult}', safeJsonStringify(matchResult))
    .replace('{overview}', overview ? safeJsonStringify(overview) : '暂无诊断数据。')
    .replace('{companyIntel}', companyIntelSection)

  try {
    const result = await runJsonTask({
      taskName: 'jd.generateJdPrepInsight',
      category: 'jd-prep',
      config,
      systemPrompt: JD_PREP_SYSTEM_PROMPT,
      userMessage,
      normalize: normalizePrepInsight,
      validate: validatePrepInsight,
      schemaHint: JD_PREP_SCHEMA_HINT,
      transport: 'stream',
      streamCallbacks: callbacks,
      signal,
      repair: true,
    })
    return sanitizePrepInsightDateRisks(result)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (error instanceof Error && /API 请求失败|AI 请求超时|请求已取消/.test(error.message)) throw error
    throw new Error('AI 返回的岗位备面数据格式异常，请重试。')
  }
}
