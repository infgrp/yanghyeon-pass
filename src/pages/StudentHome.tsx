import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Pass, PointEntry } from "../lib/types";
import {
  TYPE_LABEL,
  STATUS_LABEL,
  STATUS_COLOR,
  POINT_LABEL,
  POINT_COLOR,
  formatStudentId,
  trimTime,
} from "../lib/constants";

export default function StudentHome() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const [passes, setPasses] = useState<Pass[]>([]);
  const [points, setPoints] = useState<PointEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    // 데이터 절약: 필요한 컬럼만, 최근 30건만 조회
    const { data, error } = await supabase
      .from("passes")
      .select("id, type, reason, date, start_time, end_time, status, teacher_id")
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .limit(30);
    if (error) setErr(error.message);
    else setPasses((data ?? []) as Pass[]);
    // 내 상벌점 (RLS: 본인 것만)
    const { data: pts } = await supabase
      .from("points")
      .select("id, kind, amount, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setPoints((pts ?? []) as PointEntry[]);
    setLoading(false);
  }

  const merit = points.filter((p) => p.kind === 2).reduce((s, p) => s + p.amount, 0);
  const demerit = points.filter((p) => p.kind === 1).reduce((s, p) => s + p.amount, 0);

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <h1>내 외출·조퇴증</h1>
          <div className="sub">
            {profile?.name} · {formatStudentId(profile?.student_id)}
          </div>
        </div>
        <button className="btn-link" style={{ color: "#fff" }} onClick={signOut}>
          로그아웃
        </button>
      </div>

      <div className="content">
        {!loading && (
          <details className="card">
            <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="title" style={{ fontSize: 15 }}>🏅 내 상벌점</span>
              <span className="row" style={{ gap: 10 }}>
                <span style={{ color: POINT_COLOR[2], fontWeight: 700 }}>상점 {merit}</span>
                <span style={{ color: POINT_COLOR[1], fontWeight: 700 }}>벌점 {demerit}</span>
                <span className="badge" style={{ background: merit - demerit >= 0 ? POINT_COLOR[2] : POINT_COLOR[1] }}>
                  {merit - demerit > 0 ? "+" : ""}{merit - demerit}
                </span>
              </span>
            </summary>
            <div style={{ marginTop: 10 }}>
              {points.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>받은 상벌점이 없습니다.</div>
              ) : (
                points.map((p) => (
                  <div key={p.id} className="row spread" style={{ padding: "7px 0", borderTop: "1px solid var(--line)" }}>
                    <div>
                      <span className="badge" style={{ background: POINT_COLOR[p.kind] }}>{POINT_LABEL[p.kind]} {p.amount}</span>
                      <span style={{ marginLeft: 8 }}>{p.reason}</span>
                    </div>
                    <span className="meta">{p.created_at.slice(0, 10)}</span>
                  </div>
                ))
              )}
            </div>
          </details>
        )}

        {loading ? (
          <div className="center muted">불러오는 중…</div>
        ) : err ? (
          <div className="error">{err}</div>
        ) : passes.length === 0 ? (
          <div className="card muted" style={{ textAlign: "center" }}>
            아직 신청 내역이 없습니다.
            <br />
            아래 버튼으로 외출·조퇴를 신청하세요.
          </div>
        ) : (
          passes.map((p) => (
            <Link to={`/pass/${p.id}`} key={p.id} className="card list-item">
              <div>
                <div className="title">
                  {TYPE_LABEL[p.type]} · {p.date}
                </div>
                <div className="meta">
                  {trimTime(p.start_time)}–{trimTime(p.end_time)} · {p.reason}
                </div>
              </div>
              <span
                className="badge"
                style={{ background: STATUS_COLOR[p.status] }}
              >
                {STATUS_LABEL[p.status]}
              </span>
            </Link>
          ))
        )}

        <button
          className="btn-primary fab"
          onClick={() => nav("/apply")}
        >
          + 외출·조퇴 신청
        </button>
      </div>
    </div>
  );
}
