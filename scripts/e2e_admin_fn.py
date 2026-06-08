#!/usr/bin/env python3
"""admin-users Edge Function 검증:
   - 관리자만 호출 가능(학생/교사는 403)
   - 비밀번호 초기화가 실제로 적용되는지"""
import json, time, urllib.request, urllib.error

BASE = "https://uvqeandtehjvgamljvbd.supabase.co"
FN = BASE + "/functions/v1/admin-users"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cWVhbmR0ZWhqdmdhbWxqdmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTQ4MTksImV4cCI6MjA5NjQ3MDgxOX0.1Yb1yoXgowd11C88U2gwCTeMh-hG5VYYRzBCiX0qaaw"


def post(url, token, body):
    h = {"apikey": ANON, "Content-Type": "application/json",
         "Authorization": f"Bearer {token}"}
    r = urllib.request.Request(url, data=json.dumps(body).encode(), headers=h, method="POST")
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def signin(email, pw):
    h = {"apikey": ANON, "Content-Type": "application/json", "Authorization": f"Bearer {ANON}"}
    r = urllib.request.Request(BASE + "/auth/v1/token?grant_type=password",
                               data=json.dumps({"email": email, "password": pw}).encode(),
                               headers=h, method="POST")
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()}


def signup(email, pw, meta):
    h = {"apikey": ANON, "Content-Type": "application/json", "Authorization": f"Bearer {ANON}"}
    r = urllib.request.Request(BASE + "/auth/v1/signup",
                               data=json.dumps({"email": email, "password": pw, "data": meta}).encode(),
                               headers=h, method="POST")
    try:
        urllib.request.urlopen(r).read()
    except urllib.error.HTTPError as e:
        e.read()


tag = str(int(time.time()))[-6:]
print("=" * 58)
print("  admin-users Edge Function 검증")
print("=" * 58)

# 관리자 로그인
admin = signin("admin@yanghyeon.hs.kr", "yhadmin!2026")
atok = admin["access_token"]

# 검증 대상 학생 1명 생성
se = f"victim{tag}@yanghyeon.hs.kr"
signup(se, "oldpass123", {"name": "초기화대상", "student_id": "10511"})
stu = signin(se, "oldpass123")
stu_tok, stu_uid = stu["access_token"], stu["user"]["id"]
print(f"\n[준비] 대상 학생 생성: {se} (기존 비번 oldpass123)")

# (1) 학생이 함수 호출 → 403 차단
st, d = post(FN, stu_tok, {"action": "search", "query": ""})
print(f"[1] 학생이 함수 호출       → HTTP {st}   {'✅ 차단됨' if st == 403 else '❌ 뚫림!'}  {d if st==403 else ''}")

# (2) 관리자가 검색 → 대상 학생 포함
st, d = post(FN, atok, {"action": "search", "query": "초기화대상"})
found = isinstance(d, dict) and any(u["id"] == stu_uid for u in d.get("users", []))
print(f"[2] 관리자 검색            → HTTP {st}, {len(d.get('users',[])) if isinstance(d,dict) else '?'}건, 대상포함={found}  {'✅' if found else '❌'}")
if found:
    u = next(u for u in d["users"] if u["id"] == stu_uid)
    print(f"     → 이메일 보강 확인: {u.get('email')}")

# (3) 관리자가 비번 초기화
st, d = post(FN, atok, {"action": "reset_password", "target_id": stu_uid})
newpw = d.get("temp_password") if isinstance(d, dict) else None
print(f"[3] 관리자 비번 초기화     → HTTP {st}, 임시비번={newpw}  {'✅' if st==200 and newpw else '❌'}")

# (4) 기존 비번으로 로그인 → 실패해야 함
old = signin(se, "oldpass123")
print(f"[4] 기존 비번 로그인       → {'❌ 아직 됨' if old.get('access_token') else '✅ 실패(초기화됨)'}")

# (5) 새 임시 비번으로 로그인 → 성공해야 함
new = signin(se, newpw)
print(f"[5] 새 임시비번 로그인     → {'✅ 성공' if new.get('access_token') else '❌ 실패'}")

print("\n" + "=" * 58)
print("  검증 종료")
print("=" * 58)
