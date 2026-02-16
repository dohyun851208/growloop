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
let studentPartner = null; // 8-type growth partner cache

let latestPartnerGoalSuggestion = ''; // latest actionable goal extracted from partner message

// 교사용(스스로배움) - 교과세특 생성 상태
let teacherDiarySelectedStudentId = null;
let currentTeacherDiarySubTab = 'overview'; // overview | student | comment
let teacherSubjectCommentSemester = 1;
let teacherSubjectCommentSelectedSubject = '';
let teacherSubjectCommentLastGenerated = null; // { mode, text, noteCount, key, items[] }
let teacherSubjectCommentSettingsSaveTimer = null;
let teacherSubjectCommentLastSettings = null; // cached class settings
const TEACHER_SUBJECT_COMMENT_ALL_STUDENTS = '__ALL_STUDENTS__';

// 자기평가 전역 변수
let selectedSubjectTags = [];
let currentMessageMode = null; // 'anonymous' or 'named'
const OTHER_SUBJECT_TAG = '기타';
const PRESET_SUBJECT_TAGS = [
  '국어', '수학', '사회', '과학', '영어', '음악', '미술',
  '체육', '도덕', '실과', '기술', '가정', '통합교과', '토론', '발표', '모둠활동', OTHER_SUBJECT_TAG
];

let quizAnswers = {}; // 성향 진단 답변 저장
let studentPersonality = null; // 학생 성향 정보

// 체험 모드 전역 변수
let isDemoMode = false;
let demoRole = null;
const DEMO_FIXED_QUERY_DATE = '2026-03-01';
const DEMO_PERSONALITY_STORAGE_KEY = 'demo_student_personality_v2';
const DEMO_PERSONALITY_STORAGE_KEY_LEGACY = 'demo_student_personality_v1';
function loadDemoPersonalityFromStorage() {
  try {
    const raw = sessionStorage.getItem(DEMO_PERSONALITY_STORAGE_KEY) || sessionStorage.getItem(DEMO_PERSONALITY_STORAGE_KEY_LEGACY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    // Only accept v2+ partner payload.
    if (parsed.partner_type_code && Number(parsed.partner_version || 0) >= 2) return parsed;

    // Legacy format: derive the current partner type only when version is v2.
    if (parsed.question_responses && Number(parsed.partner_version || 0) >= 2) {
      const partner = computePartnerType(parsed.question_responses);
      return {
        ...parsed,
        partner_type_code: partner?.type_code || null,
        partner_type_name: partner?.type_name || null,
        partner_axes: partner ? { ...(partner.axes_raw || {}) } : null,
        partner_version: partner?.partner_version || null
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

function saveDemoPersonalityToStorage(personality) {
  if (!personality) return;
  if (!personality.partner_type_code && !personality.question_responses) return;
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

function setAppLayoutMode(mode = 'default') {
  const body = document.body;
  if (!body) return;
  body.classList.remove('student-layout', 'teacher-layout');
  if (mode === 'student') body.classList.add('student-layout');
  if (mode === 'teacher') body.classList.add('teacher-layout');
}

function showRoleSelectInApp() {
  const loadingSec = document.getElementById('authLoadingSection');
  if (!loadingSec) return;
  setAppLayoutMode('default');
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

function ensureSubjectTagButtons() {
  const container = document.querySelector('#dailyReflectionTab .subject-tags');
  if (!container) return;

  const orderedTags = [
    '국어', '수학', '사회', '과학', '영어', '음악', '미술',
    '체육', '도덕', '실과', '기술', '가정', '통합교과', '토론', '발표', '모둠활동', OTHER_SUBJECT_TAG
  ];
  const iconMap = {
    '국어': '📖',
    '수학': '🔢',
    '사회': '🌍',
    '과학': '🔬',
    '영어': '🔤',
    '음악': '🎵',
    '미술': '🎨',
    '체육': '⚽',
    '도덕': '💛',
    '실과': '🔧',
    '기술': '🛠️',
    '가정': '🏠',
    '통합교과': '🧩',
    '토론': '💬',
    '발표': '🎤',
    '모둠활동': '👥',
    [OTHER_SUBJECT_TAG]: '✨'
  };

  container.innerHTML = '';
  orderedTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'subject-tag-btn';
    btn.onclick = () => toggleSubjectTag(tag);
    btn.textContent = `${iconMap[tag] || '📌'} ${tag}`;
    container.appendChild(btn);
  });
}

function ensureCustomSubjectInput() {
  const tagsContainer = document.querySelector('#dailyReflectionTab .subject-tags');
  if (!tagsContainer || !tagsContainer.parentElement) return;

  let wrap = getCustomSubjectWrapEl();
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'customSubjectWrap';
    wrap.className = 'hidden';
  }

  let input = getCustomSubjectInputEl();
  if (!input) {
    input = document.createElement('input');
    input.type = 'text';
    input.id = 'customSubjectInput';
    input.placeholder = '기타 활동을 직접 입력하세요 (예: 물리, 세계사, 미적분)';
    input.className = 'class-tone-input';
    wrap.appendChild(input);
  } else if (input.parentElement !== wrap) {
    wrap.appendChild(input);
  }

  const parent = tagsContainer.parentElement;
  if (wrap.parentElement !== parent || tagsContainer.nextSibling !== wrap) {
    parent.insertBefore(wrap, tagsContainer.nextSibling);
  }
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
        setAppLayoutMode('student');
        document.getElementById('studentOnboardingSection').classList.remove('hidden');
      } else {
        setAppLayoutMode('teacher');
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
      setAppLayoutMode('teacher');
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
      setAppLayoutMode('student');
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
        renderTargetGrid(isDemoMode ? 24 : 30, currentStudent.id, [], currentStudent.type);
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

// 체험 모드 DB 프록시 설치 - 모든 write 차단, read는 Supabase 직통
function installDemoDbProxy() {
  const originalFrom = db.from.bind(db);

  db.from = function (tableName) {
    function createFakeWriteChain() {
      const chainMethods = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'or', 'in', 'is', 'order', 'limit', 'select', 'maybeSingle', 'single'];
      const fakeChain = {};
      chainMethods.forEach(m => { fakeChain[m] = function () { return fakeChain; }; });
      fakeChain.then = function (resolve) { return resolve({ data: null, error: null, count: 0 }); };
      fakeChain.catch = function () { return Promise.resolve({ data: null, error: null }); };
      return fakeChain;
    }

    const real = originalFrom(tableName);
    return {
      select: function (...args) { return real.select(...args); },
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
    setAppLayoutMode('student');
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
    setAppLayoutMode('teacher');
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
  banner.innerHTML = '🎮 체험 모드 (' + roleText + ')' + ' - 데이터는 저장되지 않습니다 ' +
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
  } catch (err) { console.warn('getClassInfo error:', err); return null; }
}
async function getClassSettings() {
  try {
    if (isDemoMode) return { studentCount: 24, groupCount: 6 };
    const info = await getClassInfo();
    return { studentCount: info ? info.student_count : 30, groupCount: info ? info.group_count : 6 };
  } catch (err) { console.warn('getClassSettings error:', err); return isDemoMode ? { studentCount: 24, groupCount: 6 } : { studentCount: 30, groupCount: 6 }; }
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

function looksLikeCutOffKorean(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[.!?…]$/.test(t)) return false;
  if (/(다|요|임|함|됨|음)$/.test(t)) return false;
  if (/[)\]」』"']$/.test(t)) return false;
  return true;
}

function sanitizeAiSummaryText(text) {
  let t = String(text || '').trim();
  if (!t) return '';
  // Remove internal helper labels if model echoes them.
  t = t.replace(/^\s*\[(수정본|TEXT|원문)\]\s*/i, '');
  t = t.replace(/^\s*(수정본|수정 결과|결과)\s*[:：]\s*/i, '');
  t = t.replace(/^\s*```(?:markdown|md|text)?\s*/i, '').replace(/\s*```\s*$/i, '');
  return t.trim();
}

function isWeakSummaryOutput(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  const len = t.replace(/\s+/g, ' ').trim().length;
  const headerCount = (t.match(/^##\s+/gm) || []).length;
  // Too short, missing 3 headers, or obviously unfinished ending.
  if (len < 120) return true;
  if (headerCount < 3) return true;
  if (looksLikeCutOffKorean(t)) return true;
  return false;
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
  const dateInputs = ['reviewDate', 'viewDate', 'teacherDate', 'settingDate', 'selfDate', 'diaryViewDate', 'diaryStudentViewDate', 'messageViewDate'];
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
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('student_id', currentStudent.id)
      .maybeSingle();

    if (!personality) {
      area.innerHTML = '<p class="settings-personality-empty">아직 진단하지 않았어요.<br>자기평가 탭에서 진단을 시작해보세요!</p>';
      return;
    }

    const partner = getPartnerFromPersonalityRow(personality);
    if (partner && partner.type_code) {
      // Cache for later AI usage in this session
      studentPersonality = personality;
      studentPartner = partner;

      const axisBadges = partner.axes ? Object.values(partner.axes) : [];

      let html = `
        <div class="settings-partner-summary">
          <div class="settings-partner-emoji">${partner.emoji || '🧠'}</div>
          <div class="settings-partner-title">나의 성장 파트너: ${escapeHtml(partner.type_name)}</div>
          ${axisBadges.length ? `<div class="settings-partner-badge-list">${axisBadges.map(b => `<span class="settings-partner-badge">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
        </div>
      `;

      html += '<div class="settings-partner-section-title">📌 전체 성장 파트너 유형</div>';
      html += '<div class="settings-partner-type-grid">';
      PARTNER_TYPES.forEach(t => {
        const isMine = t.type_code === partner.type_code;
        html += `<div class="settings-partner-type-item${isMine ? ' is-mine' : ''}">
          <div class="settings-partner-type-emoji">${t.emoji || '🧠'}</div>
          <div class="settings-partner-type-name">${escapeHtml(t.type_name)}${isMine ? ' ✓' : ''}</div>
        </div>`;
      });
      html += '</div>';

      // 질문별 응답 표시
      if (personality.question_responses) {
        html += '<div class="settings-partner-section-title">📋 나의 응답</div>';
        personalityQuestions.forEach(q => {
          const answer = personality.question_responses[q.id];
          if (answer) {
            const chosen = answer === 'A' ? q.optionA : q.optionB;
            const notChosen = answer === 'A' ? q.optionB : q.optionA;
            html += `
              <div class="settings-partner-answer-item">
                <div class="settings-partner-question">Q${q.id}. ${q.question}</div>
                <div class="settings-partner-selected">✓ ${answer}. ${chosen.text}</div>
                <div class="settings-partner-unselected">${answer === 'A' ? 'B' : 'A'}. ${notChosen.text}</div>
              </div>
            `;
          }
        });
      }

      html += '<button type="button" onclick="resetPersonalityFromSettings()" class="settings-partner-reset-btn">다시 진단하기</button>';

      area.innerHTML = html;
      return;
    }
    area.innerHTML = '<p class="settings-personality-empty">저장된 진단이 현재 버전과 달라요.<br>자기평가 탭에서 다시 진단해 주세요.</p>';
  } catch (err) {
    console.error('성향 정보 로드 오류:', err);
    area.innerHTML = '<p class="settings-personality-empty">성향 정보를 불러올 수 없습니다.</p>';
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
          renderTargetGrid(isDemoMode ? 24 : 30, currentStudent.id, [], currentStudent.type);
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

function switchTeacherDiarySubTab(tab) {
  const t = String(tab || '').trim();
  const map = {
    overview: 'teacherDiaryOverviewTab',
    student: 'teacherDiaryStudentTab',
    comment: 'teacherDiaryCommentTab'
  };

  Object.values(map).forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  const selId = map[t] || map.overview;
  document.getElementById(selId)?.classList.remove('hidden');

  const btns = document.querySelectorAll('#diaryMiniTab .sub-tab-btn');
  btns.forEach(b => b.classList.remove('active'));
  const idx = t === "student" ? 1 : (t === "comment" ? 2 : 0);
  if (btns[idx]) btns[idx].classList.add('active');

  currentTeacherDiarySubTab = (map[t] ? t : 'overview');

  // Lazy-init the heavy section.
  if (currentTeacherDiarySubTab === "comment") {
    refreshTeacherSubjectCommentActions?.();
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
    switchTeacherDiarySubTab('overview');
    initDiaryDate();
    loadTeacherDiaryData();
  } else if (mode === 'praise') {
    mainTabBtns[2].classList.add('active-nav');
    document.getElementById('rankStudentArea').style.display = 'none';
    const el = document.getElementById('praiseMiniTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content');
    loadPraiseStats(); loadPendingPraises(); loadApprovedPraises(); loadAutoApproveStatus(); initMessageDate(); loadTeacherMessages();
    switchTeacherPraiseSubTab('praise');
  } else if (mode === 'settings') {
    mainTabBtns[3].classList.add('active-nav');
    document.getElementById('rankStudentArea').style.display = 'none';
    const el = document.getElementById('settingsMiniTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content');
    loadClassSettingsUI(); loadStudentMappingData();
  }
}

function normalizeSchoolLevel(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (s === '초' || s === '중' || s === '고') return s;
  if (s.includes('초')) return '초';
  if (s.includes('중')) return '중';
  if (s.includes('고')) return '고';
  return '';
}

function getTeacherSubjectCommentKey({ classCode, studentId, semester, subject }) {
  return [String(classCode || ''), String(studentId || ''), String(semester || ''), String(subject || '')].join('|');
}

function initTeacherSubjectCommentUI() {
  const sec = document.getElementById('teacherSubjectCommentSection');
  if (!sec) return;
  if (sec.dataset.bound === '1') return;
  sec.dataset.bound = '1';

  const sl = document.getElementById('teacherSubjectCommentSchoolLevel');
  const startEl = document.getElementById('teacherSubjectCommentStart');
  const endEl = document.getElementById('teacherSubjectCommentEnd');
  const customSubjectEl = document.getElementById('teacherSubjectCommentCustomSubjectInput');
  bindTeacherSubjectCommentStudentMenu();

  sl?.addEventListener('change', () => {
    queueSaveTeacherSubjectCommentSettings();
    refreshTeacherSubjectCommentActions();
    loadTeacherSavedSubjectComment();
  });
  startEl?.addEventListener('change', () => {
    queueSaveTeacherSubjectCommentSettings();
    refreshTeacherSubjectCommentSubjects();
    refreshTeacherSubjectCommentActions();
    loadTeacherSavedSubjectComment();
  });
  endEl?.addEventListener('change', () => {
    queueSaveTeacherSubjectCommentSettings();
    refreshTeacherSubjectCommentSubjects();
    refreshTeacherSubjectCommentActions();
    loadTeacherSavedSubjectComment();
  });
  customSubjectEl?.addEventListener('input', () => {
    refreshTeacherSubjectCommentActions();
  });
  customSubjectEl?.addEventListener('change', () => {
    refreshTeacherSubjectCommentActions();
    loadTeacherSavedSubjectComment();
  });

  setTeacherSubjectCommentSemester(1);
  renderTeacherSubjectCommentSubjectTags(PRESET_SUBJECT_TAGS);
  syncTeacherSubjectCommentCustomSubjectVisibility();
  syncTeacherSubjectCommentStudentMenuSelection();
  refreshTeacherSubjectCommentActions();

  setTimeout(() => { loadTeacherSubjectCommentSettings(); }, 0);
}

function setTeacherSubjectCommentSemester(n) {
  teacherSubjectCommentSemester = (Number(n) === 2) ? 2 : 1;
  const b1 = document.getElementById('teacherSubjectCommentSemester1');
  const b2 = document.getElementById('teacherSubjectCommentSemester2');
  b1?.classList.toggle('active', teacherSubjectCommentSemester === 1);
  b2?.classList.toggle('active', teacherSubjectCommentSemester === 2);

  applyTeacherSemesterDatesFromCache();
  queueSaveTeacherSubjectCommentSettings();
  refreshTeacherSubjectCommentSubjects();
  refreshTeacherSubjectCommentActions();
  loadTeacherSavedSubjectComment();
}

function applyTeacherSemesterDatesFromCache() {
  if (!teacherSubjectCommentLastSettings) return;
  const startEl = document.getElementById('teacherSubjectCommentStart');
  const endEl = document.getElementById('teacherSubjectCommentEnd');
  if (!startEl || !endEl) return;

  const start = teacherSubjectCommentSemester === 1 ? teacherSubjectCommentLastSettings.semester1_start : teacherSubjectCommentLastSettings.semester2_start;
  const end = teacherSubjectCommentSemester === 1 ? teacherSubjectCommentLastSettings.semester1_end : teacherSubjectCommentLastSettings.semester2_end;
  if (start && !startEl.value) startEl.value = start;
  if (end && !endEl.value) endEl.value = end;
}

async function loadTeacherSubjectCommentSettings() {
  const sl = document.getElementById('teacherSubjectCommentSchoolLevel');
  if (!sl) return;

  try {
    const info = await getClassInfo();
    if (!info) return;
    teacherSubjectCommentLastSettings = info;

    const mapped = normalizeSchoolLevel(info.school_level || '');
    if (mapped && !sl.value) sl.value = mapped;

    applyTeacherSemesterDatesFromCache();
    refreshTeacherSubjectCommentSubjects();
    refreshTeacherSubjectCommentActions();
  } catch (err) {
    console.warn('Failed to load teacher subject comment settings:', err);
  }
}

function queueSaveTeacherSubjectCommentSettings() {
  if (isDemoMode) return;
  if (!currentClassCode) return;

  const sl = document.getElementById('teacherSubjectCommentSchoolLevel');
  const startEl = document.getElementById('teacherSubjectCommentStart');
  const endEl = document.getElementById('teacherSubjectCommentEnd');
  if (!sl || !startEl || !endEl) return;

  const schoolLevel = normalizeSchoolLevel(sl.value);
  const start = startEl.value || null;
  const end = endEl.value || null;

  clearTimeout(teacherSubjectCommentSettingsSaveTimer);
  teacherSubjectCommentSettingsSaveTimer = setTimeout(async () => {
    const patch = {};
    if (schoolLevel) patch.school_level = schoolLevel;
    if (teacherSubjectCommentSemester === 1) {
      if (start) patch.semester1_start = start;
      if (end) patch.semester1_end = end;
    } else {
      if (start) patch.semester2_start = start;
      if (end) patch.semester2_end = end;
    }
    if (Object.keys(patch).length === 0) return;

    try {
      const { error } = await db.from('classes').update(patch).eq('class_code', currentClassCode);
      if (error) throw error;
      if (teacherSubjectCommentLastSettings) teacherSubjectCommentLastSettings = { ...teacherSubjectCommentLastSettings, ...patch };
    } catch (err) {
      console.warn('Failed to save teacher subject comment settings:', err);
      showModal({
        type: 'alert',
        icon: '⚠️',
        title: '설정 저장 실패',
        message: '학교급/학기 기간을 저장할 수 없습니다. Supabase에 스키마 업데이트(컬럼 추가)가 필요합니다.<br><br><small>classes.school_level / semester1_start / semester1_end / semester2_start / semester2_end</small>'
      });
    }
  }, 600);
}

function getTeacherSubjectCommentCustomSubjectInputEl() {
  return document.getElementById('teacherSubjectCommentCustomSubjectInput');
}

function getTeacherSubjectCommentOrderedSubjects(subjects) {
  const presetBase = PRESET_SUBJECT_TAGS.filter(t => t !== OTHER_SUBJECT_TAG);
  const source = Array.isArray(subjects) ? subjects : [];
  const unique = Array.from(new Set(source.map(s => String(s || '').trim()).filter(Boolean)));

  const known = presetBase.filter(t => unique.includes(t));
  const custom = unique.filter(t => !presetBase.includes(t) && t !== OTHER_SUBJECT_TAG);
  const ordered = (known.length + custom.length > 0) ? [...known, ...custom] : [...presetBase];

  if (!ordered.includes(OTHER_SUBJECT_TAG)) ordered.push(OTHER_SUBJECT_TAG);
  return ordered;
}

function syncTeacherSubjectCommentCustomSubjectVisibility({ clearOnHide = false, focusOnShow = false } = {}) {
  const wrap = document.getElementById('teacherSubjectCommentCustomSubjectWrap');
  const input = getTeacherSubjectCommentCustomSubjectInputEl();
  if (!wrap || !input) return;

  const shouldShow = String(teacherSubjectCommentSelectedSubject || '').trim() === OTHER_SUBJECT_TAG;
  wrap.classList.toggle('hidden', !shouldShow);
  if (!shouldShow && clearOnHide) input.value = '';
  if (shouldShow && focusOnShow) input.focus();
}

function bindTeacherSubjectCommentStudentMenu() {
  const picker = document.getElementById('teacherSubjectCommentStudentPicker');
  if (!picker) return;
  if (picker.dataset.bound === '1') return;
  picker.dataset.bound = '1';

  document.addEventListener('click', (event) => {
    if (!picker.contains(event.target)) closeTeacherSubjectCommentStudentMenu();
  });

  renderTeacherSubjectCommentStudentMenu();
}

async function renderTeacherSubjectCommentStudentMenu() {
  const menu = document.getElementById('teacherSubjectCommentStudentMenu');
  if (!menu) return;

  const settings = await getClassSettings().catch(() => ({ studentCount: 30 }));
  const countRaw = Number(settings?.studentCount || 30);
  const count = Math.max(1, Number.isFinite(countRaw) ? Math.floor(countRaw) : 30);

  menu.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'teacher-subject-comment-student-option';
  allBtn.dataset.studentId = TEACHER_SUBJECT_COMMENT_ALL_STUDENTS;
  allBtn.textContent = '전체';
  allBtn.onclick = (event) => {
    event.stopPropagation();
    setTeacherSubjectCommentSelectedStudent(TEACHER_SUBJECT_COMMENT_ALL_STUDENTS);
    closeTeacherSubjectCommentStudentMenu();
  };
  menu.appendChild(allBtn);

  for (let i = 1; i <= count; i++) {
    const sid = String(i);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'teacher-subject-comment-student-option';
    btn.dataset.studentId = sid;
    btn.textContent = sid + '번';
    btn.onclick = (event) => {
      event.stopPropagation();
      setTeacherSubjectCommentSelectedStudent(sid);
      closeTeacherSubjectCommentStudentMenu();
    };
    menu.appendChild(btn);
  }
  syncTeacherSubjectCommentStudentMenuSelection();
}

function syncTeacherSubjectCommentStudentMenuSelection() {
  const trigger = document.getElementById('teacherSubjectCommentStudent');
  const menu = document.getElementById('teacherSubjectCommentStudentMenu');
  const sid = String(teacherDiarySelectedStudentId || '').trim();

  if (trigger) trigger.classList.toggle('is-empty', !sid);
  if (!menu) return;
  menu.querySelectorAll('.teacher-subject-comment-student-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.studentId === sid);
  });
}

async function toggleTeacherSubjectCommentStudentMenu() {
  const menu = document.getElementById('teacherSubjectCommentStudentMenu');
  if (!menu) return;

  if (menu.classList.contains('hidden')) {
    await renderTeacherSubjectCommentStudentMenu();
    menu.classList.remove('hidden');
    return;
  }
  closeTeacherSubjectCommentStudentMenu();
}

function closeTeacherSubjectCommentStudentMenu() {
  const menu = document.getElementById('teacherSubjectCommentStudentMenu');
  if (!menu) return;
  menu.classList.add('hidden');
}

function setTeacherSubjectCommentSelectedStudent(studentId) {
  teacherDiarySelectedStudentId = String(studentId || '').trim() || null;
  const pill = document.getElementById('teacherSubjectCommentStudent');
  if (pill) {
    if (!teacherDiarySelectedStudentId) pill.textContent = '미선택';
    else if (teacherDiarySelectedStudentId === TEACHER_SUBJECT_COMMENT_ALL_STUDENTS) pill.textContent = '전체';
    else pill.textContent = teacherDiarySelectedStudentId + '번';
  }
  syncTeacherSubjectCommentStudentMenuSelection();

  teacherSubjectCommentLastGenerated = null;
  setTeacherSubjectCommentStatus('');
  setTeacherSubjectCommentResult(null, { resetEmpty: true });
  const noteCountEl = document.getElementById('teacherSubjectCommentNoteCount');
  if (noteCountEl) noteCountEl.textContent = '-';

  refreshTeacherSubjectCommentSubjects();
  refreshTeacherSubjectCommentActions();
  loadTeacherSavedSubjectComment();
}

function getTeacherSubjectCommentUIValues() {
  const sl = document.getElementById('teacherSubjectCommentSchoolLevel');
  const startEl = document.getElementById('teacherSubjectCommentStart');
  const endEl = document.getElementById('teacherSubjectCommentEnd');
  const schoolLevel = normalizeSchoolLevel(sl?.value || '');
  const start = String(startEl?.value || '').trim();
  const end = String(endEl?.value || '').trim();
  const rawSubject = String(teacherSubjectCommentSelectedSubject || '').trim();
  const customSubjectRaw = String(getTeacherSubjectCommentCustomSubjectInputEl()?.value || '').trim();
  const customSubject = customSubjectRaw ? String(customSubjectRaw.split(',')[0] || '').trim() : '';
  const subject = rawSubject === OTHER_SUBJECT_TAG ? (customSubject || OTHER_SUBJECT_TAG) : rawSubject;
  const studentId = String(teacherDiarySelectedStudentId || '').trim();
  const isAllStudents = studentId === TEACHER_SUBJECT_COMMENT_ALL_STUDENTS;
  return { schoolLevel, start, end, subject, rawSubject, customSubject, studentId, isAllStudents, semester: teacherSubjectCommentSemester };
}

function refreshTeacherSubjectCommentActions() {
  const genBtn = document.getElementById('teacherSubjectCommentGenerateBtn');
  const regenBtn = document.getElementById('teacherSubjectCommentRegenerateBtn');
  const copyBtn = document.getElementById('teacherSubjectCommentCopyBtn');
  const saveBtn = document.getElementById('teacherSubjectCommentSaveBtn');
  const exportBtn = document.getElementById('teacherSubjectCommentExportBtn');

  const { schoolLevel, start, end, subject, studentId } = getTeacherSubjectCommentUIValues();
  const ready = !!(schoolLevel && start && end && subject && studentId);

  if (genBtn) genBtn.disabled = !ready;
  if (regenBtn) regenBtn.disabled = !ready;
  if (copyBtn) copyBtn.disabled = !(teacherSubjectCommentLastGenerated && teacherSubjectCommentLastGenerated.text);
  if (saveBtn) saveBtn.disabled = !(teacherSubjectCommentLastGenerated && teacherSubjectCommentLastGenerated.text);
  if (exportBtn) exportBtn.disabled = !currentClassCode;
}

function renderTeacherSubjectCommentSubjectTags(subjects) {
  const wrap = document.getElementById('teacherSubjectCommentSubjectTags');
  if (!wrap) return;
  wrap.innerHTML = '';

  (subjects || []).forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'subject-tag-btn';
    btn.textContent = String(tag);
    btn.onclick = () => {
      teacherSubjectCommentSelectedSubject = String(tag);
      wrap.querySelectorAll('.subject-tag-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      syncTeacherSubjectCommentCustomSubjectVisibility({ focusOnShow: String(tag) === OTHER_SUBJECT_TAG });
      refreshTeacherSubjectCommentActions();
      loadTeacherSavedSubjectComment();
    };
    wrap.appendChild(btn);
  });
}

async function refreshTeacherSubjectCommentSubjects() {
  const { start, end, studentId } = getTeacherSubjectCommentUIValues();
  const fallback = getTeacherSubjectCommentOrderedSubjects([]);

  const applySubjectTags = (subjects) => {
    const chosen = getTeacherSubjectCommentOrderedSubjects(subjects);
    renderTeacherSubjectCommentSubjectTags(chosen);

    if (teacherSubjectCommentSelectedSubject && chosen.includes(teacherSubjectCommentSelectedSubject)) {
      const wrap = document.getElementById('teacherSubjectCommentSubjectTags');
      const btn = Array.from(wrap?.querySelectorAll('.subject-tag-btn') || []).find(b => b.textContent === teacherSubjectCommentSelectedSubject);
      if (btn) btn.classList.add('selected');
    } else {
      teacherSubjectCommentSelectedSubject = '';
      refreshTeacherSubjectCommentActions();
    }
    syncTeacherSubjectCommentCustomSubjectVisibility();
  };

  if (!start || !end || !studentId || !currentClassCode) {
    applySubjectTags(fallback);
    return;
  }

  try {
    const records = await fetchTeacherLearningNotes({ studentId, start, end });
    const set = new Set();
    records.forEach(r => {
      const tags = Array.isArray(r.subject_tags) ? r.subject_tags : [];
      tags.forEach(t => { if (t) set.add(String(t)); });
    });

    const subjects = Array.from(set);
    applySubjectTags(subjects);
  } catch (err) {
    console.warn('Failed to refresh subject tags:', err);
    applySubjectTags(fallback);
  }
}

async function fetchTeacherLearningNotes({ studentId, start, end }) {
  let q = db.from('daily_reflections')
    .select('student_id, reflection_date, learning_text, subject_tags')
    .eq('class_code', currentClassCode)
    .gte('reflection_date', start)
    .lte('reflection_date', end);

  if (studentId && String(studentId) !== TEACHER_SUBJECT_COMMENT_ALL_STUDENTS) {
    q = q.eq('student_id', String(studentId));
  }

  const { data, error } = await q.order('reflection_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

function setTeacherSubjectCommentStatus(text) {
  const el = document.getElementById('teacherSubjectCommentStatus');
  if (!el) return;
  el.textContent = text || '';
}

function setTeacherSubjectCommentResult(text, { resetEmpty = false } = {}) {
  const empty = document.getElementById('teacherSubjectCommentEmpty');
  const pre = document.getElementById('teacherSubjectCommentResult');
  const err = document.getElementById('teacherSubjectCommentError');
  const retry = document.getElementById('teacherSubjectCommentRetry');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  if (retry) retry.classList.add('hidden');

  if (!pre || !empty) return;
  if (!text) {
    pre.classList.add('hidden');
    if (resetEmpty) empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  pre.classList.remove('hidden');
  pre.textContent = String(text);
}

function setTeacherSubjectCommentError(message, { showRetry = true } = {}) {
  const err = document.getElementById('teacherSubjectCommentError');
  const retry = document.getElementById('teacherSubjectCommentRetry');
  if (err) {
    err.textContent = String(message || '');
    err.style.display = 'block';
  }
  if (retry) retry.classList.toggle('hidden', !showRetry);
}

function validateSubjectCommentOutput(text, schoolLevel) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, reasons: ['empty'] };

  const lines = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const lvl = normalizeSchoolLevel(schoolLevel);
  const range = (lvl === '초') ? [2, 4] : (lvl === '중') ? [3, 5] : [4, 6];

  const reasons = [];
  if (lines.length < range[0] || lines.length > range[1]) reasons.push('sentence_count');

  const firstPersonRe = /(나|저|제가|나는|저는|내가|내\s|제\s|우리|저의|우리의)/;
  const endingRe = /(함|임|음|됨)\s*$/;

  const competencyKeywords = [
    '자기주도', '탐구', '비판', '비판적', '정보', '정보활용', '논리', '표현', '호기심', '성실', '책임감', '협력', '성찰', '문제해결', '의사소통'
  ];
  const foundCompetencies = new Set();

  for (const l of lines) {
    const line = l.replace(/[.。]\s*$/, '').trim();
    if (!endingRe.test(line)) reasons.push('ending');
    if (firstPersonRe.test(line)) reasons.push('first_person');
    competencyKeywords.forEach(k => { if (line.includes(k)) foundCompetencies.add(k); });
  }
  if (foundCompetencies.size < 2) reasons.push('competency');

  return { ok: reasons.length === 0, reasons: Array.from(new Set(reasons)) };
}

function buildSubjectCommentPromptBase({ schoolLevel, subject, noteCount, start, end }) {
  const lvl = normalizeSchoolLevel(schoolLevel);
  const sentences = (lvl === '초') ? '2~4문장' : (lvl === '중') ? '3~5문장' : '4~6문장';

  return (
    '역할: 교사가 생활기록부 교과 세부 특기 사항(평어)을 작성하는 상황임.\n' +
    '목표: 아래 배움노트 기록을 근거로 ' + subject + ' 과목 교과세특 문장을 생성함.\n\n' +
    '[입력 정보]\n' +
    '- 학교급: ' + lvl + '\n' +
    '- 과목: ' + subject + '\n' +
    '- 기간: ' + start + ' ~ ' + end + '\n' +
    '- 배움노트_건수(과목 필터 적용): ' + noteCount + '건\n\n' +
    '[출력 규칙(반드시 준수)]\n' +
    '1) 교사의 관찰 기반 문장으로 작성함. 학생 자기서술/1인칭(나/저/우리/제가 등) 사용 금지함.\n' +
    '2) 주어 노출 최소화함(“학생은/OO는” 같은 주어 반복 지양함).\n' +
    '3) 모든 문장은 반드시 “~함/~임/~음/~됨”으로 종결함.\n' +
    '4) 생활기록부 톤을 유지함(과장/홍보 문구 지양함).\n' +
    '5) 반드시 포함함:\n' +
    '   - 주제/개념(무엇을 탐구/학습했는지) 1개 이상 포함함.\n' +
    '   - 학습 과정(어려움 해결/이해 확장/적용) 흐름이 드러나야 함.\n' +
    '   - 역량/태도 2개 이상 포함함(예: 자기주도성/탐구/비판적 사고/정보 활용/논리적 표현/호기심/성실/책임감 등).\n' +
    '   - 배움노트 기반 구체 근거 1개 이상 포함함(기록에 나온 활동/전략/오류 수정 등).\n' +
    '6) 문장 수: ' + sentences + ' 범위로 작성함.\n' +
    '7) 출력 형식: 번호/불릿/마크다운 없이 문장만 줄바꿈으로 나열함.\n'
  );
}

function buildSubjectCommentPromptStyle(schoolLevel) {
  const lvl = normalizeSchoolLevel(schoolLevel);
  if (lvl === '초') {
    return (
      '\n[STYLE - 초]\n' +
      '- 쉬운 어휘를 사용함.\n' +
      '- 과정과 태도 중심으로 작성함.\n' +
      '- 2~4문장으로 간결히 작성함.\n'
    );
  }
  if (lvl === '중') {
    return (
      '\n[STYLE - 중]\n' +
      '- 교과 용어를 적당히 사용함.\n' +
      '- 학습 방법과 성장 내용을 균형 있게 작성함.\n' +
      '- 3~5문장으로 작성함.\n'
    );
  }
  return (
    '\n[STYLE - 고]\n' +
    '- 심화/논증 어휘 사용을 허용함.\n' +
    '- 근거의 구체성과 역량을 강조함.\n' +
    '- 4~6문장으로 작성함.\n'
  );
}

function truncateText(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + '…';
}

function isTeacherSubjectCommentTagMatch(tags, { rawSubject, subject, customSubject }) {
  const normalizedTags = Array.isArray(tags) ? tags.map(t => String(t || '').trim()).filter(Boolean) : [];
  if (normalizedTags.length === 0) return false;

  if (String(rawSubject || '').trim() === OTHER_SUBJECT_TAG) {
    const custom = String(customSubject || '').trim();
    if (custom) return normalizedTags.includes(custom);
    const hasCustomTag = normalizedTags.some(tag => !PRESET_SUBJECT_TAGS.includes(tag));
    return normalizedTags.includes(OTHER_SUBJECT_TAG) || hasCustomTag;
  }

  return normalizedTags.includes(String(subject || '').trim());
}

async function generateTeacherSubjectCommentTextFromNotes({ filteredNotes, schoolLevel, subject, start, end }) {
  const notes = Array.isArray(filteredNotes) ? filteredNotes : [];
  const noteCount = notes.length;
  if (noteCount === 0) {
    return { ok: false, type: 'no_notes', noteCount: 0 };
  }

  const evidence = notes.slice(0, 12).map(r => {
    const d = String(r.reflection_date || '').slice(0, 10);
    const lt = truncateText(r.learning_text, 160);
    return d + ': ' + lt;
  });

  const base = buildSubjectCommentPromptBase({ schoolLevel, subject, noteCount, start, end });
  const style = buildSubjectCommentPromptStyle(schoolLevel);
  const prompt =
    base +
    style +
    '\n[배움노트 근거]\n' +
    evidence.join('\n') +
    '\n\n[출력]\n';

  const result = await callGemini(prompt, { generationConfig: { temperature: 0.4, maxOutputTokens: 700 } });
  if (!result.ok) return { ok: false, type: 'api', noteCount, error: result.error || 'AI 생성 실패' };

  let out = String(result.text || '').trim();
  out = out.replace(/^\s*[-*•]\s*/gm, '').replace(/^\s*\d+[.)]\s*/gm, '').trim();

  let validation = validateSubjectCommentOutput(out, schoolLevel);
  let tries = 0;

  while (!validation.ok && tries < 2) {
    tries++;
    const reasons = validation.reasons.join(', ');
    const fixPrompt =
      '다음 문장을 규칙에 맞게 다시 작성함.\n\n' +
      '[규칙 요약]\n' +
      '- 1인칭 금지, 주어 최소화함.\n' +
      '- 모든 문장 “~함/~임/~음/~됨” 종결함.\n' +
      '- 학교급 문장 수 범위 준수함.\n' +
      '- 역량/태도 2개 이상 포함함.\n' +
      '- 배움노트 근거 1개 이상 포함함.\n' +
      '- 번호/불릿 없이 문장만 줄바꿈 출력함.\n\n' +
      '[학교급]\n' + normalizeSchoolLevel(schoolLevel) + '\n\n' +
      '[위반 항목]\n' + reasons + '\n\n' +
      '[원문]\n' + out + '\n\n' +
      '[수정본 출력]\n';

    const retry = await callGemini(fixPrompt, { generationConfig: { temperature: 0.2, maxOutputTokens: 700 } });
    if (!retry.ok) break;
    out = String(retry.text || '').trim().replace(/^\s*[-*•]\s*/gm, '').replace(/^\s*\d+[.)]\s*/gm, '').trim();
    validation = validateSubjectCommentOutput(out, schoolLevel);
  }

  if (!validation.ok) {
    return { ok: false, type: 'validation', noteCount, text: out, reasons: validation.reasons };
  }

  return { ok: true, noteCount, text: out };
}

async function generateTeacherSubjectComment(forceRegenerate) {
  const genBtn = document.getElementById('teacherSubjectCommentGenerateBtn');
  const regenBtn = document.getElementById('teacherSubjectCommentRegenerateBtn');
  const btn = forceRegenerate ? regenBtn : genBtn;
  if (!btn) return;

  const { schoolLevel, start, end, subject, rawSubject, customSubject, studentId, isAllStudents, semester } = getTeacherSubjectCommentUIValues();
  if (!studentId) { showModal({ type: 'alert', icon: '⚠️', title: '선택 필요', message: '먼저 학생을 선택해 주세요.' }); return; }
  if (!schoolLevel) { showModal({ type: 'alert', icon: '⚠️', title: '선택 필요', message: '학교급을 선택해 주세요.' }); return; }
  if (!start || !end) { showModal({ type: 'alert', icon: '⚠️', title: '선택 필요', message: '기간(시작일/종료일)을 선택해 주세요.' }); return; }
  if (start > end) { showModal({ type: 'alert', icon: '⚠️', title: '기간 오류', message: '시작일이 종료일보다 늦습니다. 기간을 확인해 주세요.' }); return; }
  if (!subject) { showModal({ type: 'alert', icon: '⚠️', title: '선택 필요', message: '과목 태그를 1개 선택해 주세요.' }); return; }

  setTeacherSubjectCommentStatus('');
  setTeacherSubjectCommentResult(null, { resetEmpty: false });
  const noteCountEl = document.getElementById('teacherSubjectCommentNoteCount');
  if (noteCountEl) noteCountEl.textContent = '-';

  setLoading(true, btn, '생성 중...');

  try {
    const records = await fetchTeacherLearningNotes({ studentId, start, end });

    if (!isAllStudents) {
      const filtered = (records || []).filter(r => {
        const tags = Array.isArray(r.subject_tags) ? r.subject_tags.map(String) : [];
        return isTeacherSubjectCommentTagMatch(tags, { rawSubject, subject, customSubject }) && String(r.learning_text || '').trim().length > 0;
      });

      const noteCount = filtered.length;
      if (noteCountEl) noteCountEl.textContent = String(noteCount);

      if (noteCount === 0) {
        setLoading(false, btn, forceRegenerate ? '재생성' : '생성하기');
        setTeacherSubjectCommentResult(null, { resetEmpty: true });
        setTeacherSubjectCommentError('선택한 기간에 해당 과목 배움노트가 없어 생성할 수 없음. 기간을 조정해 주세요.', { showRetry: false });
        refreshTeacherSubjectCommentActions();
        return;
      }

      const single = await generateTeacherSubjectCommentTextFromNotes({ filteredNotes: filtered, schoolLevel, subject, start, end });
      if (!single.ok) {
        setLoading(false, btn, forceRegenerate ? '재생성' : '생성하기');
        if (single.type === 'validation' && single.text) {
          setTeacherSubjectCommentResult(single.text, { resetEmpty: false });
          setTeacherSubjectCommentError('출력 규칙을 완전히 만족하지 못했습니다. [재시도]를 눌러 다시 생성해 주세요.', { showRetry: true });
        } else {
          setTeacherSubjectCommentResult(null, { resetEmpty: true });
          setTeacherSubjectCommentError('생성 중 오류가 발생했습니다: ' + (single.error || single.type || 'unknown'), { showRetry: true });
        }
        refreshTeacherSubjectCommentActions();
        return;
      }

      teacherSubjectCommentLastGenerated = {
        mode: 'single',
        text: single.text,
        noteCount: single.noteCount,
        key: getTeacherSubjectCommentKey({ classCode: currentClassCode, studentId, semester, subject }),
        items: [{
          studentId: String(studentId),
          noteCount: Number(single.noteCount || 0),
          text: String(single.text || ''),
          key: getTeacherSubjectCommentKey({ classCode: currentClassCode, studentId, semester, subject })
        }]
      };

      setTeacherSubjectCommentResult(single.text, { resetEmpty: false });
      setTeacherSubjectCommentStatus('미저장');

      setLoading(false, btn, forceRegenerate ? '재생성' : '생성하기');
      refreshTeacherSubjectCommentActions();
      return;
    }

    const settings = await getClassSettings().catch(() => ({ studentCount: 30 }));
    const countRaw = Number(settings?.studentCount || 30);
    const totalStudents = Math.max(1, Number.isFinite(countRaw) ? Math.floor(countRaw) : 30);
    const targetStudentIds = [];
    for (let i = 1; i <= totalStudents; i++) targetStudentIds.push(String(i));

    const byStudent = new Map();
    (records || []).forEach(r => {
      const sid = String(r.student_id || '').trim();
      if (!sid) return;
      if (!byStudent.has(sid)) byStudent.set(sid, []);
      byStudent.get(sid).push(r);
    });

    const generatedItems = [];
    let totalNoteCount = 0;
    const failedStudents = [];

    for (let i = 0; i < targetStudentIds.length; i++) {
      const sid = targetStudentIds[i];
      setTeacherSubjectCommentStatus('생성 중 (' + (i + 1) + '/' + targetStudentIds.length + ')');

      const studentNotes = (byStudent.get(sid) || []).filter(r => {
        const tags = Array.isArray(r.subject_tags) ? r.subject_tags.map(String) : [];
        return isTeacherSubjectCommentTagMatch(tags, { rawSubject, subject, customSubject }) && String(r.learning_text || '').trim().length > 0;
      });

      const generated = await generateTeacherSubjectCommentTextFromNotes({ filteredNotes: studentNotes, schoolLevel, subject, start, end });
      if (!generated.ok) {
        failedStudents.push(sid);
        continue;
      }

      totalNoteCount += Number(generated.noteCount || 0);
      generatedItems.push({
        studentId: sid,
        noteCount: Number(generated.noteCount || 0),
        text: String(generated.text || ''),
        key: getTeacherSubjectCommentKey({ classCode: currentClassCode, studentId: sid, semester, subject })
      });
    }

    if (noteCountEl) noteCountEl.textContent = String(totalNoteCount);

    if (generatedItems.length === 0) {
      setLoading(false, btn, forceRegenerate ? '재생성' : '생성하기');
      setTeacherSubjectCommentStatus('');
      setTeacherSubjectCommentResult(null, { resetEmpty: true });
      setTeacherSubjectCommentError('전체 선택 상태에서 생성 가능한 학생이 없습니다. 기간/과목을 조정해 주세요.', { showRetry: false });
      refreshTeacherSubjectCommentActions();
      return;
    }

    const mergedText = generatedItems
      .map(item => '[' + item.studentId + '번 | 배움노트 ' + item.noteCount + '건]\n' + item.text)
      .join('\n\n');

    teacherSubjectCommentLastGenerated = {
      mode: 'all',
      text: mergedText,
      noteCount: totalNoteCount,
      key: '',
      items: generatedItems
    };

    setTeacherSubjectCommentResult(mergedText, { resetEmpty: false });
    setTeacherSubjectCommentStatus('미저장 (' + generatedItems.length + '명)');

    if (failedStudents.length > 0) {
      setTeacherSubjectCommentError(
        '전체 ' + targetStudentIds.length + '명 중 ' + generatedItems.length + '명 생성됨. 일부 학생은 기간/과목 노트 부족으로 제외됨.',
        { showRetry: true }
      );
    }

    setLoading(false, btn, forceRegenerate ? '재생성' : '생성하기');
    refreshTeacherSubjectCommentActions();
  } catch (err) {
    console.error('subject comment generate error:', err);
    setLoading(false, btn, forceRegenerate ? '재생성' : '생성하기');
    setTeacherSubjectCommentError('생성 중 오류가 발생했습니다: ' + (err.message || String(err)), { showRetry: true });
    refreshTeacherSubjectCommentActions();
  }
}

async function loadTeacherSavedSubjectComment() {
  const { studentId, isAllStudents, semester, subject } = getTeacherSubjectCommentUIValues();
  if (!studentId || !subject || !currentClassCode) return;
  if (isDemoMode) return;
  if (isAllStudents) {
    setTeacherSubjectCommentStatus('');
    return;
  }

  try {
    const { data, error } = await db.from('subject_comments')
      .select('generated_text, note_count')
      .eq('class_code', currentClassCode)
      .eq('student_id', String(studentId))
      .eq('semester', Number(semester))
      .eq('subject', String(subject))
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      setTeacherSubjectCommentStatus('');
      return;
    }

    setTeacherSubjectCommentResult(data.generated_text, { resetEmpty: false });
    const noteCountEl = document.getElementById('teacherSubjectCommentNoteCount');
    if (noteCountEl && typeof data.note_count === 'number') noteCountEl.textContent = String(data.note_count);
    setTeacherSubjectCommentStatus('저장됨');

    teacherSubjectCommentLastGenerated = {
      mode: 'single',
      text: data.generated_text,
      noteCount: data.note_count || 0,
      key: getTeacherSubjectCommentKey({ classCode: currentClassCode, studentId, semester, subject }),
      items: [{
        studentId: String(studentId),
        noteCount: Number(data.note_count || 0),
        text: String(data.generated_text || ''),
        key: getTeacherSubjectCommentKey({ classCode: currentClassCode, studentId, semester, subject })
      }]
    };

    refreshTeacherSubjectCommentActions();
  } catch (err) {
    console.warn('Failed to load saved subject comment:', err);
  }
}

async function saveTeacherSubjectComment(btn) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  if (!teacherSubjectCommentLastGenerated || !teacherSubjectCommentLastGenerated.text) return;

  const { schoolLevel, start, end, subject, studentId, isAllStudents, semester } = getTeacherSubjectCommentUIValues();
  if (!schoolLevel || !start || !end || !subject || !studentId) {
    showModal({ type: 'alert', icon: '⚠️', title: '저장 불가', message: '학생/학교급/학기/기간/과목을 모두 선택해 주세요.' });
    return;
  }

  setLoading(true, btn, '저장 중...');

  try {
    const { data: session } = await db.auth.getSession();
    const uid = session?.session?.user?.id || null;

    const items = Array.isArray(teacherSubjectCommentLastGenerated.items) ? teacherSubjectCommentLastGenerated.items : [];
    const payloadRows = [];

    if (isAllStudents) {
      if (items.length === 0) {
        setLoading(false, btn, '저장');
        showModal({ type: 'alert', icon: '⚠️', title: '저장 불가', message: '전체 생성 결과가 없습니다. 먼저 [생성하기]를 실행해 주세요.' });
        return;
      }
      items.forEach(item => {
        const sid = String(item?.studentId || '').trim();
        const text = String(item?.text || '').trim();
        if (!sid || !text) return;
        payloadRows.push({
          class_code: currentClassCode,
          student_id: sid,
          semester: Number(semester),
          subject: String(subject),
          school_level: normalizeSchoolLevel(schoolLevel),
          period_start: start,
          period_end: end,
          note_count: Number(item?.noteCount || 0),
          generated_text: text,
          created_by: uid
        });
      });
    } else {
      payloadRows.push({
        class_code: currentClassCode,
        student_id: String(studentId),
        semester: Number(semester),
        subject: String(subject),
        school_level: normalizeSchoolLevel(schoolLevel),
        period_start: start,
        period_end: end,
        note_count: Number(teacherSubjectCommentLastGenerated.noteCount || 0),
        generated_text: String(teacherSubjectCommentLastGenerated.text),
        created_by: uid
      });
    }

    if (payloadRows.length === 0) {
      setLoading(false, btn, '저장');
      showModal({ type: 'alert', icon: '⚠️', title: '저장 불가', message: '저장할 생성 결과가 없습니다.' });
      return;
    }

    const { error } = await db.from('subject_comments').upsert(payloadRows, { onConflict: 'class_code,student_id,semester,subject' });
    if (error) throw error;

    const savedCount = payloadRows.length;
    setTeacherSubjectCommentStatus(savedCount > 1 ? ('저장됨 (' + savedCount + '명)') : '저장됨');
    setLoading(false, btn, '저장');
    showModal({
      type: 'alert',
      icon: '✅',
      title: '저장 완료',
      message: savedCount > 1
        ? ('생성 평어가 ' + savedCount + '명 분량 저장되었습니다.')
        : '생성 평어가 저장되었습니다.'
    });
  } catch (err) {
    console.error('save subject comment error:', err);
    setLoading(false, btn, '저장');
    showModal({
      type: 'alert',
      icon: '⚠️',
      title: '저장 실패',
      message: '저장 중 오류가 발생했습니다. Supabase에 테이블/정책 설정이 필요할 수 있습니다.<br><br><small>subject_comments</small>'
    });
  }
}

async function copyTeacherSubjectComment() {
  const pre = document.getElementById('teacherSubjectCommentResult');
  const text = pre && !pre.classList.contains('hidden') ? pre.textContent : '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showModal({ type: 'alert', icon: '📋', title: '복사 완료', message: '클립보드에 복사되었습니다.' });
  } catch (err) {
    showModal({ type: 'alert', icon: '⚠️', title: '복사 실패', message: '복사에 실패했습니다: ' + (err.message || String(err)) });
  }
}

function openTeacherSubjectCommentExportModal() {
  const modal = document.getElementById('teacherSubjectCommentExportModal');
  if (!modal) return;

  const subjSel = document.getElementById('teacherSubjectCommentExportSubject');
  if (subjSel) {
    const options = PRESET_SUBJECT_TAGS.filter(t => t !== OTHER_SUBJECT_TAG);
    subjSel.innerHTML = '<option value="all" selected>전체</option>' + options.map(s => '<option value="' + String(s).replace(/"/g, '&quot;') + '">' + s + '</option>').join('');
  }

  const tgtSel = document.getElementById('teacherSubjectCommentExportTarget');
  const area = document.getElementById('teacherSubjectCommentExportSelectedArea');
  const grid = document.getElementById('teacherSubjectCommentExportStudentGrid');
  if (tgtSel && area && grid) {
    const sync = async () => {
      const v = tgtSel.value;
      area.classList.toggle('hidden', v !== 'selected');
      if (v !== 'selected') return;

      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-sub); padding:6px 0;">불러오는 중...</div>';
      try {
        const info = await getClassInfo();
        const cnt = info && info.student_count ? Number(info.student_count) : 30;
        grid.innerHTML = '';
        for (let i = 1; i <= cnt; i++) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'subject-tag-btn';
          b.textContent = String(i) + '번';
          b.dataset.sid = String(i);
          b.onclick = () => { b.classList.toggle('selected'); };
          grid.appendChild(b);
        }
      } catch (e) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-sub); padding:6px 0;">학생 목록을 불러올 수 없습니다.</div>';
      }
    };
    tgtSel.onchange = sync;
    sync();
  }

  setExportMsg('', 'error');
  modal.classList.remove('hidden');
}

function closeTeacherSubjectCommentExportModal() {
  const modal = document.getElementById('teacherSubjectCommentExportModal');
  modal?.classList.add('hidden');
}

function setExportMsg(text, type = 'error') {
  const el = document.getElementById('teacherSubjectCommentExportMsg');
  if (!el) return;
  el.textContent = String(text || '');
  el.className = 'message teacher-subject-comment-export-msg ' + type;
  el.style.display = text ? 'block' : 'none';
}

function parseClassMeta(className) {
  const name = String(className || '');
  const gradeMatch = name.match(/(\d+)\s*학년/);
  const classMatch = name.match(/(\d+)\s*반/);
  return {
    grade: gradeMatch ? (gradeMatch[1] + '학년') : '',
    class: classMatch ? (classMatch[1] + '반') : ''
  };
}

async function downloadTeacherSubjectCommentXlsx() {
  setExportMsg('', 'error');

  if (typeof XLSX === 'undefined' || !XLSX?.utils) {
    setExportMsg('엑셀 라이브러리를 불러오지 못했습니다. 네트워크/스크립트 로드를 확인해 주세요.', 'error');
    return;
  }
  if (!currentClassCode) {
    setExportMsg('클래스 정보를 확인할 수 없습니다.', 'error');
    return;
  }

  const semEl = document.getElementById('teacherSubjectCommentExportSemester');
  const subjEl = document.getElementById('teacherSubjectCommentExportSubject');
  const tgtEl = document.getElementById('teacherSubjectCommentExportTarget');
  const slEl = document.getElementById('teacherSubjectCommentExportSchoolLevel');

  const semV = semEl?.value || 'all';
  const subjV = subjEl?.value || 'all';
  const tgtV = tgtEl?.value || 'all';
  const overrideSchoolLevel = normalizeSchoolLevel(slEl?.value || '');

  const semesters = semV === 'all' ? [1, 2] : [Number(semV)];
  const subjects = subjV === 'all'
    ? PRESET_SUBJECT_TAGS.filter(t => t !== OTHER_SUBJECT_TAG)
    : [String(subjV)];

  const info = await getClassInfo();
  const studentCount = info && info.student_count ? Number(info.student_count) : 30;
  const className = info?.class_name || '';
  const meta = parseClassMeta(className);
  const schoolLevel = overrideSchoolLevel || normalizeSchoolLevel(info?.school_level || '');

  let studentIds = [];
  if (tgtV === 'current') {
    if (!teacherDiarySelectedStudentId) { setExportMsg('현재 학생이 선택되어 있지 않습니다.', 'error'); return; }
    if (String(teacherDiarySelectedStudentId) === TEACHER_SUBJECT_COMMENT_ALL_STUDENTS) {
      for (let i = 1; i <= studentCount; i++) studentIds.push(String(i));
    } else {
      studentIds = [String(teacherDiarySelectedStudentId)];
    }
  } else if (tgtV === 'selected') {
    const grid = document.getElementById('teacherSubjectCommentExportStudentGrid');
    const selected = Array.from(grid?.querySelectorAll('.subject-tag-btn.selected') || []).map(b => b.dataset.sid).filter(Boolean);
    if (selected.length === 0) { setExportMsg('선택 학생을 1명 이상 고르세요.', 'error'); return; }
    studentIds = selected.map(String);
  } else {
    for (let i = 1; i <= studentCount; i++) studentIds.push(String(i));
  }

  let savedRows = [];
  try {
    let q = db.from('subject_comments').select('student_id, semester, subject, generated_text, note_count, period_start, period_end, school_level');
    q = q.eq('class_code', currentClassCode);
    q = q.in('semester', semesters);
    q = q.in('subject', subjects);
    q = q.in('student_id', studentIds);
    const { data, error } = await q;
    if (error) throw error;
    savedRows = data || [];
  } catch (err) {
    console.warn('subject_comments fetch failed:', err);
    savedRows = [];
  }

  const savedMap = new Map();
  savedRows.forEach(r => {
    const k = getTeacherSubjectCommentKey({ classCode: currentClassCode, studentId: r.student_id, semester: r.semester, subject: r.subject });
    savedMap.set(k, r);
  });

  const periodBySemester = {
    1: { start: info?.semester1_start || '', end: info?.semester1_end || '' },
    2: { start: info?.semester2_start || '', end: info?.semester2_end || '' }
  };
  const requestedPeriods = semesters.map(s => periodBySemester[s]).filter(p => p && p.start && p.end);
  const minStart = requestedPeriods.length > 0 ? requestedPeriods.map(p => p.start).sort()[0] : '';
  const maxEnd = requestedPeriods.length > 0 ? requestedPeriods.map(p => p.end).sort().slice(-1)[0] : '';

  let allNotes = [];
  if (minStart && maxEnd) {
    try {
      const { data, error } = await db.from('daily_reflections')
        .select('student_id, reflection_date, subject_tags, learning_text')
        .eq('class_code', currentClassCode)
        .in('student_id', studentIds)
        .gte('reflection_date', minStart)
        .lte('reflection_date', maxEnd);
      if (error) throw error;
      allNotes = data || [];
    } catch (err) {
      console.warn('daily_reflections export fetch failed:', err);
      allNotes = [];
    }
  }

  const countMap = new Map();
  function incCount(studentId, semester, subject) {
    const k = getTeacherSubjectCommentKey({ classCode: currentClassCode, studentId, semester, subject });
    countMap.set(k, (countMap.get(k) || 0) + 1);
  }
  allNotes.forEach(n => {
    const sid = String(n.student_id || '').trim();
    if (!sid) return;
    const d = String(n.reflection_date || '').slice(0, 10);
    if (!d) return;
    const tags = Array.isArray(n.subject_tags) ? n.subject_tags.map(String) : [];
    const hasText = String(n.learning_text || '').trim().length > 0;
    if (!hasText) return;

    semesters.forEach(s => {
      const p = periodBySemester[s];
      if (!p || !p.start || !p.end) return;
      if (d < p.start || d > p.end) return;
      tags.forEach(t => { if (subjects.includes(t)) incCount(sid, s, t); });
    });
  });

  const rows = [];
  for (const sid of studentIds) {
    for (const sem of semesters) {
      const p = periodBySemester[sem] || { start: '', end: '' };
      for (const subj of subjects) {
        const k = getTeacherSubjectCommentKey({ classCode: currentClassCode, studentId: sid, semester: sem, subject: subj });
        const saved = savedMap.get(k) || null;
        const usedSchool = normalizeSchoolLevel(saved?.school_level || '') || schoolLevel;
        const usedStart = String(saved?.period_start || p.start || '');
        const usedEnd = String(saved?.period_end || p.end || '');
        const noteCount = (typeof saved?.note_count === 'number') ? saved.note_count : (countMap.get(k) || 0);
        const text = saved?.generated_text ? String(saved.generated_text) : '미생성';

        rows.push({
          '학생번호': sid,
          '학생명': sid + '번',
          '학년': meta.grade,
          '반': meta.class,
          '학교급(초/중/고)': usedSchool,
          '학기(1/2)': sem,
          '과목': subj,
          '기간_시작일': usedStart,
          '기간_종료일': usedEnd,
          '배움노트_건수': noteCount,
          '생성평어(교과세특)': text
        });
      }
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '교과세특');

  const fname = '교과세특_' + String(currentClassCode || 'class') + '_' + getKstTodayStr() + '.xlsx';
  XLSX.writeFile(wb, fname);
  closeTeacherSubjectCommentExportModal();
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
function getDemoReviewTemplate(targetId) {
  const tid = String(targetId);
  return [
    '👍 잘한 점: ' + tid + '번은 발표할 때 핵심 개념을 먼저 말하고 예시를 붙여 설명해서 듣는 사람이 이해하기 쉬웠어.',
    '💡 이렇게 하면 더 좋아질 것 같아: 근거를 말한 뒤 "왜 그렇게 생각했는지"를 한 문장만 더 덧붙이면 설득력이 더 커질 것 같아.',
    '✨ 특히 인상적이었던 부분은 질문을 받았을 때 바로 답하려고 하기보다 차분히 정리해서 말한 태도였어.',
    '💪 다음에는 이런 점을 시도해보면 좋겠어: 발표 끝부분에 오늘 배운 핵심 1줄 요약을 넣어서 마무리해보자.'
  ].join('\n\n');
}

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

  // Demo mode: auto-focus first available target so score buttons look pre-filled immediately.
  if (isDemoMode) {
    const firstSelectable = grid.querySelector('.target-btn.done, .target-btn:not(.disabled)');
    if (firstSelectable) firstSelectable.click();
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
    if (existing && existing.scores_json) {
      applyExistingRatings(existing.scores_json);
      return;
    }

    // Demo mode: show varied pre-selected scores even when no saved review exists.
    if (isDemoMode && ratingCriteria && ratingCriteria.length > 0) {
      const demoScores = {};
      for (let idx = 0; idx < ratingCriteria.length; idx++) {
        demoScores[String(idx)] = ((Number(id) + idx) % 5) + 1;
      }
      applyExistingRatings({ criteria: ratingCriteria, scores: demoScores });

      const reviewEl = document.getElementById('reviewContent');
      if (reviewEl) {
        reviewEl.value = getDemoReviewTemplate(id);
        updateCharCount();
      }
    }
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
  const partner = await ensureStudentPartnerLoaded({ backfill: true });

  let myTotalAvgNum = null;
  if (myAvgScores.length > 0) myTotalAvgNum = (myAvgScores.reduce((a, i) => a + i.average, 0) / myAvgScores.length);
  let classTotalAvgNum = null;
  if (classAvgScores.length > 0) classTotalAvgNum = (classAvgScores.reduce((a, i) => a + i.average, 0) / classAvgScores.length);

  const classAvgMapForPrompt = {};
  classAvgScores.forEach(item => { classAvgMapForPrompt[item.criterion] = item.average; });
  const criteria_stats = myAvgScores.map(item => ({
    criterion: item.criterion,
    my_avg: Number(item.average.toFixed(2)),
    class_avg: Number((classAvgMapForPrompt[item.criterion] || 0).toFixed(2))
  }));

  const evaluation_context = {
    eval_type: currentStudent.type,
    review_count: reviews.length,
    ...(myTotalAvgNum != null && classTotalAvgNum != null ? {
      my_total_avg: Number(myTotalAvgNum.toFixed(2)),
      class_total_avg: Number(classTotalAvgNum.toFixed(2)),
      criteria_stats
    } : {})
  };

  const summary = await generateSummary(reviewTexts, { partner, evaluation_context });
  setLoading(false, btn, '내 결과 확인하기');
  document.getElementById('resultArea').classList.remove('hidden');
  let totalAvg = 0; if (myAvgScores.length > 0) totalAvg = (myAvgScores.reduce((a, i) => a + i.average, 0) / myAvgScores.length).toFixed(2);
  let classAvg = 0; if (classAvgScores.length > 0) classAvg = (classAvgScores.reduce((a, i) => a + i.average, 0) / classAvgScores.length).toFixed(2);
  const statsEl = document.getElementById('statsSummary');
  if (statsEl) {
    const statsHtml = '<div class="stat-card"><span class="stat-number">' + reviews.length + '명</span><span class="stat-label">평가 참여 인원</span></div>' +
      '<div class="stat-card"><span class="stat-number">' + totalAvg + '</span><span class="stat-label">나의 평균 점수</span></div>' +
      '<div class="stat-card blue"><span class="stat-number">' + classAvg + '</span><span class="stat-label">우리 반 평균 점수</span></div>';
    statsEl.innerHTML = statsHtml;
  }

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
  } else {
    chartContainer.classList.remove('hidden');
    barChart.innerHTML = '<div class="empty-state"><span class="empty-icon">📭</span><div class="empty-title">아직 받은 평가가 없어요</div><div class="empty-desc">친구들의 평가가 등록되면<br>여기에 점수가 표시됩니다.</div></div>';
  }

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

function switchTeacherPraiseSubTab(mode) {
  const praiseBtn = document.getElementById('teacherPraiseManageBtn');
  const letterBtn = document.getElementById('teacherLetterManageBtn');
  const praisePanel = document.getElementById('teacherPraiseManagePanel');
  const letterPanel = document.getElementById('teacherLetterManagePanel');
  if (!praiseBtn || !letterBtn || !praisePanel || !letterPanel) return;

  praiseBtn.classList.remove('active');
  letterBtn.classList.remove('active');
  praisePanel.classList.add('hidden');
  letterPanel.classList.add('hidden');

  if (mode === 'letter') {
    letterBtn.classList.add('active');
    letterPanel.classList.remove('hidden');
    loadTeacherMessages();
    return;
  }

  praiseBtn.classList.add('active');
  praisePanel.classList.remove('hidden');
}

async function callGemini(promptText, config = {}) {
  // When opened directly as a local file (file://), serverless API routes (/api/*) do not exist.
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
    return {
      ok: false,
      code: 'local_file_mode',
      error: 'AI 기능은 배포 사이트 또는 로컬 서버(vercel dev)에서만 사용할 수 있어요.'
    };
  }
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
function getExecutionStrategyHeader(partner) {
  const executionStrategy = partner?.axes_raw?.execution_strategy || partner?.axes?.execution_strategy || null;
  if (executionStrategy === '계획형' || executionStrategy === 'plan') return '다음 성장 계획(실천)';
  if (executionStrategy === '탐색형' || executionStrategy === 'explore') return '다음 성장 실험(도전)';
  return '다음 성장 계획/실험(실천)';
}
async function generateSummary(reviews, opts = {}) {
  if (!reviews || reviews.length === 0) return '요약할 리뷰 데이터가 없습니다.';

  const passedPartner = (opts.partner && typeof opts.partner === 'object') ? opts.partner : null;
  const partner = passedPartner || studentPartner || await ensureStudentPartnerLoaded({ backfill: true });

  const evaluation_context = (opts.evaluation_context && typeof opts.evaluation_context === 'object')
    ? { ...opts.evaluation_context }
    : {
      eval_type: (currentStudent && currentStudent.type) ? currentStudent.type : 'individual',
      review_count: reviews.length
    };

  evaluation_context.review_texts = Array.isArray(evaluation_context.review_texts) ? evaluation_context.review_texts : reviews;

  const header1 = (partner?.axes_raw?.coaching_style === '해결형') ? '핵심 진단' : '핵심 요약';
  const header2 = (partner?.axes_raw?.info_processing === '디테일형') ? '근거와 구체 포인트' : '패턴과 변화 흐름';
  const header3 = getExecutionStrategyHeader(partner);

  const student_partner = partner ? {
    type_code: partner.type_code,
    type_name: partner.type_name,
    axes: partner.axes || null,
    axes_raw: partner.axes_raw || null,
    style_guide: partner.style_guide || null
  } : null;

  const inputObj = { student_partner, evaluation_context };

  const prompt = [
    '[ROLE]',
    "너는 '배움로그'의 AI 성장 파트너다.",
    '학생에게 1:1로 말하는 톤으로, 반말은 쓰지 않되 딱딱하지 않은 친근한 존댓말(해요체)을 사용한다.',
    "교사가 아니라 '옆에서 같이 고민해주는 파트너' 느낌으로 작성한다.",
    '',
    '[INPUT]',
    JSON.stringify(inputObj, null, 2),
    '',
    '[8 TYPE LIBRARY]',
    buildPartnerTypeLibraryText(),
    '',
    '[OUTPUT: 카드 UI 최적화 / 마크다운만]',
    `## ${header1}`,
    `## ${header2}`,
    `## ${header3}`,
    '',
    '[작성 규칙]',
    '1) 인사말 없이 바로 시작.',
    '2) review_texts를 의미별로 묶어 핵심 포인트로 정리.',
    '3) 부정 피드백은 그대로 전달하지 말고, "이 부분이 더 좋아지면 좋겠어" 같은 성장 포인트로 전환.',
    '4) student_partner의 3개 축(coaching_style/info_processing/execution_strategy)을 모두 조합 적용.',
    '5) #함께 성장형은 협력 활동, #혼자 집중형은 개인 활동을 실천 제안에 포함.',
    '6) 해당 유형의 "이런 말이 힘이 돼요" 톤을 참고해 작성.',
    '7) 한국어로만 작성, 12~18문장 내외.'
  ].join('\n');

  const result = await callGemini(prompt, { generationConfig: { temperature: 0.45, maxOutputTokens: 1200 } });
  if (!result.ok) return 'AI summary failed [' + (result.code || 'unknown') + ']: ' + (result.error || 'No details');

  return sanitizeAiSummaryText(result.text);
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
    // 오늘 성장 일기 작성률 조회
    let diaryCount = 0;
    try {
      const today = getDefaultQueryDate();
      const [diaryRes] = await Promise.allSettled([
        db.from('daily_reflections').select('student_id', { count: 'exact', head: true }).eq('class_code', currentClassCode).eq('reflection_date', today)
      ]);
      diaryCount = diaryRes.status === 'fulfilled' && diaryRes.value.count ? diaryRes.value.count : 0;
    } catch (subErr) { console.warn('대시보드 부가 데이터 조회 오류:', subErr); }
    const diaryPct = totalStudents > 0 ? Math.round((diaryCount / totalStudents) * 100) : 0;
  d.innerHTML = '<div class="stat-card"><span class="stat-number">' + participation + '%</span><span class="stat-label">평가 참여율 (' + evaluated + '/' + totalStudents + ')</span></div><div class="stat-card blue"><span class="stat-number">' + totalAvg + '</span><span class="stat-label">전체 평균 점수</span></div><div class="stat-card" style="border-left-color:var(--color-teal);"><span class="stat-number" style="color:var(--color-teal);">' + totalReviews + '건</span><span class="stat-label">총 평가 수</span></div><div class="stat-card" style="border-left-color:var(--color-teacher);"><span class="stat-number" style="color:var(--color-teacher);">' + diaryPct + '%</span><span class="stat-label">오늘 일기 작성률 (' + diaryCount + '/' + totalStudents + ')</span></div>';
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
    ['#D77A86', '#E8A5AF'],
    ['#D39A5E', '#E9C18E'],
    ['#6FAF8C', '#9CCCB1'],
    ['#5F97C4', '#8ABCE0'],
    ['#7E7ACF', '#A9A3E6']
  ];

  let h = '<div class="chart-container" style="border-left-color:var(--color-blue);margin-top:20px;"><h4 style="color:var(--color-blue);">' + (type === 'group' ? '\uBAA8\uB460' : '\uAC1C\uC778') + ' \uD3C9\uADE0 \uC810\uC218 \uBD84\uD3EC</h4><div class="bar-chart">';
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
    ? '\uD559\uAE09 \uC815\uBCF4\uC640 <strong>\uD074\uB798\uC2A4 \uCF54\uB4DC</strong>\uB97C \uBCC0\uACBD\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?<br><span class="modal-inline-note modal-inline-note-warning">* \uCF54\uB4DC\uB97C \uBCC0\uACBD\uD558\uBA74 \uAE30\uC874 \uD559\uC0DD\uB4E4\uB3C4 \uC0C8 \uCF54\uB4DC\uB85C \uB2E4\uC2DC \uC811\uC18D\uD574\uC57C \uD569\uB2C8\uB2E4.</span>'
    : '\uD559\uAE09 \uC815\uBCF4\uB97C \uBCC0\uACBD\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?';
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
  grid.innerHTML = '<p class="teacher-list-loading">\uB85C\uB529 \uC911...</p>';

  const { data: classData } = await db.from('classes').select('student_count').eq('class_code', currentClassCode).maybeSingle();
  const studentCount = classData ? classData.student_count : 30;

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
      const emailShort = p.google_email ? (p.google_email.length > 20 ? p.google_email.substring(0, 18) + '...' : p.google_email) : '(\uC774\uBA54\uC77C \uC5C6\uC74C)';
      grid.innerHTML += '<div class="student-auth-item teacher-student-auth-item">'
        + '<label class="teacher-student-auth-label">' + i + '\uBC88</label>'
        + '<span class="teacher-student-auth-email" title="' + (p.google_email || '') + '">' + emailShort + '</span>'
        + '<button type="button" class="teacher-student-auth-remove" onclick="removeStudentMapping(\'' + p.id + '\', ' + i + ')">\uD574\uC81C</button>'
        + '</div>';
    } else {
      grid.innerHTML += '<div class="student-auth-item teacher-student-auth-item">'
        + '<label class="teacher-student-auth-label">' + i + '\uBC88</label>'
        + '<span class="teacher-student-auth-empty">\uBBF8\uB4F1\uB85D</span>'
        + '</div>';
    }
  }
}
function removeStudentMapping(profileId, num) {
  showModal({
    type: 'confirm', icon: '⚠️', title: '번호 등록 해제',
    message: '<strong>' + num + '번</strong> 학생의 등록을 해제하시겠습니까?<br><span class="modal-inline-note">해당 학생은 다시 온보딩을 진행해야 합니다.</span>',
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
  ensureSubjectTagButtons();
  ensureCustomSubjectInput();

  let targetDate = document.getElementById('selfDate').value;
  if (!targetDate) {
    targetDate = getDefaultQueryDate();
    document.getElementById('selfDate').value = targetDate;
  }

  // 오늘 작성한 자기평가 있는지 확인
  const { data: reflectionData } = await db.from('daily_reflections')
    .select('*, teacher_messages(*)')
    .eq('class_code', currentClassCode)
    .eq('student_id', String(currentStudent.id))
    .eq('reflection_date', targetDate)
    .maybeSingle();
  const reflection = reflectionData;

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
  if (!feedbackSection || !feedbackText) return;

  feedbackSection.classList.remove('hidden');
  feedbackText.innerHTML = '<span style="color:var(--text-sub);">🤖 AI가 피드백을 작성 중...</span>';

  const partner = studentPartner || await ensureStudentPartnerLoaded({ backfill: true });

  const prompt = [
    '[ROLE]',
    "너는 '배움로그'의 AI 성장 파트너다.",
    '학생에게 1:1로 말하는 톤으로, 반말은 쓰지 않되 딱딱하지 않은 친근한 존댓말(해요체)을 사용한다.',
    "교사가 아니라 '옆에서 같이 고민해주는 파트너' 느낌으로 작성한다.",
    '',
    '[INPUT]',
    JSON.stringify({
      student_partner: partner ? {
        type_code: partner.type_code,
        type_name: partner.type_name,
        axes_raw: partner.axes_raw || null,
        style_guide: partner.style_guide || null
      } : null,
      today_record: {
        learning_text: learning,
        subject_tags: subjects
      }
    }, null, 2),
    '',
    '[8 TYPE LIBRARY]',
    buildPartnerTypeLibraryText(),
    '',
    '[작성 규칙]',
    '1) 오늘 배움 노트에 대한 짧은 반응이다. 3~5문장으로 작성.',
    '2) 첫 문장: 학생이 쓴 내용 중 구체적인 부분을 언급하며 반응.',
    '3) 중간: 성향에 맞는 한 마디.',
    '   - 해결형: 배운 것을 더 깊게 만드는 구체적 팁 1개',
    '   - 지지형: 기록한 것 자체를 인정 + 작은 격려',
    '   - 디테일형: 오늘 배운 것의 핵심 포인트를 짚어주기',
    '   - 큰그림형: 오늘 배운 것이 전체에서 어떤 의미인지 한 줄',
    '4) 마지막: 내일 또 기록하고 싶게 만드는 마무리.',
    '   - 계획형: "내일은 ~를 기록해보면 좋겠어요"',
    '   - 탐색형: "내일은 어떤 발견이 있을지 궁금해요"',
    '   - #함께 성장형: 협력 활동 연결 ("친구한테 오늘 배운 거 설명해보면 더 기억에 남아요")',
    '   - #혼자 집중형: 개인 활동 연결 ("오늘 배운 걸 노트에 한 줄 정리해두면 나중에 큰 힘이 돼요")',
    '5) 해당 유형의 "이런 말이 힘이 돼요" 예시를 참고해 비슷한 톤으로 작성.',
    '6) 이모지는 1~2개만 자연스럽게.',
    '7) 절대 5문장을 넘기지 말 것.',
    '8) 한국어로만 작성.'
  ].join('\n');

  const result = await callGemini(prompt, { generationConfig: { temperature: 0.55, maxOutputTokens: 360 } });

  if (result.ok && result.text) {
    feedbackText.innerHTML = formatMarkdown(result.text);
    const kr = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
    const today = kr.toISOString().split('T')[0];
    await db.from('daily_reflections').update({ ai_feedback: result.text })
      .eq('class_code', currentClassCode)
      .eq('student_id', String(currentStudent.id))
      .eq('reflection_date', today);
  } else {
    feedbackText.textContent = '오늘 기록 자체가 이미 성장입니다. 내일도 한 줄만 더 남겨봐요 🙂';
  }
}

// 답장 기능 제거: legacy no-op
async function checkForTeacherReplies() { return; }

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
  ['diaryViewDate', 'diaryStudentViewDate'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

function getTeacherDiarySelectedDate() {
  return document.getElementById('diaryViewDate')?.value
    || document.getElementById('diaryStudentViewDate')?.value
    || '';
}

function syncTeacherDiaryDateInputs(dateStr, sourceId = '') {
  const selected = String(dateStr || '').trim();
  if (!selected) return;
  ['diaryViewDate', 'diaryStudentViewDate'].forEach((id) => {
    if (id === sourceId) return;
    const el = document.getElementById(id);
    if (el) el.value = selected;
  });
}

function handleTeacherDiaryDateChange(sourceId) {
  const sourceEl = document.getElementById(sourceId);
  const selectedDate = String(sourceEl?.value || '').trim();
  if (!selectedDate) return;
  syncTeacherDiaryDateInputs(selectedDate, sourceId);
  loadTeacherDiaryData();
}

// 교사용 성장 일기 데이터 로드
async function loadTeacherDiaryData() {
  if (!currentClassCode) return;

  const selectedDate = getTeacherDiarySelectedDate();
  if (!selectedDate) return;
  syncTeacherDiaryDateInputs(selectedDate);

  try {
    // "참여현황" + "배움노트 확인"을 조회날짜 기반으로 한 번에 로드
    const [totalCountRes, selectedDateRes, settings] = await Promise.all([
      db.from('daily_reflections')
        .select('id', { count: 'exact', head: true })
        .eq('class_code', currentClassCode),
      db.from('daily_reflections')
        .select('*')
        .eq('class_code', currentClassCode)
        .eq('reflection_date', selectedDate),
      getClassSettings()
    ]);

    let totalCount = totalCountRes?.count || 0;
    let todayReflections = selectedDateRes?.data || [];

    // 통계 업데이트
    document.getElementById('totalReflections').textContent = totalCount || 0;
    document.getElementById('todayReflections').textContent = todayReflections?.length || 0;
    renderDiaryCompletionStatus(todayReflections || [], settings?.studentCount || 30, selectedDate);

    // 미해결 어려움 알림(조회날짜 기반)
    renderEmotionAlerts(todayReflections || [], selectedDate);

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
    const { data: messageRows } = await db.from('teacher_messages')
      .select('*, daily_reflections(reflection_date)')
      .eq('class_code', currentClassCode)
      .gte('created_at', selectedDate + 'T00:00:00')
      .lt('created_at', selectedDate + 'T23:59:59.999')
      .order('created_at', { ascending: false });
    const messages = messageRows || [];
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
  }
}

function renderDiaryCompletionStatus(todayReflections, totalStudents, selectedDate) {
  const summaryEl = document.getElementById('diaryCompletionSummary');
  const listEl = document.getElementById('diaryCompletionList');
  const studentListEl = document.getElementById('diaryStudentSelectorList');
  const detailEl = document.getElementById('diaryStudentDetail');
  if (!summaryEl || !listEl || !detailEl) return;

  const reflectionMap = new Map();
  (todayReflections || []).forEach(r => {
    const sid = String(r.student_id || '').trim();
    if (!sid) return;
    if (!reflectionMap.has(sid)) reflectionMap.set(sid, r);
  });

  const submittedCount = reflectionMap.size;
  const unsubmittedCount = Math.max(0, totalStudents - submittedCount);
  summaryEl.innerHTML =
    '<strong class="diary-completion-count is-submitted">\uC81C\uCD9C ' + submittedCount + '\uBA85</strong> \u00B7 ' +
    '<strong class="diary-completion-count is-unsubmitted">\uBBF8\uC81C\uCD9C ' + unsubmittedCount + '\uBA85</strong>';

  listEl.innerHTML = '';
  if (studentListEl) studentListEl.innerHTML = '';
  let firstSid = '';
  let firstSubmittedSid = '';

  const selectStudent = (sid) => {
    const reflection = reflectionMap.get(sid) || null;
    const isSubmitted = !!reflection;

    [listEl, studentListEl].forEach(container => {
      if (!container) return;
      container.querySelectorAll('.diary-student-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sid === sid);
      });
    });

    if (typeof setTeacherSubjectCommentSelectedStudent === 'function') {
      setTeacherSubjectCommentSelectedStudent(sid);
    }
    renderDiaryStudentDetail(reflection, sid, selectedDate, isSubmitted);
  };

  const appendStudentButton = (container, sid, isSubmitted) => {
    if (!container) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'diary-student-chip ' + (isSubmitted ? 'submitted' : 'unsubmitted');
    btn.dataset.sid = sid;
    btn.innerHTML =
      '<div class="diary-student-chip-id">' + sid + '\uBC88</div>' +
      '<div class="diary-student-chip-status">' + (isSubmitted ? '\uC81C\uCD9C' : '\uBBF8\uC81C\uCD9C') + '</div>';
    btn.onclick = () => selectStudent(sid);
    container.appendChild(btn);
  };

  for (let i = 1; i <= totalStudents; i++) {
    const sid = String(i);
    const reflection = reflectionMap.get(sid) || null;
    const isSubmitted = !!reflection;

    appendStudentButton(listEl, sid, isSubmitted);
    appendStudentButton(studentListEl, sid, isSubmitted);
    if (!firstSid) firstSid = sid;
    if (isSubmitted && !firstSubmittedSid) firstSubmittedSid = sid;
  }

  const currentSid = String(teacherDiarySelectedStudentId || '').trim();
  const hasCurrentSid = !!(currentSid && Number(currentSid) >= 1 && Number(currentSid) <= totalStudents);
  const initialSid = hasCurrentSid ? currentSid : (firstSubmittedSid || firstSid);
  if (initialSid) selectStudent(initialSid);
}

function renderDiaryStudentDetail(reflection, studentId, selectedDate, isSubmitted) {
  const detailEl = document.getElementById('diaryStudentDetail');
  if (!detailEl) return;

  const toneClass = 'tone-' + ((Math.max(1, Number(studentId)) - 1) % 3);
  const dateText = escapeHtml(String(selectedDate || ''));

  if (!isSubmitted || !reflection) {
    detailEl.innerHTML =
      '<div class="diary-student-detail-card is-unsubmitted ' + toneClass + '">' +
      '<div class="diary-student-detail-title">' + studentId + '\uBC88 \uD559\uC0DD</div>' +
      '<div class="diary-student-detail-message is-warning">' + dateText + ' \uBC30\uC6C0\uB178\uD2B8\uB97C \uC544\uC9C1 \uC81C\uCD9C\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.</div>' +
      '</div>';
    return;
  }

  const tags = Array.isArray(reflection.subject_tags) ? reflection.subject_tags : [];
  const tagsHtml = tags.length > 0
    ? '<div class="diary-student-detail-tags">' +
      tags.map(tag => '<span class="diary-student-detail-tag">' + escapeHtml(String(tag)) + '</span>').join('') +
      '</div>'
    : '';

  detailEl.innerHTML =
    '<div class="diary-student-detail-card ' + toneClass + '">' +
    '<div class="diary-student-detail-head">' +
    '<strong class="diary-student-detail-title">' + studentId + '\uBC88 \uD559\uC0DD</strong>' +
    '<span class="diary-student-detail-meta">' + dateText + ' \uC81C\uCD9C \uC644\uB8CC</span>' +
    '</div>' +
    '<div class="diary-student-detail-body">' + escapeHtml(String(reflection.learning_text || '\uC791\uC131\uB41C \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.')) + '</div>' +
    tagsHtml +
    '</div>';
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
      message_content: teacherMessage
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
  if (!praises || praises.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">\uD83D\uDC8C</span><div class="empty-title">\uC544\uC9C1 \uBC1B\uC740 \uCE6D\uCC2C\uC774 \uC5C6\uC5B4\uC694</div><div class="empty-desc">\uCE5C\uAD6C\uB4E4\uC758 \uCE6D\uCC2C\uC774 \uB3C4\uCC29\uD558\uBA74<br>\uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4!</div></div>';
    return;
  }
  container.innerHTML = praises.map(p => {
    const sender = p.is_anonymous ? '\uD83C\uDFAD \uC775\uBA85\uC758 \uCE5C\uAD6C' : (p.sender_id + '\uBC88 \uCE5C\uAD6C');
    const date = new Date(p.created_at).toLocaleDateString('ko-KR');
    return '<div class="student-praise-item">' +
      '<div class="student-praise-item-head">' +
      '<span class="student-praise-sender">' + sender + '</span>' +
      '<span class="student-praise-date">' + date + '</span>' +
      '</div>' +
      '<div class="student-praise-content">' + escapeHtml(p.message_content) + '</div>' +
      '</div>';
  }).join('');
}

async function loadPendingPraises() {
  const container = document.getElementById('pendingPraiseList');
  container.innerHTML = '<p class="teacher-list-loading">\uBD88\uB7EC\uC624\uB294 \uC911...</p>';
  const { data: praises } = await db.from('praise_messages').select('*').eq('class_code', currentClassCode).eq('is_approved', false).order('created_at', { ascending: false });
  if (!praises || praises.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">\u2705</span><div class="empty-desc">\uB300\uAE30 \uC911\uC778 \uCE6D\uCC2C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</div></div>';
    return;
  }
  container.innerHTML = praises.map(p => {
    const sender = p.is_anonymous ? ('\uC775\uBA85(' + p.sender_id + '\uBC88)') : (p.sender_id + '\uBC88');
    const date = new Date(p.created_at).toLocaleDateString('ko-KR');
    return '<div class="teacher-praise-item teacher-praise-item-pending">' +
      '<div class="teacher-praise-item-head compact">' +
      '<span><strong>' + sender + '</strong> \u2192 <strong>' + p.receiver_id + '\uBC88</strong></span>' +
      '<span class="teacher-praise-date">' + date + '</span>' +
      '</div>' +
      '<div class="teacher-praise-content with-gap">' + escapeHtml(p.message_content) + '</div>' +
      '<div class="teacher-praise-actions">' +
      '<button type="button" class="teacher-praise-action approve" onclick="approvePraise(\'' + p.id + '\')">\u2705 \uC2B9\uC778</button>' +
      '<button type="button" class="teacher-praise-action reject" onclick="rejectPraise(\'' + p.id + '\')">\u274C \uC0AD\uC81C</button>' +
      '</div>' +
      '</div>';
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
  container.innerHTML = '<p class="teacher-list-loading">\uBD88\uB7EC\uC624\uB294 \uC911...</p>';
  const { data: praises } = await db.from('praise_messages').select('*').eq('class_code', currentClassCode).eq('is_approved', true).order('created_at', { ascending: false });
  if (!praises || praises.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">\uD83D\uDCEC</span><div class="empty-desc">\uC2B9\uC778\uB41C \uCE6D\uCC2C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</div></div>';
    return;
  }
  container.innerHTML = praises.map(p => {
    const sender = p.is_anonymous ? ('\uC775\uBA85(' + p.sender_id + '\uBC88)') : (p.sender_id + '\uBC88');
    const date = new Date(p.created_at).toLocaleDateString('ko-KR');
    return '<div class="teacher-praise-item teacher-praise-item-approved">' +
      '<div class="teacher-praise-item-head compact">' +
      '<span><strong>' + sender + '</strong> \u2192 <strong>' + p.receiver_id + '\uBC88</strong></span>' +
      '<span class="teacher-praise-date">' + date + '</span>' +
      '</div>' +
      '<div class="teacher-praise-content">' + escapeHtml(p.message_content) + '</div>' +
      '</div>';
  }).join('');
}

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

function extractUnresolvedDifficultySnippets(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const t = raw.trim();
  if (!t) return [];

  const clip = (s, n = 70) => {
    const x = String(s || '').replace(/\s+/g, ' ').trim();
    if (!x) return '';
    return x.length > n ? (x.slice(0, n) + '...') : x;
  };

  const takeLabel = (re) => {
    const m = t.match(re);
    if (!m) return '';
    return clip(m[1], 90);
  };

  const hasStill = /아직\s*(도)?|여전히|계속/.test(t);
  const hasResolution = /이해\s*\/\s*해결\s*방법\s*:|해결\s*방법\s*:|해결했|해결했다|알게\s*되|이해했|정리(했|해서|하니)|고쳤|찾았/.test(t);

  const snippets = [];
  const stillConfusing = takeLabel(/아직\s*헷갈리는\s*점\s*:\s*([^\n]+)/);
  if (stillConfusing) snippets.push(stillConfusing);

  // "어려웠던 점"은 해결 섹션이 없거나, 아직/여전히 표현이 함께 있을 때만 미해결로 간주
  const hardPoint = takeLabel(/어려웠던\s*점\s*:\s*([^\n]+)/);
  if (hardPoint && (!hasResolution || hasStill)) snippets.push(hardPoint);

  // 일반 텍스트: 미해결 키워드가 있는 문장만 (최대 2개)
  if (snippets.length === 0) {
    const unresolvedRe = /(아직|헷갈|어렵|모르겠|이해가\s*안|이해가\s*잘\s*안|잘\s*안\s*되|막혔|실수(가\s*)?자주)/;
    const resolvedRe = /(해결|알게\s*되|이해했|정리(했|해서|하니)|고쳤|찾았)/;

    const parts = t.split(/\n+|[.!?]\s+/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (!unresolvedRe.test(p)) continue;
      if (resolvedRe.test(p)) continue;
      snippets.push(clip(p, 90));
      if (snippets.length >= 2) break;
    }
  }

  // Dedup
  return Array.from(new Set(snippets)).filter(Boolean);
}

function focusTeacherDiaryStudent(studentId) {
  const sid = String(studentId || '').trim();
  if (!sid) return;

  // Ensure the target panel is visible.
  try { switchTeacherDiarySubTab('student'); } catch (_) {}

  try {
    const listIds = ['diaryStudentSelectorList', 'diaryCompletionList'];
    for (const listId of listIds) {
      const listEl = document.getElementById(listId);
      if (!listEl) continue;
      const btn = Array.from(listEl.querySelectorAll('button')).find(b => (b.textContent || '').includes(sid + '번'));
      if (btn) { btn.click(); return; }
    }
  } catch (_) {}

  // Fallback: at least sync the subject-comment selected student pill if available.
  if (typeof setTeacherSubjectCommentSelectedStudent === 'function') {
    setTeacherSubjectCommentSelectedStudent(sid);
  }
}

// "관심이 필요한 학생" (기존: 감정 키워드) -> "어려움 모아보기" 기반
function renderEmotionAlerts(reflections, selectedDate = null) {
  const area = document.getElementById('emotionAlertArea');
  const list = document.getElementById('emotionAlertList');
  if (!area || !list) return;

  const dateStr = selectedDate || getTeacherDiarySelectedDate() || '';

  const byStudent = new Map();
  (reflections || []).forEach(r => {
    const sid = String(r.student_id || '').trim();
    if (!sid) return;

    const snippets = extractUnresolvedDifficultySnippets(r.learning_text || '');
    if (snippets.length === 0) return;

    const existing = byStudent.get(sid) || { studentId: sid, tags: [], snippets: [] };
    const tags = Array.isArray(r.subject_tags) ? r.subject_tags.map(x => String(x)) : [];
    existing.tags = Array.from(new Set(existing.tags.concat(tags))).slice(0, 6);
    existing.snippets = Array.from(new Set(existing.snippets.concat(snippets))).slice(0, 3);
    byStudent.set(sid, existing);
  });

  const alerts = Array.from(byStudent.values()).sort((a, b) => Number(a.studentId) - Number(b.studentId));
  if (alerts.length === 0) {
    area.classList.add('hidden');
    return;
  }

  area.classList.remove('hidden');
  list.innerHTML = alerts.map((a, idx) => {
    const sidSafe = String(a.studentId || '').replace(/[^0-9]/g, '');
    const toneClass = 'tone-' + (idx % 3);
    const tagHtml = (a.tags || []).map(tag => '<span class="emotion-alert-tag">' + escapeHtml(tag) + '</span>').join('');
    const snipHtml = (a.snippets || []).slice(0, 2).map(s => '<li class="emotion-alert-snippet-item">' + escapeHtml(s) + '</li>').join('');
    const subtitle = dateStr ? (escapeHtml(dateStr) + ' \uAE30\uC900') : '\uC120\uD0DD \uB0A0\uC9DC \uAE30\uC900';

    return (
      '<button type="button" class="emotion-alert-item ' + toneClass + '" onclick="focusTeacherDiaryStudent(\'' + sidSafe + '\')">' +
      '<div class="emotion-alert-head">' +
      '<div class="emotion-alert-student">' + escapeHtml(a.studentId) + '\uBC88 \uD559\uC0DD</div>' +
      '<div class="emotion-alert-date">' + subtitle + '</div>' +
      '</div>' +
      (tagHtml ? ('<div class="emotion-alert-tags">' + tagHtml + '</div>') : '') +
      '<div class="emotion-alert-content">' +
      '<div class="emotion-alert-title">\uAE30\uB85D\uB41C \uC5B4\uB824\uC6C0</div>' +
      '<ul class="emotion-alert-snippet-list">' + snipHtml + '</ul>' +
      '</div>' +
      '</button>'
    );
  }).join('');
}
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

const PARTNER_VERSION = 2;

const PARTNER_TYPES = [
  {
    type_code: '해결디테일계획',
    type_name: '구체적인 계획가',
    emoji: '🎯',
    representative_answers: { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A', 6: 'A' },
    description: {
      feedback_style: '어디가 잘됐고 어디가 부족한지 정확하게 짚어줘요',
      action_style: '뭘 언제까지 하면 되는지 계획표로 정리해줘요',
      encouraging_phrase: '"3번 유형 문제, 이렇게 풀어보면 돼. 이번 주 월수는 이거, 목금은 저거."'
    },
    style_guide: {
      tone: '단정/직설, 근거-진단-처방',
      format: '체크리스트(최대 3) + 일정/우선순위'
    }
  },
  {
    type_code: '해결디테일탐색',
    type_name: '구체적인 도전가',
    emoji: '🛠',
    representative_answers: { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'B', 6: 'B' },
    description: {
      feedback_style: '어디가 잘됐고 어디가 부족한지 정확하게 짚어줘요',
      action_style: '부담 없이 해볼 수 있는 작은 도전을 제안해줘요',
      encouraging_phrase: '"이 부분만 바꿔봐. 일단 한 문제만 이 방법으로 풀어보자."'
    },
    style_guide: {
      tone: '직설 + 실험 제안',
      format: '가장 작은 실험 1개 + 해보고 메모'
    }
  },
  {
    type_code: '해결큰그림계획',
    type_name: '큰그림형 계획가',
    emoji: '🗺',
    representative_answers: { 1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'A', 6: 'A' },
    description: {
      feedback_style: '지금 어디쯤 있고, 어디로 가면 되는지 방향을 잡아줘요',
      action_style: '뭐부터 해야 하는지 우선순위를 정리해줘요',
      encouraging_phrase: '"전체적으로 이 방향이야. 이번 주는 이것부터, 다음 주는 저것."'
    },
    style_guide: {
      tone: '방향 제시/우선순위',
      format: '방향 1문장 + 우선순위 2개 + 일정'
    }
  },
  {
    type_code: '해결큰그림탐색',
    type_name: '큰그림형 도전가',
    emoji: '🚀',
    representative_answers: { 1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'B', 6: 'B' },
    description: {
      feedback_style: '지금 어디쯤 있고, 어디로 가면 되는지 방향을 잡아줘요',
      action_style: '여러 가능성 중에 해볼 만한 걸 제안해줘요',
      encouraging_phrase: '"이런 방향도 있어. 한번 해보고 맞는지 느껴봐."'
    },
    style_guide: {
      tone: '자신감, 옵션 제시',
      format: '방향 1문장 + 선택지 2개 + 작은 실험'
    }
  },
  {
    type_code: '지지디테일계획',
    type_name: '함께하는 계획가',
    emoji: '📋',
    representative_answers: { 1: 'B', 2: 'B', 3: 'A', 4: 'A', 5: 'A', 6: 'A' },
    description: {
      feedback_style: '잘한 부분을 먼저 알아봐주고, 부족한 점은 같이 고민해줘요',
      action_style: '차근차근 할 수 있도록 단계를 나눠서 정리해줘요',
      encouraging_phrase: '"이건 진짜 잘했어. 여기는 같이 해보자, 먼저 이것부터."'
    },
    style_guide: {
      tone: '따뜻하지만 정돈',
      format: '잘한 점 + 개선(부드럽게) + 단계별 계획'
    }
  },
  {
    type_code: '지지디테일탐색',
    type_name: '함께하는 도전가',
    emoji: '🤝',
    representative_answers: { 1: 'B', 2: 'B', 3: 'A', 4: 'A', 5: 'B', 6: 'B' },
    description: {
      feedback_style: '잘한 부분을 먼저 알아봐주고, 부족한 점은 같이 고민해줘요',
      action_style: '부담 없는 작은 도전을 함께 시작해줘요',
      encouraging_phrase: '"이건 잘했어! 여기는 이렇게 한번 해볼까?"'
    },
    style_guide: {
      tone: '공감 + 같이 방법 찾기',
      format: '잘한 점 + 작은 실험 1개 + 해보고 메모'
    }
  },
  {
    type_code: '지지큰그림계획',
    type_name: '공감하는 계획가',
    emoji: '🫶',
    representative_answers: { 1: 'B', 2: 'B', 3: 'B', 4: 'B', 5: 'A', 6: 'A' },
    description: {
      feedback_style: '지금 기분이나 상황을 먼저 알아주고, 큰 방향을 함께 잡아줘요',
      action_style: '무리하지 않는 선에서 목표와 순서를 정리해줘요',
      encouraging_phrase: '"많이 노력했지? 방향은 맞아. 이번 주는 이것만 해보자."'
    },
    style_guide: {
      tone: '든든 + 방향',
      format: '공감 1문장 + 방향 + 우선순위 정리'
    }
  },
  {
    type_code: '지지큰그림탐색',
    type_name: '공감하는 도전가',
    emoji: '🌈',
    representative_answers: { 1: 'B', 2: 'B', 3: 'B', 4: 'B', 5: 'B', 6: 'B' },
    description: {
      feedback_style: '지금 기분이나 상황을 먼저 알아주고, 큰 방향을 함께 잡아줘요',
      action_style: '호기심을 자극하는 새로운 시도를 제안해줘요',
      encouraging_phrase: '"충분히 잘하고 있어. 이런 것도 해보면 재밌을 거야."'
    },
    style_guide: {
      tone: '영감 + 실천 연결',
      format: '공감 1문장 + 탐색 질문 + 작은 실험'
    }
  }
];

const SUPPORT_TAG_GUIDE = {
  '#함께 성장형': '실천 활동에 "친구와 설명 연습", "모둠 토론", "같이 문제 풀기" 등 협력 활동 제안',
  '#혼자 집중형': '실천 활동에 "노트 정리", "혼자 풀어보기", "조용히 복습" 등 개인 활동 제안'
};

const PARTNER_TYPE_BY_CODE = {};
PARTNER_TYPES.forEach(t => { PARTNER_TYPE_BY_CODE[t.type_code] = t; });

function getQuizAnswer(answers, qid) {
  if (!answers) return null;
  return answers[qid] || answers[String(qid)] || null;
}

function resolveAxisWithPriority(answers, primaryQid, secondaryQid, mapByAnswer) {
  const primary = getQuizAnswer(answers, primaryQid);
  const secondary = getQuizAnswer(answers, secondaryQid);
  const isValid = (v) => v === 'A' || v === 'B';

  if (isValid(primary) && isValid(secondary)) {
    if (primary === secondary) return mapByAnswer(primary);
    return mapByAnswer(primary);
  }

  if (isValid(primary)) return mapByAnswer(primary);
  if (isValid(secondary)) return mapByAnswer(secondary);
  return null;
}

function computeLearningEnvAndTag(answers) {
  const q7 = getQuizAnswer(answers, 7);
  const q8 = getQuizAnswer(answers, 8);
  const isValid = (v) => v === 'A' || v === 'B';

  if (!isValid(q7) && !isValid(q8)) return { learning_env: null, support_tag: null };

  let picked = null;
  if (isValid(q7) && isValid(q8)) {
    const aCount = (q7 === 'A' ? 1 : 0) + (q8 === 'A' ? 1 : 0);
    const bCount = (q7 === 'B' ? 1 : 0) + (q8 === 'B' ? 1 : 0);
    if (aCount > bCount) picked = 'A';
    else if (bCount > aCount) picked = 'B';
    else picked = q7; // 동률 시 Q7 우선
  } else {
    picked = isValid(q7) ? q7 : q8;
  }

  if (picked === 'A') return { learning_env: '함께형', support_tag: '#함께 성장형' };
  return { learning_env: '혼자형', support_tag: '#혼자 집중형' };
}

function computePartnerAxes(answers) {
  const coaching_style = resolveAxisWithPriority(answers, 1, 2, (ans) => ans === 'A' ? '해결형' : '지지형');
  const info_processing = resolveAxisWithPriority(answers, 3, 4, (ans) => ans === 'A' ? '디테일형' : '큰그림형');
  const execution_strategy = resolveAxisWithPriority(answers, 5, 6, (ans) => ans === 'A' ? '계획형' : '탐색형');
  const env = computeLearningEnvAndTag(answers);

  return {
    coaching_style,
    info_processing,
    execution_strategy,
    learning_env: env.learning_env,
    support_tag: env.support_tag
  };
}

function computePartnerType(answers) {
  const axes_raw = computePartnerAxes(answers);
  if (!axes_raw.coaching_style || !axes_raw.info_processing || !axes_raw.execution_strategy) return null;

  const coachingCode = axes_raw.coaching_style === '해결형' ? '해결' : '지지';
  const infoCode = axes_raw.info_processing === '디테일형' ? '디테일' : '큰그림';
  const executionCode = axes_raw.execution_strategy === '계획형' ? '계획' : '탐색';
  const type_code = `${coachingCode}${infoCode}${executionCode}`;

  const catalog = PARTNER_TYPE_BY_CODE[type_code] || null;
  const type_name = catalog ? catalog.type_name : type_code;
  const emoji = catalog ? catalog.emoji : '🧠';
  const style_guide = catalog ? catalog.style_guide : null;
  const description = catalog ? catalog.description : null;

  const axes = {
    coaching_style: axes_raw.coaching_style,
    info_processing: axes_raw.info_processing,
    execution_strategy: axes_raw.execution_strategy,
    learning_env: axes_raw.learning_env,
    support_tag: axes_raw.support_tag
  };

  return { type_code, type_name, emoji, axes_raw, axes, style_guide, description, partner_version: PARTNER_VERSION };
}

function collectPersonalityTypeCandidates(partner, existingType, sampledTypes) {
  const out = [];
  const push = (v) => {
    const s = String(v || '').trim();
    if (!s) return;
    if (!out.includes(s)) out.push(s);
  };
  push(existingType);
  push(studentPersonality && studentPersonality.personality_type);
  push(partner && partner.type_name);
  push(partner && partner.type_code);
  if (Array.isArray(sampledTypes)) sampledTypes.forEach(push);
  return out;
}

async function sampleExistingPersonalityTypes() {
  if (!currentClassCode) return [];
  try {
    const { data } = await db.from('student_personality')
      .select('personality_type')
      .eq('class_code', currentClassCode)
      .not('personality_type', 'is', null)
      .limit(20);
    return (data || []).map(r => r && r.personality_type).filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function upsertStudentPersonalityWithFallback(basePayload, typeCandidates) {
  const candidates = Array.isArray(typeCandidates) ? typeCandidates.filter(Boolean) : [];
  const tryList = candidates.length > 0 ? candidates : [String((basePayload && basePayload.personality_type) || '').trim() || ''];

  let lastErr = null;
  for (const personalityType of tryList) {
    const payload = { ...basePayload, personality_type: personalityType };
    const { error } = await db.from('student_personality').upsert(payload, { onConflict: 'class_code,student_id' });
    if (!error) return payload;

    const msg = String(error.message || '');
    const isTypeIssue = msg.includes('personality_type') || msg.includes('student_personality_personality_type_check');
    if (!isTypeIssue) throw error;
    lastErr = error;
  }

  throw (lastErr || new Error('student_personality upsert failed'));
}

function buildPartnerTypeLibraryText() {
  const typeLibrary = PARTNER_TYPES.map(t => {
    return [
      `${t.type_code} | ${t.type_name}`,
      `- 대표 응답(Q1~Q6): ${formatRepresentativeAnswers(t.representative_answers)}`,
      `- 피드백 스타일: ${t.description?.feedback_style || '-'}`,
      `- 실천 방식: ${t.description?.action_style || '-'}`,
      `- 이런 말이 힘이 돼요: ${t.description?.encouraging_phrase || '-'}`,
      `- tone: ${t.style_guide?.tone || '-'}`,
      `- format: ${t.style_guide?.format || '-'}`
    ].join('\n');
  }).join('\n\n');

  const supportTagGuide = [
    '[보조태그 가이드]',
    '#함께 성장형: 실천 제안 시 협력 활동 포함 (친구와 설명 연습, 모둠 토론, 같이 문제 풀기)',
    '#혼자 집중형: 실천 제안 시 개인 활동 포함 (노트 정리, 혼자 풀어보기, 조용히 복습)'
  ].join('\n');

  return `${typeLibrary}\n\n${supportTagGuide}`;
}

function formatRepresentativeAnswers(rep) {
  if (!rep || typeof rep !== 'object') return '';
  const parts = [];
  for (let i = 1; i <= 6; i++) {
    const v = rep[i] || rep[String(i)] || '?';
    parts.push((v === 'A' || v === 'B') ? v : '?');
  }
  return parts.join('');
}

function getPartnerFromPersonalityRow(row) {
  if (!row || typeof row !== 'object') return null;

  const rowVersion = Number(row.partner_version || 0);
  if (rowVersion !== PARTNER_VERSION) return null;

  const code = row.partner_type_code;
  if (code && PARTNER_TYPE_BY_CODE[code]) {
    const base = PARTNER_TYPE_BY_CODE[code];
    const type_name = row.partner_type_name || base.type_name;
    const partner = {
      type_code: code,
      type_name,
      emoji: base.emoji,
      description: base.description,
      style_guide: base.style_guide,
      partner_version: PARTNER_VERSION
    };

    if (row.partner_axes && typeof row.partner_axes === 'object') {
      partner.axes_raw = {
        coaching_style: row.partner_axes.coaching_style || null,
        info_processing: row.partner_axes.info_processing || null,
        execution_strategy: row.partner_axes.execution_strategy || null,
        learning_env: row.partner_axes.learning_env || null,
        support_tag: row.partner_axes.support_tag || null
      };
    }

    if ((!partner.axes_raw || !partner.axes_raw.coaching_style) && row.question_responses) {
      const computed = computePartnerType(row.question_responses);
      if (computed) {
        partner.axes_raw = computed.axes_raw;
        partner.axes = computed.axes;
      }
    }

    if (!partner.axes && partner.axes_raw) {
      partner.axes = {
        coaching_style: partner.axes_raw.coaching_style,
        info_processing: partner.axes_raw.info_processing,
        execution_strategy: partner.axes_raw.execution_strategy,
        learning_env: partner.axes_raw.learning_env,
        support_tag: partner.axes_raw.support_tag
      };
    }

    return partner;
  }

  if (row.question_responses) return computePartnerType(row.question_responses);

  return null;
}

async function backfillPartnerTypeIfNeeded(personalityRow, partner) {
  if (isDemoMode) return;
  if (!currentStudent || !currentClassCode) return;
  if (!partner || !partner.type_code) return;
  if (!personalityRow) return;

  const needsBackfill =
    !personalityRow.partner_type_code ||
    !personalityRow.partner_type_name ||
    !personalityRow.partner_axes ||
    Number(personalityRow.partner_version || 0) !== PARTNER_VERSION;
  if (!needsBackfill) return;

  const payload = {
    class_code: currentClassCode,
    student_id: currentStudent.id,
    partner_type_code: partner.type_code,
    partner_type_name: partner.type_name,
    partner_axes: { ...(partner.axes_raw || {}) },
    partner_version: PARTNER_VERSION
  };
  if (personalityRow.question_responses) payload.question_responses = personalityRow.question_responses;

  try {
    const sampledTypes = await sampleExistingPersonalityTypes();
    const candidates = collectPersonalityTypeCandidates(partner, personalityRow.personality_type, sampledTypes);
    const saved = await upsertStudentPersonalityWithFallback(payload, candidates);
    personalityRow.personality_type = saved.personality_type;
    personalityRow.partner_type_code = payload.partner_type_code;
    personalityRow.partner_type_name = payload.partner_type_name;
    personalityRow.partner_axes = payload.partner_axes;
    personalityRow.partner_version = payload.partner_version;
  } catch (err) {
    console.warn('Partner type backfill skipped:', err?.message || err);
  }
}

async function ensureStudentPartnerLoaded(opts = {}) {
  const backfill = opts.backfill !== false;

  if (isDemoMode) {
    if (!studentPersonality) studentPersonality = loadDemoPersonalityFromStorage();
    if (studentPersonality) studentPartner = getPartnerFromPersonalityRow(studentPersonality);
    return studentPartner;
  }

  if (studentPartner && studentPartner.type_code) return studentPartner;

  const row = await loadStudentPersonality();
  if (row) studentPersonality = row;

  const partner = getPartnerFromPersonalityRow(row);
  studentPartner = partner;

  if (backfill && row && partner) await backfillPartnerTypeIfNeeded(row, partner);

  return partner;
}

const personalityQuestions = [
  {
    id: 1,
    category: '코칭 스타일',
    question: '시험 결과가 기대보다 낮았을 때, 선생님이 어떻게 말해주면 좋겠어?',
    optionA: { label: 'A', text: '구체적으로 분석하고 방법을 알려줘' },
    optionB: { label: 'B', text: '같이 방법 찾아보자고 말해줘' }
  },
  {
    id: 2,
    category: '코칭 스타일',
    question: '모둠 활동에서 내가 맡은 부분이 부족했을 때, 어떤 반응이 더 도움이 돼?',
    optionA: { label: 'A', text: '이 부분을 이렇게 고치면 나아져' },
    optionB: { label: 'B', text: '노력한 건 보여, 다음엔 이 부분만 더 신경 쓰자' }
  },
  {
    id: 3,
    category: '정보 처리',
    question: '새로운 단원을 배울 때, 어떤 게 더 도움이 돼?',
    optionA: { label: 'A', text: '예시와 풀이를 하나하나 따라가기' },
    optionB: { label: 'B', text: '왜 배우는지, 전체에서 어디에 해당하는지 먼저 파악' }
  },
  {
    id: 4,
    category: '정보 처리',
    question: '내 결과물에 대한 피드백을 받을 때, 어떤 형태가 더 좋아?',
    optionA: { label: 'A', text: '항목별 점수와 구체적 근거' },
    optionB: { label: 'B', text: '전체적인 흐름 요약과 다음 방향' }
  },
  {
    id: 5,
    category: '실행 전략',
    question: '시험 2주 전, 어떤 공부 방식이 나한테 더 맞아?',
    optionA: { label: 'A', text: '과목별 계획표를 짜고 매일 체크' },
    optionB: { label: 'B', text: '일단 시작하고 그날 상태에 따라 조절' }
  },
  {
    id: 6,
    category: '실행 전략',
    question: '방학 동안 뭔가를 배우고 싶을 때, 어떻게 시작해?',
    optionA: { label: 'A', text: '목표와 일정을 먼저 정하고 단계적으로' },
    optionB: { label: 'B', text: '일단 관심 가는 걸 해보면서 방향을 잡아가기' }
  },
  {
    id: 7,
    category: '학습 환경',
    question: '어려운 내용을 이해하고 싶을 때, 어떤 방법이 더 잘 돼?',
    optionA: { label: 'A', text: '친구나 선생님한테 물어보면서 정리' },
    optionB: { label: 'B', text: '혼자 자료를 찾아보며 정리' }
  },
  {
    id: 8,
    category: '학습 환경',
    question: '시험공부 할 때 어떤 환경이 더 집중이 잘 돼?',
    optionA: { label: 'A', text: '친구와 같이 문제 내고 풀기' },
    optionB: { label: 'B', text: '조용히 혼자 집중해서 풀기' }
  }
];

async function initSelfEvaluation() {
  const selfDateInput = document.getElementById('selfDate');
  if (selfDateInput && !selfDateInput.value) {
    selfDateInput.value = getDefaultQueryDate();
  }

  if (isDemoMode) {
    if (!studentPersonality) studentPersonality = loadDemoPersonalityFromStorage();
    const partner = getPartnerFromPersonalityRow(studentPersonality);
    if (partner && partner.type_code) {
      studentPartner = partner;
      document.getElementById('personalityQuiz').classList.add('hidden');
      document.getElementById('personalityResult').classList.add('hidden');
      document.getElementById('selfEvaluationMenu').classList.remove('hidden');
      switchSelfTab('daily');
      return;
    }
    showPersonalityQuiz();
    personalityQuestions.forEach(q => {
      const answer = q.id % 2 === 1 ? 'A' : 'B';
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
      studentPartner = getPartnerFromPersonalityRow(personality);
      if (studentPartner) {
        await backfillPartnerTypeIfNeeded(personality, studentPartner);
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
    } else {
      showPersonalityQuiz();
      document.getElementById('personalityQuiz').classList.remove('hidden');
      document.getElementById('personalityResult').classList.add('hidden');
      document.getElementById('selfEvaluationMenu').classList.add('hidden');
    }
  } catch (error) {
    console.error('자기평가 초기화 오류:', error);
    showPersonalityQuiz();
    document.getElementById('personalityQuiz').classList.remove('hidden');
    document.getElementById('personalityResult').classList.add('hidden');
    document.getElementById('selfEvaluationMenu').classList.add('hidden');
  }
}

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

async function submitPersonalityQuiz() {
  const partner = computePartnerType(quizAnswers);
  if (!partner) {
    showModal({ type: 'alert', icon: '❌', title: '오류', message: '8개 문항에 모두 답해야 분석할 수 있어요.' });
    return;
  }

  const payload = {
    class_code: currentClassCode,
    student_id: currentStudent?.id,
    question_responses: quizAnswers,
    partner_type_code: partner.type_code,
    partner_type_name: partner.type_name,
    partner_axes: { ...(partner.axes_raw || {}) },
    partner_version: PARTNER_VERSION
  };
  const sampledTypes = await sampleExistingPersonalityTypes();
  const personalityTypeCandidates = collectPersonalityTypeCandidates(partner, studentPersonality && studentPersonality.personality_type, sampledTypes);

  try {
    if (!isDemoMode) {
      const saved = await upsertStudentPersonalityWithFallback(payload, personalityTypeCandidates);
      payload.personality_type = saved.personality_type;
    }

    studentPersonality = { ...(studentPersonality || {}), ...payload };
    studentPartner = partner;
    if (isDemoMode) saveDemoPersonalityToStorage(studentPersonality);

    showPersonalityResult(partner);

    document.getElementById('personalityQuiz').classList.add('hidden');
    document.getElementById('personalityResult').classList.remove('hidden');
  } catch (error) {
    try {
      if (!isDemoMode) {
        const minimalPayload = {
          class_code: currentClassCode,
          student_id: currentStudent?.id,
          question_responses: quizAnswers
        };
        const saved = await upsertStudentPersonalityWithFallback(minimalPayload, personalityTypeCandidates);
        minimalPayload.personality_type = saved.personality_type;
      }
    } catch (_) { }

    const msg = String(error?.message || error);
    const hint = (msg.includes('partner_type_code') || msg.includes('partner_type_name') || msg.includes('partner_axes') || msg.includes('partner_version'))
      ? '<br><br><small>DB에 성장파트너 컬럼이 없어 저장하지 못했어요. `supabase_migrations/2026-02-15_add_partner_type_columns.sql`을 적용해 주세요.</small>'
      : '';
    showModal({ type: 'alert', icon: '❌', title: '오류', message: '성향 저장 실패: ' + msg + hint });
  }
}

function getPartnerLearningEnvironmentText(supportTag) {
  if (supportTag === '#함께 성장형') {
    return '친구와 설명 연습, 모둠 토론처럼 함께 배우는 활동에서 강점이 잘 살아나요.';
  }
  if (supportTag === '#혼자 집중형') {
    return '혼자 깊이 집중해 정리하고 복습하는 흐름에서 실력이 가장 안정적으로 쌓여요.';
  }
  return '나에게 맞는 학습 리듬으로 배울 때 성장 속도가 더 좋아져요.';
}

function withTopicParticle(text) {
  const value = String(text || '').trim();
  if (!value) return '이 유형은';
  const lastChar = value.charAt(value.length - 1);
  const code = lastChar.charCodeAt(0);
  const isHangul = code >= 0xAC00 && code <= 0xD7A3;
  if (!isHangul) return `${value}는`;
  const hasBatchim = ((code - 0xAC00) % 28) !== 0;
  return `${value}${hasBatchim ? '은' : '는'}`;
}

function getPartnerEmpathyText(partner, supportTag) {
  const typeName = String(partner?.type_name || '이 유형');
  const typeSubject = withTopicParticle(typeName);
  if (supportTag === '#함께 성장형') {
    return `${typeSubject} 함께 이야기하고 협력할 때 이해가 더 깊어지는 유형이에요.`;
  }
  if (supportTag === '#혼자 집중형') {
    return `${typeSubject} 혼자 몰입해 차근차근 정리할 때 강점이 가장 잘 드러나요.`;
  }
  return `${typeSubject} 나만의 방식으로 배울 때 성장이 더 선명하게 보이는 유형이에요.`;
}

function getPartnerToneClass(typeCode) {
  const code = String(typeCode || '').trim();
  if (!code) return 'tone-blue';
  if (code.startsWith('해결디테일')) return 'tone-blue';     // 구체적인
  if (code.startsWith('해결큰그림')) return 'tone-purple';   // 큰그림형
  if (code.startsWith('지지디테일')) return 'tone-green';    // 함께하는
  if (code.startsWith('지지큰그림')) return 'tone-orange';   // 공감하는
  return 'tone-blue';
}

const PARTNER_TYPE_HINT_TEXT = {
  '해결디테일계획': '정확히 짚어주고, 계획표로 차근차근 정리',
  '해결디테일탐색': '정확히 짚어주고, 작은 도전으로 바로 실천',
  '해결큰그림계획': '큰 방향을 잡고, 우선순위로 길을 정리',
  '해결큰그림탐색': '큰 방향을 잡고, 해볼 만한 선택지를 제안',
  '지지디테일계획': '함께 고민하며, 단계별로 차근차근 계획',
  '지지디테일탐색': '함께 고민하며, 부담 없는 도전을 시작',
  '지지큰그림계획': '마음을 먼저 살피고, 내 속도에 맞춰 방향 정리',
  '지지큰그림탐색': '마음을 먼저 살피고, 새로운 시도를 가볍게 제안'
};

const PARTNER_TYPE_RESULT_COPY = {
  '해결디테일계획': {
    feedback_style: '어디가 잘됐고 어디가 부족한지 정확하게 짚어줘요. 근거와 함께 알려주니까 뭘 고쳐야 할지 바로 알 수 있어요.',
    action_style: '뭘 언제까지 하면 되는지 계획표로 정리해줘요. 하나씩 체크하다 보면 성장이 눈에 보여요.'
  },
  '해결디테일탐색': {
    feedback_style: '어디가 잘됐고 어디가 부족한지 정확하게 짚어줘요. 핵심만 콕 집어주니까 바로 행동으로 옮길 수 있어요.',
    action_style: '부담 없이 해볼 수 있는 작은 도전을 제안해줘요. 한 번 해보면 자신감이 붙어요.'
  },
  '해결큰그림계획': {
    feedback_style: '지금 어디쯤 있고 어디로 가면 되는지 방향을 잡아줘요. 전체 그림이 보이니까 흔들리지 않아요.',
    action_style: '뭐부터 해야 하는지 우선순위를 정리해줘요. 순서대로 하다 보면 길이 선명해져요.'
  },
  '해결큰그림탐색': {
    feedback_style: '지금 어디쯤 있고 어디로 가면 되는지 방향을 잡아줘요. 가능성을 보여주니까 도전하고 싶어져요.',
    action_style: '여러 가능성 중에 해볼 만한 걸 제안해줘요. 해보면서 나한테 맞는 길을 찾아가요.'
  },
  '지지디테일계획': {
    feedback_style: '잘한 부분을 먼저 알아봐주고, 부족한 점은 같이 고민해줘요. 안심이 되니까 더 솔직하게 받아들일 수 있어요.',
    action_style: '차근차근 할 수 있도록 단계를 나눠서 정리해줘요. 한 걸음씩 같이 가는 느낌이에요.'
  },
  '지지디테일탐색': {
    feedback_style: '잘한 부분을 먼저 알아봐주고, 부족한 점은 같이 고민해줘요. 혼자가 아니라는 느낌이 힘이 돼요.',
    action_style: '부담 없는 작은 도전을 함께 시작해줘요. 같이 하니까 용기가 생겨요.'
  },
  '지지큰그림계획': {
    feedback_style: '지금 기분이나 상황을 먼저 알아주고, 큰 방향을 함께 잡아줘요. 마음이 편해진 다음에 움직이니까 더 잘돼요.',
    action_style: '무리하지 않는 선에서 목표와 순서를 정리해줘요. 내 속도에 맞춰 가니까 지치지 않아요.'
  },
  '지지큰그림탐색': {
    feedback_style: '지금 기분이나 상황을 먼저 알아주고, 큰 방향을 함께 잡아줘요. 내 마음을 알아주니까 더 열리게 돼요.',
    action_style: '호기심을 자극하는 새로운 시도를 제안해줘요. 재밌어서 하다 보면 어느새 성장해 있어요.'
  }
};

function getPartnerResultCopy(typeInfo) {
  const code = String(typeInfo?.type_code || '').trim();
  const mapped = code ? PARTNER_TYPE_RESULT_COPY[code] : null;

  const fallbackFeedback = '어디가 잘됐고 어디를 보완하면 좋을지 정확하게 짚어줘요.';
  const fallbackAction = '무엇을 언제까지 하면 좋을지 계획으로 정리해줘요.';

  return {
    feedback_style: String(mapped?.feedback_style || typeInfo?.description?.feedback_style || fallbackFeedback).trim(),
    action_style: String(mapped?.action_style || typeInfo?.description?.action_style || fallbackAction).trim()
  };
}

function getPartnerTypeHint(typeInfo) {
  const code = String(typeInfo?.type_code || '').trim();
  if (code && PARTNER_TYPE_HINT_TEXT[code]) return PARTNER_TYPE_HINT_TEXT[code];

  const feedback = String(typeInfo?.description?.feedback_style || '').trim();
  if (feedback) return feedback;
  const action = String(typeInfo?.description?.action_style || '').trim();
  if (action) return action;
  return '학습 방식이 다른 성장 파트너';
}

function normalizePartnerQuote(text) {
  const value = String(text || '').trim();
  return value.replace(/^\s*["']+/, '').replace(/["']+\s*$/, '').trim();
}

function showPersonalityResult(type) {
  const partner = (type && typeof type === 'object') ? type : null;
  if (!partner || !partner.type_code) {
    const descEl = document.getElementById('personalityDesc');
    if (descEl) descEl.textContent = '유형 정보를 불러오지 못했어요. 다시 진단해 주세요.';
    return;
  }

  const iconEl = document.getElementById('personalityIcon');
  const titleEl = document.getElementById('personalityTitle');
  const descEl = document.getElementById('personalityDesc');
  const cardEl = document.getElementById('personalityCard');

  // 상단 기본 헤더(기존 DOM)는 비워두고, 카드 내부에서 결과 헤더/타입을 일관되게 렌더링한다.
  if (iconEl) iconEl.textContent = '';
  if (titleEl) titleEl.textContent = '';

  const partnerCopy = getPartnerResultCopy(partner);
  const feedbackStyle = partnerCopy.feedback_style;
  const actionStyle = partnerCopy.action_style;
  const encouragingPhraseRaw = String(partner.description?.encouraging_phrase || '충분히 잘하고 있어. 지금 방식대로 한 걸음씩 가보자.').trim();
  const encouragingPhrase = normalizePartnerQuote(encouragingPhraseRaw);
  const supportTagRaw = String(partner.axes_raw?.support_tag || '').trim();
  const supportTag = supportTagRaw || '#성장 파트너형';
  const learningEnvironmentText = getPartnerLearningEnvironmentText(supportTagRaw);
  const empathyText = getPartnerEmpathyText(partner, supportTagRaw);
  const toneClass = getPartnerToneClass(partner.type_code);

  if (descEl) {
    descEl.innerHTML = `
      <div class="partner-result-shell">
        <div class="partner-result-title">나의 성장 파트너를 찾았어요!</div>
        <div class="partner-result-identity">
          <div class="partner-result-identity-card ${toneClass}">
            <span class="partner-result-identity-emoji">${escapeHtml(partner.emoji || '🧠')}</span>
            <span class="partner-result-identity-name">${escapeHtml(partner.type_name || partner.type_code)}</span>
            <span class="partner-result-tag-badge">${escapeHtml(supportTag)}</span>
            <div class="partner-result-identity-message">${escapeHtml(empathyText)}</div>
          </div>
        </div>
        <div class="partner-result-cards">
          <div class="partner-result-card">
            <div class="partner-result-card-title">💬 피드백 스타일</div>
            <div class="partner-result-card-body">${escapeHtml(feedbackStyle)}</div>
          </div>
          <div class="partner-result-card">
            <div class="partner-result-card-title">🚀 실천 방식</div>
            <div class="partner-result-card-body">${escapeHtml(actionStyle)}</div>
          </div>
          <div class="partner-result-card">
            <div class="partner-result-card-title">📚 학습 환경</div>
            <div class="partner-result-card-body">${escapeHtml(learningEnvironmentText)}</div>
          </div>
        </div>
        <div class="partner-result-quote">
          <div class="partner-result-card-title">💡 이런 말이 힘이 돼요</div>
          <div class="partner-result-quote-body">${escapeHtml(encouragingPhrase)}</div>
        </div>
      </div>
    `;
  }

  if (cardEl) cardEl.className = 'accent-box personality-result-card';

  const allContainer = document.getElementById('allPersonalityTypes');
  if (allContainer) {
    let html = `
      <details class="partner-type-accordion">
        <summary class="partner-type-summary">
          <span class="partner-type-summary-title">📌 8가지 성장 파트너 유형</span>
          <span class="partner-type-summary-state" aria-hidden="true"></span>
        </summary>
        <div class="partner-type-list">
    `;
    PARTNER_TYPES.forEach(t => {
      const isMine = t.type_code === partner.type_code;
      const meBadge = isMine ? '<strong class="partner-type-me">(나)</strong>' : '';
      html += `
        <div class="partner-type-item${isMine ? ' mine' : ''}">
          <div class="partner-type-main">
            <span class="partner-type-emoji">${escapeHtml(t.emoji || '🧠')}</span>
            <span class="partner-type-name">${escapeHtml(t.type_name)} ${meBadge}</span>
          </div>
          <div class="partner-type-hint">${escapeHtml(getPartnerTypeHint(t))}</div>
        </div>
      `;
    });
    html += '</div></details>';
    allContainer.innerHTML = html;
  }
}

function confirmPersonalityResult() {
  document.getElementById('personalityResult').classList.add('hidden');
  document.getElementById('selfEvaluationMenu').classList.remove('hidden');
  switchSelfTab('daily');
}
// ============================================
// 성장 대시보드 기능
// ============================================

// 대시보드 데이터 로드
async function loadDashboardData() {
  if (!currentStudent || !currentClassCode) return;

  try {
    const { data: recordRows } = await db.from('daily_reflections')
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('student_id', String(currentStudent.id))
      .order('reflection_date', { ascending: false });
    const allRecords = recordRows || [];

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
  const { data: goalRows } = await db.from('student_goals')
    .select('*')
    .eq('class_code', currentClassCode)
    .eq('student_id', String(currentStudent.id))
    .order('created_at', { ascending: false });
  const goals = goalRows || [];

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
function activatePartnerMessageTab(period) {
  document.querySelectorAll('.summary-period-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
}

function extractPartnerGoalSuggestion(markdownText) {
  const plain = String(markdownText || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';

  const sentences = plain.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const candidate = sentences.find((s) => /다음|실천|계획|시도|해보|기록/.test(s) && s.length >= 12 && s.length <= 90);
  if (candidate) return candidate;

  const first = sentences[0] || plain;
  return first.length > 90 ? (first.slice(0, 90) + '...') : first;
}

function setPartnerGoalSuggestion(markdownText) {
  latestPartnerGoalSuggestion = extractPartnerGoalSuggestion(markdownText);

  const btn = document.getElementById('partnerMessageGoalBtn');
  const hint = document.getElementById('partnerMessageGoalHint');
  if (!btn || !hint) return;

  if (!latestPartnerGoalSuggestion) {
    btn.disabled = true;
    hint.textContent = 'AI 메시지를 먼저 받아보세요.';
    return;
  }

  btn.disabled = false;
  hint.textContent = `추천 실천: ${latestPartnerGoalSuggestion}`;
}

async function applyPartnerMessageGoal() {
  const hint = document.getElementById('partnerMessageGoalHint');
  const btn = document.getElementById('partnerMessageGoalBtn');

  if (!latestPartnerGoalSuggestion) {
    if (hint) hint.textContent = '먼저 성장 파트너 메시지를 받아주세요.';
    return;
  }
  if (!currentStudent || !currentClassCode) {
    if (hint) hint.textContent = '학생 정보가 없어 목표를 저장할 수 없습니다.';
    return;
  }
  if (isDemoMode) {
    showDemoBlockModal();
    return;
  }

  const period = document.querySelector('.summary-period-btn.active')?.dataset.period || 'week';
  const goalType = period === 'month' ? 'monthly' : 'weekly';

  if (btn) btn.disabled = true;
  try {
    await db.from('student_goals').insert({
      class_code: currentClassCode,
      student_id: String(currentStudent.id),
      goal_text: latestPartnerGoalSuggestion,
      goal_type: goalType
    });

    if (hint) hint.textContent = '목표로 저장되었습니다. 🎯';
    if (typeof loadGoals === 'function') loadGoals();
  } catch (error) {
    if (hint) hint.textContent = '목표 저장 중 오류가 발생했습니다.';
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function generatePartnerMessage(period = 'week') {
  const p = (period === 'month' || period === 'all') ? period : 'week';
  activatePartnerMessageTab(p);

  if (p === 'all') {
    return generateGrowthReport({ targetAreaId: 'summaryReportArea', suppressButtonLoading: true });
  }
  return generateSummaryReport(p, { targetAreaId: 'summaryReportArea', skipTabActivation: true });
}

async function generateSummaryReport(period, options = {}) {
  if (!currentStudent || !currentClassCode) return;

  const p = (period === 'month') ? 'month' : 'week';
  if (!options.skipTabActivation) activatePartnerMessageTab(p);

  const area = document.getElementById(options.targetAreaId || 'summaryReportArea');
  if (!area) return;

  area.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">🤖 성장 파트너가 메시지를 작성 중...</div>';
  setPartnerGoalSuggestion('');

  const kr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const endDate = kr.toISOString().split('T')[0];
  const startDate = new Date(kr);
  startDate.setDate(startDate.getDate() - (p === 'week' ? 7 : 30));
  const startStr = startDate.toISOString().split('T')[0];

  try {
    const partner = studentPartner || await ensureStudentPartnerLoaded({ backfill: true });

    const [dailyRes, projectRes, goalsRes] = await Promise.allSettled([
      db.from('daily_reflections')
        .select('*')
        .eq('class_code', currentClassCode)
        .eq('student_id', String(currentStudent.id))
        .gte('reflection_date', startStr)
        .lte('reflection_date', endDate)
        .order('reflection_date', { ascending: true }),
      db.from('project_reflections')
        .select('*')
        .eq('class_code', currentClassCode)
        .eq('student_id', String(currentStudent.id))
        .gte('reflection_date', startStr)
        .lte('reflection_date', endDate)
        .order('reflection_date', { ascending: false }),
      db.from('student_goals')
        .select('*')
        .eq('class_code', currentClassCode)
        .eq('student_id', String(currentStudent.id))
        .order('created_at', { ascending: false })
    ]);

    const records = (dailyRes.status === 'fulfilled' && Array.isArray(dailyRes.value?.data)) ? dailyRes.value.data : [];
    const projects = (projectRes.status === 'fulfilled' && Array.isArray(projectRes.value?.data)) ? projectRes.value.data : [];
    const goals = (goalsRes.status === 'fulfilled' && Array.isArray(goalsRes.value?.data)) ? goalsRes.value.data : [];

    if (records.length === 0 && projects.length === 0 && goals.length === 0) {
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span><div class="empty-desc">이 기간에 기록이 없어요. 먼저 배움 노트를 남겨보세요!</div></div>';
      return;
    }

    const clip = (s, maxLen) => {
      if (!s) return '';
      const t = String(s).replace(/\s+/g, ' ').trim();
      return t.length > maxLen ? (t.slice(0, maxLen) + '...') : t;
    };

    const inputObj = {
      student_partner: partner ? {
        type_code: partner.type_code,
        type_name: partner.type_name,
        axes: partner.axes || null,
        axes_raw: partner.axes_raw || null,
        style_guide: partner.style_guide || null
      } : null,
      self_context: {
        report_kind: p === 'week' ? 'summary_week' : 'summary_month',
        date_range: `${startStr} ~ ${endDate}`,
        record_counts: {
          daily_reflections: records.length,
          project_reflections: projects.length,
          goals: goals.length
        },
        daily_reflections_sample: records.slice(-10).map(r => ({
          date: r.reflection_date,
          learning_text: clip(r.learning_text, 220) || null,
          subject_tags: Array.isArray(r.subject_tags) ? r.subject_tags : []
        })),
        project_reflections_sample: projects.slice(0, 5).map(pj => ({
          date: pj.reflection_date,
          project_name: pj.project_name || '',
          comment: clip(pj.comment, 180) || null
        })),
        goals_snapshot: goals.slice(0, 8).map(g => ({
          goal: g.goal_text || '',
          status: g.is_completed ? 'done' : 'ongoing'
        }))
      }
    };

    const header1 = '이번 주/이번 달 돌아보기';
    const header2 = (partner?.axes_raw?.info_processing === '디테일형')
      ? '근거와 구체 포인트'
      : '패턴과 변화 흐름';
    const header3 = getExecutionStrategyHeader(partner);

    const prompt = [
      '[ROLE]',
      "너는 '배움로그'의 AI 성장 파트너다.",
      '학생에게 1:1로 말하는 톤으로, 반말은 쓰지 않되 딱딱하지 않은 친근한 존댓말(해요체)을 사용한다.',
      "교사가 아니라 '옆에서 같이 고민해주는 파트너' 느낌으로 작성한다.",
      '',
      '[INPUT]',
      JSON.stringify(inputObj, null, 2),
      '',
      '[8 TYPE LIBRARY]',
      buildPartnerTypeLibraryText(),
      '',
      '[OUTPUT: 카드 UI 최적화 / 마크다운만]',
      `## ${header1}`,
      `## ${header2}`,
      `## ${header3}`,
      '',
      '[작성 규칙]',
      '1) 인사말 없이 바로 시작.',
      '2) student_partner의 3개 축(coaching_style/info_processing/execution_strategy)을 반드시 조합 적용.',
      '3) #함께 성장형이면 협력 활동, #혼자 집중형이면 개인 활동을 실천 제안에 포함.',
      '4) 기록이 짧거나 부족해도 비판하지 말고, 기록한 것 자체를 인정한 뒤 다음 단계를 제안.',
      '5) 해당 유형의 "이런 말이 힘이 돼요" 예시를 참고해 유사 톤으로 작성.',
      '6) 한국어로만 작성, 10~16문장 내외.'
    ].join('\n');

    const result = await callGemini(prompt, { generationConfig: { temperature: 0.5, maxOutputTokens: 900 } });

    const output = (result.ok && result.text)
      ? String(result.text)
      : (p === 'week'
        ? '## 이번 주/이번 달 돌아보기\n이번 주 기록이 잘 쌓였어요.\n\n## 패턴과 변화 흐름\n반복되는 강점이 보이고 있어요.\n\n## 다음 성장 계획(실천)\n이번 주에는 실천 한 가지를 정해서 기록해보세요.'
        : '## 이번 주/이번 달 돌아보기\n이번 달 기록이 잘 쌓였어요.\n\n## 패턴과 변화 흐름\n반복되는 강점이 보이고 있어요.\n\n## 다음 성장 계획(실천)\n다음 달에는 실천 한 가지를 정해서 기록해보세요.');

    area.innerHTML = '<div style="line-height:1.7; color:var(--text-main); font-size:0.93rem;">' + formatMarkdown(output) + '</div>';
    setPartnerGoalSuggestion(output);
  } catch (error) {
    area.innerHTML = '<div style="color:var(--color-danger);">메시지 생성 중 오류가 발생했습니다.</div>';
    setPartnerGoalSuggestion('');
  }
}

async function generateGrowthReport(options = {}) {
  if (!currentStudent || !currentClassCode) return;

  const area = document.getElementById(options.targetAreaId || 'growthReportArea');
  if (!area) return;

  const btn = document.getElementById('growthReportBtn');
  if (btn && !options.suppressButtonLoading) setLoading(true, btn, '🤖 분석 중...');

  area.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">전체 기록을 분석하고 있어요...</div>';
  setPartnerGoalSuggestion('');

  try {
    const partner = studentPartner || await ensureStudentPartnerLoaded({ backfill: true });

    const [dailyRes, projectRes, goalsRes] = await Promise.allSettled([
      db.from('daily_reflections')
        .select('*')
        .eq('class_code', currentClassCode)
        .eq('student_id', String(currentStudent.id))
        .order('reflection_date', { ascending: true }),
      db.from('project_reflections')
        .select('*')
        .eq('class_code', currentClassCode)
        .eq('student_id', String(currentStudent.id))
        .order('reflection_date', { ascending: false }),
      db.from('student_goals')
        .select('*')
        .eq('class_code', currentClassCode)
        .eq('student_id', String(currentStudent.id))
        .order('created_at', { ascending: false })
    ]);

    const records = (dailyRes.status === 'fulfilled' && Array.isArray(dailyRes.value?.data)) ? dailyRes.value.data : [];
    const projects = (projectRes.status === 'fulfilled' && Array.isArray(projectRes.value?.data)) ? projectRes.value.data : [];
    const goals = (goalsRes.status === 'fulfilled' && Array.isArray(goalsRes.value?.data)) ? goalsRes.value.data : [];

    if (records.length < 1 && projects.length === 0 && goals.length === 0) {
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">📝</span><div class="empty-desc">분석할 기록이 아직 없어요.</div></div>';
      if (btn && !options.suppressButtonLoading) setLoading(false, btn, '🤖 AI 성장 리포트 받기');
      return;
    }

    const clip = (s, maxLen) => {
      if (!s) return '';
      const t = String(s).replace(/\s+/g, ' ').trim();
      return t.length > maxLen ? (t.slice(0, maxLen) + '...') : t;
    };

    const firstDate = records.length ? records[0].reflection_date : null;
    const lastDate = records.length ? records[records.length - 1].reflection_date : null;
    const date_range = (firstDate && lastDate) ? `${firstDate} ~ ${lastDate}` : getDefaultQueryDate();

    const inputObj = {
      student_partner: partner ? {
        type_code: partner.type_code,
        type_name: partner.type_name,
        axes: partner.axes || null,
        axes_raw: partner.axes_raw || null,
        style_guide: partner.style_guide || null
      } : null,
      self_context: {
        report_kind: 'growth_all',
        date_range,
        record_counts: {
          daily_reflections: records.length,
          project_reflections: projects.length,
          goals: goals.length
        },
        daily_reflections_sample: records.slice(-14).map(r => ({
          date: r.reflection_date,
          learning_text: clip(r.learning_text, 220) || null,
          subject_tags: Array.isArray(r.subject_tags) ? r.subject_tags : []
        })),
        project_reflections_sample: projects.slice(0, 6).map(pj => ({
          date: pj.reflection_date,
          project_name: pj.project_name || '',
          comment: clip(pj.comment, 180) || null
        })),
        goals_snapshot: goals.slice(0, 10).map(g => ({
          goal: g.goal_text || '',
          status: g.is_completed ? 'done' : 'ongoing'
        }))
      }
    };

    const header1 = '나의 전체 성장 분석';
    const header2 = (partner?.axes_raw?.info_processing === '디테일형')
      ? '근거와 구체 포인트'
      : '패턴과 변화 흐름';
    const header3 = getExecutionStrategyHeader(partner);

    const prompt = [
      '[ROLE]',
      "너는 '배움로그'의 AI 성장 파트너다.",
      '학생에게 1:1로 말하는 톤으로, 반말은 쓰지 않되 딱딱하지 않은 친근한 존댓말(해요체)을 사용한다.',
      "교사가 아니라 '옆에서 같이 고민해주는 파트너' 느낌으로 작성한다.",
      '',
      '[INPUT]',
      JSON.stringify(inputObj, null, 2),
      '',
      '[8 TYPE LIBRARY]',
      buildPartnerTypeLibraryText(),
      '',
      '[OUTPUT: 카드 UI 최적화 / 마크다운만]',
      `## ${header1}`,
      `## ${header2}`,
      `## ${header3}`,
      '',
      '[작성 규칙]',
      '1) 인사말 없이 바로 시작.',
      '2) student_partner의 3개 축(coaching_style/info_processing/execution_strategy)을 반드시 조합 적용.',
      '3) #함께 성장형이면 협력 활동, #혼자 집중형이면 개인 활동을 실천 제안에 포함.',
      '4) 기록이 짧거나 부족해도 비판하지 말고, 기록한 것 자체를 인정한 뒤 다음 단계를 제안.',
      '5) 해당 유형의 "이런 말이 힘이 돼요" 예시를 참고해 유사 톤으로 작성.',
      '6) 한국어로만 작성, 12~20문장 내외.'
    ].join('\n');

    const result = await callGemini(prompt, { generationConfig: { temperature: 0.5, maxOutputTokens: 1100 } });

    const output = (result.ok && result.text)
      ? String(result.text)
      : '## 나의 전체 성장 분석\n지금까지의 기록이 잘 쌓이고 있어요.\n\n## 패턴과 변화 흐름\n반복되는 강점이 분명히 보입니다.\n\n## 다음 성장 계획(실천)\n이번 주에는 한 가지 실천을 정해서 꾸준히 기록해보세요.';

    area.innerHTML = '<div style="line-height:1.7; color:var(--text-main); font-size:0.93rem;">' + formatMarkdown(output) + '</div>';
    setPartnerGoalSuggestion(output);
  } catch (error) {
    area.innerHTML = '<div style="color:var(--color-danger);">리포트 생성 중 오류가 발생했습니다.</div>';
    setPartnerGoalSuggestion('');
  } finally {
    const btn = document.getElementById('growthReportBtn');
    if (btn && !options.suppressButtonLoading) setLoading(false, btn, '🤖 AI 성장 리포트 받기');
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

















