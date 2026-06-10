import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { PointStudent, PointEntry } from "../lib/types";
import {
  POINT_KIND,
  POINT_LABEL,
  POINT_COLOR,
  DEMERIT_REASONS,
  MERIT_REASONS,
  formatStudentId,
  trimTime,
} from "../lib/constants";

interface Detail {
  student: { id: string; name: string; student_id: string | null } | null;
  merit: number;
  demerit: number;
  net: number;
  history: PointEntry[];
}

async function callFn(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("points", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function TeacherPoints() {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<PointStudent[]>([]);
  const [sel, setSel] = useState<PointStudent | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // 부여 폼
  const [kind, setKind] = useState<number>(POINT_KIND.DEMERIT);
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("");

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setErr("");
    setMsg("");
    setSel(null);
    setDetail(null);
    setBusy(true);
    try {
      const data = await callFn({ action: "search", query: query.trim() });
      setStudents((data.students ?? []) as PointStudent[]);
      if ((data.students ?? []).length === 0) setMsg("학생을 찾지 못했습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "검색 실패");
    } finally {
      setBusy(false);
    }
  }

  async function openStudent(s: PointStudent) {
    setSel(s);
    setErr("");
    setMsg("");
    setReason("");
    setAmount("1");
    setKind(POINT_KIND.DEMERIT);
    try {
      const data = await callFn({ action: "detail", student_id: s.id });
      setDetail(data as Detail);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "조회 실패");
    }
  }

  async function give(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!reason.trim()) {
      setErr("사유를 선택하거나 입력하세요.");
      return;
    }
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt < 1 || amt > 100) {
      setErr("점수는 1~100 사이여야 합니다.");
      return;
    }
    setBusy(true);
    try {
      await callFn({ action: "give", student_id: sel!.id, kind, amount: amt, reason: reason.trim() });
      setMsg(`✅ ${sel!.name}님에게 ${POINT_LABEL[kind]} ${amt}점 부여`);
      setReason("");
      const data = await callFn({ action: "detail", student_id: sel!.id });
      setDetail(data as Detail);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "부여 실패");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(id: number) {
    if (!confirm("이 기록을 삭제할까요? (본인이 부여한 것만 가능)")) return;
    try {
      await callFn({ action: "delete", id });
      const data = await callFn({ action: "detail", student_id: sel!.id });
      setDetail(data as Detail);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  const presets = kind === POINT_KIND.MERIT ? MERIT_REASONS : DEMERIT_REASONS;

  // 학생 상세 화면
  if (sel) {
    return (
      <>
        <button className="btn-link" onClick={() => { setSel(null); setDetail(null); }}>
          ← 목록으로
        </button>
        <div className="card">
          <div className="title">
            {sel.name}{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
              {formatStudentId(sel.student_id)}
            </span>
          </div>
          {detail && (
            <div className="row" style={{ gap: 16, marginTop: 8 }}>
              <span style={{ color: POINT_COLOR[2], fontWeight: 700 }}>상점 {detail.merit}</span>
              <span style={{ color: POINT_COLOR[1], fontWeight: 700 }}>벌점 {detail.demerit}</span>
              <span style={{ fontWeight: 800 }}>합산 {detail.net > 0 ? "+" : ""}{detail.net}</span>
            </div>
          )}
        </div>

        <form onSubmit={give} className="card">
          <div className="title" style={{ fontWeight: 700, marginBottom: 8 }}>상벌점 부여</div>
          <div className="seg">
            <button type="button" className={kind === POINT_KIND.DEMERIT ? "active" : ""}
              onClick={() => { setKind(POINT_KIND.DEMERIT); setReason(""); }}>벌점</button>
            <button type="button" className={kind === POINT_KIND.MERIT ? "active" : ""}
              onClick={() => { setKind(POINT_KIND.MERIT); setReason(""); }}>상점</button>
          </div>
          <label>사유</label>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {presets.map((r) => (
              <button type="button" key={r}
                className={reason === r ? "active" : ""}
                style={{ flex: "0 0 auto", border: "1px solid var(--line)", background: reason === r ? "var(--navy)" : "#fff", color: reason === r ? "#fff" : "var(--text)", borderRadius: 999, padding: "6px 12px", fontSize: 13 }}
                onClick={() => setReason(r === "기타" ? "" : r)}>
                {r}
              </button>
            ))}
          </div>
          <input style={{ marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유 직접 입력" maxLength={100} />
          <label>점수</label>
          <input type="number" min={1} max={100} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100 }} />
          {err && <div className="error">{err}</div>}
          {msg && <div className="notice" style={{ marginTop: 12 }}>{msg}</div>}
          <button className="btn-primary" style={{ marginTop: 16, background: POINT_COLOR[kind] }} disabled={busy} type="submit">
            {busy ? "처리 중…" : `${POINT_LABEL[kind]} 부여`}
          </button>
        </form>

        {detail && detail.history.length > 0 && (
          <div className="card">
            <div className="title" style={{ fontWeight: 700, marginBottom: 8 }}>최근 내역</div>
            {detail.history.map((h) => (
              <div key={h.id} className="row spread" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <span className="badge" style={{ background: POINT_COLOR[h.kind] }}>{POINT_LABEL[h.kind]} {h.amount}</span>
                  <span style={{ marginLeft: 8 }}>{h.reason}</span>
                  <div className="meta">{h.created_at.slice(0, 10)} {trimTime(h.created_at.slice(11))} · {h.teacher_name}</div>
                </div>
                <button className="btn-link" onClick={() => removeEntry(h.id)}>삭제</button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  // 검색 화면
  return (
    <>
      <form onSubmit={search} className="card">
        <label style={{ marginTop: 0 }}>학생 검색 (이름 또는 학번)</label>
        <div className="row" style={{ gap: 8 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="예: 홍길동 또는 30325" />
          <button className="btn-primary" style={{ width: "auto", paddingInline: 20 }} disabled={busy} type="submit">
            {busy ? "검색…" : "검색"}
          </button>
        </div>
        {err && <div className="error">{err}</div>}
        {msg && <div className="notice" style={{ marginTop: 12 }}>{msg}</div>}
      </form>

      {students.map((s) => (
        <button key={s.id} className="card list-item" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => openStudent(s)}>
          <div>
            <div className="title">{s.name} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{formatStudentId(s.student_id)}</span></div>
            <div className="meta">
              <span style={{ color: POINT_COLOR[2] }}>상점 {s.merit}</span> · <span style={{ color: POINT_COLOR[1] }}>벌점 {s.demerit}</span>
            </div>
          </div>
          <span className="badge" style={{ background: s.net >= 0 ? POINT_COLOR[2] : POINT_COLOR[1] }}>
            {s.net > 0 ? "+" : ""}{s.net}
          </span>
        </button>
      ))}
    </>
  );
}
