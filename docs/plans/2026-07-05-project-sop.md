# Project SOP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a standalone Project SOP module that turns resume project entries plus optional JD context into structured project dossiers, SOP documents, interview scripts, follow-up Q&A, and optimization roadmaps.

**Architecture:** Create a new `projectSop` domain with typed dossier/artifact models, deterministic validation, Pinia/localStorage persistence, and a generator service that reuses the existing OpenAI-compatible streaming layer. Build the UI as a first-level workspace route with list, form, validation, and artifact tabs, then integrate generated Q&A into the existing question bank.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, existing `streamAIRequest`, existing localStorage store patterns, existing question-bank store.

---

## Guardrails

- Do not rewrite unrelated dirty files.
- Do not add new dependencies.
- Keep all generated claims grounded in dossier fields, JD analysis fields, or explicit `[待补充：...]` placeholders.
- Use the repo's existing Pinia/localStorage style.
- Run `npm run type-check` and `npm run build-only` before claiming implementation complete.
- Use Lore commit messages for every commit.

## Task 1: Add Project SOP Domain Types And Validation

**Files:**
- Create: `src/services/projectSop/types.ts`
- Create: `src/services/projectSop/validation.ts`

**Step 1: Create `types.ts`**

Add the domain types below. Keep fields string-based where the UI needs flexible user input; structured arrays are used where validation and generation need repeatable items.

```ts
export type ProjectSopStage = 'not_started' | 'in_progress' | 'launched' | 'iterating' | 'offline'
export type ProjectSopSource = 'manual' | 'resume_project'
export type ProjectSopArtifactTabKey = 'sop' | 'script1m' | 'script3m' | 'qa' | 'roadmap' | 'bonus'
export type ProjectSopQuestionDifficulty = 'normal' | 'pressure'

export interface ProjectSopAction {
  id: string
  title: string
  description: string
  input: string
  output: string
  owner: string
  acceptance: string
}

export interface ProjectSopChallenge {
  id: string
  type: 'business_logic' | 'execution_collaboration' | 'technical' | 'resource'
  problem: string
  rootCause: string
  solution: string
  result: string
}

export interface ProjectSopMetric {
  id: string
  name: string
  before: string
  after: string
  measurement: string
  businessValue: string
}

export interface ProjectSopDossier {
  id: string
  source: ProjectSopSource
  resumeProjectId: string
  linkedJdAnalysisId: string
  name: string
  industry: string
  businessLine: string
  startDate: string
  endDate: string
  stage: ProjectSopStage
  role: string
  responsibilities: string
  collaborationObjects: string
  teamSize: string
  background: string
  painPoints: string
  painImpact: string
  goals: string
  actions: ProjectSopAction[]
  keyDecisions: string
  challenges: ProjectSopChallenge[]
  metrics: ProjectSopMetric[]
  businessFeedback: string
  stakeholderRecognition: string
  shortcomings: string
  shortTermPlan: string
  longTermPlan: string
  reusableScenarios: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ProjectSopValidationIssue {
  field: string
  label: string
  message: string
  prompt: string
}

export interface ProjectSopValidation {
  completeness: number
  blockingIssues: ProjectSopValidationIssue[]
  warningIssues: ProjectSopValidationIssue[]
  canGenerate: boolean
}

export interface ProjectSopQuestion {
  id: string
  question: string
  area: 'execution' | 'decision' | 'challenge' | 'data' | 'role' | 'roadmap'
  difficulty: ProjectSopQuestionDifficulty
  interviewerIntent: string
  answerStrategy: string
  answer: string
}

export interface ProjectSopRoadmapItem {
  id: string
  horizon: 'short_term' | 'long_term'
  direction: string
  reason: string
  actions: string[]
  expectedBenefit: string
}

export interface ProjectSopArtifact {
  id: string
  dossierId: string
  sourceSignature: string
  linkedJdAnalysisId: string
  generatedAt: string
  schemaVersion: 1
  sopMarkdown: string
  scriptOneMinute: string
  scriptThreeMinutes: string
  questions: ProjectSopQuestion[]
  roadmap: ProjectSopRoadmapItem[]
  bonusMarkdown: string
  missingPlaceholders: string[]
}

export interface ProjectSopGenerationInput {
  dossier: ProjectSopDossier
  validation: ProjectSopValidation
  resumeProjectText: string
  jdContextText: string
}
```

**Step 2: Create `validation.ts`**

Implement deterministic helpers. Required fields block generation. Warning fields allow generation with placeholders.

```ts
import type {
  ProjectSopAction,
  ProjectSopChallenge,
  ProjectSopDossier,
  ProjectSopMetric,
  ProjectSopStage,
  ProjectSopValidation,
  ProjectSopValidationIssue,
} from './types'

function nowIso(): string {
  return new Date().toISOString()
}

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createEmptyProjectSopAction(): ProjectSopAction {
  return { id: id('action'), title: '', description: '', input: '', output: '', owner: '', acceptance: '' }
}

export function createEmptyProjectSopChallenge(): ProjectSopChallenge {
  return { id: id('challenge'), type: 'business_logic', problem: '', rootCause: '', solution: '', result: '' }
}

export function createEmptyProjectSopMetric(): ProjectSopMetric {
  return { id: id('metric'), name: '', before: '', after: '', measurement: '', businessValue: '' }
}

export function createEmptyProjectSopDossier(): ProjectSopDossier {
  const timestamp = nowIso()
  return {
    id: id('project_sop'),
    source: 'manual',
    resumeProjectId: '',
    linkedJdAnalysisId: '',
    name: '',
    industry: '',
    businessLine: '',
    startDate: '',
    endDate: '',
    stage: 'in_progress',
    role: '',
    responsibilities: '',
    collaborationObjects: '',
    teamSize: '',
    background: '',
    painPoints: '',
    painImpact: '',
    goals: '',
    actions: [createEmptyProjectSopAction(), createEmptyProjectSopAction()],
    keyDecisions: '',
    challenges: [createEmptyProjectSopChallenge()],
    metrics: [createEmptyProjectSopMetric()],
    businessFeedback: '',
    stakeholderRecognition: '',
    shortcomings: '',
    shortTermPlan: '',
    longTermPlan: '',
    reusableScenarios: '',
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function hasActionContent(action: ProjectSopAction): boolean {
  return Boolean(text(action.title) || text(action.description) || text(action.output))
}

function hasChallengeContent(challenge: ProjectSopChallenge): boolean {
  return Boolean(text(challenge.problem) || text(challenge.solution) || text(challenge.result))
}

function hasMetricContent(metric: ProjectSopMetric): boolean {
  return Boolean(text(metric.name) || text(metric.after) || text(metric.businessValue))
}

function issue(field: string, label: string, message: string, prompt: string): ProjectSopValidationIssue {
  return { field, label, message, prompt }
}

export function validateProjectSopDossier(dossier: ProjectSopDossier): ProjectSopValidation {
  const blockingIssues: ProjectSopValidationIssue[] = []
  const warningIssues: ProjectSopValidationIssue[] = []
  const filledActions = dossier.actions.filter(hasActionContent)
  const filledChallenges = dossier.challenges.filter(hasChallengeContent)
  const filledMetrics = dossier.metrics.filter(hasMetricContent)

  if (!text(dossier.name)) blockingIssues.push(issue('name', '项目名称', '缺少项目名称。', '这个项目的正式名称是什么？'))
  if (!text(dossier.role)) blockingIssues.push(issue('role', '个人角色', '缺少你在项目中的角色。', '你在这个项目中担任什么角色？'))
  if (!text(dossier.background)) blockingIssues.push(issue('background', '项目背景', '缺少项目背景。', '项目是在什么业务背景下立项的？'))
  if (!text(dossier.goals)) blockingIssues.push(issue('goals', '项目目标', '缺少项目目标。', '项目立项时最核心的目标或指标是什么？'))
  if (filledActions.length < 2) blockingIssues.push(issue('actions', '核心动作', '至少需要 2 个核心执行动作。', '你主导或负责的两个关键动作分别是什么？'))
  if (filledChallenges.length < 1) blockingIssues.push(issue('challenges', '项目难点', '至少需要 1 个真实难点。', '项目中最值得展开的难点是什么，你怎么解决的？'))
  if (!dossier.stage) blockingIssues.push(issue('stage', '项目阶段', '缺少项目当前阶段。', '项目当前是已上线、迭代中、已下线，还是其他阶段？'))

  if (filledMetrics.length === 0) warningIssues.push(issue('metrics', '量化结果', '缺少量化结果，生成时必须使用占位符。', '上线后最能证明价值的指标是什么，统计周期是多少？'))
  if (!filledMetrics.some(metric => text(metric.measurement))) warningIssues.push(issue('measurement', '测算口径', '缺少数据测算口径。', '这些数据是怎么统计或对比出来的？'))
  if (!text(dossier.businessFeedback) && !text(dossier.stakeholderRecognition)) warningIssues.push(issue('feedback', '业务反馈', '缺少业务反馈或认可度证据。', '老板、业务方或用户有哪些具体反馈？'))
  if (!text(dossier.keyDecisions)) warningIssues.push(issue('keyDecisions', '关键决策', '缺少关键决策依据。', '项目里哪个方案选择最关键，你当时基于什么判断？'))
  if (!text(dossier.shortTermPlan) && !text(dossier.longTermPlan)) warningIssues.push(issue('roadmap', '优化方向', '缺少后续优化方向。', '如果继续迭代，你会先优化哪个方向？'))
  if (!text(dossier.linkedJdAnalysisId)) warningIssues.push(issue('linkedJdAnalysisId', 'JD 关联', '未关联 JD，岗位适配度会较弱。', '是否要关联当前 JD 分析，让话术更贴近岗位？'))

  const totalChecks = 13
  const missingCount = blockingIssues.length + warningIssues.length
  const completeness = Math.max(0, Math.round(((totalChecks - missingCount) / totalChecks) * 100))

  return {
    completeness,
    blockingIssues,
    warningIssues,
    canGenerate: blockingIssues.length === 0,
  }
}

export function normalizeProjectSopStage(value: unknown): ProjectSopStage {
  if (value === 'not_started' || value === 'in_progress' || value === 'launched' || value === 'iterating' || value === 'offline') {
    return value
  }
  return 'in_progress'
}

export function buildProjectSopDossierSignature(dossier: ProjectSopDossier): string {
  return JSON.stringify({
    id: dossier.id,
    updatedAt: dossier.updatedAt,
    linkedJdAnalysisId: dossier.linkedJdAnalysisId,
    name: dossier.name,
    role: dossier.role,
    background: dossier.background,
    goals: dossier.goals,
    actions: dossier.actions,
    challenges: dossier.challenges,
    metrics: dossier.metrics,
  })
}
```

**Step 3: Verify TypeScript parses the new files**

Run: `npm run type-check`

Expected: Type-check may still fail because of unrelated existing workspace changes. If it fails, confirm no errors reference `src/services/projectSop/types.ts` or `src/services/projectSop/validation.ts`.

**Step 4: Commit**

```bash
git add src/services/projectSop/types.ts src/services/projectSop/validation.ts
git commit -m "Ground Project SOP in validated dossiers" -m "Constraint: Project SOP output must not invent missing data
Rejected: Extending resume ProjectEntry | SOP needs deeper evidence and generated artifact metadata
Confidence: high
Scope-risk: narrow
Directive: Keep validation deterministic before AI generation
Tested: npm run type-check
Not-tested: UI flow not implemented yet"
```

## Task 2: Add Project SOP Store With Local Persistence

**Files:**
- Create: `src/stores/projectSop.ts`

**Step 1: Implement the Pinia store**

Use localStorage so the feature works without Supabase. Import from `@/stores/resume` only for the `ProjectEntry` type.

```ts
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ProjectEntry } from '@/stores/resume'
import type { ProjectSopArtifact, ProjectSopDossier } from '@/services/projectSop/types'
import {
  buildProjectSopDossierSignature,
  createEmptyProjectSopDossier,
  validateProjectSopDossier,
} from '@/services/projectSop/validation'
import { stripHtml } from '@/services/stream'

const STORAGE_KEY = 'prepwise-project-sop'
const SCHEMA_VERSION = 1

interface ProjectSopStorageData {
  schemaVersion: number
  activeDossierId: string
  dossiers: ProjectSopDossier[]
  artifacts: ProjectSopArtifact[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeDossier(raw: Partial<ProjectSopDossier>): ProjectSopDossier {
  const base = createEmptyProjectSopDossier()
  return {
    ...base,
    ...raw,
    id: raw.id || createId('project_sop'),
    actions: Array.isArray(raw.actions) ? raw.actions : base.actions,
    challenges: Array.isArray(raw.challenges) ? raw.challenges : base.challenges,
    metrics: Array.isArray(raw.metrics) ? raw.metrics : base.metrics,
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
  }
}

function normalizeArtifact(raw: Partial<ProjectSopArtifact>): ProjectSopArtifact | null {
  if (!raw.id || !raw.dossierId) return null
  return {
    id: raw.id,
    dossierId: raw.dossierId,
    sourceSignature: raw.sourceSignature || '',
    linkedJdAnalysisId: raw.linkedJdAnalysisId || '',
    generatedAt: raw.generatedAt || nowIso(),
    schemaVersion: 1,
    sopMarkdown: raw.sopMarkdown || '',
    scriptOneMinute: raw.scriptOneMinute || '',
    scriptThreeMinutes: raw.scriptThreeMinutes || '',
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    roadmap: Array.isArray(raw.roadmap) ? raw.roadmap : [],
    bonusMarkdown: raw.bonusMarkdown || '',
    missingPlaceholders: Array.isArray(raw.missingPlaceholders) ? raw.missingPlaceholders : [],
  }
}

function loadStorage(): ProjectSopStorageData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { schemaVersion: SCHEMA_VERSION, activeDossierId: '', dossiers: [], artifacts: [] }
    const parsed = JSON.parse(raw) as Partial<ProjectSopStorageData>
    return {
      schemaVersion: SCHEMA_VERSION,
      activeDossierId: parsed.activeDossierId || '',
      dossiers: Array.isArray(parsed.dossiers) ? parsed.dossiers.map(normalizeDossier) : [],
      artifacts: Array.isArray(parsed.artifacts)
        ? parsed.artifacts.map(normalizeArtifact).filter((item): item is ProjectSopArtifact => Boolean(item))
        : [],
    }
  } catch {
    return { schemaVersion: SCHEMA_VERSION, activeDossierId: '', dossiers: [], artifacts: [] }
  }
}

function formatProjectText(project: ProjectEntry): string {
  return [
    project.name && `项目名称：${project.name}`,
    project.role && `角色：${project.role}`,
    (project.startDate || project.endDate) && `时间：${project.startDate || ''} ~ ${project.endDate || ''}`,
    project.introduction && `项目介绍：${stripHtml(project.introduction)}`,
    project.mainWork && `主要工作：${stripHtml(project.mainWork)}`,
  ].filter(Boolean).join('\n')
}

export const useProjectSopStore = defineStore('projectSop', () => {
  const stored = loadStorage()
  const activeDossierId = ref(stored.activeDossierId)
  const dossiers = ref<ProjectSopDossier[]>(stored.dossiers)
  const artifacts = ref<ProjectSopArtifact[]>(stored.artifacts)

  const activeDossier = computed(() => dossiers.value.find(item => item.id === activeDossierId.value) ?? null)
  const activeArtifact = computed(() => activeDossier.value
    ? artifacts.value.find(item => item.dossierId === activeDossier.value?.id) ?? null
    : null)
  const activeValidation = computed(() => activeDossier.value
    ? validateProjectSopDossier(activeDossier.value)
    : null)
  const isActiveArtifactStale = computed(() => {
    if (!activeDossier.value || !activeArtifact.value) return false
    return activeArtifact.value.sourceSignature !== buildProjectSopDossierSignature(activeDossier.value)
  })

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      activeDossierId: activeDossierId.value,
      dossiers: dossiers.value,
      artifacts: artifacts.value,
    }))
  }

  function setActiveDossier(id: string) {
    activeDossierId.value = id
  }

  function createBlankDossier(): ProjectSopDossier {
    const dossier = createEmptyProjectSopDossier()
    dossiers.value.unshift(dossier)
    activeDossierId.value = dossier.id
    return dossier
  }

  function createDossierFromResumeProject(project: ProjectEntry): ProjectSopDossier {
    const dossier = createEmptyProjectSopDossier()
    dossier.source = 'resume_project'
    dossier.resumeProjectId = project.id
    dossier.name = project.name || '未命名项目'
    dossier.role = project.role
    dossier.startDate = project.startDate
    dossier.endDate = project.endDate
    dossier.background = stripHtml(project.introduction)
    dossier.responsibilities = stripHtml(project.mainWork)
    dossier.notes = formatProjectText(project)
    dossier.updatedAt = nowIso()
    dossiers.value.unshift(dossier)
    activeDossierId.value = dossier.id
    return dossier
  }

  function updateDossier(id: string, patch: Partial<ProjectSopDossier>) {
    const index = dossiers.value.findIndex(item => item.id === id)
    if (index < 0) return
    dossiers.value[index] = {
      ...dossiers.value[index]!,
      ...patch,
      updatedAt: nowIso(),
    }
  }

  function duplicateDossier(id: string) {
    const source = dossiers.value.find(item => item.id === id)
    if (!source) return null
    const next = clone(source)
    next.id = createId('project_sop')
    next.name = `${source.name || '未命名项目'} 副本`
    next.createdAt = nowIso()
    next.updatedAt = nowIso()
    dossiers.value.unshift(next)
    activeDossierId.value = next.id
    return next
  }

  function deleteDossier(id: string) {
    dossiers.value = dossiers.value.filter(item => item.id !== id)
    artifacts.value = artifacts.value.filter(item => item.dossierId !== id)
    if (activeDossierId.value === id) activeDossierId.value = dossiers.value[0]?.id ?? ''
  }

  function saveArtifact(artifact: ProjectSopArtifact) {
    artifacts.value = [artifact, ...artifacts.value.filter(item => item.dossierId !== artifact.dossierId)]
  }

  watch([activeDossierId, dossiers, artifacts], persist, { deep: true })

  return {
    activeDossierId,
    dossiers,
    artifacts,
    activeDossier,
    activeArtifact,
    activeValidation,
    isActiveArtifactStale,
    setActiveDossier,
    createBlankDossier,
    createDossierFromResumeProject,
    updateDossier,
    duplicateDossier,
    deleteDossier,
    saveArtifact,
  }
})
```

**Step 2: Verify**

Run: `npm run type-check`

Expected: No errors from `src/stores/projectSop.ts`.

**Step 3: Commit**

```bash
git add src/stores/projectSop.ts
git commit -m "Persist Project SOP dossiers locally" -m "Constraint: First release avoids Supabase and new dependencies
Rejected: Reusing JD history store | Project SOP needs independent lifecycle and artifact stale checks
Confidence: high
Scope-risk: narrow
Directive: Keep store mutations narrow and serializable
Tested: npm run type-check
Not-tested: UI integration pending"
```

## Task 3: Add Prompt And Generator Service

**Files:**
- Create: `src/services/projectSop/prompt.ts`
- Create: `src/services/projectSop/generator.ts`
- Modify: `src/services/prompts/registry.ts`

**Step 1: Extend prompt registry**

In `src/services/prompts/registry.ts`, add `'project-sop'` to `PromptCategory` and register a default version near the other feature prompts.

```ts
export type PromptCategory =
  | 'resume-optimize'
  | 'resume-review'
  | 'project-sop'
  // keep existing categories
```

```ts
registerPromptVersion('project-sop', {
  id: 'v1-dossier-grounded',
  version: '1.0',
  label: '档案驱动版',
  description: '基于结构化项目档案生成 SOP、宣讲稿、深挖问答和路线图',
  isDefault: true,
})
```

**Step 2: Create `prompt.ts`**

```ts
import { JD_JSON_STRICT_RULES } from '@/services/prompts/shared'

export const PROJECT_SOP_SYSTEM_PROMPT = `你是一位资深项目复盘顾问、面试教练和候选人表达策略专家。你的任务是基于可信项目档案、简历项目文本和可选 JD 上下文，生成项目 SOP 文档、面试宣讲逐字稿、深挖问答库和优化路线图。

${JD_JSON_STRICT_RULES}

## 事实约束

1. 禁止编造项目数据、技术细节、业务反馈、团队规模、老板评价或上线结果。
2. 缺少数据时必须输出 [待补充：具体字段]，不要补出看似真实的数字。
3. 所有结果必须能回溯到项目档案、简历项目文本或 JD 上下文。
4. 禁止使用“领导让做的”“通过努力克服了”“用户体验不好”“效率低”等空泛或被动表达。
5. 必须突出个人贡献，能用“我负责/我主导/我推动”的地方不要用模糊的“我们”。

## 输出 JSON Schema

{
  "sopMarkdown": "正式项目 SOP 文档，Markdown 字符串",
  "scriptOneMinute": "1 分钟面试宣讲逐字稿，带口语化停顿提示",
  "scriptThreeMinutes": "3 分钟面试宣讲逐字稿，覆盖为什么做、怎么做、结果、优化",
  "questions": [
    {
      "question": "面试官追问",
      "area": "execution | decision | challenge | data | role | roadmap",
      "difficulty": "normal | pressure",
      "interviewerIntent": "面试官考察点",
      "answerStrategy": "回答思路",
      "answer": "标准答案"
    }
  ],
  "roadmap": [
    {
      "horizon": "short_term | long_term",
      "direction": "优化方向",
      "reason": "为什么优化",
      "actions": ["落地动作1"],
      "expectedBenefit": "预期收益"
    }
  ],
  "bonusMarkdown": "个人成长、复用价值、差异化亮点、遗憾点",
  "missingPlaceholders": ["待补充字段1"]
}

## 内容要求

- SOP 文档必须包含项目概述、全流程拆解、里程碑、风险与问题台账、成果与复盘。
- 1 分钟稿用于自我介绍，短而有力。
- 3 分钟稿用于回答“讲一下你的项目”，必须覆盖四大问题：为什么做、怎么做、结果怎么样、后续怎么优化。
- 深挖问答输出 10-15 个问题，覆盖执行过程、方案选型、难点解决、数据测算、个人角色和压力面。
- 优化路线图必须分短期 1-3 个月和长期 6-12 个月。
- bonusMarkdown 必须包含个人成长沉淀、项目复用价值、差异化亮点、失败/遗憾点。`

export const PROJECT_SOP_USER_TEMPLATE = `请基于以下信息生成项目 SOP 资产。

## 项目档案 JSON

{dossier}

## 档案校验结果 JSON

{validation}

## 简历项目原文

{resumeProjectText}

## JD 上下文

{jdContextText}

请直接返回合法 JSON，不要包含 Markdown 代码块或额外解释。`
```

**Step 3: Create `generator.ts`**

```ts
import type { AiConfig, StreamCallbacks } from '@/services/stream'
import { cleanJsonResponse, safeJsonStringify, streamAIRequest } from '@/services/stream'
import { buildProjectSopDossierSignature } from './validation'
import type {
  ProjectSopArtifact,
  ProjectSopGenerationInput,
  ProjectSopQuestion,
  ProjectSopRoadmapItem,
} from './types'
import { PROJECT_SOP_SYSTEM_PROMPT, PROJECT_SOP_USER_TEMPLATE } from './prompt'

interface RawProjectSopResponse {
  sopMarkdown?: string
  scriptOneMinute?: string
  scriptThreeMinutes?: string
  questions?: Array<Partial<ProjectSopQuestion>>
  roadmap?: Array<Partial<ProjectSopRoadmapItem>>
  bonusMarkdown?: string
  missingPlaceholders?: string[]
}

function id(prefix: string, index = 0): string {
  return `${prefix}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`
}

function normalizeQuestions(items: RawProjectSopResponse['questions']): ProjectSopQuestion[] {
  return (items ?? []).map((item, index) => ({
    id: item.id || id('project_sop_question', index),
    question: item.question || '',
    area: item.area || 'execution',
    difficulty: item.difficulty || 'normal',
    interviewerIntent: item.interviewerIntent || '',
    answerStrategy: item.answerStrategy || '',
    answer: item.answer || '',
  })).filter(item => item.question.trim())
}

function normalizeRoadmap(items: RawProjectSopResponse['roadmap']): ProjectSopRoadmapItem[] {
  return (items ?? []).map((item, index) => ({
    id: item.id || id('project_sop_roadmap', index),
    horizon: item.horizon || 'short_term',
    direction: item.direction || '',
    reason: item.reason || '',
    actions: Array.isArray(item.actions) ? item.actions : [],
    expectedBenefit: item.expectedBenefit || '',
  })).filter(item => item.direction.trim())
}

function buildUserPrompt(input: ProjectSopGenerationInput): string {
  return PROJECT_SOP_USER_TEMPLATE
    .replace('{dossier}', safeJsonStringify(input.dossier))
    .replace('{validation}', safeJsonStringify(input.validation))
    .replace('{resumeProjectText}', input.resumeProjectText || '无')
    .replace('{jdContextText}', input.jdContextText || '无')
}

export async function generateProjectSopArtifact(
  config: AiConfig,
  input: ProjectSopGenerationInput,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<ProjectSopArtifact> {
  if (!input.validation.canGenerate) {
    throw new Error('项目信息仍有阻断级缺口，请先补全后再生成。')
  }

  const fullText = await streamAIRequest(
    config,
    PROJECT_SOP_SYSTEM_PROMPT,
    buildUserPrompt(input),
    { onChunk: callbacks.onChunk },
    signal,
    { timeoutMs: 180_000, maxRetries: 1 },
  )

  let raw: RawProjectSopResponse
  try {
    raw = JSON.parse(cleanJsonResponse(fullText)) as RawProjectSopResponse
  } catch (error) {
    callbacks.onError('AI 返回内容不是合法 JSON，请重试。')
    throw error
  }

  const artifact: ProjectSopArtifact = {
    id: id('project_sop_artifact'),
    dossierId: input.dossier.id,
    sourceSignature: buildProjectSopDossierSignature(input.dossier),
    linkedJdAnalysisId: input.dossier.linkedJdAnalysisId,
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sopMarkdown: raw.sopMarkdown || '',
    scriptOneMinute: raw.scriptOneMinute || '',
    scriptThreeMinutes: raw.scriptThreeMinutes || '',
    questions: normalizeQuestions(raw.questions),
    roadmap: normalizeRoadmap(raw.roadmap),
    bonusMarkdown: raw.bonusMarkdown || '',
    missingPlaceholders: Array.isArray(raw.missingPlaceholders) ? raw.missingPlaceholders : [],
  }

  callbacks.onDone(fullText)
  return artifact
}
```

**Step 4: Verify**

Run: `npm run type-check`

Expected: No errors from `src/services/projectSop/*` or `src/services/prompts/registry.ts`.

**Step 5: Commit**

```bash
git add src/services/projectSop/prompt.ts src/services/projectSop/generator.ts src/services/prompts/registry.ts
git commit -m "Generate Project SOP assets from dossiers" -m "Constraint: AI generation must be JSON-only and fact-grounded
Rejected: Free-form Markdown generation | Structured artifacts need reliable UI rendering and question-bank import
Confidence: medium
Scope-risk: moderate
Directive: Preserve placeholder behavior for missing data
Tested: npm run type-check
Not-tested: Live AI provider response quality"
```

## Task 4: Build Project SOP Components

**Files:**
- Create: `src/components/projectSop/ProjectSopList.vue`
- Create: `src/components/projectSop/ProjectSopDossierForm.vue`
- Create: `src/components/projectSop/ProjectSopValidationPanel.vue`
- Create: `src/components/projectSop/ProjectSopArtifactTabs.vue`

**Step 1: Create the list component**

Props: dossiers, active ID, validation lookup. Emits: create blank, import resume project, select, duplicate, delete.

```vue
<script setup lang="ts">
import type { ProjectSopDossier, ProjectSopValidation } from '@/services/projectSop/types'

defineProps<{
  dossiers: ProjectSopDossier[]
  activeId: string
  validationById: Record<string, ProjectSopValidation>
}>()

const emit = defineEmits<{
  (e: 'create-blank'): void
  (e: 'import-resume-project'): void
  (e: 'select', id: string): void
  (e: 'duplicate', id: string): void
  (e: 'delete', id: string): void
}>()
</script>

<template>
  <aside class="project-sop-list">
    <div class="project-sop-list__header">
      <div>
        <p class="eyebrow">Project SOP</p>
        <h2>项目档案</h2>
      </div>
      <button type="button" class="icon-btn" title="新建档案" @click="emit('create-blank')">+</button>
    </div>
    <button type="button" class="secondary-btn" @click="emit('import-resume-project')">从简历项目导入</button>
    <div class="project-sop-list__items">
      <button
        v-for="dossier in dossiers"
        :key="dossier.id"
        type="button"
        class="project-sop-list__item"
        :class="{ active: dossier.id === activeId }"
        @click="emit('select', dossier.id)"
      >
        <span class="project-sop-list__title">{{ dossier.name || '未命名项目' }}</span>
        <span class="project-sop-list__meta">
          完整度 {{ validationById[dossier.id]?.completeness ?? 0 }}% · {{ dossier.source === 'resume_project' ? '简历导入' : '手动创建' }}
        </span>
      </button>
    </div>
  </aside>
</template>
```

Add scoped CSS using existing CSS variables: `--bg-card`, `--border-color`, `--text-primary`, `--text-secondary`, `--primary-600`. Keep radius at `var(--radius-md)` or less.

**Step 2: Create the form component**

Use local `draft` and emit `update` on blur/change. Avoid a deeply nested card design.

Required fields:
- Basic information
- Personal role
- Background and goals
- Execution actions
- Challenges
- Metrics
- Review and planning

Implementation notes:
- Add buttons to append/remove actions, challenges, and metrics.
- Keep form labels concise.
- Use `v-model` on `draft`, then call `emit('update', draft)` through a `commit()` function.

**Step 3: Create validation panel**

Render blocking issues first, warnings second. Each issue shows label, message, and prompt.

```vue
<script setup lang="ts">
import type { ProjectSopValidation } from '@/services/projectSop/types'

defineProps<{ validation: ProjectSopValidation | null }>()
</script>

<template>
  <section v-if="validation" class="validation-panel">
    <div class="validation-panel__score">
      <span>完整度</span>
      <strong>{{ validation.completeness }}%</strong>
    </div>
    <div v-if="validation.blockingIssues.length" class="validation-panel__group">
      <h3>生成前必须补齐</h3>
      <p v-for="issue in validation.blockingIssues" :key="issue.field">
        <strong>{{ issue.label }}</strong>：{{ issue.prompt }}
      </p>
    </div>
    <div v-if="validation.warningIssues.length" class="validation-panel__group">
      <h3>可生成但会出现占位符</h3>
      <p v-for="issue in validation.warningIssues" :key="issue.field">
        <strong>{{ issue.label }}</strong>：{{ issue.prompt }}
      </p>
    </div>
  </section>
</template>
```

**Step 4: Create artifact tabs**

Render tabs for SOP, 1-minute script, 3-minute script, Q&A, roadmap, and bonus points.

Expose emits:
- `copy-markdown`
- `download-markdown`
- `save-questions`

For Q&A, show a checkbox per question and a "加入题库" action.

**Step 5: Verify**

Run: `npm run type-check`

Expected: Component props/emits type-check.

**Step 6: Commit**

```bash
git add src/components/projectSop
git commit -m "Add Project SOP workspace components" -m "Constraint: UI must support dossier-first generation and artifact reuse
Rejected: Single giant view file | Component boundaries keep the first release reviewable
Confidence: medium
Scope-risk: moderate
Directive: Keep Project SOP UI dense and work-focused
Tested: npm run type-check
Not-tested: Route-level smoke flow pending"
```

## Task 5: Add Project SOP View, Route, And Sidebar Entry

**Files:**
- Create: `src/views/ProjectSopView.vue`
- Modify: `src/router/index.ts`
- Modify: `src/components/common/ModuleSidebar.vue`
- Modify: `src/App.vue`

**Step 1: Create `ProjectSopView.vue`**

The view wires stores, import flow, AI generation, and artifact actions.

Key imports:

```ts
import { computed, ref } from 'vue'
import ProjectSopList from '@/components/projectSop/ProjectSopList.vue'
import ProjectSopDossierForm from '@/components/projectSop/ProjectSopDossierForm.vue'
import ProjectSopValidationPanel from '@/components/projectSop/ProjectSopValidationPanel.vue'
import ProjectSopArtifactTabs from '@/components/projectSop/ProjectSopArtifactTabs.vue'
import { generateProjectSopArtifact } from '@/services/projectSop/generator'
import { buildProjectSopDossierSignature, validateProjectSopDossier } from '@/services/projectSop/validation'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useProjectSopStore } from '@/stores/projectSop'
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'
import { useResumeStore } from '@/stores/resume'
import { toast } from '@/utils/toast'
```

Implement:
- `createBlankDossier`
- `showImportDialog`
- `importProject(projectId)`
- `generate()`
- `saveQuestionsToBank(questions)`
- `copyMarkdown(text)`
- `downloadMarkdown(text)`

Use `aiConfigStore.getConfigForFeature('default')` unless you add a dedicated feature key.

**Step 2: Build JD context text**

Inside the view:

```ts
const jdContextText = computed(() => {
  const lines = [
    jdStore.targetCompany && `目标公司：${jdStore.targetCompany}`,
    jdStore.targetPosition && `目标岗位：${jdStore.targetPosition}`,
    jdStore.jdData?.basicInfo.jobTitle && `JD 岗位：${jdStore.jdData.basicInfo.jobTitle}`,
    jdStore.matchResult && `匹配优势：${jdStore.matchResult.strengths.join('、')}`,
    jdStore.matchResult && `匹配缺口：${jdStore.matchResult.gaps.join('、')}`,
    jdStore.prepInsight && `备面重点：${jdStore.prepInsight.prepPriorities.join('、')}`,
  ]
  return lines.filter(Boolean).join('\n')
})
```

**Step 3: Add route**

In `src/router/index.ts`:

```ts
{
  path: '/project-sop',
  name: 'project-sop',
  component: () => import('@/views/ProjectSopView.vue'),
},
```

**Step 4: Add sidebar menu item**

In `ModuleSidebar.vue`, add a menu item after `jd-analysis` or before `training-center`.

```ts
{
  key: 'project-sop' as const,
  label: '项目SOP',
  routeName: 'project-sop',
  iconPath: 'M4 5h16M4 12h10M4 19h16M17 10l3 2-3 2v-4Z',
},
```

Update `isMenuActive` and `getMenuRoute`:

```ts
if (menuKey === 'project-sop') return route.name === 'project-sop' || route.path === '/project-sop'
```

```ts
if (menuKey === 'project-sop') return { name: 'project-sop' }
```

**Step 5: Add keep-alive include**

In `src/App.vue`:

```ts
const keepAliveInclude = ['ResumeEditorView', 'ResumeReviewView', 'JdAnalysisView', 'QuestionBankView', 'ProjectSopView']
```

**Step 6: Verify**

Run: `npm run type-check`

Expected: Route and view compile.

Run: `npm run build-only`

Expected: Vite build completes.

**Step 7: Commit**

```bash
git add src/views/ProjectSopView.vue src/router/index.ts src/components/common/ModuleSidebar.vue src/App.vue
git commit -m "Expose Project SOP as a first-level workspace" -m "Constraint: User selected an independent first-level module
Rejected: Burying SOP inside project editor | Full workflow needs list, validation, generation, and artifacts
Confidence: medium
Scope-risk: moderate
Directive: Keep route integration scoped to navigation and keep-alive
Tested: npm run type-check; npm run build-only
Not-tested: Live AI generation"
```

## Task 6: Wire Question Bank Import And Markdown Export

**Files:**
- Modify: `src/views/ProjectSopView.vue`
- Modify: `src/components/projectSop/ProjectSopArtifactTabs.vue`

**Step 1: Map generated Q&A to `SavedQuestion`**

Do not extend the `SavedQuestion.source_type` union in the first pass. Use existing values and a source label.

```ts
function projectSopQuestionToSavedQuestion(question: ProjectSopQuestion, index: number): SavedQuestion {
  return {
    content: question.question.trim(),
    category: question.difficulty === 'pressure' ? '项目压力追问' : '项目深挖追问',
    tags: ['项目SOP', activeDossier.value?.name, question.area, question.difficulty].filter((tag): tag is string => Boolean(tag)),
    reference_answer: question.answer,
    source: '项目 SOP',
    mastery_level: 0,
    jd_analysis_id: activeDossier.value?.linkedJdAnalysisId || '',
    difficulty: question.difficulty === 'pressure' ? 4 : 3,
    focus_area: question.area,
    intent: question.interviewerIntent,
    framework: question.answerStrategy,
    source_type: activeDossier.value?.linkedJdAnalysisId ? 'jd_analysis' : 'ai_generated',
    is_grounded: true,
    resume_anchor: activeDossier.value?.name || '',
    follow_up_chain: [],
    created_at: new Date(Date.now() + index).toISOString(),
  }
}
```

**Step 2: Use `questionStore.addQuestionBatch`**

```ts
async function saveQuestionsToBank(questions: ProjectSopQuestion[]) {
  const existing = new Set(questionStore.questions.map(item => item.content.trim()))
  const next = questions
    .map(projectSopQuestionToSavedQuestion)
    .filter(item => item.content && !existing.has(item.content))
  if (!next.length) {
    toast.info('题库中已有这些问题')
    return
  }
  await questionStore.addQuestionBatch(next)
  toast.success(`已加入 ${next.length} 道项目追问`)
}
```

**Step 3: Implement Markdown export**

```ts
function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
```

**Step 4: Verify**

Run: `npm run type-check`

Expected: No errors from `SavedQuestion` mapping.

**Step 5: Commit**

```bash
git add src/views/ProjectSopView.vue src/components/projectSop/ProjectSopArtifactTabs.vue
git commit -m "Reuse Project SOP questions in the training bank" -m "Constraint: First release should connect project defense to existing practice workflows
Rejected: New question source enum | Avoids storage and Supabase compatibility churn
Confidence: medium
Scope-risk: narrow
Directive: Deduplicate by question content before importing
Tested: npm run type-check
Not-tested: Supabase-backed question persistence"
```

## Task 7: Polish Empty, Loading, Error, And Stale States

**Files:**
- Modify: `src/views/ProjectSopView.vue`
- Modify: `src/components/projectSop/ProjectSopList.vue`
- Modify: `src/components/projectSop/ProjectSopValidationPanel.vue`
- Modify: `src/components/projectSop/ProjectSopArtifactTabs.vue`

**Step 1: Empty state**

When no dossier exists, show a compact onboarding area with two actions:
- 从简历项目导入
- 新建空白档案

Do not add a marketing hero. This is a workbench module.

**Step 2: Loading state**

During generation:
- Disable generate button.
- Show streamed text preview in a restrained panel.
- Keep existing artifact visible until new generation finishes.

**Step 3: Error state**

Show recoverable error text:
- Missing AI config: "请先配置默认 AI 模型。"
- Blocking validation: "项目信息仍有阻断级缺口，请先补齐。"
- JSON parse failure: "AI 返回内容不是合法 JSON，请重试。"

**Step 4: Stale state**

When `store.isActiveArtifactStale` is true, show: "档案已更新，当前生成结果可能不是最新版本。"

**Step 5: Verify**

Run: `npm run type-check`

Run: `npm run build-only`

Expected: Both commands complete or only fail due unrelated pre-existing issues; no Project SOP errors.

**Step 6: Commit**

```bash
git add src/views/ProjectSopView.vue src/components/projectSop
git commit -m "Make Project SOP generation recoverable" -m "Constraint: AI workflows need visible loading, error, and stale states
Rejected: Clearing artifacts while regenerating | Users should not lose usable prior output
Confidence: medium
Scope-risk: narrow
Directive: Keep failures recoverable and specific
Tested: npm run type-check; npm run build-only
Not-tested: Browser smoke pending"
```

## Task 8: Final Verification And Manual Smoke Test

**Files:**
- No new files unless a bug is found.

**Step 1: Run full static checks**

Run: `npm run type-check`

Expected: PASS. If unrelated pre-existing errors appear, document exact files and confirm Project SOP files are clean.

Run: `npm run build-only`

Expected: PASS.

**Step 2: Start dev server**

Run: `npm run dev`

Expected: Vite starts on an available localhost port.

**Step 3: Manual browser smoke**

Use the running app:

1. Open `/project-sop`.
2. Create a blank dossier.
3. Confirm blocking validation appears before required fields are filled.
4. Import an existing resume project.
5. Fill required fields.
6. Generate artifacts with missing metrics and confirm `[待补充：...]` placeholders are present.
7. Save selected Q&A to the question bank.
8. Refresh and confirm dossier plus artifact persist.
9. Edit dossier and confirm stale state appears.

**Step 4: Final commit if verification fixes were needed**

```bash
git add <fixed-files>
git commit -m "Stabilize Project SOP release path" -m "Constraint: Final smoke surfaced implementation issues
Confidence: high
Scope-risk: narrow
Directive: Keep future fixes backed by the smoke path
Tested: npm run type-check; npm run build-only; manual /project-sop smoke
Not-tested: Live production deployment"
```

**Step 5: Final report**

Report:
- Changed files.
- Verification commands and results.
- Any remaining risks, especially live AI JSON quality or Supabase question-bank behavior.
