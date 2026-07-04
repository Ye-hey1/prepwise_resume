import type { TemplateCategoryInfo, ResumeTemplateCategory } from './types'

/**
 * 简历模板分类配置
 * 按 8 大场景分组，降低用户选择模板的认知成本
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
    id: 'consulting',
    name: '咨询/金融',
    description: '专业简洁，突出教育背景和实习经历，适合咨询/金融岗位',
    icon: '👔',
    count: 0,
  },
  {
    id: 'academic',
    name: '学术/应届',
    description: '突出教育背景、科研成果和竞赛经历，适合应届生/学术岗位',
    icon: '🎓',
    count: 0,
  },
  {
    id: 'medical',
    name: '医疗/法律',
    description: '严谨专业，突出资质证书和专业经验，适合医疗/法律岗位',
    icon: '⚕️',
    count: 0,
  },
  {
    id: 'management',
    name: '管理/高管',
    description: '突出管理经验、团队业绩和战略视野，适合管理岗位',
    icon: '🎯',
    count: 1,
  },
  {
    id: 'design',
    name: '设计/创意',
    description: '创意排版，突出作品集和设计能力，适合设计/创意岗位',
    icon: '🎨',
    count: 0,
  },
]

/**
 * 获取分类信息
 */
export function getCategoryInfo(categoryId: ResumeTemplateCategory): TemplateCategoryInfo | undefined {
  return TEMPLATE_CATEGORIES.find(c => c.id === categoryId)
}

/**
 * 获取分类名称
 */
export function getCategoryName(categoryId: ResumeTemplateCategory): string {
  return getCategoryInfo(categoryId)?.name || '其他'
}
