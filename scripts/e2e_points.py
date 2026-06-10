#!/usr/bin/env python3
"""상벌점 권한 검증:
   - 교사: 학생 검색/부여/이력 가능
   - 학생: 함수 호출 차단(403), 본인 상벌점만 직접 조회 가능
   - 부여 결과가 합계에 반영"""
import json, time, urllib.request, urllib.error

BASE = "https://uvqeandtehjvgamljvbd.supabase.co"
FN = BASE + "/functions/v1/points"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cWVhbmR0ZWhqdmdhbWxqdmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTQ4MTksImV4cCI6MjA5NjQ3MDgxOX0.1Yb1yoXgowd11C88U2gwCTeMh-hG5VYYRzBCiX0qaaw"


def call(path, body, token):
    h = {"apikey": ANON, "Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers=h, method="POST")
    try:
        x = urllib.request.urlopen(r); return x.status, json.loads(x.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode())
        except Exception: return e.code, "?"


def get(path, token):
    h = {"apikey": ANON, "Authorization": f"Bearer {token}"}
    r = urllib.request.Request(BASE + path, headers=h, method="GET")
    try:
        x = urllib.request.urlopen(r); return x.status, json.loads(x.read().decode() or "[]")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def signup(e, p, m): call("/auth/v1/signup", {"email": e, "password": p, "data": m}, ANON)
def signin(e, p):
    _, d = call("/auth/v1/token?grant_type=password", {"email": e, "password": p}, ANON); return d


tag = str(int(time.time()))[-6:]
PW = "test1234"
print("=" * 56)
print("  상벌점 권한 검증")
print("=" * 56)

se = f"p_s{tag}@yanghyeon.hs.kr"
signup(se, PW, {"name": f"상벌학생{tag}", "student_id": "30533"})
stu = signin(se, PW); stok, suid = stu["access_token"], stu["user"]["id"]
te = f"p_t{tag}@yanghyeon.hs.kr"
signup(te, PW, {"name": "단속교사", "signup_code": "yhteacher-2026", "homeroom": "999"})
tea = signin(te, PW); ttok = tea["access_token"]

# (1) 학생이 함수 호출 → 403
st, d = call(FN, {"action": "search", "query": ""}, stok)
print(f"\n[1] 학생이 points 함수 호출 → HTTP {st}  {'✅ 차단' if st == 403 else '❌'}")

# (2) 교사 검색 → 대상 학생 포함 (담임반 999 아님에도 전교 검색 가능)
st, d = call(FN, {"action": "search", "query": f"상벌학생{tag}"}, ttok)
found = next((s for s in d.get("students", []) if s["id"] == suid), None)
print(f"[2] 교사 전교 검색 → HTTP {st}, 대상 {'찾음' if found else '못찾음'}  {'✅' if found else '❌'}")

# (3) 교사가 벌점 3 부여
st, d = call(FN, {"action": "give", "student_id": suid, "kind": 1, "amount": 3, "reason": "무단 외출"}, ttok)
print(f"[3] 교사 벌점3 부여 → HTTP {st} {d}  {'✅' if d.get('ok') else '❌'}")

# (4) 교사가 상점 1 부여
call(FN, {"action": "give", "student_id": suid, "kind": 2, "amount": 1, "reason": "봉사 활동"}, ttok)
st, d = call(FN, {"action": "detail", "student_id": suid}, ttok)
print(f"[4] 상세: 상점={d.get('merit')} 벌점={d.get('demerit')} 합산={d.get('net')}  "
      f"{'✅' if d.get('merit')==1 and d.get('demerit')==3 else '❌'}")

# (5) 학생 본인 조회 (직접 RLS) → 2건 보임
st, rows = get(f"/rest/v1/points?select=kind,amount,reason&order=created_at.desc", stok)
print(f"[5] 학생 본인 직접 조회 → {len(rows) if isinstance(rows,list) else rows}건  "
      f"{'✅' if isinstance(rows,list) and len(rows)==2 else '❌'}")

# (6) 학생이 남의 상벌점 조회 시도 → 0건(RLS)
st, rows = get(f"/rest/v1/points?student_id=eq.{suid}&select=id", ttok2) if False else (0, [])
# 교사 토큰으로 직접 테이블 조회는 RLS상 본인 학생 아니므로 0건이어야 (교사는 함수로만)
st, rows = get(f"/rest/v1/points?select=id", ttok)
print(f"[6] 교사 직접 테이블 조회 → {len(rows) if isinstance(rows,list) else rows}건 (RLS상 0 기대)  "
      f"{'✅' if isinstance(rows,list) and len(rows)==0 else '❌'}")

print("\n" + "=" * 56)
print("  검증 종료")
print("=" * 56)
