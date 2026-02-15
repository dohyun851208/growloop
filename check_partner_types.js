import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function fail(msg) {
  console.error('[FAIL]', msg);
  process.exitCode = 1;
}

const appPath = path.join(process.cwd(), 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

const startMarker = 'const PARTNER_VERSION = 1;';
const endMarker = 'function getPartnerFromPersonalityRow';
const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker, startIdx + 1);

if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  fail(`Could not extract partner type block from ${appPath}`);
} else {
  const block = src.slice(startIdx, endIdx);
  const harness = `${block}\n;globalThis.__partner16 = { PARTNER_TYPES, computePartnerAxes, computePartnerType, PARTNER_VERSION };\n`;
  const context = { console, globalThis: {} };
  vm.createContext(context);
  vm.runInContext(harness, context, { filename: 'partner16_harness.js' });

  const lib = context.globalThis.__partner16;
  const PARTNER_TYPES = lib?.PARTNER_TYPES;
  const computePartnerAxes = lib?.computePartnerAxes;
  const computePartnerType = lib?.computePartnerType;

  if (!Array.isArray(PARTNER_TYPES) || typeof computePartnerType !== 'function' || typeof computePartnerAxes !== 'function') {
    fail('Exported functions/consts not found after harness eval.');
  } else {
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

      const expectedNeedsScores = String(t.type_code).includes('디테일') && String(t.type_code).includes('성과');
      if (!!computed.needs_scores !== expectedNeedsScores) {
        fail(`needs_scores mismatch for ${t.type_code}: expected=${expectedNeedsScores}, got=${computed.needs_scores}`);
      }
    }

    // 2) Mixed-answer priority rules.
    const base = { 1: 'A', 3: 'A', 4: 'A', 8: 'A' }; // solve=해결, motive=성과
    {
      const answers = { ...base, 2: 'A', 7: 'B', 5: 'A', 6: 'B' }; // Q2 wins -> 디테일, Q5 wins -> 계획
      const axes = computePartnerAxes(answers);
      if (axes.detail_big !== '디테일') fail(`Q2 priority failed (expected 디테일): ${JSON.stringify(axes)}`);
      if (axes.plan_explore !== '계획') fail(`Q5 priority failed (expected 계획): ${JSON.stringify(axes)}`);
      const computed = computePartnerType(answers);
      if (computed?.type_code !== '해결디테일성과계획') fail(`type_code priority check failed: got=${computed?.type_code}`);
    }
    {
      const answers = { ...base, 2: 'B', 7: 'A', 5: 'A', 6: 'B' }; // Q2 wins -> 큰그림
      const axes = computePartnerAxes(answers);
      if (axes.detail_big !== '큰그림') fail(`Q2 priority failed (expected 큰그림): ${JSON.stringify(axes)}`);
      const computed = computePartnerType(answers);
      if (computed?.type_code !== '해결큰그림성과계획') fail(`type_code priority check failed: got=${computed?.type_code}`);
    }
    {
      const answers = { ...base, 2: 'A', 7: 'A', 5: 'B', 6: 'A' }; // Q5 wins -> 탐색
      const axes = computePartnerAxes(answers);
      if (axes.plan_explore !== '탐색') fail(`Q5 priority failed (expected 탐색): ${JSON.stringify(axes)}`);
      const computed = computePartnerType(answers);
      if (computed?.type_code !== '해결디테일성과탐색') fail(`type_code priority check failed: got=${computed?.type_code}`);
    }
    {
      // Majority on solve/support axis: Q1=A, Q4=B, Q8=B => 지지
      const answers = { 1: 'A', 4: 'B', 8: 'B', 2: 'A', 7: 'A', 3: 'A', 5: 'A', 6: 'A' };
      const axes = computePartnerAxes(answers);
      if (axes.solve_support !== '지지') fail(`Solve/support majority failed (expected 지지): ${JSON.stringify(axes)}`);
      const computed = computePartnerType(answers);
      if (computed?.type_code !== '지지디테일성과계획') fail(`type_code majority check failed: got=${computed?.type_code}`);
    }

    // 3) Missing answers should return null (axes incomplete).
    const missing = computePartnerType({ 1: 'A', 2: 'A' });
    if (missing !== null) fail('Expected null for incomplete answers.');
  }
}

if (!process.exitCode) {
  console.log('[OK] partner 16-type mapping checks passed.');
}

