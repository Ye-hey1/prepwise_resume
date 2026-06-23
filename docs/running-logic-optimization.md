# 运行逻辑优化建议

## 当前架构分析

### 优点
1. 模块化设计良好，Connector 接口清晰
2. 支持多源数据采集
3. 实现了时效过滤和频次排序
4. UI 集成完整

### 可优化点

## 1. 数据采集逻辑优化

### 问题
- 面试题识别仅基于简单正则表达式，准确率有限
- 采集过程无进度反馈
- 缺少错误重试机制

### 优化方案
```typescript
// 1. AI 辅助面试题识别
async function extractQuestionsWithAI(content: string): Promise<ExtractedQuestion[]> {
  const prompt = `请从以下内容中提取面试题，返回 JSON 数组：
  
  ${content}
  
  返回格式：[{ "content": "题目内容", "type": "技术/行为/系统设计" }]`
  
  const response = await aiService.request(prompt)
  return JSON.parse(response)
}

// 2. 进度反馈机制
interface CollectionProgress {
  stage: 'connecting' | 'fetching' | 'parsing' | 'filtering' | 'complete'
  progress: number // 0-100
  message: string
}

// 3. 错误重试机制
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url)
    } catch (err) {
      if (i === maxRetries - 1) throw err
      await delay(1000 * (i + 1)) // 指数退避
    }
  }
  throw new Error('Max retries exceeded')
}
```

## 2. 缓存机制优化

### 问题
- 每次采集都重新请求所有数据源
- 没有本地缓存机制
- 重复采集相同内容浪费资源

### 优化方案
```typescript
// 1. 本地缓存管理
class CacheManager {
  private cache = new Map<string, { data: any; timestamp: number }>()
  private ttl = 24 * 60 * 60 * 1000 // 24小时

  get(key: string): any | null {
    const item = this.cache.get(key)
    if (!item) return null
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }
    return item.data
  }

  set(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() })
  }
}

// 2. 增量更新机制
interface CacheMetadata {
  lastFetch: string
  etag?: string
  lastModified?: string
}

async function fetchWithCache(url: string, metadata?: CacheMetadata): Promise<{ data: string; metadata: CacheMetadata }> {
  const headers: Record<string, string> = {}
  if (metadata?.etag) headers['If-None-Match'] = metadata.etag
  if (metadata?.lastModified) headers['If-Modified-Since'] = metadata.lastModified
  
  const response = await fetch(url, { headers })
  
  if (response.status === 304) {
    return { data: '', metadata: metadata! } // 使用缓存
  }
  
  return {
    data: await response.text(),
    metadata: {
      lastFetch: new Date().toISOString(),
      etag: response.headers.get('etag') || undefined,
      lastModified: response.headers.get('last-modified') || undefined,
    }
  }
}
```

## 3. 数据源管理优化

### 问题
- 数据源配置硬编码
- 缺少数据源健康检查
- 没有数据源优先级管理

### 优化方案
```typescript
// 1. 数据源配置管理
interface DataSourceConfig {
  id: string
  name: string
  type: 'github' | 'nowcoder' | 'web' | 'xiaohongshu'
  enabled: boolean
  priority: number // 1-10, 越高越优先
  config: Record<string, any>
  healthCheck?: {
    url: string
    interval: number // 检查间隔（毫秒）
    timeout: number
  }
}

// 2. 数据源健康检查
class DataSourceHealthChecker {
  private status = new Map<string, { healthy: boolean; lastCheck: number }>()
  
  async check(config: DataSourceConfig): Promise<boolean> {
    try {
      if (!config.healthCheck) return true
      
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), config.healthCheck.timeout)
      
      await fetch(config.healthCheck.url, { signal: controller.signal })
      clearTimeout(timeout)
      
      this.status.set(config.id, { healthy: true, lastCheck: Date.now() })
      return true
    } catch {
      this.status.set(config.id, { healthy: false, lastCheck: Date.now() })
      return false
    }
  }
  
  isHealthy(id: string): boolean {
    return this.status.get(id)?.healthy ?? true
  }
}

// 3. 动态数据源注册
class DataSourceRegistry {
  private sources = new Map<string, DataSourceConfig>()
  
  register(config: DataSourceConfig): void {
    this.sources.set(config.id, config)
  }
  
  getEnabled(): DataSourceConfig[] {
    return Array.from(this.sources.values())
      .filter(s => s.enabled)
      .sort((a, b) => b.priority - a.priority)
  }
}
```

## 4. AI 集成优化

### 问题
- 面试题质量参差不齐
- 缺少智能分类和标签
- 没有答案质量评估

### 优化方案
```typescript
// 1. AI 面试题分类
async function classifyQuestion(question: string): Promise<{
  category: string
  difficulty: number
  tags: string[]
}> {
  const prompt = `请对以下面试题进行分类：
  
  题目：${question}
  
  返回 JSON：
  {
    "category": "技术/行为/系统设计/算法",
    "difficulty": 1-5,
    "tags": ["标签1", "标签2"]
  }`
  
  const response = await aiService.request(prompt)
  return JSON.parse(response)
}

// 2. 答案质量评估
async function evaluateAnswer(question: string, answer: string): Promise<{
  score: number
  feedback: string
  improvements: string[]
}> {
  const prompt = `请评估以下面试答案的质量：
  
  问题：${question}
  答案：${answer}
  
  返回 JSON：
  {
    "score": 0-100,
    "feedback": "总体评价",
    "improvements": ["改进建议1", "改进建议2"]
  }`
  
  const response = await aiService.request(prompt)
  return JSON.parse(response)
}

// 3. 智能去重（语义相似度）
async function semanticDeduplicate(questions: ExtractedQuestion[]): Promise<ExtractedQuestion[]> {
  const embeddings = await Promise.all(
    questions.map(q => getEmbedding(q.content))
  )
  
  const unique: ExtractedQuestion[] = []
  const used = new Set<number>()
  
  for (let i = 0; i < questions.length; i++) {
    if (used.has(i)) continue
    
    unique.push(questions[i])
    used.add(i)
    
    // 找出语义相似的题目
    for (let j = i + 1; j < questions.length; j++) {
      if (used.has(j)) continue
      const similarity = cosineSimilarity(embeddings[i], embeddings[j])
      if (similarity > 0.85) {
        used.add(j)
        // 合并频次
        questions[i].frequencyScore += questions[j].frequencyScore
      }
    }
  }
  
  return unique
}
```

## 5. 性能优化

### 问题
- 大量数据处理时性能差
- UI 可能出现卡顿
- 内存占用可能过高

### 优化方案
```typescript
// 1. 分批处理
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize = 10
): Promise<R[]> {
  const results: R[] = []
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(processor))
    results.push(...batchResults)
    
    // 让出主线程，避免 UI 卡顿
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  
  return results
}

// 2. Web Worker 处理
// worker.ts
self.onmessage = async (e) => {
  const { questions, config } = e.data
  
  // 在 Worker 中处理数据
  const processed = await processQuestions(questions, config)
  
  self.postMessage(processed)
}

// main.ts
function processInWorker(questions: ExtractedQuestion[]): Promise<ExtractedQuestion[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url))
    worker.onmessage = (e) => resolve(e.data)
    worker.onerror = reject
    worker.postMessage(questions)
  })
}

// 3. 虚拟滚动（大量题目展示）
// 使用 vue-virtual-scroller 等库
```

## 6. 用户体验优化

### 问题
- 采集过程无反馈
- 错误提示不友好
- 缺少操作引导

### 优化方案
```vue
<!-- 1. 采集进度条 -->
<template>
  <div class="collection-progress">
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
    </div>
    <p class="progress-text">{{ message }}</p>
    <div class="progress-steps">
      <div v-for="step in steps" :key="step.id" :class="{ active: step.active, done: step.done }">
        {{ step.label }}
      </div>
    </div>
  </div>
</template>

<!-- 2. 错误提示优化 -->
<script setup lang="ts">
function showError(error: unknown) {
  const message = error instanceof Error ? error.message : '未知错误'
  const suggestions = getErrorSuggestions(message)
  
  // 显示友好的错误提示
  errorDialog.show({
    title: '采集失败',
    message,
    suggestions,
    actions: [
      { label: '重试', action: retryCollection },
      { label: '查看帮助', action: openHelp },
    ]
  })
}

function getErrorSuggestions(error: string): string[] {
  if (error.includes('网络')) return ['检查网络连接', '尝试使用代理']
  if (error.includes('超时')) return ['减少采集数量', '稍后重试']
  if (error.includes('权限')) return ['检查 API Key', '确认访问权限']
  return ['稍后重试', '联系管理员']
}
</script>
```

## 7. 数据持久化优化

### 问题
- 采集结果未持久化
- 无法查看历史采集记录
- 缺少数据导出功能

### 优化方案
```typescript
// 1. 采集历史管理
interface CollectionRecord {
  id: string
  timestamp: string
  targetPosition: string
  stats: {
    total: number
    bySource: Record<string, number>
  }
  questions: SavedQuestion[]
}

class CollectionHistory {
  private storageKey = 'prepwise-collection-history'
  
  save(record: CollectionRecord): void {
    const history = this.loadAll()
    history.unshift(record)
    // 只保留最近 20 条
    localStorage.setItem(this.storageKey, JSON.stringify(history.slice(0, 20)))
  }
  
  loadAll(): CollectionRecord[] {
    const data = localStorage.getItem(this.storageKey)
    return data ? JSON.parse(data) : []
  }
  
  load(id: string): CollectionRecord | null {
    return this.loadAll().find(r => r.id === id) ?? null
  }
}

// 2. 数据导出
function exportToJSON(questions: SavedQuestion[]): string {
  return JSON.stringify(questions, null, 2)
}

function exportToCSV(questions: SavedQuestion[]): string {
  const headers = ['内容', '分类', '来源', '掌握度', '来源链接']
  const rows = questions.map(q => [
    q.content,
    q.category,
    q.source_type,
    q.mastery_level ?? 0,
    q.source_url ?? '',
  ])
  
  return [headers, ...rows].map(row => row.join(',')).join('\n')
}
```

## 8. 测试和监控优化

### 问题
- 缺少单元测试
- 没有性能监控
- 错误追踪不完善

### 优化方案
```typescript
// 1. 性能监控
class PerformanceMonitor {
  private metrics = new Map<string, number[]>()
  
  start(label: string): () => void {
    const start = performance.now()
    return () => {
      const duration = performance.now() - start
      const existing = this.metrics.get(label) || []
      existing.push(duration)
      this.metrics.set(label, existing)
    }
  }
  
  getAverage(label: string): number {
    const values = this.metrics.get(label) || []
    return values.reduce((a, b) => a + b, 0) / values.length
  }
  
  report(): Record<string, { avg: number; count: number }> {
    const report: Record<string, { avg: number; count: number }> = {}
    for (const [label, values] of this.metrics) {
      report[label] = {
        avg: this.getAverage(label),
        count: values.length,
      }
    }
    return report
  }
}

// 2. 错误追踪
class ErrorTracker {
  track(error: Error, context: Record<string, any>): void {
    console.error('Error tracked:', error, context)
    
    // 发送到错误追踪服务
    if (import.meta.env.PROD) {
      fetch('/api/errors', {
        method: 'POST',
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          context,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        }),
      }).catch(console.error)
    }
  }
}
```

## 实施优先级

### 高优先级（1-2周）
1. 缓存机制 - 避免重复采集
2. 进度反馈 - 提升用户体验
3. 错误重试 - 提高稳定性

### 中优先级（2-4周）
4. AI 辅助识别 - 提高准确率
5. 数据源管理 - 支持动态配置
6. 采集历史 - 支持回溯

### 低优先级（4周+）
7. Web Worker - 性能优化
8. 虚拟滚动 - 大数据量支持
9. 性能监控 - 运营分析

## 总结

通过以上优化，可以显著提升：
1. **稳定性** - 错误重试、健康检查
2. **性能** - 缓存、分批处理、Web Worker
3. **用户体验** - 进度反馈、错误引导
4. **可维护性** - 配置化、监控、测试
5. **功能完整性** - AI 集成、历史管理、数据导出