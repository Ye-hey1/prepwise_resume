import type { JdContextState, RoleFamily } from './types'

export interface RubricItem {
  key: string
  label: string
  max: number
}

export const TECHNICAL_RUBRIC: RubricItem[] = [
  { key: 'project_complexity', label: '项目复杂度与真实影响', max: 30 },
  { key: 'production_experience', label: '生产/实习/工作经验', max: 25 },
  { key: 'technical_alignment', label: '技术技能与岗位一致性', max: 20 },
  { key: 'verifiable_work', label: '作品链接与可验证材料', max: 10 },
  { key: 'writing_quality', label: '表达质量与量化成果', max: 15 },
]

export const GENERAL_RUBRIC: RubricItem[] = [
  { key: 'role_relevance', label: '岗位相关经历', max: 30 },
  { key: 'outcome_evidence', label: '成果证据与量化表达', max: 25 },
  { key: 'capability_structure', label: '能力结构完整度', max: 20 },
  { key: 'professional_clarity', label: '清晰度与专业表达', max: 15 },
  { key: 'credibility_risk', label: '风险项与可信度', max: 10 },
]

export const JD_FIT_RUBRIC: RubricItem[] = [
  { key: 'required_coverage', label: '硬性要求覆盖', max: 35 },
  { key: 'preferred_coverage', label: '加分要求覆盖', max: 20 },
  { key: 'resume_evidence_strength', label: '简历证据强度', max: 20 },
  { key: 'risk_gaps', label: '风险缺口与硬伤', max: 15 },
  { key: 'target_positioning', label: '岗位定位与关键词一致性', max: 10 },
]

const TECHNICAL_KEYWORDS = [
  'frontend',
  'front-end',
  '前端',
  'backend',
  'back-end',
  '后端',
  '全栈',
  'full stack',
  'algorithm',
  '算法',
  'ai',
  '人工智能',
  '机器学习',
  '深度学习',
  'data',
  '数据',
  '测试',
  'qa',
  'devops',
  'sre',
  'engineer',
  'developer',
  'software',
  '工程师',
  'java',
  'python',
  'go',
  'golang',
  'c++',
  'cloud',
  '云',
  '平台',
  '架构',
]

function isChineseKeyword(keyword: string): boolean {
  return /[\u4e00-\u9fff]/.test(keyword)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isLatinKeywordMatch(text: string, keyword: string): boolean {
  const pattern = keyword.trim().split(/\s+/).map(escapeRegExp).join('\\s+')
  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(text)
}

function isTechnicalKeywordMatch(text: string, keyword: string): boolean {
  const normalizedKeyword = keyword.toLowerCase()
  return isChineseKeyword(normalizedKeyword)
    ? text.includes(normalizedKeyword)
    : isLatinKeywordMatch(text, normalizedKeyword)
}

export function detectRoleFamily(input: {
  jobTitle?: string
  jdPosition?: string
  techStack?: string[]
}): RoleFamily {
  const text = [input.jobTitle, input.jdPosition, ...(input.techStack ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return TECHNICAL_KEYWORDS.some((keyword) => isTechnicalKeywordMatch(text, keyword))
    ? 'technical'
    : 'general'
}

export function detectJdContextState(input: {
  jdText?: string
  jdData?: unknown
  matchResult?: unknown
}): JdContextState {
  if (input.jdData && input.matchResult) return 'completed'
  if (input.jdText?.trim()) return 'raw'
  return 'none'
}

export function getRoleRubric(roleFamily: RoleFamily): RubricItem[] {
  return roleFamily === 'technical' ? TECHNICAL_RUBRIC : GENERAL_RUBRIC
}
