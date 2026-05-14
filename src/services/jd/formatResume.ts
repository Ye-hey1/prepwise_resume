/**
 * 简历数据格式化为 AI 可读文本
 * 纯函数，无外部依赖
 */
import { stripHtml } from '../stream'

/** 将 resume store 数据格式化为 AI 可读文本 */
export function formatResumeForAI(data: {
  basicInfo: Record<string, string>
  educationList: Array<Record<string, string>>
  skills: string
  workList: Array<Record<string, string>>
  projectList: Array<Record<string, string>>
  awardList: Array<Record<string, string>>
  selfIntro: string
}): string {
  const parts: string[] = []

  if (data.basicInfo?.name) {
    parts.push(`## 基本信息
姓名：${data.basicInfo.name}
电话：${data.basicInfo.phone || ''}
邮箱：${data.basicInfo.email || ''}
年龄：${data.basicInfo.age || ''}
性别：${data.basicInfo.gender || ''}
所在地：${data.basicInfo.location || ''}
目标岗位：${data.basicInfo.jobTitle || ''}
最高学历：${data.basicInfo.educationLevel || ''}
工作年限：${data.basicInfo.workYears || ''}
求职状态：${data.basicInfo.currentStatus || ''}
期望城市：${data.basicInfo.expectedLocation || ''}
期望薪资：${data.basicInfo.expectedSalary || ''}`)
  }

  if (data.educationList?.length) {
    parts.push('## 教育经历')
    for (const edu of data.educationList) {
      parts.push(`- ${edu.school || ''} ${edu.college || ''} ${edu.major || ''} | ${edu.degree || ''} | ${edu.startDate || ''}-${edu.endDate || ''}${edu.gpa ? ' | GPA: ' + edu.gpa : ''}${edu.description ? '\n  ' + stripHtml(edu.description) : ''}`)
    }
  }

  if (data.skills) {
    parts.push(`## 专业技能\n${stripHtml(data.skills)}`)
  }

  if (data.workList?.length) {
    parts.push('## 工作经历')
    for (const work of data.workList) {
      parts.push(`### ${work.company || ''} | ${work.position || ''} | ${work.department || ''} | ${work.startDate || ''}-${work.endDate || ''}${work.description ? '\n' + stripHtml(work.description) : ''}`)
    }
  }

  if (data.projectList?.length) {
    parts.push('## 项目经历')
    for (const proj of data.projectList) {
      parts.push(`### ${proj.name || ''} | ${proj.role || ''} | ${proj.startDate || ''}-${proj.endDate || ''}${proj.introduction ? '\n' + stripHtml(proj.introduction) : ''}${proj.mainWork ? '\n' + stripHtml(proj.mainWork) : ''}`)
    }
  }

  if (data.awardList?.length) {
    parts.push('## 获奖经历')
    for (const award of data.awardList) {
      parts.push(`- ${award.name || ''} | ${award.date || ''}${award.description ? ' | ' + stripHtml(award.description) : ''}`)
    }
  }

  if (data.selfIntro) {
    parts.push(`## 自我评价\n${stripHtml(data.selfIntro)}`)
  }

  return parts.join('\n\n')
}
