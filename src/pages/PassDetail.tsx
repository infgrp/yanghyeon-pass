import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import PassCertificate from "../components/PassCertificate";
import { cachePass, readCachedPass } from "../lib/cache";
import { PASS_STATUS, trimTime } from "../lib/constants";
import type { PassCertificateData } from "../lib/types";

/**
 * 외출증 상세 — 가이드북 1-2 (로컬 캐싱 + 오프라인 검증)
 *
 * 1) 온라인: 서버에서 최소 JSON 조회 → 승인/완료 건이면 암호화 캐싱
 * 2) 오프라인: 서버 재요청 없이 로컬 캐시로 렌더링 (교문 제시용)
 */
export default function PassDetail() {
  const { id } = useParams();
  const passId = Number(id);
  const nav = useNavigate();
  const [cert, setCert] = useState<PassCertificateData | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    async function fetchOnline(): Promise<PassCertificateData> {
      const { data: pass, error } = await supabase
        .from("passes")
        .select(
          "id, student_id, type, reason, date, start_time, end_time, status, teacher_id, verify_token",
        )
        .eq("id", passId)
        .single();
      if (error || !pass) throw error ?? new Error("조회 실패");

      // 학생 정보 + (있으면) 담당교사 이름을 한 번에 조회
      const ids = [pass.student_id, pass.teacher_id].filter(Boolean) as string[];
      const { data: people } = await supabase
        .from("users")
        .select("id, name, student_id")
        .in("id", ids);
      const byId = new Map((people ?? []).map((p) => [p.id, p]));
      const student = byId.get(pass.student_id);
      const teacher = pass.teacher_id ? byId.get(pass.teacher_id) : null;

      return {
        pass_id: pass.id,
        student_no: student?.student_id ?? "",
        name: student?.name ?? "",
        type: pass.type,
        reason: pass.reason,
        date: pass.date,
        time_window: `${trimTime(pass.start_time)}-${trimTime(pass.end_time)}`,
        status: pass.status,
        teacher_name: teacher?.name ?? "",
        verify_token: pass.verify_token,
      };
    }

    (async () => {
      setLoading(true);
      setErr("");
      try {
        const data = await fetchOnline();
        if (!alive) return;
        setCert(data);
        setFromCache(false);
        // 승인/사용완료 건만 오프라인 검증용으로 캐싱
        if (data.status === PASS_STATUS.APPROVED || data.status === PASS_STATUS.USED) {
          await cachePass(data);
        }
      } catch {
        // 네트워크 실패 → 로컬 캐시 폴백
        const cached = await readCachedPass(passId);
        if (!alive) return;
        if (cached) {
          setCert(cached);
          setFromCache(true);
        } else {
          setErr("외출증을 불러올 수 없습니다. (오프라인이며 저장된 정보 없음)");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [passId]);

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <h1>외출·조퇴증</h1>
        </div>
        <button className="btn-link" style={{ color: "#fff" }} onClick={() => nav(-1)}>
          닫기
        </button>
      </div>
      <div className="content">
        {fromCache && (
          <div className="notice">
            📴 오프라인 모드 — 기기에 저장된 승인 정보로 표시 중입니다.
          </div>
        )}
        {loading ? (
          <div className="center muted">불러오는 중…</div>
        ) : err ? (
          <div className="error">{err}</div>
        ) : cert ? (
          <PassCertificate data={cert} />
        ) : null}
      </div>
    </div>
  );
}
