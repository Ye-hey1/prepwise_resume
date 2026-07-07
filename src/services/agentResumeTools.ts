import {
  createAgentToolInvocation,
  registerAgentTool,
  type AgentToolInvocation,
  type AgentToolPreview,
} from '@/services/agentToolRuntime'
import {
  applyResumeChangeProposal,
  rejectResumeChangeProposal,
  revertResumeChangeProposal,
  type ResumeChangeProposal,
  type ResumeProposalApplyResult,
} from '@/services/agentResumeProposals'

const APPLY_RESUME_PROPOSAL_TOOL_ID = 'resume.apply_change_proposal'
const REJECT_RESUME_PROPOSAL_TOOL_ID = 'resume.reject_change_proposal'
const REVERT_RESUME_PROPOSAL_TOOL_ID = 'resume.revert_change_proposal'

export interface ResumeProposalToolArgs {
  proposal: ResumeChangeProposal
}

function proposalPreview(proposal: ResumeChangeProposal, mode: 'apply' | 'revert'): AgentToolPreview {
  const isApply = mode === 'apply'
  return {
    title: isApply ? `应用「${proposal.moduleLabel}」改动` : `撤回「${proposal.moduleLabel}」改动`,
    summary: `${proposal.fieldLabel}：${isApply ? '当前内容将替换为建议内容' : '建议内容将恢复为应用前内容'}`,
    risk: isApply
      ? proposal.risk
      : '仅当字段仍保持已应用后的内容时才允许撤回，避免覆盖后续手动编辑。',
    changes: [{
      id: proposal.id,
      label: proposal.fieldLabel,
      beforeText: isApply ? proposal.beforeText : proposal.afterText,
      afterText: isApply ? proposal.afterText : proposal.beforeText,
      description: proposal.reason,
    }],
  }
}

function proposalToolResult(result: ResumeProposalApplyResult, successMessage: string) {
  if (!result.ok) return result
  return { ok: true as const, message: successMessage }
}

let registered = false

export function registerResumeAgentTools() {
  if (registered) return
  registered = true

  registerAgentTool<ResumeProposalToolArgs, void>({
    id: APPLY_RESUME_PROPOSAL_TOOL_ID,
    label: '应用简历改动提案',
    description: '将用户确认后的简历字段 before/after 提案写入 resume store。',
    effect: 'write',
    confirmationPolicy: 'preview_required',
    createPreview: ({ proposal }) => proposalPreview(proposal, 'apply'),
    execute: ({ proposal }) => proposalToolResult(
      applyResumeChangeProposal(proposal),
      `已应用至「${proposal.moduleLabel}」。`,
    ),
  })

  registerAgentTool<ResumeProposalToolArgs, void>({
    id: REJECT_RESUME_PROPOSAL_TOOL_ID,
    label: '拒绝简历改动提案',
    description: '将待确认简历改动提案标记为 rejected，不写入简历内容。',
    effect: 'write',
    confirmationPolicy: 'none',
    execute: ({ proposal }) => {
      rejectResumeChangeProposal(proposal)
      return { ok: true, message: '已拒绝该改动提案。' }
    },
  })

  registerAgentTool<ResumeProposalToolArgs, void>({
    id: REVERT_RESUME_PROPOSAL_TOOL_ID,
    label: '撤回已应用简历改动',
    description: '把已应用提案恢复为 beforeText，且必须通过当前字段一致性检查。',
    effect: 'write',
    confirmationPolicy: 'preview_required',
    createPreview: ({ proposal }) => proposalPreview(proposal, 'revert'),
    execute: ({ proposal }) => proposalToolResult(
      revertResumeChangeProposal(proposal),
      `已撤回「${proposal.moduleLabel}」改动。`,
    ),
  })
}

export function createApplyResumeProposalInvocation(
  proposal: ResumeChangeProposal,
): AgentToolInvocation<ResumeProposalToolArgs> {
  registerResumeAgentTools()
  return createAgentToolInvocation<ResumeProposalToolArgs>(APPLY_RESUME_PROPOSAL_TOOL_ID, { proposal })
}

export function createRejectResumeProposalInvocation(
  proposal: ResumeChangeProposal,
): AgentToolInvocation<ResumeProposalToolArgs> {
  registerResumeAgentTools()
  return createAgentToolInvocation<ResumeProposalToolArgs>(REJECT_RESUME_PROPOSAL_TOOL_ID, { proposal })
}

export function createRevertResumeProposalInvocation(
  proposal: ResumeChangeProposal,
): AgentToolInvocation<ResumeProposalToolArgs> {
  registerResumeAgentTools()
  return createAgentToolInvocation<ResumeProposalToolArgs>(REVERT_RESUME_PROPOSAL_TOOL_ID, { proposal })
}
