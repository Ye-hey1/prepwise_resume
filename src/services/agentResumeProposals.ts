import { useResumeStore } from '@/stores/resume'
import { cleanJsonResponse, nonStreamAIRequest, type AiConfig } from '@/services/stream'
import type { AgentAssistantContextSnapshot } from '@/composables/useAgentAssistantContext'

export type ResumeProposalStatus = 'pending' | 'applied' | 'rejected'

export type ResumeProposalApplyResult =
  | { ok: true }
  | { ok: false; reason: string }

export interface ResumeProposalTarget {
  id: string
  moduleKey: string
  moduleLabel: string
  fieldLabel: string
  currentText: string
  guidance: string
}

export interface ResumeChangeProposal {
  id: string
  targetId: string
  moduleKey: string
  moduleLabel: string
  fieldLabel: string
  beforeText: string
  afterText: string
  reason: string
  risk: string
  status: ResumeProposalStatus
  createdAt: string
  appliedAt?: string
  rejectedAt?: string
  revertedAt?: string
}

export interface GenerateResumeChangeProposalOptions {
  personaPrompt?: string
}

interface RawResumeProposal {
  targetId?: unknown
  afterText?: unknown
  reason?: unknown
  risk?: unknown
}

const MAX_TARGET_TEXT_CHARS = 1_200
const MAX_PROPOSALS = 5
const STORAGE_KEY = 'prepwise-agent-resume-proposals'
const MAX_STORED_PROPOSALS = 30

function createProposalId(): string {
  return `proposal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 16)).trim()}... [截断]`
}

function hasUsefulText(value: string): boolean {
  return value.trim().replace(/\s+/g, '').length > 0
}

function compactTargetText(value: string): string {
  return truncateText(value.replace(/\r\n/g, '\n').trim(), MAX_TARGET_TEXT_CHARS)
}

function normalizeStoredStatus(value: unknown): ResumeProposalStatus {
  return value === 'applied' || value === 'rejected' ? value : 'pending'
}

function normalizeStoredProposal(raw: unknown): ResumeChangeProposal | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<ResumeChangeProposal>
  const id = cleanText(item.id)
  const targetId = cleanText(item.targetId)
  const beforeText = cleanText(item.beforeText)
  const afterText = cleanText(item.afterText)
  if (!id || !targetId || !afterText) return null

  return {
    id,
    targetId,
    moduleKey: cleanText(item.moduleKey),
    moduleLabel: cleanText(item.moduleLabel) || '简历模块',
    fieldLabel: cleanText(item.fieldLabel) || targetId,
    beforeText,
    afterText,
    reason: cleanText(item.reason) || '提升表达清晰度和岗位匹配度。',
    risk: cleanText(item.risk) || '请确认建议内容仍符合真实经历。',
    status: normalizeStoredStatus(item.status),
    createdAt: cleanText(item.createdAt) || new Date().toISOString(),
    appliedAt: cleanText(item.appliedAt) || undefined,
    rejectedAt: cleanText(item.rejectedAt) || undefined,
    revertedAt: cleanText(item.revertedAt) || undefined,
  }
}

function readStoredProposalList(): ResumeChangeProposal[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeStoredProposal(item))
      .filter((item): item is ResumeChangeProposal => Boolean(item))
      .slice(0, MAX_STORED_PROPOSALS)
  } catch {
    return []
  }
}

export function loadStoredResumeChangeProposals(): ResumeChangeProposal[] {
  return readStoredProposalList()
}

export function saveStoredResumeChangeProposals(proposals: ResumeChangeProposal[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(proposals.slice(0, MAX_STORED_PROPOSALS)))
}

export function clearStoredResumeChangeProposals() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

function updateStoredProposal(proposal: ResumeChangeProposal) {
  const stored = readStoredProposalList()
  const index = stored.findIndex((item) => item.id === proposal.id)
  if (index >= 0) {
    stored.splice(index, 1, proposal)
  } else {
    stored.unshift(proposal)
  }
  saveStoredResumeChangeProposals(stored)
}

function targetFieldAccessor(targetId: string): {
  get: () => string | null
  set: (value: string) => boolean
} | null {
  const resumeStore = useResumeStore()

  if (targetId === 'skills') {
    return {
      get: () => resumeStore.skills,
      set: (value: string) => {
        resumeStore.skills = value
        return true
      },
    }
  }

  if (targetId === 'selfIntro') {
    return {
      get: () => resumeStore.selfIntro,
      set: (value: string) => {
        resumeStore.selfIntro = value
        return true
      },
    }
  }

  const [kind, firstId, secondId, field] = targetId.split(':')

  if (kind === 'work' && firstId && secondId === 'description') {
    const item = resumeStore.workList.find((entry) => entry.id === firstId)
    if (!item) return null
    return {
      get: () => item.description,
      set: (value: string) => {
        item.description = value
        return true
      },
    }
  }

  if (kind === 'project' && firstId && (secondId === 'introduction' || secondId === 'mainWork')) {
    const item = resumeStore.projectList.find((entry) => entry.id === firstId)
    if (!item) return null
    return {
      get: () => item[secondId],
      set: (value: string) => {
        item[secondId] = value
        return true
      },
    }
  }

  if (kind === 'personalWork' && firstId && secondId === 'contribution') {
    const item = resumeStore.personalWorkList.find((entry) => entry.id === firstId)
    if (!item) return null
    return {
      get: () => item.contribution,
      set: (value: string) => {
        item.contribution = value
        return true
      },
    }
  }

  if (kind === 'training' && firstId && secondId === 'description') {
    const item = resumeStore.trainingList.find((entry) => entry.id === firstId)
    if (!item) return null
    return {
      get: () => item.description,
      set: (value: string) => {
        item.description = value
        return true
      },
    }
  }

  if (kind === 'award' && firstId && secondId === 'description') {
    const item = resumeStore.awardList.find((entry) => entry.id === firstId)
    if (!item) return null
    return {
      get: () => item.description,
      set: (value: string) => {
        item.description = value
        return true
      },
    }
  }

  if (kind === 'custom' && firstId && secondId && field === 'description') {
    const section = resumeStore.customSectionList.find((entry) => entry.id === firstId)
    const item = section?.items.find((entry) => entry.id === secondId)
    if (!item) return null
    return {
      get: () => item.description,
      set: (value: string) => {
        item.description = value
        return true
      },
    }
  }

  return null
}

export function collectResumeProposalTargets(): ResumeProposalTarget[] {
  const resumeStore = useResumeStore()
  const targets: ResumeProposalTarget[] = []

  const addTarget = (
    id: string,
    moduleKey: string,
    moduleLabel: string,
    fieldLabel: string,
    currentText: string,
    guidance: string,
  ) => {
    const normalized = compactTargetText(currentText)
    if (!hasUsefulText(normalized)) return
    targets.push({ id, moduleKey, moduleLabel, fieldLabel, currentText: normalized, guidance })
  }

  addTarget(
    'skills',
    'skills',
    '专业技能',
    '技能文本',
    resumeStore.skills,
    '适合补强 JD 技术栈、技能分类和熟练度表达，不要新增没有证据的技能。',
  )
  addTarget(
    'selfIntro',
    'selfIntro',
    '个人简介',
    '简介文本',
    resumeStore.selfIntro,
    '适合调整职业定位、核心优势和 JD 适配度，保持 2-4 句。',
  )

  resumeStore.workList.forEach((item, index) => {
    addTarget(
      `work:${item.id}:description`,
      'workExperience',
      '工作经历',
      `${item.company || `工作经历 ${index + 1}`} · 工作描述`,
      item.description,
      '适合优化职责、动作、结果和量化表达；不要编造公司、岗位或指标。',
    )
  })

  resumeStore.projectList.forEach((item, index) => {
    addTarget(
      `project:${item.id}:introduction`,
      'projectExperience',
      '项目经历',
      `${item.name || `项目 ${index + 1}`} · 项目介绍`,
      item.introduction,
      '适合压缩项目背景、定位技术价值和业务价值。',
    )
    addTarget(
      `project:${item.id}:mainWork`,
      'projectExperience',
      '项目经历',
      `${item.name || `项目 ${index + 1}`} · 主要工作`,
      item.mainWork,
      '适合优化 bullet、技术动作、难点和结果表达；不要新增未证明的指标。',
    )
  })

  resumeStore.personalWorkList.forEach((item, index) => {
    addTarget(
      `personalWork:${item.id}:contribution`,
      'personalWorks',
      '个人作品',
      `${item.name || `个人作品 ${index + 1}`} · 贡献`,
      item.contribution || item.description,
      '适合突出个人贡献、技术实现和可展示成果。',
    )
  })

  resumeStore.trainingList.forEach((item, index) => {
    addTarget(
      `training:${item.id}:description`,
      'trainingExperience',
      '培训经历',
      `${item.course || `培训经历 ${index + 1}`} · 描述`,
      item.description || item.outcome,
      '适合提炼课程收获、证书价值和与目标岗位相关性。',
    )
  })

  resumeStore.awardList.forEach((item, index) => {
    addTarget(
      `award:${item.id}:description`,
      'awards',
      '荣誉奖项',
      `${item.name || `荣誉奖项 ${index + 1}`} · 描述`,
      item.description,
      '适合补足奖项含金量、范围和评价标准；不要夸大级别。',
    )
  })

  resumeStore.customSectionList.forEach((section) => {
    section.items.forEach((item, index) => {
      addTarget(
        `custom:${section.id}:${item.id}:description`,
        'customSections',
        section.title || '自定义模块',
        `${item.title || `自定义条目 ${index + 1}`} · 描述`,
        item.description,
        '适合优化自定义经历的价值表达，保持与原始事实一致。',
      )
    })
  })

  return targets
}

function targetCatalogText(targets: ResumeProposalTarget[]): string {
  return targets.map((target) => [
    `targetId: ${target.id}`,
    `模块: ${target.moduleLabel}`,
    `字段: ${target.fieldLabel}`,
    `当前内容: ${target.currentText}`,
    `约束: ${target.guidance}`,
  ].join('\n')).join('\n\n---\n\n')
}

function proposalSchemaHint(targets: ResumeProposalTarget[]): string {
  return [
    '只返回 JSON，不要 Markdown 代码块，不要解释。',
    'JSON 格式：',
    '{"proposals":[{"targetId":"从可用 targetId 中选择","afterText":"建议替换后的完整字段文本","reason":"为什么这样改","risk":"风险或需要用户确认的事实"}]}',
    `最多 ${MAX_PROPOSALS} 条。targetId 必须来自可用列表：${targets.map((target) => target.id).join(', ')}`,
  ].join('\n')
}

function normalizeRawProposals(rawText: string): RawResumeProposal[] {
  const parsed = JSON.parse(cleanJsonResponse(rawText)) as unknown
  if (Array.isArray(parsed)) return parsed as RawResumeProposal[]
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { proposals?: unknown }).proposals)) {
    return (parsed as { proposals: RawResumeProposal[] }).proposals
  }
  return []
}

function normalizeProposals(rawItems: RawResumeProposal[], targets: ResumeProposalTarget[]): ResumeChangeProposal[] {
  const targetMap = new Map(targets.map((target) => [target.id, target]))
  const seenTargets = new Set<string>()
  const proposals: ResumeChangeProposal[] = []

  for (const item of rawItems) {
    const targetId = cleanText(item.targetId)
    const target = targetMap.get(targetId)
    if (!target || seenTargets.has(targetId)) continue

    const afterText = cleanText(item.afterText)
    if (!afterText || afterText === target.currentText) continue

    seenTargets.add(targetId)
    proposals.push({
      id: createProposalId(),
      targetId,
      moduleKey: target.moduleKey,
      moduleLabel: target.moduleLabel,
      fieldLabel: target.fieldLabel,
      beforeText: target.currentText,
      afterText,
      reason: truncateText(cleanText(item.reason) || '提升表达清晰度和岗位匹配度。', 360),
      risk: truncateText(cleanText(item.risk) || '请确认建议内容仍符合真实经历。', 360),
      status: 'pending',
      createdAt: new Date().toISOString(),
    })

    if (proposals.length >= MAX_PROPOSALS) break
  }

  return proposals
}

export async function generateResumeChangeProposals(
  config: AiConfig,
  context: AgentAssistantContextSnapshot,
  userRequest: string,
  options: GenerateResumeChangeProposalOptions = {},
): Promise<ResumeChangeProposal[]> {
  const targets = collectResumeProposalTargets()
  if (targets.length === 0) {
    throw new Error('当前简历没有可生成改动提案的文本字段。')
  }

  const systemPrompt = [
    '你是严格的简历改动提案生成器。',
    '你只能基于用户简历已有事实、JD 分析、审查结果和面试反馈生成“待确认改动提案”。',
    '禁止编造不存在的经历、公司、指标、技术栈或成果。',
    '禁止声称已经修改或保存。你的输出只是一组待用户确认的提案。',
    options.personaPrompt ? `【当前智能体要求】\n${options.personaPrompt}` : '',
    proposalSchemaHint(targets),
  ].filter(Boolean).join('\n')

  const userMessage = [
    '【用户请求】',
    userRequest,
    '',
    '【项目上下文】',
    context.contextText || '暂无上下文。',
    '',
    '【可修改目标字段】',
    targetCatalogText(targets),
  ].join('\n')

  const rawText = await nonStreamAIRequest(
    config,
    systemPrompt,
    userMessage,
    { temperature: 0.2, maxTokens: 2600 },
  )

  return normalizeProposals(normalizeRawProposals(rawText), targets)
}

export function applyResumeChangeProposal(proposal: ResumeChangeProposal): ResumeProposalApplyResult {
  const resumeStore = useResumeStore()
  const accessor = targetFieldAccessor(proposal.targetId)
  if (!accessor) return { ok: false, reason: '目标字段已不存在或不受支持。' }

  const currentText = accessor.get()
  if (currentText === null) return { ok: false, reason: '目标字段已不存在。' }
  if (currentText !== proposal.beforeText && currentText !== proposal.afterText) {
    return { ok: false, reason: '目标字段已被手动修改，请重新生成提案后再应用。' }
  }

  if (!accessor.set(proposal.afterText)) return { ok: false, reason: '写入目标字段失败。' }
  proposal.status = 'applied'
  proposal.appliedAt = new Date().toISOString()
  proposal.rejectedAt = undefined
  proposal.revertedAt = undefined
  resumeStore.saveToStorage('auto')
  updateStoredProposal(proposal)
  return { ok: true }
}

export function rejectResumeChangeProposal(proposal: ResumeChangeProposal) {
  proposal.status = 'rejected'
  proposal.rejectedAt = new Date().toISOString()
  updateStoredProposal(proposal)
}

export function revertResumeChangeProposal(proposal: ResumeChangeProposal): ResumeProposalApplyResult {
  const resumeStore = useResumeStore()
  const accessor = targetFieldAccessor(proposal.targetId)
  if (!accessor) return { ok: false, reason: '目标字段已不存在或不受支持。' }

  const currentText = accessor.get()
  if (currentText === null) return { ok: false, reason: '目标字段已不存在。' }
  if (currentText !== proposal.afterText) {
    return { ok: false, reason: '目标字段已被继续修改，为避免覆盖你的新编辑，已阻止撤回。' }
  }

  if (!accessor.set(proposal.beforeText)) return { ok: false, reason: '撤回写入失败。' }
  proposal.status = 'pending'
  proposal.appliedAt = undefined
  proposal.revertedAt = new Date().toISOString()
  resumeStore.saveToStorage('auto')
  updateStoredProposal(proposal)
  return { ok: true }
}
