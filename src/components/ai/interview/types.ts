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
  /** coaching 模式自动对话速度 */
  coachingSpeed?: 'fast' | 'normal' | 'slow'
  /** coaching 模式面试轮次选择 */
  coachingStage?: CoachingStageType | 'full'
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

// ═══ Coaching 模式（观摩学习）类型 ═══

/** 面试轮次类型 */
export type CoachingStageType = 'hr' | 'tech-1' | 'tech-2' | 'final'

/** 每轮的配置 */
export interface CoachingStageConfig {
  type: CoachingStageType
  label: string
  interviewerRole: string
  focusDimensions: string[]
  answerStrategy: string
  roundCount: number
}

/** 全部轮次配置 */
export const COACHING_STAGES: CoachingStageConfig[] = [
  {
    type: 'hr',
    label: 'HR 初面',
    interviewerRole: 'HR 招聘经理',
    focusDimensions: ['求职动机', '稳定性', '沟通表达', '岗位匹配度', '薪资预期', '职业规划'],
    answerStrategy: '真诚务实、不夸大经历，突出自驱力和协作能力，不聊技术深度',
    roundCount: 6,
  },
  {
    type: 'tech-1',
    label: '技术一面',
    interviewerRole: '资深业务负责人 / 高级同岗位面试官',
    focusDimensions: ['专业基础认知', '需求拆解能力', '项目基础复盘', '工具与方法论', '场景落地思路'],
    answerStrategy: '用 STAR 法则答题，绑定简历项目，讲清背景→需求→方案→成果',
    roundCount: 7,
  },
  {
    type: 'tech-2',
    label: '技术二面',
    interviewerRole: '技术负责人 / 部门总监',
    focusDimensions: ['方案架构深度', '项目难点与踩坑复盘', '数据指标体系', '资源协调与冲突', '商业化思维'],
    answerStrategy: '深挖细节、讲取舍和复盘，敢于说不足和优化方向，体现专业深度',
    roundCount: 7,
  },
  {
    type: 'final',
    label: '终面',
    interviewerRole: '业务总监 / VP / 老板',
    focusDimensions: ['行业格局认知', '价值观匹配', '长期规划', '抗压能力', '全局思维', '团队契合度'],
    answerStrategy: '跳出执行细节，拔高格局，多讲行业认知和能为公司解决什么问题',
    roundCount: 6,
  },
]

/** Coaching 模式下的消息角色 */
export type CoachingRole = 'interviewer' | 'candidate' | 'coach'

/** Coaching 模式下的单条消息 */
export interface CoachingMessage {
  id: string
  role: CoachingRole
  content: string
  /** coach 角色专属：使用的技巧标签 */
  techniques?: string[]
  /** coach 角色专属：本轮亮点评分 1-5 */
  scoreHighlight?: number
}

/** AI 单次返回的 coaching 轮次结构 */
export interface CoachingTurnResponse {
  /** 面试官本轮提问 */
  interviewerQuestion: string
  /** 候选人本轮回答 */
  candidateAnswer: string
  /** 教练点评 */
  coachComment: string
  /** 技巧标签 */
  techniques: string[]
  /** 当前阶段 */
  phase: string
  /** 第几轮 */
  roundIndex: number
  /** 是否结束 */
  isFinished: boolean
  /** 结束时的总结 */
  finalSummary?: string
  /** 技巧总结清单（结束时） */
  techniqueSummary?: Array<{ technique: string; description: string; example: string }>
}

// ═══ 观摩记录（Coaching Record）═══

/** 观摩学习中每轮的完整数据 */
export interface CoachingRoundRecord {
  /** 面试官问题 */
  question: string
  /** 候选人参考答案 */
  referenceAnswer: string
  /** 技巧标签 */
  techniques: string[]
  /** 教练点评 */
  coachComment: string
}

/** 一次完整的观摩学习记录 */
export interface CoachingRecord {
  id: string
  date: string
  targetRole: string
  totalRounds: number
  rounds: CoachingRoundRecord[]
  techniqueSummary: Array<{ technique: string; description: string; example: string }>
  finalSummary: string
}

