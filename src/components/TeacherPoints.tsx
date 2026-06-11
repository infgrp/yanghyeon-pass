import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { PointStudent, PointEntry } from "../lib/types";
import {
  POINT_KIND,
  POINT_LABEL,
  POINT_COLOR,
  DEMERIT_REASONS,
  MERIT_REASONS,
  formatStudentId,
  formatHomeroom,
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

export default function TeacherPoints({ homeroom }: { homeroom?: string | null }) {
  // 담임반 코드(예: "301"). 설정된 담임만 "우리 반" 바로보기 노출.
  const hr = homeroom && homeroom.length >= 3 ? homeroom : null;

  const [grade, setGrade] = useState("");
  const [klass, setKlass] = useState("");
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<PointStudent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // 부여 폼
  const [kind, setKind] = useState<number>(POINT_KIND.DEMERIT);
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("");

  // 개별 이력 보기
  const [detail, setDetail] = useState<Detail | null>(null);

  async function loadStudents(opts: { prefix?: string; query?: string }) {
    setErr("");
    setMsg("");
    setSelected(new Set());
    setBusy(true);
    try {
      const body: Record<string, unknown> = { action: "search" };
      if (opts.prefix) body.student_prefix = opts.prefix;
      else body.query = (opts.query ?? "").trim();
      const data = await callFn(body);
      setStudents((data.students ?? []) as PointStudent[]);
      if ((data.students ?? []).length === 0) setMsg("학생이 없습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setBusy(false);
    }
  }

  // 담임반 학생 바로 보기 (학년/반 버튼도 함께 활성화)
  function pickHomeroom() {
    if (!hr) return;
    setGrade(hr[0]);
    setKlass(String(Number(hr.slice(1, 3))));
    setQuery("");
    loadStudents({ prefix: hr });
  }

  // 상벌점 탭을 열면 담임 본인 반을 자동으로 띄워 바로 모니터링
  useEffect(() => {
    if (hr) pickHomeroom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hr]);

  function pickGrade(g: string) {
    setGrade(g);
    setKlass("");
    setQuery("");
    if (g) loadStudents({ prefix: g });
    else setStudents([]);
  }
  function pickClass(k: string) {
    setKlass(k);
    setQuery("");
    loadStudents({ prefix: k ? `${grade}${k.padStart(2, "0")}` : grade });
  }
  function doSearch(e: React.FormEvent) {
    e.preventDefault();
    setGrade("");
    setKlass("");
    loadStudents({ query });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  const allSelected = students.length > 0 && students.every((s) => selected.has(s.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)));
  }

  async function giveBulk() {
    setErr("");
    setMsg("");
    if (selected.size === 0) {
      setErr("학생을 선택하세요.");
      return;
    }
    if (!reason.trim()) {
      setErr("사유를 선택하거나 입력하세요.");
      return;
    }
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt < 1 || amt > 100) {
      setErr("점수는 1~100 사이여야 합니다.");
      return;
    }
    if (!confirm(`선택한 ${selected.size}명에게 ${POINT_LABEL[kind]} ${amt}점을 부여할까요?`)) return;
    setBusy(true);
    try {
      const data = await callFn({
        action: "give_bulk",
        student_ids: [...selected],
        kind,
        amount: amt,
        reason: reason.trim(),
      });
      setMsg(`✅ ${data.count}명에게 ${POINT_LABEL[kind]} ${amt}점 부여 완료`);
      setReason("");
      setSelected(new Set());
      // 합계 갱신
      const prefix = klass ? `${grade}${klass.padStart(2, "0")}` : grade;
      await loadStudents(prefix ? { prefix } : { query });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "부여 실패");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(s: PointStudent) {
    try {
      const data = await callFn({ action: "detail", student_id: s.id });
      setDetail(data as Detail);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "조회 실패");
    }
  }
  async function removeEntry(id: number, sid: string) {
    if (!confirm("이 기록을 삭제할까요? (본인이 부여한 것만 가능)")) return;
    try {
      await callFn({ action: "delete", id });
      const data = await callFn({ action: "detail", student_id: sid });
      setDetail(data as Detail);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  const presets = kind === POINT_KIND.MERIT ? MERIT_REASONS : DEMERIT_REASONS;

  // ── 개별 이력 모달 화면 ──
  if (detail) {
    return (
      <>
        <button className="btn-link" onClick={() => setDetail(null)}>← 목록으로</button>
        <div className="card">
          <div className="title">
            {detail.student?.name}{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
              {formatStudentId(detail.student?.student_id)}
            </span>
          </div>
          <div className="row" style={{ gap: 16, marginTop: 8 }}>
            <span style={{ color: POINT_COLOR[2], fontWeight: 700 }}>상점 {detail.merit}</span>
            <span style={{ color: POINT_COLOR[1], fontWeight: 700 }}>벌점 {detail.demerit}</span>
            <span style={{ fontWeight: 800 }}>합산 {detail.net > 0 ? "+" : ""}{detail.net}</span>
          </div>
        </div>
        {detail.history.length === 0 ? (
          <div className="card muted" style={{ textAlign: "center" }}>받은 상벌점이 없습니다.</div>
        ) : (
          <div className="card">
            {detail.history.map((h) => (
              <div key={h.id} className="row spread" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <span className="badge" style={{ background: POINT_COLOR[h.kind] }}>{POINT_LABEL[h.kind]} {h.amount}</span>
                  <span style={{ marginLeft: 8 }}>{h.reason}</span>
                  <div className="meta">{h.created_at.slice(0, 10)} {trimTime(h.created_at.slice(11))} · {h.teacher_name}</div>
                </div>
                <button className="btn-link" onClick={() => removeEntry(h.id, detail.student!.id)}>삭제</button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* 학년/반 버튼 + 검색 */}
      <div className="card">
        {hr && (
          <>
            <label style={{ marginTop: 0 }}>우리 반 모니터링</label>
            <button
              className="btn-primary"
              style={{ width: "100%" }}
              onClick={pickHomeroom}
            >
              👨‍🏫 우리 반 ({formatHomeroom(hr)}) 상벌점 보기
            </button>
          </>
        )}
        <label style={hr ? undefined : { marginTop: 0 }}>학년</label>
        <div className="seg" style={{ flexWrap: "wrap", gap: 6 }}>
          {["1", "2", "3"].map((g) => (
            <button key={g} className={grade === g ? "active" : ""} onClick={() => pickGrade(g)}>{g}학년</button>
          ))}
        </div>
        {grade && (
          <>
            <label>반</label>
            <div className="seg" style={{ flexWrap: "wrap", gap: 6 }}>
              <button className={klass === "" ? "active" : ""} onClick={() => pickClass("")}>전체</button>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((k) => (
                <button key={k} className={klass === k ? "active" : ""} style={{ flex: "0 0 auto", minWidth: 44 }} onClick={() => pickClass(k)}>{k}반</button>
              ))}
            </div>
          </>
        )}
        <form onSubmit={doSearch} className="row" style={{ gap: 8, marginTop: 12 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="또는 이름/학번 검색" />
          <button className="btn-ghost" style={{ width: "auto", paddingInline: 16 }} type="submit">검색</button>
        </form>
      </div>

      {/* 부여 패널 (학생이 있을 때) */}
      {students.length > 0 && (
        <div className="card" style={{ position: "sticky", top: 64, zIndex: 5 }}>
          <div className="seg">
            <button type="button" className={kind === POINT_KIND.DEMERIT ? "active" : ""}
              onClick={() => { setKind(POINT_KIND.DEMERIT); setReason(""); }}>벌점</button>
            <button type="button" className={kind === POINT_KIND.MERIT ? "active" : ""}
              onClick={() => { setKind(POINT_KIND.MERIT); setReason(""); }}>상점</button>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {presets.map((r) => (
              <button type="button" key={r}
                style={{ flex: "0 0 auto", border: "1px solid var(--line)", background: reason === r ? "var(--navy)" : "#fff", color: reason === r ? "#fff" : "var(--text)", borderRadius: 999, padding: "6px 12px", fontSize: 13 }}
                onClick={() => setReason(r === "기타" ? "" : r)}>{r}</button>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유" maxLength={100} style={{ flex: 1 }} />
            <input type="number" min={1} max={100} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 70 }} />
          </div>
          {err && <div className="error">{err}</div>}
          {msg && <div className="notice" style={{ marginTop: 10 }}>{msg}</div>}
          <button className="btn-primary" style={{ marginTop: 12, background: POINT_COLOR[kind] }}
            disabled={busy || selected.size === 0} onClick={giveBulk}>
            {busy ? "처리 중…" : `선택한 ${selected.size}명에게 ${POINT_LABEL[kind]} 부여`}
          </button>
        </div>
      )}

      {/* 학생 목록 (체크박스) */}
      {busy && students.length === 0 ? (
        <div className="center muted">불러오는 중…</div>
      ) : students.length === 0 ? (
        !msg && <div className="card muted" style={{ textAlign: "center" }}>학년·반을 선택하면 학생 목록이 나옵니다.</div>
      ) : (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
            <input type="checkbox" style={{ width: 18, height: 18 }} checked={allSelected} onChange={toggleAll} />
            전체 선택 ({selected.size}명)
          </label>
          {students.map((s) => (
            <div className="card row" key={s.id} style={{ gap: 12, alignItems: "center" }}>
              <input type="checkbox" style={{ width: 20, height: 20 }} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
              <div style={{ flex: 1 }} onClick={() => toggle(s.id)}>
                <div className="title">{s.name} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{formatStudentId(s.student_id)}</span></div>
                <div className="meta">
                  <span style={{ color: POINT_COLOR[2] }}>상점 {s.merit}</span> · <span style={{ color: POINT_COLOR[1] }}>벌점 {s.demerit}</span>
                </div>
              </div>
              <button className="btn-link" onClick={() => openDetail(s)}>내역</button>
            </div>
          ))}
        </>
      )}
    </>
  );
}
