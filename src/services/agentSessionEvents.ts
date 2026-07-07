import type { AgentToolEvent } from '@/services/agentToolRuntime'

export type AgentSessionEventType =
  | 'agent.decision'
  | 'text.delta'
  | 'text.done'
  | 'tool.preview_created'
  | 'tool.confirmed'
  | 'tool.rejected'
  | 'tool.failed'
  | 'session.completed'

export interface AgentSessionEvent {
  id: string
  cursor: number
  sessionId: string
  type: AgentSessionEventType
  createdAt: string
  payload: Record<string, unknown>
}

export interface AgentReplayResult {
  events: AgentSessionEvent[]
  nextCursor: number
}

const SESSION_EVENT_STORAGE_KEY = 'prepwise-agent-session-events'
const SESSION_ID_STORAGE_KEY = 'prepwise-agent-session-id'
const MAX_STORED_SESSION_EVENTS = 240

function createSessionId(): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return `agent_session_${randomId}`
  return `agent_session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function createEventId(cursor: number): string {
  return `agent_event_${cursor}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeCursor(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function normalizeStoredEvent(raw: unknown): AgentSessionEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<AgentSessionEvent>
  if (!item.id || !item.type || !item.sessionId || !item.createdAt) return null

  return {
    id: String(item.id),
    cursor: normalizeCursor(item.cursor),
    sessionId: String(item.sessionId),
    type: item.type,
    createdAt: String(item.createdAt),
    payload: item.payload && typeof item.payload === 'object'
      ? item.payload as Record<string, unknown>
      : {},
  }
}

function readStoredEvents(): AgentSessionEvent[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem(SESSION_EVENT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeStoredEvent(item))
      .filter((item): item is AgentSessionEvent => Boolean(item))
      .sort((a, b) => a.cursor - b.cursor)
  } catch {
    return []
  }
}

function writeStoredEvents(events: AgentSessionEvent[]) {
  if (typeof localStorage === 'undefined') return
  const nextEvents = events
    .sort((a, b) => a.cursor - b.cursor)
    .slice(-MAX_STORED_SESSION_EVENTS)
  localStorage.setItem(SESSION_EVENT_STORAGE_KEY, JSON.stringify(nextEvents))
}

export function getAgentSessionId(): string {
  if (typeof localStorage === 'undefined') return 'agent_session_memory'
  const existing = localStorage.getItem(SESSION_ID_STORAGE_KEY)
  if (existing) return existing
  const nextId = createSessionId()
  localStorage.setItem(SESSION_ID_STORAGE_KEY, nextId)
  return nextId
}

export function appendAgentSessionEvent(
  type: AgentSessionEventType,
  payload: Record<string, unknown>,
  sessionId = getAgentSessionId(),
): AgentSessionEvent {
  const events = readStoredEvents()
  const lastCursor = events.reduce((max, event) => Math.max(max, event.cursor), 0)
  const cursor = lastCursor + 1
  const event: AgentSessionEvent = {
    id: createEventId(cursor),
    cursor,
    sessionId,
    type,
    createdAt: new Date().toISOString(),
    payload,
  }
  writeStoredEvents([...events, event])
  return event
}

export function loadAgentSessionEvents(): AgentSessionEvent[] {
  return readStoredEvents()
}

export function replayAgentSessionEventsAfter(cursor = 0): AgentReplayResult {
  const normalizedCursor = normalizeCursor(cursor)
  const events = readStoredEvents().filter((event) => event.cursor > normalizedCursor)
  const nextCursor = events.reduce((max, event) => Math.max(max, event.cursor), normalizedCursor)
  return { events, nextCursor }
}

export function getAgentSessionCursor(): number {
  return readStoredEvents().reduce((max, event) => Math.max(max, event.cursor), 0)
}

export function clearAgentSessionEvents() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(SESSION_EVENT_STORAGE_KEY)
}

export function mirrorToolEventToSession(event: AgentToolEvent): AgentSessionEvent {
  return appendAgentSessionEvent(event.type, {
    toolEventId: event.id,
    invocationId: event.invocationId,
    toolId: event.toolId,
    title: event.title,
    summary: event.summary,
    reason: event.reason,
  })
}
