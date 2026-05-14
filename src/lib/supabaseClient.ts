import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// 提供一个检查手段：如果在没有配置环境变量时访问客户端，可以抛出引导错误的日志以防白屏
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = hasSupabaseConfig 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null
