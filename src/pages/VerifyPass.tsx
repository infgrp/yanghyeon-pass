import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { STATUS_COLOR, SCHOOL_NAME, formatStudentId } from "../lib/constants";

interface VerifyResult {
  valid: boolean;
  reason?: string;
  pass_id?: number;
  status?: number;
  status_label?: string;
  type_label?: string;
  name?: string;
  student_no?: string;
  date?: string;
  time_window?: string;
  teacher_name?: string;
  updated_at?: string;
  server_time?: string;
}

/**
 * 공개 외출증 검증 페이지 (교문 경비용) — 로그인 불필요.
 * QR(/verify/:id?t=token) 스캔 시 진입. 서버가 실시간 상태를 응답하므로
 * 위조된 이미지로는 통과할 수 없습니다.
 */
export default function VerifyPass() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("t") ?? "";
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [checkedAt, setCheckedAt] = useState("");

  const verify = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase.functions.invoke("verify-pass", {
        body: { pass_id: Number(id), token },
      });
      if (error) throw new Error(error.message);
      setRes(data as VerifyResult);
      setCheckedAt(new Date().toLocaleString("ko-KR", { hour12: false }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "검증 실패");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    verify();
  }, [verify]);

  const statusColor = res?.status != null ? STATUS_COLOR[res.status] : "#b23b3b";

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <h1>외출·조퇴 진위 확인</h1>
          <div className="sub">{SCHOOL_NAME} · 실시간 검증</div>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div className="center muted">서버에 확인 중…</div>
        ) : err ? (
          <div className="error">{err}</div>
        ) : !res?.valid ? (
          <div className="verify-card invalid">
            <div className="verify-mark">✕</div>
            <div className="verify-status" style={{ color: "#b23b3b" }}>
              유효하지 않음
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              {res?.reason ?? "검증할 수 없는 외출증입니다."}
            </div>
          </div>
        ) : (
          <>
            <div
              className="verify-card"
              style={{ borderColor: statusColor }}
            >
              <div className="verify-mark" style={{ color: statusColor }}>
                {res.status === 1 ? "✓" : res.status === 3 ? "↩" : "！"}
              </div>
              <div className="verify-status" style={{ color: statusColor }}>
                {res.status_label}
              </div>
              <div className="verify-sub">
                {res.type_label} · {res.date}
              </div>

              <div className="verify-rows">
                <div>
                  <span className="k">성명</span>
                  <span className="v">{res.name}</span>
                </div>
                <div>
                  <span className="k">학번</span>
                  <span className="v">{formatStudentId(res.student_no)}</span>
                </div>
                <div>
                  <span className="k">시간</span>
                  <span className="v">{res.time_window}</span>
                </div>
                <div>
                  <span className="k">담당</span>
                  <span className="v">{res.teacher_name || "—"}</span>
                </div>
              </div>
            </div>

            {res.status === 1 && (
              <div className="notice" style={{ background: "#e8f6ed", borderColor: "#bfe3cb", color: "#1f7a3d" }}>
                ✅ 학교 서버가 <b>실시간 승인</b> 상태로 확인했습니다.
              </div>
            )}
            {res.status === 3 && (
              <div className="notice">⚠️ 이미 <b>사용완료</b> 처리된 외출증입니다.</div>
            )}
            {(res.status === 0 || res.status === 2) && (
              <div className="notice" style={{ background: "#fdeaea", borderColor: "#f3c0c0", color: "#b23b3b" }}>
                ⚠️ 아직 승인되지 않았거나 반려된 외출증입니다. 통과시키지 마세요.
              </div>
            )}
          </>
        )}

        <div className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 8 }}>
          {checkedAt && `확인 시각 ${checkedAt}`}
        </div>
        <button className="btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={verify}>
          다시 확인
        </button>
      </div>
    </div>
  );
}
