# 양현고등학교 스마트 외출·조퇴 시스템

종이 외출·조퇴 서류를 디지털화한 경량 웹앱입니다. **비용 제로(Free Tier)** + **데이터 트래픽 최소화**에 초점을 맞춘 1인 개발·운영용 구조입니다.

- **프론트엔드:** React + Vite + TypeScript (SPA)
- **백엔드:** Supabase (PostgreSQL + Auth + RLS)
- **인증:** 이메일 + 비밀번호 (학교 계정)

## 핵심 설계 (데이터 절약)

| 전략 | 구현 |
| :--- | :--- |
| **Zero-Image UI** | 외출증 외형(엠블럼·격자·배치)을 코드에 내장([PassCertificate.tsx](src/components/PassCertificate.tsx)). 서버는 텍스트 JSON만 전송 |
| **경량 JSON** | 분류는 정수 코드(`type`, `status`), 필요한 컬럼만 SELECT |
| **로컬 캐싱** | 승인된 외출증을 AES-GCM 암호화하여 localStorage 저장([cache.ts](src/lib/cache.ts)) |
| **오프라인 검증** | 교문에서 서버 재요청 없이 캐시로 렌더링 (음영 지역 대응) |

## 주요 기능

| 역할 | 기능 |
| :--- | :--- |
| **학생** | 외출·조퇴 신청/조회, 외출증(홀로그램·실시간시계·QR), 오프라인 표시 |
| **교사** | 가입 코드로만 등록 + 담임반 입력 → **담임반 학생만** 승인/반려, 신청 시 **웹 푸시 알림** |
| **관리자** | 교사 코드 관리, 사용자 검색·비번초기화·이메일변경·담임반지정·계정삭제 |
| **교문(공개)** | QR 스캔 → `/verify/:id` 에서 **실시간 진위 확인** (위조 이미지 무력화) |

### 위조 방어
- 외출증 **QR** → 공개 검증 페이지([verify-pass](supabase/functions/verify-pass)) 가 서버의 **실시간 상태**를 응답. 위조 이미지의 QR 은 토큰 불일치로 검증 실패.
- 실시간 시계·홀로그램 애니메이션 → 정지 캡처/AI 생성 이미지와 즉시 구별.

### 담임 즉시 알림 (웹 푸시, 무료)
- 교사가 '알림 켜기' → 구독([push.ts](src/lib/push.ts)). 학생 신청 시 [notify-pass](supabase/functions/notify-pass) 가 담임 기기로 푸시.
- 환경변수: 프론트 `VITE_VAPID_PUBLIC_KEY`, 함수 시크릿 `VAPID_PRIVATE_KEY`.
- 📱 iOS 는 '홈 화면에 추가'(PWA 설치) 후 알림 동작.

## 폴더 구조

```
src/
  lib/         supabase 클라이언트, 타입, 상수, 암호화 캐시
  context/     AuthContext (세션·프로필)
  components/  PassCertificate(외출증 양식), ProtectedRoute
  pages/       Login, StudentHome, ApplyPass, PassDetail, TeacherHome
supabase/
  schema.sql   DB 스키마 + RLS + 트리거
```

## 설치 및 실행

```bash
npm install
cp .env.example .env   # Supabase URL/anon key 입력
npm run dev            # 개발 서버
npm run build          # dist/ 에 정적 빌드
```

## 배포 (Vercel)

GitHub 저장소를 Vercel에 연결하면 push 할 때마다 자동 배포됩니다.

1. [vercel.com](https://vercel.com) → **Add New → Project** → 이 GitHub 저장소 **Import**
2. Framework: **Vite** (자동 감지), Build: `npm run build`, Output: `dist`
3. **Environment Variables** 에 추가 (Supabase Settings → API 값):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy** → 발급된 `*.vercel.app` URL 로 접속

SPA 라우팅(`/admin` 등 새로고침)은 [vercel.json](vercel.json) 의 rewrite 로 처리됩니다.

## Supabase 설정

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성 (무료)
2. **SQL Editor** 에서 [`supabase/schema.sql`](supabase/schema.sql) 전체 실행
3. **Settings → API** 에서 `Project URL`, `anon public key` 복사 → `.env` 에 입력
4. (선택) 이메일 인증을 끄려면 **Authentication → Providers → Email** 에서 "Confirm email" 비활성화
5. 가입한 교사 계정을 승격:
   ```sql
   update public.users set role = 'teacher' where id = '<auth-uid>';
   ```

## 데이터 모델

- **users**: `id`(UUID, auth 연동), `student_id`("30101"=3학년1반1번), `name`, `role`, `parent_phone`
- **passes**: `type`(1:조퇴, 2:외출), `status`(0:대기, 1:승인, 2:반려, 3:완료), 시간/사유/담당교사

RLS로 학생은 본인 신청건만, 교사는 전체를 조회·승인합니다.

## 사용 흐름

1. **학생** 로그인 → 외출·조퇴 신청 (구분/일자/시간/사유)
2. **교사** 로그인 → 대기 목록에서 승인/반려, 하교 시 사용완료 처리
3. **학생** 승인된 외출증 화면을 교문에서 제시 (오프라인에서도 표시)
