/**
 * JD 分析数据规范化函数
 * 纯函数集合：将 AI 返回的 unknown 数据安全地转换为类型化结构
 * 所有函数无外部依赖，100% 可单元测试
 */
import type {
  JDData,
  JDRequirementItem,
  JDMatchResult,
  ResumeOverview,
  JDSuggestion,
  JdPrepInsight,
  JdPrepModuleKey,
  MatchScore,
  RequirementMatch,
  RequirementCategory,
  RequirementStatus,
  InsightPriority,
  CompanyIntelData,
} from '../types/jd'
import { stripHtml } from '../stream'

// ── 基础工具 ──

/** 将可能为旧格式（纯字符串）或新格式（{text, weight}）的条目统一为 JDRequirementItem[] */
export function normalizeRequirementItems(
  raw: unknown,
  defaultWeight: 'required' | 'preferred' | 'bonus',
): JDRequirementItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    if (typeof item === 'string') {
      return { text: item, weight: defaultWeight }
    }
    return {
      text: item.text ?? '',
      weight: item.weight ?? defaultWeight,
    }
  })
}

/** 将可能为旧格式（纯字符串）的 jobDuties / techStack 统一为 string[] */
export function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string')
}

/** 清理 HTML 并规范化自由文本 */
export function normalizeFreeText(text: unknown): string {
  if (typeof text !== 'string') return ''
  return stripHtml(text)
}

/** 清理 HTML 并规范化文本（用于去重比较，全部小写） */
export function normalizeSuggestionContent(text: unknown): string {
  if (typeof text !== 'string') return ''
  return stripHtml(text).toLowerCase()
}

/** 去重 + 限制条目数量的文本列表 */
export function normalizeTextList(raw: unknown, limit = 6): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const list: string[] = []

  for (const item of raw) {
    const text = normalizeFreeText(item)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    list.push(text)
    if (list.length >= limit) break
  }

  return list
}

/** 合并多组文本列表并去重 */
export function mergeUniqueTextList(...groups: unknown[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const group of groups) {
    for (const item of normalizeTextList(group, 20)) {
      const key = item.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      result.push(item)
    }
  }

  return result
}

// ── 枚举校验 ──

export function normalizeRequirementCategory(raw: unknown, fallback: RequirementCategory = 'mustHave'): RequirementCategory {
  const allowed: RequirementCategory[] = ['mustHave', 'niceToHave', 'degree', 'experience', 'techStack', 'jobDuties']
  if (typeof raw === 'string' && allowed.includes(raw as RequirementCategory)) {
    return raw as RequirementCategory
  }
  return fallback
}

export function normalizeRequirementStatus(raw: unknown): RequirementStatus {
  if (raw === 'matched' || raw === 'partial' || raw === 'missing') return raw
  return 'missing'
}

export function normalizeInsightPriority(raw: unknown, fallback: InsightPriority = 'medium'): InsightPriority {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  return fallback
}

export function normalizePrepModuleKey(raw: unknown, fallback: JdPrepModuleKey = 'workExperience'): JdPrepModuleKey {
  const value = normalizeFreeText(raw)
  if (
    value === 'basicInfo'
    || value === 'education'
    || value === 'skills'
    || value === 'workExperience'
    || value === 'projectExperience'
    || value === 'awards'
    || value === 'selfIntro'
  ) {
    return value
  }
  return fallback
}

// ── 顶层规范化 ──

/** 规范化 JDData — 兼容旧格式（纯字符串数组）和新格式（带权重对象数组） */
export function normalizeJDData(data: unknown): JDData {
  const source = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const basicInfo = source.basicInfo && typeof source.basicInfo === 'object'
    ? source.basicInfo as Record<string, unknown>
    : {}
  const rawReq = source.requirements && typeof source.requirements === 'object'
    ? source.requirements as Record<string, unknown>
    : {}

  return {
    basicInfo: {
      jobTitle: typeof basicInfo.jobTitle === 'string' ? basicInfo.jobTitle : '',
      company: typeof basicInfo.company === 'string' ? basicInfo.company : '',
      location: typeof basicInfo.location === 'string' ? basicInfo.location : '',
      jobType: typeof basicInfo.jobType === 'string' ? basicInfo.jobType : '',
      department: typeof basicInfo.department === 'string' ? basicInfo.department : '',
    },
    requirements: {
      degree: typeof rawReq.degree === 'string' ? rawReq.degree : '',
      experience: typeof rawReq.experience === 'string' ? rawReq.experience : '',
      techStack: normalizeStringArray(rawReq.techStack),
      mustHave: normalizeRequirementItems(rawReq.mustHave, 'required'),
      niceToHave: normalizeRequirementItems(rawReq.niceToHave, 'preferred'),
      jobDuties: normalizeStringArray(rawReq.jobDuties ?? rawReq.jobDuties),
    },
  }
}

/** 规范化 MatchScore */
export function normalizeScore(source: unknown): MatchScore {
  const raw = source && typeof source === 'object' ? source as Record<string, unknown> : {}
  const readScore = (key: keyof MatchScore) => {
    const value = raw[key]
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(100, Math.round(value)))
      : 0
  }

  return {
    total: readScore('total'),
    mustHave: readScore('mustHave'),
    niceToHave: readScore('niceToHave'),
    techStack: readScore('techStack'),
    experience: readScore('experience'),
    degree: readScore('degree'),
    jobDuties: readScore('jobDuties'),
  }
}

/** 规范化单条 RequirementMatch */
export function normalizeRequirementMatch(raw: unknown): RequirementMatch | null {
  const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const requirement = normalizeFreeText(entry.requirement ?? entry.name ?? entry.text)
  if (!requirement) return null

  const evidenceList = normalizeTextList(entry.evidenceList ?? entry.matchingEvidence ?? entry.matching_evidence, 4)
  const evidence = normalizeFreeText(entry.evidence)
  const riskGaps = normalizeTextList(entry.riskGaps ?? entry.risk_gaps ?? entry.gaps, 4)
  const suggestion = normalizeFreeText(entry.suggestion ?? entry.action)
  const matchReason = normalizeFreeText(entry.matchReason ?? entry.match_reason)

  return {
    requirement,
    category: normalizeRequirementCategory(entry.category, 'mustHave'),
    status: normalizeRequirementStatus(entry.status),
    evidence: evidence || evidenceList[0] || '简历中未提及',
    suggestion,
    evidenceList,
    riskGaps,
    matchReason,
    priority: normalizeInsightPriority(entry.priority, riskGaps.length ? 'high' : 'medium'),
  }
}

/** 规范化 JDMatchResult */
export function normalizeMatchResult(raw: unknown): JDMatchResult {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const matchesRaw = Array.isArray(source.matches) ? source.matches : []

  return {
    score: normalizeScore(source.score),
    matches: matchesRaw
      .map((item) => normalizeRequirementMatch(item))
      .filter((item): item is RequirementMatch => Boolean(item)),
    summary: normalizeFreeText(source.summary),
    gaps: normalizeTextList(source.gaps, 8),
    strengths: normalizeTextList(source.strengths, 8),
  }
}

/** 规范化 RoleFit 条目 */
export function normalizeRoleFitItem(raw: unknown) {
  const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const role = normalizeFreeText(entry.role)
  const reason = normalizeFreeText(entry.reason)
  if (!role) return null

  return {
    role,
    fit: entry.fit === 'high' || entry.fit === 'medium' ? entry.fit : 'low',
    reason,
  }
}

/** 规范化 ResumeOverview */
export function normalizeResumeOverview(raw: unknown): ResumeOverview {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const roleFitRaw = Array.isArray(source.roleFit) ? source.roleFit : []

  return {
    headline: normalizeFreeText(source.headline ?? source.role_summary),
    highlights: normalizeTextList(source.highlights, 6),
    risks: normalizeTextList(source.risks, 6),
    roleFit: roleFitRaw
      .map((item) => normalizeRoleFitItem(item))
      .filter((item): item is ResumeOverview['roleFit'][number] => Boolean(item))
      .slice(0, 4),
  }
}

/** 规范化面试问题组 */
export function normalizeQuestionGroup(raw: unknown): JdPrepInsight['likelyQuestionGroups'][number] | null {
  const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const title = normalizeFreeText(entry.title ?? entry.topic)
  const intent = normalizeFreeText(entry.intent ?? entry.reason)
  const questions = normalizeTextList(entry.questions, 4)
  if (!title || !questions.length) return null

  return { title, intent, questions }
}

/** 规范化高风险追问 */
export function normalizeRiskFollowUpItem(raw: unknown): JdPrepInsight['highRiskFollowUps'][number] | null {
  const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const question = normalizeFreeText(entry.question)
  const riskReason = normalizeFreeText(entry.riskReason ?? entry.risk_reason)
  if (!question || !riskReason) return null

  return {
    question,
    riskReason,
    suggestion: normalizeFreeText(entry.suggestion),
    moduleKey: normalizePrepModuleKey(entry.moduleKey, 'workExperience'),
  }
}

/** 规范化推荐故事 */
export function normalizeStoryItem(raw: unknown): JdPrepInsight['recommendedStories'][number] | null {
  const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const title = normalizeFreeText(entry.title)
  const reason = normalizeFreeText(entry.reason)
  if (!title || !reason) return null

  return {
    title,
    reason,
    moduleKey: normalizePrepModuleKey(entry.moduleKey, 'projectExperience'),
    talkingPoints: normalizeTextList(entry.talkingPoints, 4),
  }
}

/** 规范化 JdPrepInsight */
export function normalizePrepInsight(raw: unknown): JdPrepInsight {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const recommendedStoriesRaw = Array.isArray(source.recommendedStories ?? source.recommended_stories)
    ? (source.recommendedStories ?? source.recommended_stories) as unknown[]
    : []
  const highRiskFollowUpsRaw = Array.isArray(source.highRiskFollowUps)
    ? source.highRiskFollowUps
    : Array.isArray(source.risk_gaps)
      ? source.risk_gaps
      : []
  const likelyQuestionGroupsRaw = Array.isArray(source.likelyQuestionGroups ?? source.likely_question_groups)
    ? (source.likelyQuestionGroups ?? source.likely_question_groups) as unknown[]
    : []

  return {
    summary: normalizeFreeText(source.summary),
    focusAreas: mergeUniqueTextList(source.focusAreas, source.focus_areas).slice(0, 6),
    recommendedStories: recommendedStoriesRaw
      .map((item) => normalizeStoryItem(item))
      .filter((item): item is JdPrepInsight['recommendedStories'][number] => Boolean(item))
      .slice(0, 4),
    highRiskFollowUps: highRiskFollowUpsRaw
      .map((item) => normalizeRiskFollowUpItem(item))
      .filter((item): item is JdPrepInsight['highRiskFollowUps'][number] => Boolean(item))
      .slice(0, 4),
    prepPriorities: mergeUniqueTextList(source.prepPriorities, source.prep_priorities).slice(0, 6),
    likelyQuestionGroups: likelyQuestionGroupsRaw
      .map((item) => normalizeQuestionGroup(item))
      .filter((item): item is JdPrepInsight['likelyQuestionGroups'][number] => Boolean(item))
      .slice(0, 4),
  }
}

/** 规范化单条优化建议 */
export function normalizeOptimizationSuggestion(raw: unknown): JDSuggestion | null {
  const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const section = normalizePrepModuleKey(entry.section, 'workExperience')
  const reason = normalizeFreeText(entry.reason)
  const suggestedText = normalizeFreeText(entry.suggestedText ?? entry.suggested_text ?? entry.rewrite)

  if (!reason || !suggestedText) return null

  const issueType = normalizeFreeText(entry.issueType ?? entry.issue_type) || '表达优化'
  const originalText = normalizeFreeText(entry.originalText ?? entry.original_text)
  const priorityRaw = normalizeFreeText(entry.priority).toLowerCase()
  const priority = priorityRaw === 'high' || priorityRaw === 'medium' || priorityRaw === 'low'
    ? priorityRaw
    : 'medium'

  return { section, issueType, originalText, suggestedText, priority, reason }
}

/** 规范化优化建议列表 */
export function normalizeOptimizationSuggestions(raw: unknown): JDSuggestion[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).suggestions)
      ? (raw as Record<string, unknown>).suggestions as unknown[]
      : []

  return list
    .map((item) => normalizeOptimizationSuggestion(item))
    .filter((item): item is JDSuggestion => Boolean(item))
    .slice(0, 12)
}

/** 规范化公司情报 */
export function normalizeCompanyIntel(raw: unknown): CompanyIntelData {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const sourceDetails = Array.isArray(source.sourceDetails ?? source.source_details)
    ? (source.sourceDetails ?? source.source_details) as unknown[]
    : []
  const normalizedSources = normalizeTextList(source.sources, 8)
  const fetchedAt = normalizeFreeText(source.fetchedAt ?? source.fetched_at)

  const normalizedSourceDetails = sourceDetails
    .map((item) => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const url = normalizeFreeText(entry.url)
      if (!url) return null

      return {
        title: normalizeFreeText(entry.title) || url,
        url,
        providerLabel: normalizeFreeText(entry.providerLabel ?? entry.provider_label) || 'Web',
        publishedAt: normalizeFreeText(entry.publishedAt ?? entry.published_at),
        fetchedAt: normalizeFreeText(entry.fetchedAt ?? entry.fetched_at ?? fetchedAt),
      }
    })
    .filter((item): item is CompanyIntelData['sourceDetails'][number] => Boolean(item))
    .slice(0, 8)

  return {
    companyName: normalizeFreeText(source.companyName ?? source.company_name),
    companyHistory: normalizeFreeText(source.companyHistory ?? source.company_history),
    businessScope: normalizeFreeText(source.businessScope ?? source.business_scope ?? source.mainBusiness ?? source.main_business),
    orgStructure: normalizeFreeText(source.orgStructure ?? source.org_structure),
    howToReference: normalizeFreeText(source.howToReference ?? source.how_to_reference),
    techStack: normalizeTextList(source.techStack ?? source.tech_stack, 10),
    cultureNotes: normalizeFreeText(source.cultureNotes ?? source.culture_notes),
    competitors: normalizeTextList(source.competitors, 5),
    reverseQuestions: normalizeTextList(source.reverseQuestions ?? source.reverse_questions, 5),
    sources: normalizedSources,
    sourceDetails: normalizedSourceDetails.length
      ? normalizedSourceDetails
      : normalizedSources.map(url => ({
        title: url,
        url,
        providerLabel: 'Web',
        publishedAt: '',
        fetchedAt,
      })),
    fetchedAt,
  }
}
