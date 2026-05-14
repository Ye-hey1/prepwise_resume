import type { ResolvedSearchProviderConfig } from '@/stores/aiConfig'
import type { AiConfig } from '../stream'
import type { StreamCallbacks } from '../types/jd'
import type { CompanyIntelData, CompanyIntelSourceDetail } from '../types/jd'
import { cleanJsonResponse, nonStreamAIRequest } from '../stream'
import { COMPANY_INTEL_SYSTEM_PROMPT, COMPANY_INTEL_USER_TEMPLATE } from '../prompts/jdCompanyIntelPrompt'
import { searchAcrossProviders, type SearchResultItem } from '../searchService'
import { normalizeCompanyIntel } from './normalizers'

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function buildCompanyAliases(company: string): string[] {
  const normalized = normalizeWhitespace(company)
  if (!normalized) return []

  const aliases = new Set<string>([normalized])
  let stripped = normalized

  const suffixPatterns = [
    /股份有限公司$/g,
    /有限责任公司$/g,
    /有限公司$/g,
    /集团$/g,
    /控股$/g,
    /科技$/g,
    /信息技术$/g,
    /技术$/g,
    /数字科技$/g,
    /数科$/g,
  ]

  suffixPatterns.forEach((pattern) => {
    stripped = stripped.replace(pattern, '')
  })

  stripped = stripped.replace(/^(北京|上海|深圳|广州|杭州|苏州|成都|武汉|南京|天津|重庆)/, '').trim()

  if (stripped.length >= 2) aliases.add(stripped)
  if (stripped.length >= 4) aliases.add(stripped.slice(0, 4))

  return [...aliases]
    .map(item => item.trim())
    .filter(item => item.length >= 2)
}

function scoreCompanyRelevance(result: SearchResultItem, aliases: string[]): number {
  const haystack = `${result.title} ${result.content} ${result.url}`.toLowerCase()
  let score = result.score ?? 0

  aliases.forEach((alias) => {
    const lower = alias.toLowerCase()
    if (!lower) return
    if (result.title.toLowerCase().includes(lower)) score += 6
    if (result.url.toLowerCase().includes(lower)) score += 4
    if (haystack.includes(lower)) score += 2
  })

  if (/官网|关于我们|产品|解决方案|招聘|职位|岗位|技术|新闻|动态/.test(result.title)) score += 1.5
  if (/zhihu|zhuanlan|event|whitepaper/i.test(result.url)) score -= 1

  return score
}

function selectRelevantResults(results: SearchResultItem[], aliases: string[], limit: number): SearchResultItem[] {
  const scored = results
    .map((result) => ({ result, relevance: scoreCompanyRelevance(result, aliases) }))
    .sort((a, b) => b.relevance - a.relevance)

  return scored
    .map(({ result }) => result)
    .slice(0, limit)
}

function formatSearchResults(results: SearchResultItem[]): string {
  if (!results.length) return '（未检索到相关结果）'

  return results
    .map((result, index) => {
      const sourceMeta = [`来源渠道: ${result.providerName}`, `来源地址: ${result.url}`]
      if (result.publishedDate) sourceMeta.splice(1, 0, `发布时间: ${result.publishedDate}`)

      return [
        `${index + 1}. 《${result.title}》`,
        normalizeWhitespace(result.content),
        ...sourceMeta,
      ].join('\n')
    })
    .join('\n\n')
}

function buildSourceDetails(results: SearchResultItem[], fetchedAt: string): CompanyIntelSourceDetail[] {
  const deduped = new Map<string, CompanyIntelSourceDetail>()

  results.forEach((result) => {
    const url = result.url.trim()
    if (!url) return

    if (!deduped.has(url)) {
      deduped.set(url, {
        title: result.title?.trim() || url,
        url,
        providerLabel: result.providerName,
        publishedAt: result.publishedDate?.trim() || '',
        fetchedAt,
      })
    }
  })

  return [...deduped.values()].slice(0, 6)
}

export async function generateCompanyIntel(
  aiConfig: AiConfig,
  searchProviders: ResolvedSearchProviderConfig[],
  company: string,
  position: string,
  jdText: string,
  _callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<CompanyIntelData> {
  if (!searchProviders.length) {
    throw new Error('未配置可用的搜索渠道，请先在 AI 配置中启用网络搜索服务。')
  }

  const controller = new AbortController()
  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal

  const companyAliases = buildCompanyAliases(company)
  const singleProviderMode = searchProviders.length === 1
  const perQueryLimit = singleProviderMode ? 8 : 5

  const queries = [
    { topic: 'searchBusiness', query: `"${company}" 公司介绍 产品 解决方案 客户案例 商业模式 site:官网 OR 关于我们 OR 发展历程` },
    { topic: 'searchRecruitment', query: `"${company}" ${position} 招聘 技术栈 团队规模 工程文化 开发流程 site:boss.cn OR site:lagou.com OR site:zhipin.com` },
    { topic: 'searchInterview', query: `"${company}" 面试经验 面试流程 员工评价 工作体验 加班 薪资 site:maimai.cn OR site:kanzhun.com OR site:nowcoder.com` },
    { topic: 'searchNews', query: `"${company}" 融资 估值 竞品 行业排名 新闻 动态 合作 site:36kr.com OR site:huxiu.com OR site:itjuzi.com` },
  ] as const

  const searchResults: Record<(typeof queries)[number]['topic'], SearchResultItem[]> = {
    searchBusiness: [],
    searchRecruitment: [],
    searchInterview: [],
    searchNews: [],
  }

  await Promise.all(
    queries.map(async ({ topic, query }) => {
      try {
        const rawResults = await searchAcrossProviders(
          searchProviders,
          query,
          { maxResults: perQueryLimit },
          combinedSignal,
        )

        searchResults[topic] = selectRelevantResults(rawResults, companyAliases, perQueryLimit)
      } catch (error) {
        console.warn(`[companyIntel] search failed for "${query}"`, error)
      }
    }),
  )

  const mergedResults = Object.values(searchResults).flat()
  if (!mergedResults.length) {
    throw new Error('未能检索到任何公司信息，请检查搜索渠道配置或稍后重试。')
  }

  const userMessage = COMPANY_INTEL_USER_TEMPLATE
    .replace('{company}', company)
    .replace('{position}', position)
    .replace('{jdText}', jdText.slice(0, 3000))
    .replace('{searchBusiness}', formatSearchResults(searchResults.searchBusiness))
    .replace('{searchRecruitment}', formatSearchResults(searchResults.searchRecruitment))
    .replace('{searchTechStack}', formatSearchResults(searchResults.searchRecruitment))
    .replace('{searchNews}', formatSearchResults(searchResults.searchNews))
    .replace('{searchInterview}', formatSearchResults(searchResults.searchInterview))
    .replace('{searchCompetitors}', formatSearchResults(searchResults.searchNews))

  const rawText = await nonStreamAIRequest(
    aiConfig,
    COMPANY_INTEL_SYSTEM_PROMPT,
    userMessage,
    { temperature: 0.3, maxTokens: 4096 },
    combinedSignal,
  )

  const jsonStr = cleanJsonResponse(rawText)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('AI 返回了无法解析的公司情报数据，请重试。')
  }

  const intel = normalizeCompanyIntel(parsed)
  if (!intel.companyName) intel.companyName = company

  const fetchedAt = new Date().toISOString()
  const sourceDetails = buildSourceDetails(mergedResults, fetchedAt)
  const sourceUrls = sourceDetails.map(item => item.url)

  intel.sourceDetails = sourceDetails.length ? sourceDetails : intel.sourceDetails
  intel.fetchedAt = fetchedAt
  intel.sources = sourceUrls.length ? sourceUrls : intel.sources

  if (!intel.sourceDetails.length && intel.sources.length) {
    intel.sourceDetails = intel.sources.map(url => ({
      title: url,
      url,
      providerLabel: 'Web',
      publishedAt: '',
      fetchedAt,
    }))
  }

  return intel
}
