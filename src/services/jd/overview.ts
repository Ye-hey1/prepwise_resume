/**
 * 简历全局诊断服务
 */
import type { StreamCallbacks, ResumeOverview } from '../types/jd'
import type { AiConfig } from '../stream'
import { runJsonTask, type AiTaskIssue } from '../aiTaskRuntime'
import { RESUME_OVERVIEW_SYSTEM_PROMPT, RESUME_OVERVIEW_USER_TEMPLATE } from '../prompts/resumeOverviewPrompt'
import { normalizeResumeOverview } from './normalizers'

const RESUME_OVERVIEW_SCHEMA_HINT = `{
  "headline": string,
  "highlights": string[],
  "risks": string[],
  "roleFit": [
    { "role": string, "fit": "high|medium|low", "reason": string }
  ]
}`

function validateResumeOverview(result: ResumeOverview): AiTaskIssue[] {
  const issues: AiTaskIssue[] = []
  if (!result.headline.trim() && result.highlights.length === 0 && result.risks.length === 0) {
    issues.push({
      path: '$',
      message: '简历诊断缺少标题、亮点和风险内容',
      severity: 'error',
    })
  }
  return issues
}

/** 简历全局诊断 → ResumeOverview */
export async function analyzeResumeOverview(
  config: AiConfig,
  resumeText: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<ResumeOverview> {
  const userMessage = RESUME_OVERVIEW_USER_TEMPLATE.replace('{resumeText}', resumeText)

  try {
    return await runJsonTask({
      taskName: 'jd.analyzeResumeOverview',
      category: 'jd-overview',
      config,
      systemPrompt: RESUME_OVERVIEW_SYSTEM_PROMPT,
      userMessage,
      normalize: normalizeResumeOverview,
      validate: validateResumeOverview,
      schemaHint: RESUME_OVERVIEW_SCHEMA_HINT,
      transport: 'stream',
      streamCallbacks: callbacks,
      signal,
      repair: true,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (error instanceof Error && /API 请求失败|AI 请求超时|请求已取消/.test(error.message)) throw error
    throw new Error('AI 返回的简历诊断数据格式异常，请重试。')
  }
}
