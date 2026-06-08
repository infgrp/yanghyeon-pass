import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, isConfigured } from "../lib/supabase";

/**
 * 로그인 / 회원가입 — Supabase Auth (이메일 + 비밀번호, 학교 계정)
 * 가입 시 메타데이터(name, role, student_id)를 넘기면 DB 트리거가 users 행을 생성합니다.
 */
export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [teacherCode, setTeacherCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: pw,
        });
        if (error) throw error;
        nav("/", { replace: true });
      } else {
        if (!name.trim()) throw new Error("이름을 입력하세요.");
        // 교사 가입 코드가 있으면 함께 전송 → 서버 트리거가 검증해 교사 권한 부여.
        // (역할은 클라이언트가 정하지 않고 서버가 코드로 판정합니다.)
        const { error } = await supabase.auth.signUp({
          email,
          password: pw,
          options: {
            data: {
              name: name.trim(),
              student_id: teacherCode.trim() ? null : studentId.trim() || null,
              signup_code: teacherCode.trim() || null,
            },
          },
        });
        if (error) throw error;
        setMsg("가입 완료. 이메일 인증 후 로그인하세요. (설정에 따라 즉시 로그인될 수 있습니다.)");
        setMode("login");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <h1>양현고 외출·조퇴증</h1>
          <div className="sub">스마트 외출·조퇴 시스템</div>
        </div>
      </div>
      <div className="content">
        {!isConfigured && (
          <div className="notice">
            ⚠️ Supabase 환경변수가 설정되지 않았습니다. <code>.env</code> 파일에
            VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 입력하세요.
          </div>
        )}

        <div className="seg" style={{ marginBottom: 16 }}>
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
            type="button"
          >
            로그인
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => setMode("signup")}
            type="button"
          >
            회원가입
          </button>
        </div>

        <form onSubmit={submit} className="card">
          {mode === "signup" && (
            <>
              <label>이름</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                autoComplete="name"
              />
              <label>학번 (예: 30101 = 3학년 1반 1번)</label>
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="30101"
                inputMode="numeric"
                maxLength={5}
                disabled={!!teacherCode.trim()}
              />
              <label>교사 가입 코드 (교사만 입력)</label>
              <input
                value={teacherCode}
                onChange={(e) => setTeacherCode(e.target.value)}
                placeholder="교직원에게 배포된 코드"
                autoComplete="off"
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                코드를 입력하면 교사 계정으로 가입됩니다. 학생은 비워두세요.
              </div>
            </>
          )}
          <label>이메일 (학교 계정)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="id@yanghyeon.hs.kr"
            autoComplete="email"
            required
          />
          <label>비밀번호</label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={6}
          />
          {err && <div className="error">{err}</div>}
          {msg && <div className="notice" style={{ marginTop: 12 }}>{msg}</div>}
          <button
            className="btn-primary"
            style={{ marginTop: 16 }}
            disabled={busy}
            type="submit"
          >
            {busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
