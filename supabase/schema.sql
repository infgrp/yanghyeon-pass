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
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists passes_student_idx on public.passes (student_id, date desc);
create index if not exists passes_status_idx  on public.passes (status, date desc);

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
begin
  insert into public.users (id, name, role, student_id, parent_phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', '이름미정'),
    coalesce(new.raw_user_meta_data ->> 'role', 'student'),
    new.raw_user_meta_data ->> 'student_id',
    new.raw_user_meta_data ->> 'parent_phone'
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
-- 4. 권한 헬퍼 (RLS 재귀 방지를 위해 SECURITY DEFINER 사용)
-- ──────────────────────────────────────────────
create or replace function public.is_teacher()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'teacher'
  );
$$;

-- ──────────────────────────────────────────────
-- 5. Row Level Security (RLS)
-- ──────────────────────────────────────────────
alter table public.users  enable row level security;
alter table public.passes enable row level security;

-- users: 본인 행 조회 / 교사 정보는 모두 조회(승인자 이름 표기용) /
--        교사는 전체 조회 / 본인 행 수정
drop policy if exists users_select_self     on public.users;
drop policy if exists users_select_teachers on public.users;
drop policy if exists users_select_teacher  on public.users;
drop policy if exists users_update_self     on public.users;

create policy users_select_self on public.users
  for select using (id = auth.uid());

-- 교사 행(id, name 등)은 외출증에 '담당교사' 이름을 표기해야 하므로 공개 조회 허용
create policy users_select_teachers on public.users
  for select using (role = 'teacher');

create policy users_select_teacher on public.users
  for select using (public.is_teacher());

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

create policy passes_select_teacher on public.passes
  for select using (public.is_teacher());

create policy passes_update_teacher on public.passes
  for update using (public.is_teacher());

-- ============================================================
-- 참고: 가입 후 특정 계정을 교사로 승격시키려면 (SQL Editor에서)
--   update public.users set role = 'teacher' where id = '<auth-uid>';
-- ============================================================
