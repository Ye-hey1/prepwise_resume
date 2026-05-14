<script setup lang="ts">
import { computed } from 'vue'
import type { CompanyIntelData, CompanyIntelSourceDetail } from '@/services/types/jd'

const props = defineProps<{
  intel: CompanyIntelData | null
  isLoading: boolean
  error: string
}>()

const emit = defineEmits<{
  retry: []
}>()

const referenceSources = computed(() => props.intel?.sourceDetails?.slice(0, 6) ?? [])
const latestPublishedAt = computed(() => {
  const values = referenceSources.value
    .map(item => item.publishedAt)
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())

  return values[0] ? formatDateTime(values[0].toISOString()).slice(0, 10) : ''
})

function formatDateTime(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function resolveSourceTimeLabel(source: CompanyIntelSourceDetail): string {
  return source.publishedAt
    ? formatDateTime(source.publishedAt).slice(0, 10)
    : ''
}
</script>

<template>
  <article class="company-intel-card">
    <header class="ci-header">
      <div class="ci-header-left">
        <svg class="ci-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <h2 class="ci-title">公司情报</h2>
      </div>
      <span class="ci-status-chip" :class="[isLoading ? 'is-loading' : error ? 'is-error' : 'is-completed']">
        {{ isLoading ? '加载中' : error ? '失败' : '已完成' }}
      </span>
    </header>

    <div v-if="isLoading && !intel" class="ci-skeleton">
      <div class="shimmer-bar shimmer" style="width: 55%; height: 24px" />
      <div class="shimmer-grid">
        <div class="shimmer-block shimmer" style="width: 100%; height: 80px" />
        <div class="shimmer-block shimmer" style="width: 100%; height: 72px" />
        <div class="shimmer-block shimmer" style="width: 100%; height: 92px" />
        <div class="shimmer-block shimmer" style="width: 100%; height: 84px" />
      </div>
    </div>

    <div v-else-if="error && !intel" class="ci-error">
      <p class="ci-error-text">{{ error }}</p>
      <button class="ci-retry-btn" type="button" @click="emit('retry')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
        重试
      </button>
    </div>

    <div v-else-if="intel" class="ci-body">
      <div class="ci-topline">
        <h3 class="ci-company-name">{{ intel.companyName }}</h3>
        <span v-if="latestPublishedAt" class="ci-updated-at">资料时间 {{ latestPublishedAt }}</span>
      </div>

      <div class="ci-section-grid">
        <section v-if="intel.businessScope" class="ci-section ci-section--span-2 ci-section--overview">
          <h4 class="ci-section-title">公司概况</h4>
          <p class="ci-section-text">{{ intel.businessScope }}</p>
        </section>

        <section v-if="intel.companyHistory || intel.orgStructure" class="ci-section">
          <h4 class="ci-section-title">发展与组织</h4>
          <ul class="ci-bullet-list">
            <li v-if="intel.companyHistory">{{ intel.companyHistory }}</li>
            <li v-if="intel.orgStructure">{{ intel.orgStructure }}</li>
          </ul>
        </section>

        <section v-if="intel.cultureNotes || intel.techStack?.length" class="ci-section">
          <h4 class="ci-section-title">技术与工程文化</h4>
          <p v-if="intel.cultureNotes" class="ci-section-text ci-section-text--compact">{{ intel.cultureNotes }}</p>
          <div v-if="intel.techStack?.length" class="ci-chips ci-tech-chips">
            <span v-for="(tech, i) in intel.techStack" :key="`tech-${i}`" class="ci-chip ci-chip--outline">{{ tech }}</span>
          </div>
        </section>

        <section v-if="intel.competitors?.length" class="ci-section">
          <h4 class="ci-section-title">主要竞品</h4>
          <div class="ci-chips">
            <span v-for="(comp, i) in intel.competitors" :key="`comp-${i}`" class="ci-chip ci-chip--secondary">{{ comp }}</span>
          </div>
        </section>

        <section v-if="intel.howToReference" class="ci-section ci-section--span-2 ci-section--emphasis">
          <h4 class="ci-section-title">面试切入点</h4>
          <p class="ci-section-text ci-reference">{{ intel.howToReference }}</p>
        </section>

        <section v-if="intel.reverseQuestions?.length" class="ci-section ci-section--span-2">
          <h4 class="ci-section-title">推荐反问</h4>
          <ul class="ci-order-list">
            <li v-for="(q, i) in intel.reverseQuestions" :key="`rq-${i}`">{{ q }}</li>
          </ul>
        </section>
      </div>

      <section v-if="referenceSources.length" class="ci-reference-panel">
        <span class="ci-reference-title">事实来源</span>
        <div class="ci-reference-inline">
          <span v-for="(source, i) in referenceSources" :key="`src-${i}`" class="ci-reference-inline-item">
            <a
              class="ci-reference-link"
              :href="source.url"
              target="_blank"
              rel="noopener noreferrer"
              :title="source.url"
            >
              [{{ i + 1 }}] {{ source.title }}
            </a>
            <span v-if="resolveSourceTimeLabel(source)" class="ci-reference-meta">（{{ resolveSourceTimeLabel(source) }}）</span>
          </span>
        </div>
      </section>
    </div>
  </article>
</template>

<style scoped>
.company-intel-card {
  padding: 28px;
  border-radius: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow:
    0 2px 8px color-mix(in srgb, var(--primary-500) 6%, transparent),
    0 12px 32px color-mix(in srgb, var(--primary-500) 3%, transparent);
}

.ci-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.ci-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ci-icon {
  color: var(--primary-500);
  flex-shrink: 0;
}

.ci-title {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
  color: var(--text-primary);
}

.ci-status-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-muted);
}

.ci-status-chip.is-loading {
  background: color-mix(in srgb, var(--primary-500) 12%, white);
  color: var(--primary-600);
}

.ci-status-chip.is-error {
  background: color-mix(in srgb, #ef4444 12%, white);
  color: #dc2626;
}

.ci-status-chip.is-completed {
  background: color-mix(in srgb, #10b981 12%, white);
  color: #059669;
}

.ci-skeleton {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.shimmer-bar,
.shimmer-block {
  border-radius: 12px;
}

.shimmer-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.shimmer {
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.1) 0%,
    rgba(148, 163, 184, 0.22) 40%,
    rgba(148, 163, 184, 0.1) 100%
  );
  background-size: 200% 100%;
  animation: shimmerMove 1.4s linear infinite;
}

.ci-error {
  padding: 18px;
  border-radius: 14px;
  border: 1px solid rgba(239, 68, 68, 0.18);
  background: rgba(239, 68, 68, 0.06);
}

.ci-error-text {
  margin: 0 0 12px;
  color: #dc2626;
}

.ci-retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
}

.ci-topline {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.ci-company-name {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  color: var(--text-primary);
}

.ci-updated-at {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.ci-section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.ci-section {
  padding: 18px 20px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--bg-card) 78%, var(--primary-500) 2%);
  border: 1px solid var(--border-color);
}

.ci-section--overview {
  background: linear-gradient(180deg, color-mix(in srgb, var(--primary-500) 7%, var(--bg-card)) 0%, var(--bg-card) 100%);
}

.ci-section--span-2 {
  grid-column: 1 / -1;
}

.ci-section--emphasis {
  border-color: color-mix(in srgb, var(--primary-500) 24%, var(--border-color));
  box-shadow: 0 8px 24px color-mix(in srgb, var(--primary-500) 7%, transparent);
}

.ci-section-title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
}

.ci-section-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.ci-section-text--compact {
  line-height: 1.7;
}

.ci-reference {
  border-left: 2px solid var(--primary-500);
  padding-left: 10px;
}

.ci-bullet-list,
.ci-order-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.ci-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ci-tech-chips {
  margin-top: 10px;
}

.ci-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-500) 10%, white);
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
}

.ci-chip--secondary {
  background: color-mix(in srgb, var(--accent-green) 12%, white);
  color: color-mix(in srgb, var(--accent-green) 72%, black);
}

.ci-chip--outline {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--primary-500) 26%, var(--border-color));
}

.ci-reference-panel {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed color-mix(in srgb, var(--border-color) 88%, var(--primary-500) 12%);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.ci-reference-title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.ci-reference-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  min-width: 0;
}

.ci-reference-inline-item {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.ci-reference-link {
  color: var(--primary-600);
  text-decoration: none;
}

.ci-reference-link:hover {
  text-decoration: underline;
}

.ci-reference-meta {
  margin-left: 4px;
  color: var(--text-muted);
}

@keyframes shimmerMove {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 900px) {
  .shimmer-grid,
  .ci-section-grid {
    grid-template-columns: 1fr;
  }

  .ci-section--span-2 {
    grid-column: auto;
  }

  .ci-topline {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
