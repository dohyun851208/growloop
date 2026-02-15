-- 교과세특(평어) 생성 결과 저장 + 학기 기간/학교급 설정 저장용 스키마
-- Supabase SQL Editor에서 실행하세요.
--
-- 이 프로젝트(app.js)는 아래 컬럼/테이블을 사용합니다.
-- - classes: school_level, semester1_start, semester1_end, semester2_start, semester2_end
-- - subject_comments: class_code, student_id, semester, subject, school_level, period_start, period_end, note_count, generated_text

-- 1) classes 테이블에 설정 컬럼 추가
alter table public.classes
  add column if not exists school_level text;

alter table public.classes
  add column if not exists semester1_start date,
  add column if not exists semester1_end date,
  add column if not exists semester2_start date,
  add column if not exists semester2_end date;

-- 2) 생성 결과 저장 테이블
create table if not exists public.subject_comments (
  id uuid primary key default gen_random_uuid(),
  class_code text not null,
  student_id text not null,
  semester smallint not null check (semester in (1, 2)),
  subject text not null,
  school_level text null,
  period_start date null,
  period_end date null,
  note_count integer not null default 0,
  generated_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subject_comments_unique unique (class_code, student_id, semester, subject)
);

create index if not exists subject_comments_class_code_idx
  on public.subject_comments (class_code);

create index if not exists subject_comments_lookup_idx
  on public.subject_comments (class_code, student_id, semester, subject);

-- 3) updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_subject_comments_updated_at on public.subject_comments;
create trigger trg_subject_comments_updated_at
before update on public.subject_comments
for each row execute function public.set_updated_at();

-- 4) (선택) RLS를 사용하는 경우에만 아래를 적용하세요.
-- 이 레포는 기존 테이블들의 RLS/정책이 확정돼 있지 않아서 기본으로는 건드리지 않습니다.
--
-- alter table public.subject_comments enable row level security;
-- create policy "subject_comments_read_all" on public.subject_comments
--   for select using (true);
-- create policy "subject_comments_write_all" on public.subject_comments
--   for insert with check (true);
-- create policy "subject_comments_update_all" on public.subject_comments
--   for update using (true) with check (true);
