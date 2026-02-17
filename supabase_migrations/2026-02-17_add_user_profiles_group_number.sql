-- Add teacher-managed group assignment column for student profiles.
-- Safe to run multiple times.

alter table if exists public.user_profiles
  add column if not exists group_number integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_group_number_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_group_number_check
      check (group_number is null or group_number >= 1);
  end if;
end
$$;

create index if not exists idx_user_profiles_class_role_group_number
  on public.user_profiles (class_code, role, group_number);
