# 설치 가이드 (다른 학교에서 운영하기)

이 문서는 이 프로젝트를 **Fork 해서 우리 학교용으로 처음부터 띄우는** 운영자를 위한 단계별 안내입니다.
모두 **무료 티어**로 가능하며, 약 30분이면 됩니다.

> 핵심 구조: **프론트(Vercel) + 백엔드(Supabase: DB·인증·Edge Functions)**. 둘 다 무료.

---

## 0. 준비물 (계정)

| 계정 | 용도 | 비용 |
| :--- | :--- | :--- |
| GitHub | 코드 저장소 | 무료 |
| Supabase | DB·로그인·서버함수 | 무료 |
| Vercel | 웹사이트 호스팅 | 무료 |
| (선택) Google Cloud | 구글 로그인 | 무료 |

로컬에 **Node.js**(LTS)만 설치돼 있으면 됩니다. (`node -v`로 확인)

---

## 1. 코드 가져오기

1. 이 저장소 오른쪽 위 **Fork** → 내 GitHub 계정으로 복제
2. 내 PC로 클론:
   ```bash
   git clone https://github.com/<내아이디>/yanghyeon-pass.git
   cd yanghyeon-pass
   npm install
   ```

---

## 2. Supabase 프로젝트 만들기

1. [supabase.com](https://supabase.com) → **New project**
   - 이름·DB 비밀번호 지정(비번은 따로 보관), Region은 **가까운 곳**(서울/도쿄)
2. 생성되면(2~3분), 왼쪽 **SQL Editor → New query** 에 [`supabase/schema.sql`](supabase/schema.sql) **전체를 붙여넣고 Run**
   - `Success` 가 나오면 테이블·보안정책·트리거가 모두 생성됩니다. (여러 번 실행해도 안전)
3. **Settings → API** 에서 두 값 복사 (다음 단계에서 사용):
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key**
4. (테스트 편의) **Authentication → Sign In/Providers → Email → "Confirm email"** 을 잠시 **꺼두면** 가입 즉시 로그인됩니다. (운영 시작 시 다시 켜는 걸 권장)

---

## 3. Edge Functions 배포 (서버 함수 4개)

비밀번호 초기화·QR검증·알림·온보딩은 서버 함수로 동작합니다. **Supabase CLI**로 배포합니다.

```bash
# 로그인 (브라우저 인증)
npx supabase login

# <ref> = Project URL 의 xxxx 부분 (Settings→General의 Reference ID)
npx supabase functions deploy admin-users  --project-ref <ref>
npx supabase functions deploy verify-pass  --no-verify-jwt --project-ref <ref>
npx supabase functions deploy onboard      --project-ref <ref>

# 웹푸시 알림: VAPID 키 생성 → 비공개키는 시크릿, 공개키는 프론트(4단계)에 사용
npx web-push generate-vapid-keys
npx supabase secrets set VAPID_PRIVATE_KEY=<생성된 privateKey> --project-ref <ref>
npx supabase functions deploy notify-pass  --project-ref <ref>
```

> `notify-pass/index.ts` 안의 `VAPID_PUBLIC` 상수도 **위에서 생성한 publicKey 로 바꿔** 다시 배포하세요. (현재 값은 원 저장소용입니다.)

---

## 4. Vercel 에 배포

1. [vercel.com](https://vercel.com) → **Continue with GitHub** 로 로그인
2. **Add New → Project** → fork 한 저장소 **Import** (private면 GitHub App 권한 허용)
3. Framework **Vite** 자동 감지 (Build `npm run build`, Output `dist`)
4. **Environment Variables** 에 추가:
   | Key | Value |
   | :--- | :--- |
   | `VITE_SUPABASE_URL` | 2단계의 Project URL |
   | `VITE_SUPABASE_ANON_KEY` | 2단계의 anon key |
   | `VITE_VAPID_PUBLIC_KEY` | 3단계에서 생성한 VAPID publicKey |
   | `VITE_PUBLIC_BASE_URL` | 배포 후 받은 `https://<프로젝트>.vercel.app` |
5. **Deploy** → `https://<프로젝트>.vercel.app` 주소 발급

> ⚠️ 커밋 작성자 이메일이 **GitHub 계정에 연결된 이메일**이어야 합니다(아니면 Vercel 이 배포를 Blocked 처리). `git config user.email "<id>+<user>@users.noreply.github.com"` 로 맞추세요.

> `VITE_PUBLIC_BASE_URL` 을 넣은 뒤에는 **Redeploy** 해야 QR 링크가 새 도메인으로 생성됩니다.

---

## 5. 첫 관리자(admin) 지정 ★ 가장 중요

앱에는 "관리자 되기" 기능이 **없습니다**(보안). 첫 관리자는 **DB를 가진 운영자만** 만들 수 있습니다.

1. 배포된 앱에서 **본인 계정으로 가입** (이메일/비번)
2. Supabase **SQL Editor** 에서 그 계정을 admin 으로 승격:
   ```sql
   update public.users set role = 'admin'
   where id = (select id from auth.users where email = '본인이메일@우리학교.kr');
   ```
3. 다시 로그인하면 **관리자 화면**이 보입니다.

이후부터는 모든 관리가 앱 화면 안에서 됩니다:
- **관리자**: 교사 가입코드 발급, 사용자 관리
- **교사**: 코드로 가입 (관리자 화면 → 교사 코드 탭에서 코드 발급/배포)
- **학생**: 그냥 가입 + 학번 입력

```sql
-- 교사 가입 코드 발급 예시 (또는 관리자 화면에서)
insert into public.teacher_codes (code, label) values ('TEACHER-2026', '2026 교직원');
```

---

## 6. (선택) 구글 로그인

학교가 Google Workspace(@우리학교 도메인)면, 비밀번호 없는 구글 로그인이 편리합니다.

1. [Google Cloud Console](https://console.cloud.google.com) → 프로젝트 생성
2. **OAuth 동의 화면**: User Type **Internal**(워크스페이스면) → 앱 이름·이메일 입력
3. **사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션**
   - 승인된 리디렉션 URI: `https://<ref>.supabase.co/auth/v1/callback`
   - 만든 뒤 **Client ID / Secret** 복사
4. Supabase **Authentication → Providers → Google** → Enable + Client ID/Secret 붙여넣기 → Save
5. **Authentication → URL Configuration** 에 Site URL `https://<프로젝트>.vercel.app`, Redirect URLs `https://<프로젝트>.vercel.app/**` 추가

> 구글 첫 로그인 시 앱이 **온보딩 화면**으로 보내 학번(학생)/교사코드+담임반(교사)을 받습니다.

---

## 7. 운영 전 점검 체크리스트

- [ ] 이메일 인증 ON (Authentication → Email → Confirm email)
- [ ] Site URL / Redirect URLs 를 실제 도메인으로 설정
- [ ] 첫 관리자 지정 완료, 관리자 비밀번호를 강력하게 변경(앱 → 내 계정 탭)
- [ ] 교사 가입코드 발급 후 교직원에게 안내
- [ ] 학번 체계 확인: `"30101"` = 3학년 1반 1번 (앞3자리 `301` = 담임반). 학교 학번 규칙이 다르면 조정 필요
- [ ] 안내문: "안드로이드는 크롬에서 알림 켜기, 아이폰은 홈화면 추가 후 알림 켜기"

---

## 데이터 모델 요약

| 테이블 | 핵심 |
| :--- | :--- |
| `users` | `role`(student/teacher/admin), `student_id`("30101"), `homeroom`("301"=교사담임반) |
| `passes` | `type`(1조퇴/2외출), `status`(0대기/1승인/2반려/3완료), `verify_token`(QR검증) |
| `teacher_codes` | 교사 가입 코드 |
| `push_subscriptions` | 교사 웹푸시 구독 |

더 자세한 동작은 [README.md](README.md) 를 참고하세요.
