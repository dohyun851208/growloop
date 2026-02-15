
// ============================================
// Supabase 설정
// ============================================
const SUPABASE_URL = 'https://ftvalqzaiooebkulafzg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dmFscXphaW9vZWJrdWxhZnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzk1MzAsImV4cCI6MjA4NTk1NTUzMH0.M1qXvUIuNe2y-9y1gQ2svRdHvDKrMRQ4oMGZPIZveQs';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'public' },
  auth: { autoRefreshToken: true, persistSession: true }
});

// ============================================
// 전역 변수
// ============================================
let currentRatings = {};
let ratingCriteria = [];
let currentStudent = null;
let currentClassCode = '';

// 자기평가 전역 변수
let selectedSubjectTags = [];
let currentMessageMode = null; // 'anonymous' or 'named'
const OTHER_SUBJECT_TAG = '기타';
const PRESET_SUBJECT_TAGS = [
  '국어', '수학', '사회', '과학', '영어', '음악', '미술',
  '체육', '도덕', '실과', '토론', '발표', '모둠활동', OTHER_SUBJECT_TAG
];

let quizAnswers = {}; // 성향 진단 답변 저장
let studentPersonality = null; // 학생 성향 정보

// 체험 모드 전역 변수
let isDemoMode = false;
let demoRole = null;
const DEMO_FIXED_QUERY_DATE = '2026-03-01';
const DEMO_PERSONALITY_STORAGE_KEY = 'demo_student_personality_v1';

function loadDemoPersonalityFromStorage() {
  try {
    const raw = sessionStorage.getItem(DEMO_PERSONALITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.personality_type ? parsed : null;
  } catch (error) {
    return null;
  }
}

function saveDemoPersonalityToStorage(personality) {
  if (!personality || !personality.personality_type) return;
  try { sessionStorage.setItem(DEMO_PERSONALITY_STORAGE_KEY, JSON.stringify(personality)); } catch (error) { }
}

function getKstTodayStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return kst.toISOString().split('T')[0];
}

function getDefaultQueryDate() {
  return isDemoMode ? DEMO_FIXED_QUERY_DATE : getKstTodayStr();
}

function showRoleSelectInApp() {
  const loadingSec = document.getElementById('authLoadingSection');
  if (!loadingSec) return;
  loadingSec.classList.remove('hidden');
  loadingSec.innerHTML = `
    <div style="max-width:380px; margin:0 auto; text-align:center; padding:20px;">
      <h3 style="margin:0 0 10px; color:var(--primary);">역할을 선택해 주세요</h3>
      <p style="margin:0 0 14px; color:var(--text-sub);">처음 로그인한 계정입니다.</p>
      <div style="display:grid; gap:10px;">
        <button type="button" onclick="window.location.href='app.html?role=student'" style="background:var(--color-blue);">학생으로 시작</button>
        <button type="button" onclick="window.location.href='app.html?role=teacher'" style="background:var(--color-teacher);">교사로 시작</button>
      </div>
    </div>
  `;
}

function getCustomSubjectWrapEl() {
  return document.getElementById('customSubjectWrap');
}

function getCustomSubjectInputEl() {
  return document.getElementById('customSubjectInput');
}

function ensureCustomSubjectInput() {
  if (getCustomSubjectInputEl()) return;
  const saveBtn = document.getElementById('saveDailyBtn');
  if (!saveBtn || !saveBtn.parentElement) return;

  const wrap = document.createElement('div');
  wrap.id = 'customSubjectWrap';
  wrap.className = 'hidden';
  wrap.style.marginTop = '8px';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'customSubjectInput';
  input.placeholder = '기타 활동을 직접 입력하세요 (예: 물리, 코딩, 미적분)';
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.padding = '10px 12px';
  input.style.border = '1.5px solid var(--border)';
  input.style.borderRadius = '10px';
  input.style.fontFamily = "'Jua', sans-serif";
  input.style.fontSize = '0.92rem';
  input.style.outline = 'none';

  wrap.appendChild(input);
  saveBtn.parentElement.insertBefore(wrap, saveBtn);
}

function getCustomSubjectTagsFromInput() {
  const input = getCustomSubjectInputEl();
  if (!input) return [];
  const raw = input.value.trim();
  if (!raw) return [];
  return Array.from(new Set(
    raw.split(',')
      .map(s => s.trim())
      .filter(Boolean)
  ));
}

function getEffectiveSubjectTags() {
  const baseTags = selectedSubjectTags.filter(tag => tag !== OTHER_SUBJECT_TAG);
  if (selectedSubjectTags.includes(OTHER_SUBJECT_TAG)) {
    const customTags = getCustomSubjectTagsFromInput();
    if (customTags.length > 0) baseTags.push(...customTags);
    else baseTags.push(OTHER_SUBJECT_TAG);
  }
  return Array.from(new Set(baseTags));
}

function syncCustomSubjectInputVisibility({ clearOnHide = false, focusOnShow = false } = {}) {
  ensureCustomSubjectInput();
  const wrap = getCustomSubjectWrapEl();
  const input = getCustomSubjectInputEl();
  if (!wrap || !input) return;

  const shouldShow = selectedSubjectTags.includes(OTHER_SUBJECT_TAG);
  wrap.classList.toggle('hidden', !shouldShow);

  if (!shouldShow && clearOnHide) input.value = '';
  if (shouldShow && focusOnShow) input.focus();
}


// ============================================
// 구글 인증 및 라우팅 (New)
// ============================================

// 페이지 로드 시 인증 및 역할 확인
async function checkAuthAndRoute() {
  try {
    // --- 체험 모드 감지 ---
    const demoParams = new URLSearchParams(window.location.search);
    const demoParam = demoParams.get('demo');
    if (demoParam === 'student' || demoParam === 'teacher') {
      isDemoMode = true;
      demoRole = demoParam;
      initDemoMode(demoParam);
      return;
    }
    // --- 체험 모드 감지 끝 ---

    const { data, error: authError } = await db.auth.getSession();
    let session = data?.session;

    if (authError) {
      console.error('Auth error:', authError);
    }

    if (!session) {
      const urlParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash || '';
      const isOAuthCallback = urlParams.has('code') || hash.includes('access_token') || hash.includes('refresh_token');
      const hasRoleHint = urlParams.has('role');

      // OAuth callback landing can briefly have no session before token persistence completes.
      if (isOAuthCallback || hasRoleHint) {
        const loadingSec = document.getElementById('authLoadingSection');
        if (loadingSec) {
          loadingSec.classList.remove('hidden');
          loadingSec.innerHTML = `
            <div class="spinner" style="display:inline-block; width:40px; height:40px; border:4px solid var(--border); border-top-color:var(--primary); border-radius:50%; animation:spin 1s linear infinite;"></div>
            <p style="margin-top:15px; color:var(--text-sub);">로그인 확인 중...</p>
          `;
        }

        for (let i = 0; i < 4; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: retryData } = await db.auth.getSession();
          session = retryData?.session;
          if (session) break;
        }
      }
    }

    if (!session) {
      const path = window.location.pathname;
      if (!path.includes('index.html') && !window.location.search.includes('debug=teacher')) {
        window.location.href = 'index.html';
      }
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const roleFromUrl = urlParams.get('role');

    async function findProfileBy(field, value, role) {
      if (!value) return { profile: null, error: null };
      let q = db.from('user_profiles').select('*').eq(field, value).limit(1);
      if (role) q = q.eq('role', role);
      const { data: found, error } = await q.maybeSingle();
      return { profile: found, error };
    }

    let profile = null;
    let profileError = null;
    let matchedBy = null;

    if (roleFromUrl) {
      const byUidWithRole = await findProfileBy('google_uid', session.user.id, roleFromUrl);
      profile = byUidWithRole.profile;
      profileError = byUidWithRole.error;
      if (profile) matchedBy = 'google_uid';
      if (profileError) throw profileError;
    }

    if (!profile) {
      const byUid = await findProfileBy('google_uid', session.user.id, null);
      profile = byUid.profile;
      profileError = byUid.error;
      if (profile) matchedBy = 'google_uid';
      if (profileError) throw profileError;
    }

    if (!profile && roleFromUrl) {
      const byEmailWithRole = await findProfileBy('google_email', session.user.email, roleFromUrl);
      profile = byEmailWithRole.profile;
      profileError = byEmailWithRole.error;
      if (profile) matchedBy = 'google_email';
      if (profileError) throw profileError;
    }

    if (!profile) {
      const byEmail = await findProfileBy('google_email', session.user.email, null);
      profile = byEmail.profile;
      profileError = byEmail.error;
      if (profile) matchedBy = 'google_email';
      if (profileError) throw profileError;
    }

    if (!profile) {
      if (!roleFromUrl) {
        showRoleSelectInApp();
        return;
      }

      document.getElementById('authLoadingSection').classList.add('hidden');

      if (roleFromUrl === 'student') {
        document.getElementById('studentOnboardingSection').classList.remove('hidden');
      } else {
        document.getElementById('teacherOnboardingSection').classList.remove('hidden');
      }
      return;
    }

    if (matchedBy === 'google_email' && session.user.id && profile.google_uid !== session.user.id) {
      try {
        await db.from('user_profiles')
          .update({ google_uid: session.user.id })
          .eq('id', profile.id);
      } catch (uidSyncError) {
        console.warn('google_uid sync failed:', uidSyncError);
      }
    }

    if (profile.role && roleFromUrl !== profile.role) {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.set('role', profile.role);
      window.history.replaceState({}, '', 'app.html?' + nextParams.toString());
    }
    if (profile.role === 'teacher') {
      currentClassCode = profile.class_code;

      // 먼저 로딩 숨기고 탭을 표시하여 빈 화면 방지
      document.getElementById('authLoadingSection').classList.add('hidden');
      const tTab = document.getElementById('teacherTab');
      const tMain = document.getElementById('teacherMain');

      tTab.classList.remove('hidden');
      tTab.style.display = 'block';
      tTab.style.opacity = '1';

      tMain.classList.remove('hidden');
      tMain.style.display = 'block';
      tMain.style.opacity = '1';

      // 교사용 메인 화면 진입 시 기본적으로 '동료평가(review)' 탭을 띄우고 평가 기준 초기화
      setTimeout(() => {
        switchMiniTab('diary');
      }, 100);



      // 기본 탭으로 '자기평가' 진입
      try {
        await switchMiniTab('diary');
      } catch (dataError) {
        console.warn('교사 데이터 로드 중 일부 오류:', dataError);
      }



    } else {
      currentClassCode = profile.class_code;
      currentStudent = {
        id: String(profile.student_number),
        type: profile.student_type || 'individual',
        name: profile.student_number
      };

      // 먼저 로딩 숨기고 UI 표시하여 빈 화면 방지
      document.getElementById('authLoadingSection').classList.add('hidden');
      document.getElementById('studentTab').classList.remove('hidden');
      document.getElementById('studentMainSection').classList.remove('hidden');

      const typeText = currentStudent.type === 'individual' ? '학생' : '모둠';
      document.getElementById('welcomeMsg').textContent = currentClassCode + ' ' + currentStudent.id + '번 ' + typeText + ' 환영합니다!';

      document.getElementById('reviewerId').value = currentStudent.id;
      document.getElementById('submitReviewerLabel').textContent = currentStudent.type === 'individual' ? '나의 번호' : '나의 모둠';

      const radios = document.getElementsByName('evalTypeDisplay');
      const resultRadios = document.getElementsByName('resultEvalTypeDisplay');

      if (currentStudent.type === 'individual') {
        if (radios[0]) radios[0].checked = true;
        if (resultRadios[0]) resultRadios[0].checked = true;
      }
      else {
        if (radios[1]) radios[1].checked = true;
        if (resultRadios[1]) resultRadios[1].checked = true;
      }

      switchStudentMainTab('self');

      // 동료평가 데이터 사전 로드 (실패해도 화면은 유지, 동료평가 탭 전환 시 재로드됨)
      try {
        const initDate = document.getElementById('reviewDate').value;

        // 각 쿼리를 개별적으로 실행하여 하나가 실패해도 나머지는 작동
        let objTask = { objective: '', task: '' };
        let criteria = [];
        let completed = [];
        let settings = { studentCount: 30, groupCount: 6 };

        const results = await Promise.allSettled([
          getObjectiveAndTask(initDate),
          getRatingCriteriaFromDB(initDate),
          getCompletedTargets(initDate, currentStudent.id, currentStudent.type),
          getClassSettings()
        ]);

        if (results[0].status === 'fulfilled') objTask = results[0].value;
        if (results[1].status === 'fulfilled') criteria = results[1].value;
        if (results[2].status === 'fulfilled') completed = results[2].value;
        if (results[3].status === 'fulfilled') settings = results[3].value;

        document.getElementById('objectiveText').textContent = objTask.objective || '등록된 학습목표가 없습니다.';
        document.getElementById('taskText').textContent = objTask.task || '등록된 평가과제가 없습니다.';
        ratingCriteria = criteria;
        renderRatingItems(criteria);

        const maxCount = currentStudent.type === 'group' ? settings.groupCount : settings.studentCount;
        renderTargetGrid(maxCount, currentStudent.id, completed, currentStudent.type);
      } catch (dataError) {
        console.warn('학생 데이터 로드 중 일부 오류:', dataError);
        // 최소한 기본 그리드는 표시
        renderTargetGrid(30, currentStudent.id, [], currentStudent.type);
      }
    }
  } catch (error) {
    console.error('Initial routing error:', error);
    const loadingSec = document.getElementById('authLoadingSection');
    loadingSec.classList.remove('hidden');
    loadingSec.innerHTML = `
      <div style="color:var(--color-danger); padding:20px;">
        <h3>오류가 발생했습니다</h3>
        <p>${error.message}</p>
        <button onclick="location.reload()" style="margin-top:10px; padding:8px 16px; background:var(--primary); color:white; border:none; border-radius:8px;">새로고침</button>
      </div>
    `;
  }
}

// 구글 로그아웃
async function logoutGoogle() {
  try {
    if (!isDemoMode) {
      await db.auth.signOut();
    }
  } catch (error) {
    console.warn('signOut failed:', error);
  } finally {
    window.location.replace('index.html');
  }
}

// ============================================
// 체험 모드 (Demo Mode)
// ============================================

// 체험용 최소 데이터 골격 (나중에 채울 예정)
const DEMO_DATA = {
  classes: [{ class_code: '체험용', class_name: '체험용 학급', student_count: 24, group_count: 6, auto_approve_praise: false, creator_id: 'demo-user' }],
  user_profiles: [
    { id: 'demo-p1', google_uid: 'demo-user', google_email: 'demo@baeumlog.kr', role: 'student', class_code: '체험용', class_name: '체험용 학급', student_number: 1, student_type: 'individual' },
    { id: 'demo-p2', google_uid: 'demo-s2', google_email: 'student2@demo.kr', role: 'student', class_code: '체험용', class_name: '체험용 학급', student_number: 2, student_type: 'individual' },
    { id: 'demo-p3', google_uid: 'demo-s3', google_email: 'student3@demo.kr', role: 'student', class_code: '체험용', class_name: '체험용 학급', student_number: 3, student_type: 'individual' },
    { id: 'demo-p4', google_uid: 'demo-s4', google_email: 'student4@demo.kr', role: 'student', class_code: '체험용', class_name: '체험용 학급', student_number: 4, student_type: 'individual' },
    { id: 'demo-p5', google_uid: 'demo-s5', google_email: 'student5@demo.kr', role: 'student', class_code: '체험용', class_name: '체험용 학급', student_number: 5, student_type: 'individual' },
    { id: 'demo-p6', google_uid: 'demo-s6', google_email: 'student6@demo.kr', role: 'student', class_code: '체험용', class_name: '체험용 학급', student_number: 6, student_type: 'individual' },
  ],
  objectives: [],
  tasks: [],
  rating_criteria: [],
  reviews: [],
  daily_reflections: [],
  praise_messages: [],
  teacher_messages: [],
  student_personality: [],
  student_goals: [],
  project_reflections: [],
};

// 체험 모드 DB 프록시 설치 — 모든 write 차단, select는 DEMO_DATA에서 반환
function installDemoDbProxy() {
  const originalFrom = db.from.bind(db);

  db.from = function (tableName) {
    // select 체인 생성
    function createDemoSelectChain() {
      const filters = {};
      const chain = {
        eq: function (col, val) { filters[col] = String(val); return chain; },
        neq: function () { return chain; },
        gt: function () { return chain; },
        gte: function () { return chain; },
        lt: function () { return chain; },
        lte: function () { return chain; },
        or: function () { return chain; },
        in: function () { return chain; },
        is: function () { return chain; },
        order: function () { return chain; },
        limit: function () { return chain; },
        select: function () { return chain; },
        maybeSingle: function () {
          const data = getDemoData(tableName, filters);
          const single = Array.isArray(data) ? (data[0] || null) : data;
          return Promise.resolve({ data: single, error: null, count: data.length || 0 });
        },
        single: function () { return chain.maybeSingle(); },
        then: function (resolve) {
          const data = getDemoData(tableName, filters);
          return resolve({ data: Array.isArray(data) ? data : [], error: null, count: Array.isArray(data) ? data.length : 0 });
        },
        catch: function () { return Promise.resolve({ data: [], error: null }); }
      };
      return chain;
    }

    // write 차단용 fake 체인
    function createFakeWriteChain() {
      const fakeResult = Promise.resolve({ data: null, error: null, count: 0 });
      const chainMethods = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'or', 'in', 'is', 'order', 'limit', 'select', 'maybeSingle', 'single'];
      const fakeChain = {};
      chainMethods.forEach(m => { fakeChain[m] = function () { return fakeChain; }; });
      fakeChain.then = function (resolve) { return resolve({ data: null, error: null, count: 0 }); };
      fakeChain.catch = function () { return Promise.resolve({ data: null, error: null }); };
      return fakeChain;
    }

    return {
      select: function (...args) { return originalFrom(tableName).select(...args); },
      insert: function () { showDemoBlockModal(); return createFakeWriteChain(); },
      update: function () { showDemoBlockModal(); return createFakeWriteChain(); },
      upsert: function () { showDemoBlockModal(); return createFakeWriteChain(); },
      delete: function () { showDemoBlockModal(); return createFakeWriteChain(); },
    };
  };

  // auth 메서드 오버라이드
  db.auth.signOut = () => { window.location.replace('index.html'); return Promise.resolve(); };
  db.auth.getUser = () => Promise.resolve({ data: { user: { id: 'demo-user', email: 'demo@baeumlog.kr' } }, error: null });
  db.auth.getSession = () => Promise.resolve({ data: { session: { user: { id: 'demo-user', email: 'demo@baeumlog.kr' } } }, error: null });
}

// DEMO_DATA에서 필터링하여 데이터 반환
function getDemoData(tableName, filters) {
  let data = DEMO_DATA[tableName];
  if (!data) return [];
  if (!Array.isArray(data)) data = [data];

  return data.filter(item => {
    return Object.entries(filters).every(([col, val]) => {
      if (item[col] === undefined) return true;
      return String(item[col]) === String(val);
    });
  });
}

// 체험 모드 저장 차단 모달
function showDemoBlockModal() {
  // 모달이 이미 열려있으면 스킵
  const modal = document.getElementById('customModal');
  if (modal && !modal.classList.contains('hidden')) return;
  showModal({
    type: 'alert',
    icon: '🔒',
    title: '체험 모드',
    message: '이 페이지는 체험용이기 때문에<br>저장이 불가능합니다.'
  });
}

// 체험 모드 초기화
function initDemoMode(role) {
  // DB 프록시 설치
  installDemoDbProxy();
  syncAllDates(DEMO_FIXED_QUERY_DATE);

  // 기본 전역 변수 설정
  currentClassCode = '체험용';

  // 로딩 화면 숨기기
  document.getElementById('authLoadingSection').classList.add('hidden');

  if (role === 'student') {
    // 학생 전역 변수 설정
    currentStudent = { id: '1', type: 'individual', name: '1' };
    studentPersonality = loadDemoPersonalityFromStorage();

    // 학생 UI 표시
    document.getElementById('studentTab').classList.remove('hidden');
    document.getElementById('studentMainSection').classList.remove('hidden');
    document.getElementById('welcomeMsg').textContent = '체험용 1번 학생 환영합니다! (체험 모드)';
    document.getElementById('reviewerId').value = '1';
    document.getElementById('submitReviewerLabel').textContent = '나의 번호';

    // 개인 평가 타입 기본 설정
    const radios = document.getElementsByName('evalTypeDisplay');
    const resultRadios = document.getElementsByName('resultEvalTypeDisplay');
    if (radios[0]) radios[0].checked = true;
    if (resultRadios[0]) resultRadios[0].checked = true;

    // 학생 기본 탭으로 시작
    switchStudentMainTab('self');

  } else if (role === 'teacher') {
    // 교사 UI 표시
    const tTab = document.getElementById('teacherTab');
    const tMain = document.getElementById('teacherMain');
    tTab.classList.remove('hidden');
    tTab.style.display = 'block';
    tTab.style.opacity = '1';
    tMain.classList.remove('hidden');
    tMain.style.display = 'block';
    tMain.style.opacity = '1';

    // 교사 기본 탭으로 시작
    setTimeout(() => { switchMiniTab('review'); }, 100);
  }

  // 체험 모드 배너 추가
  addDemoBanner(role);

  // 로그아웃 버튼 → 체험 종료로 변경
  document.querySelectorAll('button[onclick="logoutGoogle()"]').forEach(btn => {
    btn.textContent = '🏠 체험 종료';
    btn.onclick = () => { window.location.replace('index.html'); };
  });
}

// 체험 모드 상단 배너
function addDemoBanner(role) {
  const banner = document.createElement('div');
  banner.id = 'demoBanner';
  banner.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:10000; ' +
    'background:linear-gradient(90deg, #fbbf24, #f59e0b); color:#78350f; ' +
    'text-align:center; padding:10px 16px; font-size:0.85rem; font-weight:700; ' +
    'font-family:"Jua",sans-serif; box-shadow:0 2px 8px rgba(0,0,0,0.1);';
  const roleText = role === 'student' ? '학생용' : '교사용';
  banner.innerHTML = '🎮 체험 모드 (' + roleText + ') - 데이터는 저장되지 않습니다 ' +
    '<a href="index.html" style="color:#78350f; margin-left:12px; text-decoration:underline; font-weight:700;">돌아가기</a>';
  document.body.prepend(banner);
  document.body.style.paddingTop = '42px';
}

// 학생 온보딩 저장
async function saveStudentOnboarding() {
  const className = document.getElementById('onboardClassName').value.trim();
  let classCode = document.getElementById('onboardClassCode').value.replace(/\s/g, '');
  const type = document.querySelector('input[name="onboardType"]:checked').value;
  const num = document.getElementById('onboardStudentNumber').value.trim();
  const btn = document.getElementById('saveOnboardBtn');
  const msg = document.getElementById('onboardMsg');

  if (!className || !classCode || !num) {
    showMsg(msg, '모든 정보를 입력해주세요.', 'error');
    return;
  }

  setLoading(true, btn, '저장 중...');

  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error('로그인 세션이 만료되었습니다.');

    const { data: cls } = await db.from('classes').select('class_code').eq('class_code', classCode).maybeSingle();
    if (!cls) throw new Error('존재하지 않는 클래스 코드입니다. 선생님께 확인해주세요.');

    // 학생 번호 중복 체크
    const { data: existingStudent } = await db.from('user_profiles')
      .select('google_email')
      .eq('class_code', classCode)
      .eq('student_number', parseInt(num))
      .eq('role', 'student')
      .maybeSingle();
    if (existingStudent) throw new Error('이미 다른 학생이 ' + num + '번을 사용 중입니다. 선생님께 확인해주세요.');

    const { error: profileError } = await db.from('user_profiles').insert({
      google_uid: user.id,
      google_email: user.email,
      role: 'student',
      class_code: classCode,
      class_name: className,
      student_number: parseInt(num),
      student_type: type
    });

    if (profileError) {
      if (profileError.message && profileError.message.includes('idx_unique_student_number')) {
        throw new Error('이미 다른 학생이 ' + num + '번을 사용 중입니다. 선생님께 확인해주세요.');
      }
      throw profileError;
    }

    showMsg(msg, '설정이 완료되었습니다!', 'success');
    window.location.href = 'app.html?role=student';

  } catch (error) {
    setLoading(false, btn, '설정 완료');
    showMsg(msg, error.message, 'error');
  }
}

// 교사 온보딩 저장
async function saveTeacherOnboarding() {
  const className = document.getElementById('newOnboardClassName').value.trim();
  const code = document.getElementById('newOnboardClassCode').value.replace(/\s/g, '');
  const btn = document.getElementById('saveTeacherOnboardBtn');
  const msg = document.getElementById('teacherOnboardMsg');

  if (!className || !code) {
    showMsg(msg, '학급명과 클래스 코드를 모두 입력하세요.', 'error');
    return;
  }
  if (code.length > 10) {
    showMsg(msg, '클래스 코드는 10자리 이내로 입력하세요.', 'error');
    return;
  }

  setLoading(true, btn, '생성 중...');

  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error('로그인 세션이 만료되었습니다.');

    const { data: existing } = await db.from('classes').select('class_code').eq('class_code', code).maybeSingle();
    if (existing) throw new Error('이미 사용 중인 클래스 코드입니다.');

    const { error: classError } = await db.from('classes').insert({
      class_code: code,
      class_name: className,
      creator_id: user.id
    });
    if (classError) throw classError;

    const { error: profileError } = await db.from('user_profiles').insert({
      google_uid: user.id,
      google_email: user.email,
      role: 'teacher',
      class_code: code,
      class_name: className
    });

    if (profileError) throw profileError;

    showMsg(msg, '클래스가 생성되었습니다!', 'success');
    window.location.href = 'app.html?role=teacher';

  } catch (error) {
    setLoading(false, btn, '클래스 생성하기');
    showMsg(msg, error.message, 'error');
  }
}

// 온보딩 타입 토글 (학생)
document.querySelectorAll('input[name="onboardType"]').forEach(radio => {
  radio.addEventListener('change', function () {
    const type = this.value;
    const label = document.getElementById('onboardIdLabel');
    const input = document.getElementById('onboardStudentNumber');

    if (type === 'individual') {
      label.textContent = '나의 번호';
      input.placeholder = '번호 입력 (예: 15)';
    } else {
      label.textContent = '나의 모둠 번호';
      input.placeholder = '모둠 번호 입력 (예: 1)';
    }
  });
});


syncAllDates(getDefaultQueryDate());

// Initial criteria fetch is deferred until class_code is available.
// as they are handled inside checkAuthAndRoute after class_code is retrieved

document.getElementById('reviewDate').addEventListener('change', function () {
  fetchCriteria(this.value);
  fetchRatingCriteria(this.value);
  if (currentStudent) loadEvalTargetGrid();
});
document.getElementById('teacherDate').addEventListener('change', function () {
  if (!document.getElementById('teacherMain').classList.contains('hidden')) loadTeacherData();
});

// ============================================
// DB 헬퍼
// ============================================
async function getClassInfo() {
  try {
    const { data } = await db.from('classes').select('*').eq('class_code', currentClassCode).maybeSingle();
    return data;
  } catch (err) { console.warn('getClassInfo 오류:', err); return null; }
}
async function getClassSettings() {
  try {
    const info = await getClassInfo();
    return { studentCount: info ? info.student_count : 30, groupCount: info ? info.group_count : 6 };
  } catch (err) { console.warn('getClassSettings 오류:', err); return { studentCount: 30, groupCount: 6 }; }
}
async function getObjectiveAndTask(dateStr) {
  const { data: objData } = await db.from('objectives').select('objective').eq('class_code', currentClassCode).eq('eval_date', dateStr).maybeSingle();
  const { data: taskData } = await db.from('tasks').select('task').eq('class_code', currentClassCode).eq('eval_date', dateStr).maybeSingle();
  return { objective: objData ? objData.objective : '', task: taskData ? taskData.task : '' };
}
async function getRatingCriteriaFromDB(dateStr, evalType) {
  if (!evalType) evalType = currentStudent ? currentStudent.type : 'individual';
  const { data } = await db.from('rating_criteria').select('*').eq('class_code', currentClassCode).eq('eval_date', dateStr).eq('eval_type', evalType).maybeSingle();
  if (!data) return [];
  return [data.criteria_1, data.criteria_2, data.criteria_3, data.criteria_4, data.criteria_5, data.criteria_6].filter(item => item && String(item).trim() !== '');
}
async function getRatingCriteriaFull(dateStr, evalType) {
  if (!evalType) evalType = 'individual';
  const { data } = await db.from('rating_criteria').select('*').eq('class_code', currentClassCode).eq('eval_date', dateStr).eq('eval_type', evalType).maybeSingle();
  if (!data) return ['', '', '', '', '', ''];
  return [data.criteria_1 || '', data.criteria_2 || '', data.criteria_3 || '', data.criteria_4 || '', data.criteria_5 || '', data.criteria_6 || ''];
}
async function getCompletedTargets(dateStr, reviewerId, reviewType) {
  const { data } = await db.from('reviews').select('target_id').eq('class_code', currentClassCode).eq('review_date', dateStr).eq('reviewer_id', String(reviewerId)).eq('review_type', reviewType);
  return (data || []).map(r => r.target_id);
}

// ============================================
// 스크롤 효과
// ============================================
window.addEventListener('scroll', function () { const card = document.querySelector('.card'); if (window.scrollY > 50) card.classList.add('scrolled'); else card.classList.remove('scrolled'); });

// ============================================
// 유틸리티
// ============================================
function formatMarkdown(text) {
  if (!text) return '';
  text = text.trim();
  // Headers with aggressive whitespace removal after them
  let html = text
    .replace(/^##\s*(.+)$/gm, '<h3>$1</h3>')
    .replace(/^###\s*(.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Remove multiple newlines and convert to paragraphs
  html = html.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');

  // Clean up start and end
  html = html.replace(/^(<br>)+/, '').replace(/^(<\/p><p>)+/, '');

  if (!html.startsWith('<h') && !html.startsWith('<p')) html = '<p>' + html + '</p>';

  // Clean up empty paragraphs and breaks inside paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '').replace(/<p><br><\/p>/g, '');

  // Remove <br> immediately after headers (key fix)
  html = html.replace(/(<\/h[34]>)\s*(<br>)+/g, '$1');

  return html;
}
function setLoading(loading, btn, text) {
  btn.disabled = loading;
  if (loading) btn.innerHTML = '<span class="spinner"></span>' + text;
  else btn.textContent = text;
}
function showMsg(el, text, type) {
  if (type === 'success') el.innerHTML = '<div class="success-check"></div>' + text;
  else el.textContent = text;
  el.className = 'message ' + type;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => el.style.display = 'none', 4000);
}
function calculateAverageScores(scoresArray) {
  if (!scoresArray || scoresArray.length === 0) return [];
  const map = {};
  scoresArray.forEach(item => {
    if (item.criteria && item.scores) {
      item.criteria.forEach((crit, idx) => {
        if (!crit || String(crit).trim() === '') return;
        if (!map[crit]) map[crit] = { sum: 0, count: 0 };
        const s = parseInt(item.scores[String(idx)]) || 0;
        if (s > 0) { map[crit].sum += s; map[crit].count++; }
      });
    }
  });
  return Object.keys(map).map(k => ({ criterion: k, average: map[k].count > 0 ? map[k].sum / map[k].count : 0 }));
}

// 학생 평가 타입 전환 (개인 ↔ 모둠)
async function switchTypeAndLogout(newType) {
  if (!currentStudent) return;
  currentStudent.type = newType;

  // DB 프로필 업데이트
  try {
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      await db.from('user_profiles')
        .update({ student_type: newType })
        .eq('google_uid', user.id);
    }
  } catch (err) {
    console.warn('타입 업데이트 오류:', err);
  }

  // UI 라벨 변경
  document.getElementById('submitReviewerLabel').textContent = newType === 'individual' ? '나의 번호' : '나의 모둠';
  document.getElementById('reviewerId').value = currentStudent.id;

  // 양쪽 라디오 동기화
  const radios = document.getElementsByName('evalTypeDisplay');
  const resultRadios = document.getElementsByName('resultEvalTypeDisplay');
  radios.forEach(r => r.checked = (r.value === newType));
  resultRadios.forEach(r => r.checked = (r.value === newType));

  // 평가기준 & 대상 그리드 새로 로드
  const date = document.getElementById('reviewDate').value;
  const [criteria, completed, settings] = await Promise.all([
    getRatingCriteriaFromDB(date, newType),
    getCompletedTargets(date, currentStudent.id, newType),
    getClassSettings()
  ]);
  ratingCriteria = criteria;
  renderRatingItems(criteria);
  const max = newType === 'group' ? settings.groupCount : settings.studentCount;
  renderTargetGrid(max, currentStudent.id, completed, newType);
}

function syncAllDates(dateStr) {
  const dateInputs = ['reviewDate', 'viewDate', 'teacherDate', 'settingDate', 'selfDate', 'diaryViewDate', 'messageViewDate'];
  dateInputs.forEach(id => { const el = document.getElementById(id); if (el) el.value = dateStr; });
}



// ============================================
// 모달
// ============================================
function showModal({ type = 'alert', icon = '✨', title = '알림', message, inputPlaceholder = '', onConfirm = null, onCancel = null }) {
  const modal = document.getElementById('customModal');
  document.getElementById('modalIcon').textContent = icon;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMessage').innerHTML = message;
  const inputEl = document.getElementById('modalInput');
  const cancelBtn = document.getElementById('modalCancelBtn');
  const confirmBtn = document.getElementById('modalConfirmBtn');
  inputEl.value = ''; inputEl.classList.add('hidden'); cancelBtn.style.display = 'block';
  const close = () => modal.classList.add('hidden');
  if (type === 'alert') { cancelBtn.style.display = 'none'; confirmBtn.innerText = '확인'; confirmBtn.onclick = () => { if (onConfirm) onConfirm(); close(); }; }
  else if (type === 'confirm') { confirmBtn.innerText = '확인'; confirmBtn.onclick = () => { if (onConfirm) onConfirm(); close(); }; cancelBtn.onclick = () => { if (onCancel) onCancel(); close(); }; }
  else if (type === 'prompt') { inputEl.classList.remove('hidden'); inputEl.placeholder = inputPlaceholder; confirmBtn.innerText = '확인'; confirmBtn.onclick = () => { if (onConfirm) onConfirm(inputEl.value); close(); }; cancelBtn.onclick = () => { if (onCancel) onCancel(); close(); }; }
  modal.classList.remove('hidden');
  if (type === 'prompt') inputEl.focus();
}
function showCustomConfirm(message, onConfirm, onCancel) { showModal({ type: 'confirm', icon: '🤔', title: '확인', message, onConfirm, onCancel }); }

// ============================================
// 탭 전환
// ============================================

// 학생 메인 탭 선택 (자기평가 vs 동료평가)
function switchStudentMainTab(mode) {
  // 학생용 하단 내비게이션 버튼만 선택
  const btns = document.querySelectorAll('#studentMainSection .bottom-nav .nav-item');
  document.getElementById('peerEvaluationSection').classList.add('hidden');
  document.getElementById('selfEvaluationSection').classList.add('hidden');
  document.getElementById('praiseSection').classList.add('hidden');
  const settingsSec = document.getElementById('studentSettingsSection');
  if (settingsSec) settingsSec.classList.add('hidden');

  // 버튼 스타일 초기화 (active-nav 클래스 제거)
  btns.forEach(b => b.classList.remove('active-nav'));

  if (mode === 'self') {
    btns[0].classList.add('active-nav');
    document.getElementById('selfEvaluationSection').classList.remove('hidden');
    initSelfEvaluation();
  } else if (mode === 'peer') {
    btns[1].classList.add('active-nav');
    document.getElementById('peerEvaluationSection').classList.remove('hidden');
    switchPeerTab('submit');
  } else if (mode === 'praise') {
    btns[2].classList.add('active-nav');
    document.getElementById('praiseSection').classList.remove('hidden');
    loadPraiseData();
  } else if (mode === 'settings') {
    btns[3].classList.add('active-nav');
    document.getElementById('studentSettingsSection').classList.remove('hidden');
    loadStudentSettingsData();
  }
}

async function loadStudentSettingsData() {
  if (!currentClassCode) return;

  // 박스 1: 학급 정보 표시
  document.getElementById('settingsClassCode').textContent = currentClassCode;
  const { data: cls } = await db.from('classes').select('class_name').eq('class_code', currentClassCode).maybeSingle();
  if (cls) {
    document.getElementById('settingsClassName').textContent = cls.class_name;
  }

  // 박스 2: 성향 진단 정보 표시
  const area = document.getElementById('settingsPersonalityArea');
  try {
    const { data: personality } = await db.from('student_personality')
      .select('personality_type, question_responses')
      .eq('class_code', currentClassCode)
      .eq('student_id', currentStudent.id)
      .maybeSingle();

    if (!personality) {
      area.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding:20px 0;">아직 진단하지 않았어요.<br>자기평가 탭에서 진단을 시작해보세요!</p>';
      return;
    }

    const personalities = {
      analytical: { icon: '🎯', title: '분석형', desc: '구체적이고 논리적인 피드백을 선호하는 스타일' },
      balanced: { icon: '⚖️', title: '균형형', desc: '논리와 감정의 균형을 중시하는 스타일' },
      growth: { icon: '🌱', title: '성장형', desc: '과정과 배움을 중시하는 스타일' },
      empathetic: { icon: '💝', title: '감성형', desc: '공감과 격려를 중시하는 스타일' }
    };

    const myType = personality.personality_type;
    const p = personalities[myType] || { icon: '❓', title: '알 수 없음', desc: '' };

    // 나의 유형 강조 표시
    let html = `
      <div style="text-align:center; padding:15px 0; margin-bottom:15px; background:var(--primary-light); border:2px solid var(--primary); border-radius:14px;">
        <div style="font-size:2.5rem; margin-bottom:6px;">${p.icon}</div>
        <div style="font-weight:700; font-size:1.1rem; color:var(--text-main);">나의 유형: ${p.title}</div>
        <div style="font-size:0.85rem; color:var(--text-sub); margin-top:4px;">${p.desc}</div>
      </div>
    `;

    // 전체 유형 비교
    html += '<div style="font-weight:700; font-size:0.9rem; color:var(--text-main); margin-bottom:10px;">📌 전체 성향 유형</div>';
    html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:15px;">';
    Object.entries(personalities).forEach(([key, val]) => {
      const isMine = key === myType;
      html += `<div style="padding:10px; border-radius:12px; text-align:center; ${isMine ? 'background:var(--primary-light); border:2px solid var(--primary);' : 'background:var(--bg-body); border:2px solid transparent; opacity:0.6;'}">
        <div style="font-size:1.4rem;">${val.icon}</div>
        <div style="font-weight:700; font-size:0.8rem; color:var(--text-main); margin-top:3px;">${val.title}${isMine ? ' ✓' : ''}</div>
        <div style="font-size:0.7rem; color:var(--text-sub); margin-top:2px; line-height:1.3;">${val.desc}</div>
      </div>`;
    });
    html += '</div>';

    // 질문별 응답 표시 (선택한 것 + 선택 안 한 것 모두 표시)
    if (personality.question_responses) {
      html += '<div style="font-weight:700; font-size:0.9rem; color:var(--text-main); margin-bottom:10px;">📋 나의 응답</div>';
      personalityQuestions.forEach(q => {
        const answer = personality.question_responses[q.id];
        if (answer) {
          const chosen = answer === 'A' ? q.optionA : q.optionB;
          const notChosen = answer === 'A' ? q.optionB : q.optionA;
          html += `
            <div style="padding:10px 12px; margin-bottom:8px; background:var(--bg-body); border-radius:10px; font-size:0.82rem;">
              <div style="color:var(--text-sub); margin-bottom:6px;">Q${q.id}. ${q.question}</div>
              <div style="color:var(--primary); font-weight:700;">✓ ${answer}. ${chosen.text}</div>
              <div style="color:var(--text-sub); opacity:0.5; margin-top:3px; font-size:0.78rem;">${answer === 'A' ? 'B' : 'A'}. ${notChosen.text}</div>
            </div>
          `;
        }
      });
    }

    html += '<button type="button" onclick="resetPersonalityFromSettings()" style="background:var(--border); color:var(--text-main); font-size:0.85rem; padding:10px 20px; margin-top:12px; border-radius:50px; border:none; font-family:\'Jua\',sans-serif; cursor:pointer;">다시 진단하기</button>';

    area.innerHTML = html;
  } catch (err) {
    console.error('성향 정보 로드 오류:', err);
    area.innerHTML = '<p style="color:var(--text-sub); text-align:center;">성향 정보를 불러올 수 없습니다.</p>';
  }
}



// 학급 변경 및 데이터 전체 초기화
async function changeClassAndReset() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const newNameInput = document.getElementById('newClassNameInput');
  const newCodeInput = document.getElementById('newClassCodeInput');
  const newName = newNameInput.value.trim();
  const newCode = newCodeInput.value.trim().replace(/\s/g, '');

  if (!newName || !newCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 필요', message: '이동할 학급명과 학급 코드를 모두 입력해주세요.' });
    return;
  }

  if (newCode === currentClassCode) {
    showModal({ type: 'alert', icon: 'ℹ️', title: '알림', message: '현재와 동일한 학급 코드입니다.' });
    return;
  }

  // 1. 학급 존재 확인 및 학급명 일치 확인
  const { data: cls, error: clsError } = await db.from('classes').select('class_name').eq('class_code', newCode).maybeSingle();
  if (clsError) {
    showModal({ type: 'alert', icon: '❌', title: '오류', message: '학급 확인 중 오류가 발생했습니다.' });
    return;
  }
  if (!cls) {
    showModal({ type: 'alert', icon: '❌', title: '오류', message: '존재하지 않는 학급 코드입니다.' });
    return;
  }

  if (cls.class_name !== newName) {
    showModal({ type: 'alert', icon: '❌', title: '정보 불일치', message: '입력하신 학급명이 해당 학급 코드의 실제 학급명과 일치하지 않습니다.' });
    return;
  }

  const msg = `[학급 변경: ${cls.class_name}]\n정말 학급을 변경하시겠습니까?\n이동 시 기존의 모든 기록(일기, 평가, 칭찬 등)이 영구 삭제됩니다.`;

  showCustomConfirm(msg, async () => {
    try {
      const { data: session } = await db.auth.getSession();
      const user = session?.session?.user;
      if (!user) return;

      const sid = String(currentStudent.id);

      // 2. 기존 데이터 일괄 삭제
      await Promise.all([
        db.from('daily_reflections').delete().eq('class_code', currentClassCode).eq('student_id', sid),
        db.from('reviews').delete().eq('class_code', currentClassCode).or(`reviewer_id.eq.${sid},target_id.eq.${sid}`),
        db.from('student_personality').delete().eq('class_code', currentClassCode).eq('student_id', sid),
        db.from('praise_messages').delete().eq('class_code', currentClassCode).or(`sender_id.eq.${sid},receiver_id.eq.${sid}`),
        db.from('student_goals').delete().eq('class_code', currentClassCode).eq('student_id', sid),
        db.from('teacher_messages').delete().eq('class_code', currentClassCode).eq('student_id', sid),
        db.from('project_reflections').delete().eq('class_code', currentClassCode).eq('student_id', sid)
      ]);

      // 3. 프로필 정보 업데이트
      await db.from('user_profiles')
        .update({ class_code: newCode, class_name: cls.class_name })
        .eq('google_uid', user.id);

      showModal({
        type: 'alert', icon: '✅', title: '변경 완료', message: '학급 변경 및 데이터 초기화가 완료되었습니다.\n다시 로그인해주시기 바랍니다.',
        onConfirm: () => { window.location.reload(); }
      });

    } catch (err) {
      console.error('학급 변경 오류:', err);
      showModal({ type: 'alert', icon: '❌', title: '오류', message: '변경 중 오류가 발생했습니다: ' + err.message });
    }
  });
}


async function saveStudentSettings() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const newName = document.getElementById('studentSettingClassName').value.trim();
  const newCode = document.getElementById('studentSettingClassCode').value.replace(/\s/g, '');

  if (!newName || !newCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 필요', message: '학급명과 학급 코드를 모두 입력해주세요.' });
    return;
  }

  showCustomConfirm('학급 정보를 변경하시겠습니까?', async () => {
    try {
      const { data: session } = await db.auth.getSession();
      if (!session?.session?.user) return;

      // 만약 코드가 바뀌었다면 실제 존재하는 클래스인지 확인
      if (newCode !== currentClassCode) {
        const { data: cls, error: clsError } = await db.from('classes').select('*').eq('class_code', newCode).maybeSingle();
        if (clsError) throw clsError;
        if (!cls) {
          showModal({ type: 'alert', icon: '❌', title: '오류', message: '존재하지 않는 학급 코드입니다.' });
          return;
        }
      }

      const { error: updateError } = await db.from('user_profiles')
        .update({ class_name: newName, class_code: newCode })
        .eq('google_uid', session.session.user.id)
        .eq('role', 'student');

      if (updateError) throw updateError;

      showModal({
        type: 'alert',
        icon: '🎉',
        title: '변경 완료',
        message: '학급 정보가 변경되었습니다. 페이지를 새로고침합니다.',
        onConfirm: () => window.location.reload()
      });

    } catch (error) {
      console.error('학급 정보 변경 오류:', error);
      showModal({ type: 'alert', icon: '❌', title: '오류', message: error.message });
    }
  });
}

// 설정에서 성향 진단 초기화
async function resetPersonalityFromSettings() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  showCustomConfirm('성향 진단을 초기화하고 다시 진단하시겠습니까?', async () => {
    try {
      await db.from('student_personality')
        .delete()
        .eq('class_code', currentClassCode)
        .eq('student_id', currentStudent.id);

      studentPersonality = null;
      quizAnswers = {};

      // 자기평가 탭으로 이동 → 퀴즈 표시
      switchStudentMainTab('self');
    } catch (err) {
      console.error('성향 초기화 오류:', err);
      showModal({ type: 'alert', icon: '❌', title: '오류', message: '초기화에 실패했습니다: ' + err.message });
    }
  });
}


// 동료평가 세부 탭 (평가하기 vs 결과보기)
async function switchPeerTab(mode) {
  const btns = document.querySelectorAll('#peerEvaluationSection .sub-tab-btn');
  document.getElementById('studentSubmitTab').classList.add('hidden');
  document.getElementById('studentResultTab').classList.add('hidden');

  btns.forEach(b => b.classList.remove('active'));

  if (mode === 'submit') {
    btns[0].classList.add('active');
    document.getElementById('studentSubmitTab').classList.remove('hidden');
    // 평가하기 탭 전환 시 데이터 로드
    if (currentStudent && currentClassCode) {
      try {
        const date = document.getElementById('reviewDate').value;
        const [objTask, criteria, completed, settings] = await Promise.all([
          getObjectiveAndTask(date),
          getRatingCriteriaFromDB(date),
          getCompletedTargets(date, currentStudent.id, currentStudent.type),
          getClassSettings()
        ]);
        document.getElementById('objectiveText').textContent = objTask.objective || '등록된 학습목표가 없습니다.';
        document.getElementById('taskText').textContent = objTask.task || '등록된 평가과제가 없습니다.';
        ratingCriteria = criteria;
        renderRatingItems(criteria);
        const maxCount = currentStudent.type === 'group' ? settings.groupCount : settings.studentCount;
        renderTargetGrid(maxCount, currentStudent.id, completed, currentStudent.type);
      } catch (err) {
        console.warn('동료평가 데이터 로드 오류:', err);
        // 에러 시에도 기본 그리드는 표시
        try {
          const settings = await getClassSettings();
          const maxCount = currentStudent.type === 'group' ? settings.groupCount : settings.studentCount;
          renderTargetGrid(maxCount, currentStudent.id, [], currentStudent.type);
        } catch (e) {
          // classes 테이블 자체가 없을 경우 기본값으로 그리드 표시
          renderTargetGrid(30, currentStudent.id, [], currentStudent.type);
        }
      }
    }
  } else {
    btns[1].classList.add('active');
    document.getElementById('studentResultTab').classList.remove('hidden');
  }
}

// 자기평가 세부 탭 (성장 일기 vs 대시보드 vs 프로젝트)
function switchSelfTab(mode) {
  const btns = document.querySelectorAll('#selfEvaluationMenu .sub-tab-btn');
  document.getElementById('dailyReflectionTab').classList.add('hidden');
  document.getElementById('dashboardTab').classList.add('hidden');
  document.getElementById('projectReflectionTab').classList.add('hidden');

  btns.forEach(b => b.classList.remove('active'));

  if (mode === 'daily') {
    btns[0].classList.add('active');
    document.getElementById('dailyReflectionTab').classList.remove('hidden');
    loadDailyReflection();
  } else if (mode === 'project') {
    btns[1].classList.add('active');
    document.getElementById('projectReflectionTab').classList.remove('hidden');
  } else if (mode === 'dashboard') {
    btns[2].classList.add('active');
    document.getElementById('dashboardTab').classList.remove('hidden');
    loadDashboardData();
  }
}
async function switchMiniTab(mode) {
  // 모든 컨텐츠 탭 숨기기
  ['ranking', 'student', 'criteria', 'diary', 'praise', 'settings'].forEach(t => document.getElementById(t + 'MiniTab').classList.add('hidden'));
  // 하위 탭 영역 숨기기
  document.getElementById('reviewSubTabArea').classList.add('hidden');

  // 교사 메인 탭 버튼만 선택 (설정 내부의 AI/수동 전환 버튼 제외)
  const mainTabBtns = document.querySelectorAll('#teacherMain .bottom-nav .nav-item');
  mainTabBtns.forEach(b => {
    b.classList.remove('active-nav');
    b.classList.remove('active-setting'); // legacy cleanup if any
  });

  if (mode === 'review') {
    // 전체 현황 - 하위 탭 표시 후 기본으로 전체 현황
    document.getElementById('reviewSubTabArea').classList.remove('hidden');
    mainTabBtns[1].classList.add('active-nav');
    document.getElementById('rankStudentArea').style.display = 'block';
    const el = document.getElementById('rankingMiniTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content');
    await switchReviewSubTab('ranking');
  } else if (mode === 'diary') {
    mainTabBtns[0].classList.add('active-nav');
    document.getElementById('rankStudentArea').style.display = 'none';
    const el = document.getElementById('diaryMiniTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content');
    initDiaryDate(); loadTeacherDiaryData();
  } else if (mode === 'praise') {
    mainTabBtns[2].classList.add('active-nav');
    document.getElementById('rankStudentArea').style.display = 'none';
    const el = document.getElementById('praiseMiniTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content');
    loadPraiseStats(); loadPendingPraises(); loadApprovedPraises(); loadAutoApproveStatus(); initMessageDate(); loadTeacherMessages();
  } else if (mode === 'settings') {
    mainTabBtns[3].classList.add('active-nav');
    document.getElementById('rankStudentArea').style.display = 'none';
    const el = document.getElementById('settingsMiniTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content');
    loadClassSettingsUI(); loadStudentMappingData();
  }
}

async function switchReviewSubTab(mode) {
  ['ranking', 'student', 'criteria'].forEach(t => document.getElementById(t + 'MiniTab').classList.add('hidden'));
  const subBtns = document.querySelectorAll('#reviewSubTabArea .sub-tab-btn');
  subBtns.forEach(b => b.classList.remove('active'));

  const el = document.getElementById(mode + 'MiniTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content');

  if (mode === 'ranking') {
    subBtns[0].classList.add('active');
    document.getElementById('rankStudentArea').style.display = 'block';
    await loadTeacherData();
  } else if (mode === 'student') {
    subBtns[1].classList.add('active');
    document.getElementById('rankStudentArea').style.display = 'block';
  } else if (mode === 'criteria') {
    subBtns[2].classList.add('active');
    document.getElementById('rankStudentArea').style.display = 'none';
    loadCriteriaForEdit(); switchCriteriaMode('auto');
  }
}

// ============================================
// 학생 로그인
// ============================================
// function loginStudent(), showStudentMain(), logoutStudent() removed - Replaced by checkAuthAndRoute()

// ============================================
// 학습목표/평가기준 로드
// ============================================
async function fetchCriteria(dateStr) {
  const data = await getObjectiveAndTask(dateStr);
  document.getElementById('objectiveText').textContent = data.objective || '등록된 학습목표가 없습니다.';
  document.getElementById('taskText').textContent = data.task || '등록된 평가과제가 없습니다.';
}
async function fetchRatingCriteria(dateStr) {
  const criteria = await getRatingCriteriaFromDB(dateStr);
  ratingCriteria = criteria; renderRatingItems(criteria);
}
function renderRatingItems(criteria) {
  const sec = document.getElementById('ratingSection'); const items = document.getElementById('ratingItems');
  if (!criteria || criteria.length === 0) { sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden'); items.innerHTML = ''; currentRatings = {};
  criteria.forEach((c, i) => {
    const d = document.createElement('div'); d.className = 'rating-item';
    const l = document.createElement('div'); l.className = 'rating-label'; l.textContent = (i + 1) + '. ' + c;
    const b = document.createElement('div'); b.className = 'rating-buttons';
    for (let s = 1; s <= 5; s++) { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'rating-btn'; btn.textContent = s; btn.onclick = () => selectRating(i, s, btn); b.appendChild(btn); }
    d.appendChild(l); d.appendChild(b); items.appendChild(d);
  });
}
function selectRating(idx, score, btn) { btn.parentElement.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); currentRatings[idx] = score; if (navigator.vibrate) navigator.vibrate(10); }
function clearRatingSelectionUI() {
  currentRatings = {};
  document.querySelectorAll('#ratingItems .rating-btn').forEach(b => b.classList.remove('selected'));
}
function applyExistingRatings(scores) {
  clearRatingSelectionUI();
  if (!scores) return;
  if (typeof scores === 'string') {
    try { scores = JSON.parse(scores); } catch (e) { return; }
  }
  if (scores && typeof scores === 'object' && scores.scores && typeof scores.scores === 'object') {
    scores = scores.scores;
  }
  if (!scores || typeof scores !== 'object') return;
  const rows = document.querySelectorAll('#ratingItems .rating-buttons');
  rows.forEach((row, idx) => {
    const raw = scores[String(idx)] ?? scores[idx] ?? scores[String(idx + 1)] ?? scores[idx + 1];
    const score = parseInt(raw, 10);
    if (score < 1 || score > 5) return;
    const btn = row.querySelectorAll('.rating-btn')[score - 1];
    if (!btn) return;
    btn.classList.add('selected');
    currentRatings[idx] = score;
  });
}
function insertTemplate(text, targetId = 'reviewContent') {
  const ta = document.getElementById(targetId);
  if (!ta) return;
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);
  ta.selectionStart = ta.selectionEnd = start + text.length;
  ta.focus();
  ta.scrollTop = ta.scrollHeight;
  if (targetId === 'reviewContent') updateCharCount();
}
function updateCharCount() {
  const len = document.getElementById('reviewContent').value.length;
  const counter = document.getElementById('charCount'); const submitBtn = document.getElementById('submitBtn');
  counter.textContent = len + '자 / 최소 100자';
  if (len >= 100) { counter.style.color = 'var(--color-eval)'; submitBtn.classList.add('ready'); submitBtn.classList.remove('not-ready'); }
  else { counter.style.color = 'var(--text-sub)'; submitBtn.classList.remove('ready'); submitBtn.classList.add('not-ready'); }
}

// ============================================
// 평가 대상 그리드
// ============================================
async function loadEvalTargetGrid() {
  const date = document.getElementById('reviewDate').value;
  const [completed, settings] = await Promise.all([getCompletedTargets(date, currentStudent.id, currentStudent.type), getClassSettings()]);
  const max = currentStudent.type === 'group' ? settings.groupCount : settings.studentCount;
  renderTargetGrid(max, currentStudent.id, completed, currentStudent.type);
}
let targetSelectionRequestSeq = 0;
function renderTargetGrid(maxCount, myId, completedList, type) {
  const grid = document.getElementById('targetGrid'); grid.innerHTML = '';
  const doneCount = completedList.length; const total = maxCount - 1;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  document.getElementById('progressText').textContent = '평가 진행: ' + doneCount + ' / ' + total + '명 완료 (' + pct + '%)';
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('targetId').value = '';
  clearRatingSelectionUI();
  targetSelectionRequestSeq++;
  for (let i = 1; i <= maxCount; i++) {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.textContent = type === 'group' ? i + '모둠' : i + '번'; btn.className = 'target-btn';
    if (String(i) === String(myId)) { btn.classList.add('disabled'); btn.title = '자기 자신은 평가할 수 없습니다'; }
    else if (completedList.includes(String(i))) { btn.classList.add('done'); btn.title = '이미 평가 완료 (클릭하면 수정)'; btn.onclick = () => selectTarget(i, btn); }
    else { btn.onclick = () => selectTarget(i, btn); }
    grid.appendChild(btn);
  }
}
async function selectTarget(id, button) {
  document.querySelectorAll('.target-btn.selected').forEach(b => b.classList.remove('selected'));
  button.classList.add('selected');
  document.getElementById('targetId').value = id;
  clearRatingSelectionUI();
  const requestSeq = ++targetSelectionRequestSeq;
  if (!currentStudent) return;
  try {
    const date = document.getElementById('reviewDate').value;
    const { data: typedRows } = await db.from('reviews')
      .select('scores_json')
      .eq('class_code', currentClassCode)
      .eq('review_date', date)
      .eq('reviewer_id', String(currentStudent.id))
      .eq('target_id', String(id))
      .eq('review_type', currentStudent.type)
      .limit(1);

    let existing = (typedRows && typedRows.length > 0) ? typedRows[0] : null;

    // Legacy fallback: old rows may not have review_type.
    if (!existing) {
      const { data: legacyRows } = await db.from('reviews')
        .select('scores_json')
        .eq('class_code', currentClassCode)
        .eq('review_date', date)
        .eq('reviewer_id', String(currentStudent.id))
        .eq('target_id', String(id))
        .limit(1);
      existing = (legacyRows && legacyRows.length > 0) ? legacyRows[0] : null;
    }

    // Final fallback: class_code mismatch in old demo data.
    if (!existing) {
      const { data: looseRows } = await db.from('reviews')
        .select('scores_json')
        .eq('review_date', date)
        .eq('reviewer_id', String(currentStudent.id))
        .eq('target_id', String(id))
        .limit(1);
      existing = (looseRows && looseRows.length > 0) ? looseRows[0] : null;
    }

    if (requestSeq !== targetSelectionRequestSeq) return;
    if (existing && existing.scores_json) applyExistingRatings(existing.scores_json);
  } catch (error) {
    console.warn('Failed to load saved scores for target:', error);
  }
}

// ============================================
// 평가 제출
// ============================================
document.getElementById('reviewForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isDemoMode) { showDemoBlockModal(); return; }
  const btn = document.getElementById('submitBtn'); const msg = document.getElementById('submitMsg');
  const data = { class_code: currentClassCode, review_date: document.getElementById('reviewDate').value, reviewer_id: String(currentStudent.id), target_id: document.getElementById('targetId').value, review_content: document.getElementById('reviewContent').value, scores_json: { criteria: ratingCriteria, scores: currentRatings }, review_type: currentStudent.type, reviewer_email: '' };
  if (!data.target_id) { showMsg(msg, '평가 대상을 선택해주세요.', 'error'); return; }
  if (data.reviewer_id === data.target_id) { showMsg(msg, '자기 자신/모둠은 평가할 수 없습니다.', 'error'); return; }
  if (data.review_content.trim().length < 100) { showMsg(msg, '피드백은 최소 100자 이상 입력해주세요.', 'error'); return; }
  if (ratingCriteria.length > 0 && Object.keys(currentRatings).length !== ratingCriteria.length) { showMsg(msg, '모든 평가 기준에 점수를 선택해주세요.', 'error'); return; }
  setLoading(true, btn, '확인 중...');
  const { data: existing } = await db.from('reviews').select('review_content').eq('class_code', currentClassCode).eq('review_date', data.review_date).eq('reviewer_id', data.reviewer_id).eq('target_id', data.target_id).eq('review_type', data.review_type).maybeSingle();
  if (existing) {
    setLoading(false, btn, '평가 제출하기');
    showModal({
      type: 'confirm', icon: '⚠️', title: '이미 평가한 대상입니다',
      message: data.target_id + '번에게 이미 평가를 제출했습니다.<br><br><div style="background:var(--bg-soft);padding:10px;border-radius:8px;font-size:0.85rem;text-align:left;max-height:80px;overflow-y:auto;margin-bottom:10px;">"' + existing.review_content.substring(0, 60) + (existing.review_content.length > 60 ? '...' : '') + '"</div><strong>새 내용으로 덮어쓰시겠습니까?</strong>',
      onConfirm: () => doSubmitReview(data, btn, msg)
    });
  } else { await doSubmitReview(data, btn, msg); }
});
async function doSubmitReview(data, btn, msg) {
  setLoading(true, btn, '제출 중...');
  const { error } = await db.from('reviews').upsert(data, { onConflict: 'class_code,review_date,reviewer_id,target_id,review_type' });
  setLoading(false, btn, '평가 제출하기');
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, '성공적으로 제출되었습니다!', 'success');
  const savedDate = document.getElementById('reviewDate').value;
  document.getElementById('reviewForm').reset();
  clearRatingSelectionUI();
  document.getElementById('reviewerId').value = currentStudent.id;
  document.getElementById('reviewDate').value = savedDate;
  document.getElementById('targetId').value = ''; updateCharCount();
  await loadEvalTargetGrid();
  // 자동으로 다음 미완료 대상 선택
  const nextBtn = document.querySelector('.target-btn:not(.done):not(.disabled):not(.selected)');
  if (nextBtn) { nextBtn.click(); nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else { document.getElementById('targetGrid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

// ============================================
// 학생 결과 조회
// ============================================
async function viewMyResult() {
  const date = document.getElementById('viewDate').value;
  const btn = document.getElementById('viewResultBtn'); const msg = document.getElementById('viewMsg');
  setLoading(true, btn, '확인 중...'); document.getElementById('resultArea').classList.add('hidden');
  const { data: reviews, error: reviewsError } = await db.from('reviews').select('*').eq('class_code', currentClassCode).eq('review_date', date).eq('target_id', String(currentStudent.id)).eq('review_type', currentStudent.type);
  if (reviewsError) { setLoading(false, btn, '내 결과 확인하기'); showMsg(msg, '결과 조회 중 오류: ' + reviewsError.message, 'error'); return; }
  if (!reviews || reviews.length === 0) { setLoading(false, btn, '내 결과 확인하기'); showMsg(msg, '해당 날짜(' + date + ')에 받은 평가가 없습니다.', 'error'); return; }
  const { data: allReviews, error: allReviewsError } = await db.from('reviews').select('target_id, scores_json').eq('class_code', currentClassCode).eq('review_date', date).eq('review_type', currentStudent.type);
  if (allReviewsError) { setLoading(false, btn, '내 결과 확인하기'); showMsg(msg, '통계 조회 중 오류: ' + allReviewsError.message, 'error'); return; }
  const myScoresArray = reviews.map(r => r.scores_json).filter(s => s && s.criteria);
  const myAvgScores = calculateAverageScores(myScoresArray);
  const allStudentScores = {};
  (allReviews || []).forEach(r => { if (!allStudentScores[r.target_id]) allStudentScores[r.target_id] = []; if (r.scores_json && r.scores_json.criteria) allStudentScores[r.target_id].push(r.scores_json); });
  const globalAvg = {};
  Object.values(allStudentScores).forEach(arr => { calculateAverageScores(arr).forEach(item => { if (!globalAvg[item.criterion]) globalAvg[item.criterion] = { sum: 0, count: 0 }; globalAvg[item.criterion].sum += item.average; globalAvg[item.criterion].count++; }); });
  const classAvgScores = Object.keys(globalAvg).map(k => ({ criterion: k, average: globalAvg[k].count > 0 ? globalAvg[k].sum / globalAvg[k].count : 0 }));
  const reviewTexts = reviews.map(r => r.review_content);
  const summary = await generateSummary(reviewTexts);
  setLoading(false, btn, '내 결과 확인하기');
  document.getElementById('resultArea').classList.remove('hidden');
  let totalAvg = 0; if (myAvgScores.length > 0) totalAvg = (myAvgScores.reduce((a, i) => a + i.average, 0) / myAvgScores.length).toFixed(2);
  let classAvg = 0; if (classAvgScores.length > 0) classAvg = (classAvgScores.reduce((a, i) => a + i.average, 0) / classAvgScores.length).toFixed(2);
  document.getElementById('statsSummary').innerHTML = '<div class="stat-card"><span class="stat-number">' + reviews.length + '명</span><span class="stat-label">평가 참여 인원</span></div><div class="stat-card"><span class="stat-number">' + totalAvg + '</span><span class="stat-label">나의 평균 점수</span></div><div class="stat-card blue"><span class="stat-number">' + classAvg + '</span><span class="stat-label">우리 반 평균 점수</span></div>';
  const chartContainer = document.getElementById('chartContainer'); const barChart = document.getElementById('barChart');
  if (myAvgScores.length > 0) {
    chartContainer.classList.remove('hidden');
    const classAvgMap = {}; classAvgScores.forEach(item => { classAvgMap[item.criterion] = item.average; });
    let chartHtml = '';
    myAvgScores.forEach((item, i) => {
      const myPct = (item.average / 5) * 100; const cAvg = classAvgMap[item.criterion] || 0; const classPct = (cAvg / 5) * 100;
      chartHtml += '<div class="bar-item"><div class="bar-label">' + item.criterion + '</div><div style="flex:1;"><div class="bar-track" style="margin-bottom:4px;"><div class="bar-fill color-' + (i % 6) + '" style="width:0%;" data-width="' + myPct + '%"></div></div><div class="bar-track" style="height:16px;opacity:0.8;"><div class="bar-fill" style="width:0%;background:var(--text-sub);opacity:0.6;" data-width="' + classPct + '%"></div></div></div><div class="bar-value">' + item.average.toFixed(1) + '<div style="font-size:0.7rem;color:var(--text-sub);">반 평균 ' + cAvg.toFixed(1) + '</div></div></div>';
    });
    chartHtml += '<div style="display:flex;gap:20px;justify-content:center;margin-top:15px;font-size:0.8rem;color:var(--text-sub);"><span style="color:var(--text-main);font-weight:600;">■ 내 점수</span><span style="color:var(--text-sub);font-weight:600;">■ 반 평균</span></div>';
    barChart.innerHTML = chartHtml;
    setTimeout(() => { document.querySelectorAll('.bar-fill').forEach(bar => { bar.style.width = bar.dataset.width; }); }, 100);
  } else { chartContainer.classList.remove('hidden'); barChart.innerHTML = '<div class="empty-state"><span class="empty-icon">📭</span><div class="empty-title">아직 받은 평가가 없어요</div><div class="empty-desc">친구들의 평가가 등록되면<br>여기에 점수가 표시됩니다.</div></div>'; }
  const el = document.getElementById('mySummary');
  el.innerHTML = formatMarkdown(summary);
  while (el.firstChild && (el.firstChild.nodeName === 'BR' || (el.firstChild.nodeType === 3 && !el.firstChild.textContent.replace(/\s/g, '')) || (el.firstChild.nodeType === 1 && !el.firstChild.textContent.replace(/\s/g, '') && el.firstChild.nodeName !== 'HR'))) {
    el.firstChild.remove();
  }
  if (el.firstElementChild) el.firstElementChild.style.marginTop = '0';
}

// ============================================
// Gemini AI
// ============================================
function repairMojibakeText(text) {
  if (!text || typeof text !== 'string') return text;

  let hasSuspicious = false;
  let allLatin1 = true;
  let nonAsciiCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 127) nonAsciiCount++;
    if (code > 255) {
      allLatin1 = false;
      break;
    }
    if ((code >= 0x00C0 && code <= 0x00FF) || code === 0x20AC || code === 0x2122 || code === 0x0153) {
      hasSuspicious = true;
    }
  }

  if (!hasSuspicious || !allLatin1 || nonAsciiCount === 0) return text;

  try {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    const fixed = new TextDecoder('utf-8').decode(bytes);

    const hangulCount = s => (s.match(/[가-힣]/g) || []).length;
    const latinNoiseCount = s => {
      let n = 0;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0x00C0 && c <= 0x00FF) n++;
      }
      return n;
    };

    if (hangulCount(fixed) >= hangulCount(text) && latinNoiseCount(fixed) <= latinNoiseCount(text)) {
      return fixed;
    }
  } catch (e) {}

  return text;
}

async function callGemini(promptText, config = {}) {
  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptText,
        ...(config.generationConfig ? { generationConfig: config.generationConfig } : {})
      })
    });
    const data = await res.json().catch(() => null);
    const apiError = repairMojibakeText(data?.error || '');
    const apiText = repairMojibakeText(data?.text || '');

    if (!res.ok || !data?.ok) {
      const code = data?.code || 'provider_error';
      if (code === 'auth_error') return { ok: false, code, error: apiError || 'AI authentication error.' };
      if (code === 'quota_exceeded') return { ok: false, code, error: 'AI 사용량 초과: 잠시 후 다시 시도해 주세요.' };
      if (code === 'network_error') return { ok: false, code, error: '네트워크 오류: 연결 상태를 확인해 주세요.' };
      return { ok: false, code, error: apiError || ('HTTP ' + res.status) };
    }

    const text = apiText;
    return text ? { ok: true, text } : { ok: false, code: 'empty_response', error: 'AI 응답이 비어 있습니다.' };
  } catch (e) {
    return { ok: false, code: 'network_error', error: '네트워크 오류: 연결 상태를 확인해 주세요.' };
  }
}
async function generateSummary(reviews) {
  if (!reviews || reviews.length === 0) return '요약할 리뷰 데이터가 없습니다.';
  const prompt = '역할: 객관적이고 명확한 피드백을 주는 선생님\n목표: 동료 평가 데이터(주관식 피드백)를 분석하여 핵심만 간결하게 전달하기\n\n중요: 아래 리뷰 데이터는 친구들이 작성한 주관식 피드백입니다. 점수와 관련된 내용은 절대 언급하지 마세요.\n\n요구사항:\n1. 편지글 형식이나 인삿말 절대 금지. 바로 본론으로 시작할 것.\n2. 오직 아래 두 가지 헤더로만 구성할 것.\n   ## 칭찬해 주고 싶은 점\n   ## 앞으로를 위한 조언\n3. 칭찬해 주고 싶은 점: 긍정적인 피드백을 요약하여 바로 첫 줄부터 내용을 작성.\n4. 앞으로를 위한 조언: 아쉬운 점을 부드럽고 건설적인 문장(해요체)으로 순화하여 바로 첫 줄부터 내용을 작성.\n5. 점수나 수치와 관련된 내용은 절대 포함하지 말 것.\n6. 각 헤더 바로 다음 줄에 빈 줄 없이 내용을 시작할 것. 7. 응답 맨 첫 줄에 빈 줄이나 공백 없이 바로 내용을 시작할 것.\n\n--- 리뷰 데이터 ---\n' + reviews.join('\n');
  const result = await callGemini(prompt, { generationConfig: { temperature: 0.4, maxOutputTokens: 2048 } });
  return result.ok ? result.text : 'AI summary failed [' + (result.code || 'unknown') + ']: ' + (result.error || 'No details');
}

// ============================================
// 교사 로그인
// ============================================
// function loginTeacher(), teacherLogout() removed - Replaced by checkAuthAndRoute()

// ============================================
// 교사 - 전체 현황
// ============================================
async function loadTeacherData() {
  try {
    const dateEl = document.getElementById('teacherDate');
    if (!dateEl) return;
    const date = dateEl.value;

    const typeChecked = document.querySelector('input[name="teacherEvalType"]:checked');
    const type = typeChecked ? typeChecked.value : 'individual';
    document.getElementById('rankingTable').innerHTML = '<p style="text-align:center;">데이터 불러오는 중...</p>';
    const results = await Promise.allSettled([getClassSettings(), db.from('reviews').select('*').eq('class_code', currentClassCode).eq('review_date', date).eq('review_type', type)]);
    const settings = results[0].status === 'fulfilled' ? results[0].value : { studentCount: 30, groupCount: 6 };
    const reviewsResult = results[1].status === 'fulfilled' ? results[1].value : { data: [] };
    const totalStudents = type === 'group' ? settings.groupCount : settings.studentCount;
    const reviews = reviewsResult.data || [];
    const stats = {}; const allCriteriaSet = new Set();
    reviews.forEach(row => {
      const tid = row.target_id; if (!stats[tid]) stats[tid] = { total: 0, count: 0, criteria: {} };
      const parsed = row.scores_json;
      if (parsed && parsed.criteria && parsed.scores) {
        let rowSum = 0, rowCnt = 0;
        parsed.criteria.forEach((c, index) => { if (!c || String(c).trim() === '') return; allCriteriaSet.add(c); const s = parseInt(parsed.scores[String(index)]) || 0; rowSum += s; rowCnt++; if (!stats[tid].criteria[c]) stats[tid].criteria[c] = { sum: 0, count: 0 }; stats[tid].criteria[c].sum += s; stats[tid].criteria[c].count++; });
        if (rowCnt > 0) { stats[tid].total += (rowSum / rowCnt); stats[tid].count++; }
      }
    });
    const allCriteriaList = Array.from(allCriteriaSet);
    const ranking = Object.keys(stats).map(id => { const s = stats[id]; const csm = {}; allCriteriaList.forEach(c => { csm[c] = (s.criteria[c] && s.criteria[c].count > 0) ? s.criteria[c].sum / s.criteria[c].count : 0; }); return { studentId: id, totalAvg: s.count > 0 ? s.total / s.count : 0, count: s.count, criteriaScores: csm }; });
    ranking.sort((a, b) => b.totalAvg - a.totalAvg); ranking.forEach((r, i) => r.rank = i + 1);
    const students = Object.keys(stats).sort((a, b) => parseInt(a) - parseInt(b));
    document.querySelectorAll('#rankingMiniTab .chart-container').forEach(el => el.remove());
    await renderTeacherDashboard({ ranking, students }, totalStudents);
    renderRankingTable(ranking, allCriteriaList, type);
    renderStudentSelector(students);
    document.getElementById('studentReviews').innerHTML = '';
  } catch (err) {
    console.warn('loadTeacherData 오류:', err);
    document.getElementById('rankingTable').innerHTML = '<p style="text-align:center;color:var(--text-sub);">데이터를 불러오는 중 오류가 발생했습니다. 새로고침해 주세요.</p>';
  }
}
async function renderTeacherDashboard(data, totalStudents) {
  const d = document.getElementById('teacherDashboard');
  try {
    const evaluated = data.students.length;
    let totalAvg = 0; if (data.ranking.length > 0) totalAvg = (data.ranking.reduce((a, r) => a + r.totalAvg, 0) / data.ranking.length).toFixed(2);
    const totalReviews = data.ranking.reduce((a, r) => a + r.count, 0);
    const participation = totalStudents > 0 ? Math.round((evaluated / totalStudents) * 100) : 0;
    // 오늘 성장 일기 작성률 및 메시지 수 조회
    let diaryCount = 0, msgCount = 0;
    try {
      const today = getDefaultQueryDate();
      const [diaryRes, msgRes] = await Promise.allSettled([
        db.from('daily_reflections').select('student_id', { count: 'exact', head: true }).eq('class_code', currentClassCode).eq('reflection_date', today),
        db.from('teacher_messages').select('id', { count: 'exact', head: true }).eq('class_code', currentClassCode).eq('has_reply', false)
      ]);
      diaryCount = diaryRes.status === 'fulfilled' && diaryRes.value.count ? diaryRes.value.count : 0;
      msgCount = msgRes.status === 'fulfilled' && msgRes.value.count ? msgRes.value.count : 0;
    } catch (subErr) { console.warn('대시보드 부가 데이터 조회 오류:', subErr); }
    const diaryPct = totalStudents > 0 ? Math.round((diaryCount / totalStudents) * 100) : 0;
    d.innerHTML = '<div class="stat-card"><span class="stat-number">' + participation + '%</span><span class="stat-label">평가 참여율 (' + evaluated + '/' + totalStudents + ')</span></div><div class="stat-card blue"><span class="stat-number">' + totalAvg + '</span><span class="stat-label">전체 평균 점수</span></div><div class="stat-card" style="border-left-color:var(--color-teal);"><span class="stat-number" style="color:var(--color-teal);">' + totalReviews + '건</span><span class="stat-label">총 평가 수</span></div><div class="stat-card" style="border-left-color:var(--color-rose);"><span class="stat-number" style="color:var(--color-rose);">' + diaryPct + '%</span><span class="stat-label">오늘 일기 작성률 (' + diaryCount + '/' + totalStudents + ')</span></div>' + (msgCount > 0 ? '<div class="stat-card" style="border-left-color:#e67e22;"><span class="stat-number" style="color:#e67e22;">' + msgCount + '건</span><span class="stat-label">미답변 메시지</span></div>' : '');
  } catch (err) {
    console.warn('renderTeacherDashboard 오류:', err);
    d.innerHTML = '<div class="stat-card"><span class="stat-number">-</span><span class="stat-label">데이터 로드 실패</span></div>';
  }
}
function renderRankingTable(ranking, criteria, type) {
  const container = document.getElementById('rankingTable');
  if (!ranking || ranking.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-sub);">해당 날짜의 평가 데이터가 없습니다.</p>'; return; }
  const idHeader = type === 'group' ? '모둠' : '번호';
  let html = '<table class="ranking-table"><thead><tr><th>등수</th><th>' + idHeader + '</th><th>총점 평균</th>';
  if (criteria) criteria.forEach(c => html += '<th>' + c + '</th>');
  html += '<th>평가 수</th></tr></thead><tbody>';
  ranking.forEach(st => {
    let medal = '', rankClass = '';
    if (st.rank === 1) { medal = '🥇'; rankClass = 'rank-1'; } else if (st.rank === 2) { medal = '🥈'; rankClass = 'rank-2'; } else if (st.rank === 3) { medal = '🥉'; rankClass = 'rank-3'; }
    html += '<tr class="' + rankClass + '"><td><span class="rank-medal">' + medal + '</span>' + st.rank + '등</td><td><strong>' + st.studentId + '</strong></td><td style="color:var(--color-result);font-weight:bold;">' + st.totalAvg.toFixed(2) + '</td>';
    if (criteria) criteria.forEach(c => { let s = st.criteriaScores[c]; html += '<td>' + (typeof s === 'number' ? s.toFixed(2) : '-') + '</td>'; });
    html += '<td>' + st.count + '</td></tr>';
  }); html += '</tbody></table>'; container.innerHTML = html;
  renderScoreDistribution(ranking, type);
}
function renderScoreDistribution(ranking, type) {
  const bins = [0, 0, 0, 0, 0];
  const binLabels = ['1\uC810\uB300', '2\uC810\uB300', '3\uC810\uB300', '4\uC810\uB300', '5\uC810\uB300'];
  ranking.forEach(r => {
    const avg = r.totalAvg;
    if (avg >= 4.5) bins[4]++;
    else if (avg >= 3.5) bins[3]++;
    else if (avg >= 2.5) bins[2]++;
    else if (avg >= 1.5) bins[1]++;
    else bins[0]++;
  });

  const maxBin = Math.max(...bins, 1);
  const colorPairs = [
    ['#C96D6D', '#E29A7D'],
    ['#C78B4A', '#E4BF79'],
    ['#5FA584', '#8CCDA9'],
    ['#4B88B7', '#79B4DC'],
    ['#7566C9', '#A191E5']
  ];

  let h = '<div class="chart-container" style="border-left-color:var(--color-blue);margin-top:20px;"><h4 style="color:var(--color-blue);">' + (type === 'group' ? '\uBAA8\uB46C' : '\uAC1C\uC778') + ' \uD3C9\uADE0 \uC810\uC218 \uBD84\uD3EC</h4><div class="bar-chart">';
  binLabels.forEach((label, i) => {
    const pct = (bins[i] / maxBin) * 100;
    const pair = colorPairs[i] || colorPairs[0];
    h += '<div class="bar-item"><div class="bar-label">' + label + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:linear-gradient(90deg,' + pair[0] + ' 0%,' + pair[1] + ' 100%);"></div></div><div class="bar-value">' + bins[i] + '\uBA85</div></div>';
  });
  h += '</div></div>';
  document.getElementById('rankingTable').insertAdjacentHTML('afterend', h);
}
function renderStudentSelector(students) {
  const container = document.getElementById('studentSelector'); container.innerHTML = '';
  students.forEach(sid => { const btn = document.createElement('button'); btn.className = 'student-btn'; btn.textContent = sid; btn.onclick = () => loadStudentReviews(sid, btn); container.appendChild(btn); });
}
async function loadStudentReviews(studentId, button) {
  const date = document.getElementById('teacherDate').value;
  const type = document.querySelector('input[name="teacherEvalType"]:checked').value;
  document.querySelectorAll('.student-btn').forEach(b => b.classList.remove('active')); button.classList.add('active');
  const container = document.getElementById('studentReviews'); container.innerHTML = '<p style="text-align:center;">불러오는 중...</p>';
  const { data: reviews } = await db.from('reviews').select('*').eq('class_code', currentClassCode).eq('review_date', date).eq('target_id', String(studentId)).eq('review_type', type);
  if (!reviews || reviews.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-sub);">평가 데이터가 없습니다.</p>'; return; }
  let html = '<h3>' + studentId + '번에 대한 평가 (총 ' + reviews.length + '개)</h3>';
  reviews.forEach(r => {
    html += '<div class="review-card"><div class="review-header"><span><strong>평가자:</strong> ' + r.reviewer_id + '</span><span>' + r.review_date + '</span></div><div class="review-content">' + r.review_content + '</div>';
    if (r.scores_json && r.scores_json.criteria) {
      html += '<div class="review-scores">';
      r.scores_json.criteria.forEach((c, idx) => { html += '<div class="review-score-item"><div style="font-weight:bold;margin-bottom:3px;font-size:0.75rem;">' + c + '</div><div style="color:var(--primary);font-weight:bold;">' + (r.scores_json.scores[String(idx)] || '-') + '점</div></div>'; });
      html += '</div>';
    }
    html += '</div>';
  }); container.innerHTML = html;
}

// ============================================
// 교사 설정
// ============================================
async function loadClassSettingsUI() {
  const settings = await getClassSettings();
  document.getElementById('settingStudentCount').value = settings.studentCount;
  document.getElementById('settingGroupCount').value = settings.groupCount;

  // 학급 정보 로드
  const info = await getClassInfo();
  if (info) {
    document.getElementById('settingClassName').value = info.class_name || '';
    document.getElementById('settingClassCode').value = info.class_code || '';
  }
}
function saveClassInfo(btn) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const newName = document.getElementById('settingClassName').value.trim();
  const newCode = document.getElementById('settingClassCode').value.replace(/\s/g, '');

  if (!newName || !newCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 확인', message: '학급명과 클래스 코드를 모두 입력해주세요.' });
    return;
  }

  const isCodeChanged = (newCode !== currentClassCode);
  const msg = isCodeChanged
    ? `학급 정보와 <strong>클래스 코드</strong>를 변경하시겠습니까?<br><span style="color:var(--color-danger);font-size:0.8rem;">* 코드를 변경하면 기존 학생들도 새 코드로 다시 접속해야 합니다.</span>`
    : `학급 정보를 변경하시겠습니까?`;

  showModal({
    type: 'confirm', icon: '📋', title: '학급 정보 변경', message: msg,
    onConfirm: async () => {
      setLoading(true, btn, '저장 중...');
      try {
        const { data: { user } } = await db.auth.getUser();

        // 1. 클래스 테이블 업데이트
        const { error: clsError } = await db.from('classes')
          .update({ class_name: newName, class_code: newCode })
          .eq('class_code', currentClassCode);

        if (clsError) throw clsError;

        // 2. 만약 코드가 바뀌었다면 프로필도 업데이트
        if (isCodeChanged) {
          await db.from('user_profiles')
            .update({ class_code: newCode, class_name: newName })
            .eq('google_uid', user.id)
            .eq('role', 'teacher');
        } else {
          await db.from('user_profiles')
            .update({ class_name: newName })
            .eq('google_uid', user.id)
            .eq('role', 'teacher');
        }

        setLoading(false, btn, '💾 학급 정보 저장하기');
        showModal({
          type: 'alert', icon: '✅', title: '저장 완료',
          message: '학급 정보가 변경되었습니다.' + (isCodeChanged ? ' 페이지를 새로고침합니다.' : ''),
          onConfirm: () => { if (isCodeChanged) window.location.reload(); }
        });
      } catch (err) {
        setLoading(false, btn, '💾 학급 정보 저장하기');
        showModal({ type: 'alert', icon: '❌', title: '오류', message: '변경 중 오류가 발생했습니다: ' + err.message });
      }
    }
  });
}
function saveClassSettingsUI(btn) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const sc = parseInt(document.getElementById('settingStudentCount').value) || 30;
  const gc = parseInt(document.getElementById('settingGroupCount').value) || 6;
  showModal({
    type: 'confirm', icon: '🏫', title: '반 구성 변경', message: '학생 <strong>' + sc + '명</strong>, 모둠 <strong>' + gc + '개</strong>로 설정하시겠습니까?',
    onConfirm: async () => {
      setLoading(true, btn, '저장 중...');
      await db.from('classes').update({ student_count: sc, group_count: gc }).eq('class_code', currentClassCode);
      setLoading(false, btn, '💾 반 구성 저장하기');
      showModal({ type: 'alert', icon: '✅', title: '저장 완료', message: '학생 ' + sc + '명, 모둠 ' + gc + '개로 설정되었습니다.' });
      loadStudentMappingData();
    }
  });
}
async function loadStudentMappingData() {
  const grid = document.getElementById('studentMappingGrid');
  grid.innerHTML = '<p>로딩 중...</p>';
  // 학급의 학생 수 가져오기
  const { data: classData } = await db.from('classes').select('student_count').eq('class_code', currentClassCode).maybeSingle();
  const studentCount = classData ? classData.student_count : 30;
  // 등록된 학생 프로필 가져오기
  const { data: profiles } = await db.from('user_profiles')
    .select('id, student_number, google_email')
    .eq('class_code', currentClassCode)
    .eq('role', 'student')
    .order('student_number');
  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.student_number] = p; });
  grid.innerHTML = '';
  for (let i = 1; i <= studentCount; i++) {
    const p = profileMap[i];
    if (p) {
      const emailShort = p.google_email ? (p.google_email.length > 20 ? p.google_email.substring(0, 18) + '...' : p.google_email) : '(이메일 없음)';
      grid.innerHTML += '<div class="student-auth-item" style="display:flex; align-items:center; gap:6px;">'
        + '<label style="min-width:45px; margin:0;">' + i + '번</label>'
        + '<span style="flex:1; font-size:0.8rem; color:var(--primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + (p.google_email || '') + '">' + emailShort + '</span>'
        + '<button onclick="removeStudentMapping(\'' + p.id + '\', ' + i + ')" style="width:auto; padding:4px 10px; font-size:0.75rem; background:var(--color-danger); color:white; margin:0; box-shadow:none;">해제</button>'
        + '</div>';
    } else {
      grid.innerHTML += '<div class="student-auth-item" style="display:flex; align-items:center; gap:6px;">'
        + '<label style="min-width:45px; margin:0;">' + i + '번</label>'
        + '<span style="flex:1; font-size:0.8rem; color:var(--text-sub);">미등록</span>'
        + '</div>';
    }
  }
}
function removeStudentMapping(profileId, num) {
  showModal({
    type: 'confirm', icon: '⚠️', title: '번호 등록 해제',
    message: '<strong>' + num + '번</strong> 학생의 등록을 해제하시겠습니까?<br><span style="font-size:0.85rem; color:var(--text-sub);">해당 학생은 다시 온보딩을 진행해야 합니다.</span>',
    onConfirm: async () => {
      await db.from('user_profiles').delete().eq('id', profileId);
      showModal({ type: 'alert', icon: '✅', title: '해제 완료', message: num + '번 학생의 등록이 해제되었습니다.' });
      loadStudentMappingData();
    }
  });
}
async function loadCriteriaForEdit() {
  const date = document.getElementById('settingDate').value;
  const evalType = document.getElementById('autoTargetSelect').value || 'individual';
  const [objTask, ratings] = await Promise.all([getObjectiveAndTask(date), getRatingCriteriaFull(date, evalType)]);
  document.getElementById('settingObjective').value = objTask.objective || '';
  document.getElementById('settingTask').value = objTask.task || '';
  for (let i = 0; i < 6; i++) { document.getElementById('settingRate' + (i + 1)).value = ratings[i] || ''; document.getElementById('autoRate' + (i + 1)).value = ratings[i] || ''; }
}
async function saveBasicInfo(btn) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const date = document.getElementById('settingDate').value;
  const obj = document.getElementById('settingObjective').value;
  const task = document.getElementById('settingTask').value;
  if (!obj || !task) { showModal({ type: 'alert', icon: '⚠️', title: '입력 확인', message: '학습목표와 평가과제를 모두 입력해주세요.' }); return; }
  setLoading(true, btn, '저장 중...');
  await db.from('objectives').upsert({ class_code: currentClassCode, eval_date: date, objective: obj }, { onConflict: 'class_code,eval_date' });
  await db.from('tasks').upsert({ class_code: currentClassCode, eval_date: date, task: task }, { onConflict: 'class_code,eval_date' });
  setLoading(false, btn, '💾 1단계: 학습목표 및 평가과제 저장하기');
  showModal({ type: 'alert', icon: '✅', title: '저장 완료', message: '기본 정보가 저장되었습니다.' });
}
async function saveDailyCriteria(btn) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const date = document.getElementById('settingDate').value;
  const obj = document.getElementById('settingObjective').value;
  const task = document.getElementById('settingTask').value;
  const isAutoMode = !document.getElementById('autoCriteriaArea').classList.contains('hidden');
  const prefix = isAutoMode ? 'autoRate' : 'settingRate';
  const r = []; for (let i = 1; i <= 6; i++) r.push(document.getElementById(prefix + i).value);
  setLoading(true, btn, '저장 중...');
  await db.from('objectives').upsert({ class_code: currentClassCode, eval_date: date, objective: obj }, { onConflict: 'class_code,eval_date' });
  await db.from('tasks').upsert({ class_code: currentClassCode, eval_date: date, task: task }, { onConflict: 'class_code,eval_date' });
  const evalType = document.getElementById('autoTargetSelect').value || 'individual';
  await db.from('rating_criteria').upsert({ class_code: currentClassCode, eval_date: date, eval_type: evalType, criteria_1: r[0], criteria_2: r[1], criteria_3: r[2], criteria_4: r[3], criteria_5: r[4], criteria_6: r[5] }, { onConflict: 'class_code,eval_date,eval_type' });
  setLoading(false, btn, '💾 3단계: 평가기준 저장하기');
  showModal({ type: 'alert', icon: '✅', title: '설정 완료', message: '평가 기준까지 모두 저장되었습니다.' });
  if (date === document.getElementById('reviewDate').value) { fetchCriteria(date); fetchRatingCriteria(date); }
}
function switchCriteriaMode(mode) {
  document.getElementById('manualCriteriaArea').classList.toggle('hidden', mode !== 'manual');
  document.getElementById('autoCriteriaArea').classList.toggle('hidden', mode !== 'auto');
  document.getElementById('manualModeBtn').classList.toggle('active-setting', mode === 'manual');
  document.getElementById('autoModeBtn').classList.toggle('active-setting', mode === 'auto');
}
function updateGradeOptions() {
  const sl = document.getElementById('autoSchoolLevel').value;
  const gs = document.getElementById('autoGradeSelect');
  gs.innerHTML = sl === '초등학교' ? '<option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option><option value="4학년">4학년</option><option value="5학년" selected>5학년</option><option value="6학년">6학년</option>' : '<option value="1학년" selected>1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option>';
}
function parseCriteriaFromAiText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  const base = rawText.trim();
  if (!base) return null;

  const candidates = [base];
  const fenced = base.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) candidates.push(fenced[1].trim());

  const start = base.indexOf('{');
  const end = base.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    candidates.push(base.substring(start, end + 1).trim());
  }

  const arrMatch = base.match(/"criteria"\s*:\s*\[([\s\S]*?)\]/i);
  if (arrMatch && arrMatch[1]) {
    candidates.push('{"criteria":[' + arrMatch[1] + ']}');
  }

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && Array.isArray(parsed.criteria) && parsed.criteria.length >= 6) {
        return parsed.criteria.map(v => String(v || '').trim()).filter(Boolean).slice(0, 6);
      }
      if (parsed && typeof parsed === 'object') {
        const keyed = [];
        for (let i = 1; i <= 6; i++) {
          const v = parsed['criteria_' + i] ?? parsed['criteria' + i] ?? parsed['criterion_' + i] ?? parsed['criterion' + i];
          if (typeof v === 'string' && v.trim()) keyed.push(v.trim());
        }
        if (keyed.length >= 6) return keyed.slice(0, 6);
      }
      if (Array.isArray(parsed) && parsed.length >= 6) {
        return parsed.map(v => String(v || '').trim()).filter(Boolean).slice(0, 6);
      }
    } catch (e) {}
  }

  const lineQuestions = base
    .split(/\r?\n/)
    .map(l => l.trim())
    .map(l => l.replace(/^[-*0-9.)\s]+/, ''))
    .filter(l => l && /[?]$/.test(l));

  if (lineQuestions.length >= 6) return lineQuestions.slice(0, 6);

  const lineItems = base
    .split(/\r?\n/)
    .map(l => l.trim())
    .map(l => l.replace(/^[-*0-9.)\s]+/, ''))
    .filter(l => l && l.length >= 4 && !l.startsWith('{') && !l.startsWith('['));
  if (lineItems.length >= 6) return lineItems.slice(0, 6);

  const quoted = [];
  const re = /"([^"\n]{4,})"/g;
  let m;
  while ((m = re.exec(base)) !== null) {
    const v = (m[1] || '').trim();
    if (v) quoted.push(v);
  }
  if (quoted.length >= 6) return quoted.slice(0, 6);

  const sentenceLike = base
    .split(/[.\n]/)
    .map(s => s.trim())
    .map(s => s.replace(/^[-*0-9.)\s]+/, ''))
    .filter(s => s.length >= 4)
    .filter(s => !s.startsWith('{') && !s.startsWith('[') && !s.includes('```'));
  if (sentenceLike.length >= 6) return sentenceLike.slice(0, 6);

  return null;
}

async function generateCriteriaAI(btn) {
  const date = document.getElementById('settingDate').value;
  const grade = document.getElementById('autoSchoolLevel').value + ' ' + document.getElementById('autoGradeSelect').value;
  const evalTarget = document.getElementById('autoTargetSelect').value;
  const objTask = await getObjectiveAndTask(date);

  if (!objTask.objective && !objTask.task) {
    showModal({
      type: 'alert',
      icon: '\u274C',
      title: '\uC624\uB958',
      message: "\uC800\uC7A5\uB41C \uD559\uC2B5\uBAA9\uD45C\uB098 \uACFC\uC81C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.<br><br>\uBA3C\uC800 '\uAE30\uBCF8 \uC815\uBCF4 \uC800\uC7A5' \uBC84\uD2BC\uC744 \uB20C\uB7EC\uC8FC\uC138\uC694."
    });
    return;
  }

  setLoading(true, btn, '\uD83E\uDD16 AI \uC0DD\uC131 \uC911...');
  const targetText = evalTarget === 'group' ? '\uBAA8\uB460' : '\uAC1C\uC778';

  const prompt =
    'You are an expert teacher assistant generating peer-evaluation criteria in Korean.\n\n' +
    'Input:\n' +
    '- Grade: ' + grade + '\n' +
    '- Evaluation target: ' + targetText + '\n' +
    '- Learning objective: ' + (objTask.objective || '(none)') + '\n' +
    '- Task: ' + (objTask.task || '(none)') + '\n\n' +
    'Rules:\n' +
    '1) Return exactly 6 criteria.\n' +
    '2) Keep each criterion as a short Korean question sentence.\n' +
    '3) Cover three groups with 2 items each: knowledge/understanding, process/skills, values/attitude.\n' +
    '4) Use easy Korean expressions for students.\n' +
    '5) Use the wording "friend" consistently.\\n\\n' +
    'Output format (strict JSON only, no markdown, no explanation):\n' +
    '{"criteria":["...","...","...","...","...","..."]}';

  const generationConfig = {
    temperature: 0.1,
    maxOutputTokens: 1024,
    responseMimeType: 'application/json'
  };

  const result = await callGemini(prompt, { generationConfig });
  setLoading(false, btn, '\uD83E\uDD16 2\uB2E8\uACC4: AI\uB85C \uAE30\uC900 \uC790\uB3D9 \uC0DD\uC131\uD558\uAE30');

  if (!result.ok) {
    showModal({ type: 'alert', icon: '\u274C', title: '\uC0DD\uC131 \uC2E4\uD328', message: result.error });
    return;
  }

  try {
    let criteria = parseCriteriaFromAiText(result.text);
    let retryResult = null;

    if (!criteria || criteria.length !== 6) {
      const retryPrompt = prompt + '\n\n[VERY IMPORTANT]\nReturn ONLY strict JSON with exactly 6 items.\n{"criteria":["...","...","...","...","...","..."]}\nNo explanation.';
      retryResult = await callGemini(retryPrompt, { generationConfig });
      if (retryResult.ok) {
        criteria = parseCriteriaFromAiText(retryResult.text);
      }
    }

    if (!criteria || criteria.length !== 6) {
      const rawPreview = String((retryResult && retryResult.ok ? retryResult.text : result.text) || '')
        .slice(0, 900)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      showModal({
        type: 'alert',
        icon: '\u274C',
        title: '\uD30C\uC2F1 \uC2E4\uD328',
        message: 'AI \uC751\uB2F5\uC744 \uD30C\uC2F1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.<br><br><small>AI raw response (preview)</small><pre style="max-height:220px;overflow:auto;white-space:pre-wrap;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-top:8px;text-align:left;">' + rawPreview + '</pre>'
      });
      return;
    }

    for (let i = 0; i < 6; i++) {
      const input = document.getElementById('autoRate' + (i + 1));
      input.value = criteria[i] || '';
      input.removeAttribute('readonly');
      input.removeAttribute('disabled');
    }

    showModal({
      type: 'alert',
      icon: '\u2728',
      title: 'AI \uC0DD\uC131 \uC644\uB8CC',
      message: '\uD3C9\uAC00\uAE30\uC900\uC774 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4.<br>\uB0B4\uC6A9\uC744 \uD655\uC778\uD558\uACE0 <strong>3\uB2E8\uACC4 \uCD5C\uC885 \uC800\uC7A5</strong>\uC744 \uB20C\uB7EC\uC8FC\uC138\uC694.'
    });
  } catch (e) {
    showModal({
      type: 'alert',
      icon: '\u274C',
      title: '\uD30C\uC2F1 \uC2E4\uD328',
      message: 'AI \uC751\uB2F5\uC744 \uD30C\uC2F1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'
    });
  }
}
function resetAllReviewData(btn) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  showModal({
    type: 'prompt', icon: '⚠️', title: '데이터 전체 초기화',
    message: '모든 학급 내 데이터가 영구적으로 삭제됩니다.<br>삭제하려면 아래 입력창에 <strong>초기화</strong>라고 입력하세요.',
    inputPlaceholder: '초기화',
    onConfirm: async (val) => {
      if (val === '초기화') {
        setLoading(true, btn, '초기화 중...');

        // 삭제할 테이블 리스트
        const tables = [
          'reviews',
          'daily_reflections',
          'praise_messages',
          'student_personality',
          'student_goals',
          'objectives',
          'tasks',
          'rating_criteria'
        ];

        try {
          // 각 테이블에서 현재 학급 코드에 해당하는 데이터 삭제
          const deletePromises = tables.map(table =>
            db.from(table).delete().eq('class_code', currentClassCode)
          );

          const results = await Promise.all(deletePromises);

          // 에러 체크
          const firstError = results.find(r => r.error)?.error;
          if (firstError) throw firstError;

          setLoading(false, btn, '학급 데이터 전체 초기화');
          showModal({
            type: 'alert',
            icon: '🗑️',
            title: '초기화 완료',
            message: '학급 내 모든 활동 데이터가 초기화되었습니다.'
          });
          loadTeacherData();
        } catch (err) {
          console.error('초기화 오류:', err);
          setLoading(false, btn, '학급 데이터 전체 초기화');
          showModal({
            type: 'alert',
            icon: '❌',
            title: '오류',
            message: '초기화 중 오류가 발생했습니다: ' + err.message
          });
        }
      }
      else showModal({ type: 'alert', icon: '🚫', title: '취소됨', message: '입력값이 일치하지 않아 취소되었습니다.' });
    }
  });
}

// ============================================
// 자기평가 (Self-Evaluation) 기능
// ============================================

// 메시지 모드 토글 (익명/실명)
function toggleMessageMode(mode) {
  const anonymousBtn = document.getElementById('anonymousBtn');
  const namedBtn = document.getElementById('namedBtn');
  const messageArea = document.getElementById('messageInputArea');
  const badge = document.getElementById('messageModeBadge');

  if (currentMessageMode === mode) {
    // 같은 버튼 다시 클릭 시 취소
    currentMessageMode = null;
    anonymousBtn.classList.remove('active');
    namedBtn.classList.remove('active');
    messageArea.classList.add('hidden');
  } else {
    currentMessageMode = mode;
    anonymousBtn.classList.toggle('active', mode === 'anonymous');
    namedBtn.classList.toggle('active', mode === 'named');
    messageArea.classList.remove('hidden');

    if (mode === 'anonymous') {
      badge.textContent = '익명으로 전달됩니다';
      badge.style.color = 'var(--color-teal)';
    } else {
      const studentName = currentStudent ? currentStudent.id + '번' : '나';
      badge.textContent = studentName + '(으)로 전달됩니다';
      badge.style.color = 'var(--color-blue)';
    }
  }
}

// 과목/활동 태그 토글
function toggleSubjectTag(tag) {
  const btnList = document.querySelectorAll('.subject-tag-btn');
  // 버튼 내부 텍스트에 태그가 포함되어 있는지 확인
  const tagBtn = Array.from(btnList).find(btn => btn.innerText.includes(tag));
  if (!tagBtn) return;

  if (selectedSubjectTags.includes(tag)) {
    selectedSubjectTags = selectedSubjectTags.filter(t => t !== tag);
    tagBtn.classList.remove('selected');
    if (tag === OTHER_SUBJECT_TAG) {
      syncCustomSubjectInputVisibility({ clearOnHide: true });
    }
  } else {
    selectedSubjectTags.push(tag);
    tagBtn.classList.add('selected');
    if (tag === OTHER_SUBJECT_TAG) {
      syncCustomSubjectInputVisibility({ focusOnShow: true });
    }
  }

  syncCustomSubjectInputVisibility();
  if (navigator.vibrate) navigator.vibrate(10);
}

// 데일리 자기평가 로드
async function loadDailyReflection() {
  if (!currentStudent || !currentClassCode) return;
  ensureCustomSubjectInput();

  let targetDate = document.getElementById('selfDate').value;
  if (!targetDate) {
    targetDate = getDefaultQueryDate();
    document.getElementById('selfDate').value = targetDate;
  }

  // 오늘 작성한 자기평가 있는지 확인
  const { data: reflection } = await db.from('daily_reflections')
    .select('*, teacher_messages(*)')
    .eq('class_code', currentClassCode)
    .eq('student_id', String(currentStudent.id))
    .eq('reflection_date', targetDate)
    .maybeSingle();

  if (reflection) {
    document.getElementById('learningText').value = reflection.learning_text || '';
    const savedTags = Array.isArray(reflection.subject_tags) ? reflection.subject_tags : [];
    const knownTags = savedTags.filter(tag => PRESET_SUBJECT_TAGS.includes(tag));
    const customTags = savedTags.filter(tag => !PRESET_SUBJECT_TAGS.includes(tag));
    selectedSubjectTags = [...knownTags];
    if (customTags.length > 0 && !selectedSubjectTags.includes(OTHER_SUBJECT_TAG)) {
      selectedSubjectTags.push(OTHER_SUBJECT_TAG);
    }
    const customInput = getCustomSubjectInputEl();
    if (customInput) customInput.value = customTags.join(', ');
  } else {
    // 기록이 없으면 폼 초기화
    document.getElementById('learningText').value = '';
    selectedSubjectTags = [];
    const customInput = getCustomSubjectInputEl();
    if (customInput) customInput.value = '';
  }

  // 과목 태그 버튼 활성화
  document.querySelectorAll('.subject-tag-btn').forEach(btn => btn.classList.remove('selected'));
  selectedSubjectTags.forEach(tag => {
    const tagBtn = Array.from(document.querySelectorAll('.subject-tag-btn')).find(btn => btn.innerText.includes(tag));
    if (tagBtn) tagBtn.classList.add('selected');
  });
  syncCustomSubjectInputVisibility();
  // 선생님 답장 확인
  await checkForTeacherReplies();
}

// 데일리 자기평가 제출
async function submitDailyReflection() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  if (!currentStudent || !currentClassCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '로그인이 필요합니다.' });
    return;
  }

  const learningText = document.getElementById('learningText').value.trim();

  if (!learningText) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 필요', message: '오늘의 배움을 작성해주세요.' });
    return;
  }

  const btn = document.getElementById('saveDailyBtn');
  const msg = document.getElementById('dailyMsg');
  const targetDate = document.getElementById('selfDate').value;

  setLoading(true, btn, '저장 중...');

  try {
    const finalSubjectTags = getEffectiveSubjectTags();
    const reflectionData = {
      class_code: currentClassCode,
      student_id: String(currentStudent.id),
      reflection_date: targetDate,
      learning_text: learningText || null,
      subject_tags: finalSubjectTags.length > 0 ? finalSubjectTags : null
    };

    const { error: reflectionError } = await db.from('daily_reflections')
      .upsert(reflectionData, { onConflict: 'class_code,student_id,reflection_date' });

    if (reflectionError) throw reflectionError;

    setLoading(false, btn, '저장하기');
    showMsg(msg, '성공적으로 저장되었습니다! 🎉', 'success');

    // AI 맞춤 피드백 생성
    generateAiFeedback(learningText, finalSubjectTags);

  } catch (err) {
    console.error('일기 저장 오류:', err);
    setLoading(false, btn, '저장하기');
    showMsg(msg, '저장 실패: ' + err.message, 'error');
  }
}


// AI 맞춤 피드백 생성 (감사+배움 글에 대해)
async function generateAiFeedback(learning, subjects) {
  const feedbackSection = document.getElementById('aiFeedbackSection');
  const feedbackText = document.getElementById('aiFeedbackText');
  feedbackSection.classList.remove('hidden');
  feedbackText.innerHTML = '<span style="color:var(--text-sub);">🤖 AI가 피드백을 작성 중...</span>';

  const subjectInfo = subjects.length > 0 ? '과목/활동: ' + subjects.join(', ') : '';
  const personalityInfo = studentPersonality ? '학생 성향: ' + studentPersonality.personality_type : '';

  const prompt = '당신은 초등학생의 성장 일기에 따뜻한 맞춤 피드백을 주는 담임선생님입니다.\n\n[학생 기록]\n배운 것: ' + (learning || '(미작성)') + '\n' + subjectInfo + '\n' + personalityInfo + '\n\n[피드백 규칙]\n1. 해요체로 부드럽게 3~4문장 이내로 작성\n2. 학생이 쓴 내용을 구체적으로 언급하며 칭찬\n3. 배운 것에 대해 "다음에 이렇게 해보면 더 좋겠다"는 조언 한 가지\n4. 따뜻하고 응원하는 어조\n5. 이모지 적절히 사용\n6. 절대 5문장을 넘기지 말것';

  const result = await callGemini(prompt, { generationConfig: { temperature: 0.7, maxOutputTokens: 300 } });

  if (result.ok) {
    feedbackText.innerHTML = formatMarkdown(result.text);
    // DB에 피드백 저장
    const kr = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
    const today = kr.toISOString().split('T')[0];
    await db.from('daily_reflections').update({ ai_feedback: result.text })
      .eq('class_code', currentClassCode).eq('student_id', String(currentStudent.id)).eq('reflection_date', today);
  } else {
    feedbackText.textContent = '오늘도 성장 일기를 쓴 너, 정말 멋져요! 매일 조금씩 성장하고 있어요 🌟';
  }
}

// 선생님 답장 확인
async function checkForTeacherReplies() {
  if (!currentStudent || !currentClassCode) return;

  const { data: messages } = await db.from('teacher_messages')
    .select('id, message_content, teacher_replies(*)')
    .eq('class_code', currentClassCode)
    .eq('student_id', String(currentStudent.id));

  if (!messages || messages.length === 0) return;

  // 답장이 있는 메시지 찾기
  const repliedMessage = messages.find(m => m.teacher_replies && m.teacher_replies.length > 0);

  if (repliedMessage && repliedMessage.teacher_replies[0]) {
    document.getElementById('teacherReplyContent').textContent = repliedMessage.teacher_replies[0].reply_content;
    document.getElementById('teacherReplyNotification').classList.remove('hidden');
  }
}

// 별점 선택


// 프로젝트 자기평가 제출
async function submitProjectReflection() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  if (!currentStudent || !currentClassCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '로그인이 필요합니다.' });
    return;
  }

  const projectName = document.getElementById('projectName').value.trim();
  const comment = document.getElementById('projectComment').value.trim();

  if (!projectName) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 필요', message: '프로젝트 이름을 입력해주세요.' });
    return;
  }

  const btn = document.getElementById('submitProjectBtn');
  const msg = document.getElementById('projectMsg');
  const targetDate = document.getElementById('selfDate').value;

  setLoading(true, btn, '제출 중...');

  try {
    const projectData = {
      class_code: currentClassCode,
      student_id: String(currentStudent.id),
      project_name: projectName,
      reflection_date: targetDate,
      star_rating: 0, // 별점 기능 제거로 인한 기본값
      comment: comment || null
    };

    const { error } = await db.from('project_reflections')
      .upsert(projectData, { onConflict: 'class_code,student_id,project_name,reflection_date' });

    if (error) throw error;

    setLoading(false, btn, '제출');
    showMsg(msg, '성공적으로 제출되었습니다! 🌟', 'success');

    // AI 분석 생성 (랜덤 피드백)
    const analysis = await generateProjectAnalysis(Math.floor(Math.random() * 5) + 1);
    document.getElementById('projectAIText').textContent = analysis;
    document.getElementById('projectAIAnalysis').classList.remove('hidden');

    // 입력 필드 초기화
    document.getElementById('projectName').value = '';
    document.getElementById('projectComment').value = '';

  } catch (error) {
    setLoading(false, btn, '제출');
    showMsg(msg, error.message, 'error');
  }
}

// AI 프로젝트 분석 생성
async function generateProjectAnalysis(stars) {
  const analyses = {
    5: ['완벽해요! 이번 활동에서 최고의 성과를 냈어요! 🌟', '정말 훌륭해요! 계속 이 열정을 유지해요! ⭐⭐⭐⭐⭐'],
    4: ['정말 잘했어요! 다음엔 더 멋질 거예요! ✨', '이전 활동보다 만족도가 높아졌어! 계속 성장하고 있구나! 🌟'],
    3: ['좋았어요! 다음엔 더 발전할 수 있을 거예요! 💪', '괜찮았어요! 계속 도전하다 보면 더 좋아질 거예요! 🎯'],
    2: ['괜찮아요! 다음 활동에서 더 집중해봐요! 📝', '이번 경험을 바탕으로 다음엔 더 잘할 수 있어요! 💡'],
    1: ['괜찮아요! 처음이 어려운 법이에요. 계속 도전해봐요! 🌱', '다음 활동에서 조금씩 나아질 거예요! 화이팅! 💪']
  };

  const options = analyses[stars] || analyses[3];
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================
// 교사용 자기평가 관리 기능
// ============================================

// 성장 일기 날짜 초기화
function initDiaryDate() {
  const today = getDefaultQueryDate();
  document.getElementById('diaryViewDate').value = today;
}

// 교사용 성장 일기 데이터 로드
async function loadTeacherDiaryData() {
  if (!currentClassCode) return;

  const selectedDate = document.getElementById('diaryViewDate')?.value;
  if (!selectedDate) return;

  try {
    // 통계 데이터 로드
    const { data: allReflections } = await db.from('daily_reflections')
      .select('*')
      .eq('class_code', currentClassCode);

    const { data: todayReflections } = await db.from('daily_reflections')
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('reflection_date', selectedDate);

    // 통계 업데이트
    document.getElementById('totalReflections').textContent = allReflections?.length || 0;
    document.getElementById('todayReflections').textContent = todayReflections?.length || 0;

    // 감정 키워드 알림 감지
    renderEmotionAlerts(todayReflections || []);

  } catch (error) {
    console.error('Error loading diary data:', error);
    showModal({ type: 'alert', icon: '❌', title: '오류', message: '데이터 로드 실패: ' + error.message });
  }
}

// 학생 메시지 날짜 초기화
function initMessageDate() {
  const today = getDefaultQueryDate();
  document.getElementById('messageViewDate').value = today;
}

// 학생 메시지 로드 (칭찬 우체통 탭)
async function loadTeacherMessages() {
  if (!currentClassCode) return;
  const selectedDate = document.getElementById('messageViewDate')?.value;
  if (!selectedDate) return;

  try {
    const { data: messages } = await db.from('teacher_messages')
      .select('*, daily_reflections(reflection_date)')
      .eq('class_code', currentClassCode)
      .gte('created_at', selectedDate + 'T00:00:00')
      .lt('created_at', selectedDate + 'T23:59:59.999')
      .order('created_at', { ascending: false });

    renderMessageList(messages || []);
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

// ============================================
// 우체통
// ============================================
function switchPraiseTab(mode) {
  const btns = document.querySelectorAll('#praiseSection .sub-tab-btn');
  document.getElementById('praiseSendTab').classList.add('hidden');
  document.getElementById('praiseReceivedTab').classList.add('hidden');
  document.getElementById('teacherMessageTab').classList.add('hidden');
  btns.forEach(b => b.classList.remove('active'));

  if (mode === 'send') {
    btns[0].classList.add('active');
    document.getElementById('praiseSendTab').classList.remove('hidden');
  } else if (mode === 'received') {
    btns[1].classList.add('active');
    document.getElementById('praiseReceivedTab').classList.remove('hidden');
    loadReceivedPraises();
  } else if (mode === 'teacher') {
    btns[2].classList.add('active');
    document.getElementById('teacherMessageTab').classList.remove('hidden');
    checkForTeacherReplies();
  }
}

// 선생님께 메시지만 전송
async function submitTeacherMessageOnly() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  if (!currentStudent || !currentClassCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '로그인이 필요합니다.' });
    return;
  }

  const teacherMessage = document.getElementById('teacherMessage').value.trim();

  if (!teacherMessage) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 필요', message: '메시지를 입력해주세요.' });
    return;
  }

  if (!currentMessageMode) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 필요', message: '익명/실명을 선택해주세요.' });
    return;
  }

  const btn = document.getElementById('sendTeacherMsgBtn');
  const msg = document.getElementById('teacherMsgResult');

  setLoading(true, btn, '보내는 중...');

  try {
    const messageData = {
      class_code: currentClassCode,
      student_id: currentMessageMode === 'named' ? String(currentStudent.id) : null,
      is_anonymous: currentMessageMode === 'anonymous',
      message_content: teacherMessage,
      has_reply: false
    };

    // 오늘 날짜의 reflection_id 찾기 (선택 사항)
    const kr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const today = kr.toISOString().split('T')[0];
    const { data: reflection } = await db.from('daily_reflections')
      .select('id')
      .eq('class_code', currentClassCode)
      .eq('student_id', String(currentStudent.id))
      .eq('reflection_date', today)
      .maybeSingle();

    if (reflection) {
      messageData.reflection_id = reflection.id;
    }

    const { error: messageError } = await db.from('teacher_messages').insert(messageData);
    if (messageError) throw messageError;

    setLoading(false, btn, '보내기');
    showMsg(msg, '선생님께 편지가 전달되었습니다! 💌', 'success');

    // 입력 필드 초기화
    document.getElementById('teacherMessage').value = '';
    currentMessageMode = null;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('messageInputArea').classList.add('hidden');

  } catch (err) {
    console.error('메시지 전송 오류:', err);
    setLoading(false, btn, '보내기');
    showMsg(msg, '전송 실패: ' + err.message, 'error');
  }
}
async function loadPraiseData() {
  if (!currentStudent || !currentClassCode) return;
  // 대상 그리드 렌더링
  const settings = await getClassSettings();
  const maxCount = currentStudent.type === 'group' ? settings.groupCount : settings.studentCount;
  const grid = document.getElementById('praiseTargetGrid');
  grid.innerHTML = '';
  for (let i = 1; i <= maxCount; i++) {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.textContent = i + '번'; btn.className = 'target-btn';
    if (String(i) === String(currentStudent.id)) { btn.classList.add('disabled'); }
    else { btn.onclick = () => { grid.querySelectorAll('.target-btn.selected').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); document.getElementById('praiseTargetId').value = i; }; }
    grid.appendChild(btn);
  }
}
function updatePraiseCharCount() {
  const len = document.getElementById('praiseContent').value.length;
  document.getElementById('praiseCharCount').textContent = len + '자 / 최소 10자';
  document.getElementById('praiseCharCount').style.color = len >= 10 ? 'var(--color-rose)' : 'var(--text-sub)';
}
async function sendPraise() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const targetId = document.getElementById('praiseTargetId').value;
  const content = document.getElementById('praiseContent').value.trim();
  const isAnon = document.querySelector('input[name="praiseAnon"]:checked').value === 'anonymous';
  const msg = document.getElementById('praiseMsg');
  const btn = document.getElementById('praiseSendBtn');
  if (!targetId) { showMsg(msg, '칭찬할 친구를 선택해주세요.', 'error'); return; }
  if (content.length < 10) { showMsg(msg, '칭찬은 최소 10자 이상 써주세요.', 'error'); return; }
  setLoading(true, btn, '보내는 중...');

  // 학급 설정에서 자동 승인 여부 확인
  let isApproved = false;
  try {
    const { data: classData } = await db.from('classes').select('auto_approve_praise').eq('class_code', currentClassCode).maybeSingle();
    if (classData && classData.auto_approve_praise) isApproved = true;
  } catch (err) {
    console.warn('자동 승인 설정 로드 실패, 기본값(수동) 사용:', err);
  }

  const { error } = await db.from('praise_messages').insert({
    class_code: currentClassCode,
    sender_id: String(currentStudent.id),
    receiver_id: String(targetId),
    message_content: content,
    is_anonymous: isAnon,
    is_approved: isApproved
  });
  setLoading(false, btn, '칭찬 보내기 💝');
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, '칭찬이 전달되었습니다! 선생님 확인 후 전달돼요 💝', 'success');
  document.getElementById('praiseContent').value = '';
  document.getElementById('praiseTargetId').value = '';
  document.querySelectorAll('#praiseTargetGrid .target-btn.selected').forEach(b => b.classList.remove('selected'));
  updatePraiseCharCount();
}
async function loadReceivedPraises() {
  if (!currentStudent || !currentClassCode) return;
  const container = document.getElementById('receivedPraiseList');
  const { data: praises } = await db.from('praise_messages').select('*').eq('class_code', currentClassCode).eq('receiver_id', String(currentStudent.id)).eq('is_approved', true).order('created_at', { ascending: false });
  if (!praises || praises.length === 0) { container.innerHTML = '<div class="empty-state"><span class="empty-icon">💌</span><div class="empty-title">아직 받은 칭찬이 없어요</div><div class="empty-desc">친구들의 칭찬이 도착하면<br>여기에 표시됩니다!</div></div>'; return; }
  container.innerHTML = praises.map(p => {
    const sender = p.is_anonymous ? '🎭 익명의 친구' : (p.sender_id + '번 친구');
    const date = new Date(p.created_at).toLocaleDateString('ko-KR');
    return '<div style="padding:12px;background:var(--bg-body);border-radius:10px;border-left:3px solid var(--color-rose);margin-bottom:10px;"><div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="font-weight:700;color:var(--color-rose);">' + sender + '</span><span style="font-size:0.8rem;color:var(--text-sub);">' + date + '</span></div><div style="color:var(--text-main);line-height:1.6;">' + escapeHtml(p.message_content) + '</div></div>';
  }).join('');
}

// 교사 - 우체통 관리
async function loadPendingPraises() {
  const container = document.getElementById('pendingPraiseList');
  container.innerHTML = '<p style="text-align:center;">불러오는 중...</p>';
  const { data: praises } = await db.from('praise_messages').select('*').eq('class_code', currentClassCode).eq('is_approved', false).order('created_at', { ascending: false });
  if (!praises || praises.length === 0) { container.innerHTML = '<div class="empty-state"><span class="empty-icon">✅</span><div class="empty-desc">대기 중인 칭찬이 없습니다</div></div>'; return; }
  container.innerHTML = praises.map(p => {
    const sender = p.is_anonymous ? '익명(' + p.sender_id + '번)' : p.sender_id + '번';
    const date = new Date(p.created_at).toLocaleDateString('ko-KR');
    return '<div style="padding:12px;background:var(--bg-body);border-radius:10px;border:1.5px solid var(--border);margin-bottom:10px;"><div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem;"><span><strong>' + sender + '</strong> → <strong>' + p.receiver_id + '번</strong></span><span style="color:var(--text-sub);">' + date + '</span></div><div style="color:var(--text-main);margin-bottom:10px;line-height:1.5;">' + escapeHtml(p.message_content) + '</div><div style="display:flex;gap:8px;"><button type="button" onclick="approvePraise(\'' + p.id + '\')" style="flex:1;background:var(--color-result);color:white;padding:8px;font-size:0.85rem;">✅ 승인</button><button type="button" onclick="rejectPraise(\'' + p.id + '\')" style="flex:1;background:#e57373;color:white;padding:8px;font-size:0.85rem;">❌ 삭제</button></div></div>';
  }).join('');
}
async function approvePraise(id) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  await db.from('praise_messages').update({ is_approved: true }).eq('id', id);
  loadPendingPraises(); loadApprovedPraises(); loadPraiseStats();
}
async function rejectPraise(id) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  showCustomConfirm('이 칭찬을 삭제하시겠습니까?', async () => {
    await db.from('praise_messages').delete().eq('id', id);
    loadPendingPraises(); loadPraiseStats();
  });
}
async function loadPraiseStats() {
  const { data: all } = await db.from('praise_messages').select('is_approved').eq('class_code', currentClassCode);
  const total = (all || []).length;
  const pending = (all || []).filter(p => !p.is_approved).length;
  const approved = (all || []).filter(p => p.is_approved).length;
  document.getElementById('praiseTotalCount').textContent = total;
  document.getElementById('praisePendingCount').textContent = pending;
  document.getElementById('praiseApprovedCount').textContent = approved;
}
async function loadApprovedPraises() {
  const container = document.getElementById('approvedPraiseList');
  container.innerHTML = '<p style="text-align:center;">불러오는 중...</p>';
  const { data: praises } = await db.from('praise_messages').select('*').eq('class_code', currentClassCode).eq('is_approved', true).order('created_at', { ascending: false });
  if (!praises || praises.length === 0) { container.innerHTML = '<div class="empty-state"><span class="empty-icon">📬</span><div class="empty-desc">승인된 칭찬이 없습니다</div></div>'; return; }
  container.innerHTML = praises.map(p => {
    const sender = p.is_anonymous ? '익명(' + p.sender_id + '번)' : p.sender_id + '번';
    const date = new Date(p.created_at).toLocaleDateString('ko-KR');
    return '<div style="padding:12px;background:var(--bg-body);border-radius:10px;border-left:3px solid var(--color-result);margin-bottom:10px;"><div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem;"><span><strong>' + sender + '</strong> → <strong>' + p.receiver_id + '번</strong></span><span style="color:var(--text-sub);">' + date + '</span></div><div style="color:var(--text-main);line-height:1.5;">' + escapeHtml(p.message_content) + '</div></div>';
  }).join('');
}

// 자동 승인 상태 로드
async function loadAutoApproveStatus() {
  if (!currentClassCode) return;
  const toggle = document.getElementById('autoApproveToggle');
  if (!toggle) return;

  const { data, error } = await db.from('classes').select('auto_approve_praise').eq('class_code', currentClassCode).maybeSingle();
  if (!error && data) {
    toggle.checked = data.auto_approve_praise;
  }
}

// 자동 승인 토글 변경
async function toggleAutoApprovePraise(el) {
  if (isDemoMode) { showDemoBlockModal(); el.checked = !el.checked; return; }
  if (!currentClassCode) return;
  const isActive = el.checked;

  try {
    const { error } = await db.from('classes')
      .update({ auto_approve_praise: isActive })
      .eq('class_code', currentClassCode);

    if (error) throw error;

    showModal({
      type: 'alert',
      icon: isActive ? '✨' : '🔒',
      title: '설정 변경',
      message: `칭찬 자동 승인 모드가 ${isActive ? '활성화' : '비활성화'} 되었습니다.<br><small>${isActive ? '이제 친구들의 칭찬이 즉시 전달됩니다.' : '이제 선생님의 승인 후 칭찬이 전달됩니다.'}</small>`
    });
  } catch (error) {
    console.error('자동 승인 설정 변경 오류:', error);
    el.checked = !isActive; // 실패 시 복구
    showModal({ type: 'alert', icon: '❌', title: '오류', message: '설정 변경 실패: ' + error.message });
  }
}

// 감정 키워드 알림
function renderEmotionAlerts(reflections) {
  const area = document.getElementById('emotionAlertArea');
  const list = document.getElementById('emotionAlertList');
  const keywords = ['힘들', '슬프', '슬퍼', '외로', '무서', '불안', '걱정', '싫어', '짜증', '화가', '울고', '울었', '죽고', '포기', '미워', '괴롭', '아프', '속상', '우울', '두려'];
  const alerts = [];
  reflections.forEach(r => {
    const texts = [r.learning_text || ''].join(' ');
    const found = keywords.filter(k => texts.includes(k));
    if (found.length > 0) alerts.push({ studentId: r.student_id, keywords: found, text: texts.substring(0, 80) });
  });
  if (alerts.length === 0) { area.classList.add('hidden'); return; }
  area.classList.remove('hidden');
  list.innerHTML = alerts.map(a => '<div style="padding:10px;background:var(--bg-body);border-radius:8px;border-left:3px solid var(--color-rose);margin-bottom:8px;"><div style="font-weight:700;margin-bottom:4px;">' + a.studentId + '번 학생</div><div style="font-size:0.83rem;color:var(--text-sub);margin-bottom:4px;">' + escapeHtml(a.text) + (a.text.length >= 80 ? '...' : '') + '</div><div>' + a.keywords.map(k => '<span style="display:inline-block;padding:2px 8px;background:#fee2e2;color:#dc2626;border-radius:10px;font-size:0.75rem;margin:2px;">' + k + '</span>').join('') + '</div></div>').join('');
}

// 메시지 목록 렌더링
function renderMessageList(messages) {
  const container = document.getElementById('messageList');

  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">💌</span><div class="empty-title">메시지가 없습니다</div><div class="empty-desc">이 날짜에 학생 메시지가 없습니다</div></div>';
    return;
  }

  let html = '';
  messages.forEach(msg => {
    const studentId = msg.is_anonymous ? '익명' : (msg.student_id + '번');
    const badgeClass = msg.is_anonymous ? 'badge-anonymous' : 'badge-named';
    const date = new Date(msg.created_at);
    const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    html += `
      <div class="message-card">
        <div class="message-card-header">
          <span class="message-card-badge ${badgeClass}">${studentId}</span>
        </div>
        <div class="message-card-content">${escapeHtml(msg.message_content)}</div>
        <div class="message-card-meta">
          <span>📅 ${msg.daily_reflections?.reflection_date || '날짜 미상'}</span>
          <span>🕐 ${timeStr}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// HTML 이스케이프
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 키워드 통계 렌더링
function renderKeywordStats(tagCounts) {
  const container = document.getElementById('gratitudeStats');
  if (!container) return;

  if (Object.keys(tagCounts).length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">📊</span><div class="empty-desc">감사 키워드가 없습니다</div></div>';
    return;
  }

  // 태그 이모지 매핑
  const tagEmojis = {
    '친구': '👥',
    '선생님': '👨‍🏫',
    '가족': '👨‍👩‍👧‍👦',
    '나': '💪',
    '작은일': '✨'
  };

  let html = '<div class="keyword-cloud">';
  Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).forEach(([tag, count]) => {
    const emoji = tagEmojis[tag] || '💝';
    html += `<div class="keyword-item">${emoji} ${tag}<span class="keyword-count">${count}</span></div>`;
  });
  html += '</div>';

  container.innerHTML = html;
}

// (중복 탭 전환 함수 제거됨 - 위의 switchStudentMainTab, switchPeerTab, switchSelfTab 사용)

// ============================================
// 성향 진단 시스템
// ============================================

const personalityQuestions = [
  {
    id: 1,
    category: '조언 수용 성향 (개선지향 vs 인정지향)',
    question: '결과물에 대한 조언을 받을 때 어떤 방식이 더 좋나요?',
    optionA: { label: 'A', text: '구체적인 개선점과 해결방법' },
    optionB: { label: 'B', text: '잘한 점 중심의 격려와 응원' }
  },
  {
    id: 2,
    category: '결과 정리 방식 선호 (수치/근거형 vs 요약/방향형)',
    question: '평가 결과를 받을 때, 어떤 형태로 정리되어 있으면 더 도움이 되나요?',
    optionA: { label: 'A', text: '점수/수치와 근거가 정리된 결과' },
    optionB: { label: 'B', text: '한눈에 요약된 전체 흐름과 다음 방향' }
  },
  {
    id: 3,
    category: '동기 원천 (결과형 vs 과정형)',
    question: '공부할 때 무엇이 더 동기부여가 되나요?',
    optionA: { label: 'A', text: '성적/결과가 오르거나 목표를 달성할 때' },
    optionB: { label: 'B', text: '새로운 것을 배우는 과정 자체' }
  },
  {
    id: 4,
    category: '실수 이후 회복 스타일 (해결 중심 vs 정서 지지 중심)',
    question: '잘못했을 때 어떤 말이 더 도움이 되나요?',
    optionA: { label: 'A', text: '이렇게 하면 더 나아질거야' },
    optionB: { label: 'B', text: '괜찮아, 다음엔 더 잘할 수 있어' }
  },
  {
    id: 5,
    category: '과제 진행 방식 (계획형 vs 유연형)',
    question: '과제를 할 때 어떤 방식이 더 편한가요?',
    optionA: { label: 'A', text: '체계적인 계획을 세우고 진행' },
    optionB: { label: 'B', text: '유연하게 상황에 맞춰 진행' }
  },
  {
    id: 6,
    category: '학습 접근 방식 (가이드형 vs 해보면서형)',
    question: '새로운 걸 배울 때 어떤 게 더 좋나요?',
    optionA: { label: 'A', text: '명확한 지침과 단계' },
    optionB: { label: 'B', text: '일단 해보면서 감을 잡고 방법을 찾아가기' }
  },
  {
    id: 7,
    category: '칭찬 선호 방식 (구체 칭찬 vs 전체 칭찬)',
    question: '좋은 결과가 나왔을 때 어떤 게 기분이 더 좋나요?',
    optionA: { label: 'A', text: '이 부분이 특히 훌륭했어!' },
    optionB: { label: 'B', text: '정말 잘했어! 멋져!' }
  },
  {
    id: 8,
    category: '스트레스 상황에서 필요한 지원 (문제해결 중심 vs 정서지지 중심)',
    question: '힘들 때 어떤 말이 더 위로가 되나요?',
    optionA: { label: 'A', text: '이건 이렇게 바꿔보자' },
    optionB: { label: 'B', text: '힘내! 넌 할 수 있어' }
  }
];

// 자기평가 초기화
async function initSelfEvaluation() {
  // 날짜 초기화 (오늘)
  const selfDateInput = document.getElementById('selfDate');
  if (selfDateInput && !selfDateInput.value) {
    selfDateInput.value = getDefaultQueryDate();
  }

  // 체험 모드: 퀴즈를 ABABABAB으로 미리 세팅
  if (isDemoMode) {
    if (!studentPersonality) studentPersonality = loadDemoPersonalityFromStorage();
    if (studentPersonality && studentPersonality.personality_type) {
      document.getElementById('personalityQuiz').classList.add('hidden');
      if (document.getElementById('personalityResult').classList.contains('hidden')) {
        document.getElementById('selfEvaluationMenu').classList.remove('hidden');
        switchSelfTab('daily');
      } else {
        document.getElementById('selfEvaluationMenu').classList.add('hidden');
      }
      return;
    }
    showPersonalityQuiz();
    // 미리 ABABABAB 답변 세팅 + UI 표시
    personalityQuestions.forEach(q => {
      const answer = q.id % 2 === 1 ? 'A' : 'B'; // 홀수=A, 짝수=B
      quizAnswers[q.id] = answer;
      const questionEl = document.getElementById(`question${q.id}`);
      if (questionEl) {
        questionEl.classList.add('answered');
        const selectedIndex = answer === 'A' ? 0 : 1;
        const options = questionEl.querySelectorAll('.quiz-option');
        options.forEach(opt => opt.classList.remove('selected', 'selected-a', 'selected-b'));
        options[selectedIndex].classList.add('selected', answer === 'A' ? 'selected-a' : 'selected-b');
      }
    });
    // 분석 완료 버튼 바로 표시
    document.getElementById('submitQuizBtn').classList.remove('hidden');
    document.getElementById('personalityQuiz').classList.remove('hidden');
    document.getElementById('personalityResult').classList.add('hidden');
    document.getElementById('selfEvaluationMenu').classList.add('hidden');
    return;
  }

  try {
    const personality = await loadStudentPersonality();

    if (personality) {
      studentPersonality = personality;
      showPersonalityResult(personality.personality_type);
      document.getElementById('personalityQuiz').classList.add('hidden');
      document.getElementById('personalityResult').classList.add('hidden');
      document.getElementById('selfEvaluationMenu').classList.remove('hidden');
      switchSelfTab('daily');
    } else {
      showPersonalityQuiz();
      document.getElementById('personalityQuiz').classList.remove('hidden');
      document.getElementById('personalityResult').classList.add('hidden');
      document.getElementById('selfEvaluationMenu').classList.add('hidden');
    }
  } catch (error) {
    console.error('자기평가 초기화 오류:', error);
    // 오류 시 퀴즈 화면 표시
    showPersonalityQuiz();
    document.getElementById('personalityQuiz').classList.remove('hidden');
    document.getElementById('personalityResult').classList.add('hidden');
    document.getElementById('selfEvaluationMenu').classList.add('hidden');
  }
}

// 성향 데이터 로드
async function loadStudentPersonality() {
  try {
    const { data } = await db.from('student_personality')
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('student_id', currentStudent.id)
      .maybeSingle();
    return data;
  } catch (error) {
    console.error('Error loading personality:', error);
    return null;
  }
}

// 성향 진단 퀴즈 표시
function showPersonalityQuiz() {
  quizAnswers = {};
  const container = document.getElementById('quizContent');
  let html = '';

  personalityQuestions.forEach(q => {
    html += `
      <div class="quiz-question" id="question${q.id}">
        <div class="quiz-question-number">Q${q.id}. ${q.category}</div>
        <div class="quiz-question-text">${q.question}</div>
        <div class="quiz-options">
          <div class="quiz-option option-a" onclick="selectQuizOption(${q.id}, 'A')">
            <div class="quiz-option-label">${q.optionA.label}</div>
            <div class="quiz-option-text">${q.optionA.text}</div>
          </div>
          <div class="quiz-option option-b" onclick="selectQuizOption(${q.id}, 'B')">
            <div class="quiz-option-label">${q.optionB.label}</div>
            <div class="quiz-option-text">${q.optionB.text}</div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  document.getElementById('submitQuizBtn').classList.add('hidden');
}

// 퀴즈 선택
function selectQuizOption(questionId, answer) {
  if (isDemoMode) {
    showModal({ type: 'alert', icon: '🔒', title: '체험 모드', message: '체험 모드에서는 답변을 변경할 수 없습니다.<br>아래 분석 완료 버튼을 눌러주세요!' });
    return;
  }
  quizAnswers[questionId] = answer;

  const questionEl = document.getElementById(`question${questionId}`);
  questionEl.classList.add('answered');
  questionEl.querySelectorAll('.quiz-option').forEach(opt => {
    opt.classList.remove('selected', 'selected-a', 'selected-b');
  });

  const selectedIndex = answer === 'A' ? 0 : 1;
  questionEl.querySelectorAll('.quiz-option')[selectedIndex].classList.add('selected', answer === 'A' ? 'selected-a' : 'selected-b');

  if (Object.keys(quizAnswers).length === personalityQuestions.length) {
    document.getElementById('submitQuizBtn').classList.remove('hidden');
  }
}

// 성향 진단 제출
async function submitPersonalityQuiz() {
  const aCount = Object.values(quizAnswers).filter(a => a === 'A').length;

  let personalityType;
  if (aCount >= 6) {
    personalityType = 'analytical';
  } else if (aCount >= 4) {
    personalityType = 'balanced';
  } else if (aCount >= 3) {
    personalityType = 'growth';
  } else {
    personalityType = 'empathetic';
  }

  try {
    // 체험 모드에서는 DB 저장 생략, UI만 진행
    if (!isDemoMode) {
      const { error } = await db.from('student_personality').upsert({
        class_code: currentClassCode,
        student_id: currentStudent.id,
        personality_type: personalityType,
        question_responses: quizAnswers
      }, { onConflict: 'class_code,student_id' });
      if (error) throw error;
    }

    studentPersonality = { personality_type: personalityType, question_responses: quizAnswers };
    if (isDemoMode) saveDemoPersonalityToStorage(studentPersonality);
    showPersonalityResult(personalityType);

    document.getElementById('personalityQuiz').classList.add('hidden');
    document.getElementById('personalityResult').classList.remove('hidden');

    // "확인" 버튼으로 넘어가도록 (자동 전환 제거)

  } catch (error) {
    showModal({ type: 'alert', icon: '❌', title: '오류', message: '성향 저장 실패: ' + error.message });
  }
}

// 성향 결과 표시
function showPersonalityResult(type) {
  const personalities = {
    analytical: {
      icon: '🎯',
      title: '분석형',
      desc: '구체적이고 논리적인 피드백을 선호하는 당신!\n데이터와 명확한 개선점을 통해 성장하는 스타일이에요.'
    },
    balanced: {
      icon: '⚖️',
      title: '균형형',
      desc: '논리와 감정의 균형을 중시하는 당신!\n객관적 분석과 따뜻한 격려를 함께 받고 싶어하는 스타일이에요.'
    },
    growth: {
      icon: '🌱',
      title: '성장형',
      desc: '과정과 배움을 중시하는 당신!\n결과보다 성장의 과정 자체에서 의미를 찾는 스타일이에요.'
    },
    empathetic: {
      icon: '💝',
      title: '감성형',
      desc: '공감과 격려를 중시하는 당신!\n따뜻한 응원과 긍정적인 피드백에서 힘을 얻는 스타일이에요.'
    }
  };

  const p = personalities[type];
  document.getElementById('personalityIcon').textContent = p.icon;
  document.getElementById('personalityTitle').textContent = p.title;
  document.getElementById('personalityDesc').textContent = p.desc;
  document.getElementById('personalityCard').className = 'accent-box personality-result-card';

  // 다른 유형들도 함께 표시
  const allContainer = document.getElementById('allPersonalityTypes');
  if (allContainer) {
    let html = '<div style="font-weight:700; font-size:0.85rem; color:var(--text-sub); margin-bottom:10px; text-align:center;">📌 모든 성향 유형</div>';
    html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">';
    Object.entries(personalities).forEach(([key, val]) => {
      const isMine = key === type;
      html += `<div style="padding:12px; border-radius:12px; text-align:center; ${isMine ? 'background:var(--primary-light); border:2px solid var(--primary);' : 'background:var(--bg-body); border:2px solid transparent; opacity:0.7;'}">
        <div style="font-size:1.5rem;">${val.icon}</div>
        <div style="font-weight:700; font-size:0.85rem; color:var(--text-main); margin-top:4px;">${val.title}${isMine ? ' (나)' : ''}</div>
        <div style="font-size:0.72rem; color:var(--text-sub); margin-top:3px; line-height:1.3;">${val.desc.split('\n')[1] || val.desc}</div>
      </div>`;
    });
    html += '</div>';
    allContainer.innerHTML = html;
  }
}

// 성향 결과 확인 후 메뉴로 이동
function confirmPersonalityResult() {
  document.getElementById('personalityResult').classList.add('hidden');
  document.getElementById('selfEvaluationMenu').classList.remove('hidden');
  switchSelfTab('daily');
}

// 재진단


// ============================================
// 성장 대시보드 기능
// ============================================

// 대시보드 데이터 로드
async function loadDashboardData() {
  if (!currentStudent || !currentClassCode) return;

  try {
    const { data: allRecords } = await db.from('daily_reflections')
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('student_id', String(currentStudent.id))
      .order('reflection_date', { ascending: false });

    loadGoals(); // 기록이 없어도 목표는 로드
    if (!allRecords || allRecords.length === 0) {
      document.getElementById('streakBadgeArea').classList.add('hidden');
      return;
    }

    document.getElementById('streakBadgeArea').classList.remove('hidden');
    renderStreakAndBadges(allRecords);

    renderLearningWordCloud(allRecords);
    renderSubjectChart(allRecords);
    renderGrowthTimeline(allRecords);
  } catch (error) {
    console.error('대시보드 로드 오류:', error);
  }
}

// ============================================
// 나의 목표 설정 & 추적
// ============================================
function renderGoals(goals) {
  const list = document.getElementById('goalList');
  const progress = document.getElementById('goalProgress');
  if (!goals || goals.length === 0) { list.innerHTML = '<div style="text-align:center;color:var(--text-sub);font-size:0.88rem;padding:10px;">목표를 추가해보세요! 🎯</div>'; progress.innerHTML = ''; return; }
  const completed = goals.filter(g => g.is_completed).length;
  const total = goals.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  progress.innerHTML = '<div style="display:flex;align-items:center;gap:10px;"><div style="flex:1;background:var(--bg-soft);border-radius:10px;height:10px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,var(--color-blue),var(--color-teal));border-radius:10px;transition:width 0.3s;"></div></div><span style="font-size:0.85rem;font-weight:700;color:var(--color-blue);">' + completed + '/' + total + ' (' + pct + '%)</span></div>';
  list.innerHTML = goals.map(g => {
    const typeLabel = g.goal_type === 'weekly' ? '주간' : '월간';
    const checkStyle = g.is_completed ? 'text-decoration:line-through;color:var(--text-sub);' : '';
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border);"><button type="button" onclick="toggleGoal(\'' + g.id + '\',' + !g.is_completed + ')" style="width:28px;height:28px;padding:0;border-radius:50%;background:' + (g.is_completed ? 'var(--color-result)' : 'var(--bg-soft)') + ';border:2px solid ' + (g.is_completed ? 'var(--color-result)' : 'var(--border)') + ';color:white;font-size:0.8rem;cursor:pointer;flex-shrink:0;">' + (g.is_completed ? '✓' : '') + '</button><span style="flex:1;font-size:0.9rem;' + checkStyle + '">' + escapeHtml(g.goal_text) + '</span><span style="font-size:0.72rem;padding:2px 8px;background:var(--bg-soft);border-radius:10px;color:var(--text-sub);">' + typeLabel + '</span><button type="button" onclick="deleteGoal(\'' + g.id + '\')" style="width:24px;height:24px;padding:0;background:none;border:none;color:var(--text-sub);cursor:pointer;font-size:0.9rem;">×</button></div>';
  }).join('');
}
async function addGoal() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const input = document.getElementById('goalInput');
  const text = input.value.trim();
  if (!text) return;
  const goalType = document.getElementById('goalType').value;
  await db.from('student_goals').insert({ class_code: currentClassCode, student_id: String(currentStudent.id), goal_text: text, goal_type: goalType });
  input.value = '';
  loadGoals();
}
async function toggleGoal(id, completed) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  await db.from('student_goals').update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', id);
  loadGoals();
}
async function deleteGoal(id) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  await db.from('student_goals').delete().eq('id', id);
  loadGoals();
}

async function loadGoals() {
  if (!currentStudent || !currentClassCode) return;
  const { data: goals } = await db.from('student_goals')
    .select('*')
    .eq('class_code', currentClassCode)
    .eq('student_id', String(currentStudent.id))
    .order('created_at', { ascending: false });

  const goalList = document.getElementById('goalList');
  const goalProgress = document.getElementById('goalProgress');

  if (!goals || goals.length === 0) {
    goalList.innerHTML = '<p style="text-align:center;color:var(--text-sub);font-size:0.85rem;margin:10px 0;">등록된 목표가 없어요. 이번 주 목표를 세워보세요!</p>';
    goalProgress.innerHTML = '';
    return;
  }

  const completedCount = goals.filter(g => g.is_completed).length;
  const totalCount = goals.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  goalProgress.innerHTML = `
    <div style="margin-bottom:5px;display:flex;justify-content:space-between;font-size:0.85rem;">
      <span>목표 달성률</span>
      <span style="font-weight:700;color:var(--color-blue);">${percent}%</span>
    </div>
    <div class="progress-bar-container" style="height:10px;background:rgba(0,0,0,0.05);border-radius:10px;overflow:hidden;">
      <div class="progress-bar-fill" style="width:${percent}%;background:var(--color-blue);height:100%;transition:width 0.3s ease;"></div>
    </div>
  `;

  goalList.innerHTML = goals.map(g => {
    const typeLabel = g.goal_type === 'weekly' ? '주간' : '월간';
    return `
      <div style="display:flex;align-items:center;padding:10px;background:var(--bg-body);border-radius:10px;margin-bottom:8px;border-left:3px solid ${g.is_completed ? 'var(--color-result)' : 'var(--border)'};">
        <input type="checkbox" ${g.is_completed ? 'checked' : ''} onchange="toggleGoal('${g.id}', this.checked)" style="width:20.ex;height:20.ex;cursor:pointer;margin-right:12px;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
             <span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:var(--border);color:var(--text-sub);">${typeLabel}</span>
             <span style="text-decoration:${g.is_completed ? 'line-through' : 'none'};color:${g.is_completed ? 'var(--text-sub)' : 'var(--text-main)'};font-size:0.95rem;">${escapeHtml(g.goal_text)}</span>
          </div>
        </div>
        <button type="button" onclick="deleteGoal('${g.id}')" style="width:auto;padding:4px;background:transparent;box-shadow:none;color:var(--text-sub);font-size:0.8rem;border:none;">✕</button>
      </div>
    `;
  }).join('');
}

// ⓪ 연속 기록 스트릭 & 뱃지
function renderStreakAndBadges(records) {
  // 연속 기록 스트릭 계산
  const dates = records.map(r => r.reflection_date).sort();
  const uniqueDates = [...new Set(dates)];
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
  let streak = 0;
  let checkDate = new Date(today);
  while (true) {
    const ds = checkDate.toISOString().split('T')[0];
    if (uniqueDates.includes(ds)) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
    else if (ds === today) { checkDate.setDate(checkDate.getDate() - 1); } // 오늘 아직 안썼으면 어제부터 체크
    else break;
  }
  const streakEl = document.getElementById('streakDisplay');
  if (streak > 0) streakEl.innerHTML = '🔥 연속 <span style="color:var(--color-rose);font-size:1.6rem;">' + streak + '</span>일 기록 중!';
  else streakEl.innerHTML = '📝 오늘 성장 일기를 써보세요!';

  // 뱃지 계산
  const totalDays = uniqueDates.length;
  const subjectSet = new Set();
  records.forEach(r => {
    if (r.subject_tags && Array.isArray(r.subject_tags)) r.subject_tags.forEach(t => subjectSet.add(t));
  });
  const badges = [];
  if (totalDays >= 1) badges.push({ icon: '🌱', label: '첫 기록', desc: '성장 일기 첫 작성' });
  if (totalDays >= 7) badges.push({ icon: '🌿', label: '7일 달성', desc: '7일 이상 기록' });
  if (totalDays >= 30) badges.push({ icon: '🌳', label: '30일 달성', desc: '30일 이상 기록' });
  if (streak >= 3) badges.push({ icon: '🔥', label: '3일 연속', desc: '3일 연속 기록' });
  if (streak >= 7) badges.push({ icon: '💎', label: '7일 연속', desc: '7일 연속 기록' });
  if (subjectSet.size >= 5) badges.push({ icon: '📚', label: '다재다능', desc: '5개 이상 과목 기록' });

  const badgeEl = document.getElementById('badgeContainer');
  if (badges.length === 0) { badgeEl.innerHTML = '<span style="color:var(--text-sub);font-size:0.85rem;">기록을 쌓으면 뱃지를 받을 수 있어요!</span>'; return; }
  badgeEl.innerHTML = badges.map(b => '<div class="badge-item" title="' + b.desc + '"><span style="font-size:1.4rem;">' + b.icon + '</span><span style="font-size:0.72rem;color:var(--text-sub);">' + b.label + '</span></div>').join('');
}



// ② 배움 키워드 워드클라우드
function renderLearningWordCloud(records) {
  const container = document.getElementById('learningWordCloud');
  const wordCounts = {};

  records.forEach(r => {
    if (!r.learning_text) return;
    // 간단한 형태소 분석: 2글자 이상 단어 추출
    const words = r.learning_text.replace(/[^가-힣a-zA-Z0-9\s]/g, '').split(/\s+/);
    words.forEach(w => {
      if (w.length >= 2) wordCounts[w] = (wordCounts[w] || 0) + 1;
    });
    // 과목 태그도 포함
    if (r.subject_tags && Array.isArray(r.subject_tags)) {
      r.subject_tags.forEach(tag => { wordCounts[tag] = (wordCounts[tag] || 0) + 2; }); // 태그는 가중치 2
    }
  });

  const sorted = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">📝</span><div class="empty-desc">기록이 쌓이면 키워드가 나타나요!</div></div>';
    return;
  }

  const maxCount = sorted[0][1];
  const colors = ['#4F84C7', '#5A9E8F', '#9575CD', '#C2654A', '#5E8C61', '#D4A574'];

  let html = '';
  sorted.forEach(([word, count], i) => {
    const ratio = count / maxCount;
    let sizeClass = 'size-1';
    if (ratio > 0.8) sizeClass = 'size-5';
    else if (ratio > 0.6) sizeClass = 'size-4';
    else if (ratio > 0.4) sizeClass = 'size-3';
    else if (ratio > 0.2) sizeClass = 'size-2';
    const color = colors[i % colors.length];
    html += '<span class="word-cloud-item ' + sizeClass + '" style="background:' + color + '20; color:' + color + ';">' + word + '</span>';
  });

  container.innerHTML = html;
}

// ③ 과목별 기록 횟수
function renderSubjectChart(records) {
  const container = document.getElementById('subjectChart');
  const subjectCounts = {};

  records.forEach(r => {
    if (r.subject_tags && Array.isArray(r.subject_tags)) {
      r.subject_tags.forEach(tag => { subjectCounts[tag] = (subjectCounts[tag] || 0) + 1; });
    }
  });

  const sorted = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">📚</span><div class="empty-desc">과목 태그를 선택하면 통계가 나타나요!</div></div>';
    return;
  }

  const maxCount = sorted[0][1];
  const barColors = ['#4F84C7', '#5A9E8F', '#9575CD', '#C2654A', '#5E8C61', '#D4A574', '#6C63FF', '#FF6B6B'];

  let html = '';
  sorted.forEach(([subject, count], i) => {
    const pct = Math.round((count / maxCount) * 100);
    const color = barColors[i % barColors.length];
    html += '<div class="subject-bar-item"><div class="subject-bar-label">' + subject + '</div><div class="subject-bar-track"><div class="subject-bar-fill" style="width:' + pct + '%; background:' + color + ';">' + count + '회</div></div></div>';
  });

  container.innerHTML = html;
}

// ④ 감사 기록 현황
function renderGratitudeStats(records) {
  const container = document.getElementById('gratitudeChart');
  if (!container) return;

  const totalGratitude = records.filter(r => r.gratitude_text).length;
  const totalLearning = records.filter(r => r.learning_text).length;
  const totalDays = records.length;

  // 연속 기록 계산
  let streak = 0;
  const kr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const today = new Date(kr.toISOString().split('T')[0]);
  const dateSet = new Set(records.map(r => r.reflection_date));

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    if (dateSet.has(dateStr)) streak++;
    else break;
  }

  container.innerHTML = '<div class="gratitude-stat-row">' +
    '<div class="gratitude-stat-item"><span class="gratitude-stat-number">' + totalDays + '</span><span class="gratitude-stat-label">총 기록일</span></div>' +
    '<div class="gratitude-stat-item"><span class="gratitude-stat-number" style="color:var(--color-teacher);">' + totalGratitude + '</span><span class="gratitude-stat-label">감사 기록</span></div>' +
    '<div class="gratitude-stat-item"><span class="gratitude-stat-number" style="color:var(--color-blue);">' + totalLearning + '</span><span class="gratitude-stat-label">배움 기록</span></div>' +
    '<div class="gratitude-stat-item"><span class="gratitude-stat-number" style="color:#FF6B6B;">🔥' + streak + '</span><span class="gratitude-stat-label">연속 기록</span></div>' +
    '</div>';
}

// ⑤ 성장 타임라인 (최근 10개)
function renderGrowthTimeline(records) {
  const container = document.getElementById('growthTimeline');
  const recent = records.slice(0, 10);

  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">🌱</span><div class="empty-desc">기록이 쌓이면 성장 과정이 보여요!</div></div>';
    return;
  }

  let html = '';
  recent.forEach(r => {
    const date = r.reflection_date.substring(5); // MM-DD
    const text = (r.learning_text || '').substring(0, 60);
    const tags = r.subject_tags || [];

    html += '<div class="timeline-item">';
    html += '<div class="timeline-date">' + date + '</div>';
    html += '<div class="timeline-dot"></div>';
    html += '<div class="timeline-content">' + escapeHtml(text) + (text.length >= 60 ? '...' : '');
    if (tags.length > 0) {
      html += '<div class="timeline-tags">';
      tags.forEach(t => { html += '<span class="timeline-tag">' + t + '</span>'; });
      html += '</div>';
    }
    html += '</div></div>';
  });

  container.innerHTML = html;
}

// 주간/월간 AI 요약
async function generateSummaryReport(period) {
  if (!currentStudent || !currentClassCode) return;

  // 버튼 스타일 토글
  document.querySelectorAll('.summary-period-btn').forEach(btn => btn.classList.remove('active'));
  const btnIndex = period === 'week' ? 0 : 1;
  document.querySelectorAll('.summary-period-btn')[btnIndex].classList.add('active');

  const area = document.getElementById('summaryReportArea');
  area.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">🤖 AI가 요약을 작성 중...</div>';

  const kr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const endDate = kr.toISOString().split('T')[0];
  const startDate = new Date(kr);
  startDate.setDate(startDate.getDate() - (period === 'week' ? 7 : 30));
  const startStr = startDate.toISOString().split('T')[0];

  try {
    const { data: records } = await db.from('daily_reflections')
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('student_id', String(currentStudent.id))
      .gte('reflection_date', startStr)
      .lte('reflection_date', endDate)
      .order('reflection_date', { ascending: true });

    if (!records || records.length === 0) {
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span><div class="empty-desc">이 기간에 기록이 없어요. 먼저 성장 일기를 써보세요!</div></div>';
      return;
    }

    const periodLabel = period === 'week' ? '이번 주' : '이번 달';
    const learningTexts = records.filter(r => r.learning_text).map(r => r.learning_text);
    const allSubjects = [];
    records.forEach(r => { if (r.subject_tags) allSubjects.push(...r.subject_tags); });

    const prompt = '당신은 초등학생의 성장 기록을 요약해주는 따뜻한 담임선생님입니다.\n\n[기간] ' + periodLabel + ' (' + startStr + ' ~ ' + endDate + ')\n[기록 수] ' + records.length + '일\n[배움 기록]\n' + learningTexts.join('\n') + '\n[과목/활동] ' + [...new Set(allSubjects)].join(', ') + '\n\n[요약 규칙]\n1. 해요체로 3~5문장 이내\n2. 이 기간 동안의 핵심 성장 포인트 정리\n3. 자주 등장한 과목이나 키워드 언급\n4. 다음 기간에 도전해볼 것 한 가지 제안\n5. 따뜻하고 구체적인 칭찬 포함\n6. 이모지 적절히 사용';

    const result = await callGemini(prompt, { generationConfig: { temperature: 0.5, maxOutputTokens: 500 } });

    if (result.ok) {
      area.innerHTML = '<div style="line-height:1.7; color:var(--text-main); font-size:0.93rem;">' + formatMarkdown(result.text) + '</div>';
    } else {
      area.innerHTML = '<div style="color:var(--text-sub);">' + periodLabel + ' 동안 ' + records.length + '일 기록했어요! 꾸준한 기록 습관이 대단해요 🌟</div>';
    }
  } catch (error) {
    area.innerHTML = '<div style="color:var(--color-danger);">요약 생성 중 오류가 발생했습니다.</div>';
  }
}

// AI 성장 리포트
async function generateGrowthReport() {
  if (!currentStudent || !currentClassCode) return;

  const btn = document.getElementById('growthReportBtn');
  const area = document.getElementById('growthReportArea');

  setLoading(true, btn, '🤖 분석 중...');
  area.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">전체 기록을 분석하고 있어요...</div>';

  try {
    const { data: records } = await db.from('daily_reflections')
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('student_id', String(currentStudent.id))
      .order('reflection_date', { ascending: true });

    if (!records || records.length < 3) {
      setLoading(false, btn, '🤖 AI 성장 리포트 받기');
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">📝</span><div class="empty-desc">최소 3일 이상 기록해야 리포트를 받을 수 있어요!</div></div>';
      return;
    }

    // 기간별 데이터 분석
    const firstDate = records[0].reflection_date;
    const lastDate = records[records.length - 1].reflection_date;
    const allSubjects = [];
    const allLearning = [];

    records.forEach(r => {
      if (r.subject_tags) allSubjects.push(...r.subject_tags);
      if (r.learning_text) allLearning.push(r.reflection_date + ': ' + r.learning_text);
    });

    const subjectCounts = {};
    allSubjects.forEach(s => { subjectCounts[s] = (subjectCounts[s] || 0) + 1; });
    const topSubjects = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, c]) => s + '(' + c + '회)');

    const prompt = '당신은 초등학생의 장기 성장을 분석하는 교육 전문가입니다.\n\n[학생 데이터]\n- 기록 기간: ' + firstDate + ' ~ ' + lastDate + '\n- 총 기록일: ' + records.length + '일\n- 주요 과목: ' + topSubjects.join(', ') + '\n- 최근 배움 기록 (시간순):\n' + allLearning.slice(-10).join('\n') + '\n- 초기 배움 기록:\n' + allLearning.slice(0, 3).join('\n') + '\n\n[리포트 작성 규칙]\n1. "## 🌟 너의 성장 포인트" 헤더로 시작\n2. 초기 vs 최근 기록 비교하여 성장한 점 구체적으로 언급\n3. 자주 기록한 과목/활동에서의 강점 분석\n4. "## 💪 다음 도전" 헤더로 앞으로의 성장 방향 제안\n5. 해요체, 따뜻한 어조, 5~8문장\n6. 이모지 적절히 사용\n7. 구체적인 내용(학생이 쓴 키워드)을 언급해서 맞춤형으로';

    const result = await callGemini(prompt, { generationConfig: { temperature: 0.5, maxOutputTokens: 800 } });

    setLoading(false, btn, '🤖 AI 성장 리포트 받기');

    if (result.ok) {
      area.innerHTML = '<div style="line-height:1.7; color:var(--text-main); font-size:0.93rem;">' + formatMarkdown(result.text) + '</div>';
    } else {
      area.innerHTML = '<div style="color:var(--text-main);">' + records.length + '일 동안 꾸준히 기록한 너, 정말 대단해요! 앞으로도 이 습관을 유지하면 놀라운 성장을 경험할 거예요 🌟</div>';
    }
  } catch (error) {
    setLoading(false, btn, '🤖 AI 성장 리포트 받기');
    area.innerHTML = '<div style="color:var(--color-danger);">리포트 생성 중 오류가 발생했습니다.</div>';
  }
}

// 앱 시작 시 인증 및 라우팅 실행
checkAuthAndRoute();

// ============================================
// 약관/개인정보처리방침 데이터 및 모달 함수
// ============================================

const TERMS_HTML = `
<div class="terms-content">
  <div class="terms-section">
    <h3 class="terms-article">제1조 (목적)</h3>
    <p>본 약관은 김도현(이하 "운영자")이 제공하는 배움로그(BaeumLog) 서비스의 이용과 관련하여 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">제2조 (서비스 내용)</h3>
    <p>배움로그(BaeumLog)는 학습 기록 및 동료 평가 기반 성장 관리 서비스입니다.</p>
    <ul class="terms-list">
      <li>Google 계정 로그인</li>
      <li>동료 평가 및 피드백</li>
      <li>성장 일기 및 프로젝트 기록</li>
      <li>AI 기반 요약 및 피드백</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">제3조 (회원가입 및 이용자격)</h3>
    <ol class="terms-list-num">
      <li>Google 계정을 보유한 누구나 이용할 수 있습니다.</li>
      <li>회원가입은 Google 인증을 통해 자동 처리됩니다.</li>
      <li>허위 정보 등록 시 이용이 제한될 수 있습니다.</li>
    </ol>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">제4조 (이용자의 의무)</h3>
    <ul class="terms-list">
      <li>타인의 계정 도용 금지</li>
      <li>부적절한 콘텐츠 작성 금지</li>
      <li>서비스 운영 방해 금지</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">제5조 (서비스 변경 및 중단)</h3>
    <p>운영자는 서비스 개선을 위해 기능을 변경하거나 중단할 수 있습니다.</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">제6조 (책임 제한)</h3>
    <p>본 서비스는 교육 지원 목적의 도구로, 학습 성과에 대한 법적 책임을 지지 않습니다.</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">제7조 (분쟁 해결)</h3>
    <p>본 약관과 관련된 분쟁은 대한민국 법을 따릅니다.</p>
  </div>

  <div class="terms-section terms-appendix">
    <h3 class="terms-article">부칙</h3>
    <p>본 약관은 2026년 2월 8일부터 시행합니다.</p>
  </div>
</div>
`;

const PRIVACY_HTML = `
<div class="terms-content">
  <div class="terms-section">
    <h3 class="terms-article">1. 개인정보 처리 목적</h3>
    <p>배움로그(BaeumLog)는 다음 목적을 위해 개인정보를 처리합니다.</p>
    <ul class="terms-list">
      <li>사용자 인증 및 서비스 제공</li>
      <li>학급 및 학습 활동 관리</li>
      <li>평가 및 기록 데이터 관리</li>
      <li>AI 기반 피드백 제공</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">2. 처리하는 개인정보 항목</h3>
    <span class="terms-badge">필수</span>
    <ul class="terms-list">
      <li>Supabase 사용자 ID</li>
      <li>Google 계정 이메일</li>
      <li>역할(교사/학생)</li>
      <li>학급 코드 및 학급명</li>
      <li>학생번호 또는 모둠번호</li>
      <li>서비스 이용 중 생성되는 데이터(평가 내용, 성장일기, 메시지, 성향 진단, 프로젝트 기록 등)</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">3. 개인정보 보관 기간</h3>
    <ul class="terms-list">
      <li>회원 탈퇴 시까지 보관</li>
      <li>법령에 따른 보관 필요 시 해당 기간 보관</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">4. 외부 전송(제3자 처리)</h3>
    <p>AI 피드백/요약 기능 제공을 위해 사용자가 입력한 텍스트 데이터가 Google Gemini API로 전송되어 처리될 수 있습니다.</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">5. 안전성 확보조치</h3>
    <ul class="terms-list">
      <li>HTTPS 기반 암호화 통신</li>
      <li>Supabase 인증 시스템 사용</li>
      <li>접근 권한 최소화</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">6. 이용자의 권리</h3>
    <p>이용자는 개인정보 열람/정정/삭제/처리정지 요청을 할 수 있습니다.</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">7. 개인정보 보호책임자</h3>
    <ul class="terms-list terms-list-plain">
      <li><strong>성명:</strong> 김도현</li>
      <li><strong>이메일:</strong> dohyun851208@gmail.com</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">8. 고지 의무</h3>
    <p>본 방침은 변경 시 서비스 내 공지를 통해 안내합니다.</p>
  </div>

  <div class="terms-section terms-appendix">
    <h3 class="terms-article">부칙</h3>
    <p>본 방침은 2026년 2월 8일부터 시행합니다.</p>
  </div>
</div>
`;

function openTermsModal() {
  showModal({
    type: 'alert',
    icon: '📜',
    title: '배움로그 이용약관',
    message: `<div class="terms-modal-body">${TERMS_HTML}</div>`
  });
}

function openPrivacyModal() {
  showModal({
    type: 'alert',
    icon: '🔐',
    title: '배움로그 개인정보처리방침',
    message: `<div class="terms-modal-body">${PRIVACY_HTML}</div>`
  });
}
