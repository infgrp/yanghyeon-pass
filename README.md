# 양현고등학교 스마트 외출·조퇴 시스템

> 종이 외출·조퇴 서류를 디지털화한 경량 웹앱. **비용 제로(Free Tier)** · **데이터 트래픽 최소화** · **위조 방어**에 초점을 맞춘 1인 개발·운영용 시스템.

**라이브:** https://yanghyeon-pass.vercel.app

> 🏫 **다른 학교에서 운영하려면?** → [SETUP.md](SETUP.md) (Fork 후 처음부터 띄우는 단계별 가이드)

| | |
| :--- | :--- |
| **프론트엔드** | React + Vite + TypeScript (SPA · PWA) |
| **백엔드** | Supabase (PostgreSQL + Auth + RLS + Edge Functions) |
| **호스팅** | Vercel (GitHub push → 자동 배포) · Supabase 모두 무료 티어 |
| **인증** | 이메일 + 비밀번호 (학교 계정) |

---

## 핵심 설계 — 데이터 절약 (비용 제로)

매번 이미지/PDF를 내려받는 방식은 학생 데이터 요금과 무료 서버 대역폭을 낭비합니다. 본 시스템은 **'텍스트 중심 통신 + 로컬 렌더링'** 전략을 취합니다.

| 전략 | 구현 |
| :--- | :--- |
| **Zero-Image UI** | 외출증 외형(엠블럼·테두리·배치)을 코드에 내장([PassCertificate.tsx](src/components/PassCertificate.tsx)). 서버는 텍스트 JSON만 전송 |
| **경량 JSON** | 분류는 정수 코드(`type`, `status`), 필요한 컬럼만 SELECT, 조회당 1KB 미만 |
| **로컬 캐싱** | 승인된 외출증을 AES-GCM 암호화하여 localStorage 저장([cache.ts](src/lib/cache.ts)) |
| **오프라인 검증** | 교문에서 서버 재요청 없이 캐시로 렌더링 (음영 지역 대응) |

---

## 주요 기능

| 역할 | 기능 |
| :--- | :--- |
| **학생** | 외출·조퇴 신청/조회, 외출증(홀로그램·실시간시계·QR), 오프라인 표시 |
| **교사** | 가입 코드로만 등록 + 담임반 입력 → **담임반 학생만** 승인/반려, 신청 시 **웹 푸시 알림** |
| **관리자** | 교사 가입코드 관리, 사용자 검색·비번초기화·이메일변경·담임반지정·계정삭제 |
| **교문(공개)** | QR 스캔 → `/verify/:id` 에서 **실시간 진위 확인** |

### 🛡️ 위조 방어
생성형 AI·이미지 편집으로 "승인된 외출증"을 위조할 수 있으므로, **진본임을 실시간으로 증명**하는 데 초점을 둡니다.
- **QR 실시간 검증**: 외출증 QR → 공개 검증 함수([verify-pass](supabase/functions/verify-pass))가 서버의 **그 순간 상태**(승인/반려/사용완료)를 응답. 위조 이미지의 QR 은 토큰(`verify_token`) 불일치로 검증 실패.
- **라이브니스 단서**: 실시간 시계(초가 흐름)·홀로그램 애니메이션 → 정지 캡처/AI 이미지와 즉시 구별.

### 🔔 담임 즉시 알림 (웹 푸시, 무료)
- 교사가 '알림 켜기' → 기기 구독([push.ts](src/lib/push.ts)). 학생 신청 시 [notify-pass](supabase/functions/notify-pass)가 **담임(학번 앞3자리=담임반 매칭)** 기기로 푸시.
- FCM/APNs(무료)를 경유하므로 SMS 와 달리 **건당 비용 0원**.
- 📱 iOS 는 사파리에서 '홈 화면에 추가'(PWA 설치) 후 동작. 안드로이드는 브라우저에서 바로 동작.

### 🔐 보안 모델 (RLS 중심)
- **역할**: `student`(기본) / `teacher`(가입코드로만) / `admin`. 가입 시 클라이언트가 보낸 role 은 **신뢰하지 않고**, 서버 트리거가 코드를 대조해 판정.
- **담임반 격리**: 교사는 RLS로 **자기 담임반 학생의 신청만** 조회·승인.
- **권한 상승 차단**: 학생이 본인 행의 `role`/`student_id`/`homeroom` 을 직접 바꾸지 못하게 트리거로 가드.
- **service_role 키**는 Edge Function 서버에만 존재(프론트엔드 노출 없음).

---

## 아키텍처

```
              ┌──────────────────────────────┐
  학생/교사 ──▶│  React SPA (Vercel, PWA)      │
              └───────────┬──────────────────┘
                          │ anon key (RLS 적용)
              ┌───────────▼──────────────────┐
              │  Supabase                     │
              │   • PostgreSQL + RLS          │
              │   • Auth (이메일/비번)         │
              │   • Edge Functions (Deno)     │
              │      - admin-users  (관리자)   │
              │      - verify-pass  (공개 QR)  │
              │      - notify-pass  (웹푸시)   │
              └───────────────────────────────┘
  교문 경비 ──▶ /verify/:id (로그인 불필요, 공개)
```

## 프로젝트 구조

```
src/
  lib/         supabase 클라이언트, 타입, 상수, AES-GCM 캐시, 웹푸시 유틸
  context/     AuthContext (세션·프로필)
  components/  PassCertificate(외출증), ProtectedRoute
  pages/       Login · StudentHome · ApplyPass · PassDetail
               TeacherHome · AdminHome · VerifyPass(공개)
public/        manifest.webmanifest · sw.js(서비스워커) · icons/
supabase/
  schema.sql           DB 스키마 + RLS + 트리거 (idempotent)
  functions/
    admin-users/       관리자 사용자 관리 (service_role)
    verify-pass/       공개 QR 진위 검증 (--no-verify-jwt)
    notify-pass/       신청 시 담임 웹푸시 발송
scripts/       REST 기반 E2E 검증 스크립트 (Python)
```

---

## 설치 및 실행 (로컬)

```bash
npm install
cp .env.example .env    # 값 채우기 (아래 환경변수 참고)
npm run dev             # 개발 서버 (http://localhost:5173)
npm run build           # dist/ 정적 빌드
```

### 환경변수 (`.env`)
| 키 | 설명 |
| :--- | :--- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key (공개용) |
| `VITE_VAPID_PUBLIC_KEY` | 웹푸시 VAPID 공개키 (`npx web-push generate-vapid-keys`) |
| `VITE_PUBLIC_BASE_URL` | (선택) QR 검증 링크 기준 도메인. 미설정 시 실서비스 도메인 기본값 |

---

## 백엔드 설정 (Supabase)

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성 (무료)
2. **SQL Editor** 에서 [`supabase/schema.sql`](supabase/schema.sql) 전체 실행 (테이블·RLS·트리거 일괄 생성, 재실행 안전)
3. **Settings → API** 의 `Project URL`·`anon public key` 를 `.env` / Vercel 에 입력
4. (테스트 편의) **Authentication → Email** 의 "Confirm email" 비활성화
5. **Edge Functions 배포** (Supabase CLI):
   ```bash
   npx supabase login
   npx supabase functions deploy admin-users  --project-ref <ref>
   npx supabase functions deploy verify-pass   --no-verify-jwt --project-ref <ref>
   # 웹푸시: VAPID 비공개키를 시크릿으로 등록 후 배포
   npx supabase secrets set VAPID_PRIVATE_KEY=<private> --project-ref <ref>
   npx supabase functions deploy notify-pass   --project-ref <ref>
   ```
6. **최초 관리자 지정** (가입 후 SQL Editor 에서):
   ```sql
   update public.users set role = 'admin'
   where id = (select id from auth.users where email = '<관리자이메일>');
   ```
7. **교사 가입 코드 발급** — 관리자 화면에서, 또는 SQL:
   ```sql
   insert into public.teacher_codes (code, label) values ('CODE-2026', '2026 교직원');
   ```

> 교사는 회원가입 시 이 코드 + 담임 학년/반을 입력해야 교사 권한을 받습니다.

## 배포 (Vercel)

GitHub 저장소를 Vercel 에 Import 하면 `master` push 마다 자동 배포됩니다.
- Framework **Vite** 자동 감지, Output `dist`, SPA rewrite 는 [vercel.json](vercel.json)
- **Environment Variables** 에 위 `VITE_*` 4개 등록 후 **Redeploy** (env 는 빌드 시 주입됨)
- 커밋 작성자 이메일은 **GitHub 계정에 연결된 이메일**이어야 함 (아니면 Vercel 이 Blocked 처리)

---

## 데이터 모델

- **users** — `id`(auth 연동 UUID), `student_id`("30101"=3학년1반1번), `name`, `role`, `homeroom`("301"=교사 담임반), `parent_phone`
- **passes** — `type`(1:조퇴, 2:외출), `status`(0:대기, 1:승인, 2:반려, 3:사용완료), 시간·사유·담당교사·`verify_token`
- **teacher_codes** — 교사 가입 코드(`active`, `expires_at`)
- **push_subscriptions** — 교사 기기 웹푸시 구독

## 사용 흐름

1. **학생** 로그인 → 외출·조퇴 신청 → (담임에게 즉시 푸시)
2. **교사** 로그인 → 담임반 대기 목록에서 승인/반려, 하교 시 사용완료
3. **학생** 승인된 외출증 제시 → 교문에서 **QR 스캔으로 실시간 진위 확인**

## E2E 검증

`scripts/` 의 Python 스크립트가 REST API 로 핵심 시나리오(권한 분리·담임반 격리·QR 검증·관리자 기능)를 검증합니다. 실행 전 환경변수로 자격증명을 주입합니다.

```bash
# 예: 담임반 격리 검증
SUPABASE_URL=... SUPABASE_ANON_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
  python scripts/e2e_homeroom.py
```

---

## 라이선스 / 운영 메모

학교 내부 운영용 프로젝트입니다. 운영 전 권장:
- 관리자 비밀번호를 강력한 값으로 변경
- 이메일 인증 재활성화 + Supabase Auth 의 Site URL 을 실서비스 도메인으로 설정
- 테스트 계정 정리
