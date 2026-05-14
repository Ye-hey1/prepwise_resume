import sqlite3

conn = sqlite3.connect(r'c:\Users\colin\Desktop\AI demo\resume-builder\interviews.db')
cursor = conn.cursor()

# 查看所有分类
cursor.execute("SELECT DISTINCT category, COUNT(*) FROM interviews GROUP BY category")
rows = cursor.fetchall()

with open(r'c:\Users\colin\Desktop\AI demo\resume-builder\db_inspect_result.txt', 'w', encoding='utf-8') as f:
    f.write("=== 所有分类 ===\n")
    for r in rows:
        f.write(f"  [{r[0]}] -> {r[1]} rows\n")
    
    # 查看目标分类
    cursor.execute("SELECT DISTINCT category FROM interviews")
    all_cats = [r[0] for r in cursor.fetchall()]
    
    # 筛选包含关键词的分类
    target_keywords = ['大模型', '产品']
    matched_cats = [c for c in all_cats if any(kw in c for kw in target_keywords)]
    
    f.write(f"\n=== 匹配的分类: {matched_cats} ===\n")
    
    for cat in matched_cats:
        cursor.execute("SELECT id, title, content, company, stage, result, interview_type, publish_time FROM interviews WHERE category=?", (cat,))
        items = cursor.fetchall()
        f.write(f"\n--- {cat} ({len(items)} rows) ---\n")
        for item in items[:3]:
            f.write(f"  id={item[0]}\n")
            f.write(f"  title={item[1]}\n")
            f.write(f"  company={item[3]}\n")
            f.write(f"  stage={item[4]}\n")
            f.write(f"  result={item[5]}\n")
            f.write(f"  type={item[6]}\n")
            f.write(f"  content_preview={item[2][:300] if item[2] else 'N/A'}\n")
            f.write(f"  ---\n")
    
    # 也查一下产品经理
    cursor.execute("SELECT DISTINCT category FROM interviews WHERE category LIKE '%产品%' OR category LIKE '%PM%'")
    pm_cats = [r[0] for r in cursor.fetchall()]
    f.write(f"\n=== 产品经理相关分类: {pm_cats} ===\n")
    
    if not pm_cats:
        # 看看所有分类，手动找
        f.write("没有找到产品经理分类，所有分类列表：\n")
        for c in all_cats:
            f.write(f"  [{c}]\n")

conn.close()
print("Done! Check db_inspect_result.txt")
