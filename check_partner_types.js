import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function fail(msg) {
  console.error('[FAIL]', msg);
  process.exitCode = 1;
}

const appPath = path.join(process.cwd(), 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

const startMarker = 'const PARTNER_VERSION = 2;';
const endMarker = 'async function initSelfEvaluation()';
const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker, startIdx + 1);

if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  fail(`Could not extract partner block from ${appPath}`);
} else {
  const block = src.slice(startIdx, endIdx);
  const harness = `${block}
;globalThis.__partner8 = {
  PARTNER_TYPES,
  PARTNER_VERSION,
  computePartnerAxes,
  computePartnerType,
  getPartnerFromPersonalityRow
};
`;
  const context = { console, globalThis: {} };
  vm.createContext(context);
  vm.runInContext(harness, context, { filename: 'partner8_harness.js' });

  const lib = context.globalThis.__partner8;
  const PARTNER_TYPES = lib?.PARTNER_TYPES;
  const PARTNER_VERSION = lib?.PARTNER_VERSION;
  const computePartnerAxes = lib?.computePartnerAxes;
  const computePartnerType = lib?.computePartnerType;
  const getPartnerFromPersonalityRow = lib?.getPartnerFromPersonalityRow;

  if (!Array.isArray(PARTNER_TYPES) || typeof computePartnerType !== 'function' || typeof computePartnerAxes !== 'function') {
    fail('Exported functions/consts not found after harness eval.');
  } else {
    if (PARTNER_VERSION !== 2) fail(`Expected PARTNER_VERSION=2, got ${PARTNER_VERSION}`);
    if (PARTNER_TYPES.length !== 8) fail(`Expected 8 partner types, got ${PARTNER_TYPES.length}`);

    // 1) Representative patterns should map to their own type_code/type_name.
    for (const t of PARTNER_TYPES) {
      const computed = computePartnerType(t.representative_answers);
      if (!computed) {
        fail(`Representative pattern produced null: ${t.type_code} | ${t.type_name}`);
        continue;
      }
      if (computed.type_code !== t.type_code) {
        fail(`type_code mismatch: expected=${t.type_code}, got=${computed.type_code}`);
      }
      if (computed.type_name !== t.type_name) {
        fail(`type_name mismatch: expected=${t.type_name}, got=${computed.type_name}`);
      }
    }

    // 2) Axis tie rules: Q1/Q3/Q5 priority.
    {
      const answers = { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: 'A', 6: 'B' };
      const computed = computePartnerType(answers);
      if (computed?.type_code !== '해결디테일계획') {
        fail(`Q1 priority failed: got=${computed?.type_code}`);
      }
    }
    {
      const answers = { 1: 'B', 2: 'A', 3: 'B', 4: 'A', 5: 'A', 6: 'B' };
      const computed = computePartnerType(answers);
      if (computed?.type_code !== '지지큰그림계획') {
        fail(`Q3 priority failed: got=${computed?.type_code}`);
      }
    }
    {
      const answers = { 1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'B', 6: 'A' };
      const computed = computePartnerType(answers);
      if (computed?.type_code !== '해결큰그림탐색') {
        fail(`Q5 priority failed: got=${computed?.type_code}`);
      }
    }

    // 3) Support tag rules: majority + tie with Q7 priority.
    {
      const axes = computePartnerAxes({ 7: 'A', 8: 'A' });
      if (axes.support_tag !== '#함께 성장형') fail(`Q7/Q8 A-majority failed: ${JSON.stringify(axes)}`);
    }
    {
      const axes = computePartnerAxes({ 7: 'B', 8: 'B' });
      if (axes.support_tag !== '#혼자 집중형') fail(`Q7/Q8 B-majority failed: ${JSON.stringify(axes)}`);
    }
    {
      const axes = computePartnerAxes({ 7: 'A', 8: 'B' });
      if (axes.support_tag !== '#함께 성장형') fail(`Q7 tie priority(A/B) failed: ${JSON.stringify(axes)}`);
    }
    {
      const axes = computePartnerAxes({ 7: 'B', 8: 'A' });
      if (axes.support_tag !== '#혼자 집중형') fail(`Q7 tie priority(B/A) failed: ${JSON.stringify(axes)}`);
    }

    // 4) Description snapshots must match exactly.
    const expectedByType = {
      '구체적인 계획가': {
        feedback_style: '어디가 잘됐고 어디가 부족한지 정확하게 짚어줘요',
        action_style: '뭘 언제까지 하면 되는지 계획표로 정리해줘요',
        encouraging_phrase: '"3번 유형 문제, 이렇게 풀어보면 돼. 이번 주 월수는 이거, 목금은 저거."'
      },
      '구체적인 도전가': {
        feedback_style: '어디가 잘됐고 어디가 부족한지 정확하게 짚어줘요',
        action_style: '부담 없이 해볼 수 있는 작은 도전을 제안해줘요',
        encouraging_phrase: '"이 부분만 바꿔봐. 일단 한 문제만 이 방법으로 풀어보자."'
      },
      '큰그림형 계획가': {
        feedback_style: '지금 어디쯤 있고, 어디로 가면 되는지 방향을 잡아줘요',
        action_style: '뭐부터 해야 하는지 우선순위를 정리해줘요',
        encouraging_phrase: '"전체적으로 이 방향이야. 이번 주는 이것부터, 다음 주는 저것."'
      },
      '큰그림형 도전가': {
        feedback_style: '지금 어디쯤 있고, 어디로 가면 되는지 방향을 잡아줘요',
        action_style: '여러 가능성 중에 해볼 만한 걸 제안해줘요',
        encouraging_phrase: '"이런 방향도 있어. 한번 해보고 맞는지 느껴봐."'
      },
      '함께하는 계획가': {
        feedback_style: '잘한 부분을 먼저 알아봐주고, 부족한 점은 같이 고민해줘요',
        action_style: '차근차근 할 수 있도록 단계를 나눠서 정리해줘요',
        encouraging_phrase: '"이건 진짜 잘했어. 여기는 같이 해보자, 먼저 이것부터."'
      },
      '함께하는 도전가': {
        feedback_style: '잘한 부분을 먼저 알아봐주고, 부족한 점은 같이 고민해줘요',
        action_style: '부담 없는 작은 도전을 함께 시작해줘요',
        encouraging_phrase: '"이건 잘했어! 여기는 이렇게 한번 해볼까?"'
      },
      '공감하는 계획가': {
        feedback_style: '지금 기분이나 상황을 먼저 알아주고, 큰 방향을 함께 잡아줘요',
        action_style: '무리하지 않는 선에서 목표와 순서를 정리해줘요',
        encouraging_phrase: '"많이 노력했지? 방향은 맞아. 이번 주는 이것만 해보자."'
      },
      '공감하는 도전가': {
        feedback_style: '지금 기분이나 상황을 먼저 알아주고, 큰 방향을 함께 잡아줘요',
        action_style: '호기심을 자극하는 새로운 시도를 제안해줘요',
        encouraging_phrase: '"충분히 잘하고 있어. 이런 것도 해보면 재밌을 거야."'
      }
    };

    for (const t of PARTNER_TYPES) {
      const expected = expectedByType[t.type_name];
      if (!expected) {
        fail(`No expected snapshot defined for type_name=${t.type_name}`);
        continue;
      }
      if (t.description?.feedback_style !== expected.feedback_style) {
        fail(`feedback_style mismatch: ${t.type_name}`);
      }
      if (t.description?.action_style !== expected.action_style) {
        fail(`action_style mismatch: ${t.type_name}`);
      }
      if (t.description?.encouraging_phrase !== expected.encouraging_phrase) {
        fail(`encouraging_phrase mismatch: ${t.type_name}`);
      }
    }

    // 5) Legacy version must be ignored.
    if (typeof getPartnerFromPersonalityRow === 'function') {
      const legacy = getPartnerFromPersonalityRow({
        partner_version: 1,
        partner_type_code: '해결디테일계획',
        partner_type_name: '구체적인 계획가',
        partner_axes: { coaching_style: '해결형', info_processing: '디테일형', execution_strategy: '계획형' }
      });
      if (legacy !== null) fail('Expected null for legacy partner_version=1');

      const current = getPartnerFromPersonalityRow({
        partner_version: 2,
        partner_type_code: '해결디테일계획',
        partner_type_name: '구체적인 계획가',
        partner_axes: {
          coaching_style: '해결형',
          info_processing: '디테일형',
          execution_strategy: '계획형',
          learning_env: '함께형',
          support_tag: '#함께 성장형'
        }
      });
      if (!current || current.type_code !== '해결디테일계획') {
        fail('Expected valid partner for partner_version=2');
      }
    }
  }
}

if (!process.exitCode) {
  console.log('[OK] partner 8-type mapping checks passed.');
}
