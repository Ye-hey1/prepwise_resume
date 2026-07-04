import type { ResumeFieldAiContext } from '../types/resumeAssistant'

export const RESUME_APPLY_SYSTEM_PROMPT = `你是一位资深中文简历编辑助手，职责是分析简历内容并生成可直接应用的逐条修改建议。

## 核心要求
1. 只返回合法 JSON 对象，不输出 Markdown、代码块或额外文本。
2. 每条建议必须是具体的、可操作的文本替换，不要给出笼统建议。
3. 只修改真正需要优化的内容，不要过度修改。
4. 保留原文的语气和核心信息，仅优化表达方式和格式。

## JSON Schema
{
  "applyItems": [
    {
      "id": "apply-1",
      "original": "原文片段（必须与当前内容精确匹配）",
      "suggested": "优化后的内容",
      "reason": "为什么这样修改",
      "category": "grammar|content|structure|formatting",
      "severity": "low|medium|high"
    }
  ]
}

## 分类说明
- grammar: 语法、标点、错别字
- content: 内容表达、用词、专业性
- structure: 结构、逻辑顺序
- formatting: 格式、排版

## 优先级说明
- high: 严重影响专业度或可读性的问题
- medium: 明显可优化的表达
- low: 润色性建议

## 生成策略
1. 优先处理：空泛表达、缺乏量化结果、语法错误、格式不规范
2. 每条 original 必须在原文中精确匹配，不要模糊匹配
3. 建议数量控制在 3-8 条，聚焦最重要的问题
4. suggested 要简洁有力，符合中文简历规范`

export function buildResumeApplyUserPrompt(context: ResumeFieldAiContext): string {
  return `请分析当前简历字段，生成可直接应用的修改建议。

模块：${context.moduleLabel}
字段：${context.fieldLabel}
${context.entryTitle ? `条目：${context.entryTitle}` : ''}
${context.targetJob ? `目标岗位：${context.targetJob}` : ''}

当前内容：
${context.currentText.trim() || '（当前为空）'}

要求：
1. 每条建议的 original 必须精确匹配原文中的片段
2. suggested 要保持简洁，符合中文简历规范
3. 按重要程度排序，高优先级的问题优先
4. 返回符合 Schema 的 JSON`
}
