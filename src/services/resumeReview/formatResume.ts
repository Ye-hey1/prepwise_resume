import { stripHtml, safeJsonStringify } from '@/services/stream'
import type { CompletedJdReviewContext } from './types'

export interface ResumeReviewSourceData {
  basicInfo: Record<string, string>
  educationList: Array<Record<string, unknown>>
  skills: string
  workList: Array<Record<string, unknown>>
  projectList: Array<Record<string, unknown>>
  awardList: Array<Record<string, unknown>>
  selfIntro: string
}

type FieldSpec = {
  key: string
  label: string
  rich?: boolean
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function richText(value: unknown): string {
  return stripHtml(text(value)).trim()
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.map((value) => text(value)).filter(Boolean)
}

function labeled(label: string, value: unknown, rich = false): string {
  const content = rich ? richText(value) : text(value)
  return content ? `${label}：${content}` : ''
}

function section(title: string, body: string | string[]): string {
  const lines = Array.isArray(body) ? body.filter(Boolean) : [body].filter(Boolean)
  return lines.length ? `## ${title}\n${lines.join('\n')}` : ''
}

function dateRange(start: unknown, end: unknown): string {
  const dates = compact([text(start), text(end)])
  return dates.join('-')
}

function heading(values: Array<unknown>, range?: string): string {
  return compact([...values.map(text), range]).join(' | ')
}

function hasRecordContent(record: Record<string, unknown>, specs: FieldSpec[]): boolean {
  return specs.some(({ key, rich }) => {
    const value = rich ? richText(record[key]) : text(record[key])
    return Boolean(value)
  })
}

function formatBasicInfo(data: ResumeReviewSourceData): string {
  const basicInfo = data.basicInfo ?? {}
  const lines = [
    labeled('姓名', basicInfo.name),
    labeled('目标岗位', basicInfo.jobTitle),
    labeled('最高学历', basicInfo.educationLevel),
    labeled('工作年限', basicInfo.workYears),
    labeled('所在地', basicInfo.location),
    labeled('个人网站', basicInfo.website),
    labeled('GitHub', basicInfo.github),
    labeled('博客', basicInfo.blog),
  ].filter(Boolean)

  return section('基本信息', lines)
}

const educationFields: FieldSpec[] = [
  { key: 'school', label: '学校' },
  { key: 'college', label: '学院' },
  { key: 'major', label: '专业' },
  { key: 'degree', label: '学历' },
  { key: 'gpa', label: 'GPA' },
  { key: 'type', label: '类型' },
  { key: 'location', label: '地点' },
  { key: 'description', label: '补充说明', rich: true },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
]

function formatEducation(data: ResumeReviewSourceData): string {
  const entries = data.educationList
    .filter((edu) => hasRecordContent(edu, educationFields))
    .map((edu) => {
      const title = heading([edu.school, edu.college, edu.major], dateRange(edu.startDate, edu.endDate))
      const details = [
        labeled('学历', edu.degree),
        labeled('GPA', edu.gpa),
        labeled('类型', edu.type),
        labeled('地点', edu.location),
        labeled('补充说明', edu.description, true),
      ].filter(Boolean)
      return compact([title ? `### ${title}` : '', ...details]).join('\n')
    })
    .filter(Boolean)

  return section('教育经历', entries)
}

const workFields: FieldSpec[] = [
  { key: 'company', label: '公司' },
  { key: 'department', label: '部门' },
  { key: 'position', label: '岗位' },
  { key: 'location', label: '地点' },
  { key: 'description', label: '工作内容', rich: true },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
]

function formatWork(data: ResumeReviewSourceData): string {
  const entries = data.workList
    .filter((work) => hasRecordContent(work, workFields))
    .map((work) => {
      const title = heading([work.company, work.position, work.department], dateRange(work.startDate, work.endDate))
      const details = [
        labeled('地点', work.location),
        richText(work.description),
      ].filter(Boolean)
      return compact([title ? `### ${title}` : '', ...details]).join('\n')
    })
    .filter(Boolean)

  return section('工作经历', entries)
}

const projectFields: FieldSpec[] = [
  { key: 'name', label: '项目' },
  { key: 'role', label: '角色' },
  { key: 'link', label: '项目链接' },
  { key: 'introduction', label: '项目介绍', rich: true },
  { key: 'mainWork', label: '主要工作', rich: true },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
]

function formatProjects(data: ResumeReviewSourceData): string {
  const entries = data.projectList
    .filter((project) => hasRecordContent(project, projectFields))
    .map((project) => {
      const title = heading([project.name, project.role], dateRange(project.startDate, project.endDate))
      const details = [
        labeled('项目链接', project.link),
        labeled('项目介绍', project.introduction, true),
        labeled('主要工作', project.mainWork, true),
      ].filter(Boolean)
      return compact([title ? `### ${title}` : '', ...details]).join('\n')
    })
    .filter(Boolean)

  return section('项目经历', entries)
}

const awardFields: FieldSpec[] = [
  { key: 'name', label: '奖项' },
  { key: 'date', label: '时间' },
  { key: 'description', label: '说明', rich: true },
]

function formatAwards(data: ResumeReviewSourceData): string {
  const entries = data.awardList
    .filter((award) => hasRecordContent(award, awardFields))
    .map((award) => {
      const main = heading([award.name], text(award.date))
      const description = richText(award.description)
      return compact([main ? `- ${main}` : '', description ? `  ${description}` : '']).join('\n')
    })
    .filter(Boolean)

  return section('获奖经历', entries)
}

export function formatResumeForReview(data: ResumeReviewSourceData): string {
  return [
    formatBasicInfo(data),
    formatEducation(data),
    section('专业技能', richText(data.skills)),
    formatWork(data),
    formatProjects(data),
    formatAwards(data),
    section('自我评价', richText(data.selfIntro)),
  ].filter(Boolean).join('\n\n')
}

export function hasEnoughResumeContent(data: ResumeReviewSourceData): boolean {
  const hasBasicTarget = Boolean(text(data.basicInfo?.name) || text(data.basicInfo?.jobTitle))
  const hasSkills = Boolean(richText(data.skills))
  const hasWork = data.workList.some((work) => hasRecordContent(work, workFields))
  const hasProject = data.projectList.some((project) => hasRecordContent(project, projectFields))

  return hasBasicTarget && (hasSkills || hasWork || hasProject)
}

export function formatCompletedJdContext(context: CompletedJdReviewContext | null): string {
  if (!context) return ''

  return [
    section('JD 上下文', [
      labeled('公司', context.company),
      labeled('岗位', context.position),
      'JD 结构化数据：',
      safeJsonStringify(context.jdData),
      'JD 匹配结果：',
      safeJsonStringify(context.matchResult),
    ]),
  ].filter(Boolean).join('\n\n')
}
