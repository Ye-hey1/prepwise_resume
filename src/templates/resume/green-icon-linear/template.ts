import { defineAsyncComponent } from 'vue'
import type { ResumeTemplateDefinition } from '../types'

const ResumeTemplate = defineAsyncComponent(() => import('./ResumeTemplate.vue'))
import previewImage from '../../../assets/templates/resume/green-icon-linear-preview.svg'

export const GREEN_ICON_LINEAR_TEMPLATE: ResumeTemplateDefinition = {
  key: 'green-icon-linear',
  name: '绿色图标线性模板',
  previewImage,
  tags: ['绿色', '图标', '小清新', '实习'],
  component: ResumeTemplate,
}
