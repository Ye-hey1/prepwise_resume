import re

# 1. 修改 PrepConfigDialog.vue
filepath_dialog = r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\PrepConfigDialog.vue'
with open(filepath_dialog, 'r', encoding='utf-8') as f:
    content = f.read()

# 添加 AI 模型配置项
# 由于在原有的 grid-two 中，我们可以把 "面试模式" 换成与 AI 相关的，或者单独加一行。
# 现有的结构是:
# <div class="grid-two">
#   <article class="config-card">面试模式...</article>
#   <article class="config-card">难度等级...</article>
#   <article class="config-card">计划时长...</article>
#   <article class="config-card">提示次数...</article>
# </div>

# 我们可以在最上面加一行 "AI 核心驱动"，点击让它 emit('openAiConfig')
# 并在 AiInterviewerPanel 中监听 @openAiConfig="showAiConfig = true"

ai_model_section = """
            <div class="grid-two" style="margin-bottom: 18px;">
              <article class="config-card" style="grid-column: 1 / -1; display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 12px 18px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <span class="field-label">当前面试驱动大模型</span>
                  <strong style="font-size: 14px; color: #162134;">{{ aiModelName || '未指定模型' }}</strong>
                </div>
                <button class="btn btn-secondary" style="min-height: 32px; font-size: 12px; padding: 0 12px;" type="button" @click="emit('openAiConfig')">
                  更换模型
                </button>
              </article>
            </div>
"""

# 我们要在 <section class="prep-section"> 里面的第一个 <div class="grid-two"> 前面插入这段。
content = content.replace('<div class="grid-two">', ai_model_section + '            <div class="grid-two">', 1)

# 我们要在 script 中加 emit('openAiConfig') 和 aiModelName
if "openAiConfig: []" not in content:
    content = content.replace("close: []", "close: []\n  openAiConfig: []")

if "const aiModelName = computed" not in content:
    # 找到 import 的地方，导入 store
    content = content.replace(
        "import { CANDIDATE_MODELS, INTERVIEWER_MODELS } from '@/config/vrmModels'",
        "import { CANDIDATE_MODELS, INTERVIEWER_MODELS } from '@/config/vrmModels'\nimport { useAiConfigStore } from '@/stores/aiConfig'\nimport { computed } from 'vue'"
    )
    # 在 defineEmits 之后加
    content = content.replace(
        "const difficultyOptions = [",
        "const aiConfig = useAiConfigStore()\nconst aiModelName = computed(() => aiConfig.getConfigForFeature('interview').modelName.split('/').pop())\n\nconst difficultyOptions = ["
    )

# 压缩 CSS
content = content.replace('padding: 18px;', 'padding: 14px;')
content = content.replace('min-height: 56px;', 'min-height: 42px;')
content = content.replace('min-height: 42px;', 'min-height: 36px;')
content = content.replace('min-height: 50px;', 'min-height: 40px;')
content = content.replace('gap: 18px;', 'gap: 12px;')
content = content.replace('gap: 14px;', 'gap: 8px;')
content = content.replace('gap: 24px;', 'gap: 16px;')
content = content.replace('font-size: 30px;', 'font-size: 24px;')
content = content.replace('padding: 24px 28px;', 'padding: 16px 20px;')
content = content.replace('min-height: 220px;', 'min-height: 120px;')
content = content.replace('min-height: 140px;', 'min-height: 80px;')
content = content.replace('border-radius: 28px;', 'border-radius: 20px;')
content = content.replace('border-radius: 22px;', 'border-radius: 14px;')
content = content.replace('border-radius: 18px;', 'border-radius: 12px;')

with open(filepath_dialog, 'w', encoding='utf-8') as f:
    f.write(content)


# 2. 修改 AiInterviewerPanel.vue 移除模型配置按钮，接收 @openAiConfig
filepath_panel = r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\AiInterviewerPanel.vue'
with open(filepath_panel, 'r', encoding='utf-8') as f:
    content_panel = f.read()

# 去掉 topbar 里的“模型配置”
old_model_btn = """            <button class="topbar-btn ghost" type="button" @click="showAiConfig = true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              模型配置
            </button>"""
content_panel = content_panel.replace(old_model_btn, "")

# 给 PrepConfigDialog 加 @openAiConfig="showAiConfig = true"
old_prep_dialog = """      @close="showPrepDialog = false\""""
new_prep_dialog = """      @close="showPrepDialog = false"
      @openAiConfig="showAiConfig = true\""""
content_panel = content_panel.replace(old_prep_dialog, new_prep_dialog)

with open(filepath_panel, 'w', encoding='utf-8') as f:
    f.write(content_panel)

print("Done")
