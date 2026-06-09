# Edge Functions

## admin-users
관리자(admin) 전용 사용자 관리 함수. 학생/교사의 **비밀번호 초기화**, **이메일(아이디) 변경**, **사용자 검색**을 처리합니다.

`service_role` 키는 이 함수 내부에서만 사용되며 프론트엔드로 노출되지 않습니다. 호출자의 JWT 를 검증해 `role='admin'` 일 때만 동작합니다.

### 배포 (Supabase CLI)

```bash
# 1) 로그인 (브라우저로 액세스 토큰 발급)
npx supabase login

# 2) 함수 배포 (이 저장소 루트에서)
npx supabase functions deploy admin-users --project-ref uvqeandtehjvgamljvbd
```

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 환경변수는 Supabase 가 자동 주입하므로 별도 설정이 필요 없습니다.
- 배포 후 프론트엔드 admin 화면 → "사용자 관리" 탭에서 동작합니다.

### 액션
| action | 입력 | 동작 |
| :--- | :--- | :--- |
| `search` | `query` | 이름·학번으로 사용자 검색(+이메일) |
| `reset_password` | `target_id`, (`new_password`?) | 비밀번호 초기화(미지정 시 임시비번 생성·반환) |
| `change_email` | `target_id`, `new_email` | 이메일(아이디) 변경(즉시 확정) |

## verify-pass
외출증 **공개 실시간 검증** 함수. QR(`/verify/:id?t=token`) 스캔 시 호출되며 **로그인 불필요**.
`pass_id + token(verify_token)` 이 일치할 때만 그 외출증의 실시간 상태를 반환합니다(이름은 마스킹).
위조 이미지의 QR 은 토큰 불일치로 검증 실패 → 이미지 위조 무력화.

```bash
# 공개 함수이므로 JWT 검증을 끄고 배포
npx supabase functions deploy verify-pass --no-verify-jwt --project-ref uvqeandtehjvgamljvbd
```

## notify-pass
학생이 외출·조퇴를 신청하면 **담임(학번 앞3자리=homeroom 매칭)에게 웹 푸시 알림**을 보냅니다.
호출자(학생) JWT 를 검증하고 본인 신청건인지 확인 후, 담임의 `push_subscriptions` 로 발송합니다.

```bash
# VAPID 비공개키를 시크릿으로 설정 (1회)
npx supabase secrets set VAPID_PRIVATE_KEY=<private> --project-ref uvqeandtehjvgamljvbd
# 배포 (JWT 검증 유지 — 로그인한 학생만 호출)
npx supabase functions deploy notify-pass --project-ref uvqeandtehjvgamljvbd
```

> 프론트엔드에는 VAPID **공개키**만(`VITE_VAPID_PUBLIC_KEY`), 함수에는 **비공개키**만 둡니다.
