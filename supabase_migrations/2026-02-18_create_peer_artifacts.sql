-- Peer artifact links for student/group evaluation.
-- One target can have one URL per class/date/eval_type.

create table if not exists public.peer_artifacts (
  id bigserial primary key,
  class_code text not null,
  eval_date date not null,
  eval_type text not null check (eval_type in ('individual', 'group')),
  target_id text not null,
  source_url text not null check (source_url ~* '^https?://'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  submitted_by_uid text not null,
  submitted_at timestamptz not null default now(),
  reviewed_by_uid text,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint peer_artifacts_unique_target unique (class_code, eval_date, eval_type, target_id)
);

create index if not exists idx_peer_artifacts_lookup
  on public.peer_artifacts (class_code, eval_date, eval_type, target_id);

create index if not exists idx_peer_artifacts_status
  on public.peer_artifacts (class_code, eval_date, eval_type, status);

create or replace function public.set_peer_artifacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_peer_artifacts_updated_at on public.peer_artifacts;
create trigger trg_peer_artifacts_updated_at
before update on public.peer_artifacts
for each row
execute function public.set_peer_artifacts_updated_at();

alter table public.peer_artifacts enable row level security;

drop policy if exists peer_artifacts_select_policy on public.peer_artifacts;
create policy peer_artifacts_select_policy
on public.peer_artifacts
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.class_code = peer_artifacts.class_code
      and up.google_uid::text = auth.uid()::text
      and (
        up.role = 'teacher'
        or peer_artifacts.status = 'approved'
        or (
          up.role = 'student'
          and peer_artifacts.eval_type = 'individual'
          and up.student_number::text = peer_artifacts.target_id::text
        )
        or (
          up.role = 'student'
          and peer_artifacts.eval_type = 'group'
          and up.group_number::text = peer_artifacts.target_id::text
        )
      )
  )
);

drop policy if exists peer_artifacts_insert_policy on public.peer_artifacts;
create policy peer_artifacts_insert_policy
on public.peer_artifacts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.class_code = peer_artifacts.class_code
      and up.google_uid::text = auth.uid()::text
      and (
        up.role = 'teacher'
        or (
          up.role = 'student'
          and peer_artifacts.eval_type = 'individual'
          and up.student_number::text = peer_artifacts.target_id::text
        )
        or (
          up.role = 'student'
          and peer_artifacts.eval_type = 'group'
          and up.group_number::text = peer_artifacts.target_id::text
        )
      )
  )
);

drop policy if exists peer_artifacts_update_policy on public.peer_artifacts;
create policy peer_artifacts_update_policy
on public.peer_artifacts
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.class_code = peer_artifacts.class_code
      and up.google_uid::text = auth.uid()::text
      and (
        up.role = 'teacher'
        or (
          up.role = 'student'
          and peer_artifacts.eval_type = 'individual'
          and up.student_number::text = peer_artifacts.target_id::text
        )
        or (
          up.role = 'student'
          and peer_artifacts.eval_type = 'group'
          and up.group_number::text = peer_artifacts.target_id::text
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.class_code = peer_artifacts.class_code
      and up.google_uid::text = auth.uid()::text
      and (
        up.role = 'teacher'
        or (
          up.role = 'student'
          and peer_artifacts.eval_type = 'individual'
          and up.student_number::text = peer_artifacts.target_id::text
        )
        or (
          up.role = 'student'
          and peer_artifacts.eval_type = 'group'
          and up.group_number::text = peer_artifacts.target_id::text
        )
      )
  )
);

drop policy if exists peer_artifacts_delete_policy on public.peer_artifacts;
create policy peer_artifacts_delete_policy
on public.peer_artifacts
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.class_code = peer_artifacts.class_code
      and up.google_uid::text = auth.uid()::text
      and (
        up.role = 'teacher'
        or (
          up.role = 'student'
          and peer_artifacts.eval_type = 'individual'
          and up.student_number::text = peer_artifacts.target_id::text
        )
        or (
          up.role = 'student'
          and peer_artifacts.eval_type = 'group'
          and up.group_number::text = peer_artifacts.target_id::text
        )
      )
  )
);

grant select, insert, update, delete on table public.peer_artifacts to authenticated;
grant usage, select on sequence public.peer_artifacts_id_seq to authenticated;
