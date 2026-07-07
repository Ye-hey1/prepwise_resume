import type { CompanyIntelData } from '@/services/types/jd'
import { streamAIRequest, type AiConfig } from '@/services/stream'

export interface AgentCompanyIntelReportInput {
  company: string
  position: string
  jdText: string
  intel: CompanyIntelData
  personaPrompt: string
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function listText(items: unknown[] | undefined): string {
  const cleaned = (items ?? []).map(cleanText).filter(Boolean)
  return cleaned.length ? cleaned.join('；') : '未公开/待核验'
}

function sourceText(intel: CompanyIntelData): string {
  const details = intel.sourceDetails?.length
    ? intel.sourceDetails.map((source, index) => `${index + 1}. ${source.title}｜${source.providerLabel}｜${source.url}`)
    : (intel.sources ?? []).map((url, index) => `${index + 1}. ${url}`)
  return details.length ? details.slice(0, 8).join('\n') : '无可用来源'
}

function buildIntelBrief(input: AgentCompanyIntelReportInput): string {
  const { intel } = input
  return [
    `公司名称：${intel.companyName || input.company || '未公开/待核验'}`,
    `公司规模：${intel.companySize || '未公开/待核验'}`,
    `融资/上市：${intel.fundingStage || '未公开/待核验'}`,
    `成立年份：${intel.foundedYear || '未公开/待核验'}`,
    `所属行业：${intel.industry || '未公开/待核验'}`,
    `发展历程：${intel.companyHistory || '未公开/待核验'}`,
    `主营业务：${intel.businessScope || '未公开/待核验'}`,
    `核心产品线：${listText(intel.products)}`,
    `近期动态：${listText(intel.recentNews)}`,
    `组织结构：${intel.orgStructure || '未公开/待核验'}`,
    `文化价值观/工程文化：${intel.cultureNotes || '未公开/待核验'}`,
    `公开技术栈：${listText(intel.techStack)}`,
    `工作节奏/员工评价：${[intel.workPace, intel.employeeReviews].map(cleanText).filter(Boolean).join('；') || '未公开/待核验'}`,
    `面试流程：${intel.interviewProcess || '未公开/待核验'}`,
    `面试风格：${intel.interviewStyle || '未公开/待核验'}`,
    `高频考点：${listText(intel.frequentTopics)}`,
    `面试策略建议：${intel.howToReference || '未公开/待核验'}`,
    `竞品：${listText(intel.competitors)}`,
    `推荐反问：${listText(intel.reverseQuestions)}`,
    '',
    '来源：',
    sourceText(intel),
  ].join('\n')
}

function buildSystemPrompt(personaPrompt: string): string {
  return [
    '你负责将 JD、公司情报搜索结果和岗位上下文整理为面试备考可用的完整报告。',
    personaPrompt,
    '风格要求：职场克制、专业、冷静，不夸张，不使用营销式表达，不写鸡血口号。',
    '表达要求：直接输出报告，不要用身份声明、角色声明或自我介绍式开场。',
    '事实边界：公开资料不足时必须写“未公开/待核验”；基于 JD 或行业常识推断时必须标注“（基于 JD 推断）”或“（行业常见情况，需核验）”。',
    '不得编造公司融资、薪资、组织架构、加班、面试流程或竞品事实；可以给出审慎推断，但必须标注。',
    '必须覆盖用户要求的四类情报维度：企业基础情报、岗位深度情报、面试官&面试情报、竞品对比情报。',
    '输出必须是 Markdown，第一行固定为：# 企业&岗位情报完整报告',
    '报告必须分为四大模块：## 一、企业全景情报；## 二、岗位深度解析；## 三、面试备战指南；## 四、竞品对比分析。',
    '每个模块使用编号列表，面向面试备考，结论要具体到候选人该如何准备。',
  ].join('\n')
}

function buildUserMessage(input: AgentCompanyIntelReportInput): string {
  return [
    '请基于以下 JD 和结构化企业情报，输出完整报告。',
    '',
    `目标公司：${input.company || input.intel.companyName || '未识别'}`,
    `目标岗位：${input.position || '未识别'}`,
    '',
    '【岗位 JD】',
    input.jdText || '未提供完整 JD，请基于公司和岗位名称谨慎推断。',
    '',
    '【结构化企业情报】',
    buildIntelBrief(input),
    '',
    '【必须覆盖的字段清单】',
    '企业全景情报：公司全称、所属行业、融资阶段/上市状态、主营业务、核心产品线、市场规模、竞争对手、总部地点、分支机构、企业发展年限、近期融资/并购/新品动态、企业文化&价值观、组织架构特点。',
    '岗位深度解析：岗位所属部门、汇报对象、团队规模、核心工作内容拆解、岗位考核 KPI、硬性任职要求、隐性能力要求、加班/出差潜规则、同岗薪资区间、晋升路径、该岗位招聘高频面试题。',
    '面试备战指南：同类岗位常见面试流程、技术/业务面试侧重点、HR 面试高频提问、业务面重点考察方向、公司面试偏好候选人特质、简历/自我介绍适配优化方向。',
    '竞品对比分析：同赛道竞品同类岗位差异、该公司岗位优势/劣势、行业通用技术栈、业务痛点。',
  ].join('\n')
}

export async function streamAgentCompanyIntelReport(
  config: AiConfig,
  input: AgentCompanyIntelReportInput,
  callbacks: { onChunk: (fullText: string) => void },
  signal?: AbortSignal,
): Promise<void> {
  await streamAIRequest(
    config,
    buildSystemPrompt(input.personaPrompt),
    buildUserMessage(input),
    callbacks,
    signal,
    { timeoutMs: 120_000, maxRetries: 0 },
  )
}
