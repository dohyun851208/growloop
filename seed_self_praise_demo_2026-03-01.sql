-- 체험용 데이터 시드: 스스로배움 + 칭찬우체통
-- - 친구로배움(reviews/objectives/tasks/rating_criteria)은 건드리지 않음
-- - class_code='체험용' 범위에서 아래 6개 테이블만 재구성
--   daily_reflections, project_reflections, student_goals,
--   student_personality, teacher_messages, praise_messages
-- - 기준일: 2026-03-01 (KST)

begin;
set local timezone = 'Asia/Seoul';

-- 0) 정리: 친구로배움 외 범위만 초기화
delete from public.teacher_messages where class_code = '체험용';
delete from public.praise_messages where class_code = '체험용';
delete from public.project_reflections where class_code = '체험용';
delete from public.student_goals where class_code = '체험용';
delete from public.student_personality where class_code = '체험용';
delete from public.daily_reflections where class_code = '체험용';

-- 1) 성장 파트너(16명): Q1~Q8 전체 응답 + 파생 컬럼 저장
with raw_answers(student_id, q1, q2, q3, q4, q5, q6, q7, q8) as (
  -- student_id, q1, q2, q3, q4, q5, q6, q7, q8
  values
    ('1',  'B','B','B','B','A','A','A','B'), -- 대표 시연형: 공감하는 계획가 + 함께 성장형
    ('2',  'A','A','A','A','A','A','A','A'),
    ('3',  'A','A','A','A','B','B','B','B'),
    ('4',  'A','A','B','B','A','A','A','A'),
    ('5',  'A','A','B','B','B','B','B','B'),
    ('6',  'B','B','A','A','A','A','A','A'),
    ('7',  'B','B','A','A','B','B','B','B'),
    ('8',  'B','B','B','B','B','B','B','B'),
    ('9',  'A','A','A','A','A','A','B','B'),
    ('10', 'A','A','A','A','B','B','A','B'),
    ('11', 'A','A','B','B','A','A','B','A'),
    ('12', 'A','A','B','B','B','B','A','A'),
    ('13', 'B','B','A','A','A','A','B','A'),
    ('14', 'B','B','A','A','B','B','A','A'),
    ('15', 'B','B','B','B','A','A','B','B'),
    ('16', 'B','B','B','B','B','B','A','B')
), axes as (
  select
    student_id,
    q1, q2, q3, q4, q5, q6, q7, q8,
    case when q1 = 'A' then '해결형' else '지지형' end as coaching_style,
    case when q3 = 'A' then '디테일형' else '큰그림형' end as info_processing,
    case when q5 = 'A' then '계획형' else '탐색형' end as execution_strategy,
    case when q7 = 'A' then '함께형' else '혼자형' end as learning_env,
    case when q7 = 'A' then '#함께 성장형' else '#혼자 집중형' end as support_tag,
    (case when q1 = 'A' then '해결' else '지지' end) ||
    (case when q3 = 'A' then '디테일' else '큰그림' end) ||
    (case when q5 = 'A' then '계획' else '탐색' end) as partner_type_code
  from raw_answers
), named as (
  select
    student_id, q1, q2, q3, q4, q5, q6, q7, q8,
    coaching_style, info_processing, execution_strategy, learning_env, support_tag, partner_type_code,
    case partner_type_code
      when '해결디테일계획' then '구체적인 계획가'
      when '해결디테일탐색' then '구체적인 도전가'
      when '해결큰그림계획' then '큰그림형 계획가'
      when '해결큰그림탐색' then '큰그림형 도전가'
      when '지지디테일계획' then '함께하는 계획가'
      when '지지디테일탐색' then '함께하는 도전가'
      when '지지큰그림계획' then '공감하는 계획가'
      when '지지큰그림탐색' then '공감하는 도전가'
      else '공감하는 도전가'
    end as partner_type_name
  from axes
), allowed_personality as (
  select coalesce(array_agg(v.val), array[]::text[]) as vals
  from (
    select distinct m[1] as val
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = t.relnamespace
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') as m
    where nsp.nspname = 'public'
      and t.relname = 'student_personality'
      and c.conname = 'student_personality_personality_type_check'
  ) v
), named_with_personality as (
  select
    n.*,
    coalesce(
      case when array_length(ap.vals, 1) is not null and n.partner_type_name = any(ap.vals) then n.partner_type_name end,
      case when array_length(ap.vals, 1) is not null and n.partner_type_code = any(ap.vals) then n.partner_type_code end,
      case when array_length(ap.vals, 1) is not null then ap.vals[1] end,
      n.partner_type_name
    ) as personality_type_value
  from named n
  cross join allowed_personality ap
)
insert into public.student_personality (
  class_code,
  student_id,
  personality_type,
  question_responses,
  partner_type_code,
  partner_type_name,
  partner_axes,
  partner_version
)
select
  '체험용' as class_code,
  student_id,
  personality_type_value as personality_type,
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
from named_with_personality
on conflict (class_code, student_id) do update
set
  personality_type = excluded.personality_type,
  question_responses = excluded.question_responses,
  partner_type_code = excluded.partner_type_code,
  partner_type_name = excluded.partner_type_name,
  partner_axes = excluded.partner_axes,
  partner_version = excluded.partner_version;

-- 2) 배움노트: 1번 학생(10일, 대표 시연형) 상세 데이터
insert into public.daily_reflections (
  class_code,
  student_id,
  reflection_date,
  learning_text,
  subject_tags,
  ai_feedback
)
values
(
  '체험용','1',date '2026-02-20',
  E'오늘 배운 내용: 수학 시간에 분수의 나눗셈을 그림으로 바꾸어 의미를 이해했어요.\n내가 잘한 점: 계산 전에 식의 구조를 먼저 읽고, 틀린 문제를 다시 풀었어요.\n어려웠던 점: 자연수를 분수로 바꿀 때 약분 순서를 자꾸 놓쳤어요.\n이해/해결 방법: 선생님 풀이를 보고 분수 막대 그림을 그린 뒤, 같은 문제를 2번 더 연습했어요.\n아직 헷갈리는 점: 대분수가 섞인 문제에서 약분 타이밍이 헷갈려요.\n일상에 적용해볼 점: 간식 나눌 때 분수로 양을 나눠보며 계산을 확인해볼게요.',
  array['수학']::text[],
  null
),
(
  '체험용','1',date '2026-02-21',
  E'오늘 배운 내용: 사회에서 기후에 따라 옷차림과 주거가 달라지는 이유를 사례로 정리했어요.\n내가 잘한 점: 발표할 때 핵심 단어를 먼저 말하고 예시를 붙여 설명했어요.\n어려웠던 점: 지역별 특징을 한 문장으로 요약할 때 말이 길어졌어요.\n이해/해결 방법: 칠판에 핵심어 3개만 적어 두고 그 순서대로 발표했어요.\n아직 헷갈리는 점: 기후와 산업이 연결되는 부분을 더 분명히 설명하고 싶어요.\n일상에 적용해볼 점: 뉴스에서 날씨와 생활 변화가 나오면 오늘 배운 기준으로 비교해볼게요.',
  array['사회','발표']::text[],
  null
),
(
  '체험용','1',date '2026-02-22',
  E'오늘 배운 내용: 국어 시간에 설명문 구조를 도입-전개-정리로 나누어 읽었어요.\n내가 잘한 점: 문단마다 중심 문장을 표시해서 글 흐름을 빨리 파악했어요.\n어려웠던 점: 전개 문단의 근거 문장을 고를 때 비슷한 문장이 많아 혼동됐어요.\n이해/해결 방법: 중심 문장 옆에 근거 표시 기호를 붙여 문장 역할을 구분했어요.\n아직 헷갈리는 점: 글쓴이 의도와 사실 설명을 구분하는 기준이 아직 약해요.\n일상에 적용해볼 점: 읽는 글에서 중심 문장을 먼저 찾아보고 내용을 정리하는 습관을 들일게요.',
  array['국어','토론']::text[],
  null
),
(
  '체험용','1',date '2026-02-23',
  E'오늘 배운 내용: 과학 실험에서 증발 속도를 바꾸는 조건을 비교했어요.\n내가 잘한 점: 관찰 시간을 일정하게 맞추고 표로 기록해서 결과를 명확히 남겼어요.\n어려웠던 점: 결과 해석에서 원인과 결과 문장을 섞어 말했어요.\n이해/해결 방법: 모둠 친구와 역할을 나눠 기록표를 다시 읽고 원인-결과를 따로 정리했어요.\n아직 헷갈리는 점: 온도와 바람 중 어떤 조건이 더 큰 영향을 주는지 확신이 부족해요.\n일상에 적용해볼 점: 빨래가 마르는 속도를 관찰하며 조건 차이를 직접 확인해볼게요.',
  array['과학','모둠활동']::text[],
  null
),
(
  '체험용','1',date '2026-02-24',
  E'오늘 배운 내용: 영어에서 길 안내 표현을 상황 대화로 연습했어요.\n내가 잘한 점: 짝 활동에서 질문과 답변 순서를 지켜 끊기지 않게 말했어요.\n어려웠던 점: 전치사 at, on, in을 위치 설명에 정확히 쓰는 게 어려웠어요.\n이해/해결 방법: 교과서 예문을 지도 그림과 함께 써 보며 문장 패턴을 익혔어요.\n아직 헷갈리는 점: 방향 전환 표현(turn left/right) 뒤 설명이 길어지면 문장이 꼬여요.\n일상에 적용해볼 점: 학교 복도 위치를 영어로 말해보며 전치사 사용을 익힐게요.',
  array['영어']::text[],
  null
),
(
  '체험용','1',date '2026-02-25',
  E'오늘 배운 내용: 수학에서 분수의 나눗셈 응용문제를 문장 해석부터 풀었어요.\n내가 잘한 점: 문제를 읽고 필요한 값에 밑줄을 치며 식을 먼저 세웠어요.\n어려웠던 점: 단위를 바꿀 때 분수 계산과 단위 환산을 동시에 하니 실수가 났어요.\n이해/해결 방법: 단위 환산을 먼저 끝낸 뒤 계산하는 순서표를 만들어 적용했어요.\n아직 헷갈리는 점: 여러 단계 문제에서 중간식을 어떻게 간단히 쓰는지 고민돼요.\n일상에 적용해볼 점: 요리 레시피 비율을 분수로 바꿔 양 조절 계산을 연습해볼게요.',
  array['수학','실과']::text[],
  null
),
(
  '체험용','1',date '2026-02-26',
  E'오늘 배운 내용: 도덕에서 갈등 상황의 입장을 바꿔 생각하는 활동을 했어요.\n내가 잘한 점: 내 생각만 말하지 않고 상대 입장 근거도 함께 말했어요.\n어려웠던 점: 감정이 앞서면 근거를 차분히 정리해 말하기 어려웠어요.\n이해/해결 방법: 주장-이유-예시 3단계로 말하기 메모를 만들어 발표했어요.\n아직 헷갈리는 점: 비슷한 상황에서 어떤 기준으로 먼저 양보할지 아직 고민돼요.\n일상에 적용해볼 점: 친구와 의견이 다를 때 이유를 먼저 묻고 답하는 연습을 해볼게요.',
  array['도덕','토론','발표']::text[],
  null
),
(
  '체험용','1',date '2026-02-27',
  E'오늘 배운 내용: 음악에서 리듬 패턴을 듣고 박자 단위로 분석했어요.\n내가 잘한 점: 틀린 박자를 표시해 다시 듣고 정확히 맞출 때까지 반복했어요.\n어려웠던 점: 빠른 템포에서 쉼표가 들어가는 구간을 놓쳤어요.\n이해/해결 방법: 손뼉 박자와 발 박자를 분리해 연습하니 흐름이 안정됐어요.\n아직 헷갈리는 점: 리듬을 악보로 옮길 때 기호 길이를 정확히 적는 게 어려워요.\n일상에 적용해볼 점: 좋아하는 노래 리듬을 박자로 나눠 적어보며 감각을 키울게요.',
  array['음악']::text[],
  null
),
(
  '체험용','1',date '2026-02-28',
  E'오늘 배운 내용: 과학에서 실험 결과를 그래프로 나타내고 경향을 설명했어요.\n내가 잘한 점: 그래프 축 이름과 단위를 먼저 확인해 해석 오류를 줄였어요.\n어려웠던 점: 그래프가 비슷하게 보이는 구간의 차이를 말로 설명하기 어려웠어요.\n이해/해결 방법: 증가/감소/유지 구간을 색으로 구분해 문장으로 바꿔 적었어요.\n아직 헷갈리는 점: 이상치가 있을 때 전체 경향을 어떻게 판단할지 아직 불안해요.\n일상에 적용해볼 점: 공부 시간 기록을 그래프로 만들어 변화 패턴을 확인해볼게요.',
  array['과학','수학']::text[],
  null
),
(
  '체험용','1',date '2026-03-01',
  E'오늘 배운 내용: 사회 발표 준비에서 자료를 정리하고 모둠 발표 순서를 맞췄어요.\n내가 잘한 점: 핵심 문장을 짧게 바꿔 전달력이 좋아졌고 친구 피드백도 반영했어요.\n어려웠던 점: 질문을 받으면 바로 답할 근거를 찾는 데 시간이 걸렸어요.\n이해/해결 방법: 예상 질문을 3개 정리하고 근거 문장을 카드로 만들어 연습했어요.\n아직 헷갈리는 점: 낯선 질문이 들어왔을 때 답변을 구조적으로 시작하는 방법이 더 필요해요.\n일상에 적용해볼 점: 발표 전에 핵심-근거-예시 순서로 짧게 말하는 연습을 계속할게요.',
  array['사회','발표','모둠활동']::text[],
  null
);

-- 3) 배움노트: 2~4번 10일 + 5~16번 1일 (총 42행)
with base as (
  select
    s::text as student_id,
    s as sid,
    d::date as reflection_date,
    row_number() over (partition by s order by d) as day_no,
    extract(day from d)::int as day_num
  from generate_series(2, 4) s
  cross join generate_series(date '2026-02-20', date '2026-03-01', interval '1 day') d
  union all
  select
    s::text as student_id,
    s as sid,
    date '2026-03-01' as reflection_date,
    1 as day_no,
    1 as day_num
  from generate_series(5, 16) s
),
draft as (
  select
    student_id,
    reflection_date,
    sid,
    day_no,
    case
      when sid = 2 then
        case mod(day_no, 3)
          when 1 then array['수학']::text[]
          when 2 then array['수학','실과']::text[]
          else array['수학','발표']::text[]
        end
      when sid = 3 then
        case mod(day_no, 3)
          when 1 then array['국어']::text[]
          when 2 then array['국어','토론']::text[]
          else array['국어','발표','모둠활동']::text[]
        end
      when sid = 4 then
        case mod(day_no, 4)
          when 1 then array['과학','모둠활동']::text[]
          when 2 then array['사회']::text[]
          when 3 then array['영어','발표']::text[]
          else array['미술','음악']::text[]
        end
      else
        case mod(sid + day_no, 5)
          when 0 then array['수학']::text[]
          when 1 then array['과학','모둠활동']::text[]
          when 2 then array['국어','발표']::text[]
          when 3 then array['사회','영어']::text[]
          else array['체육','도덕','기타']::text[]
        end
    end as subject_tags,
    case mod(sid + day_no, 6)
      when 0 then '개념과 예시를 연결해 핵심을 정리했어요.'
      when 1 then '문제를 단계별로 나눠 보고 풀이 흐름을 이해했어요.'
      when 2 then '모둠 활동에서 역할을 나눠 자료를 정리했어요.'
      when 3 then '발표 자료를 간단한 문장으로 바꿔 전달해봤어요.'
      when 4 then '실험 결과를 표로 정리하고 이유를 설명했어요.'
      else '읽은 내용을 한 문장으로 요약하며 이해를 점검했어요.'
    end as learned,
    case mod(sid * day_no, 6)
      when 0 then '핵심 단어를 먼저 표시하고 끝까지 집중했어요.'
      when 1 then '틀린 부분을 다시 확인하고 스스로 고쳤어요.'
      when 2 then '친구 설명을 듣고 내 말로 다시 정리했어요.'
      when 3 then '시간 안에 해야 할 순서를 정해서 실천했어요.'
      when 4 then '질문을 메모하고 확인하면서 이해를 넓혔어요.'
      else '예시를 직접 만들어보며 개념을 적용했어요.'
    end as good_point,
    case mod(sid + day_no * 2, 6)
      when 0 then '용어가 비슷해서 문제 요구를 헷갈렸어요.'
      when 1 then '계산 순서를 바꾸면 실수가 자주 생겼어요.'
      when 2 then '긴 문장을 짧게 요약할 때 핵심이 빠졌어요.'
      when 3 then '근거를 말할 때 예시가 부족했어요.'
      when 4 then '발표할 때 긴장해서 속도가 빨라졌어요.'
      else '그래프나 표 해석에서 세부 차이를 놓쳤어요.'
    end as hard_point,
    case mod(sid * 3 + day_no, 6)
      when 0 then '체크리스트를 만들고 한 단계씩 확인했어요.'
      when 1 then '선생님 예시를 따라 한 뒤 비슷한 문제를 다시 풀었어요.'
      when 2 then '친구와 설명을 번갈아 하며 틀린 부분을 찾았어요.'
      when 3 then '핵심 문장을 먼저 쓰고 근거를 덧붙였어요.'
      when 4 then '오답 원인을 적고 같은 유형을 한 번 더 연습했어요.'
      else '도식화해서 원인과 결과를 분리해 정리했어요.'
    end as solve_way,
    case mod(sid + day_no, 5)
      when 0 then '비슷한 유형을 만났을 때 시작 문장을 정하는 게 아직 어려워요.'
      when 1 then '여러 조건이 동시에 나오면 우선순위 판단이 헷갈려요.'
      when 2 then '근거를 한 문장으로 정확히 압축하는 연습이 더 필요해요.'
      when 3 then '낯선 단어가 나오면 문맥으로 추론하는 속도가 느려요.'
      else '문제를 빨리 읽으면 세부 조건을 놓칠 때가 있어요.'
    end as confusing,
    case mod(sid * 5 + day_no, 6)
      when 0 then '집에서 문제를 볼 때도 단계 순서를 먼저 적고 시작할게요.'
      when 1 then '가족에게 오늘 배운 내용을 1분 설명으로 연습해볼게요.'
      when 2 then '일상 상황을 예시로 바꿔 개념을 적용해볼게요.'
      when 3 then '내일 수업 전에 핵심 키워드 3개를 미리 떠올려볼게요.'
      when 4 then '노트에 오답 이유를 짧게 남겨 같은 실수를 줄여볼게요.'
      else '친구와 서로 질문을 만들어 확인하는 연습을 해볼게요.'
    end as apply_point
  from base
)
insert into public.daily_reflections (
  class_code,
  student_id,
  reflection_date,
  learning_text,
  subject_tags,
  ai_feedback
)
select
  '체험용',
  student_id,
  reflection_date,
  '오늘 배운 내용: ' || learned || E'\n' ||
  '내가 잘한 점: ' || good_point || E'\n' ||
  '어려웠던 점: ' || hard_point || E'\n' ||
  '이해/해결 방법: ' || solve_way || E'\n' ||
  '아직 헷갈리는 점: ' || confusing || E'\n' ||
  '일상에 적용해볼 점: ' || apply_point,
  subject_tags,
  null
from draft;

-- 4) 프로젝트 돌아보기: 6개 라벨 강제 포함
insert into public.project_reflections (
  class_code,
  student_id,
  project_name,
  reflection_date,
  star_rating,
  comment
)
values
(
  '체험용','1','우리 동네 기후 안내 카드',date '2026-03-01',5,
  E'🤔 아쉬운 점/어려웠던 점: 자료를 많이 넣으려다 카드 한 장에 정보가 너무 많아졌어요.\n👍 잘된 점: 핵심 키워드를 크게 써서 보는 사람이 내용을 빨리 이해했어요.\n💪 다음 도전: 같은 내용을 30초 설명 버전으로 더 간단히 말해볼래요.\n✨ 인상적인 순간: 친구가 내 카드를 보고 "한눈에 보인다"고 말해준 순간이 가장 기억에 남았어요.\n📘 배운 점: 전달 목표를 먼저 정하면 자료 선택이 쉬워지고 요약이 선명해진다는 걸 배웠어요.\n🎯 다음을 위한 팁: 먼저 전달 목표를 한 문장으로 적고 그 기준으로 자료를 고르자.'
),
(
  '체험용','1','분수 실생활 문제집',date '2026-03-01',4,
  E'🤔 아쉬운 점/어려웠던 점: 실생활 예시를 만들 때 숫자 조건을 너무 복잡하게 잡았어요.\n👍 잘된 점: 난이도별로 문제를 나눠 친구들이 단계적으로 풀 수 있게 했어요.\n💪 다음 도전: 같은 주제로 3문항 미니퀴즈를 만들어 수업 시작 전에 풀어보게 하고 싶어요.\n✨ 인상적인 순간: 친구가 내 문제를 풀고 스스로 설명하는 모습을 본 순간이 가장 뿌듯했어요.\n📘 배운 점: 문제를 만들 때 "한 번에 한 개념" 원칙을 지키면 전달이 쉬워진다는 걸 배웠어요.\n🎯 다음을 위한 팁: 문제를 만들 때 "한 번에 한 개념" 원칙을 지키면 전달이 쉬워진다.'
);

with p as (
  select s as sid
  from generate_series(2, 11) s
)
insert into public.project_reflections (
  class_code,
  student_id,
  project_name,
  reflection_date,
  star_rating,
  comment
)
select
  '체험용',
  sid::text,
  (array[
    '우리 학교 안내 영상',
    '환경 보호 포스터 만들기',
    '지역 문화 소개 발표',
    '수학 게임 규칙 만들기',
    '과학 실험 결과 카드뉴스',
    '독서 추천 카드 제작'
  ])[1 + mod(sid, 6)],
  date '2026-03-01',
  3 + mod(sid, 3),
  '🤔 아쉬운 점/어려웠던 점: ' ||
  (array[
    '시간 배분을 잘못해서 마무리가 급했어요.',
    '자료를 고를 때 기준이 흔들려 고민이 길어졌어요.',
    '설명은 했지만 핵심을 짧게 말하는 게 어려웠어요.',
    '발표 순서를 외우느라 내용 전달이 약해졌어요.'
  ])[1 + mod(sid, 4)] || E'\n' ||
  '👍 잘된 점: ' ||
  (array[
    '역할을 나눠 협력하면서 완성도를 높였어요.',
    '친구 피드백을 반영해 결과물을 개선했어요.',
    '핵심 문장을 먼저 제시해 이해를 도왔어요.',
    '표/그림을 활용해 설명이 쉬워졌어요.'
  ])[1 + mod(sid + 1, 4)] || E'\n' ||
  '💪 다음 도전: ' ||
  (array[
    '질문이 들어와도 근거를 바로 말할 수 있게 준비할래요.',
    '한 장 요약본을 만들어 전달력을 더 높일래요.',
    '다른 관점의 예시를 추가해 설득력을 키울래요.',
    '발표 연습을 2회 이상 하며 속도를 조절할래요.'
  ])[1 + mod(sid + 2, 4)] || E'\n' ||
  '✨ 인상적인 순간: ' ||
  (array[
    '친구가 내 설명을 듣고 고개를 끄덕이는 순간 자신감이 생겼어요.',
    '실수 후 수정 과정을 거쳐 결과물이 완성됐을 때 뿌듯했어요.',
    '협력하면서 서로 강점을 나누는 순간 팀 분위기가 살아났어요.',
    '정리한 내용을 짧게 말했는데도 친구들이 바로 이해한 순간이 인상적이었어요.'
  ])[1 + mod(sid + 3, 4)] || E'\n' ||
  '📘 배운 점: ' ||
  (array[
    '듣는 사람 입장에서 설명 순서를 정하면 전달이 쉬워진다는 걸 배웠어요.',
    '실수 기록과 수정 과정을 남기면 다음 시도가 빨라진다는 걸 배웠어요.',
    '역할을 나눠 협력하면 결과의 완성도가 높아진다는 걸 배웠어요.',
    '핵심을 짧게 정리할수록 메시지가 더 또렷해진다는 걸 배웠어요.'
  ])[1 + mod(sid + 3, 4)] || E'\n' ||
  '🎯 다음을 위한 팁: ' ||
  (array[
    '시작 전에 목표 문장을 먼저 적고 자료를 선택하자.',
    '결과물을 만들며 중간 점검 시간을 꼭 넣자.',
    '설명할 때는 핵심-근거-예시 순서를 유지하자.',
    '완성 직전 친구 1명에게 이해 여부를 확인하자.'
  ])[1 + mod(sid, 4)]
from p;

-- 5) 목표 데이터
with s as (
  select gs as sid
  from generate_series(1, 16) gs
),
goal_rows as (
  select
    sid::text as student_id,
    1 as ord,
    '이번 주 배움노트를 최소 3회 작성하기' as goal_text,
    'weekly' as goal_type,
    (sid % 2 = 0) as is_completed
  from s
  union all
  select
    sid::text,
    2,
    '수업 끝나고 오늘 배운 핵심 3줄 요약하기',
    'weekly',
    (sid % 3 = 0)
  from s
  union all
  select
    '1',
    3,
    '분수 단원 오답노트 2회 복습 완료하기',
    'monthly',
    false
)
insert into public.student_goals (
  class_code,
  student_id,
  goal_text,
  goal_type,
  is_completed,
  completed_at
)
select
  '체험용',
  student_id,
  goal_text,
  goal_type,
  is_completed,
  case
    when is_completed then timestamp with time zone '2026-03-01 20:00:00+09' + ((ord - 1) || ' hours')::interval
    else null
  end
from goal_rows;

-- 6) 선생님께 편지(익명/실명 혼합, 내용 유형 다양화)
insert into public.teacher_messages (
  class_code,
  student_id,
  is_anonymous,
  message_content,
  created_at
)
values
('체험용','1',false,'요즘 모둠활동에서 8번 친구가 제 말을 자주 끊어서 속상해요. 말할 차례를 정하는 규칙을 함께 정해보면 좋겠어요.',timestamp with time zone '2026-03-01 08:55:00+09'),
('체험용',null,true,'2교시 수학 시간에 분수 응용문제가 갑자기 어려워져서 따라가기 힘들 때가 있어요. 중간 예시를 한 번 더 보고 싶어요.',timestamp with time zone '2026-03-01 09:12:00+09'),
('체험용','1',false,'발표 전에 3분만 미리 질문 예상 시간을 주시면 답변 준비에 도움이 될 것 같아요.',timestamp with time zone '2026-03-01 09:35:00+09'),
('체험용','2',false,'체육 시간 규칙 설명이 빠르게 지나가서 헷갈릴 때가 있어요. 핵심 규칙을 칠판에 남겨주시면 좋겠어요.',timestamp with time zone '2026-03-01 10:05:00+09'),
('체험용',null,true,'친구 관계 때문에 쉬는 시간 이후에 집중이 잘 안될 때가 있어요. 짧게 마음 정리할 시간을 주실 수 있을까요?',timestamp with time zone '2026-03-01 10:22:00+09'),
('체험용','3',false,'국어 발표할 때 목소리 크기를 조절하기 어려워요. 발표 전 짧은 리허설 기회가 있으면 좋겠어요.',timestamp with time zone '2026-03-01 10:48:00+09'),
('체험용',null,true,'과학 실험 때 역할이 겹쳐서 참여를 못할 때가 있어요. 역할카드를 미리 나누면 좋겠어요.',timestamp with time zone '2026-03-01 11:07:00+09'),
('체험용','4',false,'영어 시간에 단어 뜻은 알지만 문장으로 말하려면 시간이 더 필요해요. 말하기 준비 시간을 조금만 더 주셨으면 해요.',timestamp with time zone '2026-03-01 11:35:00+09'),
('체험용',null,true,'도덕 토론에서 의견이 부딪히면 분위기가 어색해져요. 서로 말 차례를 지키는 규칙을 한 번 더 알려주세요.',timestamp with time zone '2026-03-01 12:10:00+09'),
('체험용','5',false,'사회 시간 자료가 많을 때 무엇부터 봐야 할지 헷갈려요. 우선순위 기준을 알려주시면 좋겠어요.',timestamp with time zone '2026-03-01 12:42:00+09'),
('체험용',null,true,'쉬는 시간 직후 수업 시작할 때 집중 전환이 어려워요. 1분 정리 루틴이 있으면 좋겠어요.',timestamp with time zone '2026-03-01 13:08:00+09'),
('체험용','6',false,'모둠에서 한 친구가 계속 장난을 쳐서 활동이 늦어졌어요. 역할 점검을 중간에 한 번 해주시면 좋겠어요.',timestamp with time zone '2026-03-01 13:24:00+09'),
('체험용',null,true,'발표 평가 기준을 예시와 함께 미리 보면 준비가 더 쉬울 것 같아요.',timestamp with time zone '2026-03-01 13:46:00+09'),
('체험용','7',false,'음악 시간 리듬 연습 속도가 빨라지면 따라가기 어려워요. 느린 템포 연습을 한 번 더 해주시면 감사해요.',timestamp with time zone '2026-03-01 14:12:00+09'),
('체험용',null,true,'친구랑 오해가 생겼는데 수업에 계속 생각이 나요. 상담할 수 있는 짧은 시간이 있으면 좋겠어요.',timestamp with time zone '2026-03-01 14:37:00+09'),
('체험용','8',false,'프로젝트 준비물 공지 시간을 하루만 더 당겨주시면 준비를 더 잘할 수 있을 것 같아요.',timestamp with time zone '2026-03-01 15:03:00+09');

-- 7) 칭찬 우체통(익명/실명 혼합, 승인 70% / 대기 30%)
insert into public.praise_messages (
  class_code,
  sender_id,
  receiver_id,
  message_content,
  is_anonymous,
  is_approved,
  created_at
)
values
('체험용','1','2','수학 문제 풀이 순서를 차분하게 알려줘서 정말 고마웠어!',false,true,timestamp with time zone '2026-03-01 09:00:00+09'),
('체험용','1','5','익명으로 남겨! 오늘 발표 연습할 때 네가 말 순서 정리해준 게 큰 도움이 됐어.',true,true,timestamp with time zone '2026-03-01 09:06:00+09'),
('체험용','1','9','다음 토론 전에 근거 정리 같이 해줄 수 있을까? 네 방식이 좋아 보여.',false,false,timestamp with time zone '2026-03-01 09:14:00+09'),
('체험용','2','1','발표 전에 긴장한 나를 먼저 도와줘서 고마워. 덕분에 자신감이 생겼어!',false,true,timestamp with time zone '2026-03-01 09:18:00+09'),
('체험용','3','4','실험할 때 기록표 깔끔하게 정리해줘서 팀이 빨리 끝낼 수 있었어.',false,true,timestamp with time zone '2026-03-01 09:24:00+09'),
('체험용','4','1','익명으로 말할게! 질문 받을 때 침착하게 답하는 모습이 멋졌어.',true,false,timestamp with time zone '2026-03-01 09:31:00+09'),
('체험용','5','6','체육 시간에 규칙 다시 설명해줘서 헷갈림이 줄었어. 고마워!',false,true,timestamp with time zone '2026-03-01 09:37:00+09'),
('체험용','6','3','익명인데, 발표 자료 글자 크기 키운 거 덕분에 보기 쉬웠어!',true,true,timestamp with time zone '2026-03-01 09:44:00+09'),
('체험용','7','8','모둠 의견 정리할 때 네가 중간에서 잘 조율해줘서 고마웠어.',false,true,timestamp with time zone '2026-03-01 09:52:00+09'),
('체험용','8','1','오늘 사회 발표할 때 예시를 들어준 게 이해에 큰 도움 됐어.',false,true,timestamp with time zone '2026-03-01 10:01:00+09'),
('체험용','9','10','문제집에서 비슷한 유형 찾아준 거 덕분에 복습이 쉬웠어.',false,true,timestamp with time zone '2026-03-01 10:09:00+09'),
('체험용','10','2','익명으로 남겨! 쉬는 시간에 개념 설명해줘서 진짜 고마워.',true,false,timestamp with time zone '2026-03-01 10:16:00+09'),
('체험용','11','12','발표 전 리허설 같이 맞춰줘서 덜 떨렸어. 고마워!',false,true,timestamp with time zone '2026-03-01 10:24:00+09'),
('체험용','12','11','모둠활동에서 시간 체크해줘서 진행이 매끄러웠어!',false,true,timestamp with time zone '2026-03-01 10:30:00+09'),
('체험용','13','14','익명인데, 네가 실수해도 끝까지 다시 해보는 모습이 멋졌어.',true,true,timestamp with time zone '2026-03-01 10:37:00+09'),
('체험용','14','15','자료 찾는 방법 알려줘서 숙제할 때 도움이 컸어.',false,true,timestamp with time zone '2026-03-01 10:45:00+09'),
('체험용','15','16','친구들 의견을 잘 묶어줘서 토론이 깔끔했어. 고마워!',false,true,timestamp with time zone '2026-03-01 10:52:00+09'),
('체험용','16','13','익명으로 남겨! 표 정리 방식이 좋아서 나도 따라해봤어.',true,false,timestamp with time zone '2026-03-01 11:00:00+09'),
('체험용','2','7','다음 주 과학 실험 준비 같이 할 수 있을까? 도와주면 고마울 것 같아.',false,false,timestamp with time zone '2026-03-01 11:10:00+09'),
('체험용','3','9','익명 요청이야. 발표 연습할 때 발음 체크를 도와줄 수 있을까?',true,false,timestamp with time zone '2026-03-01 11:20:00+09'),
('체험용','4','6','수업 끝나고 오답 정리 같이 하자고 말해줘서 고마워.',false,true,timestamp with time zone '2026-03-01 11:28:00+09'),
('체험용','5','1','익명으로! 너의 요약 노트 방식 덕분에 복습이 쉬웠어.',true,true,timestamp with time zone '2026-03-01 11:34:00+09'),
('체험용','6','10','자료 조사 링크 공유해줘서 과제 시간이 많이 줄었어.',false,true,timestamp with time zone '2026-03-01 11:41:00+09'),
('체험용','7','3','익명인데, 질문을 잘 받아주는 태도가 좋아서 토론이 편했어.',true,true,timestamp with time zone '2026-03-01 11:49:00+09'),
('체험용','8','12','다음에 영어 문장 만들기 같이 연습해줄 수 있어?',false,false,timestamp with time zone '2026-03-01 11:56:00+09'),
('체험용','9','4','익명으로 남겨! 실험 도구 정리해줘서 준비가 빨랐어.',true,true,timestamp with time zone '2026-03-01 12:04:00+09'),
('체험용','10','14','네가 알려준 체크리스트로 발표 준비가 훨씬 쉬워졌어.',false,true,timestamp with time zone '2026-03-01 12:12:00+09'),
('체험용','11','5','익명 요청! 수학 단원평가 전에 문제 풀이 한 번 봐줄 수 있을까?',true,false,timestamp with time zone '2026-03-01 12:20:00+09');

commit;

-- --------------------------------------------
-- 검증 쿼리 (필요 시 별도 실행)
-- --------------------------------------------
-- select count(*) from public.daily_reflections where class_code='체험용';               -- 52
-- select count(*) from public.project_reflections where class_code='체험용';             -- 12
-- select count(*) from public.student_personality where class_code='체험용';             -- 16
-- select count(*) from public.teacher_messages where class_code='체험용';                -- 16
-- select count(*) from public.praise_messages where class_code='체험용';                 -- 28
-- select count(*) from public.student_goals where class_code='체험용';                   -- 33
-- select count(*) from public.daily_reflections
--  where class_code='체험용'
--    and learning_text like '%오늘 배운 내용:%'
--    and learning_text like '%내가 잘한 점:%'
--    and learning_text like '%어려웠던 점:%'
--    and learning_text like '%이해/해결 방법:%'
--    and learning_text like '%아직 헷갈리는 점:%'
--    and learning_text like '%일상에 적용해볼 점:%';
-- select count(*) from public.project_reflections
--  where class_code='체험용'
--    and comment like '%🤔 아쉬운 점/어려웠던 점:%'
--    and comment like '%👍 잘된 점:%'
--    and comment like '%💪 다음 도전:%'
--    and comment like '%✨ 인상적인 순간:%'
--    and comment like '%📘 배운 점:%'
--    and comment like '%🎯 다음을 위한 팁:%';
