# InterviewRadar 集成优化计划

## 目标
将 InterviewRadar 的核心优势整合到 PrepWise 中，提升题库的真实性和个性化程度。

## 优化步骤

### 阶段一：数据结构扩展（第1周）
1. 扩展 SavedQuestion 接口，添加以下字段：
   - `source_url?: string` - 真实面经源链接
   - `source_type?: 'ai_generated' | 'real_experience' | 'jd_analysis'` - 题目来源类型
   - `posted_at?: string` - 原始发布时间
   - `frequency_score?: number` - 频次分数
   - `recency_score?: number` - 时效分数
   - `is_grounded?: boolean` - 是否可追溯到真实数据
   - `resume_anchor?: string` - 关联的简历项目/技能
   - `follow_up_chain?: string[]` - 追问链

2. 更新数据库 schema（Supabase 迁移）
3. 更新 localStorage 存储结构

### 阶段二：真实面经数据源集成（第2-3周）
1. 创建 Connector 架构：
   - `src/services/connectors/base.ts` - 基础接口
   - `src/services/connectors/nowcoder.ts` - 牛客 connector
   - `src/services/connectors/github.ts` - GitHub connector
   - `src/services/connectors/web.ts` - 通用网页 connector

2. 实现数据采集服务：
   - `src/services/corpus/collector.ts` - 数据采集器
   - `src/services/corpus/recency.ts` - 时效过滤
   - `src/services/corpus/dedupeRank.ts` - 去重排序

3. 创建 UI 组件：
   - `src/components/questionBank/RealExperienceDialog.vue` - 真实面经导入对话框
   - `src/components/questionBank/SourceBadge.vue` - 来源标识组件

### 阶段三：项目锚定功能（第4周）
1. 实现简历项目分析：
   - `src/services/resume/analyzer.ts` - 简历项目分析
   - `src/services/interview/anchorEngine.ts` - 项目锚定引擎

2. 生成个性化追问链：
   - 基于高频题 + 简历项目生成追问
   - 实现 `is_grounded` 标记逻辑

### 阶段四：备考包生成（第5周）
1. 创建备考包生成器：
   - `src/services/prepPackage/generator.ts` - 备考包生成
   - `src/components/prepPackage/PrepPackageView.vue` - 备考包展示

2. 实现模板系统：
   - 岗位 Gap 分析
   - 高频题 Top N
   - 项目追问链
   - 冲刺计划

### 阶段五：UI 增强（第6周）
1. 更新题库管理页面：
   - 添加"真实面经"标签筛选
   - 添加时效性筛选
   - 显示来源标识和可追溯标记

2. 集成到现有功能：
   - JD 分析页面：补充真实面经数据
   - 模拟面试：使用项目锚定追问
   - 闭环学习：追踪真实面经题目掌握度

## 技术实现细节

### 数据模型扩展
```typescript
interface SavedQuestion {
  // 现有字段...
  
  // 新增字段
  source_url?: string
  source_type?: 'ai_generated' | 'real_experience' | 'jd_analysis'
  posted_at?: string
  frequency_score?: number
  recency_score?: number
  is_grounded?: boolean
  resume_anchor?: string
  follow_up_chain?: string[]
}
```

### Connector 接口
```typescript
interface Connector {
  name: string
  search(queries: string[]): Promise<SearchResult>
}

interface SearchResult {
  status: 'ok' | 'degraded'
  posts: RawPost[]
  message?: string
}

interface RawPost {
  source: string
  url: string
  content: string
  postedAt?: string
  metadata?: Record<string, unknown>
}
```

### 时效过滤算法
```typescript
function filterRecent(posts: RawPost[], windowDays = 730): RawPost[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - windowDays)
  
  return posts.filter(post => {
    if (!post.postedAt) return true // 无日期保留
    return new Date(post.postedAt) >= cutoff
  })
}
```

### 频次×时效排序
```typescript
function dedupeAndRank(questions: Question[]): Question[] {
  // 去重
  const unique = deduplicate(questions)
  
  // 计算综合分数
  return unique.map(q => ({
    ...q,
    score: (q.frequency_score ?? 1) * recencyWeight(q.posted_at)
  })).sort((a, b) => b.score - a.score)
}

function recencyWeight(postedAt?: string): number {
  if (!postedAt) return 0.2 // 无日期降权
  const days = (Date.now() - new Date(postedAt).getTime()) / (1000 * 60 * 60 * 24)
  return Math.max(0.1, 1 - days / 730) // 线性衰减
}
```

## 验证指标
1. 真实面经题目占比 > 30%
2. 项目锚定成功率 > 60%
3. 用户满意度提升（通过反馈收集）
4. 题目时效性：90% 题目在 2 年内

## 风险与缓解
1. **数据源稳定性**：实现降级机制，主源不可用时自动切换
2. **反爬限制**：添加请求间隔，使用代理池
3. **数据质量**：人工审核 + AI 过滤双重保障
4. **性能影响**：异步采集，缓存机制