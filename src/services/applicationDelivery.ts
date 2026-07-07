import type { JdPrepHistoryItem } from '@/stores/jdAnalysis'
import type { ResumeReviewResult } from '@/services/resumeReview'

export type DeliveryPlatform = 'boss' | 'lagou' | 'liepin' | 'official' | 'referral' | 'other'
export type DeliveryReadinessStatus = 'pass' | 'warning' | 'blocker'
export type DeliveryReadinessState = 'ready' | 'review' | 'blocked'

export interface DeliveryResumeSnapshot {
  name: string
  phone: string
  email: string
  jobTitle: string
  expectedLocation: string
  expectedSalary: string
  skills: string
  workHighlights: string[]
  projectHighlights: string[]
}

export interface ApplicationDeliveryTrackerState {
  status?: string
  channel?: string
  platform?: DeliveryPlatform
  jobUrl?: string
  appliedAt?: string
  greeting?: string
}

export interface DeliveryReadinessItem {
  key: string
  label: string
  status: DeliveryReadinessStatus
  message: string
  action: string
}

export interface BossHelperMigrationConfig {
  platform: 'boss'
  searchQuery: string
  jobTitle: {
    include: boolean
    enable: boolean
    value: string[]
  }
  company: {
    include: boolean
    enable: boolean
    value: string[]
  }
  jobContent: {
    include: boolean
    enable: boolean
    value: string[]
  }
  salaryRangeText: string
  customGreeting: {
    enable: boolean
    value: string
  }
  filters: {
    sameCompanyFilter: boolean
    sameHrFilter: boolean
    activityFilter: boolean
    friendStatus: boolean
    goldHunterFilter: boolean
  }
  deliveryLimit: number
  delay: {
    deliveryStarts: number
    deliveryInterval: number
    deliveryPageNext: number
  }
  notes: string[]
}

export interface DeliveryPackage {
  jdId: string
  platform: DeliveryPlatform
  title: string
  company: string
  searchUrl: string
  greeting: string
  readinessScore: number
  readinessState: DeliveryReadinessState
  readinessItems: DeliveryReadinessItem[]
  riskFlags: string[]
  nextAction: string
  bossHelperConfig: BossHelperMigrationConfig
}

export interface BuildDeliveryPackageInput {
  jd: JdPrepHistoryItem
  tracker?: ApplicationDeliveryTrackerState
  resume: DeliveryResumeSnapshot
  review: ResumeReviewResult | null
}

const DEFAULT_BOSS_CITY = '100010000'
const BLOCKED_STATUSES = new Set(['applied', 'interviewing', 'offer'])

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function compactList(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  values.forEach((value) => {
    const text = cleanText(value)
    if (!text || seen.has(text)) return
    seen.add(text)
    result.push(text)
  })

  return result.slice(0, limit)
}

function truncateText(value: string, maxLength: number): string {
  const text = cleanText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function getJobTitle(jd: JdPrepHistoryItem): string {
  return cleanText(jd.position || jd.jdData?.basicInfo.jobTitle) || '目标岗位'
}

function getCompany(jd: JdPrepHistoryItem): string {
  return cleanText(jd.company || jd.jdData?.basicInfo.company)
}

export function buildBossSearchUrl(company: string, position: string): string {
  const url = new URL('https://www.zhipin.com/web/geek/job')
  const query = compactList([position, company], 2).join(' ')
  if (query) url.searchParams.set('query', query)
  url.searchParams.set('city', DEFAULT_BOSS_CITY)
  return url.toString()
}

function getPrimaryRequirements(jd: JdPrepHistoryItem): string[] {
  return compactList([
    ...(jd.jdData?.requirements.techStack ?? []),
    ...(jd.jdData?.requirements.mustHave ?? []).map((item) => item.text),
    ...(jd.jdData?.requirements.jobDuties ?? []),
  ], 4)
}

function getResumeStrengths(jd: JdPrepHistoryItem, resume: DeliveryResumeSnapshot): string[] {
  return compactList([
    ...(jd.matchResult?.strengths ?? []),
    resume.skills,
    ...resume.projectHighlights,
    ...resume.workHighlights,
  ], 3).map((item) => truncateText(item, 38))
}

export function buildDeliveryGreeting(input: BuildDeliveryPackageInput): string {
  const title = getJobTitle(input.jd)
  const company = getCompany(input.jd)
  const candidate = cleanText(input.resume.name)
  const requirements = getPrimaryRequirements(input.jd)
  const strengths = getResumeStrengths(input.jd, input.resume)

  const targetText = company ? `${company}的${title}` : title
  const intro = candidate ? `你好，我是${candidate}。` : '你好。'
  const requirementText = requirements.length
    ? `我关注到${targetText}岗位重点需要${requirements.slice(0, 3).join('、')}。`
    : `我关注到${targetText}岗位，和我的目标方向比较匹配。`
  const strengthText = strengths.length
    ? `我这边的匹配点主要是${strengths.slice(0, 2).join('；')}。`
    : '我已经根据岗位要求整理了相关简历材料。'

  return truncateText(`${intro}${requirementText}${strengthText}方便的话希望进一步沟通岗位要求，谢谢。`, 220)
}

function buildReadinessItems(input: BuildDeliveryPackageInput): DeliveryReadinessItem[] {
  const { jd, resume, review, tracker } = input
  const matchScore = jd.matchResult?.score.total ?? null
  const missingMustHave = jd.matchResult?.matches.filter((item) => item.category === 'mustHave' && item.status === 'missing') ?? []
  const partialMustHave = jd.matchResult?.matches.filter((item) => item.category === 'mustHave' && item.status === 'partial') ?? []
  const practiceCount = Math.max(jd.practiceCount ?? 0, jd.linkedInterviewRecordIds?.length ?? 0)
  const hasContact = Boolean(cleanText(resume.phone) || cleanText(resume.email))
  const title = getJobTitle(jd)
  const company = getCompany(jd)

  const items: DeliveryReadinessItem[] = []

  if (matchScore == null) {
    items.push({
      key: 'match',
      label: 'JD 匹配',
      status: 'blocker',
      message: '还没有岗位匹配结果，无法判断是否适合投递。',
      action: '先回到 JD 分析生成匹配结果',
    })
  } else if (matchScore < 60) {
    items.push({
      key: 'match',
      label: 'JD 匹配',
      status: 'blocker',
      message: `匹配分 ${matchScore}，投递命中率偏低。`,
      action: '优先处理硬性缺口后再投递',
    })
  } else if (matchScore < 75) {
    items.push({
      key: 'match',
      label: 'JD 匹配',
      status: 'warning',
      message: `匹配分 ${matchScore}，可以小范围试投。`,
      action: '投递前检查缺口是否已写进简历',
    })
  } else {
    items.push({
      key: 'match',
      label: 'JD 匹配',
      status: 'pass',
      message: `匹配分 ${matchScore}，具备推进基础。`,
      action: '可进入投递包',
    })
  }

  if (missingMustHave.length) {
    items.push({
      key: 'must-have',
      label: '硬性要求',
      status: 'blocker',
      message: `${missingMustHave.length} 项必备要求没有简历证据。`,
      action: '先补项目证据或调整目标岗位',
    })
  } else if (partialMustHave.length) {
    items.push({
      key: 'must-have',
      label: '硬性要求',
      status: 'warning',
      message: `${partialMustHave.length} 项必备要求证据偏弱。`,
      action: '把相关项目动作和结果写得更明确',
    })
  } else {
    items.push({
      key: 'must-have',
      label: '硬性要求',
      status: 'pass',
      message: '未发现明显必备项缺口。',
      action: '保持当前投递方向',
    })
  }

  if (!review) {
    items.push({
      key: 'review',
      label: '简历审查',
      status: 'warning',
      message: '还没有最新简历审查结果。',
      action: '建议投递前跑一次简历审查',
    })
  } else if (review.verdict === 'high_risk') {
    items.push({
      key: 'review',
      label: '简历审查',
      status: 'blocker',
      message: `审查分 ${review.overallScore}，存在高风险表达。`,
      action: '先处理高优先级审查任务',
    })
  } else if (review.verdict === 'needs_work') {
    items.push({
      key: 'review',
      label: '简历审查',
      status: 'warning',
      message: `审查分 ${review.overallScore}，仍有可优化项。`,
      action: '先处理高优先级任务，或作为试投岗位推进',
    })
  } else {
    items.push({
      key: 'review',
      label: '简历审查',
      status: 'pass',
      message: `审查分 ${review.overallScore}，简历质量可投递。`,
      action: '可复用当前简历版本',
    })
  }

  items.push({
    key: 'contact',
    label: '联系方式',
    status: hasContact ? 'pass' : 'blocker',
    message: hasContact ? '简历中已有电话或邮箱。' : '简历中缺少电话和邮箱。',
    action: hasContact ? '可直接投递' : '先补联系方式',
  })

  items.push({
    key: 'target',
    label: '岗位信息',
    status: title !== '目标岗位' && company ? 'pass' : 'warning',
    message: company ? `${company} · ${title}` : `${title} 缺少公司名。`,
    action: company ? '已可生成搜索入口' : '建议补充公司名，便于去重和检索',
  })

  if (jd.interviewQuestions.length || practiceCount > 0) {
    items.push({
      key: 'interview',
      label: '备面资产',
      status: practiceCount > 0 ? 'pass' : 'warning',
      message: practiceCount > 0 ? `已有 ${practiceCount} 次训练记录。` : `已生成 ${jd.interviewQuestions.length} 道题，但还未训练。`,
      action: practiceCount > 0 ? '投递后可快速进入面试准备' : '投递后建议立即专项训练',
    })
  } else {
    items.push({
      key: 'interview',
      label: '备面资产',
      status: 'warning',
      message: '还没有为该岗位生成面试题。',
      action: '投递后尽快生成专项题包',
    })
  }

  if (tracker?.status && BLOCKED_STATUSES.has(tracker.status)) {
    items.push({
      key: 'duplicate',
      label: '重复投递',
      status: 'warning',
      message: '该岗位已在追踪流程中推进。',
      action: '继续跟进，不建议重复投递',
    })
  } else {
    items.push({
      key: 'duplicate',
      label: '重复投递',
      status: 'pass',
      message: '本地记录未显示已投递。',
      action: '可打开渠道进行投递',
    })
  }

  return items
}

function scoreReadiness(items: DeliveryReadinessItem[]): number {
  if (!items.length) return 0
  const total = items.reduce((sum, item) => {
    if (item.status === 'pass') return sum + 100
    if (item.status === 'warning') return sum + 62
    return sum
  }, 0)
  return Math.round(total / items.length)
}

function getReadinessState(items: DeliveryReadinessItem[]): DeliveryReadinessState {
  if (items.some((item) => item.status === 'blocker')) return 'blocked'
  if (items.some((item) => item.status === 'warning')) return 'review'
  return 'ready'
}

function getNextAction(state: DeliveryReadinessState, items: DeliveryReadinessItem[]): string {
  const firstBlocker = items.find((item) => item.status === 'blocker')
  if (firstBlocker) return firstBlocker.action
  if (state === 'review') return '复制招呼语并小范围投递，同时处理黄色检查项'
  return '复制招呼语，打开 Boss，完成后标记已投递'
}

function buildBossHelperConfig(input: BuildDeliveryPackageInput, greeting: string): BossHelperMigrationConfig {
  const title = getJobTitle(input.jd)
  const company = getCompany(input.jd)
  const contentKeywords = compactList([
    ...(input.jd.jdData?.requirements.techStack ?? []),
    ...(input.jd.matchResult?.strengths ?? []),
  ], 5)

  return {
    platform: 'boss',
    searchQuery: compactList([title, company], 2).join(' '),
    jobTitle: {
      include: true,
      enable: Boolean(title && title !== '目标岗位'),
      value: title && title !== '目标岗位' ? [title] : [],
    },
    company: {
      include: true,
      enable: Boolean(company),
      value: company ? [company] : [],
    },
    jobContent: {
      include: true,
      enable: contentKeywords.length > 0,
      value: contentKeywords,
    },
    salaryRangeText: cleanText(input.resume.expectedSalary) || '未设置',
    customGreeting: {
      enable: true,
      value: greeting,
    },
    filters: {
      sameCompanyFilter: true,
      sameHrFilter: true,
      activityFilter: true,
      friendStatus: true,
      goldHunterFilter: false,
    },
    deliveryLimit: 1,
    delay: {
      deliveryStarts: 3,
      deliveryInterval: 5,
      deliveryPageNext: 60,
    },
    notes: [
      '迁移自 boss-helper 的筛选与招呼语思路，但当前主应用只生成投递包，不直接控制平台账号。',
      '如后续接入浏览器插件，应保留用户确认、去重、限速和日志记录。',
    ],
  }
}

export function buildDeliveryPackage(input: BuildDeliveryPackageInput): DeliveryPackage {
  const title = getJobTitle(input.jd)
  const company = getCompany(input.jd)
  const greeting = input.tracker?.greeting?.trim() || buildDeliveryGreeting(input)
  const readinessItems = buildReadinessItems(input)
  const readinessState = getReadinessState(readinessItems)
  const riskFlags = readinessItems
    .filter((item) => item.status !== 'pass')
    .map((item) => `${item.label}：${item.message}`)

  return {
    jdId: input.jd.id,
    platform: input.tracker?.platform ?? 'boss',
    title,
    company: company || '未填写公司',
    searchUrl: input.tracker?.jobUrl?.trim() || buildBossSearchUrl(company, title),
    greeting,
    readinessScore: scoreReadiness(readinessItems),
    readinessState,
    readinessItems,
    riskFlags,
    nextAction: getNextAction(readinessState, readinessItems),
    bossHelperConfig: buildBossHelperConfig(input, greeting),
  }
}

export function formatBossHelperConfig(config: BossHelperMigrationConfig): string {
  return JSON.stringify(config, null, 2)
}
