#!/usr/bin/env python3
"""담임반 기반 조회/승인 권한 검증.
   3학년 1반 담임은 30101 학생만 보이고 30201(2반) 학생은 못 본다."""
import json, time, urllib.request, urllib.error

URL = "https://uvqeandtehjvgamljvbd.supabase.co"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cWVhbmR0ZWhqdmdhbWxqdmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTQ4MTksImV4cCI6MjA5NjQ3MDgxOX0.1Yb1yoXgowd11C88U2gwCTeMh-hG5VYYRzBCiX0qaaw"


def req(method, path, token=None, body=None, prefer=None):
    h = {"apikey": ANON, "Content-Type": "application/json",
         "Authorization": f"Bearer {token or ANON}"}
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def signup(email, pw, meta):
    return req("POST", "/auth/v1/signup", body={"email": email, "password": pw, "data": meta})


def signin(email, pw):
    return req("POST", "/auth/v1/token?grant_type=password",
               body={"email": email, "password": pw})


tag = str(int(time.time()))[-6:]
PW = "test1234"
print("=" * 58)
print("  담임반 기반 권한 검증")
print("=" * 58)

# 학생 A: 3학년 1반 1번 (30101)
ea = f"s1_{tag}@yanghyeon.hs.kr"
signup(ea, PW, {"name": "1반학생", "student_id": "30101"})
_, da = signin(ea, PW); tok_a, uid_a = da["access_token"], da["user"]["id"]

# 학생 B: 3학년 2반 1번 (30201)
eb = f"s2_{tag}@yanghyeon.hs.kr"
signup(eb, PW, {"name": "2반학생", "student_id": "30201"})
_, db = signin(eb, PW); tok_b, uid_b = db["access_token"], db["user"]["id"]

# 각 학생이 외출 신청
for tok, uid, who in [(tok_a, uid_a, "1반학생"), (tok_b, uid_b, "2반학생")]:
    req("POST", "/rest/v1/passes", token=tok, body={
        "student_id": uid, "type": 2, "reason": f"{who} 외출",
        "date": "2026-06-08", "start_time": "14:00", "end_time": "16:00", "status": 0})
print(f"\n[준비] 1반학생(30101)·2반학생(30201) 각각 외출 신청 완료")

# 교사 T: 3학년 1반 담임 (homeroom=301)
et = f"t_{tag}@yanghyeon.hs.kr"
signup(et, PW, {"name": "1반담임", "signup_code": "yhteacher-2026", "homeroom": "301"})
_, dt = signin(et, PW); tok_t, uid_t = dt["access_token"], dt["user"]["id"]
st, hr = req("GET", f"/rest/v1/users?id=eq.{uid_t}&select=role,homeroom", token=tok_t)
print(f"[준비] 1반담임 가입: role={hr[0]['role']}, homeroom={hr[0]['homeroom']}")

# (1) 담임이 보는 대기 신청 목록 — 1반(30101)만 있어야 함
st, rows = req("GET", "/rest/v1/passes?status=eq.0&select=id,student_id,reason", token=tok_t)
sids = {r["student_id"] for r in rows}
sees_a = uid_a in sids
sees_b = uid_b in sids
print(f"\n[1] 담임 조회: {len(rows)}건  1반학생 보임={sees_a}  2반학생 보임={sees_b}")
print(f"    기대: 1반=True, 2반=False   {'✅' if sees_a and not sees_b else '❌'}")

# (2) 담임이 1반학생 신청 승인 → 성공
pa = next(r["id"] for r in rows if r["student_id"] == uid_a)
st, d = req("PATCH", f"/rest/v1/passes?id=eq.{pa}", token=tok_t,
            body={"status": 1, "teacher_id": uid_t}, prefer="return=representation")
ok2 = st == 200 and d and d[0]["status"] == 1
print(f"[2] 담임이 1반학생 승인 → HTTP {st}  {'✅ 승인됨' if ok2 else '❌'}")

# (3) 담임이 2반학생 신청 승인 시도 → 0건 영향(권한 없음)
#     먼저 2반학생 pass id 를 2반학생 토큰으로 확인
_, brows = req("GET", "/rest/v1/passes?status=eq.0&select=id", token=tok_b)
pb = brows[0]["id"] if brows else None
st, d = req("PATCH", f"/rest/v1/passes?id=eq.{pb}", token=tok_t,
            body={"status": 1, "teacher_id": uid_t}, prefer="return=representation")
# RLS 로 매칭 0건 → 200 이지만 빈 배열(변경 없음)
changed = bool(d) and len(d) > 0
print(f"[3] 담임이 2반학생 승인 시도 → HTTP {st}, 변경 {len(d) if isinstance(d,list) else d}건  "
      f"{'✅ 차단됨(0건)' if not changed else '❌ 뚫림!'}")

# (4) 2반학생 본인이 확인 → 여전히 대기(0)
st, d = req("GET", f"/rest/v1/passes?id=eq.{pb}&select=status", token=tok_b)
print(f"[4] 2반학생 재확인 → status={d[0]['status']} (0=대기)  "
      f"{'✅ 그대로' if d[0]['status']==0 else '❌'}")

print("\n" + "=" * 58)
print("  검증 종료")
print("=" * 58)
