import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupRouterGuards } from './router/guards'
import { setupErrorHandler } from './utils/errorHandler'
import { migrateFromLocalStorage } from './utils/storage'
import { sanitizeHtml, sanitizeMarkdownHtml } from './utils/sanitize'
import './assets/main.css'

const app = createApp(App)

// 全局错误处理（优先安装，确保后续初始化错误也能捕获）
setupErrorHandler(app)

app.use(createPinia())
app.use(router)

// 路由守卫
setupRouterGuards(router)

// v-safe-html: 安全的 v-html 替代，自动消毒 HTML 防止 XSS
// 使用方式: v-safe-html="content" 或 v-safe-html:md="markdownContent"
app.directive('safe-html', {
  mounted(el, binding) {
    const sanitizer = binding.arg === 'md' ? sanitizeMarkdownHtml : sanitizeHtml
    el.innerHTML = sanitizer(binding.value ?? '')
  },
  updated(el, binding) {
    const sanitizer = binding.arg === 'md' ? sanitizeMarkdownHtml : sanitizeHtml
    el.innerHTML = sanitizer(binding.value ?? '')
  },
})

app.mount('#app')

// 异步执行 IndexedDB 迁移（不阻塞首屏渲染）
migrateFromLocalStorage().then(({ migrated, keys }) => {
  if (migrated) {
    console.info('[Storage] 数据已迁移到 IndexedDB:', keys)
  }
}).catch((err) => {
  console.warn('[Storage] IndexedDB 迁移跳过:', err)
})
