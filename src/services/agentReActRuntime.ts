import type {
  AgentToolConfirmationPolicy,
  AgentToolEffect,
  AgentToolInvocationStatus,
} from '@/services/agentToolRuntime'

export type AgentReActAction =
  | 'chat'
  | 'jd_summary'
  | 'resume_proposal'
  | 'company_intel_report'
  | 'question_training_set'
  | 'blocked_external_action'

export interface AgentReActDecision {
  action: AgentReActAction
  toolId: string | null
  effect: AgentToolEffect | null
  confirmationPolicy: AgentToolConfirmationPolicy | null
  statusBeforeConfirm: AgentToolInvocationStatus | null
  personaSkillId?: string | null
  reason: string
  safetyNote: string
  userFacingSummary: string
}

export interface AgentReActPersonaRouting {
  id: string
  routing?: {
    resumeProposalTerms?: string[]
    jdSummaryTerms?: string[]
    readOnlyReviewTerms?: string[]
    companyIntelTerms?: string[]
    questionTrainingTerms?: string[]
    resumeProposalSkillId?: string
    jdSummarySkillId?: string
    readOnlyReviewSkillId?: string
    companyIntelSkillId?: string
    questionTrainingSkillId?: string
  }
}

const JD_MATCH_SUMMARY_TOOL_ID = 'jd.build_match_summary'
const APPLY_RESUME_PROPOSAL_TOOL_ID = 'resume.apply_change_proposal'

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, '')
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term))
}

function wantsExternalAction(text: string, compact: string): boolean {
  const deliveryTargets = ['boss', '直聘', 'hr', '猎聘', 'linkedin', '脉脉', '邮件', '邮箱', 'email']
  const externalVerbs = ['投递', '发送', '发给', '联系', '私信', 'submit', 'send', 'apply']
  const directTerms = ['直接', '自动', '替我', '帮我投', '马上', '立即', '一键', '不要问', '无需确认']

  const namesExternalTarget = includesAny(text, deliveryTargets)
  const asksExternalVerb = includesAny(text, externalVerbs)
  const asksDirectAutomation = includesAny(text, directTerms) || includesAny(compact, ['帮我直接投', '自动投递'])

  return asksExternalVerb && namesExternalTarget && asksDirectAutomation
}

function wantsResumeProposal(text: string, compact: string): boolean {
  const resumeTargets = [
    '简历',
    '项目经历',
    '工作经历',
    '个人简介',
    '技能',
    '履历',
    'resume',
    'bullet',
  ]
  const writeIntents = [
    '改',
    '修改',
    '优化',
    '补强',
    '润色',
    '替换',
    '重写',
    '更新',
    '完善',
    '调整',
    '改动提案',
    '待确认',
    'rewrite',
    'update',
    'revise',
    'improve',
  ]

  return (
    (includesAny(text, resumeTargets) && includesAny(text, writeIntents))
    || includesAny(compact, ['改简历', '优化简历', '生成简历改动提案', '简历提案'])
  )
}

function wantsJdSummary(text: string, compact: string): boolean {
  const jdTargets = ['jd', '岗位', '职位', '招聘要求', 'job description']
  const summaryIntents = [
    '匹配摘要',
    '匹配分析',
    '命中关键词',
    '缺失关键词',
    'top gaps',
    'gaps',
    '差距',
    '缺口',
    '匹配度',
    '摘要',
    '总结',
  ]

  return (
    (includesAny(text, jdTargets) && includesAny(text, summaryIntents))
    || includesAny(compact, ['jd摘要', 'jd匹配', 'jd分析', '岗位匹配摘要'])
  )
}

function wantsPersonaResumeProposal(text: string, compact: string, persona?: AgentReActPersonaRouting): boolean {
  const terms = persona?.routing?.resumeProposalTerms ?? []
  if (terms.length === 0) return false
  return includesAny(text, terms) || includesAny(compact, terms.map(term => compactText(term)))
}

function wantsPersonaJdSummary(text: string, compact: string, persona?: AgentReActPersonaRouting): boolean {
  const terms = persona?.routing?.jdSummaryTerms ?? []
  if (terms.length === 0) return false
  return includesAny(text, terms) || includesAny(compact, terms.map(term => compactText(term)))
}

function wantsPersonaReadOnlyReview(text: string, compact: string, persona?: AgentReActPersonaRouting): boolean {
  const terms = persona?.routing?.readOnlyReviewTerms ?? []
  if (terms.length === 0) return false
  return includesAny(text, terms) || includesAny(compact, terms.map(term => compactText(term)))
}

function wantsPersonaCompanyIntel(text: string, compact: string, persona?: AgentReActPersonaRouting): boolean {
  const terms = persona?.routing?.companyIntelTerms ?? []
  if (terms.length === 0) return false
  return includesAny(text, terms) || includesAny(compact, terms.map(term => compactText(term)))
}

function wantsPersonaQuestionTraining(text: string, compact: string, persona?: AgentReActPersonaRouting): boolean {
  const terms = persona?.routing?.questionTrainingTerms ?? []
  if (terms.length === 0) return false
  return includesAny(text, terms) || includesAny(compact, terms.map(term => compactText(term)))
}

function looksLikeJdInput(text: string, compact: string): boolean {
  const jdSignals = [
    '岗位职责',
    '职位描述',
    '任职要求',
    '工作职责',
    '岗位要求',
    '工作内容',
    'responsibilities',
    'requirements',
    'qualifications',
  ]
  const roleSignals = ['产品经理', '工程师', '架构师', '运营', '设计师', '分析师', '开发', '算法', '前端', '后端', '测试', '销售']
  const dutySignals = ['负责', '职责', '要求', '经验', '年以上', '熟悉', '对接', '落地', '建设', '设计', '推进']
  const compactDutySignals = dutySignals.map(term => compactText(term))
  const hasRole = includesAny(text, roleSignals)
  const hasDuty = includesAny(text, dutySignals) || includesAny(compact, compactDutySignals)
  const companyRoleOpening = /^[\u4e00-\u9fa5a-z0-9·.&（）()]{2,32}\s+(?:ai|aigc|大模型|智能体|agent|前端|后端|全栈|java|数据|算法|产品|项目|运营|设计|测试|架构|技术|业务|商业|增长|安全|云原生|devops)?\s*(?:产品经理|工程师|架构师|分析师|设计师|开发|运营|经理|负责人|专家|顾问)/i.test(text)

  return (
    (text.length >= 30 && includesAny(text, jdSignals))
    || (text.length >= 42 && hasRole && hasDuty)
    || (companyRoleOpening && hasDuty)
  )
}

function wantsExplicitPersonaRewrite(text: string, compact: string): boolean {
  const rewriteTerms = [
    '改写',
    '改成',
    '转换',
    '转成',
    '提案',
    '改动方案',
    '改动提案',
    '优化表达',
    '润色',
    '重写',
    'reframe',
    'rewrite',
    'revise',
  ]
  return includesAny(text, rewriteTerms) || includesAny(compact, rewriteTerms.map(term => compactText(term)))
}

function personaResumeProposalSkillId(persona?: AgentReActPersonaRouting): string | null {
  return persona?.routing?.resumeProposalSkillId ?? null
}

function personaJdSummarySkillId(persona?: AgentReActPersonaRouting): string | null {
  return persona?.routing?.jdSummarySkillId ?? null
}

function personaReadOnlyReviewSkillId(persona?: AgentReActPersonaRouting): string | null {
  return persona?.routing?.readOnlyReviewSkillId ?? null
}

function personaCompanyIntelSkillId(persona?: AgentReActPersonaRouting): string | null {
  return persona?.routing?.companyIntelSkillId ?? null
}

function personaQuestionTrainingSkillId(persona?: AgentReActPersonaRouting): string | null {
  return persona?.routing?.questionTrainingSkillId ?? null
}

function decision(input: AgentReActDecision): AgentReActDecision {
  return input
}

export function routeAgentReActTurn(userRequest: string, persona?: AgentReActPersonaRouting): AgentReActDecision {
  const text = normalizeText(userRequest)
  const compact = compactText(userRequest)

  if (wantsExternalAction(text, compact)) {
    return decision({
      action: 'blocked_external_action',
      toolId: null,
      effect: null,
      confirmationPolicy: null,
      statusBeforeConfirm: null,
      personaSkillId: null,
      reason: '用户请求包含外部平台投递、发送或联系动作，当前 Agent 没有外部执行授权。',
      safetyNote: '阻止直接外部动作；可以改为生成投递文案、JD 摘要或待确认简历提案。',
      userFacingSummary: '外部投递/发送动作已拦截。',
    })
  }

  const personaReadOnlyReview = wantsPersonaReadOnlyReview(text, compact, persona)
  const personaJdSummary = wantsPersonaJdSummary(text, compact, persona)
  const personaCompanyIntel = wantsPersonaCompanyIntel(text, compact, persona)
  const personaQuestionTraining = wantsPersonaQuestionTraining(text, compact, persona)
  const explicitPersonaRewrite = wantsExplicitPersonaRewrite(text, compact)

  if (personaQuestionTraining) {
    return decision({
      action: 'question_training_set',
      toolId: 'question_bank.generate_training_set',
      effect: 'write',
      confirmationPolicy: 'preview_required',
      statusBeforeConfirm: 'pending_confirmation',
      personaSkillId: personaQuestionTrainingSkillId(persona),
      reason: '当前智能体识别到用户需要个性化专项训练题，适合先生成可勾选的题目卡片。',
      safetyNote: 'LLM 只生成题目预览；写入题库必须由用户勾选并点击保存。',
      userFacingSummary: '生成可保存的专项训练题卡。',
    })
  }

  if (personaCompanyIntel || (personaCompanyIntelSkillId(persona) && looksLikeJdInput(userRequest, compact))) {
    return decision({
      action: 'company_intel_report',
      toolId: 'jd.company_intel_report',
      effect: 'read',
      confirmationPolicy: 'none',
      statusBeforeConfirm: 'ready',
      personaSkillId: personaCompanyIntelSkillId(persona),
      reason: '当前智能体识别到用户需要企业&岗位情报挖掘，适合调用公司情报搜索与报告生成链路。',
      safetyNote: '只读取 JD、搜索公开资料并生成报告，不写入简历或投递数据。',
      userFacingSummary: '生成企业&岗位情报完整报告。',
    })
  }

  if (personaReadOnlyReview && !personaJdSummary && !explicitPersonaRewrite && !wantsResumeProposal(text, compact)) {
    return decision({
      action: 'chat',
      toolId: null,
      effect: null,
      confirmationPolicy: null,
      statusBeforeConfirm: null,
      personaSkillId: personaReadOnlyReviewSkillId(persona),
      reason: '用户请求角色化只读点评，适合由当前智能体基于上下文直接诊断。',
      safetyNote: '只做分析和建议，不写入简历或投递数据。',
      userFacingSummary: '进入角色化只读点评。',
    })
  }

  if ((wantsPersonaResumeProposal(text, compact, persona) && explicitPersonaRewrite) || wantsResumeProposal(text, compact)) {
    return decision({
      action: 'resume_proposal',
      toolId: APPLY_RESUME_PROPOSAL_TOOL_ID,
      effect: 'write',
      confirmationPolicy: 'preview_required',
      statusBeforeConfirm: 'pending_confirmation',
      personaSkillId: wantsPersonaResumeProposal(text, compact, persona) ? personaResumeProposalSkillId(persona) : null,
      reason: persona?.id
        ? '当前智能体识别到用户需要角色化简历改写，必须先生成可审计的 before/after 提案。'
        : '用户请求修改或优化简历内容，需要先生成可审计的 before/after 提案。',
      safetyNote: 'LLM 只生成提案；写入必须经过用户确认后的工具调用。',
      userFacingSummary: '选择生成待确认简历改动提案。',
    })
  }

  if (personaJdSummary || wantsJdSummary(text, compact)) {
    return decision({
      action: 'jd_summary',
      toolId: JD_MATCH_SUMMARY_TOOL_ID,
      effect: 'read',
      confirmationPolicy: 'none',
      statusBeforeConfirm: 'ready',
      personaSkillId: personaJdSummary ? personaJdSummarySkillId(persona) : null,
      reason: persona?.id
        ? '当前智能体识别到用户需要角色化 JD 匹配分析，适合调用只读 JD 摘要工具。'
        : '用户请求 JD 匹配摘要、关键词命中或 gaps，适合调用只读 JD 摘要工具。',
      safetyNote: '只读取当前 JD 匹配结果，不写入简历或投递数据。',
      userFacingSummary: '选择生成 JD 匹配摘要。',
    })
  }

  if (personaReadOnlyReview) {
    return decision({
      action: 'chat',
      toolId: null,
      effect: null,
      confirmationPolicy: null,
      statusBeforeConfirm: null,
      personaSkillId: personaReadOnlyReviewSkillId(persona),
      reason: '用户请求角色化只读点评，适合由当前智能体基于上下文直接诊断。',
      safetyNote: '只做分析和建议，不写入简历或投递数据。',
      userFacingSummary: '进入角色化只读点评。',
    })
  }

  return decision({
    action: 'chat',
    toolId: null,
    effect: null,
    confirmationPolicy: null,
    statusBeforeConfirm: null,
    personaSkillId: null,
    reason: '用户请求不需要确定性工具，进入普通上下文问答。',
    safetyNote: '保持只读分析；如涉及写入，会引导用户生成待确认提案。',
    userFacingSummary: '进入普通上下文对话。',
  })
}
