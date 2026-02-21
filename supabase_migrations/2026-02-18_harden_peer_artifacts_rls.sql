-- Harden RLS for peer_artifacts.
-- Goal:
-- - Students can only create/update/delete their own pending rows.
-- - Students cannot self-approve or write reviewer fields.
-- - Teachers in same class retain full control.

drop policy if exists peer_artifacts_insert_policy on public.peer_artifacts;
create policy peer_artifacts_insert_policy
on public.peer_artifacts
for insert
to authenticated
with check (
  (
    exists (
      select 1
      from public.user_profiles up
      where up.class_code = peer_artifacts.class_code
        and up.google_uid::text = auth.uid()::text
        and up.role = 'teacher'
    )
  )
  or
  (
    exists (
      select 1
      from public.user_profiles up
      where up.class_code = peer_artifacts.class_code
        and up.google_uid::text = auth.uid()::text
        and up.role = 'student'
        and (
          (peer_artifacts.eval_type = 'individual' and up.student_number::text = peer_artifacts.target_id::text)
          or
          (peer_artifacts.eval_type = 'group' and up.group_number::text = peer_artifacts.target_id::text)
        )
    )
    and peer_artifacts.status = 'pending'
    and peer_artifacts.rejection_reason is null
    and peer_artifacts.reviewed_by_uid is null
    and peer_artifacts.reviewed_at is null
    and peer_artifacts.submitted_by_uid::text = auth.uid()::text
  )
);

drop policy if exists peer_artifacts_update_policy on public.peer_artifacts;
create policy peer_artifacts_update_policy
on public.peer_artifacts
for update
to authenticated
using (
  (
    exists (
      select 1
      from public.user_profiles up
      where up.class_code = peer_artifacts.class_code
        and up.google_uid::text = auth.uid()::text
        and up.role = 'teacher'
    )
  )
  or
  (
    exists (
      select 1
      from public.user_profiles up
      where up.class_code = peer_artifacts.class_code
        and up.google_uid::text = auth.uid()::text
        and up.role = 'student'
        and (
          (peer_artifacts.eval_type = 'individual' and up.student_number::text = peer_artifacts.target_id::text)
          or
          (peer_artifacts.eval_type = 'group' and up.group_number::text = peer_artifacts.target_id::text)
        )
    )
    and peer_artifacts.status = 'pending'
  )
)
with check (
  (
    exists (
      select 1
      from public.user_profiles up
      where up.class_code = peer_artifacts.class_code
        and up.google_uid::text = auth.uid()::text
        and up.role = 'teacher'
    )
  )
  or
  (
    exists (
      select 1
      from public.user_profiles up
      where up.class_code = peer_artifacts.class_code
        and up.google_uid::text = auth.uid()::text
        and up.role = 'student'
        and (
          (peer_artifacts.eval_type = 'individual' and up.student_number::text = peer_artifacts.target_id::text)
          or
          (peer_artifacts.eval_type = 'group' and up.group_number::text = peer_artifacts.target_id::text)
        )
    )
    and peer_artifacts.status = 'pending'
    and peer_artifacts.rejection_reason is null
    and peer_artifacts.reviewed_by_uid is null
    and peer_artifacts.reviewed_at is null
    and peer_artifacts.submitted_by_uid::text = auth.uid()::text
  )
);

drop policy if exists peer_artifacts_delete_policy on public.peer_artifacts;
create policy peer_artifacts_delete_policy
on public.peer_artifacts
for delete
to authenticated
using (
  (
    exists (
      select 1
      from public.user_profiles up
      where up.class_code = peer_artifacts.class_code
        and up.google_uid::text = auth.uid()::text
        and up.role = 'teacher'
    )
  )
  or
  (
    exists (
      select 1
      from public.user_profiles up
      where up.class_code = peer_artifacts.class_code
        and up.google_uid::text = auth.uid()::text
        and up.role = 'student'
        and (
          (peer_artifacts.eval_type = 'individual' and up.student_number::text = peer_artifacts.target_id::text)
          or
          (peer_artifacts.eval_type = 'group' and up.group_number::text = peer_artifacts.target_id::text)
        )
    )
    and peer_artifacts.status = 'pending'
  )
);
