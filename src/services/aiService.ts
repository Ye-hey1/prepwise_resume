/**
 * 简历字段/模块 AI 优化服务
 * 使用共享 SSE 流工具，避免重复代码
 */
import type {
  AwardEntry,
  BasicInfo,
  EducationEntry,
  ProjectEntry,
  WorkEntry,
} from '@/stores/resume'
import type { ResumeFieldAiContext } from './types/resumeAssistant'
import { getModuleOutputRules, SYSTEM_PROMPT } from './prompts'
import { stripHtml, streamWithCallbacks, type AiConfig, type StreamCallbacks } from './stream'

// ── 格式化工具 ──

function formatBasicInfo(info: BasicInfo): string {
  const lines: string[] = []
  if (info.name) lines.push(`姓名：${info.name}`)
  if (info.phone) lines.push(`电话：${info.phone}`)
  if (info.email) lines.push(`邮箱：${info.email}`)
  if (info.jobTitle) lines.push(`求职岗位：${info.jobTitle}`)
  if (info.age) lines.push(`年龄：${info.age}`)
  if (info.gender) lines.push(`性别：${info.gender}`)
  if (info.educationLevel) lines.push(`学历：${info.educationLevel}`)
  if (info.workYears) lines.push(`工作年限：${info.workYears}`)
  if (info.currentStatus) lines.push(`当前状态：${info.currentStatus}`)
  if (info.location) lines.push(`所在地：${info.location}`)
  if (info.expectedLocation) lines.push(`期望工作地：${info.expectedLocation}`)
  if (info.expectedSalary) lines.push(`期望薪资：${info.expectedSalary}`)
  if (info.website) lines.push(`个人网站：${info.website}`)
  if (info.github) lines.push(`GitHub：${info.github}`)
  if (info.blog) lines.push(`博客：${info.blog}`)
  return lines.join('\n')
}

function formatEducation(list: EducationEntry[]): string {
  return list
    .map((e) => {
      const parts: string[] = []
      if (e.school) parts.push(`学校：${e.school}`)
      if (e.college) parts.push(`学院：${e.college}`)
      if (e.major) parts.push(`专业：${e.major}`)
      if (e.degree) parts.push(`学位：${e.degree}`)
      if (e.startDate || e.endDate) parts.push(`时间：${e.startDate || ''} ~ ${e.endDate || ''}`)
      if (e.gpa) parts.push(`GPA：${e.gpa}`)
      if (e.description) parts.push(`描述：${stripHtml(e.description)}`)
      return parts.join('\n')
    })
    .join('\n---\n')
}

function formatWork(list: WorkEntry[]): string {
  return list
    .map((w) => {
      const parts: string[] = []
      if (w.company) parts.push(`公司：${w.company}`)
      if (w.department) parts.push(`部门：${w.department}`)
      if (w.position) parts.push(`职位：${w.position}`)
      if (w.startDate || w.endDate) parts.push(`时间：${w.startDate || ''} ~ ${w.endDate || ''}`)
      if (w.description) parts.push(`工作描述：${stripHtml(w.description)}`)
      return parts.join('\n')
    })
    .join('\n---\n')
}

function formatProjects(list: ProjectEntry[]): string {
  return list
    .map((p) => {
      const parts: string[] = []
      if (p.name) parts.push(`项目名称：${p.name}`)
      if (p.role) parts.push(`角色：${p.role}`)
      if (p.startDate || p.endDate) parts.push(`时间：${p.startDate || ''} ~ ${p.endDate || ''}`)
      if (p.link) parts.push(`链接：${p.link}`)
      if (p.introduction) parts.push(`项目介绍：${stripHtml(p.introduction)}`)
      if (p.mainWork) parts.push(`主要工作：${stripHtml(p.mainWork)}`)
      return parts.join('\n')
    })
    .join('\n---\n')
}

function formatAwards(list: AwardEntry[]): string {
  return list
    .map((a) => {
      const parts: string[] = []
      if (a.name) parts.push(`奖项名称：${a.name}`)
      if (a.date) parts.push(`获奖时间：${a.date}`)
      if (a.description) parts.push(`描述：${stripHtml(a.description)}`)
      return parts.join('\n')
    })
    .join('\n---\n')
}

const MODULE_LABELS: Record<string, string> = {
  basicInfo: '基本信息',
  education: '教育经历',
  skills: '专业技能',
  workExperience: '工作经历',
  projectExperience: '项目经历',
  awards: '荣誉奖项',
  selfIntro: '个人简介',
}

const FIELD_LABELS: Record<string, string> = {
  skills: '技能描述',
  selfIntro: '自我介绍',
  description: '描述',
  introduction: '项目介绍',
  mainWork: '主要工作',
}

function getFieldLabel(fieldKey: string): string {
  return FIELD_LABELS[fieldKey] ?? fieldKey
}

function formatEntryMeta(entryMeta?: Record<string, string>): string {
  if (!entryMeta) return '无'
  const lines = Object.entries(entryMeta)
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => `- ${key}：${value.trim()}`)
  return lines.length > 0 ? lines.join('\n') : '无'
}

export interface ModuleData {
  basicInfo: BasicInfo
  educationList: EducationEntry[]
  skills: string
  workList: WorkEntry[]
  projectList: ProjectEntry[]
  awardList: AwardEntry[]
  selfIntro: string
}

export function buildModuleText(moduleKey: string, data: ModuleData): string {
  switch (moduleKey) {
    case 'basicInfo':
      return formatBasicInfo(data.basicInfo)
    case 'education':
      return formatEducation(data.educationList)
    case 'skills':
      return stripHtml(data.skills)
    case 'workExperience':
      return formatWork(data.workList)
    case 'projectExperience':
      return formatProjects(data.projectList)
    case 'awards':
      return formatAwards(data.awardList)
    case 'selfIntro':
      return stripHtml(data.selfIntro)
    default:
      return ''
  }
}

export function getModuleLabel(moduleKey: string): string {
  return MODULE_LABELS[moduleKey] ?? moduleKey
}

// ── 回调类型兼容（保持外部 API 不变） ──

export type AiStreamCallbacks = StreamCallbacks

// ── 优化版本 ──

export type OptimizeVersion = 'A' | 'B' | 'C'

const OPTIMIZE_VERSION_RULES: Record<OptimizeVersion, string> = {
  A: '当前选择的是版本A（标准专业版）。请只输出标准专业版结果，整体表达稳妥、专业、可信，尽量贴近原始经历，不要输出其他版本。',
  B: '当前选择的是版本B（数据驱动版）。请只输出数据驱动版结果，优先补强可量化成果、效率提升、业务影响，不要输出其他版本。',
  C: '当前选择的是版本C（专家架构版）。请只输出专家架构版结果，突出架构设计、复杂系统、技术决策、跨团队协作与业务价值，不要输出其他版本。',
}

export interface OptimizeVersionContent {
  label: string
  content: string
}

function buildFieldOptimizePrompt(
  context: ResumeFieldAiContext,
  version: OptimizeVersion,
  outputRules: string,
): string {
  const versionRule = OPTIMIZE_VERSION_RULES[version]
  return `请优化我简历中的字段内容。

当前模块：${context.moduleLabel}
当前字段：${context.fieldLabel || getFieldLabel(context.fieldKey)}
字段标识：${context.fieldKey}
${context.entryTitle ? `当前条目：${context.entryTitle}
` : ''}${context.targetJob ? `目标岗位：${context.targetJob}
` : ''}
当前选择的优化版本：版本${version}
${versionRule}

条目补充信息：
${formatEntryMeta(context.entryMeta)}

当前字段内容：
${stripHtml(context.currentText)}

请严格遵守以下输出要求：
1. 只输出当前选择版本对应的结果，不要输出版本A/B/C的并列候选。
2. 输出结构保持为"优化建议"和"优化后内容"两个部分。
3. 优化后内容必须只针对当前字段本身，不要改写其他模块信息。
4. 不要添加与当前版本无关的额外说明。
${outputRules}`
}

export async function optimizeField(
  config: AiConfig,
  context: ResumeFieldAiContext,
  version: OptimizeVersion,
  callbacks: AiStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const currentText = stripHtml(context.currentText)
  if (!currentText.trim()) {
    callbacks.onError(`「${context.fieldLabel || getFieldLabel(context.fieldKey)}」内容为空，请先填写内容后再优化。`)
    return
  }

  const outputRules = getModuleOutputRules(context.moduleKey)
  const userMessage = buildFieldOptimizePrompt(context, version, outputRules)

  await streamWithCallbacks(config, SYSTEM_PROMPT, userMessage, callbacks, signal)
}

export async function optimizeModule(
  config: AiConfig,
  moduleKey: string,
  version: OptimizeVersion,
  moduleData: ModuleData,
  callbacks: AiStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const moduleText = buildModuleText(moduleKey, moduleData)
  const label = getModuleLabel(moduleKey)

  if (!moduleText.trim()) {
    callbacks.onError(`「${label}」模块内容为空，请先填写内容后再优化。`)
    return
  }

  const outputRules = getModuleOutputRules(moduleKey, {
    projectNames: moduleData.projectList.map((p) => p.name.trim()).filter(Boolean),
    workCompanyNames: moduleData.workList.map((w) => w.company.trim()).filter(Boolean),
  })
  const versionRule = OPTIMIZE_VERSION_RULES[version]
  const userMessage = `请优化我简历中的「${label}」模块。

当前选择的优化版本：版本${version}
${versionRule}

以下是当前内容：
${moduleText}

请严格遵守以下输出要求：
1. 只输出当前选择版本对应的结果，不要输出版本A/B/C的并列候选。
2. 输出结构保持为"优化建议"和"优化后内容"两个部分。
3. 不要添加与当前版本无关的额外说明。
${outputRules}`

  await streamWithCallbacks(config, SYSTEM_PROMPT, userMessage, callbacks, signal)
}

// ── AI 响应解析 ──

export interface VersionContent {
  label: string
  content: string
}

export interface ParsedAiResponse {
  suggestions: string
  optimizedContent: string
  versions: VersionContent[]
}

type ParsedSectionKey = 'suggestions' | 'optimizedContent' | 'versionA' | 'versionB' | 'versionC'

function normalizeSectionLabel(rawLabel: string): ParsedSectionKey | null {
  const normalized = rawLabel
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')

  if (normalized === '优化建议' || normalized === 'suggestion' || normalized === 'suggestions') {
    return 'suggestions'
  }
  if (
    normalized === '优化后内容'
    || normalized === '优化后的内容'
    || normalized === 'optimizedcontent'
  ) {
    return 'optimizedContent'
  }
  // 三版本标题识别
  if (normalized.includes('版本a') || normalized.includes('标准专业') || normalized.includes('versiona')) {
    return 'versionA'
  }
  if (normalized.includes('版本b') || normalized.includes('数据驱动') || normalized.includes('versionb')) {
    return 'versionB'
  }
  if (normalized.includes('版本c') || normalized.includes('专家架构') || normalized.includes('versionc')) {
    return 'versionC'
  }
  return null
}

function parseSectionHeadingLine(line: string): { key: ParsedSectionKey; inlineContent: string } | null {
  const match = line.match(
    /^(?:#{1,6}\s*)?(?:\*\*)?\s*(优化建议|Suggestions?|优化后内容|优化后的内容|Optimized Content|版本[A-C][：:\s\S]*?|[Vv]ersion\s*[A-C][：:\s\S]*?)\s*(?:\*\*)?\s*(?:[：:]\s*(.*))?$/i,
  )
  if (!match) return null
  const key = normalizeSectionLabel(match[1] ?? '')
  if (!key) return null
  return {
    key,
    inlineContent: (match[2] ?? '').trim(),
  }
}

export function parseAiResponse(text: string): ParsedAiResponse {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return { suggestions: '', optimizedContent: '', versions: [] }
  }

  const lines = normalized.split('\n')
  const sections: Record<ParsedSectionKey, string[]> = {
    suggestions: [],
    optimizedContent: [],
    versionA: [],
    versionB: [],
    versionC: [],
  }

  let currentSection: ParsedSectionKey | null = null

  for (const line of lines) {
    const heading = parseSectionHeadingLine(line.trim())
    if (heading) {
      currentSection = heading.key
      if (heading.inlineContent) {
        sections[currentSection].push(heading.inlineContent)
      }
      continue
    }

    if (currentSection) {
      sections[currentSection].push(line)
    }
  }

  const suggestions = sections.suggestions.join('\n').trim()
  const optimizedContent = sections.optimizedContent.join('\n').trim()

  // 构建三版本数组
  const versionMap: { key: ParsedSectionKey; label: string }[] = [
    { key: 'versionA', label: '标准专业版' },
    { key: 'versionB', label: '数据驱动版' },
    { key: 'versionC', label: '专家架构版' },
  ]
  const versions: VersionContent[] = []
  for (const { key, label } of versionMap) {
    const content = sections[key].join('\n').trim()
    if (content) {
      versions.push({ label, content })
    }
  }

  // 向后兼容：无版本标题时走旧逻辑
  if (versions.length === 0 && !optimizedContent) {
    return {
      suggestions: '',
      optimizedContent: normalized,
      versions: [],
    }
  }

  // 兼容旧格式：如果没有版本但有 optimizedContent，将其作为 versions[0]
  const finalOptimized = versions.length > 0 ? (versions[0]?.content ?? '') : optimizedContent

  return {
    suggestions,
    optimizedContent: finalOptimized,
    versions,
  }
}
