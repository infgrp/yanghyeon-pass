import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, isConfigured } from "../lib/supabase";
import { buildHomeroom } from "../lib/constants";

// 인앱 브라우저(카카오톡 등) 감지 — 구글 OAuth 가 제한됨
const UA = typeof navigator !== "undefined" ? navigator.userAgent : "";
const IN_APP = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\/|DaumApps/i.test(UA);
const IS_KAKAO = /KAKAOTALK/i.test(UA);

function openInExternalBrowser() {
  const url = window.location.href;
  if (IS_KAKAO) {
    // 카카오톡 전용 스킴: 외부 브라우저(크롬/사파리)로 열기
    window.location.href =
      "kakaotalk://web/openExternal?url=" + encodeURIComponent(url);
  } else {
    // 그 외 인앱: 클립보드 복사 안내
    navigator.clipboard?.writeText(url).catch(() => {});
    alert("주소가 복사되었습니다. 크롬/사파리에 붙여넣어 열어주세요.\n" + url);
  }
}

/**
 * 로그인 / 회원가입 — Supabase Auth (이메일 + 비밀번호, 학교 계정)
 * 가입 시 메타데이터(name, role, student_id)를 넘기면 DB 트리거가 users 행을 생성합니다.
 */
export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [teacherCode, setTeacherCode] = useState("");
  const [hrGrade, setHrGrade] = useState("");
  const [hrClass, setHrClass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function signInWithGoogle() {
    setErr("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: "select_account", hd: "yanghyeon.hs.kr" },
      },
    });
    if (error) setErr(error.message);
  }

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
        if (pw !== pw2) throw new Error("비밀번호가 일치하지 않습니다.");
        const isTeacher = !!teacherCode.trim();
        // 교사는 담임반(학년/반) 필수
        let homeroom: string | null = null;
        if (isTeacher) {
          if (!hrGrade.trim() || !hrClass.trim())
            throw new Error("교사는 담임 학년과 반을 입력하세요.");
          homeroom = buildHomeroom(hrGrade, hrClass);
        }
        // 교사 가입 코드가 있으면 함께 전송 → 서버 트리거가 검증해 교사 권한 부여.
        // (역할은 클라이언트가 정하지 않고 서버가 코드로 판정합니다.)
        const { error } = await supabase.auth.signUp({
          email,
          password: pw,
          options: {
            data: {
              name: name.trim(),
              student_id: isTeacher ? null : studentId.trim() || null,
              signup_code: teacherCode.trim() || null,
              homeroom,
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

        {IN_APP && (
          <div className="notice" style={{ marginBottom: 12 }}>
            ⚠️ <b>카카오톡 등 앱 안의 화면</b>에서는 구글 로그인이 막힙니다.
            <div className="muted" style={{ fontSize: 12, margin: "6px 0 10px" }}>
              아래 버튼으로 <b>크롬/사파리</b>에서 열거나, 그냥 아래 <b>이메일·비밀번호</b>로 로그인하세요.
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%" }}
              onClick={openInExternalBrowser}
            >
              크롬/사파리로 열기
            </button>
          </div>
        )}

        <button
          type="button"
          className="btn-ghost"
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12, background: "#fff" }}
          onClick={signInWithGoogle}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.5C41.4 36.9 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"/>
          </svg>
          구글 계정으로 로그인
        </button>
        <div className="muted" style={{ fontSize: 12, textAlign: "center", marginBottom: 14 }}>
          학교 구글 계정(@yanghyeon.hs.kr) 권장 · 또는 아래 이메일/비번
        </div>

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
              {!!teacherCode.trim() && (
                <>
                  <label>담임 학년 / 반 (교사 필수)</label>
                  <div className="row" style={{ gap: 12 }}>
                    <input
                      value={hrGrade}
                      onChange={(e) => setHrGrade(e.target.value)}
                      placeholder="학년 (예: 3)"
                      inputMode="numeric"
                      maxLength={1}
                    />
                    <input
                      value={hrClass}
                      onChange={(e) => setHrClass(e.target.value)}
                      placeholder="반 (예: 1)"
                      inputMode="numeric"
                      maxLength={2}
                    />
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    담임반 학생의 외출·조퇴만 승인할 수 있습니다.
                  </div>
                </>
              )}
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
          {mode === "signup" && (
            <>
              <label>비밀번호 확인</label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
              {pw2 && pw !== pw2 && (
                <div className="error">비밀번호가 일치하지 않습니다.</div>
              )}
            </>
          )}
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
