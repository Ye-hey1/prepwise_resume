"""
从 interviews.db 提取「大模型应用开发」和「大模型算法」面经数据，
整理后批量上传到 Supabase questions 表。
"""
import sqlite3
import json
import re
import urllib.request
import ssl

# ── Supabase 配置 ──
SUPABASE_URL = "https://iatyknamdejjdxdhrnxt.supabase.co"
SUPABASE_KEY = "sb_publishable_j9ZDq1_AlP14y3h4P5ev_w_JIm9D-Is"

# ── SQLite 连接 ──
DB_PATH = r"c:\Users\colin\Desktop\AI demo\resume-builder\interviews.db"
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# ── 提取目标分类的数据 ──
target_categories = ['大模型应用开发', '大模型算法']
placeholders = ','.join(['?'] * len(target_categories))
cursor.execute(
    f"SELECT id, title, content, category, company, stage, result, interview_type, publish_time FROM interviews WHERE category IN ({placeholders})",
    target_categories
)
rows = cursor.fetchall()
print(f"从 SQLite 中提取了 {len(rows)} 条面经记录")

# ── 转换为 Supabase questions 格式 ──
questions = []
for row in rows:
    db_id, title, content, category, company, stage, result, itype, pub_time = row
    
    # 构建标签
    tags = []
    if company:
        tags.append(company)
    if stage:
        tags.append(stage)
    if itype and itype != 'None':
        tags.append(itype)
    if result and result not in ('null', 'None'):
        tags.append(result)
    
    # 构建来源标注
    source_label = f"面经库导入"
    
    # 截取 content 作为题目内容（取标题作为主显示）
    # title 作为主要展示内容
    question_content = title if title else "未命名面经"
    
    # reference_answer 存放完整的面经内容
    ref_answer = content if content else ""
    
    # 用户笔记：公司+轮次信息
    notes_parts = []
    if company:
        notes_parts.append(f"公司: {company}")
    if stage:
        notes_parts.append(f"轮次: {stage}")
    if itype and itype != 'None':
        notes_parts.append(f"类型: {itype}")
    if result and result not in ('null', 'None'):
        notes_parts.append(f"结果: {result}")
    user_notes = " | ".join(notes_parts)
    
    questions.append({
        "content": question_content,
        "category": category,
        "tags": tags,
        "reference_answer": ref_answer[:5000] if ref_answer else "",  # 限制长度
        "user_notes": user_notes,
        "source": source_label,
        "mastery_level": 0,
    })

conn.close()
print(f"已整理为 {len(questions)} 条题库记录")

# ── 批量上传到 Supabase ──
# 使用 REST API 直接 POST
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BATCH_SIZE = 20
success_count = 0
error_count = 0

for i in range(0, len(questions), BATCH_SIZE):
    batch = questions[i:i+BATCH_SIZE]
    
    url = f"{SUPABASE_URL}/rest/v1/questions"
    data = json.dumps(batch).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('apikey', SUPABASE_KEY)
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req.add_header('Prefer', 'return=minimal')
    
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            if resp.status in (200, 201):
                success_count += len(batch)
                print(f"  [OK] batch {i//BATCH_SIZE + 1}: upload {len(batch)} done")
            else:
                error_count += len(batch)
                print(f"  [FAIL] batch {i//BATCH_SIZE + 1}: status {resp.status}")
    except Exception as e:
        error_count += len(batch)
        if hasattr(e, 'read'):
            error_body = e.read().decode('utf-8', errors='replace')
        print(f"  [FAIL] batch {i//BATCH_SIZE + 1}: {e}")
        if error_body:
            print(f"     resp: {error_body[:300]}")

print(f"\n=== 完成 ===")
print(f"成功上传: {success_count} 条")
print(f"上传失败: {error_count} 条")
