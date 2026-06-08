import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // 환경변수 누락 시 빌드는 되지만 런타임에서 명확히 알려줍니다.
  console.error(
    "[설정 오류] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다. .env 파일을 확인하세요.",
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const isConfigured = Boolean(url && anonKey);
