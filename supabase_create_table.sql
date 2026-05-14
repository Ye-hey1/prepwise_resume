-- ═══════════════════════════════════════════════════════
-- PrepWise 面试题库 - Supabase 建表脚本
-- 请复制到 Supabase Dashboard > SQL Editor 执行
-- ═══════════════════════════════════════════════════════

-- 1. 建表
CREATE TABLE IF NOT EXISTS public.questions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content     text NOT NULL,                          -- 题目内容
  category    text NOT NULL DEFAULT '未分类',          -- 面试类型分类（自动归类）
  tags        text[] DEFAULT '{}',                     -- 标签数组
  reference_answer text DEFAULT '',                    -- 参考答案
  user_notes  text DEFAULT '',                         -- 用户笔记
  source      text DEFAULT '',                         -- 来源（JD深挖题/专项训练抽取/AI面试模拟）
  mastery_level smallint DEFAULT 0,                    -- 掌握度 0-5
  created_at  timestamptz DEFAULT now()                -- 创建时间
);

-- 2. 为常用查询字段创建索引
CREATE INDEX IF NOT EXISTS idx_questions_category ON public.questions (category);
CREATE INDEX IF NOT EXISTS idx_questions_source ON public.questions (source);
CREATE INDEX IF NOT EXISTS idx_questions_created_at ON public.questions (created_at DESC);

-- 3. 开启 RLS（行级安全）并添加公开匿名访问策略
-- 注意：使用 anon key 进行匿名访问时需要以下策略
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户读取所有题目
CREATE POLICY "允许匿名读取" ON public.questions
  FOR SELECT USING (true);

-- 允许匿名用户新增题目
CREATE POLICY "允许匿名新增" ON public.questions
  FOR INSERT WITH CHECK (true);

-- 允许匿名用户更新题目
CREATE POLICY "允许匿名更新" ON public.questions
  FOR UPDATE USING (true);

-- 允许匿名用户删除题目
CREATE POLICY "允许匿名删除" ON public.questions
  FOR DELETE USING (true);
