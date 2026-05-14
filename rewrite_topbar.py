import re

with open(r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\AiInterviewerPanel.vue', 'r', encoding='utf-8') as f:
    content = f.read()

# 替换 template 中的 ds-header-bar
old_header = """        <!-- 统一风格的顶部横条 -->
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
        </header>"""

new_header = """        <!-- 轻量化顶部导航 -->
        <header class="page-topbar">
          <div class="topbar-left">
            <h1 class="topbar-title">面试演练</h1>
            <div class="topbar-divider"></div>
            <div class="topbar-meta">
              <span class="meta-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                {{ jd.jdContext.value.targetRole || '目标岗位待解析' }}
              </span>
              <span class="meta-dot">·</span>
              <span class="meta-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                {{ modelDisplayName }}
              </span>
            </div>
          </div>

          <div class="topbar-right">
            <!-- 扁平化流水线 -->
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
            
            <button class="topbar-btn ghost" type="button" @click="showAiConfig = true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              设置模型
            </button>
            <button
              v-if="session.workflowPhase.value === 'analysis'"
              class="topbar-btn primary"
              :disabled="!session.canEnterPrep.value"
              type="button"
              @click="handleOpenPrepDialog"
            >
              配置这轮面试
            </button>
            <button
              v-else-if="session.workflowPhase.value === 'training'"
              class="topbar-btn primary"
              type="button"
              @click="handleStartNewRound"
            >
              开始新一轮
            </button>
          </div>
        </header>"""

if old_header in content:
    content = content.replace(old_header, new_header)
else:
    print("Warning: old_header not found.")

# 替换 CSS
old_css = """/* 顶部 Dashboard 横条 */
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
}"""

new_css = """/* 轻量化无边框顶部 */
.page-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 24px 0;
  flex-shrink: 0;
  margin-bottom: -10px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.topbar-title {
  font-size: 24px;
  font-weight: 900;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: 0.02em;
}

.topbar-divider {
  width: 1.5px;
  height: 18px;
  background: var(--border-color);
  border-radius: 2px;
  opacity: 0.6;
}

.topbar-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-dot {
  opacity: 0.4;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* 扁平化阶段流水线 */
.phase-tracker {
  display: flex;
  align-items: center;
  padding: 0;
  background: transparent;
  border: none;
  margin-right: 12px;
}

.phase-step {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.45;
  transition: all 0.2s ease;
}

.phase-step.clickable { cursor: pointer; }
.phase-step.clickable:hover { opacity: 0.8; }
.phase-step.active { opacity: 1; }
.phase-step.done { opacity: 0.8; }

.step-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  font-size: 10px;
  font-weight: 800;
  background: var(--bg-card);
}
.phase-step.active .step-dot {
  background: var(--primary-500);
  border-color: var(--primary-500);
  color: #fff;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
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
  width: 18px;
  height: 1.5px;
  background: var(--border-color);
  margin: 0 8px;
}
.phase-step.done .step-line {
  background: var(--primary-500);
}

/* 顶部按钮 */
.topbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.topbar-btn.primary {
  background: var(--primary-500);
  color: #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}
.topbar-btn.primary:disabled {
  opacity: 0.5; cursor: not-allowed; box-shadow: none;
}
.topbar-btn.primary:not(:disabled):hover {
  background: var(--primary-600);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
}

.topbar-btn.ghost {
  background: transparent;
  border: 1px solid rgba(43, 123, 184, 0.15);
  color: var(--text-secondary);
}
.topbar-btn.ghost:hover {
  background: rgba(43, 123, 184, 0.05);
  color: var(--text-primary);
  border-color: rgba(43, 123, 184, 0.25);
}"""

if old_css in content:
    content = content.replace(old_css, new_css)
else:
    print("Warning: old_css not found.")

# 修改 dashboard-layout 以减小 paddingTop
content = content.replace('padding: 32px 40px 24px;', 'padding: 32px 40px 24px;')

with open(r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\AiInterviewerPanel.vue', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
