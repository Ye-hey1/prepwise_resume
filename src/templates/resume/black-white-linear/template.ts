import { defineAsyncComponent } from 'vue'
import type { ResumeTemplateDefinition } from '../types'

const ResumeTemplate = defineAsyncComponent(() => import('./ResumeTemplate.vue'))
import previewImage from '../../../assets/templates/resume/black-white-linear-preview.svg'

export const BLACK_WHITE_LINEAR_TEMPLATE: ResumeTemplateDefinition = {
  key: 'black-white-linear',
  name: '黑白单色简约模板',
  previewImage,
  tags: ['黑白', '极简', '后端开发', '校招'],
  component: ResumeTemplate,
}
