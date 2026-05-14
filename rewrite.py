import re

with open(r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\AiInterviewerPanel.vue', 'r', encoding='utf-8') as f:
    content = f.read()

template_index = content.find('<template>')
if template_index != -1:
    content = content[:template_index]

new_content = """<template>
  <section
    class="ai-interviewer-panel"
    :class="[
      `phase-${session.workflowPhase.value}`,
      { 'immersive-mode': isImmersive },
    ]"
  >
    <!-- 全局 Error 提示 -->
    <div v-if="session.errorMsg.value || jd.errorMsg.value" class="global-error-toast">
      <div class="err-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
      </div>
      <div class="err-text">{{ session.errorMsg.value || jd.errorMsg.value }}</div>
      <button class="err-close" @click="session.errorMsg.value = ''; jd.errorMsg.value = ''">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <!-- 非沉浸式工作台 (Dashboard 风格) -->
    <template v-if="!isImmersive">
      <div class="dashboard-layout custom-scroll">
        <!-- 统一风格的顶部横条 -->
        <header class="ds-header-bar">
          <div class="ds-hb-left">
            <div class="ds-hb-tag">AI INTERVIEW</div>
            <h1 class="ds-hb-title">面试演练工作台</h1>
            <div class="ds-hb-divider"></div>
            <div class="ds-hb-meta-item">
              <span class="lbl">目标岗位</span>
              <strong class="val">{{ jd.jdContext.value.targetRole || '未解析' }}</strong>
            </div>
            <div class="ds-hb-meta-item">
              <span class="lbl">选用模型</span>
              <strong class="val">{{ modelDisplayName }}</strong>
            </div>
          </div>

          <div class="ds-hb-right">
            <!-- 阶段流水线状态指示器 -->
            <div class="phase-tracker">
              <div
                v-for="(item, idx) in phaseItems"
                :key="item.key"
                class="phase-step"
                :class="{
                  active: session.workflowPhase.value === item.key,
                  done: idx < currentPhaseIndex,
                  clickable: item.key === 'analysis'
                    || (item.key === 'simulation' && session.canEnterPrep.value)
                    || item.key === 'training'
                }"
                @click="handleGoToPhase(item.key)"
              >
                <div class="step-dot">{{ idx < currentPhaseIndex ? '✓' : item.icon }}</div>
                <span class="step-label">{{ item.label }}</span>
                <div v-if="idx < phaseItems.length - 1" class="step-line"></div>
              </div>
            </div>
            
            <button class="ds-hb-btn ghost" type="button" @click="showAiConfig = true">
              设置模型
            </button>
            <button
              v-if="session.workflowPhase.value === 'analysis'"
              class="ds-hb-btn primary"
              :disabled="!session.canEnterPrep.value"
              type="button"
              @click="handleOpenPrepDialog"
            >
              配置这轮面试
            </button>
            <button
              v-else-if="session.workflowPhase.value === 'training'"
              class="ds-hb-btn primary"
              type="button"
              @click="handleStartNewRound"
            >
              开始新一轮
            </button>
          </div>
        </header>

        <!-- 主内容区：Hero Section 卡片风格 -->
        <div class="ds-hero-section iv-stage-wrapper">
          <Transition name="fade-slide" mode="out-in">
            <!-- 阶段 1：解析准备 -->
            <JdAnalysisStage
              v-if="session.isAnalysisPhase.value"
              v-model:jdDraft="jd.jdDraft.value"
              :can-analyze="jd.jdDraft.value.trim() !== '' && !jd.isLoading.value"
              :has-existing-jd="jd.hasStoredJdContext.value"
              :existing-jd-summary="jd.storedJdSummary.value"
              :jd-context="jd.jdContext.value"
              :can-start-interview="session.canEnterPrep.value"
              :history-records="history.historyRecords.value"
              @analyze="handleJdAnalyze"
              @skip="handleSkipJd"
              @reuse-existing="handleReuseStoredJd"
              @start-interview="handleOpenPrepDialog"
              @view-history="handleViewHistory"
              @delete-history="handleDeleteHistory"
            />
            
            <!-- 阶段 3：训练复盘区 -->
            <section v-else-if="session.isTrainingPhase.value" class="iv-training-workbench">
              <header class="training-header">
                <h2>专项训练与复盘</h2>
                <div class="iv-training-tabs">
                  <button
                    class="iv-training-tab"
                    :class="{ active: trainingTab === 'drill' }"
                    type="button"
                    @click="trainingTab = 'drill'"
                  >
                    专项训练
                  </button>
                  <button
                    class="iv-training-tab"
                    :class="{ active: trainingTab === 'review' }"
                    type="button"
                    @click="trainingTab = 'review'"
                  >
                    面试复盘
                  </button>
                </div>
              </header>

              <div class="training-content-wrapper">
                <InterviewDrillPanel
                  v-if="trainingTab === 'drill'"
                  :questions="session.drillQuestions.value"
                  :is-loading="session.drillLoading.value"
                  :error-msg="session.errorMsg.value"
                  :can-start="canGenerateDrill"
                  @generate="session.handleGenerateDrill"
                  @submit="(answers) => session.handleDrillSubmit(answers)"
                  @back="handleBackToAnalysis"
                />

                <InterviewReviewPanel
                  v-else
                  :review-data="session.reviewData.value"
                  :review-modules-text="reviewModulesText"
                  @back="handleBackToSimulation"
                  @restart="handleStartNewRound"
                  @optimize="handleOptimizeResumeFromReview"
                />
              </div>
            </section>
          </Transition>
        </div>
      </div>
    </template>

    <!-- 沉浸式模拟面试工作台 -->
    <template v-else-if="session.isSimulationPhase.value">
      <header class="immersive-topbar">
        <div class="topbar-left">
          <div class="topbar-tag">SIMULATION</div>
          <span class="topbar-role-badge" :class="{ interviewer: session.mode.value === 'interviewer' }">
            {{ session.mode.value === 'candidate' ? '面试者模式' : '面试官模式' }}
          </span>
          <span class="topbar-divider">|</span>
          <span class="topbar-position">{{ jd.jdContext.value.targetRole || '未识别岗位' }}</span>
        </div>

        <div class="topbar-center">
          <span class="topbar-timer" :class="{ warning: timer.remainingSeconds.value < 300 && timer.remainingSeconds.value > 0 }">
            {{ timer.timerText.value }}
          </span>
          <span class="topbar-round">第 {{ session.currentRound.value }} 轮</span>
        </div>

        <div class="topbar-right">
          <button class="topbar-action-btn" type="button" @click="session.showResumePreview.value = !session.showResumePreview.value">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            {{ session.showResumePreview.value ? '收起简历' : '查看简历' }}
          </button>
          <button class="topbar-action-btn" type="button" @click="showAiConfig = true">
            模型: {{ modelDisplayName }}
          </button>
          <button class="topbar-action-btn muted" type="button" @click="handleBackToAnalysis">
            返回准备
          </button>
          <button class="topbar-action-btn primary" type="button" :disabled="!session.canReview.value" @click="handleOpenReview">
            结束并复盘
          </button>
        </div>
      </header>

      <div
        v-if="session.finalEvaluation.value"
        class="final-banner"
        :class="{ pass: session.finalEvaluation.value.passed, fail: !session.finalEvaluation.value.passed }"
      >
        <span class="score-main">综合评分 <strong>{{ session.finalEvaluation.value.totalScore }}</strong> 分</span>
        <span class="score-badge">{{ session.finalEvaluation.value.passed ? '建议通过' : '待提升' }}</span>
        <span class="score-details">
          项目: {{ session.finalEvaluation.value.projectScore }} / 
          技能: {{ session.finalEvaluation.value.skillScore }} / 
          工作: {{ session.finalEvaluation.value.workScore }} / 
          教育: {{ session.finalEvaluation.value.educationScore }}
        </span>
      </div>

      <div class="immersive-workspace">
        <InterviewSimulationPanel
          :embedded="true"
          :mode="session.mode.value"
          :interviewer-model-id="session.prepConfig.value.interviewerModelId"
          :candidate-model-id="session.prepConfig.value.candidateModelId"
          :messages="session.messages.value"
          :is-loading="session.isLoading.value"
          :error-msg="session.errorMsg.value"
          :input-text="session.inputText.value"
          :can-send="session.canSend.value"
          :is-listening="voice.isListening.value"
          :streaming-assistant-message-id="session.streamingAssistantMessageId.value"
          :session-started="timer.sessionStarted.value"
          :timer-text="timer.timerText.value"
          :timer-status-text="timer.timerStatusText.value"
          :current-round="session.currentRound.value"
          :user-turns="session.userTurns.value"
          :assistant-turns="session.assistantTurns.value"
          :can-start="session.canStart.value"
          :can-finish="session.canFinish.value"
          :timer-running="timer.timerRunning.value"
          :hint-data="hint.hintData.value"
          :hint-count="hint.hintCount.value"
          :max-hints="hint.hintLimit.value"
          :is-hinting="hint.isHinting.value"
          :is-tts-playing="session.isTtsPlaying.value"
          @update:input-text="(value) => { session.inputText.value = value }"
          @start="session.handleStart"
          @toggle-pause="session.handleTogglePause"
          @finish="session.handleFinish"
          @reset="handleResetAll"
          @adjust-duration="timer.adjustDuration"
          @send="session.handleSend"
          @toggle-voice="voice.toggleVoice"
          @request-hint="handleRequestHint"
          @dismiss-hint="hint.dismissHint"
          @use-opener="handleUseOpener"
        />

        <ResumePreviewOverlay
          v-if="session.showResumePreview.value"
          @close="session.showResumePreview.value = false"
        />
      </div>
    </template>

    <AiConfigDialog v-if="showAiConfig" @close="showAiConfig = false" />

    <PrepConfigDialog
      v-if="showPrepDialog"
      v-model:prep-config="session.prepConfig.value"
      v-model:prep-focus-input="session.prepFocusInput.value"
      :jd-context="jd.jdContext.value"
      :can-confirm="session.prepConfigValid.value"
      @confirm="handleConfirmPrepDialog"
      @close="showPrepDialog = false"
    />

    <Teleport to="body">
      <Transition name="restore-fade">
        <div v-if="showRestoreDialog" class="restore-overlay" @click.self="handleRestoreCancel">
          <div class="restore-dialog">
            <div class="restore-icon">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2" opacity="0.15" />
                <path d="M14 20a6 6 0 0 1 11.3-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <path d="M26 17.2V20h-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <h3 class="restore-title">发现未完成的模拟面试</h3>
            <p class="restore-desc">检测到上一轮会话未完成，是否恢复之前的面试进度？</p>
            <div class="restore-actions">
              <button
                class="restore-btn restore-btn--cancel"
                @click="handleRestoreCancel"
              >
                放弃进度
              </button>
              <button
                class="restore-btn restore-btn--confirm"
                @click="handleRestoreConfirm"
              >
                继续面试
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
@import '@/assets/interview-tokens.css';

/* 全局布局 */
.ai-interviewer-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  background: var(--bg-card);
  color: var(--text-primary);
  overflow: hidden;
  position: relative;
}

.dashboard-layout {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px 24px;
  min-height: 0;
  gap: 24px;
}

/* 顶部 Dashboard 横条 */
.ds-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
}

.ds-hb-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.ds-hb-tag {
  background: var(--primary-500);
  color: #fff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  font-family: 'Inter', monospace;
}

.ds-hb-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}

.ds-hb-divider {
  width: 1px;
  height: 24px;
  background: var(--border-color);
  margin: 0 8px;
}

.ds-hb-meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ds-hb-meta-item .lbl { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
.ds-hb-meta-item .val { font-size: 13px; color: var(--text-primary); font-weight: 700; }

.ds-hb-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* 阶段流水线 */
.phase-tracker {
  display: flex;
  align-items: center;
  background: var(--bg-card-muted);
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  margin-right: 16px;
}

.phase-step {
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0.5;
  transition: all 0.3s ease;
}

.phase-step.clickable { cursor: pointer; }
.phase-step.clickable:hover { opacity: 0.8; }
.phase-step.active { opacity: 1; }
.phase-step.done { opacity: 0.8; }

.step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 800;
}
.phase-step.active .step-dot {
  background: var(--primary-500);
  border-color: var(--primary-500);
  color: #fff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}
.phase-step.done .step-dot {
  color: var(--primary-500);
  border-color: var(--primary-500);
}

.step-label {
  font-size: 13px;
  font-weight: 700;
}

.step-line {
  width: 24px;
  height: 2px;
  background: var(--border-color);
  margin: 0 8px;
  border-radius: 2px;
}
.phase-step.done .step-line {
  background: var(--primary-500);
}

/* 按钮 */
.ds-hb-btn {
  height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.ds-hb-btn.primary {
  background: var(--primary-500);
  color: #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}
.ds-hb-btn.primary:disabled {
  opacity: 0.5; cursor: not-allowed; box-shadow: none;
}
.ds-hb-btn.primary:not(:disabled):hover {
  background: var(--primary-600);
  transform: translateY(-1px);
}

.ds-hb-btn.ghost {
  background: transparent;
  border-color: var(--border-color);
  color: var(--text-secondary);
}
.ds-hb-btn.ghost:hover {
  background: var(--bg-card-muted);
  color: var(--text-primary);
}

/* 主容器舞台 */
.iv-stage-wrapper {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 训练复盘 Header */
.iv-training-workbench {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.training-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.training-header h2 {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}

.iv-training-tabs {
  display: inline-flex;
  background: var(--bg-card-muted);
  border-radius: 12px;
  padding: 4px;
  border: 1px solid var(--border-color);
}

.iv-training-tab {
  height: 36px;
  padding: 0 24px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.iv-training-tab.active {
  background: var(--bg-card);
  color: var(--primary-500);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

/* 沉浸式 Topbar */
.immersive-mode {
  background: var(--bg-card);
}

.immersive-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  z-index: 10;
}

.topbar-left, .topbar-center, .topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topbar-tag {
  background: var(--primary-50);
  color: var(--primary-600);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  border: 1px solid var(--primary-100);
}

.topbar-role-badge {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.topbar-divider { color: var(--border-color); }
.topbar-position { font-size: 13px; color: var(--text-secondary); font-weight: 600; }

.topbar-timer {
  font-size: 16px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: var(--bg-card-muted);
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
.topbar-timer.warning {
  color: #ea580c;
  background: #fff7ed;
  border-color: #fdba74;
}

.topbar-round {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 700;
  padding: 6px 12px;
  background: var(--bg-card-muted);
  border-radius: 8px;
}

.topbar-action-btn {
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.topbar-action-btn:hover:not(:disabled) {
  background: var(--bg-card-muted);
  color: var(--text-primary);
}

.topbar-action-btn.primary {
  background: var(--primary-500);
  color: #fff;
  border-color: var(--primary-500);
}
.topbar-action-btn.primary:hover:not(:disabled) {
  background: var(--primary-600);
  transform: translateY(-1px);
}

.immersive-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

.immersive-workspace > :first-child {
  flex: 1;
  min-height: 0;
}

/* Error Banner */
.global-error-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px auto;
  max-width: 600px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.1);
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
}
.err-icon svg, .err-close svg {
  width: 18px; height: 18px;
}
.err-close {
  background: none; border: none; color: inherit; cursor: pointer; padding: 4px; opacity: 0.7; margin-left: auto;
}
.err-close:hover { opacity: 1; }

/* 沉浸模式分数栏 */
.final-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 16px 24px 0;
  padding: 16px 20px;
  border-radius: 16px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
}
.final-banner.pass {
  background: rgba(16, 185, 129, 0.05);
  border-color: rgba(16, 185, 129, 0.2);
}
.final-banner.fail {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.2);
}

.score-main { font-size: 16px; color: var(--text-primary); font-weight: 600; }
.score-main strong { font-size: 20px; font-weight: 900; }
.score-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  background: #fff;
  border: 1px solid var(--border-color);
}
.final-banner.pass .score-badge { color: #059669; border-color: #059669; }
.final-banner.fail .score-badge { color: #dc2626; border-color: #dc2626; }

.score-details {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}

/* 恢复弹窗 */
.restore-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
}

.restore-dialog {
  width: 420px;
  padding: 32px;
  border-radius: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.restore-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--primary-50);
  color: var(--primary-500);
}

.restore-title {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
}

.restore-desc {
  margin: 0 0 28px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.restore-actions {
  display: flex;
  gap: 12px;
}

.restore-btn {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.restore-btn--cancel {
  background: var(--bg-card-muted);
  border-color: var(--border-color);
  color: var(--text-secondary);
}
.restore-btn--cancel:hover { background: #e2e8f0; }

.restore-btn--confirm {
  background: var(--primary-500);
  color: #fff;
}
.restore-btn--confirm:hover { background: var(--primary-600); transform: translateY(-1px); }

/* 动画过渡 */
.restore-fade-enter-active,
.restore-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.restore-fade-enter-from { opacity: 0; transform: scale(0.95); }
.restore-fade-leave-to { opacity: 0; transform: scale(1.02); }

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-slide-enter-from { opacity: 0; transform: translateY(10px); }
.fade-slide-leave-to { opacity: 0; transform: translateY(-10px); }
</style>
"""

with open(r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\AiInterviewerPanel.vue', 'w', encoding='utf-8') as f:
    f.write(content + new_content)
