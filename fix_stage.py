import re

def rewrite_ai_interviewer_panel():
    filepath = r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\AiInterviewerPanel.vue'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 移除 topbar 里的“配置这轮面试”按钮，避免重复
    target_btn = """            <button
              v-if="session.workflowPhase.value === 'analysis'"
              class="topbar-btn primary"
              :disabled="!session.canEnterPrep.value"
              type="button"
              @click="handleOpenPrepDialog"
            >
              配置这轮面试
            </button>"""
    content = content.replace(target_btn, "")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)


def rewrite_jd_analysis_stage():
    filepath = r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\JdAnalysisStage.vue'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. 修正上一步注入的 CSS 变量，使其不再是白底白字
    content = content.replace('var(--iv-brand-500)', 'var(--primary-500)')
    content = content.replace('var(--iv-brand-600)', 'var(--primary-600)')
    content = content.replace('var(--iv-text-title)', 'var(--text-primary)')
    content = content.replace('var(--iv-text-muted)', 'var(--text-muted)')
    content = content.replace('var(--iv-shell-border)', 'var(--border-color)')

    # 2. 修改 summary-panel 结构，移除右侧占位极大的 summary-side 以及多余的“配置这轮面试”按钮，改成上下结构，让左侧不再太空
    old_summary_panel = """      <article class="summary-panel">
        <div class="summary-copy">
          <span class="summary-label">{{ hasAnalysis ? '岗位摘要' : '等待岗位摘要' }}</span>
          <strong>{{ summaryText }}</strong>
          <p>
            {{
              hasAnalysis
                ? `当前优先关注：${focusPreview.join(' / ') || '等待生成重点方向'}`
                : '解析完成后会直接显示匹配得分、技能差距、故事切口和预测问题。'
            }}
          </p>
        </div>

        <div class="summary-side">
          <div class="summary-tags">
            <span
              v-for="item in (hasAnalysis ? focusPreview : ['匹配度', '技能差距', '故事切口'])"
              :key="item"
              class="summary-tag"
            >
              {{ item }}
            </span>
          </div>

          <div class="summary-actions">
            <button
              v-if="hasAnalysis"
              class="btn btn-secondary"
              type="button"
              @click="emit('reuseExisting')"
            >
              刷新结果
            </button>
            <button
              class="btn btn-primary"
              :disabled="!props.canStartInterview"
              type="button"
              @click="emit('startInterview')"
            >
              配置这轮面试
            </button>
          </div>
        </div>
      </article>"""

    new_summary_panel = """      <article class="summary-panel">
        <div class="summary-copy">
          <span class="summary-label">{{ hasAnalysis ? '岗位摘要' : '等待岗位摘要' }}</span>
          <strong style="line-height: 1.6; font-size: 15px;">{{ summaryText }}</strong>
        </div>
        
        <div class="summary-tags-block" v-if="hasAnalysis && focusPreview.length">
          <div class="summary-tags">
            <span v-for="item in focusPreview" :key="item" class="summary-tag">{{ item }}</span>
          </div>
        </div>
        
        <div v-if="!hasAnalysis" class="summary-copy" style="margin-top: 8px">
          <p style="color: var(--text-muted); font-size: 14px;">解析完成后会直接显示匹配得分、技能差距、故事切口和预测问题。</p>
        </div>
      </article>"""

    # 有些旧代码的空格可能不完全一致，用正则更稳
    pattern = re.compile(r'<article class="summary-panel">.*?</article>', re.DOTALL)
    if pattern.search(content):
        content = pattern.sub(new_summary_panel, content)

    # 3. 增强 css
    css_improvements = """
.summary-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 28px;
}

.summary-tags-block {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px dashed rgba(43, 123, 184, 0.15);
}

.summary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.summary-tag {
  background: var(--bg-card-muted);
  color: var(--primary-600);
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid rgba(43, 123, 184, 0.1);
}

.story-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.story-list li {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.03);
}
.story-list li strong {
  font-size: 14px;
  color: var(--text-primary);
}
.story-list li span {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
"""
    if ".summary-tags-block {" not in content:
        content = content.replace("</style>", css_improvements + "\n</style>")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

rewrite_ai_interviewer_panel()
rewrite_jd_analysis_stage()
print("Done")
