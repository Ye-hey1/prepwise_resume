import { defineAsyncComponent } from 'vue'
import type { ResumeTemplateDefinition } from '../types'

const ResumeTemplate = defineAsyncComponent(() => import('./ResumeTemplate.vue'))
import previewImage from '../../../assets/templates/resume/blue-split-pro-preview.svg'

export const BLUE_SPLIT_PRO_TEMPLATE: ResumeTemplateDefinition = {
  key: 'blue-split-pro',
  name: '蓝色精英专业版',
  previewImage,
  tags: ['双栏', '高级', '精英', '管理岗'],
  component: ResumeTemplate,
}
