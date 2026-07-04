import { defineAsyncComponent } from 'vue'
import type { ResumeTemplateDefinition } from '../types'

const ResumeTemplate = defineAsyncComponent(() => import('./ResumeTemplate.vue'))
import previewImage from '../../../assets/templates/resume/workplace-general-preview.svg'

export const WORKPLACE_GENERAL_TEMPLATE: ResumeTemplateDefinition = {
  key: 'workplace-general',
  name: '通用职场简历',
  previewImage,
  tags: ['通用', '职场', '社招', '高级'],
  category: 'tech',
  description: '通用职场风格，适合技术开发岗位',
  component: ResumeTemplate,
}
