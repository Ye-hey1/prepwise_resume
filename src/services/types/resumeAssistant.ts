export type ResumeFieldAiModuleKey = 'skills' | 'selfIntro' | 'workExperience' | 'projectExperience' | 'education' | 'awards'

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

export interface ResumeAssistantSuggestion {
  id: string
  text: string
  tone?: string
  highlight?: string
}

export interface ResumeAssistantExampleItem {
  id: string
  moduleKey: ResumeFieldAiModuleKey
  text: string
  tags: string[]
  source: 'builtin' | 'ai'
  tone?: string
  highlight?: string
}

export interface ResumeAssistantAdviceItem {
  id: string
  title: string
  problem: string
  suggestion: string
  example?: string
}

export interface ResumeAssistantMaterialItem {
  id: string
  title: string
  moduleKey?: ResumeFieldAiModuleKey
  type: 'project' | 'achievement' | 'skill' | 'experience'
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface ResumeAssistantResult {
  suggestions: ResumeAssistantSuggestion[]
}

export interface ResumeAssistantAdviceResult {
  advice: ResumeAssistantAdviceItem[]
}

export type ResumeAssistantTabKey = 'examples' | 'advice' | 'materials'
