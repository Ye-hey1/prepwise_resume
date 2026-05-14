import re

with open(r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\JdAnalysisStage.vue', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 替换 workbench-head 并插入新的 buttons
old_head = """      <header class="workbench-head">
        <div class="head-copy">
          <span class="section-kicker">岗位准备</span>
          <h2 class="section-title">输入岗位 JD</h2>
          <p class="section-desc">粘贴岗位描述后直接解析，生成匹配度、差距和预测问题。</p>
        </div>
      </header>"""

new_head = """      <header class="workbench-head">
        <div class="head-copy">
          <span class="section-kicker">岗位准备</span>
          <h2 class="section-title">输入岗位 JD</h2>
          <p class="section-desc">粘贴岗位描述后直接解析，生成匹配度、差距和预测问题。</p>
        </div>

        <div class="head-actions">
          <button v-if="jdDraft" class="btn-ghost" type="button" @click="jdDraft = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            清空
          </button>
          
          <template v-if="!props.canStartInterview">
            <button class="btn-secondary" type="button" @click="emit('skip')">跳过解析</button>
            <button class="btn-primary" :disabled="!props.canAnalyze" type="button" @click="emit('analyze')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              开始解析
            </button>
          </template>
          
          <template v-else>
            <button class="btn-secondary" :disabled="!props.canAnalyze" type="button" @click="emit('analyze')">重新解析</button>
            <button class="btn-primary" type="button" @click="emit('startInterview')">配置这轮面试</button>
          </template>
        </div>
      </header>"""

content = content.replace(old_head, new_head)

# 2. 移除 editor-panel 内部的 field-head 和 toolbar-actions
old_editor_panel = """        <div class="editor-panel">
          <label class="editor-field">
            <div class="field-head">
              <span class="field-label">岗位 JD</span>
              <div class="field-head-side">
                <span class="field-note">建议包含职责范围、任职要求、技术栈、业务方向和加分项</span>
                <div class="field-actions">
                  <button class="text-btn" type="button" @click="jdDraft = ''">清空输入</button>
                  <button
                    v-if="!props.canStartInterview"
                    class="btn btn-secondary btn-inline"
                    type="button"
                    @click="emit('skip')"
                  >
                    跳过解析
                  </button>
                  <button
                    v-if="!props.canStartInterview"
                    class="btn btn-primary btn-inline"
                    :disabled="!props.canAnalyze"
                    type="button"
                    @click="emit('analyze')"
                  >
                    解析岗位要求
                  </button>
                </div>
              </div>
            </div>

            <textarea
              v-model="jdDraft"
              class="field-textarea"
              placeholder="请粘贴职位描述，建议包含职责范围、任职要求、技术栈、业务方向和加分项。"
            />
          </label>

          <div class="editor-toolbar">
            <div class="setup-stats">
              <div v-for="item in setupStats" :key="item.label" class="stat-chip">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>

            <div class="toolbar-actions">
              <button
                v-if="props.canStartInterview"
                class="btn btn-secondary"
                :disabled="!props.canAnalyze"
                type="button"
                @click="emit('analyze')"
              >
                重新解析
              </button>
              <button
                v-if="props.canStartInterview"
                class="btn btn-primary"
                type="button"
                @click="emit('startInterview')"
              >
                配置这轮面试
              </button>
            </div>
          </div>
        </div>"""

new_editor_panel = """        <div class="editor-panel">
          <label class="editor-field">
            <textarea
              v-model="jdDraft"
              class="field-textarea"
              placeholder="请粘贴职位描述，建议包含职责范围、任职要求、技术栈、业务方向和加分项。"
            />
          </label>

          <div class="editor-toolbar">
            <div class="setup-stats">
              <div v-for="item in setupStats" :key="item.label" class="stat-chip">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </div>
        </div>"""

content = content.replace(old_editor_panel, new_editor_panel)

# 3. 添加样式
css_to_add = """
/* 头部操作按钮区域 */
.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.head-actions button {
  height: 42px;
  padding: 0 20px;
  border-radius: 12px;
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.head-actions .btn-ghost {
  background: transparent;
  color: var(--iv-text-muted);
  border: 1px solid transparent;
  padding: 0 16px;
}
.head-actions .btn-ghost:hover {
  background: rgba(15, 23, 42, 0.04);
  color: var(--iv-text-title);
}

.head-actions .btn-secondary {
  background: #fff;
  border: 1px solid var(--iv-shell-border);
  color: var(--iv-text-title);
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
}
.head-actions .btn-secondary:hover:not(:disabled) {
  border-color: rgba(43, 123, 184, 0.3);
  box-shadow: 0 4px 12px rgba(0,0,0,0.04);
  transform: translateY(-1px);
}
.head-actions .btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.head-actions .btn-primary {
  background: var(--iv-brand-500);
  color: #fff;
  border: 1px solid transparent;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}
.head-actions .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
.head-actions .btn-primary:not(:disabled):hover {
  background: var(--iv-brand-600);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
}
"""

if ".head-actions {" not in content:
    content = content.replace("</style>", css_to_add + "\n</style>")

# 另外，.workbench-head 需要确保纵向居中对齐
old_workbench_head_css = """.workbench-head,
.results-head,
.summary-panel,
.editor-toolbar,
.guide-title-row,
.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}"""

new_workbench_head_css = """.workbench-head,
.results-head,
.summary-panel,
.editor-toolbar,
.guide-title-row,
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}"""
content = content.replace(old_workbench_head_css, new_workbench_head_css)

with open(r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\JdAnalysisStage.vue', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
