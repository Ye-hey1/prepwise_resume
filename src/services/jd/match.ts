/**
 * JD-简历匹配分析服务
 */
import type { StreamCallbacks, JDData, JDMatchResult } from '../types/jd'
import type { AiConfig } from '../stream'
import { runJsonTask, type AiTaskIssue } from '../aiTaskRuntime'
import { JD_MATCH_SYSTEM_PROMPT, JD_MATCH_USER_TEMPLATE } from '../prompts/jdMatchPrompt'
import { normalizeMatchResult } from './normalizers'
import { formatJDRequirements } from './promptBuilder'

const JD_MATCH_SCHEMA_HINT = `{
  "score": {
    "total": number,
    "mustHave": number,
    "niceToHave": number,
    "techStack": number,
    "experience": number,
    "degree": number,
    "jobDuties": number
  },
  "matches": [
    {
      "requirement": string,
      "category": "mustHave|niceToHave|degree|experience|techStack|jobDuties",
      "status": "matched|partial|missing",
      "evidence": string,
      "suggestion": string,
      "evidenceList": string[],
      "riskGaps": string[],
      "matchReason": string,
      "priority": "high|medium|low"
    }
  ],
  "summary": string,
  "gaps": string[],
  "strengths": string[]
}`

function countExpectedRequirementItems(jdData: JDData): number {
  return [
    jdData.requirements.degree,
    jdData.requirements.experience,
    ...jdData.requirements.techStack,
    ...jdData.requirements.mustHave.map(item => item.text),
    ...jdData.requirements.niceToHave.map(item => item.text),
    ...jdData.requirements.jobDuties,
  ].filter(item => item.trim()).length
}

function validateMatchResult(result: JDMatchResult, expectedRequirements: number): AiTaskIssue[] {
  const issues: AiTaskIssue[] = []
  if (expectedRequirements > 0 && result.matches.length === 0) {
    issues.push({
      path: 'matches',
      message: 'JD 存在可分析要求，但匹配明细为空',
      severity: 'error',
    })
  }
  if (!result.summary.trim()) {
    issues.push({
      path: 'summary',
      message: '匹配总结为空',
      severity: 'warning',
    })
  }
  return issues
}

/** JD-简历匹配 → JDMatchResult */
export async function matchResumeToJD(
  config: AiConfig,
  jdData: JDData,
  resumeText: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<JDMatchResult> {
  const jdRequirements = formatJDRequirements(jdData)
  const expectedRequirements = countExpectedRequirementItems(jdData)
  const userMessage = JD_MATCH_USER_TEMPLATE
    .replace('{jdRequirements}', jdRequirements)
    .replace('{resumeText}', resumeText)

  try {
    return await runJsonTask({
      taskName: 'jd.matchResumeToJD',
      category: 'jd-match',
      config,
      systemPrompt: JD_MATCH_SYSTEM_PROMPT,
      userMessage,
      normalize: normalizeMatchResult,
      validate: result => validateMatchResult(result, expectedRequirements),
      schemaHint: JD_MATCH_SCHEMA_HINT,
      transport: 'stream',
      streamCallbacks: callbacks,
      signal,
      repair: true,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (error instanceof Error && /API 请求失败|AI 请求超时|请求已取消/.test(error.message)) throw error
    throw new Error('AI 返回的匹配分析数据格式异常，请重试。')
  }
}
