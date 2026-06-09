import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { buildHomeroom, SCHOOL_NAME } from "../lib/constants";

/**
 * 온보딩 — 구글 로그인 후 프로필(학번/교사) 완성.
 * 서버(onboard 함수)가 학번 형식·교사코드를 검증해 역할을 확정합니다.
 */
export default function Onboarding() {
  const { profile, refreshProfile, signOut } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"student" | "teacher">("student");
  const [studentId, setStudentId] = useState("");
  const [code, setCode] = useState("");
  const [grade, setGrade] = useState("");
  const [klass, setKlass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const body: Record<string, unknown> = { mode };
    if (mode === "student") {
      if (!/^\d{5}$/.test(studentId.trim())) {
        setErr("학번 5자리를 정확히 입력하세요 (예: 30101).");
        return;
      }
      body.student_id = studentId.trim();
    } else {
      if (!code.trim()) {
        setErr("교사 가입 코드를 입력하세요.");
        return;
      }
      if (!grade.trim() || !klass.trim()) {
        setErr("담임 학년과 반을 입력하세요.");
        return;
      }
      body.signup_code = code.trim();
      body.homeroom = buildHomeroom(grade, klass);
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboard", { body });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      await refreshProfile();
      nav("/", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <h1>최초 등록</h1>
          <div className="sub">
            {profile?.name}님 · {SCHOOL_NAME}
          </div>
        </div>
        <button className="btn-link" style={{ color: "#fff" }} onClick={signOut}>
          로그아웃
        </button>
      </div>

      <div className="content">
        <div className="notice">
          처음 오셨네요. 본인 정보를 한 번만 등록하면 됩니다.
        </div>

        <div className="seg" style={{ marginBottom: 16 }}>
          <button
            className={mode === "student" ? "active" : ""}
            onClick={() => setMode("student")}
            type="button"
          >
            학생
          </button>
          <button
            className={mode === "teacher" ? "active" : ""}
            onClick={() => setMode("teacher")}
            type="button"
          >
            교사
          </button>
        </div>

        <form onSubmit={submit} className="card">
          {mode === "student" ? (
            <>
              <label>학번 (예: 30101 = 3학년 1반 1번)</label>
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="30101"
                inputMode="numeric"
                maxLength={5}
              />
            </>
          ) : (
            <>
              <label>교사 가입 코드</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="교직원에게 배포된 코드"
                autoComplete="off"
              />
              <label>담임 학년 / 반</label>
              <div className="row" style={{ gap: 12 }}>
                <input
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="학년 (예: 3)"
                  inputMode="numeric"
                  maxLength={1}
                />
                <input
                  value={klass}
                  onChange={(e) => setKlass(e.target.value)}
                  placeholder="반 (예: 1)"
                  inputMode="numeric"
                  maxLength={2}
                />
              </div>
            </>
          )}
          {err && <div className="error">{err}</div>}
          <button className="btn-primary" style={{ marginTop: 16 }} disabled={busy} type="submit">
            {busy ? "등록 중…" : "등록 완료"}
          </button>
        </form>
      </div>
    </div>
  );
}
