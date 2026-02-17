import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const HOST = '127.0.0.1';
const PORT = 4173;
const ARTIFACT_DIR = path.join(ROOT, 'test-artifacts');

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
      let reqPath = decodeURIComponent(url.pathname);
      if (reqPath === '/') reqPath = '/app.html';
      const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
      const fullPath = path.join(ROOT, safePath);

      if (!fullPath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }

      const data = fs.readFileSync(fullPath);
      res.writeHead(200, { 'Content-Type': contentType(fullPath) });
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end('server error');
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(PORT, HOST, () => resolve(server));
  });
}

function makeSupabaseStubScript() {
  return `
  (function(){
    function resultFor(table){
      if (table === 'class_settings') return [{ class_code: '체험용', student_count: 24, group_count: 6 }];
      return [];
    }
    function query(table){
      const q = {};
      q.select = () => q;
      q.insert = async () => ({ data: null, error: null });
      q.update = async () => ({ data: null, error: null });
      q.delete = async () => ({ data: null, error: null });
      q.upsert = async () => ({ data: null, error: null });
      q.eq = () => q;
      q.neq = () => q;
      q.not = () => q;
      q.in = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.range = () => q;
      q.single = async () => ({ data: null, error: null });
      q.maybeSingle = async () => ({ data: null, error: null });
      q.then = (resolve) => resolve({ data: resultFor(table), error: null });
      return q;
    }
    window.supabase = {
      createClient: function(){
        return {
          auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: function(){ return { data: { subscription: { unsubscribe(){} } } }; },
            signOut: async () => ({ error: null }),
            signInWithOAuth: async () => ({ data: {}, error: null })
          },
          from: (table) => query(table)
        };
      }
    };
  })();
  `;
}

function almostEqual(a, b, tolerance = 2) {
  return Math.abs(a - b) <= tolerance;
}

async function run() {
  const checks = [];
  const mark = (id, pass, detail) => checks.push({ id, pass, detail });

  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

  await context.route('**/supabase.min.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: makeSupabaseStubScript()
    });
  });

  const page = await context.newPage();
  await page.goto(`http://${HOST}:${PORT}/app.html?demo=student`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.switchStudentMainTab === 'function');
  await page.waitForTimeout(700);

  // 1) Praise target count should reflect student count (24).
  await page.evaluate(() => window.switchStudentMainTab('praise'));
  await page.waitForTimeout(350);
  const praiseCount = await page.locator('#praiseTargetGrid .target-btn').count();
  mark(1, praiseCount === 24, `praise target buttons = ${praiseCount}`);

  // 2) "Unknown date" fallback should not appear when created_at exists.
  await page.evaluate(() => {
    const sample = [{
      message_content: '테스트 메시지',
      is_anonymous: true,
      created_at: '2026-02-17T00:00:00Z',
      daily_reflections: null
    }];
    window.renderMessageList(sample);
  });
  const messageMeta = await page.locator('#receivedMessagesList').innerText();
  mark(2, !messageMeta.includes('날짜 미상') && /\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\./.test(messageMeta), 'message date fallback rendered from created_at');

  // 3) Mobile alignment checks (student peer tab).
  await page.evaluate(() => window.switchStudentMainTab('peer'));
  await page.waitForTimeout(350);
  const studentPeerBoxes = await page.$$eval('#studentTab #peerEvaluationSection .type-selector label', (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })
  );
  const studentPeerAligned = studentPeerBoxes.length === 2
    && almostEqual(studentPeerBoxes[0].y, studentPeerBoxes[1].y, 3)
    && almostEqual(studentPeerBoxes[0].h, studentPeerBoxes[1].h, 3);
  mark(3, studentPeerAligned, `student peer label boxes = ${JSON.stringify(studentPeerBoxes)}`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'student-peer-mobile.png'), fullPage: true });

  // 4,5,6,13) Personality wording/type checks via rendered quiz + result.
  await page.evaluate(() => {
    try { sessionStorage.removeItem('demo_student_personality_v2'); } catch {}
    try { sessionStorage.removeItem('demo_student_personality_v1'); } catch {}
    if (typeof window.initializePersonalityUI === 'function') window.initializePersonalityUI();
  });
  await page.evaluate(() => window.switchStudentMainTab('self'));
  await page.waitForTimeout(500);
  const q2 = await page.locator('#question2 .quiz-question-text').innerText();
  const q2a = await page.locator('#question2 .quiz-option:nth-of-type(1)').innerText();
  const q2b = await page.locator('#question2 .quiz-option:nth-of-type(2)').innerText();
  const q3a = await page.locator('#question3 .quiz-option:nth-of-type(1)').innerText();
  const q3b = await page.locator('#question3 .quiz-option:nth-of-type(2)').innerText();
  const q4 = await page.locator('#question4 .quiz-question-text').innerText();
  const q7 = await page.locator('#question7 .quiz-question-text').innerText();
  const q1b = await page.locator('#question1 .quiz-option:nth-of-type(2)').innerText();

  mark(4, q1b.includes('같이 방법을 찾아보자고'), `Q1-B = ${q1b}`);
  const q5Pass = q2.includes('모둠 활동에서 내가 맡기로 한 부분의 완성도가 떨어질 때')
    && q2a.includes('이 부분은 이렇게 고치면 좋을 것 같아')
    && q2b.includes('고생많았어. 다음엔 이 부분을 신경 써줘')
    && q3a.includes('개념을 읽고 문제 풀이 과정을 쭉 따라가기')
    && q3b.includes('내가 왜 이 단원을 배우는지')
    && q4.includes('조언')
    && q4.includes('형식')
    && q7.includes('어떤 방법이 더 좋아하는 방식이야');
  mark(5, q5Pass, 'Q2/Q3/Q4/Q7 wording checks');

  // choose A for all questions and submit to render type list.
  for (let i = 1; i <= 8; i++) {
    await page.click(`#question${i} .quiz-option:nth-of-type(1)`);
  }
  await page.click('#submitQuizBtn');
  await page.waitForTimeout(500);
  const typesText = await page.locator('#allPersonalityTypes').innerText();
  mark(6, !typesText.includes('큰그림형') && typesText.includes('큰 그림형'), 'type labels spacing');
  mark(13, !typesText.includes('감정형'), 'legacy "감정형" not present in result types');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'student-personality-result.png'), fullPage: true });

  // 7) Placeholder + tag area typography consistency check.
  const learningPlaceholder = await page.getAttribute('#learningText', 'placeholder');
  const projectPlaceholder = await page.getAttribute('#projectComment', 'placeholder');
  const tagFont = await page.$eval(
    '#dailyReflectionTab .template-btn',
    (el) => getComputedStyle(el).fontFamily
  );
  mark(7, Boolean(learningPlaceholder && projectPlaceholder) && /Noto Sans KR/i.test(tagFont), 'placeholders exist + template tag font');

  // Teacher page checks: 3, 11, 12.
  const teacherPage = await context.newPage();
  await teacherPage.goto(`http://${HOST}:${PORT}/app.html?demo=teacher`, { waitUntil: 'networkidle' });
  await teacherPage.waitForFunction(() => typeof window.switchTeacherMainTab === 'function');
  await teacherPage.waitForTimeout(700);
  await teacherPage.evaluate(() => {
    window.switchTeacherMainTab('diary');
    if (typeof window.switchTeacherDiarySubTab === 'function') window.switchTeacherDiarySubTab('comment');
  });
  await teacherPage.waitForTimeout(300);

  const teacherBoxes = await teacherPage.$$eval('#teacherMain #rankStudentArea .rank-filter-type-selector .rank-filter-option-label', (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })
  );
  const teacherAligned = teacherBoxes.length === 2
    && almostEqual(teacherBoxes[0].y, teacherBoxes[1].y, 3)
    && almostEqual(teacherBoxes[0].h, teacherBoxes[1].h, 3);
  mark(3, teacherAligned, `teacher type label boxes = ${JSON.stringify(teacherBoxes)}`);

  const teacherTabLabel = await teacherPage.locator('button[onclick="switchTeacherDiarySubTab(\'comment\')"]').first().innerText();
  mark(11, teacherTabLabel.includes('세특생성'), `teacher diary subtab text = ${teacherTabLabel}`);

  const previewBtnExists = await teacherPage.locator('#teacherSubjectCommentPreviewBtn').count();
  const sourceWrapExists = await teacherPage.locator('#teacherSubjectCommentSourceWrap').count();
  mark(12, previewBtnExists === 1 && sourceWrapExists === 1, `previewBtn=${previewBtnExists}, sourceWrap=${sourceWrapExists}`);
  await teacherPage.screenshot({ path: path.join(ARTIFACT_DIR, 'teacher-diary-mobile.png'), fullPage: true });

  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  const byId = new Map();
  for (const c of checks) {
    if (!byId.has(c.id)) byId.set(c.id, []);
    byId.get(c.id).push(c);
  }

  let failed = 0;
  const ordered = [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13];
  for (const id of ordered) {
    const items = byId.get(id) || [];
    if (items.length === 0) continue;
    const pass = items.every((x) => x.pass);
    if (!pass) failed += 1;
    const detail = items.map((x) => x.detail).join(' | ');
    console.log(`[${pass ? 'PASS' : 'FAIL'}] #${id} ${detail}`);
  }

  // #8 (save/login abort) requires real auth+DB path, cannot validate in demo-only mock run.
  console.log('[INFO] #8 real Supabase auth/save path not executed in this demo-browser run.');

  process.exitCode = failed > 0 ? 1 : 0;
}

run().catch((err) => {
  console.error('[FATAL]', err);
  process.exitCode = 1;
});
