# AI Resume Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-class AI resume review module that scores the active resume, optionally includes completed JD analysis context, stores local history, and turns review findings into editable resume tasks.

**Architecture:** Add a focused `resumeReview` service folder for formatting, rubric selection, prompt building, AI response parsing, score normalization, and verdict derivation. Add a Pinia store for local result/history state, a new route/view for orchestration, small display components for score/categories/tasks/history, and narrow integration points in router/sidebar/editor/AI config. Version one does not fetch GitHub data and does not auto-rewrite resume content.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, existing OpenAI-compatible AI utilities in `src/services/stream.ts`, localStorage persistence.

---

## Preconditions

- Use @superpowers:subagent-driven-development or @superpowers:executing-plans before implementation.
- The current worktree has unrelated dirty files: `.omo/run-continuation/ses_10dc3d2a8ffe2rS3Zl6a8Ju85e.json` and `src/components/resume/PreviewPanel.vue`. Do not revert or include them in commits for this feature.
- Prefer placing the editor shortcut in `src/components/resume/EditorPanel.vue` to avoid touching the dirty `PreviewPanel.vue`.
- This repo has no dedicated unit test runner. Use pure TypeScript boundaries, `npm run type-check`, `npm run build-only`, and manual browser verification.

## File Structure

Create:

- `src/services/resumeReview/types.ts`  
  Shared review types, role/JD context enums, category/task/result shapes, and request payload shapes.

- `src/services/resumeReview/rubrics.ts`  
  Role-family detection, JD context state detection, rubric definitions, and score max metadata.

- `src/services/resumeReview/formatResume.ts`  
  Convert current structured resume and completed JD analysis context into AI-readable text. Include fields that current JD formatter omits, especially project links, GitHub, blog, and website.

- `src/services/resumeReview/prompt.ts`  
  Build strict system/user prompts with fairness constraints and exact JSON schema.

- `src/services/resumeReview/review.ts`  
  Public `reviewResume()` service plus JSON parse, normalization, score clamp, category rollup, and client-derived verdict.

- `src/services/resumeReview/index.ts`  
  Re-export public service API.

- `src/stores/resumeReview.ts`  
  Pinia store for latest result, history, loading/error state, signatures, and localStorage persistence.

- `src/components/resumeReview/ReviewScoreHero.vue`  
  Overall score, general score, JD fit score, verdict, target role, and role family display.

- `src/components/resumeReview/ReviewCategoryList.vue`  
  General/JD category groups with score, evidence, deductions, and advice.

- `src/components/resumeReview/ReviewActionList.vue`  
  Prioritized optimization tasks and module jump buttons.

- `src/components/resumeReview/ReviewHistoryPanel.vue`  
  Compact list of recent review records.

- `src/views/ResumeReviewView.vue`  
  Page orchestration: collect stores, derive context, call AI service, render components, handle task navigation.

Modify:

- `src/stores/aiConfig.ts`  
  Add `resumeReview` to `AiFeature`.

- `src/components/ai/AiConfigDialog.vue`  
  Add a feature-row for resume review model override.

- `src/router/index.ts`  
  Add `/resume-review` route.

- `src/App.vue`  
  Add `ResumeReviewView` to `keepAliveInclude` if the page should retain latest UI state during navigation.

- `src/components/common/ModuleSidebar.vue`  
  Add sidebar menu item and route active handling.

- `src/components/resume/EditorPanel.vue`  
  Add `AI 审查打分` shortcut that routes to `resume-review`.

Do not create `ReviewEvidencePanel.vue` in version one unless the implementation proves `ReviewCategoryList.vue` is too large.

---

### Task 1: Add Review Types And Rubrics

**Files:**
- Create: `src/services/resumeReview/types.ts`
- Create: `src/services/resumeReview/rubrics.ts`
- Create: `src/services/resumeReview/index.ts`

- [ ] **Step 1: Create the shared type definitions**

Create `src/services/resumeReview/types.ts` with the core schema. Include `missingHardRequirement` now so verdict derivation is deterministic.

```ts
export type RoleFamily = 'technical' | 'general'
export type JdContextState = 'none' | 'raw' | 'completed'
export type ReviewVerdict = 'ready' | 'needs_work' | 'high_risk'
export type ReviewPriority = 'high' | 'medium' | 'low'

export type ResumeReviewModuleKey =
  | 'basicInfo'
  | 'education'
  | 'skills'
  | 'workExperience'
  | 'projectExperience'
  | 'awards'
  | 'selfIntro'

export interface ReviewCategory {
  key: string
  label: string
  score: number
  max: number
  evidence: string
  deductions: string
  actionableAdvice: string
  relatedModuleKey: ResumeReviewModuleKey
  missingHardRequirement?: boolean
}

export interface ReviewTask {
  id: string
  priority: ReviewPriority
  title: string
  reason: string
  suggestion: string
  relatedModuleKey: ResumeReviewModuleKey
  sourceCategoryKey: string
  missingHardRequirement?: boolean
}

export interface ResumeReviewResult {
  id: string
  generatedAt: string
  targetRole: string
  roleFamily: RoleFamily
  jdContextState: JdContextState
  overallScore: number
  generalScore: number
  jdFitScore: number | null
  verdict: ReviewVerdict
  summary: string
  generalCategories: ReviewCategory[]
  jdFitCategories: ReviewCategory[]
  tasks: ReviewTask[]
  fairnessNotes: string
}

export interface CompletedJdReviewContext {
  jdData: unknown
  matchResult: unknown
  company: string
  position: string
}

export interface ResumeReviewInput {
  resumeText: string
  targetRole: string
  roleFamily: RoleFamily
  jdContextState: JdContextState
  completedJdContext: CompletedJdReviewContext | null
}
```

- [ ] **Step 2: Create rubric definitions and role detection**

Create `src/services/resumeReview/rubrics.ts`. Include exact category max values that sum to 100 for each group.

```ts
import type { JdContextState, RoleFamily } from './types'

export interface RubricItem {
  key: string
  label: string
  max: number
}

export const TECHNICAL_RUBRIC: RubricItem[] = [
  { key: 'project_complexity', label: '项目复杂度与真实影响', max: 30 },
  { key: 'production_experience', label: '生产/实习/工作经验', max: 25 },
  { key: 'technical_alignment', label: '技术技能与岗位一致性', max: 20 },
  { key: 'verifiable_work', label: '作品链接与可验证材料', max: 10 },
  { key: 'writing_quality', label: '表达质量与量化成果', max: 15 },
]

export const GENERAL_RUBRIC: RubricItem[] = [
  { key: 'role_relevance', label: '岗位相关经历', max: 30 },
  { key: 'outcome_evidence', label: '成果证据与量化表达', max: 25 },
  { key: 'capability_structure', label: '能力结构完整度', max: 20 },
  { key: 'professional_clarity', label: '清晰度与专业表达', max: 15 },
  { key: 'credibility_risk', label: '风险项与可信度', max: 10 },
]

export const JD_FIT_RUBRIC: RubricItem[] = [
  { key: 'required_coverage', label: '硬性要求覆盖', max: 35 },
  { key: 'preferred_coverage', label: '加分要求覆盖', max: 20 },
  { key: 'resume_evidence_strength', label: '简历证据强度', max: 20 },
  { key: 'risk_gaps', label: '风险缺口与硬伤', max: 15 },
  { key: 'target_positioning', label: '岗位定位与关键词一致性', max: 10 },
]

const TECHNICAL_KEYWORDS = [
  'frontend', 'front-end', '前端', 'backend', 'back-end', '后端', '全栈', 'full stack',
  'algorithm', '算法', 'ai', '人工智能', '机器学习', '深度学习', 'data', '数据',
  '测试', 'qa', 'devops', 'sre', 'engineer', 'developer', 'software', '工程师',
  'java', 'python', 'go', 'golang', 'c++', 'cloud', '云', '平台', '架构',
]

export function detectRoleFamily(input: {
  jobTitle?: string
  jdPosition?: string
  techStack?: string[]
}): RoleFamily {
  const text = [input.jobTitle, input.jdPosition, ...(input.techStack ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return TECHNICAL_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()))
    ? 'technical'
    : 'general'
}

export function detectJdContextState(input: {
  jdText?: string
  jdData?: unknown
  matchResult?: unknown
}): JdContextState {
  if (input.jdData && input.matchResult) return 'completed'
  if (input.jdText?.trim()) return 'raw'
  return 'none'
}

export function getRoleRubric(roleFamily: RoleFamily): RubricItem[] {
  return roleFamily === 'technical' ? TECHNICAL_RUBRIC : GENERAL_RUBRIC
}
```

- [ ] **Step 3: Create public barrel export**

Create `src/services/resumeReview/index.ts`.

```ts
export * from './types'
export * from './rubrics'
```

- [ ] **Step 4: Verify TypeScript**

Run: `npm run type-check`

Expected: PASS. If unrelated pre-existing type errors appear, record them before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/services/resumeReview/types.ts src/services/resumeReview/rubrics.ts src/services/resumeReview/index.ts
git commit -m "feat: add resume review rubric types"
```

---

### Task 2: Add Resume And JD Formatting

**Files:**
- Create: `src/services/resumeReview/formatResume.ts`
- Modify: `src/services/resumeReview/index.ts`

- [ ] **Step 1: Create resume formatter**

Create `src/services/resumeReview/formatResume.ts`. Reuse the current JD formatter style, but include URL fields and project links.

```ts
import { stripHtml, safeJsonStringify } from '@/services/stream'
import type { CompletedJdReviewContext } from './types'

export interface ResumeReviewSourceData {
  basicInfo: Record<string, string>
  educationList: Array<Record<string, unknown>>
  skills: string
  workList: Array<Record<string, unknown>>
  projectList: Array<Record<string, unknown>>
  awardList: Array<Record<string, unknown>>
  selfIntro: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function section(title: string, content: string): string {
  return content.trim() ? `## ${title}\n${content.trim()}` : ''
}

function labeled(label: string, value: unknown): string {
  const content = text(value)
  return content ? `${label}：${content}` : ''
}

function compact(values: unknown[], separator = ' '): string {
  return values.map(text).filter(Boolean).join(separator)
}

function dateRange(start: unknown, end: unknown): string {
  const range = compact([start, end], '-')
  return range ? `时间：${range}` : ''
}

function heading(values: string[]): string {
  const content = values.filter(Boolean).join(' | ')
  return content ? `### ${content}` : ''
}

export function formatResumeForReview(data: ResumeReviewSourceData): string {
  const basic = data.basicInfo ?? {}
  const parts: string[] = []

  parts.push(section('基本信息', [
    labeled('姓名', basic.name),
    labeled('目标岗位', basic.jobTitle),
    labeled('最高学历', basic.educationLevel),
    labeled('工作年限', basic.workYears),
    labeled('所在地', basic.location),
    labeled('个人网站', basic.website),
    labeled('GitHub', basic.github),
    labeled('博客', basic.blog),
  ].filter(Boolean).join('\n')))

  const educationItems = (data.educationList ?? []).filter((item) =>
    compact([item.school, item.college, item.major, item.degree, item.startDate, item.endDate, item.description])
  )
  const education = educationItems.map((item) => [
    compact([item.school, item.college, item.major]) ? `- 学校：${compact([item.school, item.college, item.major])}` : '',
    compact([labeled('学位', item.degree), dateRange(item.startDate, item.endDate)], ' '),
    text(item.description) ? `  描述：${stripHtml(text(item.description))}` : '',
  ].filter(Boolean).join('\n')).join('\n')
  parts.push(section('教育经历', education))

  parts.push(section('专业技能', stripHtml(data.skills ?? '')))

  const workItems = (data.workList ?? []).filter((item) =>
    compact([item.company, item.position, item.department, item.startDate, item.endDate, item.description])
  )
  const work = workItems.map((item) => [
    heading([text(item.company), text(item.position), dateRange(item.startDate, item.endDate)]),
    labeled('部门', item.department),
    text(item.description) ? stripHtml(text(item.description)) : '',
  ].filter(Boolean).join('\n')).join('\n\n')
  parts.push(section('工作经历', work))

  const projectItems = (data.projectList ?? []).filter((item) =>
    compact([item.name, item.role, item.startDate, item.endDate, item.link, item.introduction, item.mainWork])
  )
  const projects = projectItems.map((item) => [
    heading([text(item.name), text(item.role), dateRange(item.startDate, item.endDate)]),
    labeled('链接', item.link),
    text(item.introduction) ? `项目介绍：${stripHtml(text(item.introduction))}` : '',
    text(item.mainWork) ? `主要工作：${stripHtml(text(item.mainWork))}` : '',
  ].filter(Boolean).join('\n')).join('\n\n')
  parts.push(section('项目经历', projects))

  const awardItems = (data.awardList ?? []).filter((item) =>
    compact([item.name, item.date, item.description])
  )
  const awards = awardItems.map((item) => [
    compact([text(item.name), text(item.date)], ' | ') ? `- ${compact([text(item.name), text(item.date)], ' | ')}` : '',
    text(item.description) ? stripHtml(text(item.description)) : '',
  ].filter(Boolean).join(' | ')).join('\n')
  parts.push(section('荣誉奖项', awards))

  parts.push(section('个人简介', stripHtml(data.selfIntro ?? '')))

  return parts.filter(Boolean).join('\n\n')
}

export function hasEnoughResumeContent(data: ResumeReviewSourceData): boolean {
  const hasBasic = Boolean(text(data.basicInfo?.name) || text(data.basicInfo?.jobTitle))
  const hasSkills = Boolean(stripHtml(data.skills ?? '').trim())
  const hasWork = (data.workList ?? []).some((item) => text(item.company) || text(item.description))
  const hasProject = (data.projectList ?? []).some((item) => text(item.name) || text(item.mainWork))
  return hasBasic && (hasSkills || hasWork || hasProject)
}

export function formatCompletedJdContext(context: CompletedJdReviewContext | null): string {
  if (!context) return ''
  return [
    `公司：${context.company}`,
    `岗位：${context.position}`,
    'JD 提取结果：',
    safeJsonStringify(context.jdData),
    'JD-简历匹配结果：',
    safeJsonStringify(context.matchResult),
  ].join('\n')
}
```

- [ ] **Step 2: Export formatter functions**

Modify `src/services/resumeReview/index.ts`.

```ts
export * from './types'
export * from './rubrics'
export * from './formatResume'
```

- [ ] **Step 3: Verify TypeScript**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/resumeReview/formatResume.ts src/services/resumeReview/index.ts
git commit -m "feat: format resume review context"
```

---

### Task 3: Add Prompt Builder And Review Normalization

**Files:**
- Create: `src/services/resumeReview/prompt.ts`
- Create: `src/services/resumeReview/review.ts`
- Modify: `src/services/resumeReview/index.ts`

- [ ] **Step 1: Build strict prompt templates**

Create `src/services/resumeReview/prompt.ts`.

```ts
import { safeJsonStringify } from '@/services/stream'
import { formatCompletedJdContext } from './formatResume'
import { JD_FIT_RUBRIC, getRoleRubric } from './rubrics'
import type { ResumeReviewInput } from './types'

export const RESUME_REVIEW_SYSTEM_PROMPT = `你是资深招聘官和简历审查专家。你不是在写简历总结，而是在按规则给简历打分并输出可执行优化任务。

公平性要求：
- 不得基于姓名、性别、年龄、学校名气、GPA/成绩、城市/地域打分。
- 只根据岗位相关经历、技能、项目复杂度、真实影响、证据强度、可验证材料和专业表达评分。
- 只能输出有效 JSON，不要输出 Markdown、解释或代码块。`

export function buildResumeReviewPrompt(input: ResumeReviewInput): string {
  const roleRubric = getRoleRubric(input.roleFamily)
  const wantsJdFit = input.jdContextState === 'completed'
  const completedJdText = wantsJdFit ? formatCompletedJdContext(input.completedJdContext) : ''
  const schema = {
    overallScore: 0,
    generalScore: 0,
    jdFitScore: wantsJdFit ? 0 : null,
    verdict: 'needs_work',
    roleFamily: input.roleFamily,
    summary: 'string',
    generalCategories: roleRubric.map((item) => ({
      key: item.key,
      label: item.label,
      score: 0,
      max: item.max,
      evidence: 'string',
      deductions: 'string',
      actionableAdvice: 'string',
      relatedModuleKey: 'projectExperience',
      missingHardRequirement: false,
    })),
    jdFitCategories: wantsJdFit
      ? JD_FIT_RUBRIC.map((item) => ({
          key: item.key,
          label: item.label,
          score: 0,
          max: item.max,
          evidence: 'string',
          deductions: 'string',
          actionableAdvice: 'string',
          relatedModuleKey: 'projectExperience',
          missingHardRequirement: false,
        }))
      : [],
    tasks: [{
      id: 'task_1',
      priority: 'high',
      title: 'string',
      reason: 'string',
      suggestion: 'string',
      relatedModuleKey: 'projectExperience',
      sourceCategoryKey: roleRubric[0]?.key ?? 'role_relevance',
      missingHardRequirement: false,
    }],
    fairnessNotes: 'string',
  }

  return `请审查以下简历，并严格按 JSON schema 返回。

目标岗位：${input.targetRole || '未填写'}
岗位族：${input.roleFamily}
JD 上下文状态：${input.jdContextState}

通用/岗位族评分维度：
${roleRubric.map((item) => `- ${item.label}: ${item.max}`).join('\n')}

${wantsJdFit ? `JD 适配评分维度：\n${JD_FIT_RUBRIC.map((item) => `- ${item.label}: ${item.max}`).join('\n')}` : '本次没有已完成 JD 分析。jdFitScore 必须为 null，jdFitCategories 必须为空数组。'}

硬性输出要求：
1. 只返回 JSON，不要 Markdown。
2. generalCategories 的 max 必须与上方岗位族评分维度一致，总 max 为 100。
3. 如果 JD 上下文状态不是 completed，jdFitScore 必须为 null，jdFitCategories 必须为空数组。
4. 每个 category 必须有 evidence、deductions、actionableAdvice。
5. tasks 必须是候选人可执行的修改任务，最多 8 条。
6. relatedModuleKey 只能是 basicInfo、education、skills、workExperience、projectExperience、awards、selfIntro。
7. 如果任务对应缺失硬性要求，missingHardRequirement 必须为 true。

JSON schema 示例：
${safeJsonStringify(schema)}

简历内容：
${input.resumeText}

${completedJdText ? `已完成 JD 分析上下文：\n${completedJdText}` : ''}`
}
```

- [ ] **Step 2: Implement review service and normalization**

Create `src/services/resumeReview/review.ts`. The code must recompute `generalScore`, `jdFitScore`, `overallScore`, and `verdict` client-side.

```ts
import type { AiConfig } from '@/services/stream'
import { cleanJsonResponse, nonStreamAIRequest } from '@/services/stream'
import { JD_FIT_RUBRIC, getRoleRubric } from './rubrics'
import { buildResumeReviewPrompt, RESUME_REVIEW_SYSTEM_PROMPT } from './prompt'
import type {
  JdContextState,
  ResumeReviewInput,
  ResumeReviewModuleKey,
  ResumeReviewResult,
  ReviewCategory,
  ReviewTask,
  ReviewVerdict,
  RoleFamily,
} from './types'

const MODULE_KEYS: ResumeReviewModuleKey[] = [
  'basicInfo',
  'education',
  'skills',
  'workExperience',
  'projectExperience',
  'awards',
  'selfIntro',
]

function clampScore(value: unknown, min: number, max: number): number {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return min
  return Math.min(Math.max(Math.round(numberValue), min), max)
}

function normalizeModuleKey(value: unknown): ResumeReviewModuleKey {
  return MODULE_KEYS.includes(value as ResumeReviewModuleKey)
    ? value as ResumeReviewModuleKey
    : 'projectExperience'
}

function normalizeCategory(raw: unknown, fallback: { key: string; label: string; max: number }): ReviewCategory {
  const item = raw && typeof raw === 'object' ? raw as Partial<ReviewCategory> : {}
  return {
    key: item.key || fallback.key,
    label: item.label || fallback.label,
    score: clampScore(item.score, 0, fallback.max),
    max: fallback.max,
    evidence: String(item.evidence || '暂无明确证据。'),
    deductions: String(item.deductions || '暂无明确扣分项。'),
    actionableAdvice: String(item.actionableAdvice || '补充更具体的成果、数据或职责边界。'),
    relatedModuleKey: normalizeModuleKey(item.relatedModuleKey),
    missingHardRequirement: Boolean(item.missingHardRequirement),
  }
}

function normalizeCategories(raw: unknown, rubric: Array<{ key: string; label: string; max: number }>): ReviewCategory[] {
  const source = Array.isArray(raw) ? raw : []
  return rubric.map((fallback) => {
    const matched = source.find((item) => item && typeof item === 'object' && (item as { key?: string }).key === fallback.key)
    return normalizeCategory(matched, fallback)
  })
}

function rollup(categories: ReviewCategory[]): number {
  const max = categories.reduce((sum, item) => sum + item.max, 0)
  if (!max) return 0
  const score = categories.reduce((sum, item) => sum + clampScore(item.score, 0, item.max), 0)
  return clampScore((score / max) * 100, 0, 100)
}

function normalizeTask(raw: unknown, index: number): ReviewTask {
  const item = raw && typeof raw === 'object' ? raw as Partial<ReviewTask> : {}
  const priority = item.priority === 'high' || item.priority === 'medium' || item.priority === 'low'
    ? item.priority
    : 'medium'
  return {
    id: item.id || `task_${index + 1}`,
    priority,
    title: String(item.title || '补充简历证据'),
    reason: String(item.reason || '当前内容缺少可验证证据。'),
    suggestion: String(item.suggestion || '补充具体职责、动作、数据结果和技术细节。'),
    relatedModuleKey: normalizeModuleKey(item.relatedModuleKey),
    sourceCategoryKey: String(item.sourceCategoryKey || ''),
    missingHardRequirement: Boolean(item.missingHardRequirement),
  }
}

function deriveVerdict(overallScore: number, tasks: ReviewTask[]): ReviewVerdict {
  const hasMissingHardRequirement = tasks.some((task) => task.priority === 'high' && task.missingHardRequirement)
  if (overallScore < 60 || hasMissingHardRequirement) return 'high_risk'
  if (overallScore >= 80) return 'ready'
  return 'needs_work'
}

export function normalizeReviewResult(raw: unknown, input: ResumeReviewInput): ResumeReviewResult {
  const payload = raw && typeof raw === 'object' ? raw as Partial<ResumeReviewResult> : {}
  const generalCategories = normalizeCategories(payload.generalCategories, getRoleRubric(input.roleFamily))
  const jdFitCategories = input.jdContextState === 'completed'
    ? normalizeCategories(payload.jdFitCategories, JD_FIT_RUBRIC)
    : []
  const generalScore = rollup(generalCategories)
  const jdFitScore = input.jdContextState === 'completed' ? rollup(jdFitCategories) : null
  const overallScore = jdFitScore === null
    ? generalScore
    : clampScore(generalScore * 0.7 + jdFitScore * 0.3, 0, 100)
  const tasks = (Array.isArray(payload.tasks) ? payload.tasks : [])
    .slice(0, 8)
    .map(normalizeTask)

  return {
    id: `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    generatedAt: new Date().toISOString(),
    targetRole: input.targetRole,
    roleFamily: input.roleFamily as RoleFamily,
    jdContextState: input.jdContextState as JdContextState,
    overallScore,
    generalScore,
    jdFitScore,
    verdict: deriveVerdict(overallScore, tasks),
    summary: String(payload.summary || '已完成简历审查，请优先处理高优先级优化项。'),
    generalCategories,
    jdFitCategories,
    tasks,
    fairnessNotes: String(payload.fairnessNotes || '评分已排除姓名、性别、年龄、学校名气、GPA、地域等非岗位相关因素。'),
  }
}

export async function reviewResume(
  config: AiConfig,
  input: ResumeReviewInput,
  signal?: AbortSignal,
): Promise<ResumeReviewResult> {
  const text = await nonStreamAIRequest(
    config,
    RESUME_REVIEW_SYSTEM_PROMPT,
    buildResumeReviewPrompt(input),
    { temperature: 0.2, maxTokens: 6000 },
    signal,
  )

  try {
    return normalizeReviewResult(JSON.parse(cleanJsonResponse(text)), input)
  } catch {
    throw new Error('AI 返回的简历审查数据格式异常，请重试。')
  }
}
```

- [ ] **Step 3: Export prompt and review service**

Modify `src/services/resumeReview/index.ts`.

```ts
export * from './types'
export * from './rubrics'
export * from './formatResume'
export * from './prompt'
export * from './review'
```

- [ ] **Step 4: Verify TypeScript**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/resumeReview/prompt.ts src/services/resumeReview/review.ts src/services/resumeReview/index.ts
git commit -m "feat: add resume review AI service"
```

---

### Task 4: Add Resume Review Store

**Files:**
- Create: `src/stores/resumeReview.ts`

- [ ] **Step 1: Create Pinia store**

Create `src/stores/resumeReview.ts`.

```ts
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { ResumeReviewResult } from '@/services/resumeReview'

export interface ResumeReviewHistoryItem {
  id: string
  generatedAt: string
  targetRole: string
  roleFamily: ResumeReviewResult['roleFamily']
  resumeSignature: string
  jdSignature: string
  result: ResumeReviewResult
}

const STORAGE_KEY = 'prepwise-resume-review'
const MAX_HISTORY_ITEMS = 12

function simpleHash(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

export function buildReviewSignature(prefix: string, value: unknown): string {
  return `${prefix}_${simpleHash(JSON.stringify(value ?? {}))}`
}

export const useResumeReviewStore = defineStore('resumeReview', () => {
  const latestResult = ref<ResumeReviewResult | null>(null)
  const history = ref<ResumeReviewHistoryItem[]>([])
  const isLoading = ref(false)
  const errorMsg = ref('')
  const activeReviewId = ref('')

  const hasHistory = computed(() => history.value.length > 0)

  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      latestResult: latestResult.value,
      history: history.value,
      activeReviewId: activeReviewId.value,
    }))
  }

  function loadFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as {
        latestResult?: ResumeReviewResult | null
        history?: ResumeReviewHistoryItem[]
        activeReviewId?: string
      }
      latestResult.value = parsed.latestResult ?? null
      history.value = Array.isArray(parsed.history) ? parsed.history.slice(0, MAX_HISTORY_ITEMS) : []
      activeReviewId.value = parsed.activeReviewId ?? latestResult.value?.id ?? ''
    } catch {
      latestResult.value = null
      history.value = []
      activeReviewId.value = ''
    }
  }

  function setLoading(value: boolean) {
    isLoading.value = value
    if (value) errorMsg.value = ''
  }

  function setError(message: string) {
    errorMsg.value = message
    isLoading.value = false
  }

  function saveResult(result: ResumeReviewResult, signatures: { resumeSignature: string; jdSignature: string }) {
    latestResult.value = result
    activeReviewId.value = result.id
    const item: ResumeReviewHistoryItem = {
      id: result.id,
      generatedAt: result.generatedAt,
      targetRole: result.targetRole,
      roleFamily: result.roleFamily,
      resumeSignature: signatures.resumeSignature,
      jdSignature: signatures.jdSignature,
      result,
    }
    history.value = [item, ...history.value.filter((entry) => entry.id !== result.id)].slice(0, MAX_HISTORY_ITEMS)
  }

  function openHistoryItem(id: string) {
    const item = history.value.find((entry) => entry.id === id)
    if (!item) return
    latestResult.value = item.result
    activeReviewId.value = item.id
  }

  function clearError() {
    errorMsg.value = ''
  }

  loadFromStorage()
  watch([latestResult, history, activeReviewId], () => saveToStorage(), { deep: true })

  return {
    latestResult,
    history,
    isLoading,
    errorMsg,
    activeReviewId,
    hasHistory,
    setLoading,
    setError,
    saveResult,
    openHistoryItem,
    clearError,
  }
})
```

- [ ] **Step 2: Verify TypeScript**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/stores/resumeReview.ts
git commit -m "feat: store resume review history"
```

---

### Task 5: Build Resume Review Display Components

**Files:**
- Create: `src/components/resumeReview/ReviewScoreHero.vue`
- Create: `src/components/resumeReview/ReviewCategoryList.vue`
- Create: `src/components/resumeReview/ReviewActionList.vue`
- Create: `src/components/resumeReview/ReviewHistoryPanel.vue`

- [ ] **Step 1: Create score hero**

Create `ReviewScoreHero.vue` with props only. Keep it dense and avoid decorative nested cards.

```vue
<script setup lang="ts">
import type { ResumeReviewResult } from '@/services/resumeReview'

defineProps<{
  result: ResumeReviewResult | null
  loading: boolean
  jdUnlockHint: boolean
}>()

const verdictLabel: Record<ResumeReviewResult['verdict'], string> = {
  ready: '可投递',
  needs_work: '建议优化后投递',
  high_risk: '高风险',
}
</script>

<template>
  <section class="review-score-hero panel-surface">
    <div class="hero-main">
      <p class="eyebrow">AI 简历审查</p>
      <h1 class="page-title">简历审查打分</h1>
      <p class="hero-desc">用招聘方视角审查简历质量，再转成可执行优化清单。</p>
    </div>

    <div class="score-block">
      <p class="score-label">综合分</p>
      <p class="score-value">{{ result ? result.overallScore : '--' }}</p>
      <p class="score-verdict">{{ result ? verdictLabel[result.verdict] : loading ? '审查中' : '待审查' }}</p>
    </div>

    <div class="score-metrics">
      <div class="metric">
        <span>通用质量</span>
        <strong>{{ result ? result.generalScore : '--' }}</strong>
      </div>
      <div class="metric">
        <span>JD 适配</span>
        <strong>{{ result?.jdFitScore ?? '--' }}</strong>
      </div>
      <div class="metric">
        <span>岗位族</span>
        <strong>{{ result?.roleFamily === 'technical' ? '技术岗' : '通用岗' }}</strong>
      </div>
    </div>

    <p v-if="jdUnlockHint" class="jd-hint">完成 JD 分析后，可解锁岗位适配分。</p>
  </section>
</template>
```

Add scoped CSS using existing variables: `.review-score-hero`, `.hero-main`, `.score-block`, `.score-metrics`, `.metric`, `.jd-hint`. Use responsive grid that collapses on mobile.

- [ ] **Step 2: Create category list component**

Create `ReviewCategoryList.vue`.

```vue
<script setup lang="ts">
import type { ReviewCategory } from '@/services/resumeReview'

defineProps<{
  title: string
  categories: ReviewCategory[]
}>()
</script>

<template>
  <section class="review-section">
    <div class="section-head">
      <h2>{{ title }}</h2>
      <span>{{ categories.length }} 项</span>
    </div>
    <div class="category-list">
      <article v-for="item in categories" :key="item.key" class="category-row card-surface">
        <div class="category-score">
          <strong>{{ item.score }}</strong>
          <span>/ {{ item.max }}</span>
        </div>
        <div class="category-body">
          <h3>{{ item.label }}</h3>
          <p><b>证据：</b>{{ item.evidence }}</p>
          <p><b>扣分：</b>{{ item.deductions }}</p>
          <p><b>建议：</b>{{ item.actionableAdvice }}</p>
        </div>
      </article>
    </div>
  </section>
</template>
```

Add scoped CSS for compact rows. Do not use card-inside-card nesting.

- [ ] **Step 3: Create action list component**

Create `ReviewActionList.vue`.

```vue
<script setup lang="ts">
import type { ReviewTask } from '@/services/resumeReview'

defineProps<{
  tasks: ReviewTask[]
}>()

defineEmits<{
  (e: 'open-module', moduleKey: ReviewTask['relatedModuleKey']): void
}>()

const priorityLabel: Record<ReviewTask['priority'], string> = {
  high: '高',
  medium: '中',
  low: '低',
}
</script>

<template>
  <section class="review-section">
    <div class="section-head">
      <h2>优化清单</h2>
      <span>{{ tasks.length }} 项</span>
    </div>
    <div class="task-list">
      <article v-for="task in tasks" :key="task.id" class="task-row card-surface" :data-priority="task.priority">
        <span class="priority">{{ priorityLabel[task.priority] }}</span>
        <div class="task-body">
          <h3>{{ task.title }}</h3>
          <p>{{ task.reason }}</p>
          <p class="suggestion">{{ task.suggestion }}</p>
        </div>
        <button type="button" class="task-jump" @click="$emit('open-module', task.relatedModuleKey)">去修改</button>
      </article>
    </div>
  </section>
</template>
```

Add scoped CSS with stable button sizes and no text overflow.

- [ ] **Step 4: Create history panel component**

Create `ReviewHistoryPanel.vue`.

```vue
<script setup lang="ts">
import type { ResumeReviewHistoryItem } from '@/stores/resumeReview'

defineProps<{
  history: ResumeReviewHistoryItem[]
  activeId: string
}>()

defineEmits<{
  (e: 'open', id: string): void
}>()

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <aside class="history-panel panel-surface">
    <div class="section-head">
      <h2>审查历史</h2>
      <span>{{ history.length }} / 12</span>
    </div>
    <button
      v-for="item in history"
      :key="item.id"
      class="history-item"
      :class="{ active: item.id === activeId }"
      type="button"
      @click="$emit('open', item.id)"
    >
      <span>{{ formatDate(item.generatedAt) }}</span>
      <strong>{{ item.result.overallScore }}</strong>
      <small>{{ item.targetRole || '未填写岗位' }} · {{ item.result.roleFamily }}</small>
      <small>
        通用 {{ item.result.generalScore }}
        <template v-if="item.result.jdFitScore !== null"> · JD {{ item.result.jdFitScore }}</template>
      </small>
    </button>
  </aside>
</template>
```

Add scoped CSS so the list scrolls inside the panel at small heights.

- [ ] **Step 5: Verify TypeScript**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/resumeReview
git commit -m "feat: add resume review components"
```

---

### Task 6: Build Resume Review View

**Files:**
- Create: `src/views/ResumeReviewView.vue`

- [ ] **Step 1: Create view script**

Create `src/views/ResumeReviewView.vue`. The view orchestrates stores and the AI service. It must not send raw JD text to the review prompt.

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useResumeReviewStore, buildReviewSignature } from '@/stores/resumeReview'
import { useResumeStore } from '@/stores/resume'
import ReviewActionList from '@/components/resumeReview/ReviewActionList.vue'
import ReviewCategoryList from '@/components/resumeReview/ReviewCategoryList.vue'
import ReviewHistoryPanel from '@/components/resumeReview/ReviewHistoryPanel.vue'
import ReviewScoreHero from '@/components/resumeReview/ReviewScoreHero.vue'
import {
  detectJdContextState,
  detectRoleFamily,
  formatResumeForReview,
  hasEnoughResumeContent,
  reviewResume,
  type CompletedJdReviewContext,
  type ResumeReviewModuleKey,
} from '@/services/resumeReview'

defineOptions({ name: 'ResumeReviewView' })

const router = useRouter()
const resumeStore = useResumeStore()
const jdStore = useJdAnalysisStore()
const reviewStore = useResumeReviewStore()
const aiConfigStore = useAiConfigStore()

const resumeData = computed(() => resumeStore.exportToJSON() as Parameters<typeof formatResumeForReview>[0])
const resumeText = computed(() => formatResumeForReview(resumeData.value))
const jdContextState = computed(() => detectJdContextState({
  jdText: jdStore.jdText,
  jdData: jdStore.jdData,
  matchResult: jdStore.matchResult,
}))
const completedJdTitle = computed(() =>
  jdContextState.value === 'completed' ? jdStore.jdData?.basicInfo.jobTitle : ''
)
const completedTechStack = computed(() =>
  jdContextState.value === 'completed' ? jdStore.jdData?.requirements.techStack : []
)
const roleFamily = computed(() => detectRoleFamily({
  jobTitle: resumeStore.basicInfo.jobTitle,
  jdPosition: jdStore.targetPosition || completedJdTitle.value,
  techStack: completedTechStack.value,
}))
const targetRole = computed(() => resumeStore.basicInfo.jobTitle || jdStore.targetPosition || completedJdTitle.value || '')
const completedJdContext = computed<CompletedJdReviewContext | null>(() => {
  if (jdContextState.value !== 'completed' || !jdStore.jdData || !jdStore.matchResult) return null
  return {
    jdData: jdStore.jdData,
    matchResult: jdStore.matchResult,
    company: jdStore.targetCompany || jdStore.jdData.basicInfo.company,
    position: jdStore.targetPosition || jdStore.jdData.basicInfo.jobTitle,
  }
})
const jdUnlockHint = computed(() => jdContextState.value === 'raw')
const config = computed(() => aiConfigStore.getConfigForFeature('resumeReview'))

async function startReview() {
  if (reviewStore.isLoading) return
  if (!hasEnoughResumeContent(resumeData.value)) {
    reviewStore.setError('简历内容太少，请至少补充基本信息，并填写技能、项目或工作经历之一。')
    return
  }
  if (!config.value.apiUrl || !config.value.modelName) {
    reviewStore.setError('请先在 AI 配置中设置可用模型。')
    return
  }

  reviewStore.setLoading(true)
  try {
    const result = await reviewResume(config.value, {
      resumeText: resumeText.value,
      targetRole: targetRole.value,
      roleFamily: roleFamily.value,
      jdContextState: jdContextState.value,
      completedJdContext: completedJdContext.value,
    })
    reviewStore.saveResult(result, {
      resumeSignature: buildReviewSignature('resume', resumeData.value),
      jdSignature: jdContextState.value === 'completed'
        ? buildReviewSignature('jd', { jdData: jdStore.jdData, matchResult: jdStore.matchResult })
        : '',
    })
  } catch (error) {
    reviewStore.setError(error instanceof Error ? error.message : String(error))
  } finally {
    reviewStore.setLoading(false)
  }
}

function openModule(moduleKey: ResumeReviewModuleKey) {
  resumeStore.requestScrollToModule(moduleKey)
  void router.push({ name: 'resume-editor' })
}
</script>
```

- [ ] **Step 2: Create view template**

Add the view template below the script.

```vue
<template>
  <section class="resume-review-page">
    <div class="review-main">
      <ReviewScoreHero
        :result="reviewStore.latestResult"
        :loading="reviewStore.isLoading"
        :jd-unlock-hint="jdUnlockHint"
      />

      <div class="review-toolbar panel-surface">
        <div>
          <p class="toolbar-title">当前目标岗位：{{ targetRole || '未填写' }}</p>
          <p class="toolbar-sub">评分模式：{{ roleFamily === 'technical' ? '技术岗 rubric' : '通用 rubric' }}</p>
        </div>
        <button class="primary-action" type="button" :disabled="reviewStore.isLoading" @click="startReview">
          {{ reviewStore.isLoading ? '审查中...' : reviewStore.latestResult ? '重新审查' : '开始审查' }}
        </button>
      </div>

      <p v-if="reviewStore.errorMsg" class="review-error">{{ reviewStore.errorMsg }}</p>

      <div v-if="reviewStore.latestResult" class="review-results">
        <ReviewCategoryList title="通用质量评分" :categories="reviewStore.latestResult.generalCategories" />
        <ReviewCategoryList
          v-if="reviewStore.latestResult.jdFitCategories.length"
          title="JD 适配评分"
          :categories="reviewStore.latestResult.jdFitCategories"
        />
        <ReviewActionList :tasks="reviewStore.latestResult.tasks" @open-module="openModule" />
      </div>

      <div v-else class="empty-state panel-surface">
        <h2>还没有审查结果</h2>
        <p>点击开始审查后，会生成招聘方视角评分和可执行优化清单。</p>
      </div>
    </div>

    <ReviewHistoryPanel
      class="review-side"
      :history="reviewStore.history"
      :active-id="reviewStore.activeReviewId"
      @open="reviewStore.openHistoryItem"
    />
  </section>
</template>
```

- [ ] **Step 3: Add scoped CSS**

Add CSS with stable responsive layout.

```vue
<style scoped>
.resume-review-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 14px;
  width: 100%;
  height: 100%;
  padding: 14px;
  overflow: hidden;
  background: var(--bg-shell);
}

.review-main {
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.review-side {
  min-width: 0;
  overflow: hidden;
}

.review-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.toolbar-title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--text-primary);
}

.toolbar-sub {
  margin: 4px 0 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.primary-action {
  min-width: 108px;
  height: 38px;
  border: 1px solid var(--accent-blue-500);
  border-radius: 8px;
  background: var(--accent-blue-500);
  color: #fff;
  font-weight: var(--weight-bold);
  cursor: pointer;
}

.primary-action:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.review-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(216, 80, 80, 0.08);
  color: var(--accent-red);
  font-size: var(--text-sm);
}

.review-results {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty-state {
  padding: 28px;
  text-align: center;
}

.empty-state h2 {
  margin: 0 0 8px;
  font-size: var(--text-lg);
  color: var(--text-primary);
}

.empty-state p {
  margin: 0;
  color: var(--text-secondary);
}

@media (max-width: 980px) {
  .resume-review-page {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .review-main {
    overflow: visible;
  }
}
</style>
```

- [ ] **Step 4: Verify TypeScript**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/ResumeReviewView.vue
git commit -m "feat: add resume review view"
```

---

### Task 7: Wire Routing, Sidebar, Editor Shortcut, And AI Config

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/App.vue`
- Modify: `src/components/common/ModuleSidebar.vue`
- Modify: `src/components/resume/EditorPanel.vue`
- Modify: `src/stores/aiConfig.ts`
- Modify: `src/components/ai/AiConfigDialog.vue`

- [ ] **Step 1: Add AI feature key**

Modify `src/stores/aiConfig.ts`.

```ts
export type AiFeature =
  | 'default'
  | 'resumeImport'
  | 'resumeReview'
  | 'jdAnalysis'
  | 'jdInterview'
  | 'jdCompanyIntel'
  | 'resumeOptimize'
  | 'interview'
  | 'asr'
  | 'tts'
  | 'vision'
```

- [ ] **Step 2: Add AI config row**

Modify `FEATURE_ROWS` in `src/components/ai/AiConfigDialog.vue`.

```ts
const FEATURE_ROWS: { feature: AiFeature; label: string; desc: string }[] = [
  { feature: 'resumeOptimize', label: '简历优化', desc: '简历 AI 改写、优化建议' },
  { feature: 'resumeReview', label: '简历审查', desc: 'AI 简历审查打分、优化清单' },
  { feature: 'jdAnalysis', label: 'JD 分析', desc: 'JD 解析、匹配、优化' },
  { feature: 'interview', label: '面试对话', desc: 'AI 模拟面试、专项训练' },
  { feature: 'jdCompanyIntel', label: '公司情报', desc: '公司背景、竞品调研' },
  { feature: 'resumeImport', label: '简历导入', desc: '智能解析简历文件' },
  { feature: 'jdInterview', label: '面试题库', desc: '面试题生成、追问' },
]
```

- [ ] **Step 3: Add route**

Modify `src/router/index.ts`.

```ts
{
  path: '/resume-review',
  name: 'resume-review',
  component: () => import('@/views/ResumeReviewView.vue'),
},
```

- [ ] **Step 4: Add keep-alive include**

Modify `src/App.vue`.

```ts
const keepAliveInclude = ['ResumeEditorView', 'ResumeReviewView', 'JdAnalysisView', 'QuestionBankView']
```

- [ ] **Step 5: Add sidebar item**

Modify `primaryMenus` in `src/components/common/ModuleSidebar.vue`. Insert after `resume-editor`.

```ts
{
  key: 'resume-review' as const,
  label: '简历审查',
  routeName: 'resume-review',
  iconPath:
    'M9 11l2 2 4-5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 17h8',
},
```

Update `isMenuActive()`:

```ts
if (menuKey === 'resume-review') return route.name === 'resume-review' || route.path === '/resume-review'
```

Update `getMenuRoute()`:

```ts
if (menuKey === 'resume-review') return { name: 'resume-review' }
```

- [ ] **Step 6: Add editor shortcut**

Modify `src/components/resume/EditorPanel.vue`.

Add import:

```ts
import { useRouter } from 'vue-router'
```

Add setup binding:

```ts
const router = useRouter()

function goToResumeReview() {
  void router.push({ name: 'resume-review' })
}
```

Add a compact button in `.editor-hero-actions`, near the save button:

```vue
<button class="btn-review" type="button" title="AI 简历审查打分" @click="goToResumeReview">
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 11l2 2 4-5" />
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
  </svg>
  <span>AI 审查</span>
</button>
```

Add scoped CSS:

```css
.btn-review {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid var(--border-color-strong);
  border-radius: 8px;
  background: transparent;
  color: var(--accent-blue-600);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  cursor: pointer;
}

.btn-review svg {
  width: 16px;
  height: 16px;
}

.btn-review path {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

- [ ] **Step 7: Verify TypeScript**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/stores/aiConfig.ts src/components/ai/AiConfigDialog.vue src/router/index.ts src/App.vue src/components/common/ModuleSidebar.vue src/components/resume/EditorPanel.vue
git commit -m "feat: wire resume review navigation"
```

---

### Task 8: Final Verification And Browser Check

**Files:**
- No planned code files unless verification finds issues.

- [ ] **Step 1: Run full type check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build-only`

Expected: PASS and Vite build completes.

- [ ] **Step 3: Start or reuse dev server**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite reports a local URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 4: Browser smoke test**

Use the Browser plugin or equivalent local browser tool.

Check:

- Open `/resume-review`.
- Sidebar item `简历审查` is visible and active on the route.
- Empty state renders without overflow.
- `开始审查` on thin resume shows readable error and does not call AI.
- Editor `AI 审查` shortcut navigates to `/resume-review`.
- If a stored result exists, history item opens and score/category/task sections render.
- Mobile width around 390px does not clip buttons or score text.

- [ ] **Step 5: Review git status**

Run: `git status --short`

Expected:

- Only intended feature files are modified.
- Pre-existing unrelated dirty files remain untouched unless the user explicitly asked otherwise.

- [ ] **Step 6: Final commit if verification fixes were needed**

If verification required fixes, stage only the concrete feature files changed by those fixes, then commit:

```bash
git commit -m "fix: polish resume review verification"
```

If no fixes were needed, no extra commit is required.

---

## Manual QA Matrix

After implementation, test these scenarios:

- Empty resume: review button shows "content too thin" error.
- Basic technical resume without JD: `jdFitScore` is null, `overallScore === generalScore`, `jdFitCategories` empty.
- Technical resume with completed JD analysis: both category groups render, `overallScore = round(generalScore * 0.7 + jdFitScore * 0.3)`.
- Resume with raw JD text but no completed match result: no JD score, hint tells user to run JD analysis.
- General/non-technical target role: general rubric labels render.
- Invalid AI JSON: readable error appears and retry is possible.
- Task click opens resume editor and scrolls to the expected module.
- History stores at most 12 records.

## Execution Notes

- Do not add GitHub API calls.
- Do not auto-rewrite resume content.
- Do not introduce a new test framework for this feature.
- Keep commits scoped to this feature. Do not include `.omo` state or unrelated edits in `PreviewPanel.vue`.
