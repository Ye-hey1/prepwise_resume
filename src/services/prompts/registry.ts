/**
 * Prompt 版本注册表
 * 统一管理所有 prompt 模板，支持版本切换和 A/B 测试
 */

export type PromptCategory =
  | 'resume-optimize'
  | 'resume-review'
  | 'project-sop'
  | 'jd-extract'
  | 'jd-match'
  | 'jd-overview'
  | 'jd-prep'
  | 'jd-company-intel'
  | 'jd-interview-bank'
  | 'jd-optimize'
  | 'interview-candidate'
  | 'interview-interviewer'
  | 'interview-hint'
  | 'interview-drill'
  | 'interview-evaluation'
  | 'interview-coaching'
  | 'resume-import'

export interface PromptVersion {
  id: string
  version: string
  label: string
  description: string
  isDefault: boolean
  createdAt: string
}

export interface PromptTemplate {
  category: PromptCategory
  versions: PromptVersion[]
  activeVersionId: string
}

/** Prompt 注册表 — 记录每个类别的版本信息 */
const promptRegistry = new Map<PromptCategory, PromptTemplate>()

/** 注册 prompt 版本 */
export function registerPromptVersion(
  category: PromptCategory,
  version: Omit<PromptVersion, 'createdAt'>,
) {
  let template = promptRegistry.get(category)
  if (!template) {
    template = {
      category,
      versions: [],
      activeVersionId: '',
    }
    promptRegistry.set(category, template)
  }

  const existing = template.versions.find(v => v.id === version.id)
  if (existing) return

  template.versions.push({
    ...version,
    createdAt: new Date().toISOString(),
  })

  if (version.isDefault || !template.activeVersionId) {
    template.activeVersionId = version.id
  }
}

/** 获取指定类别的活跃版本 ID */
export function getActivePromptVersionId(category: PromptCategory): string {
  const template = promptRegistry.get(category)
  return template?.activeVersionId ?? ''
}

/** 获取指定类别的活跃版本元信息 */
export function getActivePromptVersion(category: PromptCategory): PromptVersion | null {
  const template = promptRegistry.get(category)
  if (!template?.activeVersionId) return null
  return template.versions.find(v => v.id === template.activeVersionId) ?? null
}

/** 切换活跃版本 */
export function setActivePromptVersion(category: PromptCategory, versionId: string) {
  const template = promptRegistry.get(category)
  if (!template) return
  const exists = template.versions.some(v => v.id === versionId)
  if (exists) {
    template.activeVersionId = versionId
    // 持久化选择
    savePromptPreferences()
  }
}

/** 获取所有注册的 prompt 类别 */
export function getAllPromptCategories(): PromptTemplate[] {
  return Array.from(promptRegistry.values())
}

/** 获取指定类别的所有版本 */
export function getPromptVersions(category: PromptCategory): PromptVersion[] {
  return promptRegistry.get(category)?.versions ?? []
}

// ── 持久化 ──

const PREF_STORAGE_KEY = 'prepwise-prompt-preferences'

function savePromptPreferences() {
  if (typeof localStorage === 'undefined') return
  const prefs: Record<string, string> = {}
  for (const [category, template] of promptRegistry) {
    if (template.activeVersionId) {
      prefs[category] = template.activeVersionId
    }
  }
  localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(prefs))
}

export function loadPromptPreferences() {
  try {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(PREF_STORAGE_KEY)
    if (!raw) return
    const prefs = JSON.parse(raw) as Record<string, string>
    for (const [category, versionId] of Object.entries(prefs)) {
      const template = promptRegistry.get(category as PromptCategory)
      if (template && template.versions.some(v => v.id === versionId)) {
        template.activeVersionId = versionId
      }
    }
  } catch {
    // 忽略解析错误
  }
}

// ── 初始化注册默认版本 ──

registerPromptVersion('resume-optimize', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认简历优化 prompt，三版本输出（标准/数据驱动/专家架构）',
  isDefault: true,
})

registerPromptVersion('resume-review', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认简历审查 prompt，包含通用质量与 JD 适配评分规约',
  isDefault: true,
})

registerPromptVersion('project-sop', {
  id: 'v1-dossier-grounded',
  version: '1.0',
  label: '档案驱动版',
  description: '基于结构化项目档案生成 SOP、宣讲稿、深挖问答和路线图',
  isDefault: true,
})

registerPromptVersion('jd-extract', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认 JD 信息提取 prompt',
  isDefault: true,
})

registerPromptVersion('jd-match', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认简历-JD 匹配分析 prompt',
  isDefault: true,
})

registerPromptVersion('jd-overview', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认简历概览生成 prompt',
  isDefault: true,
})

registerPromptVersion('jd-prep', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认备面洞察 prompt',
  isDefault: true,
})

registerPromptVersion('jd-company-intel', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认公司情报 prompt',
  isDefault: true,
})

registerPromptVersion('jd-interview-bank', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认面试题库生成 prompt',
  isDefault: true,
})

registerPromptVersion('jd-optimize', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认优化建议 prompt',
  isDefault: true,
})

registerPromptVersion('interview-candidate', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认候选人模式面试 prompt',
  isDefault: true,
})

registerPromptVersion('interview-interviewer', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认面试官模式面试 prompt',
  isDefault: true,
})

registerPromptVersion('interview-hint', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认面试答题提示 prompt',
  isDefault: true,
})

registerPromptVersion('interview-drill', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认专项训练题生成 prompt',
  isDefault: true,
})

registerPromptVersion('interview-evaluation', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认专项训练评估 prompt',
  isDefault: true,
})

registerPromptVersion('interview-coaching', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认观摩学习 coaching prompt',
  isDefault: true,
})

registerPromptVersion('resume-import', {
  id: 'v1-standard',
  version: '1.0',
  label: '标准版',
  description: '默认简历导入解析 prompt',
  isDefault: true,
})

// 加载用户偏好
loadPromptPreferences()
