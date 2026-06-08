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
