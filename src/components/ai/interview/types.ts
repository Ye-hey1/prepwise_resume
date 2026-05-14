import type { InterviewMode, InterviewTurnScore } from '@/services/interviewService'
import type { JdPrepModuleKey } from '@/services/types/jd'

export type InterviewWorkflowPhase = 'analysis' | 'simulation' | 'training'

export interface InterviewPrepStoryItem {
  title: string
  reason: string
  moduleKey: JdPrepModuleKey
  talkingPoints: string[]
}

export interface InterviewRiskQuestionItem {
  question: string
  riskReason: string
  suggestion: string
  moduleKey: JdPrepModuleKey
}

export interface InterviewJdContext {
  jdText: string
  summary: string
  targetRole: string
  seniority: string
  mustHaveSkills: string[]
  focusAreas: string[]
  resumeGaps: string[]
  highlightedProjects: string[]
  prepSummary: string
  prepPriorities: string[]
  recommendedStories: InterviewPrepStoryItem[]
  highRiskFollowUps: InterviewRiskQuestionItem[]
  companyCulture?: string
  interviewStyle?: string
  /** 目标公司已知技术栈 */
  techStack?: string[]
  /** 目标公司竞品列表 */
  competitors?: string[]
  /** 推荐反问面试官的问题 */
  reverseQuestions?: string[]
  /** 公司核心业务 */
  companyBusinessScope?: string
  /** 公司产品线 */
  companyProducts?: string[]
  /** 面试流程 */
  interviewProcess?: string
  /** 高频考点 */
  frequentTopics?: string[]
  /** 面试策略建议 */
  howToReference?: string
}

export type InterviewerStyle = 'balanced' | 'gentle' | 'pressure' | 'technical' | 'business'

export interface InterviewPrepConfig {
  mode: InterviewMode
  durationMinutes: number
  hintLimit: number
  difficulty: 'junior' | 'mid' | 'senior'
  focusAreas: string[]
  customNote: string
  /** 选中的面试官模型 ID */
  interviewerModelId: string
  /** 选中的候选人模型 ID */
  candidateModelId: string
  /** TTS 音色 ID（如 male-qn-qingse） */
  voice?: string
  /** 面试官风格 */
  interviewerStyle?: InterviewerStyle
  /** 追问深度 1-3 */
  followUpDepth?: number
}

export interface ScoreBreakdown {
  projectScore: number
  skillScore: number
  workScore: number
  educationScore: number
  totalScore: number
  passed: boolean
}

export interface InterviewReviewData {
  summary: string
  strengths: string[]
  weaknesses: string[]
  followUps: string[]
  suggestedResumeModules: string[]
  scoreBreakdown: ScoreBreakdown | null
  chatHistory: ChatMessage[]
}

export interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  score: InterviewTurnScore | null
}

export interface InterviewSessionRecord {
  id: string
  date: string
  mode: InterviewMode
  durationMinutes: number
  totalRounds: number
  totalScore: number | null
  passed: boolean | null
  targetRole: string
  summary: string
  analysisId?: string
  source?: 'jd-analysis' | 'standalone'
  companyOrRoleSummary?: string
  reviewData?: InterviewReviewData
}

export interface DrillQuestion {
  id: number
  question: string
  category: string
  focusArea: string
  difficulty: number
  /** 考察意图 */
  intent?: string
  /** 答题框架建议，例如 STAR / PREP */
  framework?: string
  /** 核心思考点列表 */
  thinkingPoints?: string[]
  /** 专家级参考答案示例 */
  sampleAnswer?: string
  /** 为兼容旧数据保留 */
  referenceAnswer?: string
}

export interface DrillAnswer {
  questionId: number
  answer: string
}
