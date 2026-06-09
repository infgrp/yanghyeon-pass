// ============================================================
// 온보딩 Edge Function (onboard)
//
// 구글 로그인은 이름/이메일만 주므로, 첫 로그인 후 학번(학생) 또는
// 교사코드+담임반(교사)을 받아 프로필을 완성한다.
// 역할/학번/담임반은 서버에서만 확정(클라이언트 신뢰 안 함, guard 우회=service_role).
//
// 배포: supabase functions deploy onboard --project-ref <ref>
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST 만 허용" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "인증이 필요합니다." }, 401);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "유효하지 않은 세션입니다." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "잘못된 요청" }, 400);
  }
  const mode = String(body.mode ?? "");

  const admin = createClient(url, serviceKey);
  const { data: me } = await admin
    .from("users")
    .select("role, student_id, homeroom")
    .eq("id", user.id)
    .single();
  if (!me) return json({ error: "프로필을 찾을 수 없습니다." }, 404);

  // 이미 완료된 프로필은 재온보딩 차단 (학번 보유 학생 / 교사 / 관리자)
  if (me.role !== "student" || me.student_id) {
    return json({ error: "이미 등록이 완료된 계정입니다. 관리자에게 문의하세요." }, 409);
  }

  if (mode === "student") {
    const sid = String(body.student_id ?? "").trim();
    if (!/^\d{5}$/.test(sid))
      return json({ error: "학번은 5자리 숫자여야 합니다 (예: 30101)." }, 400);
    const { error } = await admin
      .from("users")
      .update({ role: "student", student_id: sid })
      .eq("id", user.id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, role: "student", student_id: sid });
  }

  if (mode === "teacher") {
    const code = String(body.signup_code ?? "").trim();
    const homeroom = String(body.homeroom ?? "").trim();
    if (!/^\d{3}$/.test(homeroom))
      return json({ error: "담임반은 3자리 숫자여야 합니다 (예: 303)." }, 400);
    const { data: valid } = await admin
      .from("teacher_codes")
      .select("code")
      .eq("code", code)
      .eq("active", true)
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .maybeSingle();
    if (!valid) return json({ error: "유효하지 않은 교사 가입 코드입니다." }, 400);
    const { error } = await admin
      .from("users")
      .update({ role: "teacher", homeroom, student_id: null })
      .eq("id", user.id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, role: "teacher", homeroom });
  }

  return json({ error: "mode 는 student 또는 teacher 여야 합니다." }, 400);
});
