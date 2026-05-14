export interface SerperOrganicResult {
  title?: string
  link?: string
  snippet?: string
  date?: string
  position?: number
}

export interface SerperSearchResponse {
  organic?: SerperOrganicResult[]
}

export async function serperSearch(
  apiKey: string,
  query: string,
  options?: { maxResults?: number },
  signal?: AbortSignal,
): Promise<SerperSearchResponse> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({
      q: query,
      num: options?.maxResults ?? 3,
      gl: 'cn',
      hl: 'zh-cn',
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    if (response.status === 401 || response.status === 403) {
      throw new Error('Serper API Key 无效，请检查后重试。')
    }
    if (response.status === 429) {
      throw new Error('Serper 请求过于频繁，请稍后重试。')
    }
    throw new Error(`Serper 搜索失败 (${response.status}): ${errorText || response.statusText}`)
  }

  return await response.json() as SerperSearchResponse
}
