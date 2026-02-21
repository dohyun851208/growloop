import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const OUT_DIR = path.join(ROOT, 'ppt', 'assets', 'ui');

fs.mkdirSync(OUT_DIR, { recursive: true });

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
      const url = new URL(req.url || '/', `http://${HOST}`);
      let reqPath = decodeURIComponent(url.pathname);
      if (reqPath === '/') reqPath = '/app.html';

      const safePath = path.normalize(reqPath).replace(/^([.][.][/\\])+/, '');
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
    server.listen(0, HOST, () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sanitizeAppShell(page) {
  await page.evaluate(() => {
    const banner = document.getElementById('demoBanner');
    if (banner) banner.remove();

    document.body.style.paddingTop = '0px';

    const modalIds = ['customModal', 'teacherSubjectCommentExportModal'];
    modalIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('hidden');
      el.style.display = 'none';
    });

    document.querySelectorAll('.modal-overlay').forEach((el) => {
      el.classList.add('hidden');
      el.style.display = 'none';
    });
  });
}

async function gotoDemo(page, baseUrl, role) {
  await page.goto(`${baseUrl}/app.html?demo=${role}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.switchStudentMainTab === 'function', { timeout: 15000 });
  await wait(450);
  await sanitizeAppShell(page);
}

async function screenshotLocator(page, selector, fileName) {
  const target = page.locator(selector).first();
  await target.waitFor({ state: 'visible', timeout: 10000 });
  await target.scrollIntoViewIfNeeded();
  await wait(200);
  const outPath = path.join(OUT_DIR, fileName);
  await target.screenshot({ path: outPath });
  console.log(`[saved] ${fileName}`);
}

async function showPersonalityResultFor(page, answers) {
  await page.evaluate((payload) => {
    const partner = (typeof window.computePartnerType === 'function')
      ? window.computePartnerType(payload)
      : null;
    if (partner && typeof window.showPersonalityResult === 'function') {
      window.showPersonalityResult(partner);
    }

    const quiz = document.getElementById('personalityQuiz');
    const result = document.getElementById('personalityResult');
    const menu = document.getElementById('selfEvaluationMenu');

    if (quiz) quiz.classList.add('hidden');
    if (menu) menu.classList.add('hidden');
    if (result) result.classList.remove('hidden');
  }, answers);
}

async function captureAll(baseUrl, browser) {
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });

  const runDesktop = async (name, role, setup, selector) => {
    const page = await desktop.newPage();
    try {
      await gotoDemo(page, baseUrl, role);
      await setup(page);
      await sanitizeAppShell(page);
      await screenshotLocator(page, selector, name);
    } finally {
      await page.close();
    }
  };

  const runMobile = async (name, role, setup, selector) => {
    const page = await mobile.newPage();
    try {
      await gotoDemo(page, baseUrl, role);
      await setup(page);
      await sanitizeAppShell(page);
      await screenshotLocator(page, selector, name);
    } finally {
      await page.close();
    }
  };

  await runDesktop(
    'ui_s01_intro_overview.png',
    'student',
    async (page) => {
      await page.evaluate(() => {
        window.switchStudentMainTab?.('self');
        window.switchSelfTab?.('daily');
      });
      await wait(700);
    },
    '#studentMainSection'
  );

  await runDesktop(
    'ui_s02_teacher_student_detail.png',
    'teacher',
    async (page) => {
      await page.evaluate(async () => {
        await window.switchMiniTab?.('diary');
        window.switchTeacherDiarySubTab?.('student');
      });
      await wait(900);
      await page.evaluate(() => {
        const firstBtn = document.querySelector('#diaryStudentSelectorList .student-selector-btn, #diaryStudentSelectorList button');
        firstBtn?.click();
      });
      await wait(700);
    },
    '#teacherDiaryStudentTab'
  );

  await runDesktop(
    'ui_s03_teacher_ranking_table.png',
    'teacher',
    async (page) => {
      await page.evaluate(async () => {
        await window.switchMiniTab?.('review');
        window.switchReviewSubTab?.('ranking');
      });
      await wait(900);
      await page.evaluate(() => {
        const fold = document.getElementById('teacherRankingTableFold');
        if (fold) fold.open = true;
      });
      await wait(300);
    },
    '#rankingMiniTab'
  );

  await runDesktop(
    'ui_s04_teacher_criteria_main.png',
    'teacher',
    async (page) => {
      await page.evaluate(async () => {
        await window.switchMiniTab?.('review');
        window.switchReviewSubTab?.('criteria');
      });
      await wait(900);
    },
    '#criteriaMiniTab'
  );

  await runMobile(
    'ui_s05_personality_quiz.png',
    'student',
    async (page) => {
      await page.evaluate(() => {
        window.switchStudentMainTab?.('self');
        window.showPersonalityQuiz?.();

        const quiz = document.getElementById('personalityQuiz');
        const result = document.getElementById('personalityResult');
        const menu = document.getElementById('selfEvaluationMenu');

        if (quiz) {
          quiz.classList.remove('hidden');
          quiz.style.display = 'block';
        }
        if (result) result.classList.add('hidden');
        if (menu) menu.classList.add('hidden');
      });
      await wait(900);
      await page.evaluate(() => {
        const quiz = document.getElementById('personalityQuiz');
        if (quiz) {
          quiz.classList.remove('hidden');
          quiz.style.display = 'block';
        }
      });
    },
    '#personalityQuiz .accent-box'
  );

  await runMobile(
    'ui_s06_personality_result_main.png',
    'student',
    async (page) => {
      await page.evaluate(() => {
        window.switchStudentMainTab?.('self');
      });
      await wait(500);
      await showPersonalityResultFor(page, { 1: 'B', 2: 'B', 3: 'A', 4: 'A', 5: 'A', 6: 'A', 7: 'A', 8: 'A' });
      await wait(450);
    },
    '#personalityCard'
  );

  await runMobile(
    'ui_s07_type_detail_plan.png',
    'student',
    async (page) => {
      await page.evaluate(() => {
        window.switchStudentMainTab?.('self');
      });
      await wait(450);
      await showPersonalityResultFor(page, { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A', 6: 'A', 7: 'A', 8: 'A' });
      await wait(450);
    },
    '#personalityCard'
  );

  await runMobile(
    'ui_s07_type_empathy_challenge.png',
    'student',
    async (page) => {
      await page.evaluate(() => {
        window.switchStudentMainTab?.('self');
      });
      await wait(450);
      await showPersonalityResultFor(page, { 1: 'B', 2: 'B', 3: 'B', 4: 'B', 5: 'B', 6: 'B', 7: 'B', 8: 'B' });
      await wait(450);
    },
    '#personalityCard'
  );

  await runMobile(
    'ui_s07_type_together_plan.png',
    'student',
    async (page) => {
      await page.evaluate(() => {
        window.switchStudentMainTab?.('self');
      });
      await wait(450);
      await showPersonalityResultFor(page, { 1: 'B', 2: 'B', 3: 'A', 4: 'A', 5: 'A', 6: 'A', 7: 'A', 8: 'A' });
      await wait(450);
    },
    '#personalityCard'
  );

  await runDesktop(
    'ui_s08_criteria_input.png',
    'teacher',
    async (page) => {
      await page.evaluate(async () => {
        await window.switchMiniTab?.('review');
        window.switchReviewSubTab?.('criteria');
      });
      await wait(900);
    },
    '#criteriaMiniTab .accent-box.box-teal > div[style*="background"]'
  );

  await runDesktop(
    'ui_s08_criteria_auto_result.png',
    'teacher',
    async (page) => {
      await page.evaluate(async () => {
        await window.switchMiniTab?.('review');
        window.switchReviewSubTab?.('criteria');
      });
      await wait(900);
    },
    '#autoResultInputs'
  );

  await runMobile(
    'ui_s09_peer_result.png',
    'student',
    async (page) => {
      await page.evaluate(() => {
        window.switchStudentMainTab?.('peer');
      });
      await wait(700);
      await page.evaluate(() => {
        window.switchPeerTab?.('result');
      });
      await wait(700);
      await page.evaluate(async () => {
        try {
          await window.viewMyResult?.();
        } catch {
          // no-op; demo fallback still renders summary areas
        }
      });
      await wait(1700);
    },
    '#studentResultTab'
  );

  await runDesktop(
    'ui_s10_teacher_dashboard.png',
    'teacher',
    async (page) => {
      await page.evaluate(async () => {
        await window.switchMiniTab?.('review');
        window.switchReviewSubTab?.('ranking');
      });
      await wait(1000);
    },
    '#teacherMain'
  );

  await runDesktop(
    'ui_s11_diary_hint.png',
    'teacher',
    async (page) => {
      await page.evaluate(async () => {
        await window.switchMiniTab?.('diary');
        window.switchTeacherDiarySubTab?.('hint');
      });
      await wait(1100);
    },
    '#emotionAlertArea'
  );

  await runDesktop(
    'ui_s12_comment_settings.png',
    'teacher',
    async (page) => {
      await page.evaluate(async () => {
        await window.switchMiniTab?.('diary');
        window.switchTeacherDiarySubTab?.('comment');
      });
      await wait(900);
    },
    '#teacherSubjectCommentSection .teacher-subject-comment-settings'
  );

  await runDesktop(
    'ui_s12_comment_preview.png',
    'teacher',
    async (page) => {
      await page.evaluate(async () => {
        await window.switchMiniTab?.('diary');
        window.switchTeacherDiarySubTab?.('comment');
      });
      await wait(900);

      await page.evaluate(async () => {
        const schoolLevel = document.getElementById('teacherSubjectCommentSchoolLevel');
        if (schoolLevel) schoolLevel.value = '초';

        const startEl = document.getElementById('teacherSubjectCommentStart');
        const endEl = document.getElementById('teacherSubjectCommentEnd');
        if (startEl) startEl.value = '2026-03-01';
        if (endEl) endEl.value = '2026-03-01';

        if (typeof window.toggleTeacherSubjectCommentStudentMenu === 'function') {
          await window.toggleTeacherSubjectCommentStudentMenu();
          await new Promise((resolve) => setTimeout(resolve, 180));
          const candidates = Array.from(document.querySelectorAll('#teacherSubjectCommentStudentMenu button, #teacherSubjectCommentStudentMenu .teacher-subject-comment-student-item'));
          const allBtn = candidates.find((el) => (el.textContent || '').includes('전체'));
          allBtn?.click();
        }
      });

      await wait(550);
      await page.evaluate(() => {
        const tags = Array.from(document.querySelectorAll('#teacherSubjectCommentSubjectTags .subject-tag-btn'));
        const mathTag = tags.find((el) => (el.textContent || '').trim() === '수학') || tags[0];
        mathTag?.click();
      });

      await wait(450);
      await page.evaluate(async () => {
        try {
          await window.previewTeacherSubjectCommentSources?.();
        } catch {
          // keep non-blocking for demo mode
        }
      });
      await wait(1500);
    },
    '#teacherSubjectCommentResultWrap'
  );

  await desktop.close();
  await mobile.close();
}

async function main() {
  const { server, port } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const baseUrl = `http://${HOST}:${port}`;

  try {
    await captureAll(baseUrl, browser);
    console.log('\nCapture complete.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error('[FATAL]', error);
  process.exitCode = 1;
});
