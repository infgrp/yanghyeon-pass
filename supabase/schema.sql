-- ============================================================
-- 양현고등학교 스마트 외출·조퇴 시스템 - DB 스키마
-- Supabase SQL Editor 에 그대로 붙여넣어 실행하세요.
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. users 테이블 (학생 및 교사 정보)
--    id 는 Supabase Auth 의 auth.users.id 와 1:1 매칭됩니다.
-- ──────────────────────────────────────────────
create table if not exists public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  student_id   varchar(10),                -- 학번 "30101" = 3학년 1반 1번 (교사는 NULL)
  name         varchar(20) not null,
  role         varchar(10) not null default 'student'
                 check (role in ('student', 'teacher', 'parent')),
  parent_phone varchar(15)                 -- 하이픈 없이 저장 (예: 01012345678)
);

-- ──────────────────────────────────────────────
-- 2. passes 테이블 (외출·조퇴 신청 및 발급 내역)
--    분류는 데이터 절약을 위해 정수 코드로 관리
--    type:   1 = 조퇴, 2 = 외출
--    status: 0 = 대기, 1 = 승인, 2 = 반려, 3 = 사용완료(하교)
-- ──────────────────────────────────────────────
create table if not exists public.passes (
  id          bigint generated always as identity primary key,
  student_id  uuid not null references public.users (id) on delete cascade,
  type        smallint not null check (type in (1, 2)),
  reason      varchar(100) not null,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  status      smallint not null default 0 check (status in (0, 1, 2, 3)),
  teacher_id  uuid references public.users (id),
  -- QR 실시간 검증용 토큰 (위조 방어): QR 에 포함되어 공개 검증 함수가 대조
  verify_token uuid not null default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists passes_student_idx on public.passes (student_id, date desc);
create index if not exists passes_status_idx  on public.passes (status, date desc);

-- 기존 DB 재실행 대비: 컬럼이 없으면 추가 (기존 행은 행마다 고유 uuid 채움)
alter table public.passes add column if not exists verify_token uuid not null default gen_random_uuid();

-- ──────────────────────────────────────────────
-- 2b. role 제약에 'admin' 추가 (기존 DB 재실행 대비 명시적 갱신)
-- ──────────────────────────────────────────────
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('student', 'teacher', 'parent', 'admin'));

-- 교사 담임반 (예: "301" = 3학년 1반 = 학번 앞 3자리). 학생/관리자는 NULL.
alter table public.users add column if not exists homeroom varchar(3);

-- ──────────────────────────────────────────────
-- 2c. teacher_codes 테이블 (교사 가입 코드 — 공유 코드 방식)
--    admin 이 코드를 발급/폐기/만료 관리. 가입 트리거가 이 표를 대조합니다.
-- ──────────────────────────────────────────────
create table if not exists public.teacher_codes (
  code        text primary key,            -- 교사에게 배포하는 가입 코드
  label       varchar(50),                 -- 메모 (예: "2026-1학기")
  active      boolean not null default true,
  expires_at  timestamptz,                 -- null = 무기한
  created_by  uuid references public.users (id),
  created_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- 2d. push_subscriptions 테이블 (웹 푸시 구독 — 담임 즉시 알림)
--    교사가 '알림 켜기' 하면 기기 구독정보 저장. notify-pass 함수가 발송에 사용.
-- ──────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_sub_user_idx on public.push_subscriptions (user_id);

-- updated_at 자동 갱신 트리거
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists passes_touch_updated_at on public.passes;
create trigger passes_touch_updated_at
  before update on public.passes
  for each row execute function public.touch_updated_at();

-- ──────────────────────────────────────────────
-- 3. 회원가입 시 users 행 자동 생성
--    Auth 가입 시 메타데이터(name, role, student_id)를 읽어 행을 만듭니다.
-- ──────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text := new.raw_user_meta_data ->> 'signup_code';
  v_role text := 'student';   -- 기본은 항상 학생. 클라이언트가 보낸 role 은 신뢰하지 않음.
  v_homeroom text := nullif(trim(new.raw_user_meta_data ->> 'homeroom'), '');
begin
  -- 교사 가입 코드 검증: 유효한 코드일 때만 교사 권한 부여 (서버에서만 판정)
  if v_code is not null and length(trim(v_code)) > 0 then
    if exists (
      select 1 from public.teacher_codes c
      where c.code = trim(v_code)
        and c.active
        and (c.expires_at is null or c.expires_at > now())
    ) then
      v_role := 'teacher';
    end if;
  end if;

  insert into public.users (id, name, role, student_id, parent_phone, homeroom)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', '이름미정'),
    v_role,
    -- 교사는 학번이 없으므로 무시
    case when v_role = 'student' then new.raw_user_meta_data ->> 'student_id' else null end,
    new.raw_user_meta_data ->> 'parent_phone',
    -- 담임반은 교사일 때만 저장
    case when v_role = 'teacher' then v_homeroom else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────────
-- 3b. 권한 상승 차단 가드
--    사용자가 본인 행을 수정할 때 role/student_id 를 바꾸지 못하게 막습니다.
--    (admin 또는 서버/SQL Editor 컨텍스트(auth.uid() is null)는 예외)
-- ──────────────────────────────────────────────
create or replace function public.guard_users_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;  -- 서버(SQL Editor)·관리자는 자유롭게 변경 가능
  end if;
  if new.role is distinct from old.role
     or new.student_id is distinct from old.student_id
     or new.homeroom is distinct from old.homeroom then
    raise exception '권한(role)·학번(student_id)·담임반(homeroom)은 직접 변경할 수 없습니다';
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_update on public.users;
create trigger users_guard_update
  before update on public.users
  for each row execute function public.guard_users_update();

-- ──────────────────────────────────────────────
-- 4. 권한 헬퍼 (RLS 재귀 방지를 위해 SECURITY DEFINER 사용)
-- ──────────────────────────────────────────────
create or replace function public.is_teacher()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'teacher'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 현재 로그인한 교사의 담임반("301") 반환 (학생/관리자는 NULL)
create or replace function public.my_homeroom()
returns text language sql security definer stable set search_path = public as $$
  select homeroom from public.users where id = auth.uid();
$$;

-- 현재 로그인한 교사가 해당 학생의 담임인지 (학번 앞 3자리 == 담임반)
create or replace function public.teaches_student(p_student uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.users t
    join public.users s on s.id = p_student
    where t.id = auth.uid()
      and t.role = 'teacher'
      and t.homeroom is not null
      and s.student_id is not null
      and substr(s.student_id, 1, 3) = t.homeroom
  );
$$;

-- ──────────────────────────────────────────────
-- 5. Row Level Security (RLS)
-- ──────────────────────────────────────────────
alter table public.users              enable row level security;
alter table public.passes             enable row level security;
alter table public.teacher_codes      enable row level security;
alter table public.push_subscriptions enable row level security;

-- push_subscriptions: 본인 구독만 생성/조회/삭제 (발송은 service_role 함수가 우회)
drop policy if exists push_sub_self on public.push_subscriptions;
create policy push_sub_self on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- users: 본인 행 조회 / 교사 정보는 모두 조회(승인자 이름 표기용) /
--        교사는 전체 조회 / 본인 행 수정
drop policy if exists users_select_self     on public.users;
drop policy if exists users_select_teachers on public.users;
drop policy if exists users_select_teacher  on public.users;
drop policy if exists users_select_homeroom on public.users;
drop policy if exists users_update_self     on public.users;

create policy users_select_self on public.users
  for select using (id = auth.uid());

-- 교사 행(id, name 등)은 외출증에 '담당교사' 이름을 표기해야 하므로 공개 조회 허용
create policy users_select_teachers on public.users
  for select using (role = 'teacher');

-- 교사는 '자기 담임반 학생'만 조회 가능 (전체 조회 불가 → 개인정보 최소화)
create policy users_select_homeroom on public.users
  for select using (
    student_id is not null
    and public.my_homeroom() is not null
    and substr(student_id, 1, 3) = public.my_homeroom()
  );

create policy users_update_self on public.users
  for update using (id = auth.uid());

-- passes: 학생 본인 신청건 조회/생성 + 대기상태 취소(삭제)
--         교사는 전체 조회 + 상태 변경(승인/반려/완료)
drop policy if exists passes_select_self    on public.passes;
drop policy if exists passes_insert_self    on public.passes;
drop policy if exists passes_delete_pending on public.passes;
drop policy if exists passes_select_teacher on public.passes;
drop policy if exists passes_update_teacher on public.passes;

create policy passes_select_self on public.passes
  for select using (student_id = auth.uid());

create policy passes_insert_self on public.passes
  for insert with check (student_id = auth.uid() and status = 0);

create policy passes_delete_pending on public.passes
  for delete using (student_id = auth.uid() and status = 0);

-- 교사는 '자기 담임반 학생'의 신청만 조회/처리 가능
create policy passes_select_teacher on public.passes
  for select using (public.teaches_student(student_id));

create policy passes_update_teacher on public.passes
  for update using (public.teaches_student(student_id));

-- teacher_codes: admin 만 전체 관리(CRUD). 일반 사용자는 접근 불가.
--   (가입 코드 검증은 트리거(SECURITY DEFINER)가 RLS 우회로 수행하므로
--    학생/교사가 이 표를 직접 읽을 필요는 없습니다.)
drop policy if exists teacher_codes_admin_all on public.teacher_codes;
create policy teacher_codes_admin_all on public.teacher_codes
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 부트스트랩 / 운영 참고 (SQL Editor 에서 실행)
--
-- 1) 최초 관리자 지정 (가입한 본인 계정을 admin 으로):
--    update public.users set role = 'admin'
--    where id = (select id from auth.users where email = '<관리자이메일>');
--
-- 2) 교사 가입 코드 발급 (공유 코드):
--    insert into public.teacher_codes (code, label) values ('YH2026-TEACHER', '2026 교직원');
--
-- 3) 코드 폐기 / 교체:
--    update public.teacher_codes set active = false where code = 'YH2026-TEACHER';
--
-- 4) (수동) 특정 계정 교사 승격:
--    update public.users set role = 'teacher' where id = '<auth-uid>';
-- ============================================================
