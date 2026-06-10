// ============================================================
// 상벌점 Edge Function (points)
//
// 교사/관리자 전용. 모든 학생 대상으로 검색·부여·이력 조회.
// (users RLS 는 담임반으로 좁혀져 있으므로, 학교 전체 단속은 이 함수가 service_role 로 처리)
//
// 배포: supabase functions deploy points --project-ref <ref>
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

  const admin = createClient(url, serviceKey);
  const { data: me } = await admin.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "teacher" && me?.role !== "admin")
    return json({ error: "교사/관리자만 사용할 수 있습니다." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "잘못된 요청" }, 400);
  }
  const action = String(body.action ?? "");

  // 기간 필터 (created_at 기준, from 포함 ~ to 미만). 잘못된 값은 무시.
  const fromISO = typeof body.from === "string" && body.from ? body.from : null;
  const toISO = typeof body.to === "string" && body.to ? body.to : null;

  // 학생들의 상벌점 합계 계산 (선택한 기간만)
  async function totalsFor(ids: string[]) {
    const map = new Map<string, { merit: number; demerit: number }>();
    ids.forEach((id) => map.set(id, { merit: 0, demerit: 0 }));
    if (ids.length) {
      let q = admin
        .from("points")
        .select("student_id, kind, amount")
        .in("student_id", ids);
      if (fromISO) q = q.gte("created_at", fromISO);
      if (toISO) q = q.lt("created_at", toISO);
      const { data: pts } = await q;
      for (const p of pts ?? []) {
        const t = map.get(p.student_id)!;
        if (p.kind === 2) t.merit += p.amount;
        else t.demerit += p.amount;
      }
    }
    return map;
  }

  try {
    if (action === "search") {
      const q = String(body.query ?? "").trim();
      const prefix = String(body.student_prefix ?? "").trim();
      let sel = admin.from("users").select("id, name, student_id").eq("role", "student");
      if (prefix) sel = sel.like("student_id", `${prefix}%`);
      else if (q) sel = sel.or(`name.ilike.%${q}%,student_id.ilike.%${q}%`);
      sel = sel.order("student_id").limit(prefix ? 1000 : 50);
      const { data: students, error } = await sel;
      if (error) return json({ error: error.message }, 400);
      const totals = await totalsFor((students ?? []).map((s) => s.id));
      const result = (students ?? []).map((s) => {
        const t = totals.get(s.id)!;
        return { ...s, merit: t.merit, demerit: t.demerit, net: t.merit - t.demerit };
      });
      return json({ students: result });
    }

    if (action === "export_detail") {
      // 상세 내역(엑셀용): 학급/학년 또는 전체. 학생·교사 이름 포함.
      const prefix = String(body.student_prefix ?? "").trim();
      let usel = admin.from("users").select("id, name, student_id").eq("role", "student");
      if (prefix) usel = usel.like("student_id", `${prefix}%`);
      const { data: studs } = await usel.limit(2000);
      const info = new Map((studs ?? []).map((s) => [s.id, s]));
      const ids = (studs ?? []).map((s) => s.id);
      if (!ids.length) return json({ entries: [] });
      let pq = admin
        .from("points")
        .select("student_id, kind, amount, reason, teacher_id, created_at")
        .in("student_id", ids);
      if (fromISO) pq = pq.gte("created_at", fromISO);
      if (toISO) pq = pq.lt("created_at", toISO);
      const { data: pts } = await pq
        .order("created_at", { ascending: false })
        .limit(5000);
      const tids = [...new Set((pts ?? []).map((p) => p.teacher_id).filter(Boolean))] as string[];
      const { data: teachers } = tids.length
        ? await admin.from("users").select("id, name").in("id", tids)
        : { data: [] };
      const tname = new Map((teachers ?? []).map((t) => [t.id, t.name]));
      const entries = (pts ?? []).map((p) => {
        const s = info.get(p.student_id);
        return {
          created_at: p.created_at,
          student_id: s?.student_id ?? "",
          name: s?.name ?? "",
          kind: p.kind,
          amount: p.amount,
          reason: p.reason,
          teacher: p.teacher_id ? tname.get(p.teacher_id) ?? "" : "",
        };
      });
      return json({ entries });
    }

    if (action === "give") {
      const studentId = String(body.student_id ?? "");
      const kind = Number(body.kind);
      const amount = Number(body.amount);
      const reason = String(body.reason ?? "").trim().slice(0, 100);
      if (!studentId || (kind !== 1 && kind !== 2))
        return json({ error: "대상/종류가 올바르지 않습니다." }, 400);
      if (!Number.isInteger(amount) || amount < 1 || amount > 100)
        return json({ error: "점수는 1~100 사이여야 합니다." }, 400);
      if (!reason) return json({ error: "사유를 입력하세요." }, 400);
      // 대상이 실제 학생인지 확인
      const { data: target } = await admin
        .from("users").select("id, role").eq("id", studentId).single();
      if (target?.role !== "student")
        return json({ error: "학생 계정이 아닙니다." }, 400);
      const { error } = await admin.from("points").insert({
        student_id: studentId, teacher_id: user.id, kind, amount, reason,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "give_bulk") {
      // 여러 학생에게 한 번에 부여
      const ids = Array.isArray(body.student_ids) ? body.student_ids.map(String) : [];
      const kind = Number(body.kind);
      const amount = Number(body.amount);
      const reason = String(body.reason ?? "").trim().slice(0, 100);
      if (ids.length === 0) return json({ error: "대상 학생을 선택하세요." }, 400);
      if (kind !== 1 && kind !== 2) return json({ error: "종류가 올바르지 않습니다." }, 400);
      if (!Number.isInteger(amount) || amount < 1 || amount > 100)
        return json({ error: "점수는 1~100 사이여야 합니다." }, 400);
      if (!reason) return json({ error: "사유를 입력하세요." }, 400);
      // 실제 학생만 필터
      const { data: studs } = await admin.from("users").select("id, role").in("id", ids);
      const validIds = (studs ?? []).filter((s) => s.role === "student").map((s) => s.id);
      if (validIds.length === 0) return json({ error: "학생 계정이 없습니다." }, 400);
      const rows = validIds.map((id) => ({
        student_id: id, teacher_id: user.id, kind, amount, reason,
      }));
      const { error } = await admin.from("points").insert(rows);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, count: rows.length });
    }

    if (action === "detail") {
      const studentId = String(body.student_id ?? "");
      if (!studentId) return json({ error: "대상이 없습니다." }, 400);
      const { data: stu } = await admin
        .from("users").select("id, name, student_id").eq("id", studentId).single();
      const { data: rows } = await admin
        .from("points")
        .select("id, kind, amount, reason, teacher_id, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(100);
      // 교사 이름 보강
      const tids = [...new Set((rows ?? []).map((r) => r.teacher_id).filter(Boolean))] as string[];
      const { data: teachers } = tids.length
        ? await admin.from("users").select("id, name").in("id", tids)
        : { data: [] };
      const tname = new Map((teachers ?? []).map((t) => [t.id, t.name]));
      let merit = 0, demerit = 0;
      const history = (rows ?? []).map((r) => {
        if (r.kind === 2) merit += r.amount; else demerit += r.amount;
        return { ...r, teacher_name: r.teacher_id ? tname.get(r.teacher_id) ?? "" : "" };
      });
      return json({ student: stu, merit, demerit, net: merit - demerit, history });
    }

    if (action === "delete") {
      // 부여자 본인 또는 관리자만 정정 삭제
      const id = Number(body.id);
      if (!id) return json({ error: "대상이 없습니다." }, 400);
      const { data: row } = await admin
        .from("points").select("teacher_id").eq("id", id).single();
      if (!row) return json({ error: "기록이 없습니다." }, 404);
      if (me.role !== "admin" && row.teacher_id !== user.id)
        return json({ error: "본인이 부여한 기록만 삭제할 수 있습니다." }, 403);
      const { error } = await admin.from("points").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: `알 수 없는 action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "서버 오류" }, 500);
  }
});
