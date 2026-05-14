import re

# 1. AiInterviewerPanel.vue
filepath_1 = r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\AiInterviewerPanel.vue'
with open(filepath_1, 'r', encoding='utf-8') as f:
    content_1 = f.read()

# a. 把 handleReuseStoredJd 里的 showPrepDialog.value = true 改成 handleConfirmPrep()
old_reuse = """function handleReuseStoredJd() {
  if (!jd.handleReuseStoredJd()) return
  session.syncPrepConfigFromJd(jd.jdContext.value.jdText)
  showPrepDialog.value = true
}"""
new_reuse = """function handleReuseStoredJd() {
  if (!jd.handleReuseStoredJd()) return
  session.syncPrepConfigFromJd(jd.jdContext.value.jdText)
  handleConfirmPrep()
}"""
content_1 = content_1.replace(old_reuse, new_reuse)

# b. 把 handleSkipJd 里的 showPrepDialog.value = true 改成 handleConfirmPrep()
old_skip = """function handleSkipJd() {
  jd.resetJd()
  session.prepConfig.value = session.buildInitialPrepConfig()
  session.prepFocusInput.value = ''
  showPrepDialog.value = true
}"""
new_skip = """function handleSkipJd() {
  jd.resetJd()
  session.prepConfig.value = session.buildInitialPrepConfig()
  session.prepFocusInput.value = ''
  handleConfirmPrep()
}"""
content_1 = content_1.replace(old_skip, new_skip)

# c. 在 template 里修改 @startInterview 为 handleConfirmPrep
old_start_event = """@startInterview="handleOpenPrepDialog\""""
new_start_event = """@startInterview="handleConfirmPrep\""""
content_1 = content_1.replace(old_start_event, new_start_event)

# d. 在 topbar 添加一个“面试设置”按钮
old_topbar_btn = """            <button class="topbar-btn ghost" type="button" @click="showAiConfig = true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              模型配置
            </button>"""
new_topbar_btn = """            <button class="topbar-btn ghost" type="button" @click="showAiConfig = true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              模型配置
            </button>
            <button class="topbar-btn ghost" type="button" @click="showPrepDialog = true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              面试设置
            </button>"""
content_1 = content_1.replace(old_topbar_btn, new_topbar_btn)

with open(filepath_1, 'w', encoding='utf-8') as f:
    f.write(content_1)


# 2. PrepConfigDialog.vue
filepath_3 = r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\PrepConfigDialog.vue'
with open(filepath_3, 'r', encoding='utf-8') as f:
    content_3 = f.read()

# 删除多余的 Step 标识和简化标题
content_3 = re.sub(r'<span class="section-eyebrow">Step 1</span>\s*<h3 class="section-title">本轮面试设置</h3>', r'<h3 class="section-title" style="font-size: 16px; font-weight: 800;">基本参数设置</h3>', content_3)
content_3 = re.sub(r'<span class="section-eyebrow">Step 2</span>\s*<h3 class="section-title">角色与重点方向</h3>', r'<h3 class="section-title" style="font-size: 16px; font-weight: 800;">角色配置与方向</h3>', content_3)

# 修改 footer 按钮
old_footer = """        <footer class="prep-footer">
          <div class="footer-note">
            {{ props.jdContext.prepSummary || '如果暂时没有岗位摘要，也可以直接开始通用模拟面试。' }}
          </div>
          <div class="footer-actions">
            <button class="btn btn-secondary" type="button" @click="emit('close')">返回调整</button>
            <button class="btn btn-primary" :disabled="!props.canConfirm" type="button" @click="emit('confirm')">
              开始这轮面试
            </button>
          </div>
        </footer>"""

new_footer = """        <footer class="prep-footer">
          <div class="footer-note">
            这会自动应用到您下一次启动的模拟面试中。
          </div>
          <div class="footer-actions">
            <button class="btn btn-primary" style="width: 140px" type="button" @click="emit('close')">
              保存设置
            </button>
          </div>
        </footer>"""

content_3 = content_3.replace(old_footer, new_footer)

# 另外，由于 "开始前确认这轮面试配置" 我们刚刚已经替换成只有 Interview Setup 和一段 p，再优化一下这里。
old_header = """          <div class="prep-copy">
            <span class="prep-kicker">Interview Setup</span>
            <p class="prep-desc">把模式、难度、时长和重点方向先定清楚，模拟面试会更贴近你想练的场景。</p>
          </div>"""

new_header = """          <div class="prep-copy">
            <h2 class="prep-title" style="font-size: 20px; font-weight: 800;">面试参数设置</h2>
            <p class="prep-desc">您可以随时在此调整模拟面试的基本参数和重点方向。</p>
          </div>"""

content_3 = content_3.replace(old_header, new_header)

with open(filepath_3, 'w', encoding='utf-8') as f:
    f.write(content_3)

print("Done")
