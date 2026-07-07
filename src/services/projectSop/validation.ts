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
  return {
    id: id('action'),
    title: '',
    description: '',
    input: '',
    output: '',
    owner: '',
    acceptance: '',
  }
}

export function createEmptyProjectSopChallenge(): ProjectSopChallenge {
  return {
    id: id('challenge'),
    type: 'business_logic',
    problem: '',
    rootCause: '',
    solution: '',
    result: '',
  }
}

export function createEmptyProjectSopMetric(): ProjectSopMetric {
  return {
    id: id('metric'),
    name: '',
    before: '',
    after: '',
    measurement: '',
    businessValue: '',
  }
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

  if (!text(dossier.name)) {
    blockingIssues.push(issue('name', '项目名称', '缺少项目名称。', '这个项目的正式名称是什么？'))
  }
  if (!text(dossier.role)) {
    blockingIssues.push(issue('role', '个人角色', '缺少你在项目中的角色。', '你在这个项目中担任什么角色？'))
  }
  if (!text(dossier.background)) {
    blockingIssues.push(issue('background', '项目背景', '缺少项目背景。', '项目是在什么业务背景下立项的？'))
  }
  if (!text(dossier.goals)) {
    blockingIssues.push(issue('goals', '项目目标', '缺少项目目标。', '项目立项时最核心的目标或指标是什么？'))
  }
  if (filledActions.length < 2) {
    blockingIssues.push(issue('actions', '核心动作', '至少需要 2 个核心执行动作。', '你主导或负责的两个关键动作分别是什么？'))
  }
  if (filledChallenges.length < 1) {
    blockingIssues.push(issue('challenges', '项目难点', '至少需要 1 个真实难点。', '项目中最值得展开的难点是什么，你怎么解决的？'))
  }
  if (!dossier.stage) {
    blockingIssues.push(issue('stage', '项目阶段', '缺少项目当前阶段。', '项目当前是已上线、迭代中、已下线，还是其他阶段？'))
  }

  if (filledMetrics.length === 0) {
    warningIssues.push(issue('metrics', '量化结果', '缺少量化结果，生成时必须使用占位符。', '上线后最能证明价值的指标是什么，统计周期是多少？'))
  }
  if (!filledMetrics.some(metric => text(metric.measurement))) {
    warningIssues.push(issue('measurement', '测算口径', '缺少数据测算口径。', '这些数据是怎么统计或对比出来的？'))
  }
  if (!text(dossier.businessFeedback) && !text(dossier.stakeholderRecognition)) {
    warningIssues.push(issue('feedback', '业务反馈', '缺少业务反馈或认可度证据。', '老板、业务方或用户有哪些具体反馈？'))
  }
  if (!text(dossier.keyDecisions)) {
    warningIssues.push(issue('keyDecisions', '关键决策', '缺少关键决策依据。', '项目里哪个方案选择最关键，你当时基于什么判断？'))
  }
  if (!text(dossier.shortTermPlan) && !text(dossier.longTermPlan)) {
    warningIssues.push(issue('roadmap', '优化方向', '缺少后续优化方向。', '如果继续迭代，你会先优化哪个方向？'))
  }
  if (!text(dossier.linkedJdAnalysisId)) {
    warningIssues.push(issue('linkedJdAnalysisId', 'JD 关联', '未关联 JD，岗位适配度会较弱。', '是否要关联当前 JD 分析，让话术更贴近岗位？'))
  }

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
  if (
    value === 'not_started'
    || value === 'in_progress'
    || value === 'launched'
    || value === 'iterating'
    || value === 'offline'
  ) {
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
