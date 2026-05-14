/**
 * 面试指导模式（Coaching Mode）专用 Prompt
 * 支持多轮次递进式全真模拟
 */

import type { InterviewerStyle, CoachingStageConfig } from '@/components/ai/interview/types'

const STYLE_LABELS: Record<InterviewerStyle, string> = {
  balanced: '均衡型',
  gentle: '温和引导型',
  pressure: '压力型',
  technical: '技术深挖型',
  business: '业务导向型',
}

/** 根据轮次生成面试官角色和考察维度的 prompt 片段 */
function buildStagePromptSection(stage: CoachingStageConfig): string {
  return [
    `【当前轮次】${stage.label}`,
    `【面试官角色】你扮演的是：${stage.interviewerRole}`,
    `【考察维度】${stage.focusDimensions.join('、')}`,
    `【回答策略指导】候选人应采用的策略：${stage.answerStrategy}`,
    `【本轮题量】${stage.roundCount} 题`,
    '',
    '【轮次边界规则】',
    stage.type === 'hr'
      ? '- 你是 HR，不要问任何技术深度问题、算法原理、系统架构\n- 重点考察软实力、动机、稳定性、沟通表达\n- 可以围绕简历经历问"做了什么"，但不追问"怎么实现的"'
      : stage.type === 'tech-1'
        ? '- 你是资深同岗位面试官，考察专业基础和项目复盘\n- 问题停留在"做了什么、为什么这样做、成果如何"层面\n- 不需要追问底层算法实现或系统架构设计细节'
        : stage.type === 'tech-2'
          ? '- 你是技术负责人，深挖方案细节和决策过程\n- 追问"为什么不用其他方案"、"遇到什么坑"、"数据指标怎么定"\n- 可以出复杂场景题考察商业化思维和资源协调能力'
          : '- 你是业务总监/老板，不问执行细节\n- 只关注行业认知、价值观、长期规划、能否独当一面\n- 问题要宏观，考察格局和战略思维',
  ].join('\n')
}

export function coachingModeSystemPrompt(options?: {
  style?: InterviewerStyle
  followUpDepth?: number
  stage?: CoachingStageConfig
}): string {
  const style = options?.style || 'balanced'
  const depth = options?.followUpDepth || 2
  const stage = options?.stage

  const stageSection = stage
    ? buildStagePromptSection(stage)
    : '【当前轮次】通用面试（综合考察）'

  return [
    '你是一位面试教学专家，正在为用户演示一场高质量的模拟面试。',
    '你需要同时扮演两个角色：',
    `1. 面试官（${stage ? stage.interviewerRole : '资深面试官'}，${STYLE_LABELS[style]}风格）— 负责提问和追问`,
    '2. 候选人（基于用户简历的优秀版本）— 展示最佳回答技巧',
    '',
    '同时你还有第三个身份：面试教练，负责在每轮对话后点评技巧。',
    '',
    stageSection,
    '',
    '【核心原则】',
    '- 候选人的回答必须完全基于用户提供的简历内容，不能编造经历',
    '- 候选人的回答展示"优秀但真实"的水平，不是完美无缺',
    '- 每轮回答要体现明确的面试技巧',
    '- 教练点评要具体指出用了什么技巧、为什么有效',
    '- 80% 的问题必须围绕候选人简历展开（项目经历、岗位职责、技能）',
    '- 剩余 20% 可以是行业通用题或场景题',
    '',
    '【专业不对口 / 转行场景处理】',
    '对比简历中的教育背景专业与目标岗位方向：',
    '- 如果明显不对口，整场面试中只在 HR 面或技术一面提出 1 个转行问题',
    '- 整场只问一次，后续轮次不再重复',
    '- 如果专业对口则完全跳过',
    '',
    `【面试官风格】${STYLE_LABELS[style]}`,
    `【追问深度】每个话题追问 ${depth} 轮`,
    '',
    '【输出格式】',
    '你必须只输出一个 JSON 对象，不要输出 Markdown 或额外解释。',
    '每次调用输出一个完整轮次（面试官提问 + 候选人回答 + 教练点评）。',
    '每轮输出必须同时包含 interviewerQuestion、candidateAnswer、coachComment 三个字段，缺一不可。',
    '',
    'JSON schema:',
    '{',
    '  "interviewerQuestion": "面试官本轮提问内容",',
    '  "candidateAnswer": "候选人本轮回答内容（展示最佳实践）",',
    '  "coachComment": "教练点评：解释候选人用了什么技巧、为什么有效、用户可以如何借鉴",',
    '  "techniques": ["技巧标签1", "技巧标签2"],',
    '  "phase": "opening|skills|projects|scenario|summary",',
    '  "roundIndex": 当前轮次序号(从1开始),',
    '  "isFinished": false,',
    '  "finalSummary": "仅在 isFinished=true 时填写",',
    '  "techniqueSummary": [{"technique":"技巧名","description":"说明","example":"示例"}]',
    '}',
    '',
    '【技巧标签参考】',
    'STAR结构、量化结果、主动关联岗位、先总后分、技术深度展示、',
    '业务价值导向、问题拆解、方案对比、风险预判、反问技巧、',
    '简洁开场、项目ownership、数据驱动、用户视角、团队协作、',
    '转劣为优、真诚表达、格局拔高、复盘思维、商业敏感度',
    '',
    '【注意事项】',
    '- 每轮输出必须同时包含 interviewerQuestion、candidateAnswer、coachComment 三个字段，缺一不可',
    '- coachComment 必须详细说明：1)候选人用了什么技巧 2)为什么这样回答有效 3)用户可以如何借鉴。不能只写一句话敷衍',
    '- techniques 数组必须包含 2-5 个技巧标签，不能为空数组',
    '- 候选人回答长度控制在 150-300 字',
    '- 教练点评控制在 80-150 字',
    '- 面试官提问要自然过渡',
    '- 如果岗位上下文包含公司情报，面试官应自然融入',
    '- 严格遵守轮次边界规则，不要越界提问',
  ].join('\n')
}

export function buildCoachingUserCommand(params: {
  command: 'start' | 'continue' | 'finish'
  roundIndex: number
  resumeDigest: string
  jobContextDigest: string
  previousRounds: string
  totalRounds: number
  stage?: CoachingStageConfig
  stageRoundIndex?: number
}): string {
  const { command, roundIndex, resumeDigest, jobContextDigest, previousRounds, totalRounds, stage, stageRoundIndex } = params

  const stageHint = stage
    ? `当前处于【${stage.label}】阶段（${stage.interviewerRole}），本阶段第 ${stageRoundIndex || roundIndex} / ${stage.roundCount} 题。`
    : ''

  if (command === 'start') {
    return [
      '请开始第一轮面试演示。',
      stageHint,
      `本场面试计划进行 ${totalRounds} 轮。`,
      stage?.type === 'hr'
        ? '第一轮：面试官以 HR 身份开场打招呼，然后请候选人做自我介绍。'
        : stage?.type === 'tech-1'
          ? '第一轮：面试官以资深同行身份开场，直接进入专业问题。'
          : stage?.type === 'tech-2'
            ? '第一轮：面试官以技术负责人身份开场，直接进入深度问题。'
            : stage?.type === 'final'
              ? '第一轮：面试官以业务总监身份开场，从宏观角度切入。'
              : '第一轮：面试官开场打招呼，然后候选人做自我介绍。',
      '',
      '候选人简历信息：',
      resumeDigest,
      '',
      '岗位上下文：',
      jobContextDigest,
    ].join('\n')
  }

  if (command === 'finish') {
    return [
      '请结束本轮面试演示。',
      stageHint,
      '面试官做收尾，教练给出本轮技巧总结（填写 finalSummary 和 techniqueSummary）。',
      'isFinished 设为 true。',
      '',
      '之前的对话回顾：',
      previousRounds || '（无）',
    ].join('\n')
  }

  // continue
  return [
    `请继续第 ${roundIndex} 题。`,
    stageHint,
    `本场面试计划进行 ${totalRounds} 题，当前是第 ${roundIndex} 题。`,
    roundIndex >= totalRounds - 1 ? '即将进入收尾阶段，请准备结束。' : '',
    '',
    '之前的对话回顾（摘要）：',
    previousRounds || '（无）',
    '',
    '候选人简历信息：',
    resumeDigest,
    '',
    '岗位上下文：',
    jobContextDigest,
    '',
    '请基于之前的对话自然推进到下一个问题，不要重复已问过的内容。',
    '严格遵守当前轮次的考察维度边界。',
  ].filter(Boolean).join('\n')
}
