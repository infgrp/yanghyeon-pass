import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { PASS_TYPE, PASS_STATUS } from "../lib/constants";

/** 오늘 날짜를 YYYY-MM-DD (로컬 기준)으로 반환 */
function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function ApplyPass() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [type, setType] = useState<number>(PASS_TYPE.EARLY_LEAVE);
  const [date, setDate] = useState(todayStr());
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("16:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!reason.trim()) {
      setErr("사유를 입력하세요.");
      return;
    }
    if (end <= start) {
      setErr("종료 시간이 시작 시간보다 늦어야 합니다.");
      return;
    }
    setBusy(true);
    const { data: inserted, error } = await supabase
      .from("passes")
      .insert({
        student_id: session!.user.id,
        type,
        reason: reason.trim().slice(0, 100),
        date,
        start_time: start,
        end_time: end,
        status: PASS_STATUS.PENDING,
      })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    // 담임에게 즉시 알림 (실패해도 신청 자체는 성공 처리)
    try {
      await supabase.functions.invoke("notify-pass", {
        body: { pass_id: inserted.id },
      });
    } catch {
      /* 알림 실패는 무시 */
    }
    setBusy(false);
    nav("/", { replace: true });
  }

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <h1>외출·조퇴 신청</h1>
        </div>
        <button className="btn-link" style={{ color: "#fff" }} onClick={() => nav(-1)}>
          취소
        </button>
      </div>

      <div className="content">
        <form onSubmit={submit} className="card">
          <label>구분</label>
          <div className="seg">
            <button
              type="button"
              className={type === PASS_TYPE.EARLY_LEAVE ? "active" : ""}
              onClick={() => setType(PASS_TYPE.EARLY_LEAVE)}
            >
              조퇴
            </button>
            <button
              type="button"
              className={type === PASS_TYPE.OUTING ? "active" : ""}
              onClick={() => setType(PASS_TYPE.OUTING)}
            >
              외출
            </button>
          </div>

          <label>일자</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>시작 시간</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>종료 예정</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <label>사유 (최대 100자)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 100))}
            placeholder="예: 치과 진료"
            maxLength={100}
          />
          <div className="muted" style={{ fontSize: 12, textAlign: "right" }}>
            {reason.length}/100
          </div>

          {err && <div className="error">{err}</div>}
          <button
            className="btn-primary"
            style={{ marginTop: 16 }}
            disabled={busy}
            type="submit"
          >
            {busy ? "신청 중…" : "신청하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
