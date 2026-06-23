# 进一步优化方案

## 1. 性能优化

### 1.1 代码分割和懒加载
```typescript
// router/index.ts
const routes = [
  {
    path: '/resume',
    component: () => import('@/views/ResumeEditorView.vue'), // 懒加载
  },
  {
    path: '/interview',
    component: () => import('@/views/AiInterviewerView.vue'),
  },
]
```

### 1.2 虚拟滚动（大量题目）
```bash
npm install @tanstack/vue-virtual
```

```vue
<template>
  <VirtualList :data="questions" :height="600" :item-height="120">
    <template #default="{ item }">
      <QuestionCard :question="item" />
    </template>
  </VirtualList>
</template>
```

### 1.3 图片懒加载
```vue
<template>
  <img v-lazy="imageSrc" :alt="alt" />
</template>
```

### 1.4 Service Worker 缓存
```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
        ],
      },
    }),
  ],
}
```

## 2. 用户体验优化

### 2.1 离线支持
```typescript
// stores/offline.ts
export const useOfflineStore = defineStore('offline', () => {
  const isOffline = ref(false)
  const pendingSync = ref([])

  // 监听网络状态
  window.addEventListener('offline', () => {
    isOffline.value = true
  })

  window.addEventListener('online', () => {
    isOffline.value = false
    syncPendingData()
  })

  async function syncPendingData() {
    // 同步离线期间的数据
  }
})
```

### 2.2 快捷键支持
```typescript
// composables/useKeyboard.ts
export function useKeyboard shortcuts() {
  const shortcuts = {
    'ctrl+s': () => save(),
    'ctrl+z': () => undo(),
    'ctrl+shift+z': () => redo(),
    'ctrl+n': () => createNew(),
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  function handleKeydown(e: KeyboardEvent) {
    const key = `${e.ctrlKey ? 'ctrl+' : ''}${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`
    if (shortcuts[key]) {
      e.preventDefault()
      shortcuts[key]()
    }
  }
}
```

### 2.3 拖拽排序
```bash
npm install vuedraggable@next
```

```vue
<template>
  <draggable v-model="questions" item-key="id" handle=".drag-handle">
    <template #item="{ element }">
      <QuestionCard :question="element" />
    </template>
  </draggable>
</template>
```

### 2.4 更好的错误处理
```typescript
// utils/errorHandler.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public severity: 'low' | 'medium' | 'high' = 'medium',
    public userMessage?: string
  ) {
    super(message)
  }
}

export function handleError(error: unknown) {
  if (error instanceof AppError) {
    // 显示用户友好的错误信息
    showToast(error.userMessage || error.message, error.severity)
    
    // 记录错误
    logError(error)
  } else {
    showToast('发生未知错误', 'high')
    console.error(error)
  }
}
```

## 3. 功能增强

### 3.1 数据导入/导出
```typescript
// services/exportService.ts
export async function exportToJSON(data: any): Promise<Blob> {
  const json = JSON.stringify(data, null, 2)
  return new Blob([json], { type: 'application/json' })
}

export async function exportToCSV(data: any[]): Promise<Blob> {
  const headers = Object.keys(data[0])
  const rows = data.map(item => headers.map(h => item[h]).join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  return new Blob([csv], { type: 'text/csv' })
}

export async function exportToPDF(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element)
  const pdf = new jsPDF()
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0)
  return pdf.output('blob')
}
```

### 3.2 多语言支持
```bash
npm install vue-i18n@9
```

```typescript
// i18n/index.ts
import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})
```

### 3.3 主题定制
```typescript
// composables/useTheme.ts
export function useTheme() {
  const theme = ref<'light' | 'dark' | 'system'>('system')

  function setTheme(newTheme: 'light' | 'dark' | 'system') {
    theme.value = newTheme
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
  }

  // 跟随系统
  watchEffect(() => {
    if (theme.value === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    }
  })

  return { theme, setTheme }
}
```

### 3.4 协作功能（Supabase Realtime）
```typescript
// services/collaboration.ts
import { supabase } from '@/lib/supabaseClient'

export function setupRealtimeSync(roomId: string) {
  const channel = supabase.channel(`room:${roomId}`)

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      // 更新在线用户
    })
    .on('broadcast', { event: 'update' }, ({ payload }) => {
      // 处理实时更新
    })
    .subscribe()

  return channel
}
```

## 4. 代码质量优化

### 4.1 单元测试
```bash
npm install -D vitest @vue/test-utils jsdom
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
```

```typescript
// stores/questionBank.test.ts
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useQuestionBankStore } from './questionBank'

describe('QuestionBank Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adds a question', async () => {
    const store = useQuestionBankStore()
    await store.addQuestion({
      content: 'Test question',
      category: '技术',
      tags: ['test'],
    })
    expect(store.questions).toHaveLength(1)
  })
})
```

### 4.2 E2E 测试
```bash
npm install -D @playwright/test
```

```typescript
// e2e/questionBank.spec.ts
import { test, expect } from '@playwright/test'

test('adds a new question', async ({ page }) => {
  await page.goto('/question-bank')
  await page.click('button:has-text("添加题目")')
  await page.fill('input[placeholder="输入面试题内容"]', 'What is Vue.js?')
  await page.click('button:has-text("保存")')
  await expect(page.locator('.question-card')).toContainText('What is Vue.js?')
})
```

### 4.3 性能监控
```typescript
// utils/performance.ts
export function measurePerformance(name: string, fn: () => Promise<any>) {
  return async (...args: any[]) => {
    const start = performance.now()
    try {
      return await fn(...args)
    } finally {
      const duration = performance.now() - start
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`)
      
      // 发送到分析服务
      if (duration > 1000) {
        logSlowOperation(name, duration)
      }
    }
  }
}
```

## 5. 架构优化

### 5.1 状态管理优化
```typescript
// stores/index.ts
export * from './resume'
export * from './questionBank'
export * from './aiConfig'
export * from './interview'

// 使用 storeToRefs 解构
import { storeToRefs } from 'pinia'
const store = useResumeStore()
const { basicInfo, skills } = storeToRefs(store)
```

### 5.2 服务层抽象
```typescript
// services/base.ts
export abstract class BaseService {
  protected async request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
    
    if (!response.ok) {
      throw new AppError(`Request failed: ${response.status}`, 'REQUEST_ERROR')
    }
    
    return response.json()
  }
}

// services/ai.ts
export class AIService extends BaseService {
  async chat(prompt: string): Promise<string> {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    })
  }
}
```

### 5.3 组件复用
```vue
<!-- components/common/BaseDialog.vue -->
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="dialog-overlay" @click.self="close">
        <div class="dialog" :class="sizeClass">
          <header class="dialog-header">
            <slot name="header" />
            <button class="close-btn" @click="close">×</button>
          </header>
          <main class="dialog-body">
            <slot />
          </main>
          <footer v-if="$slots.footer" class="dialog-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
```

### 5.4 错误边界
```vue
<!-- components/common/ErrorBoundary.vue -->
<template>
  <div v-if="error" class="error-boundary">
    <h3>发生错误</h3>
    <p>{{ error.message }}</p>
    <button @click="reset">重试</button>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

const error = ref<Error | null>(null)

onErrorCaptured((err) => {
  error.value = err
  return false // 阻止错误继续传播
})

function reset() {
  error.value = null
}
</script>
```

## 6. 优先级排序

### 高优先级（1-2周）
1. ✅ 虚拟滚动 - 大量题目时性能提升明显
2. ✅ 快捷键支持 - 提升操作效率
3. ✅ 错误处理优化 - 提升用户体验
4. ✅ 单元测试 - 保证代码质量

### 中优先级（2-4周）
5. 数据导入/导出 - 便于数据迁移
6. 离线支持 - 提升可用性
7. 拖拽排序 - 提升交互体验
8. 性能监控 - 发现性能瓶颈

### 低优先级（4周+）
9. 多语言支持 - 国际化
10. 主题定制 - 个性化
11. 协作功能 - 团队使用
12. E2E 测试 - 保证功能稳定

## 总结

以上优化方案涵盖了性能、用户体验、功能、代码质量和架构五个方面。建议按照优先级逐步实施，每个优化点都可以独立完成，不会影响现有功能。