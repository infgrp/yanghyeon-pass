import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { PassWithStudent } from "../lib/types";
import {
  PASS_STATUS,
  TYPE_LABEL,
  STATUS_LABEL,
  STATUS_COLOR,
  formatStudentId,
  trimTime,
} from "../lib/constants";

type Tab = "pending" | "done";

export default function TeacherHome() {
  const { profile, session, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<PassWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [actingId, setActingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    // 학생 정보를 조인하여 한 번에 조회 (FK 기반 임베딩)
    let q = supabase
      .from("passes")
      .select(
        "id, student_id, type, reason, date, start_time, end_time, status, teacher_id, student:users!passes_student_id_fkey(name, student_id)",
      )
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .limit(50);

    q =
      tab === "pending"
        ? q.eq("status", PASS_STATUS.PENDING)
        : q.neq("status", PASS_STATUS.PENDING);

    const { data, error } = await q;
    if (error) setErr(error.message);
    else setRows((data ?? []) as unknown as PassWithStudent[]);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: number, status: number) {
    setActingId(id);
    const { error } = await supabase
      .from("passes")
      .update({ status, teacher_id: session!.user.id })
      .eq("id", id);
    setActingId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    // 처리된 건은 목록에서 제거 (대기 탭) 혹은 갱신
    load();
  }

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <h1>외출·조퇴 승인</h1>
          <div className="sub">{profile?.name} 선생님</div>
        </div>
        <button className="btn-link" style={{ color: "#fff" }} onClick={signOut}>
          로그아웃
        </button>
      </div>

      <div className="content">
        <div className="seg" style={{ marginBottom: 16 }}>
          <button
            className={tab === "pending" ? "active" : ""}
            onClick={() => setTab("pending")}
          >
            대기중
          </button>
          <button
            className={tab === "done" ? "active" : ""}
            onClick={() => setTab("done")}
          >
            처리완료
          </button>
        </div>

        {loading ? (
          <div className="center muted">불러오는 중…</div>
        ) : err ? (
          <div className="error">{err}</div>
        ) : rows.length === 0 ? (
          <div className="card muted" style={{ textAlign: "center" }}>
            {tab === "pending" ? "대기중인 신청이 없습니다." : "처리한 내역이 없습니다."}
          </div>
        ) : (
          rows.map((p) => (
            <div className="card" key={p.id}>
              <div className="row spread">
                <div className="title">
                  {p.student?.name ?? "학생"}{" "}
                  <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
                    {formatStudentId(p.student?.student_id)}
                  </span>
                </div>
                <span className="badge" style={{ background: STATUS_COLOR[p.status] }}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
              <div className="meta" style={{ marginTop: 6, color: "var(--muted)", fontSize: 14 }}>
                {TYPE_LABEL[p.type]} · {p.date} · {trimTime(p.start_time)}–
                {trimTime(p.end_time)}
              </div>
              <div style={{ marginTop: 6 }}>{p.reason}</div>

              {p.status === PASS_STATUS.PENDING ? (
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    className="btn-approve"
                    disabled={actingId === p.id}
                    onClick={() => decide(p.id, PASS_STATUS.APPROVED)}
                  >
                    승인
                  </button>
                  <button
                    className="btn-reject"
                    disabled={actingId === p.id}
                    onClick={() => decide(p.id, PASS_STATUS.REJECTED)}
                  >
                    반려
                  </button>
                </div>
              ) : p.status === PASS_STATUS.APPROVED ? (
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    className="btn-ghost"
                    style={{ flex: 1 }}
                    disabled={actingId === p.id}
                    onClick={() => decide(p.id, PASS_STATUS.USED)}
                  >
                    사용완료 처리 (하교)
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
