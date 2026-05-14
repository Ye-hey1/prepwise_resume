/**
 * 智能排版 — AI 内容精简 Prompt
 *
 * 目标：在不丢失关键信息的前提下，精简简历各字段的文字量，
 * 同时保持原始 HTML 格式（不增加额外的列表/换行/结构）。
 */

export interface SmartLayoutField {
  key: string
  label: string
  /** 原始 HTML 内容 */
  html: string
  /** 从 HTML 提取的纯文本（供 AI 理解语义） */
  text: string
}

export function buildSmartLayoutPrompt(
  fields: SmartLayoutField[],
  targetJob?: string,
): { system: string; user: string } {
  const system = `你是一位资深简历优化专家。你的任务是精简简历内容，减少文字量，使简历能在一页内完整呈现。

## 核心规则

1. **保持原始 HTML 格式**：不要增加新的列表、换行或结构。如果原文是 <ul><li> 列表，保持列表格式；如果原文是段落，保持段落格式
2. **只精简文字**：删除虚词、重复表述、空洞形容词，缩短每个句子
3. **合并相似条目**：将语义相近的多个条目合并为一个更紧凑的条目
4. **加粗关键信息**：用 <strong> 标记技术栈名称、量化指标、核心成果
5. **保留所有关键数据**：数字、百分比、技术名称、项目名称必须完整保留
6. **目标缩减量**：文字量缩减 30-50%
7. **如果某个字段已经足够精简，直接返回原文即可**

## 绝对禁止

- 不要将段落文本改为列表
- 不要将列表改为段落
- 不要增加额外的换行或空行
- 不要改变原有的 HTML 标签结构（只改文字内容）
- 不要捏造不存在的信息

## 输出格式

返回 JSON 对象，每个 key 对应精简后的 HTML 内容：
\`\`\`json
{
  "field_key_1": "<p>精简后的HTML内容</p>",
  "field_key_2": "<ul><li>精简后的条目</li></ul>"
}
\`\`\``

  const jobContext = targetJob ? `\n目标岗位：${targetJob}` : ''

  const fieldsText = fields
    .filter((f) => f.text.trim())
    .map((f) => {
      const preview = f.text.length > 500 ? f.text.slice(0, 500) + '...' : f.text
      return `### ${f.key}（${f.label}）
原始文本：${preview}
原始HTML：${f.html}`
    })
    .join('\n\n')

  const user = `请精简以下简历字段的内容，目标缩减 30-50% 文字量。${jobContext}

${fieldsText}

返回 JSON，每个 key 对应精简后的 HTML 内容。保持原始标签结构不变，只精简文字。`

  return { system, user }
}
