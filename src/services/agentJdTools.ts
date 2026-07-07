import {
  confirmAgentToolInvocation,
  createAgentToolInvocation,
  registerAgentTool,
  type AgentToolInvocation,
} from '@/services/agentToolRuntime'
import {
  buildJdMatchSummary,
  formatJdMatchSummaryForAgent,
  type JdMatchSummary,
} from '@/services/agentJdMatchSummary'

const JD_MATCH_SUMMARY_TOOL_ID = 'jd.build_match_summary'

export interface JdMatchSummaryToolArgs {
  analysisId?: string
}

let registered = false

export function registerJdAgentTools() {
  if (registered) return
  registered = true

  registerAgentTool<JdMatchSummaryToolArgs, JdMatchSummary>({
    id: JD_MATCH_SUMMARY_TOOL_ID,
    label: '生成 JD 匹配摘要',
    description: '读取当前 JD 匹配结果，返回命中关键词、缺失关键词、事实缺口、Top gaps 和已确认改动。',
    effect: 'read',
    confirmationPolicy: 'none',
    execute: () => {
      const summary = buildJdMatchSummary()
      if (!summary) return { ok: false, reason: '当前没有可用的 JD 匹配结果。' }
      return {
        ok: true,
        data: summary,
        message: formatJdMatchSummaryForAgent(summary),
      }
    },
  })
}

export function createJdMatchSummaryInvocation(): AgentToolInvocation<JdMatchSummaryToolArgs> {
  registerJdAgentTools()
  return createAgentToolInvocation<JdMatchSummaryToolArgs>(JD_MATCH_SUMMARY_TOOL_ID, {})
}

export async function runJdMatchSummaryTool() {
  const invocation = createJdMatchSummaryInvocation()
  return confirmAgentToolInvocation<JdMatchSummaryToolArgs, JdMatchSummary>(invocation)
}
