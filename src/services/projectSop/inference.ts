import { runJsonTask } from '@/services/aiTaskRuntime'
import { safeJsonStringify, type AiConfig } from '@/services/stream'
import {
  createEmptyProjectSopAction,
  createEmptyProjectSopChallenge,
  createEmptyProjectSopMetric,
  normalizeProjectSopStage,
} from './validation'
import type {
  ProjectSopAction,
  ProjectSopChallenge,
  ProjectSopDossier,
  ProjectSopMetric,
} from './types'

const PROJECT_SOP_INFERENCE_SYSTEM_PROMPT = `你是一位资深项目复盘顾问和技术面试教练。你的任务是把“简历里的项目描述 + JD 上下文 + 联网公开资料摘要”转成结构化项目 SOP 档案，供后续生成 SOP 文档和面试逐字稿。

事实规则：
1. 可以基于简历项目原文、JD 要求、公开资料，对行业背景、技术方案、项目目标、执行动作、难点、优化方向做合理推断。
2. 禁止编造上线数据、业务反馈、老板评价、团队规模、真实技术细节或用户规模。
3. 如果某个结果类字段没有原文依据，用“[待补充：字段]”表达，不要写看似真实的数字。
4. 公开资料只能作为行业/技术/面试考察背景，不要说成候选人真实做过。
5. 输出必须是合法 JSON，不要 Markdown 代码块，不要解释。`

const PROJECT_SOP_INFERENCE_SCHEMA = `{
  "name": string,
  "industry": string,
  "businessLine": string,
  "stage": "not_started | in_progress | launched | iterating | offline",
  "role": string,
  "responsibilities": string,
  "collaborationObjects": string,
  "teamSize": string,
  "background": string,
  "painPoints": string,
  "painImpact": string,
  "goals": string,
  "actions": [{ "title": string, "description": string, "input": string, "output": string, "owner": string, "acceptance": string }],
  "keyDecisions": string,
  "challenges": [{ "type": "business_logic | execution_collaboration | technical | resource", "problem": string, "rootCause": string, "solution": string, "result": string }],
  "metrics": [{ "name": string, "before": string, "after": string, "measurement": string, "businessValue": string }],
  "businessFeedback": string,
  "stakeholderRecognition": string,
  "shortcomings": string,
  "shortTermPlan": string,
  "longTermPlan": string,
  "reusableScenarios": string,
  "notes": string
}`

interface ProjectSopInferenceInput {
  baseDossier: ProjectSopDossier
  resumeProjectText: string
  jdContextText: string
  webResearchText: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeAction(value: unknown, index: number): ProjectSopAction {
  const base = createEmptyProjectSopAction()
  if (!isRecord(value)) return base
  return {
    id: text(value.id) || `action_inferred_${Date.now()}_${index}`,
    title: text(value.title),
    description: text(value.description),
    input: text(value.input),
    output: text(value.output),
    owner: text(value.owner) || '我负责',
    acceptance: text(value.acceptance),
  }
}

function normalizeChallenge(value: unknown, index: number): ProjectSopChallenge {
  const base = createEmptyProjectSopChallenge()
  if (!isRecord(value)) return base
  const rawType = text(value.type)
  const type: ProjectSopChallenge['type'] = rawType === 'execution_collaboration'
    || rawType === 'technical'
    || rawType === 'resource'
    || rawType === 'business_logic'
    ? rawType
    : 'business_logic'

  return {
    id: text(value.id) || `challenge_inferred_${Date.now()}_${index}`,
    type,
    problem: text(value.problem),
    rootCause: text(value.rootCause),
    solution: text(value.solution),
    result: text(value.result),
  }
}

function normalizeMetric(value: unknown, index: number): ProjectSopMetric {
  const base = createEmptyProjectSopMetric()
  if (!isRecord(value)) return base
  return {
    id: text(value.id) || `metric_inferred_${Date.now()}_${index}`,
    name: text(value.name),
    before: text(value.before),
    after: text(value.after),
    measurement: text(value.measurement),
    businessValue: text(value.businessValue),
  }
}

function normalizeActions(value: unknown, fallback: ProjectSopAction[]): ProjectSopAction[] {
  const normalized = Array.isArray(value)
    ? value.map(normalizeAction).filter(item => item.title || item.description || item.output)
    : []
  return normalized.length ? normalized.slice(0, 5) : fallback
}

function normalizeChallenges(value: unknown, fallback: ProjectSopChallenge[]): ProjectSopChallenge[] {
  const normalized = Array.isArray(value)
    ? value.map(normalizeChallenge).filter(item => item.problem || item.solution || item.result)
    : []
  return normalized.length ? normalized.slice(0, 4) : fallback
}

function normalizeMetrics(value: unknown, fallback: ProjectSopMetric[]): ProjectSopMetric[] {
  const normalized = Array.isArray(value)
    ? value.map(normalizeMetric).filter(item => item.name || item.after || item.businessValue)
    : []
  return normalized.length ? normalized.slice(0, 4) : fallback
}

function buildInferencePrompt(input: ProjectSopInferenceInput): string {
  return `请把以下项目资料转成结构化项目 SOP 档案。

## 已有基础档案
${safeJsonStringify(input.baseDossier)}

## 简历项目原文
${input.resumeProjectText || '无'}

## JD 上下文
${input.jdContextText || '无'}

## 联网公开资料摘要
${input.webResearchText || '无'}

补全要求：
- 项目目标、痛点、执行动作、难点可以根据项目描述和公开资料做“面试表达层面的合理推断”。
- 指标、团队规模、业务反馈、老板认可这类真实结果没有依据时必须留空或写 [待补充：...]。
- actions 至少给出 2 条，challenges 至少给出 1 条，优先突出“我负责/我主导”的个人贡献。
- notes 中简要说明哪些内容来自简历原文，哪些来自公开资料或模型推断。

只返回符合 Schema 的 JSON。`
}

export async function inferProjectSopDossier(
  config: AiConfig,
  input: ProjectSopInferenceInput,
  signal?: AbortSignal,
): Promise<Partial<ProjectSopDossier>> {
  const base = input.baseDossier

  return runJsonTask({
    taskName: 'projectSop.inferDossier',
    category: 'project-sop',
    config,
    systemPrompt: PROJECT_SOP_INFERENCE_SYSTEM_PROMPT,
    userMessage: buildInferencePrompt(input),
    schemaHint: PROJECT_SOP_INFERENCE_SCHEMA,
    requestOptions: { temperature: 0.25, maxTokens: 4096 },
    repair: true,
    signal,
    normalize: (raw) => {
      const source = isRecord(raw) ? raw : {}
      return {
        name: text(source.name) || base.name,
        industry: text(source.industry) || base.industry,
        businessLine: text(source.businessLine) || base.businessLine,
        stage: normalizeProjectSopStage(text(source.stage) || base.stage),
        role: text(source.role) || base.role,
        responsibilities: text(source.responsibilities) || base.responsibilities,
        collaborationObjects: text(source.collaborationObjects) || base.collaborationObjects,
        teamSize: text(source.teamSize) || base.teamSize,
        background: text(source.background) || base.background,
        painPoints: text(source.painPoints) || base.painPoints,
        painImpact: text(source.painImpact) || base.painImpact,
        goals: text(source.goals) || base.goals,
        actions: normalizeActions(source.actions, base.actions),
        keyDecisions: text(source.keyDecisions) || base.keyDecisions,
        challenges: normalizeChallenges(source.challenges, base.challenges),
        metrics: normalizeMetrics(source.metrics, base.metrics),
        businessFeedback: text(source.businessFeedback) || base.businessFeedback,
        stakeholderRecognition: text(source.stakeholderRecognition) || base.stakeholderRecognition,
        shortcomings: text(source.shortcomings) || base.shortcomings,
        shortTermPlan: text(source.shortTermPlan) || base.shortTermPlan,
        longTermPlan: text(source.longTermPlan) || base.longTermPlan,
        reusableScenarios: text(source.reusableScenarios) || base.reusableScenarios,
        notes: [base.notes, text(source.notes)].filter(Boolean).join('\n\n'),
      } satisfies Partial<ProjectSopDossier>
    },
  })
}
