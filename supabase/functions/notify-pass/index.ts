// ============================================================
// 담임 즉시 알림 Edge Function (notify-pass)
//
// 학생이 외출·조퇴를 신청하면 호출됨. 해당 학생의 담임(학번 앞3자리=homeroom)
// 을 찾아, 담임의 웹푸시 구독으로 알림을 발송.
//
// 보안: 호출자(학생) JWT 검증 + 해당 pass 가 본인 것인지 확인 → 스팸 방지.
//
// 시크릿 필요: VAPID_PRIVATE_KEY (supabase secrets set)
// 배포: supabase functions deploy notify-pass --project-ref <ref>
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const VAPID_PUBLIC =
  "BAshcuwZe9rZvho7nKPYyV0PDJnhZyFGdq78Autx3ny89rUuBGwnUU_gJsoqaUGBixUfqveitqF8GYIDCdTnCgI";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST 만 허용" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "인증 필요" }, 401);

  // 호출자(학생) 확인
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "유효하지 않은 세션" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "잘못된 요청" }, 400);
  }
  const passId = Number(body.pass_id);
  if (!passId) return json({ error: "pass_id 필요" }, 400);

  const admin = createClient(url, serviceKey);

  // pass + 학생 확인 (본인 신청건만 알림 가능)
  const { data: pass } = await admin
    .from("passes")
    .select("id, student_id, type, reason, date, start_time, end_time, status")
    .eq("id", passId)
    .single();
  if (!pass) return json({ error: "신청을 찾을 수 없음" }, 404);
  if (pass.student_id !== user.id) return json({ error: "본인 신청건이 아닙니다." }, 403);

  const { data: student } = await admin
    .from("users")
    .select("name, student_id")
    .eq("id", pass.student_id)
    .single();
  const homeroom = student?.student_id ? String(student.student_id).slice(0, 3) : null;
  if (!homeroom) return json({ ok: true, sent: 0, note: "학번 없음" });

  // 담임 교사들 찾기
  const { data: teachers } = await admin
    .from("users")
    .select("id")
    .eq("role", "teacher")
    .eq("homeroom", homeroom);
  const teacherIds = (teachers ?? []).map((t) => t.id);
  if (teacherIds.length === 0) return json({ ok: true, sent: 0, note: "담임 없음" });

  // 담임들의 구독
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", teacherIds);
  if (!subs || subs.length === 0) return json({ ok: true, sent: 0, note: "구독 없음" });

  webpush.setVapidDetails("mailto:admin@yanghyeon.hs.kr", VAPID_PUBLIC, vapidPrivate);

  const typeLabel = pass.type === 2 ? "외출" : "조퇴";
  const payload = JSON.stringify({
    title: `🔔 ${typeLabel} 신청 — ${student?.name ?? "학생"}`,
    body: `${pass.date} ${String(pass.start_time).slice(0, 5)}~${String(pass.end_time).slice(0, 5)} · ${pass.reason}`,
    url: "/teacher",
    tag: `pass-${pass.id}`,
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (e) {
        // 만료/무효 구독(410/404)은 정리
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }),
  );

  return json({ ok: true, sent });
});
