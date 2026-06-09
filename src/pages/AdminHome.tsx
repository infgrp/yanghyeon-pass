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

interface ManagedUser {
  id: string;
  name: string;
  student_id: string | null;
  role: string;
  homeroom: string | null;
  email: string | null;
}

type Tab = "codes" | "users" | "account";

export default function AdminHome() {
  const { profile, session, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("codes");
  const [codes, setCodes] = useState<TeacherCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 새 코드 입력
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  // 사용자 관리
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userBusy, setUserBusy] = useState(false);
  const [userMsg, setUserMsg] = useState("");
  const [userErr, setUserErr] = useState("");
  // 학년/반 필터 + 다중 선택
  const [grade, setGrade] = useState("");
  const [klass, setKlass] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function runSearch(opts: { query?: string; prefix?: string }) {
    setUserErr("");
    setUserMsg("");
    setSelected(new Set());
    setUserBusy(true);
    try {
      const body: Record<string, unknown> = { action: "search" };
      if (opts.prefix) body.student_prefix = opts.prefix;
      else body.query = (opts.query ?? "").trim();
      const data = await callAdminFn(body);
      setUsers((data.users ?? []) as ManagedUser[]);
      if ((data.users ?? []).length === 0) setUserMsg("결과가 없습니다.");
    } catch (e) {
      setUserErr(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setUserBusy(false);
    }
  }

  function filterBy(g: string, k: string) {
    setGrade(g);
    setKlass(k);
    if (!g) {
      runSearch({ query: userQuery });
      return;
    }
    const prefix = k ? `${g}${k.padStart(2, "0")}` : g;
    runSearch({ prefix });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const deletableIds = users.filter((u) => u.role !== "admin").map((u) => u.id);
  const allSelected = deletableIds.length > 0 && deletableIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(deletableIds));
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}명을 삭제할까요? (관리자 계정은 자동 제외)`)) return;
    setUserErr("");
    setUserMsg("");
    setUserBusy(true);
    try {
      const data = await callAdminFn({ action: "delete_users", target_ids: ids });
      setUserMsg(`🗑️ ${data.deleted}명 삭제 완료${data.skipped ? ` (제외 ${data.skipped}명)` : ""}.`);
      setSelected(new Set());
      // 현재 필터 유지하며 재조회
      if (grade) filterBy(grade, klass);
      else runSearch({ query: userQuery });
    } catch (e) {
      setUserErr(e instanceof Error ? e.message : "일괄 삭제 실패");
    } finally {
      setUserBusy(false);
    }
  }

  // 내 비밀번호 변경
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  async function changeMyPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr("");
    setPwMsg("");
    if (pw1.length < 6) {
      setPwErr("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (pw1 !== pw2) {
      setPwErr("비밀번호가 일치하지 않습니다.");
      return;
    }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setPwBusy(false);
    if (error) {
      setPwErr(error.message);
      return;
    }
    setPw1("");
    setPw2("");
    setPwMsg("✅ 비밀번호가 변경되었습니다.");
  }

  async function callAdminFn(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("admin-users", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function searchUsers(e?: React.FormEvent) {
    e?.preventDefault();
    setGrade("");
    setKlass("");
    await runSearch({ query: userQuery });
  }

  // 개별 작업 후 현재 보기(학년/반 필터 또는 검색어) 유지하며 재조회
  function refreshUsers() {
    if (grade) {
      const prefix = klass ? `${grade}${klass.padStart(2, "0")}` : grade;
      runSearch({ prefix });
    } else {
      runSearch({ query: userQuery });
    }
  }

  async function resetPw(u: ManagedUser) {
    if (!confirm(`${u.name}님의 비밀번호를 초기화할까요?`)) return;
    setUserErr("");
    setUserMsg("");
    try {
      const data = await callAdminFn({ action: "reset_password", target_id: u.id });
      setUserMsg(`✅ ${u.name}님 임시 비밀번호: ${data.temp_password}  (본인에게 전달 후 변경 안내)`);
    } catch (e) {
      setUserErr(e instanceof Error ? e.message : "초기화 실패");
    }
  }

  async function changeEmail(u: ManagedUser) {
    const next = prompt(`${u.name}님의 새 이메일(아이디):`, u.email ?? "");
    if (!next || !next.trim()) return;
    setUserErr("");
    setUserMsg("");
    try {
      await callAdminFn({ action: "change_email", target_id: u.id, new_email: next.trim() });
      setUserMsg(`✅ ${u.name}님 이메일을 ${next.trim()} 로 변경했습니다.`);
      refreshUsers();
    } catch (e) {
      setUserErr(e instanceof Error ? e.message : "이메일 변경 실패");
    }
  }

  async function setHomeroom(u: ManagedUser) {
    const next = prompt(
      `${u.name}님 담임반 (예: 303 = 3학년 3반, 비우면 해제):`,
      u.homeroom ?? "",
    );
    if (next === null) return;
    setUserErr("");
    setUserMsg("");
    try {
      const data = await callAdminFn({
        action: "set_homeroom",
        target_id: u.id,
        homeroom: next.trim(),
      });
      setUserMsg(`✅ ${u.name}님 담임반을 ${data.homeroom ?? "해제"} 로 설정했습니다.`);
      refreshUsers();
    } catch (e) {
      setUserErr(e instanceof Error ? e.message : "담임반 설정 실패");
    }
  }

  async function deleteUser(u: ManagedUser) {
    if (u.role === "admin") {
      setUserErr("관리자 계정은 삭제할 수 없습니다.");
      return;
    }
    if (
      !confirm(
        `${u.name}님(${u.email}) 계정을 완전히 삭제할까요?\n신청 내역도 함께 삭제되며, 같은 이메일로 다시 가입할 수 있습니다.`,
      )
    )
      return;
    setUserErr("");
    setUserMsg("");
    try {
      await callAdminFn({ action: "delete_user", target_id: u.id });
      setUserMsg(`🗑️ ${u.name}님 계정을 삭제했습니다. 이제 재가입할 수 있습니다.`);
      refreshUsers();
    } catch (e) {
      setUserErr(e instanceof Error ? e.message : "삭제 실패");
    }
  }

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
          <h1>관리자</h1>
          <div className="sub">{profile?.name} (admin)</div>
        </div>
        <button className="btn-link" style={{ color: "#fff" }} onClick={signOut}>
          로그아웃
        </button>
      </div>

      <div className="content">
        <div className="seg" style={{ marginBottom: 16 }}>
          <button
            className={tab === "codes" ? "active" : ""}
            onClick={() => setTab("codes")}
          >
            교사 코드
          </button>
          <button
            className={tab === "users" ? "active" : ""}
            onClick={() => setTab("users")}
          >
            사용자 관리
          </button>
          <button
            className={tab === "account" ? "active" : ""}
            onClick={() => setTab("account")}
          >
            내 계정
          </button>
        </div>

        {tab === "account" && (
          <form onSubmit={changeMyPassword} className="card">
            <div className="title" style={{ fontWeight: 700, marginBottom: 4 }}>
              🔑 내 비밀번호 변경
            </div>
            <div className="meta" style={{ marginBottom: 8 }}>
              {profile?.name} ({profile?.role})
            </div>
            <label>새 비밀번호</label>
            <input
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              autoComplete="new-password"
              minLength={6}
            />
            <label>새 비밀번호 확인</label>
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
              minLength={6}
            />
            {pw2 && pw1 !== pw2 && (
              <div className="error">비밀번호가 일치하지 않습니다.</div>
            )}
            {pwErr && <div className="error">{pwErr}</div>}
            {pwMsg && <div className="notice" style={{ marginTop: 12 }}>{pwMsg}</div>}
            <button className="btn-primary" style={{ marginTop: 16 }} disabled={pwBusy} type="submit">
              {pwBusy ? "변경 중…" : "비밀번호 변경"}
            </button>
          </form>
        )}

        {tab === "users" && (
          <>
            <form onSubmit={searchUsers} className="card">
              <div className="title" style={{ fontWeight: 700, marginBottom: 4 }}>
                사용자 검색
              </div>
              <label>이름 또는 학번</label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="비우고 검색하면 전체"
                />
                <button
                  className="btn-primary"
                  style={{ width: "auto", paddingInline: 20 }}
                  disabled={userBusy}
                  type="submit"
                >
                  {userBusy ? "검색…" : "검색"}
                </button>
              </div>
              {userErr && <div className="error">{userErr}</div>}
              {userMsg && (
                <div className="notice" style={{ marginTop: 12 }}>
                  {userMsg}
                </div>
              )}
            </form>

            {/* 학년 / 반 필터 */}
            <div className="card">
              <label style={{ marginTop: 0 }}>학년</label>
              <div className="seg" style={{ flexWrap: "wrap", gap: 6 }}>
                <button
                  className={grade === "" ? "active" : ""}
                  onClick={() => filterBy("", "")}
                >
                  전체
                </button>
                {["1", "2", "3"].map((g) => (
                  <button
                    key={g}
                    className={grade === g ? "active" : ""}
                    onClick={() => filterBy(g, "")}
                  >
                    {g}학년
                  </button>
                ))}
              </div>
              {grade && (
                <>
                  <label>반</label>
                  <div className="seg" style={{ flexWrap: "wrap", gap: 6 }}>
                    <button
                      className={klass === "" ? "active" : ""}
                      onClick={() => filterBy(grade, "")}
                    >
                      전체
                    </button>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((k) => (
                      <button
                        key={k}
                        className={klass === k ? "active" : ""}
                        style={{ flex: "0 0 auto", minWidth: 44 }}
                        onClick={() => filterBy(grade, k)}
                      >
                        {k}반
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 다중 선택 / 일괄 삭제 바 */}
            {users.length > 0 && (
              <div
                className="card row spread"
                style={{ alignItems: "center", position: "sticky", top: 64, zIndex: 5 }}
              >
                <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    style={{ width: 18, height: 18 }}
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                  전체 선택 ({selected.size}명)
                </label>
                <button
                  className="btn-reject"
                  style={{ width: "auto", paddingInline: 18, opacity: selected.size ? 1 : 0.5 }}
                  disabled={selected.size === 0 || userBusy}
                  onClick={deleteSelected}
                >
                  선택 삭제
                </button>
              </div>
            )}

            {users.map((u) => (
              <div className="card" key={u.id}>
                <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    style={{ width: 18, height: 18, marginTop: 3 }}
                    checked={selected.has(u.id)}
                    disabled={u.role === "admin"}
                    onChange={() => toggleSelect(u.id)}
                    title={u.role === "admin" ? "관리자는 선택 삭제 불가" : undefined}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="title">
                      {u.name}{" "}
                      <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
                        {u.role}
                        {u.student_id ? ` · ${u.student_id}` : ""}
                        {u.homeroom ? ` · 담임 ${u.homeroom}` : ""}
                      </span>
                    </div>
                    <div className="meta">{u.email ?? "이메일 없음"}</div>
                  </div>
                </div>
                <div className="row" style={{ marginTop: 12, gap: 8 }}>
                  <button
                    className="btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => resetPw(u)}
                  >
                    비밀번호 초기화
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => changeEmail(u)}
                  >
                    이메일 변경
                  </button>
                </div>
                <div className="row" style={{ marginTop: 8, gap: 8 }}>
                  <button
                    className="btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => setHomeroom(u)}
                  >
                    담임반 지정
                  </button>
                  <button
                    className="btn-reject"
                    style={{ flex: 1 }}
                    onClick={() => deleteUser(u)}
                    disabled={u.role === "admin"}
                    title={u.role === "admin" ? "관리자 계정은 삭제할 수 없습니다" : undefined}
                  >
                    {u.role === "admin" ? "삭제 불가(관리자)" : "계정 삭제"}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "codes" && (
        <>
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
        </>
        )}
      </div>
    </div>
  );
}
