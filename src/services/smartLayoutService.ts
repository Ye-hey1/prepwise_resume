/**
 * 智能排版服务 — AI 内容精简
 *
 * 收集简历中的富文本字段，通过 AI 精简表述，减少文字量，
 * 同时保持原始 HTML 格式不增加额外列表/换行。
 */

import type { ResolvedAiConfig } from '@/stores/aiConfig'
import { nonStreamAIRequest, stripHtml, cleanJsonResponse } from '@/services/stream'
import { buildSmartLayoutPrompt, type SmartLayoutField } from '@/services/prompts/smartLayoutPrompt'
import type { WorkEntry, ProjectEntry } from '@/stores/resume'

export interface SmartLayoutContentResult {
  success: boolean
  /** 精简后的字段内容（key → HTML） */
  optimizedFields: Record<string, string>
  /** 原始字段内容（key → HTML，用于撤销） */
  originalFields: Record<string, string>
  message: string
}

/** 收集简历中所有富文本字段（同时保留 HTML 和纯文本） */
function collectFields(data: {
  workList: WorkEntry[]
  projectList: ProjectEntry[]
  skills: string
  selfIntro: string
}): { fields: SmartLayoutField[]; htmlMap: Record<string, string> } {
  const fields: SmartLayoutField[] = []
  const htmlMap: Record<string, string> = {}

  for (let i = 0; i < data.workList.length; i++) {
    const w = data.workList[i]
    if (!w) continue
    const html = w.description ?? ''
    const text = stripHtml(html)
    if (text) {
      const key = `work_${i}_description`
      fields.push({ key, label: `${w.company || '工作'} - ${w.position || '描述'}`, html, text })
      htmlMap[key] = html
    }
  }

  for (let i = 0; i < data.projectList.length; i++) {
    const p = data.projectList[i]
    if (!p) continue
    const introHtml = p.introduction ?? ''
    const introText = stripHtml(introHtml)
    if (introText) {
      const key = `project_${i}_introduction`
      fields.push({ key, label: `${p.name || '项目'} - 项目简介`, html: introHtml, text: introText })
      htmlMap[key] = introHtml
    }
    const mainHtml = p.mainWork ?? ''
    const mainText = stripHtml(mainHtml)
    if (mainText) {
      const key = `project_${i}_mainWork`
      fields.push({ key, label: `${p.name || '项目'} - 主要工作`, html: mainHtml, text: mainText })
      htmlMap[key] = mainHtml
    }
  }

  const skillsText = stripHtml(data.skills)
  if (skillsText) {
    fields.push({ key: 'skills', label: '专业技能', html: data.skills, text: skillsText })
    htmlMap['skills'] = data.skills
  }

  const introText = stripHtml(data.selfIntro)
  if (introText) {
    fields.push({ key: 'selfIntro', label: '自我评价', html: data.selfIntro, text: introText })
    htmlMap['selfIntro'] = data.selfIntro
  }

  return { fields, htmlMap }
}

/** 将 AI 返回的精简内容写回 store */
export function applyOptimizedFields(
  store: {
    workList: WorkEntry[]
    projectList: ProjectEntry[]
    skills: string
    selfIntro: string
  },
  optimized: Record<string, string>,
): void {
  for (const [key, html] of Object.entries(optimized)) {
    if (key.startsWith('work_')) {
      const match = key.match(/^work_(\d+)_description$/)
      if (match) {
        const idx = parseInt(match[1]!)
        const entry = store.workList[idx]
        if (entry) entry.description = html
      }
    } else if (key.startsWith('project_')) {
      const introMatch = key.match(/^project_(\d+)_introduction$/)
      if (introMatch) {
        const idx = parseInt(introMatch[1]!)
        const entry = store.projectList[idx]
        if (entry) entry.introduction = html
      }
      const mainMatch = key.match(/^project_(\d+)_mainWork$/)
      if (mainMatch) {
        const idx = parseInt(mainMatch[1]!)
        const entry = store.projectList[idx]
        if (entry) entry.mainWork = html
      }
    } else if (key === 'skills') {
      store.skills = html
    } else if (key === 'selfIntro') {
      store.selfIntro = html
    }
  }
}

/**
 * AI 智能排版 — 精简简历内容
 *
 * AI 直接返回保持原始 HTML 格式的精简内容，不做格式转换。
 */
export async function optimizeResumeContent(
  storeData: {
    workList: WorkEntry[]
    projectList: ProjectEntry[]
    skills: string
    selfIntro: string
  },
  aiConfig: ResolvedAiConfig,
  targetJob?: string,
  signal?: AbortSignal,
): Promise<SmartLayoutContentResult> {
  const { fields, htmlMap } = collectFields(storeData)

  if (fields.length === 0) {
    return {
      success: true,
      optimizedFields: {},
      originalFields: {},
      message: '没有需要优化的内容',
    }
  }

  const { system, user } = buildSmartLayoutPrompt(fields, targetJob)

  try {
    const raw = await nonStreamAIRequest(
      aiConfig,
      system,
      user,
      { temperature: 0.3, maxTokens: 4096 },
      signal,
    )

    const jsonStr = cleanJsonResponse(raw)
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return {
        success: false,
        optimizedFields: {},
        originalFields: htmlMap,
        message: 'AI 返回格式异常',
      }
    }

    // AI 直接返回 HTML，无需转换
    const optimizedFields: Record<string, string> = {}
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && val.trim()) {
        optimizedFields[key] = val
      }
    }

    // 只记录原始中被修改的字段
    const originalFields: Record<string, string> = {}
    for (const key of Object.keys(optimizedFields)) {
      if (htmlMap[key] !== undefined) {
        originalFields[key] = htmlMap[key]
      }
    }

    return {
      success: Object.keys(optimizedFields).length > 0,
      optimizedFields,
      originalFields,
      message: '内容精简完成',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      optimizedFields: {},
      originalFields: htmlMap,
      message: `AI 优化失败: ${msg}`,
    }
  }
}
