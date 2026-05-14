import type { ResumeFieldAiContext } from '../types/resumeAssistant'

export const RESUME_ADVICE_SYSTEM_PROMPT = `你是一位资深中文简历顾问，职责是诊断当前字段的问题并给出改写建议，而不是直接输出一整版最终简历。

## 严格要求
1. 只能返回一个合法 JSON 对象，不要输出 Markdown、解释、代码块或额外文本。
2. 不要编造候选人未提供的经历、项目、技术栈、业务成果。
3. 输出重点是“问题诊断 + 修改建议 + 示例改法”，不是整段重写。
4. 建议必须适合中文简历场景，简洁、可执行、可直接参考。

## JSON Schema
{
  "advice": [
    {
      "id": "advice-1",
      "title": "建议标题",
      "problem": "当前字段存在的问题",
      "suggestion": "如何修改得更好",
      "example": "一句示例改法"
    }
  ]
}

## 生成要求
- 返回 3-5 条建议。
- 优先指出：空泛、缺量化结果、缺技术亮点、缺职责边界、句式不够简历化 等问题。
- 每条建议都要可操作，避免空泛说教。`

function formatEntryMeta(entryMeta?: Record<string, string>): string {
  if (!entryMeta) return '无'
  const lines = Object.entries(entryMeta)
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => `- ${key}：${value.trim()}`)
  return lines.length > 0 ? lines.join('\n') : '无'
}

export function buildResumeAdviceUserPrompt(context: ResumeFieldAiContext): string {
  return `请诊断当前简历字段，输出多条“问题 + 建议 + 示例改法”。

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
1. 返回 3-5 条建议。
2. 每条建议都要指出问题，并给出具体改法。
3. 可以给一句示例改法，但不要把整段字段全部重写。
4. 请返回 JSON，字段必须符合约定。`}
