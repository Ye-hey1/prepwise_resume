import { defineAsyncComponent } from 'vue'
import type { ResumeTemplateDefinition } from '../types'

const ResumeTemplate = defineAsyncComponent(() => import('./ResumeTemplate.vue'))
import previewImage from '../../../assets/templates/resume/blue-sidebar-career-preview.svg'

export const BLUE_SIDEBAR_CAREER_TEMPLATE: ResumeTemplateDefinition = {
  key: 'blue-sidebar-career',
  name: '蓝色侧边栏职场版',
  previewImage,
  tags: ['侧边栏', '设计', '职场', '创意'],
  component: ResumeTemplate,
}
