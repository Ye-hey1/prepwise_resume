import type { AgentAssistantContextSnapshot } from '@/composables/useAgentAssistantContext'
import { runJsonTask, type AiTaskIssue } from '@/services/aiTaskRuntime'
import type { AiConfig } from '@/services/stream'
import { buildCurrentDateContextPrompt, isStaleFutureDateRiskText } from '@/utils/currentDateContext'

export interface AgentTrainingQuestionCard {
  id: string
  content: string
  category: string
  difficulty: number
  focusArea: string
  intent: string
  framework: string
  referenceAnswer: string
  userNotes: string
  tags: string[]
  resumeAnchor: string
  followUpChain: string[]
}

export interface AgentTrainingQuestionBatch {
  summary: string
  diagnosis: string[]
  questions: AgentTrainingQuestionCard[]
}

export interface GenerateAgentTrainingQuestionsInput {
  context: AgentAssistantContextSnapshot
  request: string
  personaPrompt: string
  questionCount?: number
}

const TRAINING_QUESTION_SCHEMA_HINT = `{
  "summary": string,
  "diagnosis": string[],
  "questions": [
    {
      "content": string,
      "category": "基础巩固|项目深挖|岗位匹配|公司场景|行为面试|压力追问",
      "difficulty": number,
      "focusArea": string,
      "intent": string,
      "framework": string,
      "referenceAnswer": string,
      "userNotes": string,
      "tags": string[],
      "resumeAnchor": string,
      "followUpChain": string[]
    }
  ]
}`

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(cleanText).filter(Boolean)
    : []
}

function clampDifficulty(value: unknown): number {
  const numeric = typeof value === 'number'
    ? value
    : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(numeric)) return 3
  return Math.min(5, Math.max(1, Math.round(numeric)))
}

function normalizeQuestion(raw: unknown, index: number): AgentTrainingQuestionCard | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const content = cleanText(source.content ?? source.question)
  if (!content) return null

  const tags = stringList(source.tags).slice(0, 6)
  const focusArea = cleanText(source.focusArea ?? source.focus_area)
  const intent = cleanText(source.intent)
  const framework = cleanText(source.framework)
  const resumeAnchor = cleanText(source.resumeAnchor ?? source.resume_anchor)
  const followUpChain = stringList(source.followUpChain ?? source.follow_up_chain).slice(0, 4)
  const referenceAnswer = cleanText(source.referenceAnswer ?? source.reference_answer ?? source.sampleAnswer)

  return {
    id: `mia_question_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
    content,
    category: cleanText(source.category) || '专项训练',
    difficulty: clampDifficulty(source.difficulty),
    focusArea,
    intent,
    framework,
    referenceAnswer,
    userNotes: cleanText(source.userNotes ?? source.user_notes),
    tags: tags.length ? tags : [focusArea, resumeAnchor].filter(Boolean).slice(0, 4),
    resumeAnchor,
    followUpChain,
  }
}

function normalizeBatch(raw: unknown): AgentTrainingQuestionBatch {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const questionsSource = Array.isArray(source.questions) ? source.questions : []
  const questions = questionsSource
    .map((item, index) => normalizeQuestion(item, index))
    .filter((item): item is AgentTrainingQuestionCard => Boolean(item))
    .filter(item => !isStaleFutureDateRiskText([
      item.content,
      item.focusArea,
      item.intent,
      item.userNotes,
      item.referenceAnswer,
      ...item.followUpChain,
    ].join('\n')))

  return {
    summary: cleanText(source.summary),
    diagnosis: stringList(source.diagnosis).slice(0, 6),
    questions,
  }
}

function validateBatch(batch: AgentTrainingQuestionBatch): AiTaskIssue[] {
  const issues: AiTaskIssue[] = []
  if (batch.questions.length === 0) {
    issues.push({ path: '$.questions', message: '没有返回可用训练题', severity: 'error' })
  }

  batch.questions.forEach((question, index) => {
    if (!question.referenceAnswer) {
      issues.push({
        path: `$.questions[${index}].referenceAnswer`,
        message: '训练题缺少参考答案',
        severity: 'error',
      })
    }
    if (!question.intent) {
      issues.push({
        path: `$.questions[${index}].intent`,
        message: '训练题缺少考察意图',
        severity: 'warning',
      })
    }
  })

  return issues
}

function buildSystemPrompt(personaPrompt: string): string {
  return [
    '你负责把候选人的简历、JD、公司情报、题库弱项和面试表现转成可练习的专项训练题。',
    personaPrompt,
    '风格：心细、敏锐、条理清楚，像高分同学帮用户押题和拆题；直接进入结论，不要自我介绍。',
    '题目必须个性化：每道题都要明确关联 JD 要求、简历项目/技能证据、公司业务或面试偏好中的至少一类。',
    '参考答案必须可直接练习，优先使用 STAR、PREP、问题-方案-结果-复盘等结构；没有事实证据时使用“可这样表达，但需补充事实”的保守话术，禁止编造项目结果和指标。',
    '日期判断必须以用户消息中的当前日期上下文为准，不能用模型训练截止时间判断项目月份是否属于未来。',
    'YYYY-MM 小于或等于当前月份时，不得生成“未来时间、项目是否实际完成、成果是否预估”的风险题；只有严格晚于当前月份才可保守核实。',
    '输出只允许 JSON，不要 Markdown，不要解释。',
  ].join('\n')
}

function buildUserMessage(input: GenerateAgentTrainingQuestionsInput): string {
  const questionCount = Math.min(10, Math.max(4, input.questionCount ?? 6))
  return [
    `请生成 ${questionCount} 道个性化专项训练题。`,
    '',
    '【当前日期上下文】',
    buildCurrentDateContextPrompt(),
    '',
    '【用户请求】',
    input.request || '基于当前上下文生成专项训练题，并给出参考答案。',
    '',
    '【当前上下文】',
    input.context.contextText || '暂无可用上下文。',
    '',
    '【生成要求】',
    '1. 题目类型覆盖：基础巩固、项目深挖、岗位匹配、公司场景、行为面试、压力追问；不必每类都有，但必须按薄弱点选择。',
    '2. 每道题必须包含：content、category、difficulty、focusArea、intent、framework、referenceAnswer、userNotes、tags、resumeAnchor、followUpChain。',
    '3. referenceAnswer 至少 120 字，必须能作为用户练习时的参考答案。',
    '4. followUpChain 给 2-4 个递进追问。',
    '5. difficulty 用 1-5 数字。',
    '',
    '【输出 JSON Schema】',
    TRAINING_QUESTION_SCHEMA_HINT,
  ].join('\n')
}

export async function generateAgentTrainingQuestions(
  config: AiConfig,
  input: GenerateAgentTrainingQuestionsInput,
  signal?: AbortSignal,
): Promise<AgentTrainingQuestionBatch> {
  return runJsonTask({
    taskName: 'agent.generateTrainingQuestions',
    category: 'jd-interview-bank',
    config,
    systemPrompt: buildSystemPrompt(input.personaPrompt),
    userMessage: buildUserMessage(input),
    normalize: normalizeBatch,
    validate: validateBatch,
    schemaHint: TRAINING_QUESTION_SCHEMA_HINT,
    requestOptions: { temperature: 0.45, maxTokens: 8192 },
    signal,
    repair: true,
  })
}
