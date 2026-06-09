// ============================================================
// 외출증 공개 검증 Edge Function (verify-pass)
//
// 교문 경비가 QR 을 스캔하면 호출됨. 로그인 불필요(공개).
// pass_id + token(verify_token) 이 일치할 때만 그 외출증의 '실시간 상태'를 반환.
// → 위조 이미지의 QR 은 token 불일치/무효라 검증 실패.
//
// 배포: supabase functions deploy verify-pass --no-verify-jwt --project-ref <ref>
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const STATUS_LABEL: Record<number, string> = {
  0: "대기중",
  1: "승인",
  2: "반려",
  3: "사용완료",
};

/** 이름 마스킹: 홍길동 -> 홍*동 */
function maskName(name: string): string {
  if (!name) return "";
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST 만 허용" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "잘못된 요청" }, 400);
  }
  const passId = Number(payload.pass_id);
  const token = String(payload.token ?? "");
  if (!passId || !token) return json({ error: "검증 정보가 부족합니다." }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const { data: pass, error } = await admin
    .from("passes")
    .select(
      "id, student_id, type, date, start_time, end_time, status, teacher_id, verify_token, updated_at",
    )
    .eq("id", passId)
    .single();

  // 존재하지 않거나 토큰 불일치 → 위조/무효
  if (error || !pass || pass.verify_token !== token) {
    return json({ valid: false, reason: "유효하지 않은 외출증입니다." }, 200);
  }

  // 학생/교사 이름 조회
  const ids = [pass.student_id, pass.teacher_id].filter(Boolean) as string[];
  const { data: people } = await admin
    .from("users")
    .select("id, name, student_id")
    .in("id", ids);
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const student = byId.get(pass.student_id);
  const teacher = pass.teacher_id ? byId.get(pass.teacher_id) : null;

  return json({
    valid: true,
    pass_id: pass.id,
    status: pass.status,
    status_label: STATUS_LABEL[pass.status] ?? "-",
    type: pass.type,
    type_label: pass.type === 2 ? "외출" : "조퇴",
    name: maskName(student?.name ?? ""),
    student_no: student?.student_id ?? "",
    date: pass.date,
    time_window: `${String(pass.start_time).slice(0, 5)}-${String(pass.end_time).slice(0, 5)}`,
    teacher_name: teacher?.name ?? "",
    updated_at: pass.updated_at,
    server_time: new Date().toISOString(),
  });
});
