/**
 * Tavily Search API 封装
 * 用于公司面试情报搜索
 */

export interface TavilySearchResult {
  title: string
  url: string
  content: string
  score: number
}

export interface TavilySearchResponse {
  query: string
  results: TavilySearchResult[]
}

/**
 * 调用 Tavily Search API
 * @see https://docs.tavily.com/documentation/api-reference/endpoint/search
 */
export async function tavilySearch(
  apiKey: string,
  query: string,
  options?: { maxResults?: number; searchDepth?: 'basic' | 'advanced' },
  signal?: AbortSignal,
): Promise<TavilySearchResponse> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: options?.maxResults ?? 3,
      search_depth: options?.searchDepth ?? 'basic',
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    if (response.status === 401 || response.status === 403) {
      throw new Error('Tavily API Key 无效，请在 AI 配置中检查。')
    }
    if (response.status === 429) {
      throw new Error('Tavily 搜索请求过于频繁，请稍后重试。')
    }
    throw new Error(`Tavily 搜索失败 (${response.status}): ${errorText || response.statusText}`)
  }

  const data = await response.json() as TavilySearchResponse
  return data
}
