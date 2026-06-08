import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

interface TeacherCode {
  code: string;
  label: string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

export default function AdminHome() {
  const { profile, session, signOut } = useAuth();
  const [codes, setCodes] = useState<TeacherCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 새 코드 입력
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const { data, error } = await supabase
      .from("teacher_codes")
      .select("code, label, active, expires_at, created_at")
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setCodes((data ?? []) as TeacherCode[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createCode(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const code = newCode.trim();
    if (!code) {
      setErr("코드를 입력하세요.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("teacher_codes").insert({
      code,
      label: newLabel.trim() || null,
      expires_at: newExpiry ? new Date(newExpiry).toISOString() : null,
      created_by: session!.user.id,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setNewCode("");
    setNewLabel("");
    setNewExpiry("");
    load();
  }

  async function toggleActive(code: string, active: boolean) {
    const { error } = await supabase
      .from("teacher_codes")
      .update({ active: !active })
      .eq("code", code);
    if (error) setErr(error.message);
    else load();
  }

  async function remove(code: string) {
    const { error } = await supabase.from("teacher_codes").delete().eq("code", code);
    if (error) setErr(error.message);
    else load();
  }

  function isExpired(c: TeacherCode): boolean {
    return !!c.expires_at && new Date(c.expires_at) <= new Date();
  }

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <h1>관리자 · 교사 가입 코드</h1>
          <div className="sub">{profile?.name} (admin)</div>
        </div>
        <button className="btn-link" style={{ color: "#fff" }} onClick={signOut}>
          로그아웃
        </button>
      </div>

      <div className="content">
        <form onSubmit={createCode} className="card">
          <div className="title" style={{ fontWeight: 700, marginBottom: 4 }}>
            새 코드 발급
          </div>
          <label>코드</label>
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="예: YH2026-TEACHER"
            autoComplete="off"
          />
          <label>메모 (선택)</label>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="예: 2026 1학기 교직원"
            maxLength={50}
          />
          <label>만료일 (선택 · 비우면 무기한)</label>
          <input
            type="date"
            value={newExpiry}
            onChange={(e) => setNewExpiry(e.target.value)}
          />
          {err && <div className="error">{err}</div>}
          <button
            className="btn-primary"
            style={{ marginTop: 16 }}
            disabled={busy}
            type="submit"
          >
            {busy ? "발급 중…" : "코드 발급"}
          </button>
        </form>

        {loading ? (
          <div className="center muted">불러오는 중…</div>
        ) : codes.length === 0 ? (
          <div className="card muted" style={{ textAlign: "center" }}>
            발급된 코드가 없습니다.
          </div>
        ) : (
          codes.map((c) => {
            const expired = isExpired(c);
            const live = c.active && !expired;
            return (
              <div className="card" key={c.code}>
                <div className="row spread">
                  <div>
                    <div className="title" style={{ fontFamily: "monospace" }}>
                      {c.code}
                    </div>
                    <div className="meta">
                      {c.label || "—"}
                      {c.expires_at
                        ? ` · ~${c.expires_at.slice(0, 10)}`
                        : " · 무기한"}
                    </div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: live ? "#1f7a3d" : expired ? "#b8860b" : "#5a5a5a",
                    }}
                  >
                    {expired ? "만료" : c.active ? "활성" : "비활성"}
                  </span>
                </div>
                <div className="row" style={{ marginTop: 12, gap: 8 }}>
                  <button
                    className="btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => toggleActive(c.code, c.active)}
                  >
                    {c.active ? "비활성화" : "활성화"}
                  </button>
                  <button
                    className="btn-reject"
                    style={{ flex: 1 }}
                    onClick={() => remove(c.code)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
