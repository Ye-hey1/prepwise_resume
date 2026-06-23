<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  sourceType?: string
  sourceUrl?: string
  isGrounded?: boolean
  resumeAnchor?: string
}>()

const sourceInfo = computed(() => {
  switch (props.sourceType) {
    case 'real_experience':
      return {
        label: '真实面经',
        color: 'green',
        icon: '🔗',
      }
    case 'jd_analysis':
      return {
        label: 'JD 分析',
        color: 'blue',
        icon: '📋',
      }
    case 'ai_generated':
    default:
      return {
        label: 'AI 生成',
        color: 'purple',
        icon: '🤖',
      }
  }
})

const showSourceLink = computed(() => 
  props.sourceUrl && props.sourceType === 'real_experience'
)
</script>

<template>
  <div class="source-badges">
    <span 
      class="source-badge"
      :class="`source-badge--${sourceInfo.color}`"
    >
      <span class="badge-icon">{{ sourceInfo.icon }}</span>
      <span class="badge-label">{{ sourceInfo.label }}</span>
    </span>
    
    <span 
      v-if="isGrounded" 
      class="grounded-badge"
      title="可追溯到真实数据"
    >
      ✓ 可追溯
    </span>
    
    <span 
      v-if="resumeAnchor" 
      class="anchor-badge"
      :title="`锚定到简历项目：${resumeAnchor}`"
    >
      🎯 {{ resumeAnchor }}
    </span>
    
    <a 
      v-if="showSourceLink" 
      :href="sourceUrl" 
      target="_blank" 
      rel="noopener noreferrer"
      class="source-link"
      title="查看原始来源"
    >
      查看来源
    </a>
  </div>
</template>

<style scoped>
.source-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.source-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.source-badge--green {
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
  border: 1px solid color-mix(in srgb, var(--accent-green) 20%, var(--border-color));
}

.source-badge--blue {
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
  color: var(--primary-500);
  border: 1px solid color-mix(in srgb, var(--primary-500) 20%, var(--border-color));
}

.source-badge--purple {
  background: color-mix(in srgb, var(--accent-purple) 10%, var(--bg-card));
  color: var(--accent-purple);
  border: 1px solid color-mix(in srgb, var(--accent-purple) 20%, var(--border-color));
}

.badge-icon {
  font-size: 12px;
}

.grounded-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
  border: 1px solid color-mix(in srgb, var(--accent-green) 20%, var(--border-color));
}

.anchor-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
  color: var(--primary-500);
  border: 1px solid color-mix(in srgb, var(--primary-500) 20%, var(--border-color));
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  text-decoration: none;
  transition: all 0.2s ease;
}

.source-link:hover {
  background: var(--bg-card);
  color: var(--primary-500);
  border-color: var(--primary-400);
}
</style>