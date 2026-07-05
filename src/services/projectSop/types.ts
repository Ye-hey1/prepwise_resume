export type ProjectSopStage = 'not_started' | 'in_progress' | 'launched' | 'iterating' | 'offline'
export type ProjectSopSource = 'manual' | 'resume_project'
export type ProjectSopArtifactTabKey = 'sop' | 'script1m' | 'script3m' | 'qa' | 'roadmap' | 'bonus'
export type ProjectSopQuestionDifficulty = 'normal' | 'pressure'

export interface ProjectSopAction {
  id: string
  title: string
  description: string
  input: string
  output: string
  owner: string
  acceptance: string
}

export interface ProjectSopChallenge {
  id: string
  type: 'business_logic' | 'execution_collaboration' | 'technical' | 'resource'
  problem: string
  rootCause: string
  solution: string
  result: string
}

export interface ProjectSopMetric {
  id: string
  name: string
  before: string
  after: string
  measurement: string
  businessValue: string
}

export interface ProjectSopDossier {
  id: string
  source: ProjectSopSource
  resumeProjectId: string
  linkedJdAnalysisId: string
  name: string
  industry: string
  businessLine: string
  startDate: string
  endDate: string
  stage: ProjectSopStage
  role: string
  responsibilities: string
  collaborationObjects: string
  teamSize: string
  background: string
  painPoints: string
  painImpact: string
  goals: string
  actions: ProjectSopAction[]
  keyDecisions: string
  challenges: ProjectSopChallenge[]
  metrics: ProjectSopMetric[]
  businessFeedback: string
  stakeholderRecognition: string
  shortcomings: string
  shortTermPlan: string
  longTermPlan: string
  reusableScenarios: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ProjectSopValidationIssue {
  field: string
  label: string
  message: string
  prompt: string
}

export interface ProjectSopValidation {
  completeness: number
  blockingIssues: ProjectSopValidationIssue[]
  warningIssues: ProjectSopValidationIssue[]
  canGenerate: boolean
}

export interface ProjectSopQuestion {
  id: string
  question: string
  area: 'execution' | 'decision' | 'challenge' | 'data' | 'role' | 'roadmap'
  difficulty: ProjectSopQuestionDifficulty
  interviewerIntent: string
  answerStrategy: string
  answer: string
}

export interface ProjectSopRoadmapItem {
  id: string
  horizon: 'short_term' | 'long_term'
  direction: string
  reason: string
  actions: string[]
  expectedBenefit: string
}

export interface ProjectSopArtifact {
  id: string
  dossierId: string
  sourceSignature: string
  linkedJdAnalysisId: string
  generatedAt: string
  schemaVersion: 1
  sopMarkdown: string
  scriptOneMinute: string
  scriptThreeMinutes: string
  questions: ProjectSopQuestion[]
  roadmap: ProjectSopRoadmapItem[]
  bonusMarkdown: string
  missingPlaceholders: string[]
}

export interface ProjectSopGenerationInput {
  dossier: ProjectSopDossier
  validation: ProjectSopValidation
  resumeProjectText: string
  jdContextText: string
}
