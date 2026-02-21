-- 24인 -> 16인 학생 성장 파트너 체험용 데이터 시드 (수정됨)
-- 대상: class_code = '체험용'
-- 테이블: user_profiles, student_personality
-- 기준일: 2026-03-01

BEGIN;

-- 1) '체험용' 학급 인원 설정 (16명) 및 기존 데이터 정리
UPDATE public.classes SET student_count = 16 WHERE class_code = '체험용';

DELETE FROM public.student_personality WHERE class_code = '체험용';
DELETE FROM public.user_profiles WHERE class_code = '체험용' AND role = 'student';

-- 2) 학생 프로필 16명 생성 (번호 1~16)
INSERT INTO public.user_profiles (
  google_uid,
  google_email,
  role,
  class_code,
  student_number,
  student_type,
  group_number
)
SELECT
  'demo-student-uid-' || gs as google_uid,
  'student' || gs || '@demo.baeumlog.kr' as google_email,
  'student' as role,
  '체험용' as class_code,
  gs as student_number,  -- [수정] integer 타입으로 변경 (::text 제거)
  'individual' as student_type,
  null as group_number
FROM generate_series(1, 16) gs;

-- 3) 16명 성향 데이터 생성 (8가지 유형 x 2명씩)
WITH raw_data AS (
  SELECT
    gs::text as student_id,
    -- 8가지 유형 배분을 위한 index (0~7)
    (gs - 1) % 8 as type_idx,
    -- 함께형/혼자형 배분을 위한 index (0~1)
    (gs - 1) % 2 as env_idx
  FROM generate_series(1, 16) gs
),
mapped_answers AS (
  SELECT
    student_id,
    CASE type_idx
      WHEN 0 THEN ARRAY['A','A','A','A','A','A'] -- 해결디테일계획
      WHEN 1 THEN ARRAY['A','A','A','A','B','B'] -- 해결디테일탐색
      WHEN 2 THEN ARRAY['A','A','B','B','A','A'] -- 해결큰그림계획
      WHEN 3 THEN ARRAY['A','A','B','B','B','B'] -- 해결큰그림탐색
      WHEN 4 THEN ARRAY['B','B','A','A','A','A'] -- 지지디테일계획
      WHEN 5 THEN ARRAY['B','B','A','A','B','B'] -- 지지디테일탐색
      WHEN 6 THEN ARRAY['B','B','B','B','A','A'] -- 지지큰그림계획
      WHEN 7 THEN ARRAY['B','B','B','B','B','B'] -- 지지큰그림탐색
    END as q1_6,
    CASE env_idx
      WHEN 0 THEN ARRAY['A','A'] -- 함께형
      WHEN 1 THEN ARRAY['B','B'] -- 혼자형
    END as q7_8
  FROM raw_data
),
final_answers AS (
  SELECT
    student_id,
    q1_6[1] as q1, q1_6[2] as q2, q1_6[3] as q3, q1_6[4] as q4, q1_6[5] as q5, q1_6[6] as q6,
    q7_8[1] as q7, q7_8[2] as q8
  FROM mapped_answers
),
axes AS (
  SELECT
    student_id,
    q1, q2, q3, q4, q5, q6, q7, q8,
    CASE WHEN q1 = 'A' THEN '해결형' ELSE '지지형' END as coaching_style,
    CASE WHEN q3 = 'A' THEN '디테일형' ELSE '큰그림형' END as info_processing,
    CASE WHEN q5 = 'A' THEN '계획형' ELSE '탐색형' END as execution_strategy,
    CASE WHEN q7 = 'A' THEN '함께형' ELSE '혼자형' END as learning_env,
    CASE WHEN q7 = 'A' THEN '#함께 성장형' ELSE '#혼자 집중형' END as support_tag,
    (CASE WHEN q1 = 'A' THEN '해결' ELSE '지지' end) ||
    (CASE WHEN q3 = 'A' THEN '디테일' ELSE '큰그림' end) ||
    (CASE WHEN q5 = 'A' THEN '계획' ELSE '탐색' end) as partner_type_code
  FROM final_answers
),
named AS (
  SELECT
    *,
    CASE partner_type_code
      WHEN '해결디테일계획' THEN '구체적인 계획가'
      WHEN '해결디테일탐색' THEN '구체적인 도전가'
      WHEN '해결큰그림계획' THEN '큰 그림형 계획가'
      WHEN '해결큰그림탐색' THEN '큰 그림형 도전가'
      WHEN '지지디테일계획' THEN '함께하는 계획가'
      WHEN '지지디테일탐색' THEN '함께하는 도전가'
      WHEN '지지큰그림계획' THEN '공감하는 계획가'
      WHEN '지지큰그림탐색' THEN '공감하는 도전가'
    END as partner_type_name
  FROM axes
)
INSERT INTO public.student_personality (
  class_code,
  student_id,
  personality_type,
  question_responses,
  partner_type_code,
  partner_type_name,
  partner_axes,
  partner_version
)
SELECT
  '체험용' as class_code,
  student_id,
  partner_type_name as personality_type,
  jsonb_build_object(
    '1', q1, '2', q2, '3', q3, '4', q4,
    '5', q5, '6', q6, '7', q7, '8', q8
  ) as question_responses,
  partner_type_code,
  partner_type_name,
  jsonb_build_object(
    'coaching_style', coaching_style,
    'info_processing', info_processing,
    'execution_strategy', execution_strategy,
    'learning_env', learning_env,
    'support_tag', support_tag
  ) as partner_axes,
  2 as partner_version
FROM named;

COMMIT;
