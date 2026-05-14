<script setup lang="ts">
import type { InterviewJdContext, InterviewPrepConfig } from '@/components/ai/interview/types'
import { CANDIDATE_MODELS, INTERVIEWER_MODELS } from '@/config/vrmModels'
import { useAiConfigStore } from '@/stores/aiConfig'
import { computed } from 'vue'

const prepConfig = defineModel<InterviewPrepConfig>('prepConfig', { required: true })
const prepFocusInput = defineModel<string>('prepFocusInput', { required: true })

const props = defineProps<{
  jdContext: InterviewJdContext
  canConfirm: boolean
}>()

const emit = defineEmits<{
  confirm: []
  confirmAndStart: []
  close: []
  openAiConfig: []
}>()

const aiConfig = useAiConfigStore()

// 可用模型选项列表
const availableModelOptions = computed(() => {
  const options: { label: string; channelId: string; modelId: string }[] = []
  aiConfig.channels.forEach(ch => {
    if (ch.enabled === false) return
    if (ch.fetchedModels && ch.fetchedModels.length > 0) {
      ch.fetchedModels.forEach(m => {
        options.push({ label: `[${ch.name}] ${m.split('/').pop()}`, channelId: ch.id, modelId: m })
      })
    } else if (ch.modelName) {
      options.push({ label: `[${ch.name}] ${ch.modelName.split('/').pop()}`, channelId: ch.id, modelId: ch.modelName })
    }
  })
  return options
})

// 模型切换
function onModelChange(feature: 'interview' | 'tts', event: Event) {
  const val = (event.target as HTMLSelectElement).value
  if (!val) {
    aiConfig.updateModelOverride(feature, '', '')
    return
  }
  const [channelId, ...rest] = val.split('::')
  const modelId = rest.join('::')
  if (!channelId || !modelId) return
  aiConfig.updateModelOverride(feature, channelId, modelId)
}

// 难度选项
const difficultyOptions = [
  { key: 'junior' as const, label: '初级', desc: '偏基础表达与项目复述' },
  { key: 'mid' as const, label: '中级', desc: '强调追问深度与取舍说明' },
  { key: 'senior' as const, label: '高级', desc: '偏系统化表达与业务判断' },
]

// 面试官风格选项
const styleOptions = [
  { key: 'balanced' as const, label: '均衡', desc: '综合考察，节奏适中' },
  { key: 'gentle' as const, label: '温和型', desc: '引导式提问，给予鼓励' },
  { key: 'pressure' as const, label: '压力型', desc: '快节奏追问，挑战回答' },
  { key: 'technical' as const, label: '技术型', desc: '深入原理，关注实现细节' },
  { key: 'business' as const, label: '业务型', desc: '关注业务价值和用户影响' },
]

// 追问深度选项
const depthOptions = [
  { key: 1, label: '浅层', desc: '每题 1 轮追问' },
  { key: 2, label: '中等', desc: '每题 2 轮追问' },
  { key: 3, label: '深度', desc: '每题 3 轮追问' },
]

// Coaching 速度选项
const coachingSpeedOptions = [
  { key: 'fast' as const, label: '快速', desc: '轮次间隔 1 秒' },
  { key: 'normal' as const, label: '正常', desc: '轮次间隔 3 秒' },
  { key: 'slow' as const, label: '慢速', desc: '轮次间隔 5 秒，便于细读' },
]

// Coaching 轮次选项
const coachingStageOptions = [
  { key: 'full' as const, label: '全流程', desc: '4 轮完整模拟（HR→技术一面→技术二面→终面）约 26 题' },
  { key: 'hr' as const, label: 'HR 初面', desc: '软实力、动机、稳定性（6 题）' },
  { key: 'tech-1' as const, label: '技术一面', desc: '专业基础、项目复盘（7 题）' },
  { key: 'tech-2' as const, label: '技术二面', desc: '方案深度、商业思维（7 题）' },
  { key: 'final' as const, label: '终面', desc: '行业格局、价值观（6 题）' },
]

// 时长/提示步进
function adjustDuration(delta: number) {
  const next = prepConfig.value.durationMinutes + delta
  if (next >= 15 && next <= 120) prepConfig.value.durationMinutes = next
}
function adjustHintLimit(delta: number) {
  const next = prepConfig.value.hintLimit + delta
  if (next >= 1 && next <= 5) prepConfig.value.hintLimit = next
}

// 快捷音色预设（覆盖硅基流动 CosyVoice + MiniMax 的常用音色 ID）
const QUICK_VOICES = [
  { label: '清爽男声', id: 'male-qn-qingse' },
  { label: '职场女声', id: 'female-yujie' },
  { label: '沉稳男声', id: 'male-qn-jingying' },
  { label: '活力女声', id: 'female-shaonv' },
  { label: '标准播报', id: 'presenter_male' },
  { label: '默认', id: '' },
]
</script>

<template>
  <Teleport to="body">
    <div class="prep-overlay" @click.self="emit('close')">
      <section class="prep-dialog" role="dialog" aria-modal="true" aria-label="面试配置">
        <!-- 头部 -->
        <header class="prep-header">
          <div class="prep-copy">
            <h2 class="prep-title">面试参数设置</h2>
            <p class="prep-desc">定制 AI 模拟面试的引擎、难度与环境参数</p>
          </div>
          <div class="header-actions">
            <span class="job-chip" v-if="props.jdContext.targetRole">{{ props.jdContext.targetRole }}</span>
            <button class="icon-btn" type="button" aria-label="关闭" @click="emit('close')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </header>

        <!-- 主体 -->
        <div class="prep-body">
          <div class="config-grid">
            <!-- 左列：核心参数 -->
            <div class="config-col col-left">

              <!-- 交互模式 -->
              <div class="config-section">
                <div class="section-label">交互模式</div>
                <div class="section-content">
                  <div class="toggle-group toggle-group-3">
                    <button
                      class="toggle-btn"
                      :class="{ active: prepConfig.mode === 'candidate' }"
                      @click="prepConfig.mode = 'candidate'"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      <span>我来回答</span>
                    </button>
                    <button
                      class="toggle-btn"
                      :class="{ active: prepConfig.mode === 'interviewer' }"
                      @click="prepConfig.mode = 'interviewer'"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6M9 16h6M12 3C7.03 3 3 7.03 3 12v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7c0-4.97-4.03-9-9-9z"/></svg>
                      <span>我来提问</span>
                    </button>
                    <button
                      class="toggle-btn"
                      :class="{ active: prepConfig.mode === 'coaching' }"
                      @click="prepConfig.mode = 'coaching'"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                      <span>观摩学习</span>
                    </button>
                  </div>
                  <p v-if="prepConfig.mode === 'coaching'" class="mode-hint">
                    AI 同时扮演面试官和候选人，你作为旁观者学习面试技巧
                  </p>
                </div>
              </div>

              <!-- 难度等级 -->
              <div class="config-section">
                <div class="section-label">难度等级</div>
                <div class="section-content">
                  <div class="difficulty-list">
                    <button
                      v-for="item in difficultyOptions"
                      :key="item.key"
                      class="diff-btn"
                      :class="{ active: prepConfig.difficulty === item.key }"
                      @click="prepConfig.difficulty = item.key"
                    >
                      <span class="diff-name">{{ item.label }}</span>
                      <span class="diff-desc">{{ item.desc }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 面试官风格 -->
              <div class="config-section">
                <div class="section-label">面试官风格</div>
                <div class="section-content">
                  <div class="difficulty-list">
                    <button
                      v-for="item in styleOptions"
                      :key="item.key"
                      class="diff-btn"
                      :class="{ active: (prepConfig.interviewerStyle || 'balanced') === item.key }"
                      @click="prepConfig.interviewerStyle = item.key"
                    >
                      <span class="diff-name">{{ item.label }}</span>
                      <span class="diff-desc">{{ item.desc }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 追问深度 -->
              <div class="config-section">
                <div class="section-label">追问深度</div>
                <div class="section-content">
                  <div class="difficulty-list">
                    <button
                      v-for="item in depthOptions"
                      :key="item.key"
                      class="diff-btn"
                      :class="{ active: (prepConfig.followUpDepth || 2) === item.key }"
                      @click="prepConfig.followUpDepth = item.key"
                    >
                      <span class="diff-name">{{ item.label }}</span>
                      <span class="diff-desc">{{ item.desc }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 时长与提示 -->
              <div class="config-section">
                <div class="section-label">模拟参数</div>
                <div class="section-content stepper-row">
                  <div class="stepper-group">
                    <span class="stepper-name">时长</span>
                    <div class="stepper-ctrl">
                      <button class="step-btn" @click="adjustDuration(-5)">−</button>
                      <span class="step-val">{{ prepConfig.durationMinutes }}分钟</span>
                      <button class="step-btn" @click="adjustDuration(5)">+</button>
                    </div>
                  </div>
                  <div class="stepper-group">
                    <span class="stepper-name">提示</span>
                    <div class="stepper-ctrl">
                      <button class="step-btn" @click="adjustHintLimit(-1)">−</button>
                      <span class="step-val">{{ prepConfig.hintLimit }}次</span>
                      <button class="step-btn" @click="adjustHintLimit(1)">+</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Coaching 速度（仅 coaching 模式显示） -->
              <div v-if="prepConfig.mode === 'coaching'" class="config-section">
                <div class="section-label">面试轮次</div>
                <div class="section-content">
                  <div class="difficulty-list">
                    <button
                      v-for="item in coachingStageOptions"
                      :key="item.key"
                      class="diff-btn"
                      :class="{ active: (prepConfig.coachingStage || 'full') === item.key }"
                      @click="prepConfig.coachingStage = item.key"
                    >
                      <span class="diff-name">{{ item.label }}</span>
                      <span class="diff-desc">{{ item.desc }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Coaching 节奏（仅 coaching 模式显示） -->
              <div v-if="prepConfig.mode === 'coaching'" class="config-section">
                <div class="section-label">观摩节奏</div>
                <div class="section-content">
                  <div class="difficulty-list">
                    <button
                      v-for="item in coachingSpeedOptions"
                      :key="item.key"
                      class="diff-btn"
                      :class="{ active: (prepConfig.coachingSpeed || 'normal') === item.key }"
                      @click="prepConfig.coachingSpeed = item.key"
                    >
                      <span class="diff-name">{{ item.label }}</span>
                      <span class="diff-desc">{{ item.desc }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 右列：引擎、形象 & 上下文 -->
            <div class="config-col col-right">

              <!-- 引擎配置区 -->
              <div class="config-section section-accent">
                <div class="section-label">引擎配置</div>
                <div class="section-content">
                  <div class="field-row">
                    <span class="field-prefix">对话模型</span>
                    <select class="field-select" :value="aiConfig.modelOverrides['interview']?.channelId ? (aiConfig.modelOverrides['interview'].channelId + '::' + aiConfig.modelOverrides['interview'].modelId) : ''" @change="onModelChange('interview', $event)">
                      <option value="">跟随全局默认</option>
                      <option v-for="opt in availableModelOptions" :key="opt.channelId+opt.modelId" :value="opt.channelId + '::' + opt.modelId">{{ opt.label }}</option>
                    </select>
                  </div>
                  <div class="field-row">
                    <span class="field-prefix">语音合成</span>
                    <select class="field-select" :value="aiConfig.modelOverrides['tts']?.channelId ? (aiConfig.modelOverrides['tts'].channelId + '::' + aiConfig.modelOverrides['tts'].modelId) : ''" @change="onModelChange('tts', $event)">
                      <option value="">跟随全局默认</option>
                      <option v-for="opt in availableModelOptions" :key="opt.channelId+opt.modelId" :value="opt.channelId + '::' + opt.modelId">{{ opt.label }}</option>
                    </select>
                  </div>
                  <div class="field-row">
                    <span class="field-prefix">语音音色</span>
                    <input
                      class="field-input"
                      v-model="prepConfig.voice"
                      placeholder="如 male-qn-qingse"
                    />
                  </div>
                  <div class="voice-tags">
                    <button
                      v-for="v in QUICK_VOICES"
                      :key="v.id"
                      class="voice-tag"
                      :class="{ active: prepConfig.voice === v.id }"
                      @click="prepConfig.voice = v.id"
                    >{{ v.label }}</button>
                  </div>
                </div>
              </div>

              <!-- 面试官形象 -->
              <div class="config-section">
                <div class="section-label">面试官形象</div>
                <div class="section-content">
                  <div class="persona-row">
                    <button
                      v-for="model in INTERVIEWER_MODELS"
                      :key="model.id"
                      class="persona-chip"
                      :class="{ active: prepConfig.interviewerModelId === model.id }"
                      @click="prepConfig.interviewerModelId = model.id"
                    >{{ model.name }}</button>
                  </div>
                </div>
              </div>

              <!-- 候选人形象 -->
              <div class="config-section">
                <div class="section-label">候选人形象</div>
                <div class="section-content">
                  <div class="persona-row">
                    <button
                      v-for="model in CANDIDATE_MODELS"
                      :key="model.id"
                      class="persona-chip"
                      :class="{ active: prepConfig.candidateModelId === model.id }"
                      @click="prepConfig.candidateModelId = model.id"
                    >{{ model.name }}</button>
                  </div>
                </div>
              </div>

              <!-- 考察重点 -->
              <div class="config-section flex-fill">
                <div class="section-label">考察重点与上下文</div>
                <div class="section-content flex-fill-inner">
                  <div class="text-block">
                    <label class="text-label">面试重点方向</label>
                    <textarea
                      v-model="prepFocusInput"
                      class="config-textarea"
                      placeholder="如：系统设计、React 性能优化、高并发架构..."
                    />
                  </div>
                  <div class="text-block">
                    <label class="text-label">补充要求</label>
                    <textarea
                      v-model="prepConfig.customNote"
                      class="config-textarea"
                      placeholder="面试风格要求、简历中需要重点关注的细节..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部 -->
        <footer class="prep-footer">
          <span class="footer-hint">设置会自动保存并应用到下一场模拟面试</span>
          <div class="footer-actions">
            <button class="footer-btn footer-btn-secondary" @click="emit('confirm')">保存设置</button>
            <button class="footer-btn" @click="emit('confirmAndStart')">保存并进入</button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* ═══════════════════════════════════════════════
   PrepConfigDialog — 使用全局 Design Token
   ═══════════════════════════════════════════════ */

/* 遮罩层 */
.prep-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-overlay);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* 弹窗容器 */
.prep-dialog {
  width: min(960px, calc(100vw - 48px));
  max-height: min(88vh, 820px);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-color-strong);
  background: var(--bg-card);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  font-family: var(--font-sans);
}

/* ──── 头部 ──── */
.prep-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}
.prep-copy { display: flex; flex-direction: column; gap: 2px; }
.prep-title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.prep-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.header-actions { display: flex; align-items: center; gap: 12px; }
.job-chip {
  padding: 4px 10px;
  background: var(--primary-50);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  color: var(--primary-600);
  letter-spacing: 0.02em;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-color);
}

/* ──── 主体 ──── */
.prep-body {
  flex: 1;
  overflow-y: auto;
}
.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100%;
}
.config-col { display: flex; flex-direction: column; }
.col-left { border-right: 1px solid var(--border-color); }

/* ──── Section 通用 ──── */
.config-section {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-color);
}
.config-section:last-child { border-bottom: none; }
.section-accent {
  background: linear-gradient(135deg, var(--primary-50) 0%, transparent 100%);
}
.section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.section-content { display: flex; flex-direction: column; gap: 10px; }

/* ──── Field Row (引擎配置) ──── */
.field-row {
  display: flex;
  align-items: center;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--transition-fast);
}
.field-row:focus-within {
  border-color: var(--primary-500);
  box-shadow: var(--focus-ring);
}
.field-prefix {
  padding: 9px 14px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  background: var(--bg-card-muted);
  border-right: 1px solid var(--border-color);
  white-space: nowrap;
  min-width: 78px;
  text-align: center;
}
.field-select,
.field-input {
  flex: 1;
  border: none;
  padding: 9px 14px;
  font-size: 13px;
  color: var(--text-primary);
  background: transparent;
  outline: none;
  cursor: pointer;
  font-family: var(--font-sans);
}
.field-input { cursor: text; }
.field-input::placeholder { color: var(--text-muted); }

/* 快捷音色标签 */
.voice-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}
.voice-tag {
  padding: 4px 10px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.voice-tag:hover {
  background: var(--bg-hover);
  color: var(--primary-600);
  border-color: var(--border-accent);
}
.voice-tag.active {
  background: var(--primary-500);
  border-color: var(--primary-500);
  color: var(--text-inverse);
}

/* ──── Toggle Group (模式切换) ──── */
.toggle-group { display: flex; gap: 10px; }
.toggle-group-3 { gap: 8px; }
.toggle-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 0;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.toggle-group-3 .toggle-btn { padding: 10px 6px; font-size: 12px; gap: 5px; }
.toggle-btn:hover {
  border-color: var(--border-accent);
  color: var(--primary-600);
}
.toggle-btn.active {
  background: var(--bg-card);
  border-color: var(--primary-500);
  color: var(--primary-600);
  box-shadow: 0 2px 8px rgba(43, 123, 184, 0.12);
}
.mode-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* ──── Difficulty List ──── */
.difficulty-list { display: flex; flex-direction: column; gap: 8px; }
.diff-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.diff-btn:hover {
  border-color: var(--border-accent);
  background: var(--primary-50);
}
.diff-btn.active {
  border-color: var(--primary-500);
  background: var(--primary-50);
  box-shadow: 0 2px 8px rgba(43, 123, 184, 0.1);
}
.diff-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}
.diff-desc {
  font-size: 12px;
  color: var(--text-muted);
}

/* ──── Stepper ──── */
.stepper-row { flex-direction: row !important; gap: 16px !important; }
.stepper-group {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 8px 12px;
}
.stepper-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  min-width: 28px;
}
.stepper-ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.step-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 15px;
  color: var(--primary-500);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.step-btn:hover {
  background: var(--primary-50);
  border-color: var(--primary-500);
}
.step-val {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 48px;
  text-align: center;
}

/* ──── 右列：Textarea ──── */
.flex-fill { flex: 1; }
.flex-fill-inner { flex: 1; display: flex; flex-direction: column; gap: 12px; }
.text-block { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.text-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.config-textarea {
  flex: 1;
  width: 100%;
  min-height: 90px;
  padding: 12px 14px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  resize: none;
  outline: none;
  transition: all var(--transition-fast);
}
.config-textarea::placeholder { color: var(--text-muted); }
.config-textarea:focus {
  border-color: var(--primary-500);
  box-shadow: var(--focus-ring);
  background: var(--bg-card);
}

/* ──── Persona Chips ──── */
.persona-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.persona-chip {
  padding: 7px 14px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.persona-chip:hover {
  border-color: var(--border-accent);
  color: var(--primary-600);
}
.persona-chip.active {
  background: var(--primary-500);
  border-color: var(--primary-500);
  color: var(--text-inverse);
}

/* ──── 底部 ──── */
.prep-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 28px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}
.footer-hint {
  font-size: 12px;
  color: var(--text-muted);
}
.footer-actions {
  display: flex;
  gap: 10px;
}
.footer-btn {
  padding: 9px 24px;
  background: var(--primary-500);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(43, 123, 184, 0.25);
  transition: all var(--transition-fast);
}
.footer-btn:hover {
  background: var(--primary-600);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(43, 123, 184, 0.35);
}
.footer-btn-secondary {
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  box-shadow: none;
}
.footer-btn-secondary:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-color-strong);
  transform: none;
  box-shadow: none;
}

/* ──── 响应式 ──── */
@media (max-width: 768px) {
  .config-grid { grid-template-columns: 1fr; }
  .col-left { border-right: none; border-bottom: 1px solid var(--border-color); }
}
</style>
