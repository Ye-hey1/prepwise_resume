<script setup lang="ts">
import { computed } from 'vue'
import { extractJD } from '@/services/jdService'
import type { AiConfig } from '@/services/jdService'
import { useAiConfigStore } from '@/stores/aiConfig'
import type { JDData, JDRequirementItem } from '@/services/types/jd'

const props = defineProps<{
  config: AiConfig
  jdText: string
  targetCompany: string
  targetPosition: string
  jdData: JDData | null
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:jdText', value: string): void
  (e: 'update:targetCompany', value: string): void
  (e: 'update:targetPosition', value: string): void
  (e: 'parsed', data: JDData): void
  (e: 'reset-analysis'): void
  (e: 'loading-change', loading: boolean, label: string): void
  (e: 'error', msg: string): void
}>()

const aiConfigStore = useAiConfigStore()

const canParse = computed(() => props.jdText.trim().length >= 50 && !props.isLoading)
const topMustHave = computed(() => (props.jdData?.requirements.mustHave ?? []).slice(0, 4))
const topTechStack = computed(() => (props.jdData?.requirements.techStack ?? []).slice(0, 8))

const compactSections = computed(() => {
  if (!props.jdData) return []

  return [
    {
      key: 'mustHave',
      title: '核心硬性要求',
      items: props.jdData.requirements.mustHave.map((item) => requirementText(item)),
    },
    {
      key: 'niceToHave',
      title: '加分项',
      items: props.jdData.requirements.niceToHave.map((item) => requirementText(item)),
    },
    {
      key: 'jobDuties',
      title: '岗位职责',
      items: props.jdData.requirements.jobDuties,
    },
  ].filter((section) => section.items.length > 0)
})

const infoStats = computed(() => {
  if (!props.jdData) return []

  return [
    { label: '硬性要求', value: `${props.jdData.requirements.mustHave.length}`, unit: '条' },
    { label: '技术栈', value: `${props.jdData.requirements.techStack.length}`, unit: '项' },
    { label: '岗位职责', value: `${props.jdData.requirements.jobDuties.length}`, unit: '项' },
  ]
})

function requirementText(item: string | JDRequirementItem): string {
  return typeof item === 'string' ? item : item.text
}

async function handleParse() {
  if (!aiConfigStore.isConfigured && !props.config?.apiToken) {
    emit('error', '请先配置 AI 接口')
    return
  }

  emit('loading-change', true, '阶段 1/4：正在提取 JD 结构化信息...')

  try {
    const result = await extractJD(
      props.config,
      props.jdText,
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (msg) => { throw new Error(msg) },
      },
    )

    emit('parsed', result)
  } catch (error) {
    emit('error', error instanceof Error ? error.message : 'JD 解析失败')
  } finally {
    emit('loading-change', false, '')
  }
}
</script>

<template>
  <div class="jd-input-tab">
    <!-- ═══ 输入态 ═══ -->
    <section v-if="!jdData" class="input-stage">
      <!-- 标题区 -->
      <div class="input-header" style="--stagger: 0">
        <div class="header-left">
          <span class="kicker-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
            岗位录入
          </span>
          <h3 class="input-title">输入目标岗位信息</h3>
          <p class="input-subtitle">先确认公司、岗位和完整 JD，后续的匹配、备面和优化都会基于这份输入展开。</p>
        </div>
        <div class="input-meta">
          <span class="meta-chip">{{ jdText.length }} 字</span>
          <span class="meta-chip" :class="{ ready: canParse }">
            <span class="meta-dot" :class="{ active: canParse }"></span>
            {{ canParse ? '可解析' : '至少 50 字' }}
          </span>
        </div>
      </div>

      <!-- 基础信息输入 -->
      <div class="base-grid" style="--stagger: 1">
        <label class="field-card">
          <span class="field-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
            目标公司
          </span>
          <input
            class="field-input"
            :value="targetCompany"
            type="text"
            placeholder="例如：字节跳动"
            @input="emit('update:targetCompany', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="field-card">
          <span class="field-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            目标岗位
          </span>
          <input
            class="field-input"
            :value="targetPosition"
            type="text"
            placeholder="例如：后端开发工程师"
            @input="emit('update:targetPosition', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>

      <!-- JD 文本区 -->
      <label class="textarea-shell" style="--stagger: 2">
        <span class="field-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          完整 JD
        </span>
        <textarea
          class="jd-textarea"
          :value="jdText"
          rows="14"
          placeholder="粘贴完整职位描述，尽量保留职责、技术栈、经验要求、学历要求、加分项和业务背景。"
          @input="emit('update:jdText', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>

      <!-- 解析按钮 -->
      <div class="input-actions" style="--stagger: 3">
        <button class="btn-cta" :disabled="!canParse" @click="handleParse">
          <span>{{ isLoading ? '解析中...' : '解析 JD' }}</span>
          <span class="btn-arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </span>
        </button>
      </div>
    </section>

    <!-- ═══ 解析结果态 ═══ -->
    <section v-else class="parsed-stage">
      <div class="result-header">
        <div class="result-info">
          <span class="kicker-pill success">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
            解析完成
          </span>
          <h3 class="result-job">{{ targetPosition || jdData.basicInfo.jobTitle || '目标岗位' }}</h3>
          <p class="result-meta">
            <span v-if="targetCompany || jdData.basicInfo.company">{{ targetCompany || jdData.basicInfo.company }}</span>
            <span v-if="jdData.basicInfo.location">· {{ jdData.basicInfo.location }}</span>
            <span v-if="jdData.requirements.experience">· {{ jdData.requirements.experience }}</span>
            <span v-if="jdData.requirements.degree">· {{ jdData.requirements.degree }}</span>
          </p>
        </div>

        <div class="result-actions">
          <button class="btn-ghost" @click="handleParse">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
            重新解析
          </button>
          <button class="btn-ghost" @click="emit('reset-analysis')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            重新输入
          </button>
        </div>
      </div>

      <div class="parsed-scroll-body">
        <!-- 统计数字行 -->
        <div class="result-stats">
          <div v-for="item in infoStats" :key="item.label" class="stat-item">
            <div class="stat-number">
              <strong class="stat-val">{{ item.value }}</strong>
              <span class="stat-unit">{{ item.unit }}</span>
            </div>
            <span class="stat-key">{{ item.label }}</span>
          </div>
        </div>

        <!-- 标签与核心要求 -->
        <div v-if="topTechStack.length || topMustHave.length" class="result-highlights">
          <div v-if="topTechStack.length" class="highlight-section">
            <span class="highlight-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              技术栈
            </span>
            <div class="tag-list">
              <span v-for="tech in topTechStack" :key="tech" class="tag tech">{{ tech }}</span>
            </div>
          </div>

          <div v-if="topMustHave.length" class="highlight-section">
            <span class="highlight-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
              核心硬性要求
            </span>
            <div class="must-list">
              <span v-for="(item, index) in topMustHave" :key="`${requirementText(item)}-${index}`" class="must-item">
                {{ requirementText(item) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 展开详情 -->
        <details class="detail-section">
          <summary class="detail-summary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            展开查看完整岗位职责与加分项
          </summary>
          <div class="detail-body">
            <div class="detail-grid">
              <section v-for="section in compactSections" :key="section.key" class="detail-block">
                <h5 class="detail-block-title">{{ section.title }}</h5>
                <ul class="detail-list">
                  <li v-for="(item, index) in section.items" :key="`${section.key}-${index}`">{{ item }}</li>
                </ul>
              </section>
            </div>
          </div>
        </details>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ═══ 动画基础 ═══ */
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(16px); filter: blur(4px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.jd-input-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
}

/* ═══ 入场级联动画 ═══ */
.input-stage > [style*="--stagger"] {
  animation: fadeSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  animation-delay: calc(var(--stagger) * 80ms);
}

/* ═══ 输入态 / 结果态公共 ═══ */
.input-stage,
.parsed-stage {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
}

/* ═══ 标题区（不对称布局） ═══ */
.input-header,
.result-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.header-left {
  flex: 1;
  min-width: 0;
}

/* ═══ Kicker Pill（去 Emoji，用 SVG） ═══ */
.kicker-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  /* Liquid Glass：内阴影 + hairline 边框 */
  background: color-mix(in srgb, var(--primary-500) 6%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--primary-500) 12%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.15);
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.kicker-pill.success {
  background: color-mix(in srgb, var(--accent-green) 8%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-green) 16%, transparent);
  color: var(--accent-green);
}

.kicker-pill svg {
  flex-shrink: 0;
  opacity: 0.7;
}

/* ═══ 精致排版（tracking-tight） ═══ */
.input-title,
.result-job {
  margin: 10px 0 6px;
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.input-subtitle,
.result-meta {
  margin: 0;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-secondary);
  max-width: 58ch;
}

/* ═══ Meta Chips ═══ */
.input-meta {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.meta-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.meta-dot.active {
  background: var(--accent-green);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent-green) 40%, transparent);
}

.meta-chip.ready {
  background: color-mix(in srgb, var(--accent-green) 6%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-green) 18%, transparent);
  color: var(--accent-green);
}

/* ═══ 基础信息网格 ═══ */
.base-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

/* ═══ Double-Bezel 输入卡片 ═══ */
.field-card,
.textarea-shell {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.field-label svg {
  opacity: 0.5;
}

.field-input,
.jd-textarea {
  width: 100%;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  /* Liquid Glass 内阴影 */
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.field-input {
  min-height: 48px;
  padding: 0 18px;
  font-size: 14px;
}

.jd-textarea {
  min-height: 320px;
  padding: 18px;
  resize: vertical;
  line-height: 1.8;
  font-size: 14px;
}

.field-input:focus,
.jd-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--primary-500) 40%, transparent);
  background: var(--surface-white);
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--primary-500) 8%, transparent),
    inset 0 1px 0 rgba(255,255,255,0.2);
  transform: scale(1.003);
}

/* ═══ 提示卡——左侧强调线差异化 ═══ */
.hint-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.hint-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 18px;
  border-radius: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--accent-line, var(--primary-500));
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.hint-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.04);
}

.hint-card strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.hint-card span {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.65;
}

/* ═══ CTA 按钮（高端风格） ═══ */
.input-actions,
.result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 0 8px 0 24px;
  border-radius: var(--radius-full);
  border: none;
  background: linear-gradient(135deg, var(--primary-500), var(--primary-700));
  color: var(--text-inverse);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow:
    0 8px 20px color-mix(in srgb, var(--primary-500) 25%, transparent),
    inset 0 1px 0 rgba(255,255,255,0.12);
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-cta:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 14px 32px color-mix(in srgb, var(--primary-500) 30%, transparent),
    inset 0 1px 0 rgba(255,255,255,0.15);
}

/* 物理按压反馈 */
.btn-cta:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--primary-500) 20%, transparent);
}

.btn-cta:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

/* Button-in-Button 箭头圆 */
.btn-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-cta:hover:not(:disabled) .btn-arrow {
  background: rgba(255,255,255,0.22);
  transform: translateX(2px);
}

/* ═══ Ghost 按钮 ═══ */
.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-ghost svg {
  opacity: 0.6;
  transition: opacity 0.2s;
}

.btn-ghost:hover {
  border-color: color-mix(in srgb, var(--primary-500) 30%, transparent);
  color: var(--primary-600);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.04);
}

.btn-ghost:hover svg {
  opacity: 1;
}

.btn-ghost:active {
  transform: translateY(0) scale(0.98);
}

/* ═══ 滚动区域 ═══ */
.parsed-scroll-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;
}

/* ═══ 统计数字行（tabular-nums） ═══ */
.result-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px;
  border-radius: 18px;
  /* Double-Bezel 外壳 */
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow:
    0 4px 16px rgba(0,0,0,0.03),
    inset 0 1px 0 rgba(255,255,255,0.12);
}

.stat-number {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.stat-val {
  font-size: 28px;
  font-weight: 800;
  color: var(--primary-600);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.stat-unit {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

.stat-key {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

/* ═══ 标签 / 核心要求 ═══ */
.result-highlights {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 14px;
}

.highlight-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
}

.highlight-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.highlight-label svg {
  opacity: 0.5;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 700;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.tag.tech {
  background: color-mix(in srgb, var(--primary-500) 8%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--primary-500) 14%, transparent);
  color: var(--primary-600);
}

.tag.tech:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--primary-500) 12%, transparent);
}

.must-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.must-item {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-primary);
  padding-left: 14px;
  position: relative;
}

.must-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--primary-500);
  opacity: 0.5;
}

/* ═══ 展开详情 ═══ */
.detail-section {
  border-radius: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.detail-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  transition: color 0.2s;
}

.detail-summary:hover {
  color: var(--text-primary);
}

.detail-summary svg {
  opacity: 0.5;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

details[open] .detail-summary svg {
  transform: rotate(180deg);
}

.detail-body {
  padding: 0 20px 20px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-block-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.detail-list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-list li {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
}

/* ═══ 响应式 ═══ */
@media (max-width: 960px) {
  .base-grid,
  .hint-grid,
  .result-stats,
  .result-highlights,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .input-header,
  .result-header {
    flex-direction: column;
  }

  .input-meta,
  .result-actions {
    width: 100%;
  }

  .input-actions {
    justify-content: stretch;
  }

  .btn-cta {
    width: 100%;
    justify-content: center;
  }
}
</style>
