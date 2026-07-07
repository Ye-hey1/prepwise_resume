import { useJdAnalysisStore, type JdPrepHistoryItem } from '@/stores/jdAnalysis'
import {
  loadStoredResumeChangeProposals,
  type ResumeChangeProposal,
} from '@/services/agentResumeProposals'
import type { CandidateFitCoverage } from '@/services/jd/artifacts'
import type { InsightPriority, RequirementCategory, RequirementMatch, RequirementStatus } from '@/services/types/jd'

export interface JdMatchKeywordSummary {
  matched: string[]
  partial: string[]
  missing: string[]
}

export interface JdMatchGap {
  id: string
  requirement: string
  category: RequirementCategory
  priority: InsightPriority
  status: RequirementStatus
  evidence: string
  riskGaps: string[]
  action: string
  scoreImpact: number
}

export interface JdFactGap {
  id: string
  requirement: string
  reason: string
  suggestedEvidence: string
}

export interface JdConfirmedChange {
  id: string
  moduleLabel: string
  fieldLabel: string
  appliedAt: string
  summary: string
}

export interface JdMatchSummary {
  generatedAt: string
  analysisId: string
  company: string
  position: string
  score: number | null
  summary: string
  keywords: JdMatchKeywordSummary
  strengths: string[]
  gaps: JdMatchGap[]
  factGaps: JdFactGap[]
  confirmedChanges: JdConfirmedChange[]
  topActions: string[]
}

const MAX_KEYWORDS = 16
const MAX_GAPS = 8
const MAX_FACT_GAPS = 8
const MAX_CONFIRMED_CHANGES = 8
const MAX_TOP_ACTIONS = 6

const STATUS_RANK: Record<RequirementStatus, number> = {
  missing: 3,
  partial: 2,
  matched: 1,
}

const PRIORITY_RANK: Record<InsightPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

function uniqueList(items: string[], limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of items) {
    const text = cleanText(item)
    if (!text) continue
    const key = normalizeKey(text)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= limit) break
  }

  return result
}

function targetAnalysis(item: JdPrepHistoryItem | null): JdPrepHistoryItem | null {
  if (item?.matchResult) return item
  return null
}

function getActiveAnalysis(): JdPrepHistoryItem | null {
  const jdStore = useJdAnalysisStore()
  const current: JdPrepHistoryItem | null = jdStore.matchResult
    ? {
        id: jdStore.analysisMeta?.analysisId || 'current',
        company: jdStore.targetCompany || jdStore.jdData?.basicInfo.company || '',
        position: jdStore.targetPosition || jdStore.jdData?.basicInfo.jobTitle || '',
        jdText: jdStore.jdText,
        jdData: jdStore.jdData,
        matchResult: jdStore.matchResult,
        overview: jdStore.overview,
        prepInsight: jdStore.prepInsight,
        companyIntel: jdStore.companyIntel,
        interviewQuestions: jdStore.interviewQuestions,
        interviewBatchSummary: jdStore.interviewBatchSummary,
        suggestions: jdStore.suggestions,
        artifacts: jdStore.artifacts,
        analysisMeta: jdStore.analysisMeta,
        createdAt: jdStore.analysisMeta?.generatedAt || new Date().toISOString(),
        updatedAt: jdStore.analysisMeta?.generatedAt || new Date().toISOString(),
        status: 'completed',
      }
    : null

  return targetAnalysis(current) ?? jdStore.history.find((item) => Boolean(item.matchResult)) ?? null
}

function requirementText(item: RequirementMatch | CandidateFitCoverage): string {
  return cleanText(item.requirement)
}

function collectKeywordSummary(item: JdPrepHistoryItem): JdMatchKeywordSummary {
  const coverage = item.artifacts?.candidateFitGraph?.coverage
  const source = coverage?.length ? coverage : item.matchResult?.matches ?? []

  return {
    matched: uniqueList(source.filter(entry => entry.status === 'matched').map(requirementText), MAX_KEYWORDS),
    partial: uniqueList(source.filter(entry => entry.status === 'partial').map(requirementText), MAX_KEYWORDS),
    missing: uniqueList(source.filter(entry => entry.status === 'missing').map(requirementText), MAX_KEYWORDS),
  }
}

function scoreImpact(entry: Pick<CandidateFitCoverage, 'priority' | 'status' | 'riskGaps'>): number {
  const priority = PRIORITY_RANK[entry.priority] ?? 1
  const status = STATUS_RANK[entry.status] ?? 1
  const risk = entry.riskGaps.length > 0 ? 1 : 0
  return (priority * 10) + (status * 4) + risk
}

function coverageToGap(entry: CandidateFitCoverage): JdMatchGap {
  return {
    id: entry.requirementId,
    requirement: entry.requirement,
    category: entry.category,
    priority: entry.priority,
    status: entry.status,
    evidence: cleanText(entry.evidence) || '简历中未提及',
    riskGaps: uniqueList(entry.riskGaps, 4),
    action: cleanText(entry.action) || '补充能证明该要求的项目、职责或成果证据。',
    scoreImpact: scoreImpact(entry),
  }
}

function matchToGap(entry: RequirementMatch, index: number): JdMatchGap {
  const priority = entry.priority ?? 'medium'
  const riskGaps = entry.riskGaps ?? []
  return {
    id: `match-${index + 1}`,
    requirement: entry.requirement,
    category: entry.category,
    priority,
    status: entry.status,
    evidence: cleanText(entry.evidence) || '简历中未提及',
    riskGaps: uniqueList(riskGaps, 4),
    action: cleanText(entry.suggestion) || '补充能证明该要求的项目、职责或成果证据。',
    scoreImpact: scoreImpact({ priority, status: entry.status, riskGaps }),
  }
}

function collectGaps(item: JdPrepHistoryItem): JdMatchGap[] {
  const coverage = item.artifacts?.candidateFitGraph?.coverage
  const gaps = coverage?.length
    ? coverage
      .filter(entry => entry.status !== 'matched' || entry.riskGaps.length > 0)
      .map(coverageToGap)
    : (item.matchResult?.matches ?? [])
      .filter(entry => entry.status !== 'matched' || (entry.riskGaps?.length ?? 0) > 0)
      .map(matchToGap)

  return gaps
    .sort((a, b) => b.scoreImpact - a.scoreImpact)
    .slice(0, MAX_GAPS)
}

function collectFactGaps(gaps: JdMatchGap[]): JdFactGap[] {
  return gaps
    .filter(gap => gap.status !== 'matched' || gap.riskGaps.length > 0)
    .map((gap): JdFactGap => ({
      id: `fact-${gap.id}`,
      requirement: gap.requirement,
      reason: gap.riskGaps[0] || (gap.status === 'missing'
        ? '当前简历缺少直接证据。'
        : '当前证据偏弱，需要更明确的项目动作、范围或结果。'),
      suggestedEvidence: gap.action,
    }))
    .slice(0, MAX_FACT_GAPS)
}

function summarizeChange(proposal: ResumeChangeProposal): string {
  const beforeLength = cleanText(proposal.beforeText).length
  const afterLength = cleanText(proposal.afterText).length
  const direction = afterLength > beforeLength ? '补强' : afterLength < beforeLength ? '压缩' : '改写'
  return `${direction}：${proposal.reason}`
}

function collectConfirmedChanges(): JdConfirmedChange[] {
  return loadStoredResumeChangeProposals()
    .filter(proposal => proposal.status === 'applied' && proposal.appliedAt)
    .slice(0, MAX_CONFIRMED_CHANGES)
    .map(proposal => ({
      id: proposal.id,
      moduleLabel: proposal.moduleLabel,
      fieldLabel: proposal.fieldLabel,
      appliedAt: proposal.appliedAt ?? '',
      summary: summarizeChange(proposal),
    }))
}

function collectTopActions(gaps: JdMatchGap[], factGaps: JdFactGap[], confirmedChanges: JdConfirmedChange[]): string[] {
  return uniqueList([
    ...gaps.map(gap => gap.action),
    ...factGaps.map(gap => gap.suggestedEvidence),
    confirmedChanges.length > 0 ? '复查已确认改动是否覆盖 Top gaps，避免只改表达但未补证据。' : '',
  ], MAX_TOP_ACTIONS)
}

export function buildJdMatchSummary(): JdMatchSummary | null {
  const item = getActiveAnalysis()
  if (!item?.matchResult) return null

  const gaps = collectGaps(item)
  const factGaps = collectFactGaps(gaps)
  const confirmedChanges = collectConfirmedChanges()

  return {
    generatedAt: new Date().toISOString(),
    analysisId: item.analysisMeta?.analysisId || item.id,
    company: item.company || item.jdData?.basicInfo.company || '',
    position: item.position || item.jdData?.basicInfo.jobTitle || '',
    score: item.matchResult.score.total,
    summary: item.matchResult.summary,
    keywords: collectKeywordSummary(item),
    strengths: uniqueList(item.matchResult.strengths, MAX_KEYWORDS),
    gaps,
    factGaps,
    confirmedChanges,
    topActions: collectTopActions(gaps, factGaps, confirmedChanges),
  }
}

export function formatJdMatchSummaryForAgent(summary: JdMatchSummary): string {
  return [
    `目标岗位：${[summary.company, summary.position].filter(Boolean).join(' · ') || '未命名岗位'}`,
    `匹配分：${summary.score ?? '--'}`,
    `命中关键词：${summary.keywords.matched.join('、') || '无'}`,
    `部分命中：${summary.keywords.partial.join('、') || '无'}`,
    `缺失关键词：${summary.keywords.missing.join('、') || '无'}`,
    `Top gaps：${summary.gaps.map(gap => `${gap.requirement}（${gap.status}/${gap.priority}）`).join('；') || '无'}`,
    `事实缺口：${summary.factGaps.map(gap => `${gap.requirement}：${gap.reason}`).join('；') || '无'}`,
    `已确认改动：${summary.confirmedChanges.map(change => `${change.moduleLabel}/${change.fieldLabel}`).join('、') || '无'}`,
    `下一步：${summary.topActions.join('；') || '暂无'}`,
  ].join('\n')
}
