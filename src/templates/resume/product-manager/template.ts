import { defineAsyncComponent } from 'vue'
import type { ResumeTemplateDefinition } from '../types'
import { resolveTemplatePreviewImage } from '../previewImage'

const ProductManagerTemplate: ResumeTemplateDefinition = {
  key: 'product-manager',
  name: '蓝色极简商务模板',
  tags: ['高管', '互联网', '极简'],
  category: 'product',
  description: '极简商务风格，适合产品经理和互联网岗位',
  previewImage: resolveTemplatePreviewImage(
    '../../../assets/templates/resume/product-manager-preview.svg',
    import.meta.url
  ),
  component: defineAsyncComponent(() => import('./ResumeTemplate.vue')),
}

export default ProductManagerTemplate
