-- Add 16-type "growth partner" fields to student_personality.
-- Safe to run multiple times.

alter table if exists public.student_personality
  add column if not exists partner_type_code text,
  add column if not exists partner_type_name text,
  add column if not exists partner_axes jsonb,
  add column if not exists partner_version integer;

