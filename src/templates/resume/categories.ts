import type { TemplateCategoryInfo, ResumeTemplateCategory } from './types'

/**
 * 简历模板分类配置
 * 按场景分组，降低用户选择模板的认知成本
 */
export const TEMPLATE_CATEGORIES: (TemplateCategoryInfo & { count: number })[] = [
  {
    id: 'ats',
    name: 'ATS 通用',
    description: '格式标准，兼容 ATS 系统，适合大多数岗位投递',
    icon: '📄',
    count: 4,
  },
  {
    id: 'tech',
    name: '技术工程',
    description: '突出技术栈、项目经验和技术亮点，适合开发工程师',
    icon: '💻',
    count: 3,
  },
  {
    id: 'product',
    name: '产品/运营',
    description: '强调产品思维、数据分析和运营能力，适合产品经理/运营',
    icon: '📊',
    count: 1,
  },
  {
    id: 'management',
    name: '管理/高管',
    description: '突出管理经验、团队业绩和战略视野，适合管理岗位',
    icon: '🎯',
    count: 1,
  },
]

/**
 * 获取分类信息
 */
export function getCategoryInfo(categoryId: ResumeTemplateCategory): TemplateCategoryInfo | undefined {
  return TEMPLATE_CATEGORIES.find(c => c.id === categoryId)
}
