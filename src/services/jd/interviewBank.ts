/**
 * JD 面试题库生成服务
 * 独立于核心适配分析，支持连续生成题库和深度追问
 */
import type { StreamCallbacks, JDData, JDMatchResult, CompanyIntelData } from '../types/jd'
import type { AiConfig } from '../stream'
import { streamAIRequest } from '../stream'
import { runJsonTask, type AiTaskIssue } from '../aiTaskRuntime'
import {
  JD_INTERVIEW_LIST_ONLY_SYSTEM_PROMPT,
  JD_INTERVIEW_INSIGHT_ONLY_SYSTEM_PROMPT,
  JD_INTERVIEW_INSIGHT_USER_TEMPLATE,
  JD_INTERVIEW_FOLLOWUP_SYSTEM_PROMPT,
  JD_INTERVIEW_FOLLOWUP_USER_TEMPLATE,
} from '../prompts/jdInterviewBankPrompt'
import { formatJDRequirements } from './promptBuilder'
import { buildJdAnalysisArtifacts, type CandidateFitCoverage } from './artifacts'
import { buildCurrentDateContextPrompt, isStaleFutureDateRiskText } from '@/utils/currentDateContext'

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
  anchors?: InterviewQuestionAnchor[]
  /** 追问列表（后续追加） */
  followUps?: FollowUpQuestion[]
}

export interface InterviewQuestionAnchor {
  requirementId: string
  requirement: string
  resumeEvidence: string
  rubricDimension: 'technical' | 'project' | 'experience' | 'behavior' | 'culture'
  riskLevel: 'low' | 'medium' | 'high'
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

const JD_INTERVIEW_LIST_SCHEMA_HINT = `[
  {
    "category": string,
    "difficulty": "中级|高级",
    "question": string
  }
]`

const JD_INTERVIEW_INSIGHT_SCHEMA_HINT = `{
  "context": string,
  "answerStructure": string,
  "keyPoints": string[],
  "pitfalls": string[],
  "followUpHints": string[]
}`

const JD_INTERVIEW_FOLLOWUP_SCHEMA_HINT = `[
  {
    "id": string,
    "depth": number,
    "question": string,
    "intent": string,
    "sampleAnswer": string,
    "keyPoints": string[],
    "deeperFollowUp": string
  }
]`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map(String).map(item => item.trim()).filter(Boolean)
    : []
}

function normalizeQuestionSeedList(raw: unknown, categoryFallback: string): InterviewQuestion[] {
  const source = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.questions)
      ? raw.questions
      : []

  return source
    .map((item, index): InterviewQuestion | null => {
      const entry = isRecord(item) ? item : {}
      const question = String(entry.question ?? '').trim()
      if (!question) return null

      return {
        id: `q-${Date.now()}-${categoryFallback}-${index}`,
        category: String(entry.category ?? categoryFallback),
        difficulty: String(entry.difficulty ?? '中级'),
        question,
        context: '',
        answerStructure: '',
        sampleAnswer: '',
        keyPoints: [],
        pitfalls: [],
        followUpHints: [],
      }
    })
    .filter((item): item is InterviewQuestion => Boolean(item))
    .filter(item => !isStaleFutureDateRiskText(item.question))
}

function validateQuestionList(result: InterviewQuestion[]): AiTaskIssue[] {
  return result.length > 0
    ? []
    : [{
        path: '$',
        message: '题库分片没有返回可用题目',
        severity: 'error',
      }]
}

function normalizeQuestionInsight(raw: unknown): Partial<InterviewQuestion> {
  const source = isRecord(raw) ? raw : {}
  return {
    context: String(source.context ?? '').trim(),
    answerStructure: String(source.answerStructure ?? '').trim(),
    keyPoints: normalizeStringList(source.keyPoints),
    pitfalls: normalizeStringList(source.pitfalls),
    followUpHints: normalizeStringList(source.followUpHints).filter(item => !isStaleFutureDateRiskText(item)),
  }
}

function validateQuestionInsight(result: Partial<InterviewQuestion>): AiTaskIssue[] {
  if (result.context || result.answerStructure || result.keyPoints?.length) return []
  return [{
    path: '$',
    message: '题目解析缺少考察背景、答题结构和要点',
    severity: 'error',
  }]
}

function validateFollowUps(result: FollowUpQuestion[]): AiTaskIssue[] {
  return result.length > 0
    ? []
    : [{
        path: '$',
        message: '深度追问列表为空',
        severity: 'error',
      }]
}

export function normalizeSampleAnswerText(raw: string): string {
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/```(?:\w+)?/g, '')
    .replace(/```/g, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/^[ \t]*#{1,6}\s*/gm, '')
    .replace(/^[ \t]*>\s?/gm, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^[ \t]*[-*]\s+/gm, '')
    .replace(/^[ \t]*[STARS]\s*[（(][^）)]*[）)]\s*[:：]\s*/gmi, '')
    .replace(/^[ \t]*(?:Situation|Task|Action|Result)\s*[:：]\s*/gmi, '')
    .replace(/^[ \t]*\d+[.、)]\s*/gm, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([，。；：、！？])/g, '$1')
    .replace(/([（(])\s+/g, '$1')
    .replace(/\s+([）)])/g, '$1')
    .replace(/([。！？；])\s+(?=[，。！？；])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return text
}

function normalizeForAnchor(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

function inferRubricDimension(category: string): InterviewQuestionAnchor['rubricDimension'] {
  if (/技术|原理|架构|系统|技能/.test(category)) return 'technical'
  if (/项目|实战|经验|深挖/.test(category)) return 'project'
  if (/经历|背景|工作/.test(category)) return 'experience'
  if (/场景|协作|综合|潜力|行为/.test(category)) return 'behavior'
  return 'culture'
}

function anchorRiskLevel(coverage: CandidateFitCoverage): InterviewQuestionAnchor['riskLevel'] {
  if (coverage.priority === 'high' && coverage.status !== 'matched') return 'high'
  if (coverage.riskGaps.length > 0 || coverage.status === 'partial') return 'medium'
  return 'low'
}

function createQuestionAnchors(
  question: Pick<InterviewQuestion, 'category' | 'question'>,
  coverage: CandidateFitCoverage[],
): InterviewQuestionAnchor[] {
  const haystack = normalizeForAnchor(`${question.category}${question.question}`)
  const scored = coverage
    .map((item) => {
      const requirementKey = normalizeForAnchor(item.requirement)
      const evidenceKey = normalizeForAnchor(`${item.evidence}${item.evidenceList.join('')}`)
      let score = 0
      if (requirementKey && haystack.includes(requirementKey.slice(0, Math.min(12, requirementKey.length)))) score += 6
      if (evidenceKey && haystack.includes(evidenceKey.slice(0, Math.min(10, evidenceKey.length)))) score += 3
      if (item.priority === 'high') score += 2
      if (item.status !== 'matched') score += 2
      if (item.riskGaps.length) score += 1
      return { item, score }
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const selected = scored.length
    ? scored.slice(0, 2).map(entry => entry.item)
    : coverage
      .filter(item => item.priority === 'high' || item.status !== 'matched')
      .slice(0, 2)

  return selected.map((item) => ({
    requirementId: item.requirementId,
    requirement: item.requirement,
    resumeEvidence: item.evidenceList[0] || item.evidence,
    rubricDimension: inferRubricDimension(question.category),
    riskLevel: anchorRiskLevel(item),
  }))
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
  const fitCoverage = buildJdAnalysisArtifacts({
    jdData,
    matchResult,
    prepInsight: null,
    companyIntel,
  }).candidateFitGraph?.coverage ?? []
  const companyIntelHint = companyIntel
    ? `\n${companyIntel.companyName}，主要业务：${companyIntel.businessScope}，技术栈：${companyIntel.techStack.join('、')}，工程文化：${companyIntel.cultureNotes}，面试切入点：${companyIntel.howToReference || '暂无'}`
    : ''
  const dateContext = buildCurrentDateContextPrompt()

  // 第一阶段：极速生成题目列表
  const segments = [
    { type: '核心技术与原理', focus: '硬技能与底层原理' },
    { type: '实战经验挖掘', focus: '简历项目深度实现' },
    { type: '架构逻辑与综合场景', focus: '系统设计与复杂场景' },
  ]

  const executeSegment = async (seg: typeof segments[0]): Promise<InterviewQuestion[]> => {
    const userMessage = `请针对以下上下文生成 2 道【${seg.type}】类别的面试题。
当前日期上下文：
${dateContext}

重点：${seg.focus}
岗位要求：${jdRequirements.slice(0, 1000)}
候选人简历：${resumeText.slice(0, 1500)}
用户偏好：${focusAreas.join('、')}${companyIntelHint}
规避题目：${previousQuestions.slice(-5).join('|')}

输出要求：仅返回 JSON 数组 [ { "category": "${seg.type}", "difficulty": "中级/高级", "question": "题目文本" } ]`

    try {
      const normalized = await runJsonTask({
        taskName: `jd.generateInterviewBank.${seg.type}`,
        category: 'jd-interview-bank',
        config,
        systemPrompt: JD_INTERVIEW_LIST_ONLY_SYSTEM_PROMPT,
        userMessage,
        normalize: raw => normalizeQuestionSeedList(raw, seg.type),
        validate: validateQuestionList,
        schemaHint: JD_INTERVIEW_LIST_SCHEMA_HINT,
        transport: 'stream',
        streamCallbacks: { onChunk: () => {} },
        signal,
        repair: true,
      })
      
      const anchored = normalized.map((question) => ({
        ...question,
        anchors: createQuestionAnchors(question, fitCoverage),
      }))
      
      if (anchored.length > 0) {
        callbacks.onChunk?.(JSON.stringify({ questions: anchored }))
      }
      return anchored
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
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

    当前日期上下文：
    ${buildCurrentDateContextPrompt()}
    
    注意：此步骤严禁输出 sampleAnswer 字段，请保持该字段为空。`

  try {
    return await runJsonTask({
      taskName: 'jd.generateQuestionInsightBase',
      category: 'jd-interview-bank',
      config,
      systemPrompt: JD_INTERVIEW_INSIGHT_ONLY_SYSTEM_PROMPT,
      userMessage,
      normalize: normalizeQuestionInsight,
      validate: validateQuestionInsight,
      schemaHint: JD_INTERVIEW_INSIGHT_SCHEMA_HINT,
      transport: 'stream',
      streamCallbacks: { onChunk: () => {} },
      signal,
      repair: true,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
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
  const userMessage = `请针对以下面试题目，结合上下文生成一份 260-420 字、专业且可直接口述的参考回答。
  当前日期上下文：
  ${buildCurrentDateContextPrompt()}

  题目：${question}
  岗位：${jdRequirements.slice(0, 800)}
  候选人：${resumeText.slice(0, 1000)}
  
  回答要求：
  1. 内部按 STAR 原则组织信息：先交代场景，再说明任务，再展开关键行动，最后落到结果和复盘。
  2. 最终输出必须是一段完整、连贯、可直接在面试中说出口的话。
  3. 不要输出 S/T/A/R、小标题、编号、项目符号、Markdown 加粗、表格或 JSON。
  4. 不要编造简历中没有的公司、项目、指标；缺少具体数据时用“可以补充为...”或“当时更关注...”这类保守口径。
  5. 语气要像候选人在回答面试官，不要像老师讲解方法论。`

  try {
    const fullText = await streamAIRequest(
      config,
      '你是一位资深面试官。你的任务是把候选人的背景整理成自然、可信、可直接口述的面试参考回答。STAR 只作为内部组织逻辑，最终答案必须是自然段。',
      userMessage,
      { onChunk: () => {} },
      signal,
    )
    return normalizeSampleAnswerText(fullText)
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
    + `\n\n当前日期上下文：\n${buildCurrentDateContextPrompt()}`

  try {
    return await runJsonTask({
      taskName: 'jd.generateFollowUpQuestions',
      category: 'jd-interview-bank',
      config,
      systemPrompt: JD_INTERVIEW_FOLLOWUP_SYSTEM_PROMPT,
      userMessage,
      normalize: normalizeFollowUps,
      validate: validateFollowUps,
      schemaHint: JD_INTERVIEW_FOLLOWUP_SCHEMA_HINT,
      transport: 'stream',
      streamCallbacks: callbacks,
      signal,
      repair: true,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (error instanceof Error && /API 请求失败|AI 请求超时|请求已取消/.test(error.message)) throw error
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
    anchors: Array.isArray(q.anchors)
      ? q.anchors.map((anchor: any) => ({
          requirementId: String(anchor?.requirementId || ''),
          requirement: String(anchor?.requirement || ''),
          resumeEvidence: String(anchor?.resumeEvidence || ''),
          rubricDimension: ['technical', 'project', 'experience', 'behavior', 'culture'].includes(anchor?.rubricDimension)
            ? anchor.rubricDimension
            : 'technical',
          riskLevel: ['low', 'medium', 'high'].includes(anchor?.riskLevel) ? anchor.riskLevel : 'low',
        })).filter((anchor: InterviewQuestionAnchor) => anchor.requirementId && anchor.requirement)
      : [],
    followUps: [],
  }))

  return {
    questions,
    batchSummary: String(raw.batchSummary || ''),
  }
}

export function normalizeFollowUps(raw: any): FollowUpQuestion[] {
  const list = Array.isArray(raw) ? raw : (raw.followUps || [])
  return list
    .map((fu: any, i: number) => ({
      id: fu.id || `fu-${Date.now()}-${i}`,
      depth: Number(fu.depth) || 1,
      question: String(fu.question || ''),
      intent: String(fu.intent || ''),
      sampleAnswer: String(fu.sampleAnswer || ''),
      keyPoints: Array.isArray(fu.keyPoints) ? fu.keyPoints.map(String) : [],
      deeperFollowUp: String(fu.deeperFollowUp || ''),
    }))
    .filter((item: FollowUpQuestion) => !isStaleFutureDateRiskText([
      item.question,
      item.intent,
      item.sampleAnswer,
      item.deeperFollowUp,
    ].join('\n')))
}
