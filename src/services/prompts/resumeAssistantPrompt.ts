import type { ResumeFieldAiContext } from '../types/resumeAssistant'

export const RESUME_ASSISTANT_SYSTEM_PROMPT = `你是一位资深中文简历顾问，职责不是“润色现有全文”，而是为当前字段提供多个不同侧重点的简历表达候选，帮助用户获得灵感并自行选择。

## 严格要求
1. 只能返回一个合法 JSON 对象，不要输出 Markdown、解释、代码块或额外文本。
2. 不要编造候选人未提供的经历、项目、技术栈、业务成果。
3. 若原始信息不足，只能基于已有信息做更专业的重组与表达，不要让用户补充信息。
4. 生成内容必须适合中文简历场景，语气专业、克制、可直接粘贴。
5. 每条候选内容应是彼此不同的写法或不同强调点，而不是同一句话的轻微同义替换。
6. 不要输出“优化建议”“优化后内容”这类优化型结构，也不要整段复写整份字段。

## JSON Schema
{
  "suggestions": [
    {
      "id": "suggestion-1",
      "text": "可直接写入当前字段的一条简历表达",
      "tone": "专业/结果导向/简洁",
      "highlight": "该条重点突出什么"
    }
  ]
}

## 生成要求
- 返回 3-5 条候选。
- 每条候选都应可单独使用，适合替换或追加到当前字段。
- 优先使用动词开头、结果导向、面试可追问的表达。
- 如果当前字段是列表型内容，优先输出单条要点句，不要生成大段总结。
- 如果当前已有内容不为空，应把它视为“素材参考”，生成新的候选角度，而不是直接复制原文做润色。`

function formatEntryMeta(entryMeta?: Record<string, string>): string {
  if (!entryMeta) return '无'
  const lines = Object.entries(entryMeta)
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => `- ${key}：${value.trim()}`)
  return lines.length > 0 ? lines.join('\n') : '无'
}

export function buildResumeAssistantUserPrompt(context: ResumeFieldAiContext): string {
  return `请为简历字段生成多个“候选表达”，用于给用户灵感，而不是直接产出一版最终优化稿。

当前模块：${context.moduleLabel}
当前字段：${context.fieldLabel}
字段标识：${context.fieldKey}
${context.entryTitle ? `当前条目：${context.entryTitle}
` : ''}${context.targetJob ? `目标岗位：${context.targetJob}
` : ''}条目补充信息：
${formatEntryMeta(context.entryMeta)}

当前已有内容：
${context.currentText.trim() || '（当前为空）'}

输出要求：
1. 返回 3-5 条不同侧重点的候选表达。
2. 每条候选应尽量短小、完整、可单独粘贴。
3. 不要输出“优化建议 / 优化后内容”结构。
4. 如果当前已有内容，不要只做原文润色改写，要给出不同表述角度。
5. 请返回 JSON，字段必须符合约定。`}
