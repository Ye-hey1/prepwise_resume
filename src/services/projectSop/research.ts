import type { ResolvedSearchProviderConfig } from '@/stores/aiConfig'
import type { ProjectEntry } from '@/stores/resume'
import { searchAcrossProviders, type SearchResultItem } from '@/services/searchService'
import { stripHtml } from '@/services/stream'
import type { ProjectSopResearchBrief, ProjectSopResearchSource } from './types'

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function extractProjectKeywords(project: ProjectEntry, jdContextText: string): string[] {
  const text = [
    project.name,
    project.role,
    stripHtml(project.introduction),
    stripHtml(project.mainWork),
    jdContextText,
  ].join(' ')

  const explicit = text.match(/[A-Za-z][A-Za-z0-9+#./-]{1,}|[\u4e00-\u9fa5]{2,12}/g) ?? []
  const stopWords = new Set([
    '项目名称',
    '项目介绍',
    '主要工作',
    '负责',
    '进行',
    '实现',
    '通过',
    '基于',
    '目标岗位',
    '匹配优势',
    '匹配缺口',
    '当前',
    '相关',
  ])

  return Array.from(new Set(
    explicit
      .map(item => item.trim())
      .filter(item => item.length >= 2 && !stopWords.has(item)),
  )).slice(0, 10)
}

function buildQueries(project: ProjectEntry, jdContextText: string): string[] {
  const currentYear = new Date().getFullYear()
  const keywords = extractProjectKeywords(project, jdContextText)
  const coreTerms = keywords.slice(0, 5).join(' ')
  const projectName = normalizeWhitespace(project.name)
  const role = normalizeWhitespace(project.role)

  return Array.from(new Set([
    [projectName, coreTerms, '技术方案 架构 最佳实践', currentYear].filter(Boolean).join(' '),
    [coreTerms || projectName, '行业趋势 最新 应用场景', currentYear].filter(Boolean).join(' '),
    [coreTerms || projectName, role, '项目面试 深挖 难点 数据指标'].filter(Boolean).join(' '),
  ].filter(query => query.trim().length > 6))).slice(0, 3)
}

function toSource(result: SearchResultItem): ProjectSopResearchSource {
  return {
    title: result.title || result.url,
    url: result.url,
    content: normalizeWhitespace(result.content).slice(0, 700),
    providerName: result.providerName,
    publishedDate: result.publishedDate || '',
  }
}

function formatSources(sources: ProjectSopResearchSource[]): string {
  if (!sources.length) return '（未检索到可用公开资料）'

  return sources.map((source, index) => [
    `${index + 1}. 《${source.title}》`,
    source.publishedDate ? `发布时间：${source.publishedDate}` : '',
    `来源：${source.providerName}`,
    `链接：${source.url}`,
    `摘要：${source.content}`,
  ].filter(Boolean).join('\n')).join('\n\n')
}

export async function buildProjectSopResearchBrief(
  providers: ResolvedSearchProviderConfig[],
  project: ProjectEntry,
  jdContextText: string,
  signal?: AbortSignal,
): Promise<ProjectSopResearchBrief> {
  const queries = buildQueries(project, jdContextText)
  if (!providers.length || !queries.length) {
    return {
      fetchedAt: new Date().toISOString(),
      queries,
      sources: [],
      markdown: '未配置可用网络搜索渠道，当前只能基于简历项目原文、JD 上下文和模型理解生成。',
    }
  }

  const settled = await Promise.allSettled(
    queries.map(query => searchAcrossProviders(providers, query, { maxResults: 4 }, signal)),
  )

  const byUrl = new Map<string, ProjectSopResearchSource>()
  settled.forEach(result => {
    if (result.status !== 'fulfilled') return
    result.value.forEach(item => {
      const url = item.url.trim()
      if (!url || byUrl.has(url)) return
      byUrl.set(url, toSource(item))
    })
  })

  const sources = [...byUrl.values()].slice(0, 8)
  const fetchedAt = new Date().toISOString()

  return {
    fetchedAt,
    queries,
    sources,
    markdown: [
      `检索时间：${fetchedAt}`,
      '',
      '检索问题：',
      ...queries.map(query => `- ${query}`),
      '',
      '公开资料摘要：',
      formatSources(sources),
    ].join('\n'),
  }
}
