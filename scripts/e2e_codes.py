#!/usr/bin/env python3
"""교사 가입 코드 + 권한 가드 검증."""
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


def role_of(token, uid):
    st, d = req("GET", f"/rest/v1/users?id=eq.{uid}&select=role", token=token)
    return d[0]["role"] if d else None


tag = str(int(time.time()))[-6:]
PW = "test1234"
print("=" * 55)
print("  교사 코드 + 권한 가드 검증")
print("=" * 55)

# 1) 코드 없이 가입 → student
e = f"a{tag}@yanghyeon.hs.kr"
signup(e, PW, {"name": "무코드", "student_id": "10101"})
_, d = signin(e, PW); tok, uid = d["access_token"], d["user"]["id"]
r1 = role_of(tok, uid)
print(f"\n[1] 코드 없음        → role={r1}   기대=student   {'✅' if r1=='student' else '❌'}")

# 2) 올바른 코드 → teacher
e = f"b{tag}@yanghyeon.hs.kr"
signup(e, PW, {"name": "정상교사", "signup_code": "YH2026-TEACHER"})
_, d = signin(e, PW); tok2, uid2 = d["access_token"], d["user"]["id"]
r2 = role_of(tok2, uid2)
print(f"[2] 올바른 코드      → role={r2}   기대=teacher   {'✅' if r2=='teacher' else '❌'}")

# 3) 잘못된 코드 → student
e = f"c{tag}@yanghyeon.hs.kr"
signup(e, PW, {"name": "사칭", "signup_code": "WRONG-CODE"})
_, d = signin(e, PW); tok3, uid3 = d["access_token"], d["user"]["id"]
r3 = role_of(tok3, uid3)
print(f"[3] 잘못된 코드      → role={r3}   기대=student   {'✅' if r3=='student' else '❌'}")

# 4) 학생이 자기 role 을 admin 으로 변경 시도 → 가드가 차단
st, d = req("PATCH", f"/rest/v1/users?id=eq.{uid}", token=tok,
            body={"role": "admin"}, prefer="return=representation")
r4 = role_of(tok, uid)
blocked = (st >= 400) or (r4 == "student")
print(f"[4] 학생 self→admin  → HTTP {st}, role 여전히 {r4}   {'✅ 차단됨' if blocked else '❌ 뚫림!'}")

# 5) 학생이 직접 코드 발급 시도 → RLS 차단(0건)
st, d = req("POST", "/rest/v1/teacher_codes", token=tok,
            body={"code": "HACK"}, prefer="return=representation")
print(f"[5] 학생이 코드 발급  → HTTP {st}   {'✅ 차단됨' if st>=400 else '❌ 뚫림!'}  {d if st>=400 else ''}")

# 6) admin 계정 확인 (부트스트랩 결과)
st, d = signin("tea900125@yanghyeon.hs.kr", PW)
if st == 200:
    atok, auid = d["access_token"], d["user"]["id"]
    ar = role_of(atok, auid)
    st2, codes = req("GET", "/rest/v1/teacher_codes?select=code,active", token=atok)
    print(f"[6] admin 계정       → role={ar}, 코드 조회 {len(codes) if isinstance(codes,list) else codes}건   "
          f"{'✅' if ar=='admin' and isinstance(codes,list) else '❌'}")
else:
    print(f"[6] admin 로그인 실패: {st} {d}")

print("\n" + "=" * 55)
print("  검증 종료")
print("=" * 55)
