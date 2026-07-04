import { BLACK_WHITE_LINEAR_TEMPLATE } from './black-white-linear/template'
import { BLUE_CARD_TEMPLATE } from './blue-card/template'
import { BLUE_LINEAR_TEMPLATE } from './blue-linear/template'
import { BLUE_SIDEBAR_CAREER_TEMPLATE } from './blue-sidebar-career/template'
import { BLUE_SPLIT_PRO_TEMPLATE } from './blue-split-pro/template'
import { DEFAULT_TEMPLATE } from './default/template'
import { GREEN_ICON_LINEAR_TEMPLATE } from './green-icon-linear/template'
import { WORKPLACE_GENERAL_TEMPLATE } from './workplace-general/template'
import ProductManagerTemplate from './product-manager/template'
import type { ResumeTemplateDefinition, ResumeTemplateKey } from './types'
import { TEMPLATE_CATEGORIES } from './categories'

export type { ResumeTemplateCategory, ResumeTemplateDefinition, ResumeTemplateKey, ResumeTemplateModel } from './types'
export { TEMPLATE_CATEGORIES, getCategoryInfo, getCategoryName } from './categories'

const LEGACY_TEMPLATE_ALIAS: Record<string, ResumeTemplateKey> = {
  'classic-blue': 'blue-linear',
}

function buildTemplateRegistry(templates: ResumeTemplateDefinition[]): ResumeTemplateDefinition[] {
  const keySet = new Set<string>()

  templates.forEach((template) => {
    if (!template.key?.trim()) {
      throw new Error('Resume template key is required.')
    }
    if (!template.name?.trim()) {
      throw new Error(`Resume template name is required. key=${template.key}`)
    }
    if (!template.previewImage?.trim()) {
      throw new Error(`Resume template previewImage is required. key=${template.key}`)
    }
    if (keySet.has(template.key)) {
      throw new Error(`Duplicate resume template key: ${template.key}`)
    }
    keySet.add(template.key)
  })

  return templates
}

export const RESUME_TEMPLATES = buildTemplateRegistry([
  DEFAULT_TEMPLATE,
  BLUE_LINEAR_TEMPLATE,
  GREEN_ICON_LINEAR_TEMPLATE,
  BLACK_WHITE_LINEAR_TEMPLATE,
  WORKPLACE_GENERAL_TEMPLATE,
  BLUE_SIDEBAR_CAREER_TEMPLATE,
  BLUE_SPLIT_PRO_TEMPLATE,
  BLUE_CARD_TEMPLATE,
  ProductManagerTemplate,
])

const TEMPLATE_MAP = RESUME_TEMPLATES.reduce<Record<string, ResumeTemplateDefinition>>((acc, template) => {
  acc[template.key] = template
  return acc
}, {})

const FALLBACK_TEMPLATE: ResumeTemplateDefinition = (() => {
  const template = TEMPLATE_MAP.default ?? RESUME_TEMPLATES[0]
  if (!template) {
    throw new Error('At least one resume template must be registered.')
  }
  return template
})()

export function isResumeTemplateKey(value: string): value is ResumeTemplateKey {
  return Boolean(TEMPLATE_MAP[value])
}

export function getResumeTemplateByKey(key: ResumeTemplateKey): ResumeTemplateDefinition {
  return TEMPLATE_MAP[key] ?? FALLBACK_TEMPLATE
}

export function normalizeResumeTemplateKey(value: unknown): ResumeTemplateKey {
  if (typeof value !== 'string') return FALLBACK_TEMPLATE.key
  const normalized = LEGACY_TEMPLATE_ALIAS[value] ?? value
  return isResumeTemplateKey(normalized) ? normalized : FALLBACK_TEMPLATE.key
}

/**
 * 按分类分组模板
 */
export function getTemplatesByCategory(): Map<ResumeTemplateDefinition['category'], ResumeTemplateDefinition[]> {
  const grouped = new Map<ResumeTemplateDefinition['category'], ResumeTemplateDefinition[]>()

  // 初始化所有分类
  for (const category of TEMPLATE_CATEGORIES) {
    grouped.set(category.id, [])
  }
  // 添加未分类
  grouped.set(undefined, [])

  for (const template of RESUME_TEMPLATES) {
    const category = template.category || undefined
    const templates = grouped.get(category) || []
    templates.push(template)
    grouped.set(category, templates)
  }

  return grouped
}

/**
 * 获取指定分类的模板列表
 */
export function getTemplatesByCategoryId(categoryId?: ResumeTemplateDefinition['category']): ResumeTemplateDefinition[] {
  if (!categoryId) return RESUME_TEMPLATES
  return RESUME_TEMPLATES.filter(t => t.category === categoryId)
}
