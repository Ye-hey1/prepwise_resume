/**
 * JD 文本提取服务
 * 从原始 JD 文本中提取结构化的 JDData
 */
import type { StreamCallbacks, JDData } from '../types/jd'
import type { AiConfig } from '../stream'
import { runJsonTask, type AiTaskIssue } from '../aiTaskRuntime'
import { JD_EXTRACT_SYSTEM_PROMPT, JD_EXTRACT_USER_TEMPLATE } from '../prompts/jdExtractPrompt'
import { normalizeJDData } from './normalizers'

const JD_EXTRACT_SCHEMA_HINT = `{
  "basicInfo": {
    "jobTitle": string,
    "company": string,
    "location": string,
    "jobType": string,
    "department": string
  },
  "requirements": {
    "degree": string,
    "experience": string,
    "techStack": string[],
    "mustHave": [{ "text": string, "weight": "required|preferred|bonus" }],
    "niceToHave": [{ "text": string, "weight": "required|preferred|bonus" }],
    "jobDuties": string[]
  }
}`

function validateJDData(data: JDData): AiTaskIssue[] {
  const issues: AiTaskIssue[] = []
  const requirementCount = data.requirements.mustHave.length
    + data.requirements.niceToHave.length
    + data.requirements.jobDuties.length
    + data.requirements.techStack.length

  if (!data.basicInfo.jobTitle.trim() && requirementCount === 0) {
    issues.push({
      path: '$',
      message: 'JD 提取结果缺少岗位名称和需求条目',
      severity: 'error',
    })
  }

  if (!data.basicInfo.company.trim()) {
    issues.push({
      path: 'basicInfo.company',
      message: '公司名称为空',
      severity: 'warning',
    })
  }

  return issues
}

/** JD 文本提取 → 结构化 JDData */
export async function extractJD(
  config: AiConfig,
  jdText: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<JDData> {
  const userMessage = JD_EXTRACT_USER_TEMPLATE.replace('{jdText}', jdText)
  try {
    return await runJsonTask({
      taskName: 'jd.extractJD',
      category: 'jd-extract',
      config,
      systemPrompt: JD_EXTRACT_SYSTEM_PROMPT,
      userMessage,
      normalize: normalizeJDData,
      validate: validateJDData,
      schemaHint: JD_EXTRACT_SCHEMA_HINT,
      transport: 'stream',
      streamCallbacks: callbacks,
      signal,
      repair: true,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (error instanceof Error && /API 请求失败|AI 请求超时|请求已取消/.test(error.message)) throw error
    throw new Error('AI 返回的 JD 数据格式异常，请重试。')
  }
}
