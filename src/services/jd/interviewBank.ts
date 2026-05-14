/**
 * JD 面试题库生成服务
 * 独立于核心适配分析，支持连续生成题库和深度追问
 */
import type { StreamCallbacks, JDData, JDMatchResult, CompanyIntelData } from '../types/jd'
import type { AiConfig } from '../stream'
import { streamAIRequest, cleanJsonResponse, safeJsonStringify } from '../stream'
import {
  JD_INTERVIEW_LIST_ONLY_SYSTEM_PROMPT,
  JD_INTERVIEW_INSIGHT_ONLY_SYSTEM_PROMPT,
  JD_INTERVIEW_INSIGHT_USER_TEMPLATE,
  JD_INTERVIEW_FOLLOWUP_SYSTEM_PROMPT,
  JD_INTERVIEW_FOLLOWUP_USER_TEMPLATE,
} from '../prompts/jdInterviewBankPrompt'
import { formatJDRequirements } from './promptBuilder'

// ── 类型定义 ──

export interface InterviewQuestion {
  id: string
  category: string
  difficulty: string
  question: string
  context: string
  answerStructure: string
  sampleAnswer: string
  keyPoints: string[]
  pitfalls: string[]
  followUpHints: string[]
  /** 追问列表（后续追加） */
  followUps?: FollowUpQuestion[]
}

export interface FollowUpQuestion {
  id: string
  depth: number
  question: string
  intent: string
  sampleAnswer: string
  keyPoints: string[]
  deeperFollowUp: string
}

export interface InterviewBankBatch {
  questions: InterviewQuestion[]
  batchSummary: string
}

// ── 阶段一：题库生成 ──

export async function generateInterviewBank(
  config: AiConfig,
  jdData: JDData,
  resumeText: string,
  matchResult: JDMatchResult | null,
  previousQuestions: string[],
  focusAreas: string[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  companyIntel?: CompanyIntelData | null,
): Promise<InterviewBankBatch> {
  const jdRequirements = formatJDRequirements(jdData)
  const companyIntelHint = companyIntel
    ? `\n${companyIntel.companyName}，主要业务：${companyIntel.businessScope}，技术栈：${companyIntel.techStack.join('、')}，工程文化：${companyIntel.cultureNotes}，面试切入点：${companyIntel.howToReference || '暂无'}`
    : ''

  // 第一阶段：极速生成题目列表
  const segments = [
    { type: '核心技术与原理', focus: '硬技能与底层原理' },
    { type: '实战经验挖掘', focus: '简历项目深度实现' },
    { type: '架构逻辑与综合场景', focus: '系统设计与复杂场景' },
  ]

  const executeSegment = async (seg: typeof segments[0]): Promise<InterviewQuestion[]> => {
    const userMessage = `请针对以下上下文生成 2 道【${seg.type}】类别的面试题。
重点：${seg.focus}
岗位要求：${jdRequirements.slice(0, 1000)}
候选人简历：${resumeText.slice(0, 1500)}
用户偏好：${focusAreas.join('、')}${companyIntelHint}
规避题目：${previousQuestions.slice(-5).join('|')}

输出要求：仅返回 JSON 数组 [ { "category": "${seg.type}", "difficulty": "中级/高级", "question": "题目文本" } ]`

    try {
      // 使用 LIST_ONLY 提示词，极大减少 AI 负担
      const fullText = await streamAIRequest(config, JD_INTERVIEW_LIST_ONLY_SYSTEM_PROMPT, userMessage, { onChunk: () => {} }, signal)
      const cleaned = cleanJsonResponse(fullText)
      const parsed = JSON.parse(cleaned)
      const questions = Array.isArray(parsed) ? parsed : (parsed.questions || [])
      
      const normalized = questions.map((q: any, i: number) => ({
        id: `q-${Date.now()}-${seg.type}-${i}`,
        category: String(q.category || seg.type),
        difficulty: String(q.difficulty || '中级'),
        question: String(q.question || ''),
        context: '', // 初始为空，按需生成
        answerStructure: '',
        sampleAnswer: '',
        keyPoints: [],
        pitfalls: [],
        followUpHints: [],
      }))
      
      if (normalized.length > 0) {
        callbacks.onChunk?.(JSON.stringify({ questions: normalized }))
      }
      return normalized
    } catch {
      return []
    }
  }

  try {
    const results = await Promise.all(segments.map(seg => executeSegment(seg)))
    const allQuestions = results.flat()
    
    if (allQuestions.length === 0) throw new Error('AI 命题失败，请重试。')

    return {
      questions: allQuestions,
      batchSummary: `已为您定制 ${allQuestions.length} 项深度对标测试方案。`
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err
    throw err
  }
}

/**
 * 阶段二：按需生成题目基础解析 (Insight - 不含超长答案)
 */
export async function generateQuestionInsightBase(
  config: AiConfig,
  question: string,
  jdData: JDData,
  resumeText: string,
  signal?: AbortSignal,
): Promise<Partial<InterviewQuestion>> {
  const jdRequirements = formatJDRequirements(jdData)
  const userMessage = `${JD_INTERVIEW_INSIGHT_USER_TEMPLATE
    .replace('{question}', question)
    .replace('{jdRequirements}', jdRequirements.slice(0, 1000))
    .replace('{resumeText}', resumeText.slice(0, 1200))}
    
    注意：此步骤严禁输出 sampleAnswer 字段，请保持该字段为空。`

  try {
    const fullText = await streamAIRequest(config, JD_INTERVIEW_INSIGHT_ONLY_SYSTEM_PROMPT, userMessage, { onChunk: () => {} }, signal)
    const cleaned = cleanJsonResponse(fullText)
    const parsed = JSON.parse(cleaned)
    
    return {
      context: String(parsed.context || ''),
      answerStructure: String(parsed.answerStructure || ''),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [],
      pitfalls: Array.isArray(parsed.pitfalls) ? parsed.pitfalls.map(String) : [],
      followUpHints: Array.isArray(parsed.followUpHints) ? parsed.followUpHints.map(String) : [],
    }
  } catch (err) {
    console.error('Failed to generate base insight:', err)
    return {}
  }
}

/**
 * 阶段三：手动触发生成完整的专家参考回答 (Full Answer)
 */
export async function generateQuestionSampleAnswer(
  config: AiConfig,
  question: string,
  jdData: JDData,
  resumeText: string,
  signal?: AbortSignal,
): Promise<string> {
  const jdRequirements = formatJDRequirements(jdData)
  const userMessage = `请针对以下面试题目，结合上下文生成一份 300 字以上、专业且具有 STAR 原则的专家级参考回答。
  题目：${question}
  岗位：${jdRequirements.slice(0, 800)}
  候选人：${resumeText.slice(0, 1000)}
  
  输出格式：直接返回纯文本回答，禁止任何 JSON 或 Markdown 标记。`

  try {
    const fullText = await streamAIRequest(config, '你是一位资深面试官。你的任务是提供最专业的参考答案。', userMessage, { onChunk: () => {} }, signal)
    return fullText.trim()
  } catch (err) {
    console.error('Failed to generate sample answer:', err)
    throw new Error('获取参考回答失败')
  }
}

// ── 深度追问生成 ──

export async function generateFollowUpQuestions(
  config: AiConfig,
  originalQuestion: string,
  originalAnswer: string,
  jdData: JDData,
  resumeText: string,
  previousFollowUps: string[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<FollowUpQuestion[]> {
  const jdRequirements = formatJDRequirements(jdData)
  const userMessage = JD_INTERVIEW_FOLLOWUP_USER_TEMPLATE
    .replace('{originalQuestion}', originalQuestion)
    .replace('{originalAnswer}', originalAnswer)
    .replace('{jdRequirements}', jdRequirements)
    .replace('{resumeText}', resumeText)
    .replace('{previousFollowUps}', previousFollowUps.length > 0 ? previousFollowUps.join('\n') : '暂无已有追问')

  const fullText = await streamAIRequest(config, JD_INTERVIEW_FOLLOWUP_SYSTEM_PROMPT, userMessage, callbacks, signal)

  const cleaned = cleanJsonResponse(fullText)
  try {
    const parsed = JSON.parse(cleaned)
    return normalizeFollowUps(parsed)
  } catch {
    throw new Error('AI 返回的追问数据格式异常，请重试。')
  }
}

// ── 数据规范化 ──

export function normalizeBankBatch(raw: any): InterviewBankBatch {
  const questions: InterviewQuestion[] = (raw.questions || []).map((q: any, i: number) => ({
    id: q.id || `q-${Date.now()}-${i}`,
    category: String(q.category || '技术原理'),
    difficulty: String(q.difficulty || '中级'),
    question: String(q.question || ''),
    context: String(q.context || ''),
    answerStructure: String(q.answerStructure || ''),
    sampleAnswer: String(q.sampleAnswer || ''),
    keyPoints: Array.isArray(q.keyPoints) ? q.keyPoints.map(String) : [],
    pitfalls: Array.isArray(q.pitfalls) ? q.pitfalls.map(String) : [],
    followUpHints: Array.isArray(q.followUpHints) ? q.followUpHints.map(String) : [],
    followUps: [],
  }))

  return {
    questions,
    batchSummary: String(raw.batchSummary || ''),
  }
}

export function normalizeFollowUps(raw: any): FollowUpQuestion[] {
  const list = Array.isArray(raw) ? raw : (raw.followUps || [])
  return list.map((fu: any, i: number) => ({
    id: fu.id || `fu-${Date.now()}-${i}`,
    depth: Number(fu.depth) || 1,
    question: String(fu.question || ''),
    intent: String(fu.intent || ''),
    sampleAnswer: String(fu.sampleAnswer || ''),
    keyPoints: Array.isArray(fu.keyPoints) ? fu.keyPoints.map(String) : [],
    deeperFollowUp: String(fu.deeperFollowUp || ''),
  }))
}
