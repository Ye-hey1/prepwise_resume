import re

# 1. AiInterviewerPanel.vue
filepath_1 = r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\AiInterviewerPanel.vue'
with open(filepath_1, 'r', encoding='utf-8') as f:
    content_1 = f.read()

content_1 = content_1.replace('设置模型', '模型配置')

with open(filepath_1, 'w', encoding='utf-8') as f:
    f.write(content_1)


# 2. JdAnalysisStage.vue
filepath_2 = r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\JdAnalysisStage.vue'
with open(filepath_2, 'r', encoding='utf-8') as f:
    content_2 = f.read()

content_2 = content_2.replace('配置这轮面试', '开始面试')
content_2 = content_2.replace('直接复用', '点击进入')
content_2 = content_2.replace('可以直接复用最近一次岗位准备面板', '可以点击进入最近一次岗位准备面板')

with open(filepath_2, 'w', encoding='utf-8') as f:
    f.write(content_2)


# 3. PrepConfigDialog.vue
filepath_3 = r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\PrepConfigDialog.vue'
with open(filepath_3, 'r', encoding='utf-8') as f:
    content_3 = f.read()

# 删除 h2.prep-title
old_header = """          <div class="prep-copy">
            <span class="prep-kicker">Interview Setup</span>
            <h2 class="prep-title">开始前确认这轮面试配置</h2>
            <p class="prep-desc">把模式、难度、时长和重点方向先定清楚，模拟面试会更贴近你想练的场景。</p>
          </div>"""

new_header = """          <div class="prep-copy">
            <span class="prep-kicker">Interview Setup</span>
            <p class="prep-desc">把模式、难度、时长和重点方向先定清楚，模拟面试会更贴近你想练的场景。</p>
          </div>"""

content_3 = content_3.replace(old_header, new_header)

with open(filepath_3, 'w', encoding='utf-8') as f:
    f.write(content_3)

print("Done")
