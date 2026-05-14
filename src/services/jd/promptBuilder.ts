/**
 * JD 分析 Prompt 构建工具
 * 封装模板变量替换和消息构建为纯函数
 */

/** 构建聊天消息数组 */
export function buildMessages(
  systemPrompt: string,
  userTemplate: string,
  variables: Record<string, string>,
): Array<{ role: 'system' | 'user'; content: string }> {
  let userMessage = userTemplate
  for (const [key, value] of Object.entries(variables)) {
    userMessage = userMessage.replace(`{${key}}`, value)
  }
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]
}

/** 将 JDData 的 requirements 部分格式化为文本 */
export function formatJDRequirements(jdData: import('../types/jd').JDData): string {
  const r = jdData.requirements
  const parts: string[] = []

  if (jdData.basicInfo.jobTitle) parts.push(`岗位：${jdData.basicInfo.jobTitle}`)
  if (jdData.basicInfo.company) parts.push(`公司：${jdData.basicInfo.company}`)

  if (r.degree) parts.push(`学历要求：${r.degree}`)
  if (r.experience) parts.push(`经验要求：${r.experience}`)
  const weightLabel: Record<string, string> = { required: '必须', preferred: '期望', bonus: '加分' }
  if (r.techStack.length) parts.push(`技术栈：${r.techStack.join('、')}`)
  if (r.mustHave.length) {
    const lines = r.mustHave.map((item) => {
      const label = weightLabel[item.weight] ?? '期望'
      return `- [${label}] ${item.text}`
    })
    parts.push(`必须具备：\n${lines.join('\n')}`)
  }
  if (r.niceToHave.length) {
    const lines = r.niceToHave.map((item) => {
      const label = weightLabel[item.weight] ?? '加分'
      return `- [${label}] ${item.text}`
    })
    parts.push(`加分项：\n${lines.join('\n')}`)
  }
  if (r.jobDuties.length) parts.push(`工作职责：\n${r.jobDuties.map(s => '- ' + s).join('\n')}`)

  return parts.join('\n\n')
}
