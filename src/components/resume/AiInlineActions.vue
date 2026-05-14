<script setup lang="ts">
defineProps<{
  busy?: boolean
  error?: string
  optimizeSuggestions?: string
  optimizedContent?: string
  optimizedContentHtml?: string
}>()

const emit = defineEmits<{
  applyOptimized: [mode: 'replace' | 'append']
}>()
</script>

<template>
  <div class="inline-ai-panel">
    <p v-if="busy" class="panel-status">AI 正在生成内容，请稍候...</p>
    <p v-else-if="error" class="panel-error">{{ error }}</p>

    <template v-else>
      <div v-if="optimizeSuggestions || optimizedContent" class="panel-block">
        <div class="panel-title-row">
          <span class="panel-title">AI 优化结果</span>
          <div v-if="optimizedContent" class="panel-actions">
            <button type="button" class="mini-btn" @click="emit('applyOptimized', 'replace')">替换当前内容</button>
            <button type="button" class="mini-btn ghost" @click="emit('applyOptimized', 'append')">追加到末尾</button>
          </div>
        </div>
        <div v-if="optimizeSuggestions" class="panel-sub-block">
          <div class="sub-title">优化建议</div>
          <pre class="panel-text">{{ optimizeSuggestions }}</pre>
        </div>
        <div v-if="optimizedContent" class="panel-sub-block">
          <div class="sub-title">优化后内容</div>
          <div class="panel-rich-text" v-safe-html:md="optimizedContentHtml || optimizedContent"></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.inline-ai-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(100, 120, 150, 0.12);
  background: var(--bg-card-muted);
}

.panel-status,
.panel-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.panel-status {
  color: var(--text-secondary);
}

.panel-error {
  color: var(--accent-red);
}

.panel-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.panel-title,
.sub-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-primary);
}

.panel-sub-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(100, 120, 150, 0.14);
  border-radius: 14px;
  background: var(--glass-mid);
}

.panel-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-primary);
  font-family: inherit;
}

.panel-rich-text {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-primary);
}

.panel-rich-text :deep(p),
.panel-rich-text :deep(ul),
.panel-rich-text :deep(ol) {
  margin: 0;
}

.panel-rich-text :deep(ul),
.panel-rich-text :deep(ol) {
  padding-left: 18px;
}

.panel-rich-text :deep(li + li),
.panel-rich-text :deep(p + p) {
  margin-top: 4px;
}

.panel-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mini-btn {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--accent-blue-500);
  background: var(--accent-blue-500);
  color: white;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.mini-btn.ghost {
  background: var(--glass-high);
  color: var(--text-secondary);
  border-color: rgba(100, 120, 150, 0.16);
}
</style>
