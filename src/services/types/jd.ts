/**
 * JD 分析相关类型定义
 */

// ── JD 提取结果 ──

export interface JDBasicInfo {
  jobTitle: string
  company: string
  location: string
  jobType: string
  department: string
}

/**
 * JD 需求条目 — 带权重标签
 * - required: 必须具备（硬性门槛）
 * - preferred: 强烈期望（显著加分）
 * - bonus: 锦上添花（有更好）
 */
export type JDWeight = 'required' | 'preferred' | 'bonus'

export interface JDRequirementItem {
  text: string
  weight: JDWeight
}

export interface JDRequirements {
  degree: string
  experience: string
  techStack: string[]
  mustHave: JDRequirementItem[]
  niceToHave: JDRequirementItem[]
  jobDuties: string[]
}

export interface JDData {
  basicInfo: JDBasicInfo
  requirements: JDRequirements
}

// ── JD-简历匹配结果 ──

export type RequirementCategory = 'mustHave' | 'niceToHave' | 'degree' | 'experience' | 'techStack' | 'jobDuties'
export type RequirementStatus = 'matched' | 'partial' | 'missing'
export type InsightPriority = 'high' | 'medium' | 'low'

export interface RequirementMatch {
  requirement: string
  category: RequirementCategory
  status: RequirementStatus
  evidence: string
  suggestion: string
  evidenceList?: string[]
  riskGaps?: string[]
  matchReason?: string
  priority?: InsightPriority
}

export interface MatchScore {
  total: number
  mustHave: number
  niceToHave: number
  techStack: number
  experience: number
  degree: number
  jobDuties: number
}

export interface JDMatchResult {
  score: MatchScore
  matches: RequirementMatch[]
  summary: string
  gaps: string[]
  strengths: string[]
}

// ── 简历全局诊断 ──

export interface RoleFit {
  role: string
  fit: 'high' | 'medium' | 'low'
  reason: string
}

export interface ResumeOverview {
  headline: string
  highlights: string[]
  risks: string[]
  roleFit: RoleFit[]
}

// ── JD 岗位备面洞察 ──

export type JdPrepModuleKey = 'basicInfo' | 'education' | 'skills' | 'workExperience' | 'projectExperience' | 'awards' | 'selfIntro'

export interface JdRecommendedStory {
  title: string
  reason: string
  moduleKey: JdPrepModuleKey
  talkingPoints: string[]
}

export interface JdHighRiskFollowUp {
  question: string
  riskReason: string
  suggestion: string
  moduleKey: JdPrepModuleKey
}

export interface JdLikelyQuestionGroup {
  title: string
  intent: string
  questions: string[]
}

export interface JdPrepInsight {
  summary: string
  focusAreas: string[]
  recommendedStories: JdRecommendedStory[]
  highRiskFollowUps: JdHighRiskFollowUp[]
  prepPriorities: string[]
  likelyQuestionGroups: JdLikelyQuestionGroup[]
}

// ── JD 定向优化建议 ──

export interface JDSuggestion {
  section: string
  issueType: string
  originalText: string
  suggestedText: string
  priority: 'high' | 'medium' | 'low'
  reason: string
}

// ── 公司情报（Tavily 搜索 + LLM 提取） ──

export interface CompanyIntelSourceDetail {
  title: string
  url: string
  providerLabel: string
  publishedAt: string
  fetchedAt: string
}

export interface CompanyIntelData {
  /** 公司名称 */
  companyName: string
  /** 公司发展历程 */
  companyHistory: string
  /** 核心业务与产品范围 */
  businessScope: string
  /** 组织结构或团队信息 */
  orgStructure: string
  /** 基于事实提炼的面试切入点 */
  howToReference: string
  /** 公开资料可见的技术栈 */
  techStack: string[]
  /** 工程文化或工作方式 */
  cultureNotes: string
  /** 公开资料中提到的竞品 */
  competitors: string[]
  /** 基于事实整理的推荐反问 */
  reverseQuestions: string[]
  /** 来源 URL 列表，保留兼容旧逻辑 */
  sources: string[]
  /** 结构化来源明细 */
  sourceDetails: CompanyIntelSourceDetail[]
  /** 本次情报抓取时间 */
  fetchedAt: string
  /** 公司规模 */
  companySize?: string
  /** 融资阶段 */
  fundingStage?: string
  /** 成立时间 */
  foundedYear?: string
  /** 所属行业 */
  industry?: string
  /** 核心产品线 */
  products?: string[]
  /** 近期动态 */
  recentNews?: string[]
  /** 面试流程描述 */
  interviewProcess?: string
  /** 面试风格 */
  interviewStyle?: string
  /** 高频考点 */
  frequentTopics?: string[]
  /** 员工评价摘要 */
  employeeReviews?: string
  /** 工作节奏 */
  workPace?: string
}

// ?? ???????????? ??

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onDone: (fullText: string) => void
  onError: (msg: string) => void
}
