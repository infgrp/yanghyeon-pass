// ============================================================
// 관리자 전용 사용자 관리 Edge Function (admin-users)
//
// 기능: 사용자 검색 / 비밀번호 초기화 / 이메일(아이디) 변경
// 보안: service_role 키는 이 서버 함수 안에서만 사용되며 절대 외부로 나가지 않음.
//       호출자의 JWT 를 검증해 role='admin' 인 경우에만 동작.
//
// 배포: supabase functions deploy admin-users --project-ref <ref>
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 자동 주입됨)
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** 읽기 쉬운 임시 비밀번호 생성 (혼동 문자 제외) */
function tempPassword(len = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST 만 허용" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "인증이 필요합니다." }, 401);

  // 1) 호출자 신원 확인
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: uErr,
  } = await caller.auth.getUser();
  if (uErr || !user) return json({ error: "유효하지 않은 세션입니다." }, 401);

  // 2) 관리자 권한 확인 (service 클라이언트로 role 조회)
  const admin = createClient(url, serviceKey);
  const { data: me } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin")
    return json({ error: "관리자 권한이 없습니다." }, 403);

  // 3) 액션 처리
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "잘못된 요청 본문" }, 400);
  }
  const action = String(payload.action ?? "");

  try {
    if (action === "search") {
      const q = String(payload.query ?? "").trim();
      // 이름 또는 학번으로 검색 (관리자는 전체 조회 가능)
      let sel = admin
        .from("users")
        .select("id, name, student_id, role, homeroom")
        .order("role")
        .limit(20);
      if (q) sel = sel.or(`name.ilike.%${q}%,student_id.ilike.%${q}%`);
      const { data: rows, error } = await sel;
      if (error) return json({ error: error.message }, 400);

      // 각 사용자의 이메일(아이디)을 보강
      const result = [];
      for (const r of rows ?? []) {
        const { data: au } = await admin.auth.admin.getUserById(r.id);
        result.push({ ...r, email: au?.user?.email ?? null });
      }
      return json({ users: result });
    }

    if (action === "reset_password") {
      const targetId = String(payload.target_id ?? "");
      if (!targetId) return json({ error: "대상 사용자가 없습니다." }, 400);
      const newPw =
        typeof payload.new_password === "string" && payload.new_password.length >= 6
          ? payload.new_password
          : tempPassword();
      const { error } = await admin.auth.admin.updateUserById(targetId, {
        password: newPw,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, temp_password: newPw });
    }

    if (action === "change_email") {
      const targetId = String(payload.target_id ?? "");
      const newEmail = String(payload.new_email ?? "").trim();
      if (!targetId || !newEmail)
        return json({ error: "대상 사용자/새 이메일이 필요합니다." }, 400);
      const { error } = await admin.auth.admin.updateUserById(targetId, {
        email: newEmail,
        email_confirm: true, // 관리자 변경이므로 즉시 확정
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, email: newEmail });
    }

    return json({ error: `알 수 없는 action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "서버 오류" }, 500);
  }
});
