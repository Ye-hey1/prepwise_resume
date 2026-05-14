import { defineAsyncComponent } from 'vue'
import type { ResumeTemplateDefinition } from '../types'

const ResumeTemplate = defineAsyncComponent(() => import('./ResumeTemplate.vue'))
import previewImage from '../../../assets/templates/resume/blue-linear-preview.svg'

export const BLUE_LINEAR_TEMPLATE: ResumeTemplateDefinition = {
  key: 'blue-linear',
  name: '蓝色线性模板',
  previewImage,
  tags: ['蓝色', '线性', '经典', '社招'],
  component: ResumeTemplate,
}
