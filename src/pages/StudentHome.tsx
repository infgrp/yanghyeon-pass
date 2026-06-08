import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Pass } from "../lib/types";
import {
  TYPE_LABEL,
  STATUS_LABEL,
  STATUS_COLOR,
  formatStudentId,
  trimTime,
} from "../lib/constants";

export default function StudentHome() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const [passes, setPasses] = useState<Pass[]>([]);
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
    setLoading(false);
  }

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
