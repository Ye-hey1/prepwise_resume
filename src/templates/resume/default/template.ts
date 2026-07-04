import { defineAsyncComponent } from 'vue'
import type { ResumeTemplateDefinition } from '../types'

const ResumeTemplate = defineAsyncComponent(() => import('./ResumeTemplate.vue'))
import previewImage from '../../../assets/templates/resume/default-preview.svg'

export const DEFAULT_TEMPLATE: ResumeTemplateDefinition = {
  key: 'default',
  name: '默认模板',
  previewImage,
  tags: ['经典', '通用', '校招'],
  category: 'ats',
  description: '简洁经典，兼容 ATS 系统',
  component: ResumeTemplate,
}
