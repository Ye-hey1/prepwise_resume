import type { ResolvedSearchProviderConfig, SearchProviderId } from '@/stores/aiConfig'
import { exaSearch } from './exaService'
import { firecrawlSearch } from './firecrawlService'
import { serperSearch } from './serperService'
import { tavilySearch } from './tavilyService'

export interface SearchResultItem {
  title: string
  url: string
  content: string
  providerId: SearchProviderId
  providerName: string
  score?: number
  publishedDate?: string
}

function trimContent(content: string, maxLength = 900): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function dedupeSearchResults(results: SearchResultItem[]): SearchResultItem[] {
  const byUrl = new Map<string, SearchResultItem>()
  results.forEach(result => {
    const key = result.url.trim().toLowerCase()
    if (!key) return

    const existing = byUrl.get(key)
    if (!existing) {
      byUrl.set(key, result)
      return
    }

    const nextContent = result.content.length > existing.content.length ? result.content : existing.content
    byUrl.set(key, {
      ...existing,
      ...result,
      content: nextContent,
      score: Math.max(existing.score ?? 0, result.score ?? 0) || undefined,
    })
  })

  return [...byUrl.values()]
}

export async function searchWithProvider(
  provider: ResolvedSearchProviderConfig,
  query: string,
  options?: { maxResults?: number },
  signal?: AbortSignal,
): Promise<SearchResultItem[]> {
  switch (provider.id) {
    case 'tavily': {
      const response = await tavilySearch(provider.apiKey, query, { maxResults: options?.maxResults ?? 3 }, signal)
      return (response.results || []).map(result => ({
        title: result.title || result.url,
        url: result.url,
        content: trimContent(result.content || ''),
        providerId: 'tavily',
        providerName: 'Tavily',
        score: result.score,
      }))
    }
    case 'exa': {
      const response = await exaSearch(provider.apiKey, query, { maxResults: options?.maxResults ?? 3 }, signal)
      return (response.results || []).map(result => ({
        title: result.title || result.url || query,
        url: result.url || '',
        content: trimContent(result.text || result.summary || ''),
        providerId: 'exa',
        providerName: 'Exa',
        score: result.score,
        publishedDate: result.publishedDate,
      }))
    }
    case 'serper': {
      const response = await serperSearch(provider.apiKey, query, { maxResults: options?.maxResults ?? 3 }, signal)
      return (response.organic || []).map(result => ({
        title: result.title || result.link || query,
        url: result.link || '',
        content: trimContent(result.snippet || ''),
        providerId: 'serper',
        providerName: 'Serper',
        score: result.position ? Math.max(0, 1 - result.position / 10) : undefined,
        publishedDate: result.date,
      }))
    }
    case 'firecrawl': {
      const response = await firecrawlSearch(provider.apiKey, query, { maxResults: options?.maxResults ?? 3 }, signal)
      
      let rawData: any[] = []
      if (Array.isArray(response.data)) {
        rawData = response.data
      } else if (response.data && Array.isArray((response.data as any).data)) {
        rawData = (response.data as any).data
      } else if (Array.isArray(response)) {
        rawData = response as any[]
      }

      return rawData.map(result => ({
        title: result.title || result.url || query,
        url: result.url || '',
        content: trimContent(result.markdown || result.content || result.description || ''),
        providerId: 'firecrawl',
        providerName: 'Firecrawl',
      }))
    }
    default:
      return []
  }
}

export async function searchAcrossProviders(
  providers: ResolvedSearchProviderConfig[],
  query: string,
  options?: { maxResults?: number },
  signal?: AbortSignal,
): Promise<SearchResultItem[]> {
  const settled = await Promise.allSettled(
    providers.map(provider => searchWithProvider(provider, query, options, signal)),
  )

  const merged = settled.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  return dedupeSearchResults(
    merged
      .filter(result => result.url && result.content)
      .slice(0, Math.max((options?.maxResults ?? 3) * providers.length, options?.maxResults ?? 3)),
  )
}

export async function testSearchProviderConnection(
  provider: ResolvedSearchProviderConfig,
  signal?: AbortSignal,
): Promise<void> {
  await searchWithProvider(provider, 'test connection', { maxResults: 1 }, signal)
}
