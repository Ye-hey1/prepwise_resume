import type { JDData, JDMatchResult } from '../types/jd'

export type RoleFamily = 'technical' | 'general'
export type JdContextState = 'none' | 'raw' | 'completed'
export type ReviewVerdict = 'ready' | 'needs_work' | 'high_risk'
export type ReviewPriority = 'high' | 'medium' | 'low'

export type ResumeReviewModuleKey =
  | 'basicInfo'
  | 'education'
  | 'skills'
  | 'workExperience'
  | 'projectExperience'
  | 'awards'
  | 'selfIntro'

export interface ReviewCategory {
  key: string
  label: string
  score: number
  max: number
  evidence: string
  deductions: string
  actionableAdvice: string
  relatedModuleKey: ResumeReviewModuleKey
  missingHardRequirement?: boolean
}

export interface ReviewTask {
  id: string
  priority: ReviewPriority
  title: string
  reason: string
  suggestion: string
  relatedModuleKey: ResumeReviewModuleKey
  sourceCategoryKey: string
  missingHardRequirement?: boolean
}

export interface ResumeReviewResult {
  id: string
  generatedAt: string
  targetRole: string
  roleFamily: RoleFamily
  jdContextState: JdContextState
  overallScore: number
  generalScore: number
  jdFitScore: number | null
  verdict: ReviewVerdict
  summary: string
  generalCategories: ReviewCategory[]
  jdFitCategories: ReviewCategory[]
  tasks: ReviewTask[]
  fairnessNotes: string
}

export interface CompletedJdReviewContext {
  jdData: JDData
  matchResult: JDMatchResult
  company: string
  position: string
}

interface BaseResumeReviewInput {
  resumeText: string
  targetRole: string
  roleFamily: RoleFamily
}

export type ResumeReviewInput =
  | (BaseResumeReviewInput & {
      jdContextState: 'none' | 'raw'
      completedJdContext: null
    })
  | (BaseResumeReviewInput & {
      jdContextState: 'completed'
      completedJdContext: CompletedJdReviewContext
    })
