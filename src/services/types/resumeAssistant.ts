export type ResumeFieldAiModuleKey =
  | 'skills'
  | 'selfIntro'
  | 'workExperience'
  | 'projectExperience'
  | 'personalWorks'
  | 'trainingExperience'
  | 'education'
  | 'awards'
  | 'customSections'

export interface ResumeFieldAiContext {
  moduleKey: ResumeFieldAiModuleKey
  moduleLabel: string
  fieldKey: string
  fieldLabel: string
  currentText: string
  entryId?: string
  entryTitle?: string
  entryMeta?: Record<string, string>
  targetJob?: string
}

export interface ResumeAssistantApplyItem {
  id: string
  sectionId?: string
  original: string
  suggested: string
  reason: string
  applied: boolean
  category?: 'grammar' | 'content' | 'structure' | 'formatting'
  severity?: 'low' | 'medium' | 'high'
  riskLevel?: 'low' | 'medium' | 'high'
  evidenceState?: 'provided' | 'inferred' | 'needs_user_input'
  requiresConfirmation?: boolean
  evidenceNote?: string
  patchType?: 'replace' | 'rewrite' | 'insert' | 'delete'
}

export interface ResumeAdviceApplyResult {
  applyItems: ResumeAssistantApplyItem[]
}
