import type { Component } from 'vue'

export type ResumeTemplateCategory =
  | 'ats'
  | 'tech'
  | 'product'
  | 'management'

export interface ResumeTemplateModel {
  key: string
  name: string
  previewImage: string
  tags?: string[]
  category?: ResumeTemplateCategory
  description?: string
}

export interface ResumeTemplateDefinition extends ResumeTemplateModel {
  component: Component
}

export type ResumeTemplateKey = ResumeTemplateDefinition['key']

export interface TemplateCategoryInfo {
  id: ResumeTemplateCategory
  name: string
  description: string
  icon: string
}
