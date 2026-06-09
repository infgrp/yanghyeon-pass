#!/usr/bin/env python3
"""QR 공개 검증(verify-pass) 흐름 검증:
   - 올바른 token → valid + 실시간 상태
   - 위조 token → invalid 차단
   - 승인 전/후 상태가 실시간 반영되는지"""
import json, time, urllib.request, urllib.error

BASE = "https://uvqeandtehjvgamljvbd.supabase.co"
VERIFY = BASE + "/functions/v1/verify-pass"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cWVhbmR0ZWhqdmdhbWxqdmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTQ4MTksImV4cCI6MjA5NjQ3MDgxOX0.1Yb1yoXgowd11C88U2gwCTeMh-hG5VYYRzBCiX0qaaw"


def call(url, body, token=ANON):
    h = {"apikey": ANON, "Content-Type": "application/json", "Authorization": f"Bearer {token}"}
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


def rest(method, path, token, body=None, prefer=None):
    h = {"apikey": ANON, "Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    if prefer:
        h["Prefer"] = prefer
    d = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=d, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def signup(email, pw, meta):
    rest("POST", "/auth/v1/signup", ANON, {"email": email, "password": pw, "data": meta})


def signin(email, pw):
    _, d = rest("POST", "/auth/v1/token?grant_type=password", ANON, {"email": email, "password": pw})
    return d


tag = str(int(time.time()))[-6:]
PW = "test1234"
print("=" * 58)
print("  QR 공개 검증(verify-pass) 흐름")
print("=" * 58)

# 학생/담임 준비 (4반)
se = f"v_s{tag}@yanghyeon.hs.kr"
signup(se, PW, {"name": "검증학생", "student_id": "30401"})
stu = signin(se, PW); stok, suid = stu["access_token"], stu["user"]["id"]
te = f"v_t{tag}@yanghyeon.hs.kr"
signup(te, PW, {"name": "4반담임", "signup_code": "yhteacher-2026", "homeroom": "304"})
tea = signin(te, PW); ttok, tuid = tea["access_token"], tea["user"]["id"]

# 학생 외출 신청 → verify_token 확보
rest("POST", "/rest/v1/passes", stok, {
    "student_id": suid, "type": 2, "reason": "QR 검증 테스트",
    "date": "2026-06-08", "start_time": "14:00", "end_time": "16:00", "status": 0})
_, rows = rest("GET", "/rest/v1/passes?select=id,verify_token,status&order=id.desc&limit=1", stok)
pid, token = rows[0]["id"], rows[0]["verify_token"]
print(f"\n[준비] pass_id={pid}, token={token[:8]}… (현재 status={rows[0]['status']}=대기)")

# (1) 승인 전 검증 → valid, 상태=대기중
st, d = call(VERIFY, {"pass_id": pid, "token": token})
print(f"[1] 승인 전 QR 검증   → valid={d.get('valid')}, 상태='{d.get('status_label')}', 이름={d.get('name')}  "
      f"{'✅' if d.get('valid') and d.get('status')==0 else '❌'}")

# (2) 위조 token → invalid
st, d = call(VERIFY, {"pass_id": pid, "token": "00000000-0000-0000-0000-000000000000"})
print(f"[2] 위조 token 검증   → valid={d.get('valid')}  {'✅ 차단됨' if d.get('valid') is False else '❌ 뚫림!'}")

# (3) 담임 승인 후 → 실시간으로 상태=승인 반영
rest("PATCH", f"/rest/v1/passes?id=eq.{pid}", ttok, {"status": 1, "teacher_id": tuid}, prefer="return=representation")
st, d = call(VERIFY, {"pass_id": pid, "token": token})
print(f"[3] 승인 후 QR 검증   → 상태='{d.get('status_label')}' (status={d.get('status')})  "
      f"{'✅ 실시간 반영' if d.get('status')==1 else '❌'}")

# (4) 이름 마스킹 확인
print(f"[4] 이름 마스킹       → '{d.get('name')}'  (원본 '검증학생')  {'✅' if d.get('name') and '*' in d.get('name') else '❌'}")
print(f"     server_time={d.get('server_time')}")

print("\n" + "=" * 58)
print("  검증 종료")
print("=" * 58)
