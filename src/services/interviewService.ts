import type { AiConfig } from '@/stores/aiConfig'
import type { BasicInfo, EducationEntry, ProjectEntry, WorkEntry } from '@/stores/resume'
import { candidateModeSystemPrompt } from '@/services/prompts/interviewCandidatePrompt'
import { interviewerModeSystemPrompt } from '@/services/prompts/interviewInterviewerPrompt'
import { stripHtml as stripHtmlBase, cleanJsonResponse, nonStreamAIRequest, type AiConfig as StreamAiConfig } from '@/services/stream'

export type InterviewMode = 'candidate' | 'interviewer'

export type InterviewCommand = 'start' | 'continue' | 'finish'

export type InterviewPhase =
  | 'opening'
  | 'skills'
  | 'work'
  | 'projects'
  | 'scenario'
  | 'written'
  | 'summary'

export interface ResumeSnapshot {
  basicInfo: BasicInfo
  skillsText: string
  workList: WorkEntry[]
  projectList: ProjectEntry[]
  educationList: EducationEntry[]
  selfIntro?: string
}

export interface InterviewHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface FinalEvaluation {
  projectScore: number
  skillScore: number
  workScore: number
  educationScore: number
  totalScore: number
  passed: boolean
  summary: string
  improvements: string[]
}

export interface InterviewTurnScore {
  score: number
  comment: string
}

export interface InterviewTurnResponse {
  assistantReply: string
  phase: InterviewPhase
  nextAction: 'continue' | 'finish'
  turnScore: InterviewTurnScore | null
  finalEvaluation: FinalEvaluation | null
  memorySummary: string
}

/** 答题思路结构化返回类型 */
export interface InterviewHintResult {
  /** 当前被解读的问题摘要 */
  questionSummary: string
  /** 当前问题类型 */
  questionType: 'opening' | 'project' | 'behavior' | 'knowledge' | 'general'
  /** 当前问题主要考察点 */
  questionIntent: string
  /** 推荐的答题结构 */
  answerFramework: string[]
  /** 3 条核心思路 bullet points */
  bullets: string[]
  /** 推荐的回答开场句 */
  opener: string
  /** STAR 结构引导 */
  starGuide: string
  /** 隐藏展示的短参考回答 */
  referenceAnswer: string
  /** 自我介绍题的 30 秒参考表达 */
  referenceAnswer30s: string
  /** 自我介绍题的 60 秒参考表达 */
  referenceAnswer60s: string
}

interface HintQuestionProfile {
  questionType: InterviewHintResult['questionType']
  questionIntent: string
  answerFramework: string[]
  promptGuide: string
}

function normalizeHintBullets(input: unknown, fallbackText = ''): string[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item).replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 4)
  }

  return fallbackText
    .split(/\n/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => {
      if (!line) return false
      if (/^[\[{][\]}]?,?$/.test(line)) return false
      if (/^"(bullets|opener|starGuide|referenceAnswer)"\s*:/.test(line)) return false
      return true
    })
    .slice(0, 4)
}

function extractJsonLikeStringField(text: string, fieldName: string): string {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,\\s*"|\\s*[}\\]])`)
  const match = text.match(pattern)
  if (!match?.[1]) return ''

  return match[1]
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .trim()
}

function extractJsonLikeArrayField(text: string, fieldName: string): string[] {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*\\[([\\s\\S]*?)\\]`)
  const match = text.match(pattern)
  if (!match?.[1]) return []

  return match[1]
    .split(/",\s*"|",\s*\n\s*"|"\s*,\s*"/)
    .map((item) => item.replace(/^"/, '').replace(/"$/, '').replace(/\\"/g, '"').trim())
    .filter(Boolean)
}

function inferHintQuestionProfile(question: string): HintQuestionProfile {
  const normalized = question.replace(/\s+/g, '').toLowerCase()

  if (/自我介绍|介绍一下自己|先介绍|简单介绍|1-2分钟|做个介绍/.test(question)) {
    return {
      questionType: 'opening',
      questionIntent: '考察表达结构、经历概括能力、岗位匹配感和开场稳定度。',
      answerFramework: [
        '先用一句话说明当前定位和工作年限，别一上来就铺项目细节。',
        '再概括 1 到 2 段最能代表你的经历，说明你主要做什么方向。',
        '补一句你最强的能力标签，比如 AI 产品落地、后端架构或工程化推进。',
        '最后收口到为什么你和当前岗位匹配，方便面试官继续追问。',
      ],
      promptGuide: '这是开场自我介绍题。不要直接深入某个项目细节，不要一开始就讲技术方案。优先输出“个人定位 -> 代表经历 -> 核心优势 -> 岗位匹配”的结构。',
    }
  }

  if (/项目|负责|难点|挑战|优化|架构|性能|平台|落地|ai项目|系统/.test(normalized)) {
    return {
      questionType: 'project',
      questionIntent: '考察项目 ownership、技术取舍、问题解决过程和结果说服力。',
      answerFramework: [
        '先交代项目背景、你的角色和问题场景，让面试官知道你负责哪一段。',
        '再讲你如何分析问题和做方案取舍，不要只报技术名词。',
        '重点说关键动作和难点突破，体现你的判断和推进能力。',
        '最后用数据、结果或经验总结收口，形成完整闭环。',
      ],
      promptGuide: '这是项目/经历深挖题。优先突出场景、职责、动作、结果，不要泛泛而谈。',
    }
  }

  if (/冲突|压力|协作|沟通|优先级|学习|失败|复盘|管理|推进|意见不一致/.test(question)) {
    return {
      questionType: 'behavior',
      questionIntent: '考察协作方式、稳定性、复盘能力和行为判断。',
      answerFramework: [
        '先把情境说清楚，说明当时为什么棘手。',
        '再讲你的目标和你想解决什么，不要只说别人怎么做。',
        '重点描述你的沟通、判断和执行动作。',
        '最后讲结果、反思和后续改进，让回答更成熟。',
      ],
      promptGuide: '这是行为/场景题。优先体现判断、沟通和复盘，不要写成流水账。',
    }
  }

  if (/什么是|原理|区别|对比|为什么|如何实现|线程|索引|锁|缓存|redis|mysql|jvm|java|http|tcp|消息队列|并发/.test(normalized)) {
    return {
      questionType: 'knowledge',
      questionIntent: '考察基础概念是否扎实，是否能讲清原理、边界和实际应用。',
      answerFramework: [
        '先给一句清晰定义，直接回答问题本身。',
        '再讲核心原理或关键区别，不要堆术语。',
        '补一个实际应用场景或常见坑点，体现理解深度。',
        '最后用一句总结收口，方便面试官继续追问。',
      ],
      promptGuide: '这是知识/原理题。先定义，再原理，再应用，不要一上来举项目。',
    }
  }

  return {
    questionType: 'general',
    questionIntent: '考察表达结构是否清楚，是否能围绕问题本身稳定作答。',
    answerFramework: [
      '先正面回应问题，确认你理解了面试官想问什么。',
      '再按背景、动作、结果或观点、原因、例子来展开。',
      '中间尽量用具体经历或事实支撑，不要空泛。',
      '最后用一句结论收口，方便进入下一轮。',
    ],
    promptGuide: '这是通用题。优先围绕问题本身组织回答，避免被简历上下文带偏。',
  }
}

function buildHintFallback(
  result: string,
  questionSummary: string,
  profile: HintQuestionProfile,
): InterviewHintResult {
  const bullets = extractJsonLikeArrayField(result, 'bullets')
  const answerFramework = extractJsonLikeArrayField(result, 'answerFramework')
  const opener = extractJsonLikeStringField(result, 'opener')
  const starGuide = extractJsonLikeStringField(result, 'starGuide')
  const referenceAnswer = extractJsonLikeStringField(result, 'referenceAnswer')
  const referenceAnswer30s = extractJsonLikeStringField(result, 'referenceAnswer30s')
  const referenceAnswer60s = extractJsonLikeStringField(result, 'referenceAnswer60s')
  const questionIntent = extractJsonLikeStringField(result, 'questionIntent')
  const questionType = extractJsonLikeStringField(result, 'questionType')

  return {
    questionSummary,
    questionType: ['opening', 'project', 'behavior', 'knowledge', 'general'].includes(questionType)
      ? questionType as InterviewHintResult['questionType']
      : profile.questionType,
    questionIntent: questionIntent || profile.questionIntent,
    answerFramework: answerFramework.length > 0 ? answerFramework.slice(0, 4) : profile.answerFramework,
    bullets: bullets.length > 0 ? normalizeHintBullets(bullets) : normalizeHintBullets(undefined, result),
    opener,
    starGuide,
    referenceAnswer,
    referenceAnswer30s,
    referenceAnswer60s,
  }
}

export async function requestInterviewHint(
  request: InterviewTurnRequest,
  signal?: AbortSignal
): Promise<InterviewHintResult> {
  let lastQuestion = '暂无问题'
  for (let i = request.history.length - 1; i >= 0; i--) {
    const historyItem = request.history[i]
    if (historyItem?.role === 'assistant') {
      lastQuestion = historyItem.content
      break
    }
  }

  const recentHistory = request.history
    .slice(-6)
    .map((item) => `${item.role === 'assistant' ? '面试官' : '候选人'}：${truncateText(item.content, 180)}`)
    .join('\n')
  const jobDigest = buildJobContextDigest(request.jobContext)
  const resumeBrief = buildResumeBrief(request.resumeSnapshot)
  const memorySummary = normalizeMemorySummaryText(request.memorySummary || '')
  const questionSummary = truncateText(lastQuestion.replace(/\s+/g, ' ').trim(), 120)
  const questionProfile = inferHintQuestionProfile(lastQuestion)

  const systemPrompt = `你是一位资深面试辅导专家（Copilot），候选人面试卡壳时向你求助。
你的任务是快速给出结构化的答题思路，帮助候选人理清脉络并自信开口。

## 输出规则
- 严禁生成完整答案，只给思路提示
- 语言口语化、短平快
- 要结合岗位上下文、简历亮点、最近对话，不要给泛泛建议
- 参考回答只允许给 80-140 字的短示范，帮助用户理解表达方式，不能写成长文
- 你必须优先围绕“当前问题本身”组织提示，不能被简历亮点带偏
- 如果题型是 opening（自我介绍），必须先输出自我介绍结构，禁止直接深入某个项目细节
- 如果题型是 opening，除了通用 referenceAnswer，还要额外给出 referenceAnswer30s 和 referenceAnswer60s，两版都要口语化、自然、便于复述
- 必须返回一个 JSON 对象，不要返回其他内容

## 返回格式
{
  "questionSummary": "当前问题摘要",
  "questionType": "opening|project|behavior|knowledge|general",
  "questionIntent": "这道题主要考察什么",
  "answerFramework": ["结构1", "结构2", "结构3", "结构4"],
  "bullets": ["思路1", "思路2", "思路3"],
  "opener": "推荐的回答开场句（10-20字，可直接使用）",
  "starGuide": "针对本题的 STAR 结构引导（Situation→Task→Action→Result 各一句提示）",
  "referenceAnswer": "隐藏展示的短参考回答（80-140字）",
  "referenceAnswer30s": "仅 opening 题填写，适合 30 秒自我介绍的口语版，其他题可为空字符串",
  "referenceAnswer60s": "仅 opening 题填写，适合 60 秒自我介绍的口语版，其他题可为空字符串"
}`

  const userCommand = [
    `当前面试官的问题：\n"${lastQuestion}"`,
    '',
    `最近对话：\n${recentHistory || '（暂无）'}`,
    '',
    `岗位上下文：\n${jobDigest}`,
    '',
    `简历快照：\n${resumeBrief}`,
    '',
    `会话记忆摘要：\n${memorySummary || '（暂无）'}`,
    '',
    `系统判断的题型：${questionProfile.questionType}`,
    `题型专属约束：${questionProfile.promptGuide}`,
    `建议答题骨架：\n- ${questionProfile.answerFramework.join('\n- ')}`,
    '',
    '请给我结构化的答题思路提示。',
  ].join('\n')

  const result = await nonStreamAIRequest(
    request.config,
    systemPrompt,
    userCommand,
    { temperature: 0.7, maxTokens: 500 },
    signal,
  )

  // 尝试解析 JSON
  try {
    const parsed = JSON.parse(cleanJsonResponse(result)) as Record<string, unknown>
    const questionType = typeof parsed.questionType === 'string' ? parsed.questionType : ''
    return {
      questionSummary: typeof parsed.questionSummary === 'string' && parsed.questionSummary.trim() ? parsed.questionSummary.trim() : questionSummary,
      questionType: ['opening', 'project', 'behavior', 'knowledge', 'general'].includes(questionType)
        ? questionType as InterviewHintResult['questionType']
        : questionProfile.questionType,
      questionIntent: typeof parsed.questionIntent === 'string' && parsed.questionIntent.trim()
        ? parsed.questionIntent.trim()
        : questionProfile.questionIntent,
      answerFramework: Array.isArray(parsed.answerFramework)
        ? parsed.answerFramework.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 4)
        : questionProfile.answerFramework,
      bullets: normalizeHintBullets(parsed.bullets, result),
      opener: typeof parsed.opener === 'string' ? parsed.opener : '',
      starGuide: typeof parsed.starGuide === 'string' ? parsed.starGuide : '',
      referenceAnswer: typeof parsed.referenceAnswer === 'string' ? parsed.referenceAnswer : '',
      referenceAnswer30s: typeof parsed.referenceAnswer30s === 'string' ? parsed.referenceAnswer30s : '',
      referenceAnswer60s: typeof parsed.referenceAnswer60s === 'string' ? parsed.referenceAnswer60s : '',
    }
  } catch {
    return buildHintFallback(result, questionSummary, questionProfile)
  }
}

export interface InterviewJobContext {
  jdText?: string
  summary?: string
  targetRole?: string
  seniority?: string
  mustHaveSkills?: string[]
  focusAreas?: string[]
  resumeGaps?: string[]
  highlightedProjects?: string[]
  prepSummary?: string
  prepPriorities?: string[]
  recommendedStories?: string[]
  highRiskQuestions?: string[]
  customNote?: string
  difficulty?: 'junior' | 'mid' | 'senior'
  companyCulture?: string
  interviewStyle?: string
  /** 目标公司已知技术栈 */
  techStack?: string[]
  /** 目标公司竞品列表 */
  competitors?: string[]
  /** 推荐反问面试官的问题 */
  reverseQuestions?: string[]
}

export interface InterviewTurnRequest {
  config: AiConfig
  mode: InterviewMode
  command: InterviewCommand
  userInput?: string
  history: InterviewHistoryItem[]
  resumeSnapshot: ResumeSnapshot
  durationMinutes: number
  elapsedSeconds: number
  memorySummary?: string
  jobContext?: InterviewJobContext
  /** 面试官虚拟角色名 */
  interviewerName?: string
  /** 候选人姓名（来自简历） */
  candidateName?: string
}

export interface InterviewTurnStreamCallbacks {
  onAssistantReplyChunk?: (text: string) => void
}

function normalizeApiUrl(raw: string): string {
  if (/(^https?:\/\/)?(localhost|127\.0\.0\.1):11434(\/|$)/i.test(raw) || /(^https?:\/\/)?ollama\.com(\/|$)/i.test(raw)) {
    const base = raw
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/chat\/completions$/i, '')
      .replace(/\/api$/i, '')
      .replace(/\/v1$/i, '')
    return `${base}/v1/chat/completions`
  }

  let baseUrl = raw.trim().replace(/\/+$/, '')
  if (!baseUrl.includes('/v1/chat/completions')) {
    if (!baseUrl.endsWith('/v1')) baseUrl += '/v1'
    baseUrl += '/chat/completions'
  }
  return baseUrl
}

/** 复用 stream.ts 的 stripHtml，避免重复实现 */
const toPlainText = stripHtmlBase

function compactList(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean)
}

function truncateText(content: string, maxLen: number): string {
  if (!content) return ''
  if (content.length <= maxLen) return content
  return `${content.slice(0, Math.max(0, maxLen - 1))}…`
}

function normalizeMemorySummaryText(content: string): string {
  return truncateText(content.replace(/\s+/g, ' ').trim(), 600)
}

function buildJobContextDigest(jobContext?: InterviewJobContext): string {
  if (!jobContext) return '（暂无岗位上下文）'

  const sections: string[] = []
  if (jobContext.targetRole) sections.push(`目标岗位: ${jobContext.targetRole}`)
  if (jobContext.seniority) sections.push(`岗位级别: ${jobContext.seniority}`)
  if (jobContext.difficulty) sections.push(`面试难度: ${jobContext.difficulty}`)
  if (jobContext.summary) sections.push(`岗位摘要: ${truncateText(jobContext.summary, 220)}`)
  if (jobContext.prepSummary) sections.push(`备面摘要: ${truncateText(jobContext.prepSummary, 220)}`)
  if (jobContext.mustHaveSkills?.length) sections.push(`必备技能: ${jobContext.mustHaveSkills.join(' / ')}`)
  if (jobContext.focusAreas?.length) sections.push(`重点考察: ${jobContext.focusAreas.join(' / ')}`)
  if (jobContext.prepPriorities?.length) sections.push(`备面优先项: ${jobContext.prepPriorities.join(' / ')}`)
  if (jobContext.resumeGaps?.length) sections.push(`简历缺口: ${jobContext.resumeGaps.join(' / ')}`)
  if (jobContext.highlightedProjects?.length) sections.push(`重点项目: ${jobContext.highlightedProjects.join(' / ')}`)
  if (jobContext.recommendedStories?.length) sections.push(`推荐案例: ${jobContext.recommendedStories.join(' / ')}`)
  if (jobContext.highRiskQuestions?.length) sections.push(`高风险追问: ${jobContext.highRiskQuestions.join(' / ')}`)
  if (jobContext.customNote) sections.push(`面试备注: ${truncateText(jobContext.customNote, 180)}`)
  if (jobContext.companyCulture) sections.push(`公司工程文化: ${jobContext.companyCulture}`)
  if (jobContext.interviewStyle) sections.push(`公司面试风格: ${jobContext.interviewStyle}`)
  if (jobContext.techStack?.length) sections.push(`公司技术栈: ${jobContext.techStack.join(' / ')}`)
  if (jobContext.competitors?.length) sections.push(`竞品认知: ${jobContext.competitors.join(' / ')}`)
  if (jobContext.reverseQuestions?.length) sections.push(`推荐反问: ${jobContext.reverseQuestions.join('；')}`)
  if (jobContext.jdText) sections.push(`JD 核心职责: ${truncateText(toPlainText(jobContext.jdText), 120)}`)

  return sections.length > 0 ? sections.join('\n') : '（暂无岗位上下文）'
}

/** 
 * 为题目生成定制的极简简历摘要 
 * 仅保留核心元数据，移除描述性文本，极大减少 Token 消耗
 */
function buildResumeBrief(snapshot: ResumeSnapshot): string {
  const basic = [
    `目标岗位: ${snapshot.basicInfo.jobTitle || '未设定'}`,
    `年限: ${snapshot.basicInfo.workYears || '未设定'}`,
    `学历: ${snapshot.basicInfo.educationLevel || '未设定'}`,
  ].join(' / ')

  const skills = compactList(toPlainText(snapshot.skillsText).split(/\n|,|，|;|；/)).slice(0, 15).join(' / ')
  const projects = snapshot.projectList.map(p => `• ${p.name || '未命名项目'}${p.role ? ` (${p.role})` : ''}`).join('\n')
  const works = snapshot.workList.map(w => `• ${w.company || '未知公司'} / ${w.position || '未知岗位'}`).join('\n')

  return [
    '【基本信息】', basic,
    '',
    '【核心技能】', skills || '未填写',
    '',
    '【项目列表】', projects || '未填写',
    '',
    '【工作历程】', works || '未填写'
  ].join('\n')
}

function buildResumeDigest(snapshot: ResumeSnapshot, mode: 'full' | 'compact' = 'full'): string {
  const isCompact = mode === 'compact'
  const basicInfo = snapshot.basicInfo
  const basic: string[] = []
  if (basicInfo.name) basic.push(`姓名: ${basicInfo.name}`)
  if (basicInfo.jobTitle) basic.push(`目标岗位: ${basicInfo.jobTitle}`)
  if (basicInfo.workYears) basic.push(`工作年限: ${basicInfo.workYears}`)
  if (basicInfo.educationLevel) basic.push(`最高学历: ${basicInfo.educationLevel}`)
  if (basicInfo.currentCity) basic.push(`当前城市: ${basicInfo.currentCity}`)
  if (basicInfo.currentStatus) basic.push(`求职状态: ${basicInfo.currentStatus}`)

  const skills = compactList(
    toPlainText(snapshot.skillsText)
      .split(/\n|,|，|;|；/)
      .slice(0, isCompact ? 12 : 24)
  )

  const projectList = isCompact ? snapshot.projectList.slice(0, 2) : snapshot.projectList
  const workList = isCompact ? snapshot.workList.slice(0, 2) : snapshot.workList
  const educationList = isCompact ? snapshot.educationList.slice(0, 1) : snapshot.educationList

  const projects = projectList
    .map((project, idx) => {
      const lines: string[] = [`项目${idx + 1}: ${project.name || '未命名项目'}`]
      if (project.role) lines.push(`角色: ${project.role}`)
      if (project.startDate || project.endDate) {
        lines.push(`时间: ${project.startDate || ''} ~ ${project.endDate || ''}`)
      }
      if (project.introduction) lines.push(`项目目的: ${truncateText(toPlainText(project.introduction), isCompact ? 120 : 260)}`)
      if (project.mainWork) lines.push(`主要工作: ${truncateText(toPlainText(project.mainWork), isCompact ? 120 : 260)}`)
      return lines.join('\n')
    })
    .join('\n---\n')

  const works = workList
    .map((work, idx) => {
      const lines: string[] = [`工作${idx + 1}: ${work.company || '未填写公司'} / ${work.position || '未填写岗位'}`]
      if (work.department) lines.push(`部门: ${work.department}`)
      if (work.startDate || work.endDate) {
        lines.push(`时间: ${work.startDate || ''} ~ ${work.endDate || ''}`)
      }
      if (work.description) lines.push(`工作描述: ${truncateText(toPlainText(work.description), isCompact ? 120 : 240)}`)
      return lines.join('\n')
    })
    .join('\n---\n')

  const education = educationList
    .map((item, idx) => {
      const lines: string[] = [`教育${idx + 1}: ${item.school || '未填写学校'} / ${item.degree || '未填写学历'}`]
      if (item.major) lines.push(`专业: ${item.major}`)
      if (item.startDate || item.endDate) lines.push(`时间: ${item.startDate || ''} ~ ${item.endDate || ''}`)
      return lines.join('\n')
    })
    .join('\n---\n')

  return [
    '【基本信息】',
    basic.join('\n') || '未填写',
    '',
    '【技能点】',
    skills.length > 0 ? skills.join(' / ') : '未填写',
    '',
    '【项目经历】',
    projects || '未填写',
    '',
    '【工作经历】',
    works || '未填写',
    '',
    '【教育经历】',
    education || '未填写',
    snapshot.selfIntro ? `\n【自我介绍】\n${truncateText(toPlainText(snapshot.selfIntro), isCompact ? 120 : 240)}` : '',
  ]
    .join('\n')
    .trim()
}

function buildUserCommandPrompt(request: InterviewTurnRequest): string {
  const elapsedMin = Math.floor(request.elapsedSeconds / 60)
  const remainMin = Math.max(request.durationMinutes - elapsedMin, 0)
  const roleLabel =
    request.mode === 'candidate' ? '你是面试官，用户是候选人' : '你是候选人，用户是面试官'
  const digest = buildResumeDigest(request.resumeSnapshot, request.command === 'start' ? 'full' : 'compact')
  const jobDigest = buildJobContextDigest(request.jobContext)
  const memorySummary = normalizeMemorySummaryText(request.memorySummary || '')

  const candidateName = request.candidateName || request.resumeSnapshot.basicInfo.name || '候选人'
  const interviewerName = request.interviewerName || '面试官'

  const commandLine =
    request.command === 'start'
      ? request.mode === 'candidate'
        ? `请开始本轮面试。你的角色名叫"${interviewerName}"，候选人的名字叫"${candidateName}"。开场白要求：先热情地打招呼并自我介绍（例如："${candidateName}您好，欢迎参加今天的面试，我是本场的面试官${interviewerName}。"），然后邀请候选人做1-2分钟自我介绍。本轮不要问任何技术问题。`
        : `请开始本轮模拟面试。你扮演的候选人名叫"${candidateName}"，面试官名叫"${interviewerName}"。先做简短的自我介绍开场并等待面试官提问。`
      : request.command === 'finish'
        ? '请结束面试，输出最终结论与综合评分。如果岗位上下文包含"推荐反问"，请在结束语前主动询问候选人是否有问题，并自然地引导向推荐反问方向。'
        : request.mode === 'candidate'
          ? `用户本轮输入：${request.userInput?.trim() || '（空）'}。请基于这次回答只提出1个下一问（或1个追问），不要一次问多个问题；技能阶段总量需控制在5-10题，若当前小点回答已逻辑合理则切换到下一个考点。`
          : `用户本轮输入：${request.userInput?.trim() || '（空）'}`

  return [
    `角色关系：${roleLabel}`,
    `本场目标时长：${request.durationMinutes}分钟，已进行约${elapsedMin}分钟，剩余约${remainMin}分钟。`,
    `当前命令：${request.command}`,
    commandLine,
    '',
    '会话记忆摘要（优先参考）：',
    memorySummary || '（暂无）',
    '',
    '岗位上下文：',
    jobDigest,
    '',
    '简历快照如下：',
    digest,
    '',
    '注意：优先结合”会话记忆摘要 + 最近历史消息”推进，不要重复已问过的大段问题。',
    '如果岗位上下文里存在”备面优先项 / 推荐案例 / 高风险追问”，请优先围绕这些内容组织提问、追问和评价。',
    '如果岗位上下文包含”公司技术栈”，请在相关技能问题上适当提升难度和深度，考察候选人对目标技术栈的掌握程度。',
    '如果包含”竞品认知”，请在场景题中设计涉及竞品对比、产品差异的追问。',
    'candidate 模式下优先考察岗位匹配度、项目证据、量化结果、技术权衡与风险追问；避免只做泛泛八股问答。',
    '只返回一个JSON对象。若需要继续提问，nextAction设为continue；若应结束，设为finish并填写finalEvaluation。',
  ].join('\n')
}

/** 复用 stream.ts 的 JSON 清理工具 */
function extractJsonObject(raw: string): string {
  return cleanJsonResponse(raw)
}

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeFinalEvaluation(input: unknown): FinalEvaluation | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const improvements = Array.isArray(record.improvements)
    ? record.improvements.map((item) => String(item).trim()).filter(Boolean)
    : []

  return {
    projectScore: clampScore(record.projectScore),
    skillScore: clampScore(record.skillScore),
    workScore: clampScore(record.workScore),
    educationScore: clampScore(record.educationScore),
    totalScore: clampScore(record.totalScore),
    passed: Boolean(record.passed),
    summary: String(record.summary ?? '').trim(),
    improvements,
  }
}

function normalizeTurnResponse(rawContent: string): InterviewTurnResponse {
  const fallback: InterviewTurnResponse = {
    assistantReply: rawContent.trim() || '本轮回答为空，请重试。',
    phase: 'opening',
    nextAction: 'continue',
    turnScore: null,
    finalEvaluation: null,
    memorySummary: '',
  }

  try {
    const parsed = JSON.parse(extractJsonObject(rawContent)) as Record<string, unknown>
    const turnScoreRaw = parsed.turnScore as Record<string, unknown> | null | undefined
    const normalizedReply = dedupeMirroredContent(String(parsed.assistantReply ?? fallback.assistantReply).trim())
    return {
      assistantReply: normalizedReply,
      phase: (String(parsed.phase ?? 'opening') as InterviewPhase) || 'opening',
      nextAction: parsed.nextAction === 'finish' ? 'finish' : 'continue',
      turnScore:
        turnScoreRaw && typeof turnScoreRaw === 'object'
          ? {
              score: clampScore(turnScoreRaw.score),
              comment: String(turnScoreRaw.comment ?? '').trim(),
            }
          : null,
      finalEvaluation: normalizeFinalEvaluation(parsed.finalEvaluation),
      memorySummary: normalizeMemorySummaryText(String(parsed.memorySummary ?? '')),
    }
  } catch {
    const recoveredReply = dedupeMirroredContent(
      extractAssistantReplyFromPartialJson(rawContent) ??
        extractAssistantReplyFromPartialJson(extractJsonObject(rawContent)) ??
        fallback.assistantReply
    )
    return {
      ...fallback,
      assistantReply: recoveredReply,
    }
  }
}

function decodePartialJsonString(raw: string): string {
  let output = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch !== '\\') {
      output += ch
      continue
    }
    const next = raw[i + 1]
    if (!next) break
    if (next === 'n') {
      output += '\n'
      i += 1
      continue
    }
    if (next === 'r') {
      output += '\r'
      i += 1
      continue
    }
    if (next === 't') {
      output += '\t'
      i += 1
      continue
    }
    if (next === '"' || next === '\\' || next === '/') {
      output += next
      i += 1
      continue
    }
    if (next === 'u') {
      const hex = raw.slice(i + 2, i + 6)
      if (/^[\da-fA-F]{4}$/.test(hex)) {
        output += String.fromCharCode(Number.parseInt(hex, 16))
        i += 5
        continue
      }
      break
    }
    output += next
    i += 1
  }
  return output
}

function extractAssistantReplyFromPartialJson(raw: string): string | null {
  const keyToken = '"assistantReply"'
  const keyIndex = raw.indexOf(keyToken)
  if (keyIndex < 0) return null

  const colonIndex = raw.indexOf(':', keyIndex + keyToken.length)
  if (colonIndex < 0) return null

  let cursor = colonIndex + 1
  while (cursor < raw.length && /\s/.test(raw[cursor] || '')) cursor += 1
  if (raw[cursor] !== '"') return null
  cursor += 1

  let escaped = false
  let rawValue = ''
  for (; cursor < raw.length; cursor++) {
    const ch = raw[cursor]
    if (!escaped && ch === '"') {
      return decodePartialJsonString(rawValue)
    }
    if (!escaped && ch === '\\') {
      escaped = true
      rawValue += ch
      continue
    }
    escaped = false
    rawValue += ch
  }

  return decodePartialJsonString(rawValue)
}

function dedupeMirroredContent(content: string): string {
  const text = content.trim()
  if (!text) return text
  const compact = text.replace(/\s+/g, '')
  if (compact.length < 20) return text

  const midLeft = Math.floor(compact.length / 2)
  const midRight = Math.ceil(compact.length / 2)
  const candidates = [midLeft - 1, midLeft, midRight, midRight + 1]
  for (const mid of candidates) {
    if (mid <= 0 || mid >= compact.length) continue
    const left = compact.slice(0, mid)
    const right = compact.slice(mid)
    if (left && left === right) {
      const approxHalf = Math.floor(text.length / 2)
      const splitIndex = text.indexOf('\n', Math.max(0, approxHalf - 40))
      if (splitIndex > 0) return text.slice(0, splitIndex).trim()
      return text.slice(0, approxHalf).trim()
    }
  }

  const repeatedBlock = text.match(/^([\s\S]{20,})\s+\1$/)
  if (repeatedBlock?.[1]) return repeatedBlock[1].trim()
  return text
}

function mergeMessageSnapshot(
  fullContent: string,
  messageContent: string
): string {
  if (!fullContent) return messageContent
  if (messageContent === fullContent) return fullContent
  if (messageContent.startsWith(fullContent)) return messageContent
  if (messageContent.includes(fullContent)) return messageContent
  if (fullContent.startsWith(messageContent)) return fullContent
  if (fullContent.includes(messageContent)) return fullContent
  return `${fullContent}${messageContent}`
}

export async function requestInterviewTurn(
  request: InterviewTurnRequest,
  signal?: AbortSignal,
  callbacks?: InterviewTurnStreamCallbacks
): Promise<InterviewTurnResponse> {
  const endpoint = normalizeApiUrl(request.config.apiUrl)
  const systemPrompt =
    request.mode === 'candidate'
      ? candidateModeSystemPrompt()
      : interviewerModeSystemPrompt(request.resumeSnapshot.basicInfo.jobTitle?.trim() || '')
  const userCommandPrompt = buildUserCommandPrompt(request)

  const historyWindowSize = request.command === 'start' ? 4 : 8
  const historyMessages = request.history.slice(-historyWindowSize).map((item) => ({
    role: item.role,
    content: truncateText(item.content, 700),
  }))

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${request.config.apiToken}`,
    },
    body: JSON.stringify({
      model: request.config.modelName,
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userCommandPrompt },
      ],
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`AI请求失败 (${response.status}): ${errorText || response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content?.trim() ?? ''
    const normalized = normalizeTurnResponse(content)
    callbacks?.onAssistantReplyChunk?.(normalized.assistantReply)
    return normalized
  }

  const decoder = new TextDecoder()
  let fullContent = ''
  let sseBuffer = ''
  let lastAssistantReply = ''
  let hasDeltaChunks = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    sseBuffer += decoder.decode(value, { stream: true })
    const lines = sseBuffer.split('\n')
    sseBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
        }
        const deltaContent = parsed.choices?.[0]?.delta?.content
        const messageContent = parsed.choices?.[0]?.message?.content
        let merged = fullContent
        if (typeof deltaContent === 'string' && deltaContent) {
          merged = fullContent + deltaContent
          hasDeltaChunks = true
        } else if (!hasDeltaChunks && typeof messageContent === 'string' && messageContent) {
          merged = mergeMessageSnapshot(fullContent, messageContent)
        }
        if (merged === fullContent) continue
        fullContent = merged
        const partialReply = extractAssistantReplyFromPartialJson(fullContent)
        if (partialReply !== null && partialReply !== lastAssistantReply) {
          lastAssistantReply = partialReply
          callbacks?.onAssistantReplyChunk?.(partialReply)
        }
      } catch {
        // Ignore malformed chunks from providers.
      }
    }
  }

  const tail = sseBuffer.trim()
  if (tail.startsWith('data:')) {
    const data = tail.slice(5).trim()
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
        }
        const deltaContent = parsed.choices?.[0]?.delta?.content
        const messageContent = parsed.choices?.[0]?.message?.content
        if (typeof deltaContent === 'string' && deltaContent) {
          fullContent += deltaContent
        } else if (!hasDeltaChunks && typeof messageContent === 'string' && messageContent) {
          fullContent = mergeMessageSnapshot(fullContent, messageContent)
        }
      } catch {
        // Ignore malformed tail chunk.
      }
    }
  }

  const normalized = normalizeTurnResponse(fullContent)
  callbacks?.onAssistantReplyChunk?.(normalized.assistantReply)
  return normalized
}

// ═══ 专项训练：生成题目 ═══

export interface DrillQuestionRaw {
  id: number
  question: string
  category: string
  focusArea: string
  difficulty: number
  /** 考察意图 */
  intent?: string
  /** 答题框架建议 */
  framework?: string
  /** 核心思考要点 */
  thinkingPoints?: string[]
  /** 专家级参考答案示范 */
  sampleAnswer?: string
  /** 兼容字段 */
  referenceAnswer?: string
}

export async function generateDrillQuestions(
  request: InterviewTurnRequest,
  onProgress?: (questions: DrillQuestionRaw[]) => void,
  signal?: AbortSignal,
  seedQuestions?: DrillQuestionRaw[],
): Promise<DrillQuestionRaw[]> {
  const jobDigest = buildJobContextDigest(request.jobContext)
  const resumeBrief = buildResumeBrief(request.resumeSnapshot)

  // 构建种子题目上下文（如有）
  const seedContext = seedQuestions?.length
    ? `\n\n参考已有题目（请基于这些题目进行变体和深化，避免重复）：\n${seedQuestions.map((q) => `- [${q.category}] ${q.question}`).join('\n')}\n`
    : ''

  // 定义分片生成任务：每组 2 题，专注不同维度（总共 6 题）
  const taskSegments = [
    { dimension: '通用背景与基础素质', focus: '自我介绍、教育背景、核心技能稳定性等' },
    { dimension: '核心项目与技术深挖', focus: '简历中的重点项目、技术难点、选型推演、架构设计等' },
    { dimension: '场景模拟与综合潜力', focus: '高压场景应对、团队协作摩擦、解决复杂问题的思维逻辑、学习潜力等' },
  ]

  const executeSegment = async (segment: typeof taskSegments[0], startId: number) => {
    const systemPrompt = `你是一位资深面试官。
请根据岗位 JD 和候选人简历简报，针对指定维度生成 2 道高质量面试题。
只返回一个符合格式要求的 JSON 数组，不要任何开场白或解释。`

    const userPrompt = [
      `岗位上下文：\n${jobDigest}\n\n简历简报：\n${resumeBrief}\n`,
      seedContext,
      `当前任务：生成 2 道【${segment.dimension}】维度的题目。\n`,
      `考察重点：${segment.focus}\n`,
      `要求：
- 结构严谨，具备区分度。
- 单题标注分类(category)、考察重点(focusArea)、难度(1-5)。
- 【核心要求】：提供全方位的答题助攻，包含以下字段：
  - intent: 面试官为什么要问这个问题？隐藏的考察点是什么？
  - framework: 推荐的答题结构（如 STAR、PREP、分点叙述等）。
  - thinkingPoints: 数组形式，包含 3-4 个必须提到的关键点。
  - sampleAnswer: 一个 150-250 字左右的专家级示范答案，口语化且有深度。
- JSON 数组格式（id 请从 ${startId} 开始编号）。

返回格式：
[
  { 
    "id": ${startId}, 
    "question": "...", 
    "category": "...", 
    "focusArea": "...", 
    "difficulty": 3, 
    "intent": "考察...",
    "framework": "STAR...",
    "thinkingPoints": ["要点1", "要点2"],
    "sampleAnswer": "针对这个问题，我认为..."
  }
]`,
    ].join('')

    const content = await nonStreamAIRequest(
      request.config,
      systemPrompt,
      userPrompt,
      { temperature: 0.7, maxTokens: 1500 },
      signal,
    )

    try {
      const questions = JSON.parse(cleanJsonResponse(content)) as DrillQuestionRaw[]
      if (onProgress && Array.isArray(questions)) {
        onProgress(questions)
      }
      return questions
    } catch {
      console.warn(`Segment [${segment.dimension}] failed to parse, skipping...`)
      return []
    }
  }

  // 并发执行所有分片任务
  try {
    const results = await Promise.all(
      taskSegments.map((seg, idx) => executeSegment(seg, idx * 2 + 1))
    )
    
    // 展平结果并按 ID 排序
    const allQuestions = results.flat().sort((a, b) => a.id - b.id)
    
    if (allQuestions.length === 0) {
      throw new Error('AI 返回的题目格式解析失败，请重试。')
    }
    
    return allQuestions
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error
    throw new Error(`生成命题失败: ${error.message || '未知错误'}`)
  }
}

// ═══ 专项训练：批量评估 ═══

export async function evaluateDrillAnswers(
  request: InterviewTurnRequest,
  answers: Array<{ questionId: number; answer: string }>,
  questions: DrillQuestionRaw[],
  signal?: AbortSignal,
): Promise<FinalEvaluation> {
  const systemPrompt = `你是一位资深面试评估专家。请根据候选人对每道面试题的回答进行评分和点评。
综合所有题目给出总分（0-100）和是否通过。

评分维度：
- projectScore: 项目经验相关题目得分 (0-100)
- skillScore: 专业技能相关题目得分 (0-100)
- workScore: 工作经历相关题目得分 (0-100)
- educationScore: 教育背景相关题目得分 (0-100)
- totalScore: 综合得分 (0-100)
- passed: 综合得分 >= 60 为通过
- summary: 总体评价（2-3句话）
- improvements: 改进建议列表

只返回一个 JSON 对象。`

  const qaText = questions
    .map((q, idx) => {
      const ans = answers[idx]
      return `题目${q.id} (${q.category}/${q.focusArea}/难度${q.difficulty}):\n${q.question}\n\n候选人回答：${ans?.answer || '（未作答）'}`
    })
    .join('\n---\n')

  const jobDigest = buildJobContextDigest(request.jobContext)

  const userPrompt = [
    `岗位上下文：\n${jobDigest}\n\n`,
    `以下是面试问答记录：\n${qaText}\n\n`,
    `请对每道题进行评分，并给出综合评分报告。`,
  ].join('')

  const content = await nonStreamAIRequest(
    request.config,
    systemPrompt,
    userPrompt,
    { temperature: 0.4, maxTokens: 2000 },
    signal,
  )

  try {
    const parsed = JSON.parse(cleanJsonResponse(content)) as Record<string, unknown>
    const result = normalizeFinalEvaluation(parsed)
    if (!result) {
      throw new Error('评估结果为空')
    }
    return result
  } catch {
    return {
      projectScore: 0,
      skillScore: 0,
      workScore: 0,
      educationScore: 0,
      totalScore: 0,
      passed: false,
      summary: '评估结果解析失败，请重试。',
      improvements: ['请重试专项训练评估'],
    }
  }
}
