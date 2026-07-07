import type {
  CompanyIntelData,
  InsightPriority,
  JDData,
  JDMatchResult,
  JDWeight,
  JdPrepInsight,
  RequirementCategory,
  RequirementMatch,
  RequirementStatus,
} from '../types/jd'

export interface JobRequirementArtifact {
  id: string
  text: string
  category: RequirementCategory
  weight: JDWeight
  priority: InsightPriority
}

export interface JobTargetProfile {
  targetRole: string
  company: string
  location: string
  techStack: string[]
  requirements: JobRequirementArtifact[]
  responsibilities: string[]
  focusAreas: string[]
  interviewThemes: string[]
  companyContext: {
    businessScope: string
    cultureNotes: string
    techStack: string[]
    reverseQuestions: string[]
  } | null
}

export interface CandidateFitCoverage {
  requirementId: string
  requirement: string
  category: RequirementCategory
  priority: InsightPriority
  status: RequirementStatus
  evidence: string
  evidenceList: string[]
  riskGaps: string[]
  action: string
  relatedQuestions: string[]
  relatedStories: string[]
}

export interface CandidateFitGraph {
  readinessScore: number
  strengths: string[]
  gaps: string[]
  coverage: CandidateFitCoverage[]
  missingRequirementIds: string[]
  highRiskRequirementIds: string[]
}

export interface JdAnalysisArtifacts {
  schemaVersion: 1
  generatedAt: string
  jobTargetProfile: JobTargetProfile | null
  candidateFitGraph: CandidateFitGraph | null
}

interface BuildArtifactsInput {
  jdData: JDData | null
  matchResult: JDMatchResult | null
  prepInsight: JdPrepInsight | null
  companyIntel?: CompanyIntelData | null
  generatedAt?: string
}

const CATEGORY_WEIGHT: Record<RequirementCategory, JDWeight> = {
  mustHave: 'required',
  niceToHave: 'preferred',
  degree: 'required',
  experience: 'required',
  techStack: 'preferred',
  jobDuties: 'preferred',
}

function normalizeKey(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

function createRequirementId(category: RequirementCategory, text: string, index: number): string {
  const normalized = normalizeKey(text)
    .replace(/[^\da-z\u4e00-\u9fa5]/gi, '')
    .slice(0, 24)
  return `${category}-${index + 1}-${normalized || 'item'}`
}

function priorityFromWeight(weight: JDWeight, category: RequirementCategory): InsightPriority {
  if (weight === 'required' || category === 'degree' || category === 'experience') return 'high'
  if (weight === 'preferred' || category === 'techStack') return 'medium'
  return 'low'
}

function buildRequirementArtifacts(jdData: JDData): JobRequirementArtifact[] {
  const items: Array<{ text: string; category: RequirementCategory; weight: JDWeight }> = []

  if (jdData.requirements.degree.trim()) {
    items.push({ text: jdData.requirements.degree.trim(), category: 'degree', weight: 'required' })
  }
  if (jdData.requirements.experience.trim()) {
    items.push({ text: jdData.requirements.experience.trim(), category: 'experience', weight: 'required' })
  }
  jdData.requirements.techStack.forEach((text) => {
    if (text.trim()) items.push({ text: text.trim(), category: 'techStack', weight: 'preferred' })
  })
  jdData.requirements.mustHave.forEach((item) => {
    if (item.text.trim()) items.push({ text: item.text.trim(), category: 'mustHave', weight: item.weight })
  })
  jdData.requirements.niceToHave.forEach((item) => {
    if (item.text.trim()) items.push({ text: item.text.trim(), category: 'niceToHave', weight: item.weight })
  })

  return items.map((item, index) => ({
    ...item,
    id: createRequirementId(item.category, item.text, index),
    priority: priorityFromWeight(item.weight, item.category),
  }))
}

function findMatchingRequirementMatch(
  requirement: JobRequirementArtifact,
  matches: RequirementMatch[],
): RequirementMatch | null {
  const requirementKey = normalizeKey(requirement.text)
  if (!requirementKey) return null

  return matches.find((match) => {
    const matchKey = normalizeKey(match.requirement)
    return match.category === requirement.category
      && (matchKey.includes(requirementKey) || requirementKey.includes(matchKey))
  }) ?? matches.find((match) => {
    const matchKey = normalizeKey(match.requirement)
    return matchKey.includes(requirementKey) || requirementKey.includes(matchKey)
  }) ?? null
}

function uniqueList(items: string[], limit = 8): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of items) {
    const text = item.trim()
    if (!text) continue
    const key = normalizeKey(text)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= limit) break
  }

  return result
}

function relatedQuestionsForRequirement(
  requirement: string,
  prepInsight: JdPrepInsight | null,
): string[] {
  if (!prepInsight) return []
  const key = normalizeKey(requirement)
  const questions = [
    ...prepInsight.highRiskFollowUps
      .filter(item => normalizeKey(`${item.question}${item.riskReason}${item.suggestion}`).includes(key.slice(0, 12)))
      .map(item => item.question),
    ...prepInsight.likelyQuestionGroups.flatMap(group => group.questions),
  ]

  return uniqueList(questions, 5)
}

function buildCoverage(
  requirements: JobRequirementArtifact[],
  matchResult: JDMatchResult,
  prepInsight: JdPrepInsight | null,
): CandidateFitCoverage[] {
  const coverage = requirements.map((requirement): CandidateFitCoverage => {
    const match = findMatchingRequirementMatch(requirement, matchResult.matches)
    const relatedStories = prepInsight?.recommendedStories
      .filter(story => normalizeKey(`${story.title}${story.reason}${story.talkingPoints.join('')}`)
        .includes(normalizeKey(requirement.text).slice(0, 10)))
      .map(story => story.title) ?? []

    return {
      requirementId: requirement.id,
      requirement: requirement.text,
      category: requirement.category,
      priority: match?.priority ?? requirement.priority,
      status: match?.status ?? 'missing',
      evidence: match?.evidence ?? '简历中未提及',
      evidenceList: match?.evidenceList ?? [],
      riskGaps: match?.riskGaps ?? [],
      action: match?.suggestion ?? '补充能证明该要求的项目、职责或成果证据。',
      relatedQuestions: relatedQuestionsForRequirement(requirement.text, prepInsight),
      relatedStories: uniqueList(relatedStories, 4),
    }
  })

  const knownRequirementIds = new Set(coverage.map(item => item.requirementId))
  const extraMatches = matchResult.matches
    .filter(match => !coverage.some(item => normalizeKey(item.requirement) === normalizeKey(match.requirement)))
    .map((match, index): CandidateFitCoverage => {
      const weight = CATEGORY_WEIGHT[match.category]
      const id = createRequirementId(match.category, match.requirement, knownRequirementIds.size + index)
      return {
        requirementId: id,
        requirement: match.requirement,
        category: match.category,
        priority: match.priority ?? priorityFromWeight(weight, match.category),
        status: match.status,
        evidence: match.evidence,
        evidenceList: match.evidenceList ?? [],
        riskGaps: match.riskGaps ?? [],
        action: match.suggestion || '继续补充更直接的证据。',
        relatedQuestions: relatedQuestionsForRequirement(match.requirement, prepInsight),
        relatedStories: [],
      }
    })

  return [...coverage, ...extraMatches]
}

function calculateReadinessScore(matchResult: JDMatchResult | null, coverage: CandidateFitCoverage[]): number {
  if (matchResult?.score.total) return matchResult.score.total
  if (!coverage.length) return 0

  const statusScores: Record<RequirementStatus, number> = {
    matched: 100,
    partial: 55,
    missing: 0,
  }
  const total = coverage.reduce((sum, item) => sum + statusScores[item.status], 0)
  return Math.round(total / coverage.length)
}

export function buildJdAnalysisArtifacts(input: BuildArtifactsInput): JdAnalysisArtifacts {
  if (!input.jdData) {
    return {
      schemaVersion: 1,
      generatedAt: input.generatedAt ?? '',
      jobTargetProfile: null,
      candidateFitGraph: null,
    }
  }

  const requirements = buildRequirementArtifacts(input.jdData)
  const focusAreas = uniqueList([
    ...(input.prepInsight?.focusAreas ?? []),
    ...(input.matchResult?.gaps ?? []),
  ], 8)
  const interviewThemes = uniqueList([
    ...(input.prepInsight?.prepPriorities ?? []),
    ...(input.prepInsight?.likelyQuestionGroups.map(group => group.title) ?? []),
  ], 8)

  const jobTargetProfile: JobTargetProfile = {
    targetRole: input.jdData.basicInfo.jobTitle,
    company: input.jdData.basicInfo.company,
    location: input.jdData.basicInfo.location,
    techStack: uniqueList([
      ...input.jdData.requirements.techStack,
      ...(input.companyIntel?.techStack ?? []),
    ], 16),
    requirements,
    responsibilities: [...input.jdData.requirements.jobDuties],
    focusAreas,
    interviewThemes,
    companyContext: input.companyIntel
      ? {
          businessScope: input.companyIntel.businessScope,
          cultureNotes: input.companyIntel.cultureNotes,
          techStack: [...input.companyIntel.techStack],
          reverseQuestions: [...input.companyIntel.reverseQuestions],
        }
      : null,
  }

  const coverage = input.matchResult
    ? buildCoverage(requirements, input.matchResult, input.prepInsight)
    : []
  const candidateFitGraph: CandidateFitGraph | null = input.matchResult
    ? {
        readinessScore: calculateReadinessScore(input.matchResult, coverage),
        strengths: [...input.matchResult.strengths],
        gaps: [...input.matchResult.gaps],
        coverage,
        missingRequirementIds: coverage
          .filter(item => item.status === 'missing')
          .map(item => item.requirementId),
        highRiskRequirementIds: coverage
          .filter(item => item.priority === 'high' && (item.status !== 'matched' || item.riskGaps.length > 0))
          .map(item => item.requirementId),
      }
    : null

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? '',
    jobTargetProfile,
    candidateFitGraph,
  }
}
