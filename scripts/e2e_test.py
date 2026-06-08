#!/usr/bin/env python3
"""백엔드 전체 흐름 자동 검증 (가입→로그인→신청→승인).
   anon key 만으로 실제 사용자 플로우를 그대로 재현합니다."""
import json
import urllib.request
import urllib.error

URL = "https://uvqeandtehjvgamljvbd.supabase.co"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cWVhbmR0ZWhqdmdhbWxqdmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTQ4MTksImV4cCI6MjA5NjQ3MDgxOX0.1Yb1yoXgowd11C88U2gwCTeMh-hG5VYYRzBCiX0qaaw"


def req(method, path, token=None, body=None, prefer=None):
    headers = {"apikey": ANON, "Content-Type": "application/json"}
    headers["Authorization"] = f"Bearer {token or ANON}"
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(URL + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        return e.code, (json.loads(raw) if raw else None)


def signup(email, pw, meta):
    return req("POST", "/auth/v1/signup", body={"email": email, "password": pw, "data": meta})


def signin(email, pw):
    st, d = req("POST", "/auth/v1/token?grant_type=password",
                body={"email": email, "password": pw})
    return st, d


print("=" * 55)
print("  백엔드 E2E 검증")
print("=" * 55)

import time
tag = str(int(time.time()))[-6:]  # 충돌 방지용 접미사
stu_email = f"stu{tag}@yanghyeon.hs.kr"
tea_email = f"tea{tag}@yanghyeon.hs.kr"
PW = "test1234"

# 1) 학생 가입
st, d = signup(stu_email, PW, {"name": "김학생", "role": "student", "student_id": "30101"})
print(f"\n[1] 학생 가입: HTTP {st}  uid={d.get('id') if d else d}")

# 2) 학생 로그인
st, d = signin(stu_email, PW)
assert st == 200 and d and d.get("access_token"), f"로그인 실패: {st} {d}"
stu_token = d["access_token"]
stu_uid = d["user"]["id"]
print(f"[2] 학생 로그인: HTTP {st}  ✅ 토큰 발급")

# 3) 트리거가 users 행을 만들었는지 (본인 행 조회)
st, d = req("GET", f"/rest/v1/users?id=eq.{stu_uid}&select=name,role,student_id", token=stu_token)
print(f"[3] users 트리거 확인: HTTP {st}  {d}")
assert d and d[0]["name"] == "김학생" and d[0]["role"] == "student", "트리거 실패"

# 4) 외출 신청
pass_body = {"student_id": stu_uid, "type": 2, "reason": "치과 진료",
             "date": "2026-06-08", "start_time": "14:00", "end_time": "16:30", "status": 0}
st, d = req("POST", "/rest/v1/passes", token=stu_token, body=pass_body,
            prefer="return=representation")
assert st in (200, 201) and d, f"신청 실패: {st} {d}"
pass_id = d[0]["id"]
print(f"[4] 외출 신청: HTTP {st}  ✅ pass_id={pass_id}")

# 5) 교사 가입 + 로그인 (role=teacher 메타데이터)
signup(tea_email, PW, {"name": "박교사", "role": "teacher"})
st, d = signin(tea_email, PW)
tea_token = d["access_token"]
print(f"[5] 교사 가입/로그인: HTTP {st}  ✅")

# 6) 교사가 대기 목록 조회 (RLS: is_teacher() → 전체 조회)
st, d = req("GET", "/rest/v1/passes?status=eq.0&select=id,reason,status", token=tea_token)
print(f"[6] 교사 대기목록 조회: HTTP {st}  {len(d) if d else 0}건  (방금 신청 포함)")
assert d and any(p["id"] == pass_id for p in d), "교사가 신청건을 못 봄(RLS 문제)"

# 7) 교사 승인
st, d = req("PATCH", f"/rest/v1/passes?id=eq.{pass_id}", token=tea_token,
            body={"status": 1, "teacher_id": d[0]["id"] if False else None},
            prefer="return=representation")
# teacher_id 는 교사 uid 로 설정
tea_uid = json.loads(json.dumps(signin(tea_email, PW)[1]))["user"]["id"]
st, d = req("PATCH", f"/rest/v1/passes?id=eq.{pass_id}", token=tea_token,
            body={"status": 1, "teacher_id": tea_uid}, prefer="return=representation")
assert st == 200 and d and d[0]["status"] == 1, f"승인 실패: {st} {d}"
print(f"[7] 교사 승인: HTTP {st}  ✅ status=1(승인)")

# 8) 학생이 승인 결과 확인
st, d = req("GET", f"/rest/v1/passes?id=eq.{pass_id}&select=status,teacher_id", token=stu_token)
print(f"[8] 학생 재확인: HTTP {st}  status={d[0]['status']}  (1=승인)")
assert d[0]["status"] == 1

print("\n" + "=" * 55)
print("  ✅ 전체 흐름 정상 — 백엔드/RLS/트리거 모두 작동")
print("=" * 55)
print(f"\n브라우저 테스트용 계정:")
print(f"  학생  {stu_email} / {PW}")
print(f"  교사  {tea_email} / {PW}")
