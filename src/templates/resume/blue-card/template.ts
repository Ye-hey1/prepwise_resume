import { defineAsyncComponent } from 'vue'
import type { ResumeTemplateDefinition } from '../types'

const ResumeTemplate = defineAsyncComponent(() => import('./ResumeTemplate.vue'))
import previewImage from '../../../assets/templates/resume/blue-card-preview.svg'

export const BLUE_CARD_TEMPLATE: ResumeTemplateDefinition = {
  key: 'blue-card',
  name: '蓝色现代卡片版',
  previewImage,
  tags: ['卡片', '现代', '清爽', '研发'],
  category: 'tech',
  description: '现代卡片设计，适合研发和工程师岗位',
  component: ResumeTemplate,
}
