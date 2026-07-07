import { mirrorToolEventToSession } from '@/services/agentSessionEvents'

export type AgentToolEffect = 'read' | 'write'
export type AgentToolConfirmationPolicy = 'none' | 'preview_required'
export type AgentToolInvocationStatus = 'ready' | 'pending_confirmation' | 'confirmed' | 'rejected' | 'failed'
export type AgentToolEventType =
  | 'tool.preview_created'
  | 'tool.confirmed'
  | 'tool.rejected'
  | 'tool.failed'

export interface AgentToolPreviewChange {
  id: string
  label: string
  beforeText?: string
  afterText?: string
  description?: string
}

export interface AgentToolPreview {
  title: string
  summary: string
  changes: AgentToolPreviewChange[]
  risk?: string
}

export type AgentToolExecutionResult<TResult = unknown> =
  | { ok: true; data?: TResult; message?: string }
  | { ok: false; reason: string }

export interface AgentTool<TArgs = unknown, TResult = unknown> {
  id: string
  label: string
  description: string
  effect: AgentToolEffect
  confirmationPolicy: AgentToolConfirmationPolicy
  createPreview?: (args: TArgs) => AgentToolPreview | null
  execute: (args: TArgs) => AgentToolExecutionResult<TResult> | Promise<AgentToolExecutionResult<TResult>>
}

export interface AgentToolInvocation<TArgs = unknown> {
  id: string
  toolId: string
  toolLabel: string
  effect: AgentToolEffect
  confirmationPolicy: AgentToolConfirmationPolicy
  status: AgentToolInvocationStatus
  args: TArgs
  preview: AgentToolPreview | null
  createdAt: string
  confirmedAt?: string
  rejectedAt?: string
  failedAt?: string
  message?: string
  errorReason?: string
}

export interface AgentToolEvent {
  id: string
  invocationId: string
  toolId: string
  type: AgentToolEventType
  createdAt: string
  title: string
  summary?: string
  reason?: string
}

const tools = new Map<string, AgentTool<unknown, unknown>>()

function createRuntimeId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return `${prefix}_${randomId}`
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// ponytail: 原把 tool event 持久化到 localStorage，但 load/clear 零外部调用（write-only）。
// 事件已由 mirrorToolEventToSession 转写到 session events 供消费，存储已删。
function appendToolEvent(event: AgentToolEvent) {
  mirrorToolEventToSession(event)
}

function createToolEvent(input: Omit<AgentToolEvent, 'id' | 'createdAt'>): AgentToolEvent {
  return {
    id: createRuntimeId('tool_event'),
    createdAt: new Date().toISOString(),
    ...input,
  }
}

function getRequiredTool<TArgs, TResult>(toolId: string): AgentTool<TArgs, TResult> {
  const tool = tools.get(toolId)
  if (!tool) throw new Error(`Agent 工具未注册：${toolId}`)
  return tool as AgentTool<TArgs, TResult>
}

export function registerAgentTool<TArgs, TResult>(tool: AgentTool<TArgs, TResult>) {
  tools.set(tool.id, tool as AgentTool<unknown, unknown>)
}

export function createAgentToolInvocation<TArgs, TResult = unknown>(
  toolId: string,
  args: TArgs,
): AgentToolInvocation<TArgs> {
  const tool = getRequiredTool<TArgs, TResult>(toolId)
  const preview = tool.createPreview?.(args) ?? null

  if (tool.effect === 'write' && tool.confirmationPolicy === 'preview_required' && !preview) {
    throw new Error(`工具「${tool.label}」需要预览 diff，但没有生成可确认预览。`)
  }

  const invocation: AgentToolInvocation<TArgs> = {
    id: createRuntimeId('tool_call'),
    toolId: tool.id,
    toolLabel: tool.label,
    effect: tool.effect,
    confirmationPolicy: tool.confirmationPolicy,
    status: tool.confirmationPolicy === 'preview_required' ? 'pending_confirmation' : 'ready',
    args,
    preview,
    createdAt: new Date().toISOString(),
  }

  if (preview) {
    appendToolEvent(createToolEvent({
      invocationId: invocation.id,
      toolId: invocation.toolId,
      type: 'tool.preview_created',
      title: preview.title,
      summary: preview.summary,
    }))
  }

  return invocation
}

export async function confirmAgentToolInvocation<TArgs, TResult = unknown>(
  invocation: AgentToolInvocation<TArgs>,
): Promise<AgentToolExecutionResult<TResult>> {
  const tool = getRequiredTool<TArgs, TResult>(invocation.toolId)
  if (invocation.status === 'rejected') {
    return { ok: false, reason: '工具调用已被拒绝。' }
  }

  const result = await tool.execute(invocation.args)
  if (result.ok) {
    invocation.status = 'confirmed'
    invocation.confirmedAt = new Date().toISOString()
    invocation.message = result.message
    appendToolEvent(createToolEvent({
      invocationId: invocation.id,
      toolId: invocation.toolId,
      type: 'tool.confirmed',
      title: invocation.toolLabel,
      summary: result.message,
    }))
    return result
  }

  invocation.status = 'failed'
  invocation.failedAt = new Date().toISOString()
  invocation.errorReason = result.reason
  appendToolEvent(createToolEvent({
    invocationId: invocation.id,
    toolId: invocation.toolId,
    type: 'tool.failed',
    title: invocation.toolLabel,
    reason: result.reason,
  }))
  return result
}

export function rejectAgentToolInvocation<TArgs>(
  invocation: AgentToolInvocation<TArgs>,
  reason = '用户拒绝该工具调用。',
) {
  invocation.status = 'rejected'
  invocation.rejectedAt = new Date().toISOString()
  invocation.errorReason = reason
  appendToolEvent(createToolEvent({
    invocationId: invocation.id,
    toolId: invocation.toolId,
    type: 'tool.rejected',
    title: invocation.toolLabel,
    reason,
  }))
}
