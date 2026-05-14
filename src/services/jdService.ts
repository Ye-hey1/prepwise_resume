/**
 * JD 分析服务 — 聚合入口
 * 将子模块的导出统一 re-export，保持外部 API 不变
 */
export type { AiConfig } from './stream'

export { formatResumeForAI } from './jd/formatResume'

export { extractJD } from './jd/extract'
export { matchResumeToJD } from './jd/match'
export { analyzeResumeOverview } from './jd/overview'
export { generateJdPrepInsight } from './jd/prep'
export { generateCompanyIntel } from './jd/companyIntel'
export { getJDOptimizationSuggestions } from './jd/optimize'
export { generateInterviewBank, generateFollowUpQuestions } from './jd/interviewBank'
export type { InterviewQuestion, FollowUpQuestion, InterviewBankBatch } from './jd/interviewBank'
export { buildInterviewDrivenSuggestions, mapScoreBreakdownToWeakModules, mapWeaknessTextsToModules } from './jd/weaknessMapping'
