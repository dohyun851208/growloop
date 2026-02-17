// ============================================
// Supabase ?ㅼ젙
// ============================================
const SUPABASE_URL = 'https://ftvalqzaiooebkulafzg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dmFscXphaW9vZWJrdWxhZnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzk1MzAsImV4cCI6MjA4NTk1NTUzMH0.M1qXvUIuNe2y-9y1gQ2svRdHvDKrMRQ4oMGZPIZveQs';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'public' },
  auth: { autoRefreshToken: true, persistSession: true }
});

// ============================================
// ?꾩뿭 蹂??
// ============================================
let currentRatings = {};
let ratingCriteria = [];
let currentStudent = null;
let currentClassCode = '';
let studentPartner = null; // 8-type growth partner (derived from student_personality.question_responses)
let latestPartnerGoalSuggestion = '';

// 援먯궗???ㅼ뒪濡쒕같?) - 援먭낵?명듅 ?앹꽦 ?곹깭
let teacherDiarySelectedStudentId = null;
let currentTeacherDiarySubTab = 'overview'; // overview | student | comment
let teacherSubjectCommentSemester = 1;
let teacherSubjectCommentSelectedSubject = '';
let teacherSubjectCommentLastGenerated = null; // { mode, text, noteCount, key, items[] }
let teacherSubjectCommentSettingsSaveTimer = null;
let teacherSubjectCommentLastSettings = null; // cached class settings
const TEACHER_SUBJECT_COMMENT_ALL_STUDENTS = '__ALL_STUDENTS__';

// ?먭린?됯? ?꾩뿭 蹂??
let selectedSubjectTags = [];
let currentMessageMode = null; // 'anonymous' or 'named'
const OTHER_SUBJECT_TAG = '기타';
const PRESET_SUBJECT_TAGS = [
  '국어', '수학', '사회', '과학', '영어', '음악', '미술',
  '체육', '도덕', '실과', '기술', '가정', '통합교과', '토론', '발표', '모둠활동', OTHER_SUBJECT_TAG
];

let quizAnswers = {}; // ?깊뼢 吏꾨떒 ?듬? ???
let studentPersonality = null; // ?숈깮 ?깊뼢 ?뺣낫

// 泥댄뿕 紐⑤뱶 ?꾩뿭 蹂??
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
      <h3 style="margin:0 0 10px; color:var(--primary);">??븷???좏깮??二쇱꽭??/h3>
      <p style="margin:0 0 14px; color:var(--text-sub);">泥섏쓬 濡쒓렇?명븳 怨꾩젙?낅땲??</p>
      <div style="display:grid; gap:10px;">
        <button type="button" onclick="window.location.href='app.html?role=student'" style="background:var(--color-blue);">?숈깮?쇰줈 ?쒖옉</button>
        <button type="button" onclick="window.location.href='app.html?role=teacher'" style="background:var(--color-teacher);">援먯궗濡??쒖옉</button>
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
    '기술': '🛠',
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
    btn.textContent = `${iconMap[tag] || '?뱦'} ${tag}`;
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
    input.placeholder = '湲고? ?쒕룞??吏곸젒 ?낅젰?섏꽭??(?? 臾쇰━, ?멸퀎?? 誘몄쟻遺?';
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
// 援ш? ?몄쬆 諛??쇱슦??(New)
// ============================================

// ?섏씠吏 濡쒕뱶 ???몄쬆 諛???븷 ?뺤씤
async function checkAuthAndRoute() {
  try {
    // --- 泥댄뿕 紐⑤뱶 媛먯? ---
    const demoParams = new URLSearchParams(window.location.search);
    const demoParam = demoParams.get('demo');
    if (demoParam === 'student' || demoParam === 'teacher') {
      isDemoMode = true;
      demoRole = demoParam;
      initDemoMode(demoParam);
      return;
    }
    // --- 泥댄뿕 紐⑤뱶 媛먯? ??---

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
            <p style="margin-top:15px; color:var(--text-sub);">濡쒓렇???뺤씤 以?..</p>
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

      // 癒쇱? 濡쒕뵫 ?④린怨???쓣 ?쒖떆?섏뿬 鍮??붾㈃ 諛⑹?
      document.getElementById('authLoadingSection').classList.add('hidden');
      const tTab = document.getElementById('teacherTab');
      const tMain = document.getElementById('teacherMain');

      tTab.classList.remove('hidden');
      tTab.style.display = 'block';
      tTab.style.opacity = '1';

      tMain.classList.remove('hidden');
      tMain.style.display = 'block';
      tMain.style.opacity = '1';

      // 援먯궗??硫붿씤 ?붾㈃ 吏꾩엯 ??湲곕낯?곸쑝濡?'?숇즺?됯?(review)' ??쓣 ?꾩슦怨??됯? 湲곗? 珥덇린??
      setTimeout(() => {
        switchMiniTab('diary');
      }, 100);



      // 湲곕낯 ??쑝濡?'?먭린?됯?' 吏꾩엯
      try {
        await switchMiniTab('diary');
      } catch (dataError) {
        console.warn('援먯궗 ?곗씠??濡쒕뱶 以??쇰? ?ㅻ쪟:', dataError);
      }



    } else {
      setAppLayoutMode('student');
      currentClassCode = profile.class_code;
      currentStudent = {
        id: String(profile.student_number),
        type: profile.student_type || 'individual',
        name: profile.student_number
      };

      // 癒쇱? 濡쒕뵫 ?④린怨?UI ?쒖떆?섏뿬 鍮??붾㈃ 諛⑹?
      document.getElementById('authLoadingSection').classList.add('hidden');
      document.getElementById('studentTab').classList.remove('hidden');
      document.getElementById('studentMainSection').classList.remove('hidden');

      const typeText = currentStudent.type === 'individual' ? '?숈깮' : '紐⑤몺';
      document.getElementById('welcomeMsg').textContent = currentClassCode + ' ' + currentStudent.id + '踰?' + typeText + ' ?섏쁺?⑸땲??';

      document.getElementById('reviewerId').value = currentStudent.id;
      document.getElementById('submitReviewerLabel').textContent = currentStudent.type === 'individual' ? '?섏쓽 踰덊샇' : '?섏쓽 紐⑤몺';

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

      // ?숇즺?됯? ?곗씠???ъ쟾 濡쒕뱶 (?ㅽ뙣?대룄 ?붾㈃? ?좎?, ?숇즺?됯? ???꾪솚 ???щ줈?쒕맖)
      try {
        const initDate = document.getElementById('reviewDate').value;

        // 媛?荑쇰━瑜?媛쒕퀎?곸쑝濡??ㅽ뻾?섏뿬 ?섎굹媛 ?ㅽ뙣?대룄 ?섎㉧吏???묐룞
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

        document.getElementById('objectiveText').textContent = objTask.objective || '?깅줉???숈뒿紐⑺몴媛 ?놁뒿?덈떎.';
        document.getElementById('taskText').textContent = objTask.task || '?깅줉???됯?怨쇱젣媛 ?놁뒿?덈떎.';
        ratingCriteria = criteria;
        renderRatingItems(criteria);

        const maxCount = currentStudent.type === 'group' ? settings.groupCount : settings.studentCount;
        renderTargetGrid(maxCount, currentStudent.id, completed, currentStudent.type);
      } catch (dataError) {
        console.warn('?숈깮 ?곗씠??濡쒕뱶 以??쇰? ?ㅻ쪟:', dataError);
        // 理쒖냼??湲곕낯 洹몃━?쒕뒗 ?쒖떆
        renderTargetGrid(isDemoMode ? 24 : 30, currentStudent.id, [], currentStudent.type);
      }
    }
  } catch (error) {
    console.error('Initial routing error:', error);
    const loadingSec = document.getElementById('authLoadingSection');
    loadingSec.classList.remove('hidden');
    loadingSec.innerHTML = `
      <div style="color:var(--color-danger); padding:20px;">
        <h3>?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎</h3>
        <p>${error.message}</p>
        <button onclick="location.reload()" style="margin-top:10px; padding:8px 16px; background:var(--primary); color:white; border:none; border-radius:8px;">?덈줈怨좎묠</button>
      </div>
    `;
  }
}

// 援ш? 濡쒓렇?꾩썐
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
// 泥댄뿕 紐⑤뱶 (Demo Mode)
// ============================================

// 泥댄뿕 紐⑤뱶 DB ?꾨줉???ㅼ튂 - 紐⑤뱺 write 李⑤떒, read??Supabase 吏곹넻
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

  // auth 硫붿꽌???ㅻ쾭?쇱씠??  db.auth.signOut = () => { window.location.replace('index.html'); return Promise.resolve(); };
  db.auth.getUser = () => Promise.resolve({ data: { user: { id: 'demo-user', email: 'demo@baeumlog.kr' } }, error: null });
  db.auth.getSession = () => Promise.resolve({ data: { session: { user: { id: 'demo-user', email: 'demo@baeumlog.kr' } } }, error: null });
}
// 泥댄뿕 紐⑤뱶 ???李⑤떒 紐⑤떖
function showDemoBlockModal() {
  // 紐⑤떖???대? ?대젮?덉쑝硫??ㅽ궢
  const modal = document.getElementById('customModal');
  if (modal && !modal.classList.contains('hidden')) return;
  showModal({
    type: 'alert',
    icon: '?뵏',
    title: '泥댄뿕 紐⑤뱶',
    message: '???섏씠吏??泥댄뿕?⑹씠湲??뚮Ц??br>??μ씠 遺덇??ν빀?덈떎.'
  });
}

// 泥댄뿕 紐⑤뱶 珥덇린??
function initDemoMode(role) {
  // DB ?꾨줉???ㅼ튂
  installDemoDbProxy();
  syncAllDates(DEMO_FIXED_QUERY_DATE);

  // 湲곕낯 ?꾩뿭 蹂???ㅼ젙
  currentClassCode = '체험용';

  // 濡쒕뵫 ?붾㈃ ?④린湲?
  document.getElementById('authLoadingSection').classList.add('hidden');

  if (role === 'student') {
    setAppLayoutMode('student');
    // ?숈깮 ?꾩뿭 蹂???ㅼ젙
    currentStudent = { id: '1', type: 'individual', name: '1' };
    studentPersonality = loadDemoPersonalityFromStorage();

    // ?숈깮 UI ?쒖떆
    document.getElementById('studentTab').classList.remove('hidden');
    document.getElementById('studentMainSection').classList.remove('hidden');
    document.getElementById('welcomeMsg').textContent = '泥댄뿕??1踰??숈깮 ?섏쁺?⑸땲?? (泥댄뿕 紐⑤뱶)';
    document.getElementById('reviewerId').value = '1';
    document.getElementById('submitReviewerLabel').textContent = '?섏쓽 踰덊샇';

    // 媛쒖씤 ?됯? ???湲곕낯 ?ㅼ젙
    const radios = document.getElementsByName('evalTypeDisplay');
    const resultRadios = document.getElementsByName('resultEvalTypeDisplay');
    if (radios[0]) radios[0].checked = true;
    if (resultRadios[0]) resultRadios[0].checked = true;

    // ?숈깮 湲곕낯 ??쑝濡??쒖옉
    switchStudentMainTab('self');

  } else if (role === 'teacher') {
    setAppLayoutMode('teacher');
    // 援먯궗 UI ?쒖떆
    const tTab = document.getElementById('teacherTab');
    const tMain = document.getElementById('teacherMain');
    tTab.classList.remove('hidden');
    tTab.style.display = 'block';
    tTab.style.opacity = '1';
    tMain.classList.remove('hidden');
    tMain.style.display = 'block';
    tMain.style.opacity = '1';

    // 援먯궗 湲곕낯 ??쑝濡??쒖옉
    setTimeout(() => { switchMiniTab('review'); }, 100);
  }

  // 泥댄뿕 紐⑤뱶 諛곕꼫 異붽?
  addDemoBanner(role);

  // 濡쒓렇?꾩썐 踰꾪듉 ??泥댄뿕 醫낅즺濡?蹂寃?
  document.querySelectorAll('button[onclick="logoutGoogle()"]').forEach(btn => {
    btn.textContent = '?룧 泥댄뿕 醫낅즺';
    btn.onclick = () => { window.location.replace('index.html'); };
  });
}

// 泥댄뿕 紐⑤뱶 ?곷떒 諛곕꼫
function addDemoBanner(role) {
  const banner = document.createElement('div');
  banner.id = 'demoBanner';
  banner.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:10000; ' +
    'background:linear-gradient(90deg, #fbbf24, #f59e0b); color:#78350f; ' +
    'text-align:center; padding:10px 16px; font-size:0.85rem; font-weight:700; ' +
    'font-family:"Jua",sans-serif; box-shadow:0 2px 8px rgba(0,0,0,0.1);';
  const roleText = role === 'student' ? '학생용' : '교사용';
  banner.innerHTML = '현재 체험 모드 (' + roleText + ')' + ' - 저장한 데이터는 실제로 반영되지 않아요 ' +
    '<a href="index.html" style="color:#78350f; margin-left:12px; text-decoration:underline; font-weight:700;">돌아가기</a>';
  document.body.prepend(banner);
  document.body.style.paddingTop = '42px';
}

// ?숈깮 ?⑤낫?????
async function saveStudentOnboarding() {
  const className = document.getElementById('onboardClassName').value.trim();
  let classCode = document.getElementById('onboardClassCode').value.replace(/\s/g, '');
  const type = document.querySelector('input[name="onboardType"]:checked').value;
  const num = document.getElementById('onboardStudentNumber').value.trim();
  const btn = document.getElementById('saveOnboardBtn');
  const msg = document.getElementById('onboardMsg');

  if (!className || !classCode || !num) {
    showMsg(msg, '紐⑤뱺 ?뺣낫瑜??낅젰?댁＜?몄슂.', 'error');
    return;
  }

  setLoading(true, btn, '???以?..');

  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error('濡쒓렇???몄뀡??留뚮즺?섏뿀?듬땲??');

    const { data: cls } = await db.from('classes').select('class_code').eq('class_code', classCode).maybeSingle();
    if (!cls) throw new Error('議댁옱?섏? ?딅뒗 ?대옒??肄붾뱶?낅땲?? ?좎깮?섍퍡 ?뺤씤?댁＜?몄슂.');

    // ?숈깮 踰덊샇 以묐났 泥댄겕
    const { data: existingStudent } = await db.from('user_profiles')
      .select('google_email')
      .eq('class_code', classCode)
      .eq('student_number', parseInt(num))
      .eq('role', 'student')
      .maybeSingle();
    if (existingStudent) throw new Error('?대? ?ㅻⅨ ?숈깮??' + num + '踰덉쓣 ?ъ슜 以묒엯?덈떎. ?좎깮?섍퍡 ?뺤씤?댁＜?몄슂.');

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
        throw new Error('?대? ?ㅻⅨ ?숈깮??' + num + '踰덉쓣 ?ъ슜 以묒엯?덈떎. ?좎깮?섍퍡 ?뺤씤?댁＜?몄슂.');
      }
      throw profileError;
    }

    showMsg(msg, '?ㅼ젙???꾨즺?섏뿀?듬땲??', 'success');
    window.location.href = 'app.html?role=student';

  } catch (error) {
    setLoading(false, btn, '?ㅼ젙 ?꾨즺');
    showMsg(msg, error.message, 'error');
  }
}

// 援먯궗 ?⑤낫?????
async function saveTeacherOnboarding() {
  const className = document.getElementById('newOnboardClassName').value.trim();
  const code = document.getElementById('newOnboardClassCode').value.replace(/\s/g, '');
  const btn = document.getElementById('saveTeacherOnboardBtn');
  const msg = document.getElementById('teacherOnboardMsg');

  if (!className || !code) {
    showMsg(msg, '?숆툒紐낃낵 ?대옒??肄붾뱶瑜?紐⑤몢 ?낅젰?섏꽭??', 'error');
    return;
  }
  if (code.length > 10) {
    showMsg(msg, '?대옒??肄붾뱶??10?먮━ ?대궡濡??낅젰?섏꽭??', 'error');
    return;
  }

  setLoading(true, btn, '?앹꽦 以?..');

  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error('濡쒓렇???몄뀡??留뚮즺?섏뿀?듬땲??');

    const { data: existing } = await db.from('classes').select('class_code').eq('class_code', code).maybeSingle();
    if (existing) throw new Error('?대? ?ъ슜 以묒씤 ?대옒??肄붾뱶?낅땲??');

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

    showMsg(msg, '?대옒?ㅺ? ?앹꽦?섏뿀?듬땲??', 'success');
    window.location.href = 'app.html?role=teacher';

  } catch (error) {
    setLoading(false, btn, '?대옒???앹꽦?섍린');
    showMsg(msg, error.message, 'error');
  }
}

// ?⑤낫??????좉? (?숈깮)
document.querySelectorAll('input[name="onboardType"]').forEach(radio => {
  radio.addEventListener('change', function () {
    const type = this.value;
    const label = document.getElementById('onboardIdLabel');
    const input = document.getElementById('onboardStudentNumber');

    if (type === 'individual') {
      label.textContent = '?섏쓽 踰덊샇';
      input.placeholder = '踰덊샇 ?낅젰 (?? 15)';
    } else {
      label.textContent = '?섏쓽 紐⑤몺 踰덊샇';
      input.placeholder = '紐⑤몺 踰덊샇 ?낅젰 (?? 1)';
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
// DB ?ы띁
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
// ?ㅽ겕濡??④낵
// ============================================
window.addEventListener('scroll', function () { const card = document.querySelector('.card'); if (window.scrollY > 50) card.classList.add('scrolled'); else card.classList.remove('scrolled'); });

// ============================================
// ?좏떥由ы떚
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

function renderReportMarkdownAsCards(markdownText) {
  const formatted = formatMarkdown(markdownText || '');
  if (!formatted) return '';

  const root = document.createElement('div');
  root.innerHTML = formatted;

  const sections = [];
  let current = null;

  Array.from(root.childNodes).forEach((node) => {
    const isEl = node.nodeType === 1;
    const tag = isEl ? node.tagName.toLowerCase() : '';
    const isHeader = tag === 'h3' || tag === 'h4';

    if (isHeader) {
      if (current) sections.push(current);
      current = { title: (node.textContent || '').trim(), bodyHtml: '' };
      return;
    }

    if (!current) current = { title: '?듭떖 ?뺣━', bodyHtml: '' };
    current.bodyHtml += isEl ? node.outerHTML : escapeHtml(node.textContent || '');
  });

  if (current) sections.push(current);
  if (sections.length === 0) {
    return '<div class="ai-report-content"><div class="ai-report-section"><div class="ai-report-section-body">' + formatted + '</div></div></div>';
  }

  return '<div class="ai-report-content">' + sections.map((section) => {
    const title = section.title || '?듭떖 ?뺣━';
    const bodyHtml = section.bodyHtml && section.bodyHtml.trim()
      ? section.bodyHtml
      : '<p>?댁슜??以鍮?以묒씠?먯슂.</p>';
    return '<section class="ai-report-section"><h4 class="ai-report-section-title">' + escapeHtml(title) + '</h4><div class="ai-report-section-body">' + bodyHtml + '</div></section>';
  }).join('') + '</div>';
}

function looksLikeCutOffKorean(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[.!?]$/.test(t)) return false;
  if (/(입니다|해요|했어요|됩니다|된다|할게요|합니다|완료)$/.test(t)) return false;
  if (/[)\]"']$/.test(t)) return false;
  return true;
}

function sanitizeAiSummaryText(text) {
  let t = String(text || '').trim();
  if (!t) return '';

  // Strip accidental working labels from LLM repair prompts.
  t = t.replace(/^\s*\[(수정본|TEXT)\]\s*/gi, '');
  t = t.replace(/^\s*```(?:markdown)?\s*/i, '').replace(/\s*```\s*$/i, '');

  // Normalize excessive blank lines.
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
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

// ?숈깮 ?됯? ????꾪솚 (媛쒖씤 ??紐⑤몺)
async function switchTypeAndLogout(newType) {
  if (!currentStudent) return;
  currentStudent.type = newType;

  // DB ?꾨줈???낅뜲?댄듃
  try {
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      await db.from('user_profiles')
        .update({ student_type: newType })
        .eq('google_uid', user.id);
    }
  } catch (err) {
    console.warn('????낅뜲?댄듃 ?ㅻ쪟:', err);
  }

  // UI ?쇰꺼 蹂寃?
  document.getElementById('submitReviewerLabel').textContent = newType === 'individual' ? '?섏쓽 踰덊샇' : '?섏쓽 紐⑤몺';
  document.getElementById('reviewerId').value = currentStudent.id;

  // ?묒そ ?쇰뵒???숆린??
  const radios = document.getElementsByName('evalTypeDisplay');
  const resultRadios = document.getElementsByName('resultEvalTypeDisplay');
  radios.forEach(r => r.checked = (r.value === newType));
  resultRadios.forEach(r => r.checked = (r.value === newType));

  // ?됯?湲곗? & ???洹몃━???덈줈 濡쒕뱶
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
// 紐⑤떖
// ============================================
function showModal({ type = 'alert', icon = '📌', title = '알림', message, inputPlaceholder = '', onConfirm = null, onCancel = null }) {
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
function showCustomConfirm(message, onConfirm, onCancel) {
  showModal({ type: 'confirm', icon: '❓', title: '확인', message, onConfirm, onCancel });
}
// ============================================
// ???꾪솚
// ============================================

// ?숈깮 硫붿씤 ???좏깮 (?먭린?됯? vs ?숇즺?됯?)
function switchStudentMainTab(mode) {
  // ?숈깮???섎떒 ?대퉬寃뚯씠??踰꾪듉留??좏깮
  const btns = document.querySelectorAll('#studentMainSection .bottom-nav .nav-item');
  document.getElementById('peerEvaluationSection').classList.add('hidden');
  document.getElementById('selfEvaluationSection').classList.add('hidden');
  document.getElementById('praiseSection').classList.add('hidden');
  const settingsSec = document.getElementById('studentSettingsSection');
  if (settingsSec) settingsSec.classList.add('hidden');

  // 踰꾪듉 ?ㅽ???珥덇린??(active-nav ?대옒???쒓굅)
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

  // 諛뺤뒪 1: ?숆툒 ?뺣낫 ?쒖떆
  document.getElementById('settingsClassCode').textContent = currentClassCode;
  const { data: cls } = await db.from('classes').select('class_name').eq('class_code', currentClassCode).maybeSingle();
  if (cls) {
    document.getElementById('settingsClassName').textContent = cls.class_name;
  }

  // 諛뺤뒪 2: ?깊뼢 吏꾨떒 ?뺣낫 ?쒖떆
  const area = document.getElementById('settingsPersonalityArea');
  try {
    const { data: personality } = await db.from('student_personality')
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('student_id', currentStudent.id)
      .maybeSingle();

    if (!personality) {
      area.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding:20px 0;">?꾩쭅 吏꾨떒?섏? ?딆븯?댁슂.<br>?ㅼ뒪濡?諛곗? ??뿉??吏꾨떒???쒖옉?대낫?몄슂!</p>';
      return;
    }

    const partner = getPartnerFromPersonalityRow(personality);
    if (partner && partner.type_code) {
      // Cache for later AI usage in this session
      studentPersonality = personality;
      studentPartner = partner;

      const axisBadges = partner.axes ? Object.values(partner.axes) : [];

      let html = `
        <div style="text-align:center; padding:15px 0; margin-bottom:15px; background:var(--primary-light); border:2px solid var(--primary); border-radius:14px;">
          <div style="font-size:2.5rem; margin-bottom:6px;">${partner.emoji || '?쭬'}</div>
          <div style="font-weight:700; font-size:1.1rem; color:var(--text-main);">?섏쓽 ?깆옣 ?뚰듃?? ${escapeHtml(partner.type_name)}</div>
          ${axisBadges.length ? `<div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap; margin-top:10px;">${axisBadges.map(b => `<span style="font-size:0.72rem; padding:3px 9px; border-radius:999px; background:var(--bg-body); border:1px solid var(--border); color:var(--text-sub);">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
        </div>
      `;

      html += '<div style="font-weight:700; font-size:0.9rem; color:var(--text-main); margin-bottom:10px;">?뱦 ?꾩껜 ?깆옣 ?뚰듃???좏삎</div>';
      html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:15px;">';
      PARTNER_TYPES.forEach(t => {
        const isMine = t.type_code === partner.type_code;
        html += `<div style="padding:10px; border-radius:12px; text-align:center; ${isMine ? 'background:var(--primary-light); border:2px solid var(--primary);' : 'background:var(--bg-body); border:2px solid transparent; opacity:0.6;'}">
          <div style="font-size:1.4rem;">${t.emoji || '?쭬'}</div>
          <div style="font-weight:700; font-size:0.82rem; color:var(--text-main); margin-top:3px;">${escapeHtml(t.type_name)}${isMine ? ' (나)' : ''}</div>
        </div>`;
      });
      html += '</div>';

      // 吏덈Ц蹂??묐떟 ?쒖떆
      if (personality.question_responses) {
        html += '<div style="font-weight:700; font-size:0.9rem; color:var(--text-main); margin-bottom:10px;">?뱥 ?섏쓽 ?묐떟</div>';
        personalityQuestions.forEach(q => {
          const answer = personality.question_responses[q.id];
          if (answer) {
            const chosen = answer === 'A' ? q.optionA : q.optionB;
            const notChosen = answer === 'A' ? q.optionB : q.optionA;
            html += `
              <div style="padding:10px 12px; margin-bottom:8px; background:var(--bg-body); border-radius:10px; font-size:0.82rem;">
                <div style="color:var(--text-sub); margin-bottom:6px;">Q${q.id}. ${q.question}</div>
                <div style="color:var(--primary); font-weight:700;">??${answer}. ${chosen.text}</div>
                <div style="color:var(--text-sub); opacity:0.5; margin-top:3px; font-size:0.78rem;">${answer === 'A' ? 'B' : 'A'}. ${notChosen.text}</div>
              </div>
            `;
          }
        });
      }

      html += '<button type="button" onclick="resetPersonalityFromSettings()" style="background:var(--border); color:var(--text-main); font-size:0.85rem; padding:10px 20px; margin-top:12px; border-radius:50px; border:none; font-family:Jua,sans-serif; cursor:pointer;">?ㅼ떆 吏꾨떒?섍린</button>';

      area.innerHTML = html;
      return;
    }
    area.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding:20px 0;">??λ맂 吏꾨떒???꾩옱 踰꾩쟾怨??щ씪??<br>?ㅼ뒪濡?諛곗? ??뿉???ㅼ떆 吏꾨떒??二쇱꽭??</p>';
  } catch (err) {
    console.error('?깊뼢 ?뺣낫 濡쒕뱶 ?ㅻ쪟:', err);
    area.innerHTML = '<p style="color:var(--text-sub); text-align:center;">?깊뼢 ?뺣낫瑜?遺덈윭?????놁뒿?덈떎.</p>';
  }
}



// ?숆툒 蹂寃?諛??곗씠???꾩껜 珥덇린??
async function changeClassAndReset() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const newNameInput = document.getElementById('newClassNameInput');
  const newCodeInput = document.getElementById('newClassCodeInput');
  const newName = newNameInput.value.trim();
  const newCode = newCodeInput.value.trim().replace(/\s/g, '');

  if (!newName || !newCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  if (newCode === currentClassCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  // 1. ?숆툒 議댁옱 ?뺤씤 諛??숆툒紐??쇱튂 ?뺤씤
  const { data: cls, error: clsError } = await db.from('classes').select('class_name').eq('class_code', newCode).maybeSingle();
  if (clsError) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }
  if (!cls) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  if (cls.class_name !== newName) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  const msg = `[?숆툒 蹂寃? ${cls.class_name}]\n?뺣쭚 ?숆툒??蹂寃쏀븯?쒓쿋?듬땲源?\n?대룞 ??湲곗〈??紐⑤뱺 湲곕줉(?쇨린, ?됯?, 移?갔 ?????곴뎄 ??젣?⑸땲??`;

  showCustomConfirm(msg, async () => {
    try {
      const { data: session } = await db.auth.getSession();
      const user = session?.session?.user;
      if (!user) return;

      const sid = String(currentStudent.id);

      // 2. 湲곗〈 ?곗씠???쇨큵 ??젣
      await Promise.all([
        db.from('daily_reflections').delete().eq('class_code', currentClassCode).eq('student_id', sid),
        db.from('reviews').delete().eq('class_code', currentClassCode).or(`reviewer_id.eq.${sid},target_id.eq.${sid}`),
        db.from('student_personality').delete().eq('class_code', currentClassCode).eq('student_id', sid),
        db.from('praise_messages').delete().eq('class_code', currentClassCode).or(`sender_id.eq.${sid},receiver_id.eq.${sid}`),
        db.from('student_goals').delete().eq('class_code', currentClassCode).eq('student_id', sid),
        db.from('teacher_messages').delete().eq('class_code', currentClassCode).eq('student_id', sid),
        db.from('project_reflections').delete().eq('class_code', currentClassCode).eq('student_id', sid)
      ]);

      // 3. ?꾨줈???뺣낫 ?낅뜲?댄듃
      await db.from('user_profiles')
        .update({ class_code: newCode, class_name: cls.class_name })
        .eq('google_uid', user.id);

      showModal({
        type: 'alert', icon: '✅', title: '학급 변경 완료', message: '학급 정보가 성공적으로 변경되었습니다.\n변경 내용을 적용하기 위해 화면을 새로고침합니다.',
        onConfirm: () => { window.location.reload(); }
      });

    } catch (err) {
      console.error('?숆툒 蹂寃??ㅻ쪟:', err);
      showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    }
  });
}


async function saveStudentSettings() {
  if (isDemoMode) { showDemoBlockModal(); return; }

  const newName = document.getElementById('studentSettingClassName').value.trim();
  const newCode = document.getElementById('studentSettingClassCode').value.replace(/\s/g, '');

  if (!newName || !newCode) {
    showModal({
      type: 'alert',
      icon: '⚠️',
      title: '입력 확인',
      message: '학급명과 학급 코드를 모두 입력해주세요.'
    });
    return;
  }

  showCustomConfirm('학생 설정을 변경하시겠어요?', async () => {
    try {
      const { data: session } = await db.auth.getSession();
      if (!session?.session?.user) return;

      if (newCode !== currentClassCode) {
        const { data: cls, error: clsError } = await db.from('classes')
          .select('*')
          .eq('class_code', newCode)
          .maybeSingle();

        if (clsError) throw clsError;
        if (!cls) {
          showModal({
            type: 'alert',
            icon: '⚠️',
            title: '오류',
            message: '등록된 학급 코드를 찾을 수 없습니다.'
          });
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
        icon: '✅',
        title: '변경 완료',
        message: '학생 설정이 변경되었습니다. 화면을 새로고침해 반영할게요.',
        onConfirm: () => window.location.reload()
      });

    } catch (error) {
      console.error('학생 설정 변경 오류:', error);
      showModal({
        type: 'alert',
        icon: '⚠️',
        title: '오류',
        message: error?.message || '학생 설정 변경 중 오류가 발생했습니다.'
      });
    }
  });
}

// ?ㅼ젙?먯꽌 ?깊뼢 吏꾨떒 珥덇린??
async function resetPersonalityFromSettings() {
  if (isDemoMode) { showDemoBlockModal(); return; }

  showCustomConfirm('성향 진단 결과를 초기화하고 다시 진단할까요?', async () => {
    try {
      await db.from('student_personality')
        .delete()
        .eq('class_code', currentClassCode)
        .eq('student_id', currentStudent.id);

      studentPersonality = null;
      quizAnswers = {};

      switchStudentMainTab('self');

    } catch (err) {
      console.error('성향 초기화 오류:', err);
      showModal({
        type: 'alert',
        icon: '⚠️',
        title: '오류',
        message: '초기화 중 문제가 발생했습니다: ' + (err?.message || '')
      });
    }
  });
}


// ?숇즺?됯? ?몃? ??(?됯??섍린 vs 寃곌낵蹂닿린)
async function switchPeerTab(mode) {
  const btns = document.querySelectorAll('#peerEvaluationSection .sub-tab-btn');
  document.getElementById('studentSubmitTab').classList.add('hidden');
  document.getElementById('studentResultTab').classList.add('hidden');

  btns.forEach(b => b.classList.remove('active'));

  if (mode === 'submit') {
    btns[0].classList.add('active');
    document.getElementById('studentSubmitTab').classList.remove('hidden');
    // ?됯??섍린 ???꾪솚 ???곗씠??濡쒕뱶
    if (currentStudent && currentClassCode) {
      try {
        const date = document.getElementById('reviewDate').value;
        const [objTask, criteria, completed, settings] = await Promise.all([
          getObjectiveAndTask(date),
          getRatingCriteriaFromDB(date),
          getCompletedTargets(date, currentStudent.id, currentStudent.type),
          getClassSettings()
        ]);
        document.getElementById('objectiveText').textContent = objTask.objective || '?깅줉???숈뒿紐⑺몴媛 ?놁뒿?덈떎.';
        document.getElementById('taskText').textContent = objTask.task || '?깅줉???됯?怨쇱젣媛 ?놁뒿?덈떎.';
        ratingCriteria = criteria;
        renderRatingItems(criteria);
        const maxCount = currentStudent.type === 'group' ? settings.groupCount : settings.studentCount;
        renderTargetGrid(maxCount, currentStudent.id, completed, currentStudent.type);
      } catch (err) {
        console.warn('?숇즺?됯? ?곗씠??濡쒕뱶 ?ㅻ쪟:', err);
        // ?먮윭 ?쒖뿉??湲곕낯 洹몃━?쒕뒗 ?쒖떆
        try {
          const settings = await getClassSettings();
          const maxCount = currentStudent.type === 'group' ? settings.groupCount : settings.studentCount;
          renderTargetGrid(maxCount, currentStudent.id, [], currentStudent.type);
        } catch (e) {
          // classes ?뚯씠釉??먯껜媛 ?놁쓣 寃쎌슦 湲곕낯媛믪쑝濡?洹몃━???쒖떆
          renderTargetGrid(isDemoMode ? 24 : 30, currentStudent.id, [], currentStudent.type);
        }
      }
    }
  } else {
    btns[1].classList.add('active');
    document.getElementById('studentResultTab').classList.remove('hidden');
  }
}

// ?먭린?됯? ?몃? ??(諛곗? ?명듃 vs ??쒕낫??vs ?꾨줈?앺듃)
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
  // 紐⑤뱺 而⑦뀗痢????④린湲?
  ['ranking', 'student', 'criteria', 'diary', 'praise', 'settings'].forEach(t => document.getElementById(t + 'MiniTab').classList.add('hidden'));
  // ?섏쐞 ???곸뿭 ?④린湲?
  document.getElementById('reviewSubTabArea').classList.add('hidden');

  // 援먯궗 硫붿씤 ??踰꾪듉留??좏깮 (?ㅼ젙 ?대???AI/?섎룞 ?꾪솚 踰꾪듉 ?쒖쇅)
  const mainTabBtns = document.querySelectorAll('#teacherMain .bottom-nav .nav-item');
  mainTabBtns.forEach(b => {
    b.classList.remove('active-nav');
    b.classList.remove('active-setting'); // legacy cleanup if any
  });

  if (mode === 'review') {
    // ?꾩껜 ?꾪솴 - ?섏쐞 ???쒖떆 ??湲곕낯?쇰줈 ?꾩껜 ?꾪솴
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
  if (s === '초등' || s === '중등' || s === '고등') return s;
  if (s.includes('초')) return '초등';
  if (s.includes('중')) return '중등';
  if (s.includes('고')) return '고등';
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
        icon: '?좑툘',
        title: '?ㅼ젙 ????ㅽ뙣',
        message: '?숆탳湲??숆린 湲곌컙????ν븷 ???놁뒿?덈떎. Supabase???ㅽ궎留??낅뜲?댄듃(而щ읆 異붽?)媛 ?꾩슂?⑸땲??<br><br><small>classes.school_level / semester1_start / semester1_end / semester2_start / semester2_end</small>'
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
  allBtn.textContent = '?꾩껜';
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
    if (!teacherDiarySelectedStudentId) pill.textContent = '학생 선택';
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
  const range = (lvl === '초등') ? [2, 4] : (lvl === '중등') ? [3, 5] : [4, 6];

  const reasons = [];
  if (lines.length < range[0] || lines.length > range[1]) reasons.push('sentence_count');

  const firstPersonRe = /(나는|제가|저는|내가|우리)/;
  const endingRe = /(함\.?$|됨\.?$|음\.?$|다\.?$)/;
  const competencyKeywords = ['분석', '탐구', '협력', '소통', '문제 해결', '창의', '성찰', '태도'];
  const foundCompetencies = new Set();

  for (const l of lines) {
    const line = l.replace(/[.!?]+$/g, '').trim();
    if (!endingRe.test(line)) reasons.push('ending');
    if (firstPersonRe.test(line)) reasons.push('first_person');
    competencyKeywords.forEach(k => { if (line.includes(k)) foundCompetencies.add(k); });
  }

  if (foundCompetencies.size < 1) reasons.push('competency');

  return { ok: reasons.length === 0, reasons: Array.from(new Set(reasons)) };
}

function buildSubjectCommentPromptBase({ schoolLevel, subject, noteCount, start, end }) {
  const lvl = normalizeSchoolLevel(schoolLevel);
  const sentences = (lvl === '초등') ? '2~4문장' : (lvl === '중등') ? '3~5문장' : '4~6문장';

  return [
    '[ROLE]',
    '너는 교과세특 평어를 작성하는 보조 AI다.',
    '',
    '[상황]',
    `학교급: ${lvl}`,
    `과목: ${subject}`,
    `기간: ${start} ~ ${end}`,
    `참고한 배움 노트 수: ${noteCount}건`,
    '',
    '[작성 원칙]',
    '1) 학생을 주어로 하는 관찰자 시점으로 작성한다.',
    '2) 구체적 활동과 변화가 드러나게 작성한다.',
    '3) 과도한 칭찬/비판 없이 근거 기반으로 표현한다.',
    '4) 1인칭(나는/제가) 표현은 사용하지 않는다.',
    `5) 전체 분량은 ${sentences}로 제한한다.`,
    '6) 문장 끝은 학교 기록 문체(함/됨/음/다)로 정리한다.'
  ].join('\n');
}

function buildSubjectCommentPromptStyle(schoolLevel) {
  const lvl = normalizeSchoolLevel(schoolLevel);

  if (lvl === '초등') {
    return [
      '[STYLE - 초등]',
      '- 쉬운 어휘로 구체적 활동 중심 작성',
      '- 성장 과정과 태도 변화를 짧고 분명하게 작성',
      '- 2~4문장 유지'
    ].join('\n');
  }

  if (lvl === '중등') {
    return [
      '[STYLE - 중등]',
      '- 핵심 역량(탐구/협력/소통 등)과 활동 근거를 연결',
      '- 수업 중 수행 내용과 개선 흐름을 명확히 제시',
      '- 3~5문장 유지'
    ].join('\n');
  }

  return [
    '[STYLE - 고등]',
    '- 사고 과정, 문제 해결, 자기주도성을 중심으로 작성',
    '- 과목 개념 이해와 확장 적용 사례를 포함',
    '- 4~6문장 유지'
  ].join('\n');
}
function truncateText(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + '...';
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
    '\n[諛곗??명듃 洹쇨굅]\n' +
    evidence.join('\n') +
    '\n\n[異쒕젰]\n';

  const result = await callGemini(prompt, { generationConfig: { temperature: 0.4, maxOutputTokens: 700 } });
  if (!result.ok) return { ok: false, type: 'api', noteCount, error: result.error || 'AI ?앹꽦 ?ㅽ뙣' };

  let out = String(result.text || '').trim();
  out = out.replace(/^\s*[-*??\s*/gm, '').replace(/^\s*\d+[.)]\s*/gm, '').trim();

  let validation = validateSubjectCommentOutput(out, schoolLevel);
  let tries = 0;

  while (!validation.ok && tries < 2) {
    tries++;
    const reasons = validation.reasons.join(', ');
    const fixPrompt =
      '?ㅼ쓬 臾몄옣??洹쒖튃??留욊쾶 ?ㅼ떆 ?묒꽦??\n\n' +
      '[洹쒖튃 ?붿빟]\n' +
      '- 1?몄묶 湲덉?, 二쇱뼱 理쒖냼?뷀븿.\n' +
      '- 紐⑤뱺 臾몄옣 ????~??~??~?ⓥ?醫낃껐??\n' +
      '- ?숆탳湲?臾몄옣 ??踰붿쐞 以?섑븿.\n' +
      '- ??웾/?쒕룄 2媛??댁긽 ?ы븿??\n' +
      '- 諛곗??명듃 洹쇨굅 1媛??댁긽 ?ы븿??\n' +
      '- 踰덊샇/遺덈┸ ?놁씠 臾몄옣留?以꾨컮轅?異쒕젰??\n\n' +
      '[?숆탳湲?\n' + normalizeSchoolLevel(schoolLevel) + '\n\n' +
      '[?꾨컲 ??ぉ]\n' + reasons + '\n\n' +
      '[?먮Ц]\n' + out + '\n\n' +
      '[?섏젙蹂?異쒕젰]\n';

    const retry = await callGemini(fixPrompt, { generationConfig: { temperature: 0.2, maxOutputTokens: 700 } });
    if (!retry.ok) break;
    out = String(retry.text || '').trim().replace(/^\s*[-*??\s*/gm, '').replace(/^\s*\d+[.)]\s*/gm, '').trim();
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
  if (!studentId) { showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint }); return; }
  if (!schoolLevel) { showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint }); return; }
  if (!start || !end) { showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint }); return; }
  if (start > end) { showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint }); return; }
  if (!subject) { showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint }); return; }

  setTeacherSubjectCommentStatus('');
  setTeacherSubjectCommentResult(null, { resetEmpty: false });
  const noteCountEl = document.getElementById('teacherSubjectCommentNoteCount');
  if (noteCountEl) noteCountEl.textContent = '-';

  setLoading(true, btn, '?앹꽦 以?..');

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
        setTeacherSubjectCommentError('?좏깮??湲곌컙???대떦 怨쇰ぉ 諛곗??명듃媛 ?놁뼱 ?앹꽦?????놁쓬. 湲곌컙??議곗젙??二쇱꽭??', { showRetry: false });
        refreshTeacherSubjectCommentActions();
        return;
      }

      const single = await generateTeacherSubjectCommentTextFromNotes({ filteredNotes: filtered, schoolLevel, subject, start, end });
      if (!single.ok) {
        setLoading(false, btn, forceRegenerate ? '재생성' : '생성하기');
        if (single.type === 'validation' && single.text) {
          setTeacherSubjectCommentResult(single.text, { resetEmpty: false });
          setTeacherSubjectCommentError('異쒕젰 洹쒖튃???꾩쟾??留뚯”?섏? 紐삵뻽?듬땲?? [?ъ떆??瑜??뚮윭 ?ㅼ떆 ?앹꽦??二쇱꽭??', { showRetry: true });
        } else {
          setTeacherSubjectCommentResult(null, { resetEmpty: true });
          setTeacherSubjectCommentError('?앹꽦 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: ' + (single.error || single.type || 'unknown'), { showRetry: true });
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
      setTeacherSubjectCommentStatus('생성 완료');

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
      setTeacherSubjectCommentStatus('?앹꽦 以?(' + (i + 1) + '/' + targetStudentIds.length + ')');

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
      setTeacherSubjectCommentError('?꾩껜 ?좏깮 ?곹깭?먯꽌 ?앹꽦 媛?ν븳 ?숈깮???놁뒿?덈떎. 湲곌컙/怨쇰ぉ??議곗젙??二쇱꽭??', { showRetry: false });
      refreshTeacherSubjectCommentActions();
      return;
    }

    const mergedText = generatedItems
      .map(item => '[' + item.studentId + '踰?| 諛곗??명듃 ' + item.noteCount + '嫄?\n' + item.text)
      .join('\n\n');

    teacherSubjectCommentLastGenerated = {
      mode: 'all',
      text: mergedText,
      noteCount: totalNoteCount,
      key: '',
      items: generatedItems
    };

    setTeacherSubjectCommentResult(mergedText, { resetEmpty: false });
    setTeacherSubjectCommentStatus('誘몄???(' + generatedItems.length + '紐?');

    if (failedStudents.length > 0) {
      setTeacherSubjectCommentError(
        '?꾩껜 ' + targetStudentIds.length + '紐?以?' + generatedItems.length + '紐??앹꽦?? ?쇰? ?숈깮? 湲곌컙/怨쇰ぉ ?명듃 遺議깆쑝濡??쒖쇅??',
        { showRetry: true }
      );
    }

    setLoading(false, btn, forceRegenerate ? '재생성' : '생성하기');
    refreshTeacherSubjectCommentActions();
  } catch (err) {
    console.error('subject comment generate error:', err);
    setLoading(false, btn, forceRegenerate ? '재생성' : '생성하기');
    setTeacherSubjectCommentError('?앹꽦 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: ' + (err.message || String(err)), { showRetry: true });
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
    setTeacherSubjectCommentStatus('??λ맖');

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
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  setLoading(true, btn, '???以?..');

  try {
    const { data: session } = await db.auth.getSession();
    const uid = session?.session?.user?.id || null;

    const items = Array.isArray(teacherSubjectCommentLastGenerated.items) ? teacherSubjectCommentLastGenerated.items : [];
    const payloadRows = [];

    if (isAllStudents) {
      if (items.length === 0) {
        setLoading(false, btn, '저장');
        showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
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
      showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
      return;
    }

    const { error } = await db.from('subject_comments').upsert(payloadRows, { onConflict: 'class_code,student_id,semester,subject' });
    if (error) throw error;

    const savedCount = payloadRows.length;
    setTeacherSubjectCommentStatus(savedCount > 1 ? ('저장 완료 (' + savedCount + '건)') : '저장 완료');
    setLoading(false, btn, '저장');
    showModal({
      type: 'alert',
      icon: '✅',
      title: '저장 완료',
      message: savedCount > 1
        ? ('생성 결과를 ' + savedCount + '건 저장했습니다.')
        : '생성 결과를 저장했습니다.'
    });
  } catch (err) {
    console.error('save subject comment error:', err);
    setLoading(false, btn, '저장');
    showModal({
      type: 'alert',
      icon: '?좑툘',
      title: '????ㅽ뙣',
      message: '???以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. Supabase???뚯씠釉??뺤콉 ?ㅼ젙???꾩슂?????덉뒿?덈떎.<br><br><small>subject_comments</small>'
    });
  }
}

async function copyTeacherSubjectComment() {
  const pre = document.getElementById('teacherSubjectCommentResult');
  const text = pre && !pre.classList.contains('hidden') ? pre.textContent : '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
  } catch (err) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
  }
}

function openTeacherSubjectCommentExportModal() {
  const modal = document.getElementById('teacherSubjectCommentExportModal');
  if (!modal) return;

  const subjSel = document.getElementById('teacherSubjectCommentExportSubject');
  if (subjSel) {
    const options = PRESET_SUBJECT_TAGS.filter(t => t !== OTHER_SUBJECT_TAG);
    subjSel.innerHTML = '<option value="all" selected>?꾩껜</option>' + options.map(s => '<option value="' + String(s).replace(/"/g, '&quot;') + '">' + s + '</option>').join('');
  }

  const tgtSel = document.getElementById('teacherSubjectCommentExportTarget');
  const area = document.getElementById('teacherSubjectCommentExportSelectedArea');
  const grid = document.getElementById('teacherSubjectCommentExportStudentGrid');
  if (tgtSel && area && grid) {
    const sync = async () => {
      const v = tgtSel.value;
      area.classList.toggle('hidden', v !== 'selected');
      if (v !== 'selected') return;

      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-sub); padding:6px 0;">遺덈윭?ㅻ뒗 以?..</div>';
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
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-sub); padding:6px 0;">?숈깮 紐⑸줉??遺덈윭?????놁뒿?덈떎.</div>';
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
    setExportMsg('엑셀 라이브러리를 찾을 수 없습니다.', 'error');
    return;
  }
  if (!currentClassCode) {
    setExportMsg('학급 코드가 없어 내보낼 수 없습니다.', 'error');
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
    if (!teacherDiarySelectedStudentId) {
      setExportMsg('현재 선택된 학생이 없습니다.', 'error');
      return;
    }
    if (String(teacherDiarySelectedStudentId) === TEACHER_SUBJECT_COMMENT_ALL_STUDENTS) {
      for (let i = 1; i <= studentCount; i++) studentIds.push(String(i));
    } else {
      studentIds = [String(teacherDiarySelectedStudentId)];
    }
  } else if (tgtV === 'selected') {
    const grid = document.getElementById('teacherSubjectCommentExportStudentGrid');
    const selected = Array.from(grid?.querySelectorAll('.subject-tag-btn.selected') || [])
      .map(b => b.dataset.sid)
      .filter(Boolean);
    if (selected.length === 0) {
      setExportMsg('선택 학생을 1명 이상 지정해주세요.', 'error');
      return;
    }
    studentIds = selected.map(String);
  } else {
    for (let i = 1; i <= studentCount; i++) studentIds.push(String(i));
  }

  let q = db.from('subject_comments')
    .select('student_id, semester, subject, generated_text, note_count, period_start, period_end, school_level')
    .eq('class_code', currentClassCode)
    .in('semester', semesters)
    .in('subject', subjects)
    .in('student_id', studentIds);

  const { data, error } = await q;
  if (error) {
    console.error('subject_comments export error:', error);
    setExportMsg('데이터 조회 중 오류가 발생했습니다.', 'error');
    return;
  }

  const savedRows = data || [];
  if (savedRows.length === 0) {
    setExportMsg('내보낼 데이터가 없습니다.', 'error');
    return;
  }

  const rows = savedRows.map(r => {
    const sid = String(r.student_id || '').trim();
    return {
      '학생번호': sid,
      '학생표시': sid ? `${sid}번` : '',
      '학년': meta.grade,
      '반': meta.class,
      '학교급': normalizeSchoolLevel(r.school_level || '') || schoolLevel,
      '학기': Number(r.semester || 0),
      '과목': String(r.subject || ''),
      '기간 시작': String(r.period_start || ''),
      '기간 종료': String(r.period_end || ''),
      '배움노트 수': Number(r.note_count || 0),
      '생성 평어': String(r.generated_text || '')
    };
  });

  rows.sort((a, b) => {
    const sidA = Number(a['학생번호']) || 0;
    const sidB = Number(b['학생번호']) || 0;
    if (sidA !== sidB) return sidA - sidB;
    const semA = Number(a['학기']) || 0;
    const semB = Number(b['학기']) || 0;
    if (semA !== semB) return semA - semB;
    return String(a['과목']).localeCompare(String(b['과목']), 'ko');
  });

  const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '교과세특');

  const fileDate = getKstTodayStr ? getKstTodayStr() : new Date().toISOString().slice(0, 10);
  const fname = `교과세특_${String(currentClassCode || 'class')}_${fileDate}.xlsx`;
  XLSX.writeFile(wb, fname);

  closeTeacherSubjectCommentExportModal();
  setExportMsg('엑셀 파일을 다운로드했습니다.', 'success');
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
// ?숈깮 濡쒓렇??
// ============================================
// function loginStudent(), showStudentMain(), logoutStudent() removed - Replaced by checkAuthAndRoute()

// ============================================
// ?숈뒿紐⑺몴/?됯?湲곗? 濡쒕뱶
// ============================================
async function fetchCriteria(dateStr) {
  const data = await getObjectiveAndTask(dateStr);
  document.getElementById('objectiveText').textContent = data.objective || '?깅줉???숈뒿紐⑺몴媛 ?놁뒿?덈떎.';
  document.getElementById('taskText').textContent = data.task || '?깅줉???됯?怨쇱젣媛 ?놁뒿?덈떎.';
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
// ?됯? ???洹몃━??
// ============================================
function getDemoReviewTemplate(targetId) {
  const tid = String(targetId);
  return [
    '?몟 ?섑븳 ?? ' + tid + '踰덉? 諛쒗몴?????듭떖 媛쒕뀗??癒쇱? 留먰븯怨??덉떆瑜?遺숈뿬 ?ㅻ챸?댁꽌 ?ｋ뒗 ?щ엺???댄빐?섍린 ?ъ썱??',
    '?뮕 ?대젃寃??섎㈃ ??醫뗭븘吏?寃?媛숈븘: 洹쇨굅瑜?留먰븳 ??"??洹몃젃寃??앷컖?덈뒗吏"瑜???臾몄옣留????㏓텤?대㈃ ?ㅻ뱷?μ씠 ??而ㅼ쭏 寃?媛숈븘.',
    '???뱁엳 ?몄긽?곸씠?덈뜕 遺遺꾩? 吏덈Ц??諛쏆븯????諛붾줈 ?듯븯?ㅺ퀬 ?섍린蹂대떎 李⑤텇???뺣━?댁꽌 留먰븳 ?쒕룄???',
    '?뮞 ?ㅼ쓬?먮뒗 ?대윴 ?먯쓣 ?쒕룄?대낫硫?醫뗪쿋?? 諛쒗몴 ?앸?遺꾩뿉 ?ㅻ뒛 諛곗슫 ?듭떖 1以??붿빟???ｌ뼱??留덈Т由ы빐蹂댁옄.'
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
  document.getElementById('progressText').textContent = '?됯? 吏꾪뻾: ' + doneCount + ' / ' + total + '紐??꾨즺 (' + pct + '%)';
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('targetId').value = '';
  clearRatingSelectionUI();
  targetSelectionRequestSeq++;
  for (let i = 1; i <= maxCount; i++) {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.textContent = type === 'group' ? i + '모둠' : i + '번'; btn.className = 'target-btn';
    if (String(i) === String(myId)) { btn.classList.add('disabled'); btn.title = '?먭린 ?먯떊? ?됯??????놁뒿?덈떎'; }
    else if (completedList.includes(String(i))) { btn.classList.add('done'); btn.title = '?대? ?됯? ?꾨즺 (?대┃?섎㈃ ?섏젙)'; btn.onclick = () => selectTarget(i, btn); }
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
// ?됯? ?쒖텧
// ============================================
document.getElementById('reviewForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isDemoMode) { showDemoBlockModal(); return; }
  const btn = document.getElementById('submitBtn'); const msg = document.getElementById('submitMsg');
  const data = { class_code: currentClassCode, review_date: document.getElementById('reviewDate').value, reviewer_id: String(currentStudent.id), target_id: document.getElementById('targetId').value, review_content: document.getElementById('reviewContent').value, scores_json: { criteria: ratingCriteria, scores: currentRatings }, review_type: currentStudent.type, reviewer_email: '' };
  if (!data.target_id) { showMsg(msg, '?됯? ??곸쓣 ?좏깮?댁＜?몄슂.', 'error'); return; }
  if (data.reviewer_id === data.target_id) { showMsg(msg, '?먭린 ?먯떊/紐⑤몺? ?됯??????놁뒿?덈떎.', 'error'); return; }
  if (data.review_content.trim().length < 100) { showMsg(msg, '?쇰뱶諛깆? 理쒖냼 100???댁긽 ?낅젰?댁＜?몄슂.', 'error'); return; }
  if (ratingCriteria.length > 0 && Object.keys(currentRatings).length !== ratingCriteria.length) { showMsg(msg, '紐⑤뱺 ?됯? 湲곗????먯닔瑜??좏깮?댁＜?몄슂.', 'error'); return; }
  setLoading(true, btn, '?뺤씤 以?..');
  const { data: existing } = await db.from('reviews').select('review_content').eq('class_code', currentClassCode).eq('review_date', data.review_date).eq('reviewer_id', data.reviewer_id).eq('target_id', data.target_id).eq('review_type', data.review_type).maybeSingle();
  if (existing) {
    setLoading(false, btn, '?됯? ?쒖텧?섍린');
    showModal({
      type: 'confirm', icon: '?좑툘', title: '?대? ?됯?????곸엯?덈떎',
      message: data.target_id + '踰덉뿉寃??대? ?됯?瑜??쒖텧?덉뒿?덈떎.<br><br><div style="background:var(--bg-soft);padding:10px;border-radius:8px;font-size:0.85rem;text-align:left;max-height:80px;overflow-y:auto;margin-bottom:10px;">"' + existing.review_content.substring(0, 60) + (existing.review_content.length > 60 ? '...' : '') + '"</div><strong>???댁슜?쇰줈 ??뼱?곗떆寃좎뒿?덇퉴?</strong>',
      onConfirm: () => doSubmitReview(data, btn, msg)
    });
  } else { await doSubmitReview(data, btn, msg); }
});
async function doSubmitReview(data, btn, msg) {
  setLoading(true, btn, '?쒖텧 以?..');
  const { error } = await db.from('reviews').upsert(data, { onConflict: 'class_code,review_date,reviewer_id,target_id,review_type' });
  setLoading(false, btn, '?됯? ?쒖텧?섍린');
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, '?깃났?곸쑝濡??쒖텧?섏뿀?듬땲??', 'success');
  const savedDate = document.getElementById('reviewDate').value;
  document.getElementById('reviewForm').reset();
  clearRatingSelectionUI();
  document.getElementById('reviewerId').value = currentStudent.id;
  document.getElementById('reviewDate').value = savedDate;
  document.getElementById('targetId').value = ''; updateCharCount();
  await loadEvalTargetGrid();
  // ?먮룞?쇰줈 ?ㅼ쓬 誘몄셿猷?????좏깮
  const nextBtn = document.querySelector('.target-btn:not(.done):not(.disabled):not(.selected)');
  if (nextBtn) { nextBtn.click(); nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else { document.getElementById('targetGrid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

// ============================================
// ?숈깮 寃곌낵 議고쉶
// ============================================
async function viewMyResult() {
  const date = document.getElementById('viewDate').value;
  const btn = document.getElementById('viewResultBtn'); const msg = document.getElementById('viewMsg');
  setLoading(true, btn, '硫붿떆吏 以鍮?以?..'); document.getElementById('resultArea').classList.add('hidden');
  const { data: reviews, error: reviewsError } = await db.from('reviews').select('*').eq('class_code', currentClassCode).eq('review_date', date).eq('target_id', String(currentStudent.id)).eq('review_type', currentStudent.type);
  if (reviewsError) { setLoading(false, btn, '?뮠 ?깆옣 ?뚰듃?덉쓽 硫붿떆吏 諛쏄린'); showMsg(msg, '寃곌낵 議고쉶 以??ㅻ쪟: ' + reviewsError.message, 'error'); return; }
  if (!reviews || reviews.length === 0) { setLoading(false, btn, '?뮠 ?깆옣 ?뚰듃?덉쓽 硫붿떆吏 諛쏄린'); showMsg(msg, '?대떦 ?좎쭨(' + date + ')??諛쏆? ?됯?媛 ?놁뒿?덈떎.', 'error'); return; }
  const { data: allReviews, error: allReviewsError } = await db.from('reviews').select('target_id, scores_json').eq('class_code', currentClassCode).eq('review_date', date).eq('review_type', currentStudent.type);
  if (allReviewsError) { setLoading(false, btn, '?뮠 ?깆옣 ?뚰듃?덉쓽 硫붿떆吏 諛쏄린'); showMsg(msg, '?듦퀎 議고쉶 以??ㅻ쪟: ' + allReviewsError.message, 'error'); return; }
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
  setLoading(false, btn, '?뮠 ?깆옣 ?뚰듃?덉쓽 硫붿떆吏 諛쏄린');
  document.getElementById('resultArea').classList.remove('hidden');
  let totalAvg = 0; if (myAvgScores.length > 0) totalAvg = (myAvgScores.reduce((a, i) => a + i.average, 0) / myAvgScores.length).toFixed(2);
  let classAvg = 0; if (classAvgScores.length > 0) classAvg = (classAvgScores.reduce((a, i) => a + i.average, 0) / classAvgScores.length).toFixed(2);
  const statsEl = document.getElementById('statsSummary');
  if (statsEl) {
    const statsHtml = '<div class="stat-card"><span class="stat-number">' + reviews.length + '紐?/span><span class="stat-label">?됯? 李몄뿬 ?몄썝</span></div>' +
      '<div class="stat-card"><span class="stat-number">' + totalAvg + '</span><span class="stat-label">?섏쓽 ?됯퇏 ?먯닔</span></div>' +
      '<div class="stat-card blue"><span class="stat-number">' + classAvg + '</span><span class="stat-label">?곕━ 諛??됯퇏 ?먯닔</span></div>';
    statsEl.innerHTML = statsHtml;
  }

  const chartContainer = document.getElementById('chartContainer'); const barChart = document.getElementById('barChart');
  if (myAvgScores.length > 0) {
    chartContainer.classList.remove('hidden');
    const classAvgMap = {}; classAvgScores.forEach(item => { classAvgMap[item.criterion] = item.average; });
    let chartHtml = '';
    myAvgScores.forEach((item, i) => {
      const myPct = (item.average / 5) * 100; const cAvg = classAvgMap[item.criterion] || 0; const classPct = (cAvg / 5) * 100;
      chartHtml += '<div class="bar-item"><div class="bar-label">' + item.criterion + '</div><div style="flex:1;"><div class="bar-track" style="margin-bottom:4px;"><div class="bar-fill color-' + (i % 6) + '" style="width:0%;" data-width="' + myPct + '%"></div></div><div class="bar-track" style="height:16px;opacity:0.8;"><div class="bar-fill" style="width:0%;background:var(--text-sub);opacity:0.6;" data-width="' + classPct + '%"></div></div></div><div class="bar-value">' + item.average.toFixed(1) + '<div style="font-size:0.7rem;color:var(--text-sub);">諛??됯퇏 ' + cAvg.toFixed(1) + '</div></div></div>';
    });
    chartHtml += '<div style="display:flex;gap:20px;justify-content:center;margin-top:15px;font-size:0.8rem;color:var(--text-sub);"><span style="color:var(--text-main);font-weight:600;">?????먯닔</span><span style="color:var(--text-sub);font-weight:600;">??諛??됯퇏</span></div>';
    barChart.innerHTML = chartHtml;
    setTimeout(() => { document.querySelectorAll('.bar-fill').forEach(bar => { bar.style.width = bar.dataset.width; }); }, 100);
  } else {
    chartContainer.classList.remove('hidden');
    barChart.innerHTML = '<div class="empty-state"><span class="empty-icon">?벊</span><div class="empty-title">?꾩쭅 諛쏆? ?됯?媛 ?놁뼱??/div><div class="empty-desc">移쒓뎄?ㅼ쓽 ?됯?媛 ?깅줉?섎㈃<br>?ш린???먯닔媛 ?쒖떆?⑸땲??</div></div>';
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
      error: 'AI 湲곕뒫? 諛고룷 ?ъ씠???먮뒗 濡쒖뺄 ?쒕쾭(vercel dev)?먯꽌留??ъ슜?????덉뼱??'
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
      if (code === 'quota_exceeded') return { ok: false, code, error: 'AI ?ъ슜??珥덇낵: ?좎떆 ???ㅼ떆 ?쒕룄??二쇱꽭??' };
      if (code === 'network_error') return { ok: false, code, error: '?ㅽ듃?뚰겕 ?ㅻ쪟: ?곌껐 ?곹깭瑜??뺤씤??二쇱꽭??' };
      return { ok: false, code, error: apiError || ('HTTP ' + res.status) };
    }

    const text = apiText;
    return text ? { ok: true, text } : { ok: false, code: 'empty_response', error: 'AI ?묐떟??鍮꾩뼱 ?덉뒿?덈떎.' };
  } catch (e) {
    return { ok: false, code: 'network_error', error: '?ㅽ듃?뚰겕 ?ㅻ쪟: ?곌껐 ?곹깭瑜??뺤씤??二쇱꽭??' };
  }
}

function getExecutionStrategyHeader(partner) {
  const executionStrategy = partner?.axes_raw?.execution_strategy || partner?.axes?.execution_strategy || null;
  if (executionStrategy === 'plan' || executionStrategy === '계획') return '다음 성장 계획(실천)';
  if (executionStrategy === 'explore' || executionStrategy === '탐색') return '다음 성장 실험(도전)';
  return '다음 성장 실천(계획/실험)';
}

async function generateSummary(reviews, opts = {}) {
  if (!reviews || reviews.length === 0) return '아직 분석할 피드백이 없습니다.';

  const passedPartner = (opts.partner && typeof opts.partner === 'object') ? opts.partner : null;
  const partner = passedPartner || studentPartner || await ensureStudentPartnerLoaded({ backfill: true });

  const reviewTexts = Array.isArray(opts?.evaluation_context?.review_texts)
    ? opts.evaluation_context.review_texts
    : (Array.isArray(reviews) ? reviews : []).map(r => String(r || '').trim()).filter(Boolean);

  const evaluation_context = (opts.evaluation_context && typeof opts.evaluation_context === 'object')
    ? { ...opts.evaluation_context, review_texts: reviewTexts, review_count: reviewTexts.length }
    : {
      eval_type: (currentStudent && currentStudent.type) ? currentStudent.type : 'individual',
      review_count: reviewTexts.length,
      review_texts: reviewTexts
    };

  const coachingStyle = partner?.axes_raw?.coaching_style || partner?.axes?.coaching_style || '';
  const infoProcessing = partner?.axes_raw?.info_processing || partner?.axes?.info_processing || '';

  const header1 = (coachingStyle === '해결형' || coachingStyle === 'solution') ? '핵심 진단' : '핵심 요약';
  const header2 = (infoProcessing === '디테일형' || infoProcessing === 'detail') ? '근거와 구체 포인트' : '패턴과 변화 흐름';
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
    '[작성 규칙]',
    '1) 아래 3개 헤더를 반드시 그대로 사용해 작성한다.',
    `2) 첫 번째 헤더는 ${header1}, 두 번째는 ${header2}, 세 번째는 ${header3}다.`,
    '3) student_partner의 3개 축(coaching_style/info_processing/execution_strategy)을 모두 조합해 적용한다.',
    '4) #함께 성장형이면 협력 활동을, #혼자 집중형이면 개인 활동을 실천 제안에 반영한다.',
    '5) 부정 표현은 낙인 없이 성장 포인트로 전환한다.',
    '6) 12~18문장 내외, 한국어로만 작성한다.',
    '',
    `## ${header1}`,
    '-',
    '',
    `## ${header2}`,
    '-',
    '',
    `## ${header3}`,
    '-'
  ].join('\n');

  const result = await callGemini(prompt, {
    generationConfig: { temperature: 0.45, maxOutputTokens: 1200 }
  });

  if (!result.ok || !result.text) {
    return [
      `## ${header1}`,
      '친구들의 피드백에서 강점과 개선 포인트가 함께 보입니다.',
      '',
      `## ${header2}`,
      '반복적으로 드러난 패턴을 기준으로 다음 학습 포인트를 정리해보면 좋겠습니다.',
      '',
      `## ${header3}`,
      '이번 주에 바로 실행할 수 있는 작은 실천 1가지를 정해 적용해보세요.'
    ].join('\n');
  }

  return sanitizeAiSummaryText(String(result.text).trim());
}

// ============================================
// 援먯궗 濡쒓렇??
// ============================================
// function loginTeacher(), teacherLogout() removed - Replaced by checkAuthAndRoute()

// ============================================
// 援먯궗 - ?꾩껜 ?꾪솴
// ============================================
async function loadTeacherData() {
  try {
    const dateEl = document.getElementById('teacherDate');
    if (!dateEl) return;
    const date = dateEl.value;

    const typeChecked = document.querySelector('input[name="teacherEvalType"]:checked');
    const type = typeChecked ? typeChecked.value : 'individual';
    document.getElementById('rankingTable').innerHTML = '<p style="text-align:center;">?곗씠??遺덈윭?ㅻ뒗 以?..</p>';
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
    console.warn('loadTeacherData ?ㅻ쪟:', err);
    document.getElementById('rankingTable').innerHTML = '<p style="text-align:center;color:var(--text-sub);">?곗씠?곕? 遺덈윭?ㅻ뒗 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. ?덈줈怨좎묠??二쇱꽭??</p>';
  }
}
async function renderTeacherDashboard(data, totalStudents) {
  const d = document.getElementById('teacherDashboard');
  try {
    const evaluated = data.students.length;
    let totalAvg = 0; if (data.ranking.length > 0) totalAvg = (data.ranking.reduce((a, r) => a + r.totalAvg, 0) / data.ranking.length).toFixed(2);
    const totalReviews = data.ranking.reduce((a, r) => a + r.count, 0);
    const participation = totalStudents > 0 ? Math.round((evaluated / totalStudents) * 100) : 0;
    // ?ㅻ뒛 諛곗? ?명듃 ?묒꽦瑜?議고쉶
    let diaryCount = 0;
    try {
      const today = getDefaultQueryDate();
      const [diaryRes] = await Promise.allSettled([
        db.from('daily_reflections').select('student_id', { count: 'exact', head: true }).eq('class_code', currentClassCode).eq('reflection_date', today)
      ]);
      diaryCount = diaryRes.status === 'fulfilled' && diaryRes.value.count ? diaryRes.value.count : 0;
    } catch (subErr) { console.warn('??쒕낫??遺媛 ?곗씠??議고쉶 ?ㅻ쪟:', subErr); }
    const diaryPct = totalStudents > 0 ? Math.round((diaryCount / totalStudents) * 100) : 0;
  d.innerHTML = '<div class="stat-card"><span class="stat-number">' + participation + '%</span><span class="stat-label">?됯? 李몄뿬??(' + evaluated + '/' + totalStudents + ')</span></div><div class="stat-card blue"><span class="stat-number">' + totalAvg + '</span><span class="stat-label">?꾩껜 ?됯퇏 ?먯닔</span></div><div class="stat-card" style="border-left-color:var(--color-teal);"><span class="stat-number" style="color:var(--color-teal);">' + totalReviews + '嫄?/span><span class="stat-label">珥??됯? ??/span></div><div class="stat-card" style="border-left-color:var(--color-teacher);"><span class="stat-number" style="color:var(--color-teacher);">' + diaryPct + '%</span><span class="stat-label">?ㅻ뒛 ?쇨린 ?묒꽦瑜?(' + diaryCount + '/' + totalStudents + ')</span></div>';
  } catch (err) {
    console.warn('renderTeacherDashboard ?ㅻ쪟:', err);
    d.innerHTML = '<div class="stat-card"><span class="stat-number">-</span><span class="stat-label">?곗씠??濡쒕뱶 ?ㅽ뙣</span></div>';
  }
}
function renderRankingTable(ranking, criteria, type) {
  const container = document.getElementById('rankingTable');
  if (!ranking || ranking.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-sub);">?대떦 ?좎쭨???됯? ?곗씠?곌? ?놁뒿?덈떎.</p>'; return; }
  const idHeader = type === 'group' ? '紐⑤몺' : '踰덊샇';
  let html = '<table class="ranking-table"><thead><tr><th>?깆닔</th><th>' + idHeader + '</th><th>珥앹젏 ?됯퇏</th>';
  if (criteria) criteria.forEach(c => html += '<th>' + c + '</th>');
  html += '<th>?됯? ??/th></tr></thead><tbody>';
  ranking.forEach(st => {
    let medal = '', rankClass = '';
    if (st.rank === 1) { medal = '?쪍'; rankClass = 'rank-1'; } else if (st.rank === 2) { medal = '?쪎'; rankClass = 'rank-2'; } else if (st.rank === 3) { medal = '?쪏'; rankClass = 'rank-3'; }
    html += '<tr class="' + rankClass + '"><td><span class="rank-medal">' + medal + '</span>' + st.rank + '??/td><td><strong>' + st.studentId + '</strong></td><td style="color:var(--color-result);font-weight:bold;">' + st.totalAvg.toFixed(2) + '</td>';
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
  const container = document.getElementById('studentReviews'); container.innerHTML = '<p style="text-align:center;">遺덈윭?ㅻ뒗 以?..</p>';
  const { data: reviews } = await db.from('reviews').select('*').eq('class_code', currentClassCode).eq('review_date', date).eq('target_id', String(studentId)).eq('review_type', type);
  if (!reviews || reviews.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-sub);">?됯? ?곗씠?곌? ?놁뒿?덈떎.</p>'; return; }
  let html = '<h3>' + studentId + '踰덉뿉 ????됯? (珥?' + reviews.length + '媛?</h3>';
  reviews.forEach(r => {
    html += '<div class="review-card"><div class="review-header"><span><strong>?됯???</strong> ' + r.reviewer_id + '</span><span>' + r.review_date + '</span></div><div class="review-content">' + r.review_content + '</div>';
    if (r.scores_json && r.scores_json.criteria) {
      html += '<div class="review-scores">';
      r.scores_json.criteria.forEach((c, idx) => { html += '<div class="review-score-item"><div style="font-weight:bold;margin-bottom:3px;font-size:0.75rem;">' + c + '</div><div style="color:var(--primary);font-weight:bold;">' + (r.scores_json.scores[String(idx)] || '-') + '??/div></div>'; });
      html += '</div>';
    }
    html += '</div>';
  }); container.innerHTML = html;
}

// ============================================
// 援먯궗 ?ㅼ젙
// ============================================
async function loadClassSettingsUI() {
  const settings = await getClassSettings();
  document.getElementById('settingStudentCount').value = settings.studentCount;
  document.getElementById('settingGroupCount').value = settings.groupCount;

  // ?숆툒 ?뺣낫 濡쒕뱶
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
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  const isCodeChanged = (newCode !== currentClassCode);
  const msg = isCodeChanged
    ? '\uD559\uAE09 \uC815\uBCF4\uC640 <strong>\uD074\uB798\uC2A4 \uCF54\uB4DC</strong>\uB97C \uBCC0\uACBD\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?<br><span class="modal-inline-note modal-inline-note-warning">* \uCF54\uB4DC\uB97C \uBCC0\uACBD\uD558\uBA74 \uAE30\uC874 \uD559\uC0DD\uB4E4\uB3C4 \uC0C8 \uCF54\uB4DC\uB85C \uB2E4\uC2DC \uC811\uC18D\uD574\uC57C \uD569\uB2C8\uB2E4.</span>'
    : '\uD559\uAE09 \uC815\uBCF4\uB97C \uBCC0\uACBD\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?';
  showModal({
    type: 'confirm', icon: '❓', title: '학급 정보 변경', message: msg,
    onConfirm: async () => {
      setLoading(true, btn, '???以?..');
      try {
        const { data: { user } } = await db.auth.getUser();

        // 1. ?대옒???뚯씠釉??낅뜲?댄듃
        const { error: clsError } = await db.from('classes')
          .update({ class_name: newName, class_code: newCode })
          .eq('class_code', currentClassCode);

        if (clsError) throw clsError;

        // 2. 留뚯빟 肄붾뱶媛 諛붾뚯뿀?ㅻ㈃ ?꾨줈?꾨룄 ?낅뜲?댄듃
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

        setLoading(false, btn, '저장');
        showModal({
          type: 'alert', icon: '✅', title: '저장 완료',
          message: '학급 정보가 저장되었습니다.' + (isCodeChanged ? ' 새 코드 적용을 위해 새로고침합니다.' : ''),
          onConfirm: () => { if (isCodeChanged) window.location.reload(); }
        });
      } catch (err) {
        setLoading(false, btn, '저장');
        showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
      }
    }
  });
}
function saveClassSettingsUI(btn) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const sc = parseInt(document.getElementById('settingStudentCount').value) || 30;
  const gc = parseInt(document.getElementById('settingGroupCount').value) || 6;
  showModal({
    type: 'confirm', icon: '❓', title: '학생/모둠 수 변경', message: '학생 <strong>' + sc + '명</strong>, 모둠 <strong>' + gc + '개</strong>로 저장할까요?',
    onConfirm: async () => {
      setLoading(true, btn, '???以?..');
      await db.from('classes').update({ student_count: sc, group_count: gc }).eq('class_code', currentClassCode);
      setLoading(false, btn, '저장');
      showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
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
    type: 'confirm', icon: '?좑툘', title: '踰덊샇 ?깅줉 ?댁젣',
    message: '<strong>' + num + '踰?/strong> ?숈깮???깅줉???댁젣?섏떆寃좎뒿?덇퉴?<br><span class="modal-inline-note">?대떦 ?숈깮? ?ㅼ떆 ?⑤낫?⑹쓣 吏꾪뻾?댁빞 ?⑸땲??</span>',
    onConfirm: async () => {
      await db.from('user_profiles').delete().eq('id', profileId);
      showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
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
  if (!obj || !task) { showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint }); return; }
  setLoading(true, btn, '???以?..');
  await db.from('objectives').upsert({ class_code: currentClassCode, eval_date: date, objective: obj }, { onConflict: 'class_code,eval_date' });
  await db.from('tasks').upsert({ class_code: currentClassCode, eval_date: date, task: task }, { onConflict: 'class_code,eval_date' });
  setLoading(false, btn, '저장');
  showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
}
async function saveDailyCriteria(btn) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  const date = document.getElementById('settingDate').value;
  const obj = document.getElementById('settingObjective').value;
  const task = document.getElementById('settingTask').value;
  const isAutoMode = !document.getElementById('autoCriteriaArea').classList.contains('hidden');
  const prefix = isAutoMode ? 'autoRate' : 'settingRate';
  const r = []; for (let i = 1; i <= 6; i++) r.push(document.getElementById(prefix + i).value);
  setLoading(true, btn, '???以?..');
  await db.from('objectives').upsert({ class_code: currentClassCode, eval_date: date, objective: obj }, { onConflict: 'class_code,eval_date' });
  await db.from('tasks').upsert({ class_code: currentClassCode, eval_date: date, task: task }, { onConflict: 'class_code,eval_date' });
  const evalType = document.getElementById('autoTargetSelect').value || 'individual';
  await db.from('rating_criteria').upsert({ class_code: currentClassCode, eval_date: date, eval_type: evalType, criteria_1: r[0], criteria_2: r[1], criteria_3: r[2], criteria_4: r[3], criteria_5: r[4], criteria_6: r[5] }, { onConflict: 'class_code,eval_date,eval_type' });
  setLoading(false, btn, '저장');
  showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
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
  gs.innerHTML = sl === '珥덈벑?숆탳' ? '<option value="1?숇뀈">1?숇뀈</option><option value="2?숇뀈">2?숇뀈</option><option value="3?숇뀈">3?숇뀈</option><option value="4?숇뀈">4?숇뀈</option><option value="5?숇뀈" selected>5?숇뀈</option><option value="6?숇뀈">6?숇뀈</option>' : '<option value="1?숇뀈" selected>1?숇뀈</option><option value="2?숇뀈">2?숇뀈</option><option value="3?숇뀈">3?숇뀈</option>';
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
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
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
    type: 'prompt', icon: '⚠️', title: '전체 데이터 초기화',
    message: '현재 학급의 모든 기록 데이터를 초기화합니다.<br>아래 입력칸에 <strong>초기화</strong>를 입력하면 진행됩니다.',
    inputPlaceholder: '초기화',
    onConfirm: async (val) => {
      if (val === '초기화') {
        setLoading(true, btn, '초기화 중...');

        // ??젣???뚯씠釉?由ъ뒪??
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
          // 媛??뚯씠釉붿뿉???꾩옱 ?숆툒 肄붾뱶???대떦?섎뒗 ?곗씠????젣
          const deletePromises = tables.map(table =>
            db.from(table).delete().eq('class_code', currentClassCode)
          );

          const results = await Promise.all(deletePromises);

          // ?먮윭 泥댄겕
          const firstError = results.find(r => r.error)?.error;
          if (firstError) throw firstError;

          setLoading(false, btn, '초기화');
          showModal({
            type: 'alert',
            icon: '✅',
            title: '초기화 완료',
            message: '현재 학급의 모든 기록 데이터가 초기화되었습니다.'
          });
          loadTeacherData();
        } catch (err) {
          console.error('珥덇린???ㅻ쪟:', err);
          setLoading(false, btn, '초기화');
          showModal({
            type: 'alert',
            icon: '⚠️',
            title: '오류',
            message: '초기화 중 오류가 발생했습니다: ' + err.message
          });
        }
      }
      else showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    }
  });
}

// ============================================
// ?먭린?됯? (Self-Evaluation) 湲곕뒫
// ============================================

// 硫붿떆吏 紐⑤뱶 ?좉? (?듬챸/?ㅻ챸)
function toggleMessageMode(mode) {
  const anonymousBtn = document.getElementById('anonymousBtn');
  const namedBtn = document.getElementById('namedBtn');
  const messageArea = document.getElementById('messageInputArea');
  const badge = document.getElementById('messageModeBadge');

  if (currentMessageMode === mode) {
    // 媛숈? 踰꾪듉 ?ㅼ떆 ?대┃ ??痍⑥냼
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
      badge.textContent = '익명으로 제출됩니다';
      badge.style.color = 'var(--color-teal)';
    } else {
      const studentName = currentStudent ? currentStudent.id + '번' : '';
      badge.textContent = studentName + '(기명으로 제출됩니다)';
      badge.style.color = 'var(--color-blue)';
    }
  }
}

// 怨쇰ぉ/?쒕룞 ?쒓렇 ?좉?
function toggleSubjectTag(tag) {
  const btnList = document.querySelectorAll('.subject-tag-btn');
  // 踰꾪듉 ?대? ?띿뒪?몄뿉 ?쒓렇媛 ?ы븿?섏뼱 ?덈뒗吏 ?뺤씤
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

// ?곗씪由??먭린?됯? 濡쒕뱶
async function loadDailyReflection() {
  if (!currentStudent || !currentClassCode) return;
  ensureSubjectTagButtons();
  ensureCustomSubjectInput();

  let targetDate = document.getElementById('selfDate').value;
  if (!targetDate) {
    targetDate = getDefaultQueryDate();
    document.getElementById('selfDate').value = targetDate;
  }

  // ?ㅻ뒛 ?묒꽦???먭린?됯? ?덈뒗吏 ?뺤씤
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
    // 湲곕줉???놁쑝硫???珥덇린??
    document.getElementById('learningText').value = '';
    selectedSubjectTags = [];
    const customInput = getCustomSubjectInputEl();
    if (customInput) customInput.value = '';
  }

  // 怨쇰ぉ ?쒓렇 踰꾪듉 ?쒖꽦??
  document.querySelectorAll('.subject-tag-btn').forEach(btn => btn.classList.remove('selected'));
  selectedSubjectTags.forEach(tag => {
    const tagBtn = Array.from(document.querySelectorAll('.subject-tag-btn')).find(btn => btn.innerText.includes(tag));
    if (tagBtn) tagBtn.classList.add('selected');
  });
  syncCustomSubjectInputVisibility();
}

// ?곗씪由??먭린?됯? ?쒖텧
async function submitDailyReflection() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  if (!currentStudent || !currentClassCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  const learningText = document.getElementById('learningText').value.trim();

  if (!learningText) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  const btn = document.getElementById('saveDailyBtn');
  const msg = document.getElementById('dailyMsg');
  const targetDate = document.getElementById('selfDate').value;

  setLoading(true, btn, '???以?..');

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

    setLoading(false, btn, '저장');
    showMsg(msg, '기록이 저장되었습니다! ✅', 'success');

    // AI 留욎땄 ?쇰뱶諛??앹꽦
    generateAiFeedback(learningText, finalSubjectTags);

  } catch (err) {
    console.error('?쇨린 ????ㅻ쪟:', err);
    setLoading(false, btn, '저장');
    showMsg(msg, '저장 중 오류: ' + err.message, 'error');
  }
}


// AI 留욎땄 ?쇰뱶諛??앹꽦 (媛먯궗+諛곗? 湲?????
async function generateAiFeedback(learning, subjects) {
  const feedbackSection = document.getElementById('aiFeedbackSection');
  const feedbackText = document.getElementById('aiFeedbackText');
  if (!feedbackSection || !feedbackText) return;

  feedbackSection.classList.remove('hidden');
  feedbackText.innerHTML = '<span style="color:var(--text-sub);">💬 성장 파트너가 한마디를 준비 중...</span>';

  try {
    const partner = studentPartner || await ensureStudentPartnerLoaded({ backfill: true });
    const safeSubjects = Array.isArray(subjects) ? subjects : [];

    const prompt = [
      '[ROLE]',
      "너는 '배움로그'의 AI 성장 파트너다.",
      "학생에게 1:1로 말하는 톤으로, 반말은 쓰지 않되 딱딱하지 않은 친근한 존댓말(해요체)을 사용한다.",
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
          learning_text: learning || '',
          subject_tags: safeSubjects
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
      '8) 한국어로만 작성.',
    ].join('\n');

    const result = await callGemini(prompt, { generationConfig: { temperature: 0.65, maxOutputTokens: 320 } });

    if (result.ok && result.text) {
      feedbackText.innerHTML = formatMarkdown(result.text);
      const targetDate = document.getElementById('selfDate')?.value || getDefaultQueryDate();
      await db.from('daily_reflections')
        .update({ ai_feedback: result.text })
        .eq('class_code', currentClassCode)
        .eq('student_id', String(currentStudent.id))
        .eq('reflection_date', targetDate);
      return;
    }
  } catch (error) {
    console.warn('generateAiFeedback error:', error);
  }

  feedbackText.textContent = '오늘 기록 자체가 이미 큰 성장입니다. 내일도 한 줄만 더 남겨볼까요?';
}
async function checkForTeacherReplies() { return; }

// 蹂꾩젏 ?좏깮


// ?꾨줈?앺듃 ?먭린?됯? ?쒖텧
async function submitProjectReflection() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  if (!currentStudent || !currentClassCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  const projectName = document.getElementById('projectName').value.trim();
  const comment = document.getElementById('projectComment').value.trim();

  if (!projectName) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  const btn = document.getElementById('submitProjectBtn');
  const msg = document.getElementById('projectMsg');
  const targetDate = document.getElementById('selfDate').value;

  setLoading(true, btn, '?쒖텧 以?..');

  try {
    const projectData = {
      class_code: currentClassCode,
      student_id: String(currentStudent.id),
      project_name: projectName,
      reflection_date: targetDate,
      star_rating: 0, // 蹂꾩젏 湲곕뒫 ?쒓굅濡??명븳 湲곕낯媛?
      comment: comment || null
    };

    const { error } = await db.from('project_reflections')
      .upsert(projectData, { onConflict: 'class_code,student_id,project_name,reflection_date' });

    if (error) throw error;

    setLoading(false, btn, '?쒖텧');
    showMsg(msg, '?깃났?곸쑝濡??쒖텧?섏뿀?듬땲?? ?뙚', 'success');

    // AI 遺꾩꽍 ?앹꽦 (?쒕뜡 ?쇰뱶諛?
    const analysis = await generateProjectAnalysis(Math.floor(Math.random() * 5) + 1);
    document.getElementById('projectAIText').textContent = analysis;
    document.getElementById('projectAIAnalysis').classList.remove('hidden');

    // ?낅젰 ?꾨뱶 珥덇린??
    document.getElementById('projectName').value = '';
    document.getElementById('projectComment').value = '';

  } catch (error) {
    setLoading(false, btn, '?쒖텧');
    showMsg(msg, error.message, 'error');
  }
}

// AI ?꾨줈?앺듃 遺꾩꽍 ?앹꽦
async function generateProjectAnalysis(stars) {
  const analyses = {
    5: ['아주 훌륭해요! 오늘 활동에서 핵심을 정확하게 잡았어요.', '정말 인상적이에요. 다음 활동에서도 이 흐름을 이어가 봐요.'],
    4: ['좋아요! 중요한 포인트를 잘 정리했어요.', '의미 있는 시도였어요. 다음에는 근거를 한 줄 더 써보면 더 좋아요.'],
    3: ['괜찮아요! 오늘 배움을 잘 남겼어요.', '기록을 이어가는 힘이 보입니다. 다음에는 구체 예시를 하나 더 넣어봐요.'],
    2: ['시작이 좋아요. 핵심 한 가지를 더 분명히 써보면 좋아요.', '짧아도 괜찮아요. 오늘 배운 점을 한 문장만 더 덧붙여봐요.'],
    1: ['기록한 것 자체가 이미 성장입니다. 다음엔 느낀 점 한 줄만 더 써봐요.', '천천히 해도 괜찮아요. 오늘의 작은 발견 하나를 남겨보세요.']
  };

  const options = analyses[stars] || analyses[3];
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================
// 援먯궗???먭린?됯? 愿由?湲곕뒫
// ============================================

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

// 援먯궗??諛곗? ?명듃 ?곗씠??濡쒕뱶
async function loadTeacherDiaryData() {
  if (!currentClassCode) return;

  const selectedDate = getTeacherDiarySelectedDate();
  if (!selectedDate) return;
  syncTeacherDiaryDateInputs(selectedDate);

  try {
    // "李몄뿬?꾪솴" + "諛곗??명듃 ?뺤씤"??議고쉶?좎쭨 湲곕컲?쇰줈 ??踰덉뿉 濡쒕뱶
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

    // ?듦퀎 ?낅뜲?댄듃
    document.getElementById('totalReflections').textContent = totalCount || 0;
    document.getElementById('todayReflections').textContent = todayReflections?.length || 0;
    renderDiaryCompletionStatus(todayReflections || [], settings?.studentCount || 30, selectedDate);

    // 誘명빐寃??대젮? ?뚮┝(議고쉶?좎쭨 湲곕컲)
    renderEmotionAlerts(todayReflections || [], selectedDate);

  } catch (error) {
    console.error('Error loading diary data:', error);
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
  }
}

// ?숈깮 硫붿떆吏 ?좎쭨 珥덇린??
function initMessageDate() {
  const today = getDefaultQueryDate();
  document.getElementById('messageViewDate').value = today;
}

// ?숈깮 硫붿떆吏 濡쒕뱶 (移?갔 ?곗껜????
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
// ?곗껜??
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

// ?좎깮?섍퍡 硫붿떆吏留??꾩넚
async function submitTeacherMessageOnly() {
  if (isDemoMode) { showDemoBlockModal(); return; }
  if (!currentStudent || !currentClassCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  const teacherMessage = document.getElementById('teacherMessage').value.trim();

  if (!teacherMessage) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  if (!currentMessageMode) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
    return;
  }

  const btn = document.getElementById('sendTeacherMsgBtn');
  const msg = document.getElementById('teacherMsgResult');

  setLoading(true, btn, '蹂대궡??以?..');

  try {
    const messageData = {
      class_code: currentClassCode,
      student_id: currentMessageMode === 'named' ? String(currentStudent.id) : null,
      is_anonymous: currentMessageMode === 'anonymous',
      message_content: teacherMessage
    };

    // ?ㅻ뒛 ?좎쭨??reflection_id 李얘린 (?좏깮 ?ы빆)
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
    showMsg(msg, '메시지를 전송했습니다. 💬', 'success');

    // ?낅젰 ?꾨뱶 珥덇린??
    document.getElementById('teacherMessage').value = '';
    currentMessageMode = null;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('messageInputArea').classList.add('hidden');

  } catch (err) {
    console.error('硫붿떆吏 ?꾩넚 ?ㅻ쪟:', err);
    setLoading(false, btn, '보내기');
    showMsg(msg, '전송 오류: ' + err.message, 'error');
  }
}
async function loadPraiseData() {
  if (!currentStudent || !currentClassCode) return;
  // ???洹몃━???뚮뜑留?
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
  if (!targetId) { showMsg(msg, '移?갔??移쒓뎄瑜??좏깮?댁＜?몄슂.', 'error'); return; }
  if (content.length < 10) { showMsg(msg, '移?갔? 理쒖냼 10???댁긽 ?⑥＜?몄슂.', 'error'); return; }
  setLoading(true, btn, '蹂대궡??以?..');

  // ?숆툒 ?ㅼ젙?먯꽌 ?먮룞 ?뱀씤 ?щ? ?뺤씤
  let isApproved = false;
  try {
    const { data: classData } = await db.from('classes').select('auto_approve_praise').eq('class_code', currentClassCode).maybeSingle();
    if (classData && classData.auto_approve_praise) isApproved = true;
  } catch (err) {
    console.warn('?먮룞 ?뱀씤 ?ㅼ젙 濡쒕뱶 ?ㅽ뙣, 湲곕낯媛??섎룞) ?ъ슜:', err);
  }

  const { error } = await db.from('praise_messages').insert({
    class_code: currentClassCode,
    sender_id: String(currentStudent.id),
    receiver_id: String(targetId),
    message_content: content,
    is_anonymous: isAnon,
    is_approved: isApproved
  });
  setLoading(false, btn, '移?갔 蹂대궡湲??뮑');
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, '移?갔???꾨떖?섏뿀?듬땲?? ?좎깮???뺤씤 ???꾨떖?쇱슂 ?뮑', 'success');
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
    return '<div class="teacher-praise-item teacher-praise-item-received">' +
      '<div class="teacher-praise-item-head">' +
      '<span class="teacher-praise-sender teacher-praise-sender-received">' + sender + '</span>' +
      '<span class="teacher-praise-date">' + date + '</span>' +
      '</div>' +
      '<div class="teacher-praise-content">' + escapeHtml(p.message_content) + '</div>' +
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
  showCustomConfirm('??移?갔????젣?섏떆寃좎뒿?덇퉴?', async () => {
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

// ?먮룞 ?뱀씤 ?좉? 蹂寃?
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
      icon: isActive ? '✅' : '⚪',
      title: '설정 변경',
      message: '칭찬 자동 승인 기능을 ' + (isActive ? '활성화' : '비활성화') + '했습니다.<br><small>' + (isActive ? '이제 새 칭찬이 자동으로 표시됩니다.' : '이제 칭찬은 수동으로 확인 후 표시됩니다.') + '</small>'
    });
  } catch (error) {
    console.error('?먮룞 ?뱀씤 ?ㅼ젙 蹂寃??ㅻ쪟:', error);
    el.checked = !isActive; // ?ㅽ뙣 ??蹂듦뎄
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
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

  const snippets = [];
  const labelPatterns = [
    /아직\s*헷갈리는\s*점\s*:?\s*([^\n]+)/,
    /어려웠던\s*점\s*:?\s*([^\n]+)/,
    /어려움\s*:?\s*([^\n]+)/,
    /still\s*confusing\s*:?\s*([^\n]+)/i
  ];

  for (const re of labelPatterns) {
    const m = t.match(re);
    if (m && m[1]) snippets.push(clip(m[1], 90));
  }

  if (snippets.length === 0) {
    const unresolvedRe = /(헷갈|어렵|모르겠|이해가\s*안|막혔|막힘|부족)/;
    const resolvedRe = /(해결|알게\s*됐|이해했|정리했|해냈|개선)/;
    const parts = t.split(/\n+|[.!?]\s+/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (!unresolvedRe.test(p)) continue;
      if (resolvedRe.test(p)) continue;
      snippets.push(clip(p, 90));
      if (snippets.length >= 2) break;
    }
  }

  return Array.from(new Set(snippets)).filter(Boolean).slice(0, 2);
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

// "愿?ъ씠 ?꾩슂???숈깮" (湲곗〈: 媛먯젙 ?ㅼ썙?? -> "?대젮? 紐⑥븘蹂닿린" 湲곕컲
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
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">?뭽</span><div class="empty-title">硫붿떆吏媛 ?놁뒿?덈떎</div><div class="empty-desc">???좎쭨???숈깮 硫붿떆吏媛 ?놁뒿?덈떎</div></div>';
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
          <span>?뱟 ${msg.daily_reflections?.reflection_date || '?좎쭨 誘몄긽'}</span>
          <span>?븧 ${timeStr}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// HTML ?댁뒪耳?댄봽
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ?ㅼ썙???듦퀎 ?뚮뜑留?
function renderKeywordStats(tagCounts) {
  const container = document.getElementById('gratitudeStats');
  if (!container) return;

  if (Object.keys(tagCounts).length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">?뱤</span><div class="empty-desc">媛먯궗 ?ㅼ썙?쒓? ?놁뒿?덈떎</div></div>';
    return;
  }

  // ?쒓렇 ?대え吏 留ㅽ븨
  const tagEmojis = {
    '도움': '🤝',
    '친절': '😊',
    '협력': '🫶',
    '배려': '💝',
    '기타': '✨'
  };

  let html = '<div class="keyword-cloud">';
  Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).forEach(([tag, count]) => {
    const emoji = tagEmojis[tag] || '?뮑';
    html += `<div class="keyword-item">${emoji} ${tag}<span class="keyword-count">${count}</span></div>`;
  });
  html += '</div>';

  container.innerHTML = html;
}

// (以묐났 ???꾪솚 ?⑥닔 ?쒓굅??- ?꾩쓽 switchStudentMainTab, switchPeerTab, switchSelfTab ?ъ슜)

// ============================================
// ?깊뼢 吏꾨떒 ?쒖뒪??
// ============================================

const PARTNER_VERSION = 2;

const PARTNER_TYPES = [
  {
    type_code: 'solver_detail_plan',
    type_name: '구체적인 계획가',
    emoji: '🎯',
    representative_answers: { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A', 6: 'A' },
    description: {
      feedback_style: '어디가 잘됐고 어디가 부족한지 정확하게 짚어줘요. 근거와 함께 알려주니까 뭘 고쳐야 할지 바로 알 수 있어요.',
      action_style: '뭘 언제까지 하면 되는지 계획표로 정리해줘요. 하나씩 체크하다 보면 성장이 눈에 보여요.',
      encouraging_phrase: '3번 유형 문제, 이렇게 풀어보면 돼. 이번 주 월수는 이거, 목금은 저거.'
    },
    style_guide: {
      tone: '명확하고 실천 중심',
      format: '근거 2개 + 계획 1개'
    }
  },
  {
    type_code: 'solver_detail_explore',
    type_name: '구체적인 도전가',
    emoji: '🛠',
    representative_answers: { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'B', 6: 'B' },
    description: {
      feedback_style: '어디가 잘됐고 어디가 부족한지 정확하게 짚어줘요. 핵심만 콕 집어주니까 바로 행동으로 옮길 수 있어요.',
      action_style: '부담 없이 해볼 수 있는 작은 도전을 제안해줘요. 한 번 해보면 자신감이 붙어요.',
      encouraging_phrase: '핵심은 잘 잡았어요. 오늘은 작은 실험 하나만 해봐요.'
    },
    style_guide: {
      tone: '직설적이되 가볍게 시작',
      format: '핵심 포인트 + 작은 실험 1개'
    }
  },
  {
    type_code: 'solver_big_plan',
    type_name: '큰그림형 계획가',
    emoji: '🗺',
    representative_answers: { 1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'A', 6: 'A' },
    description: {
      feedback_style: '지금 어디쯤 있고 어디로 가면 되는지 방향을 잡아줘요. 전체 그림이 보이니까 흔들리지 않아요.',
      action_style: '뭐부터 해야 하는지 우선순위를 정리해줘요. 순서대로 하다 보면 길이 선명해져요.',
      encouraging_phrase: '방향은 맞아요. 우선순위만 정리하면 훨씬 빨라져요.'
    },
    style_guide: {
      tone: '방향 제시 중심',
      format: '전체 흐름 1문장 + 우선순위 3단계'
    }
  },
  {
    type_code: 'solver_big_explore',
    type_name: '큰그림형 도전가',
    emoji: '🚀',
    representative_answers: { 1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'B', 6: 'B' },
    description: {
      feedback_style: '지금 어디쯤 있고 어디로 가면 되는지 방향을 잡아줘요. 가능성을 보여주니까 도전하고 싶어져요.',
      action_style: '여러 가능성 중에 해볼 만한 걸 제안해줘요. 해보면서 나한테 맞는 길을 찾아가요.',
      encouraging_phrase: '큰 방향은 좋아요. 해볼 만한 것 하나만 지금 시작해봐요.'
    },
    style_guide: {
      tone: '도전 유도형',
      format: '방향 1문장 + 실험 1개'
    }
  },
  {
    type_code: 'support_detail_plan',
    type_name: '함께하는 계획가',
    emoji: '📋',
    representative_answers: { 1: 'B', 2: 'B', 3: 'A', 4: 'A', 5: 'A', 6: 'A' },
    description: {
      feedback_style: '잘한 부분을 먼저 알아봐주고, 부족한 점은 같이 고민해줘요. 안심이 되니까 더 솔직하게 받아들일 수 있어요.',
      action_style: '차근차근 할 수 있도록 단계를 나눠서 정리해줘요. 한 걸음씩 같이 가는 느낌이에요.',
      encouraging_phrase: '좋았던 점부터 같이 보고, 다음 단계도 같이 정해봐요.'
    },
    style_guide: {
      tone: '안정감 있고 협력적',
      format: '강점 1개 + 함께하는 단계 계획'
    }
  },
  {
    type_code: 'support_detail_explore',
    type_name: '함께하는 도전가',
    emoji: '🤝',
    representative_answers: { 1: 'B', 2: 'B', 3: 'A', 4: 'A', 5: 'B', 6: 'B' },
    description: {
      feedback_style: '잘한 부분을 먼저 알아봐주고, 부족한 점은 같이 고민해줘요. 혼자가 아니라는 느낌이 힘이 돼요.',
      action_style: '부담 없는 작은 도전을 함께 시작해줘요. 같이 하니까 용기가 생겨요.',
      encouraging_phrase: '같이 해보면 더 쉬워요. 오늘은 작은 도전 하나만 같이 해봐요.'
    },
    style_guide: {
      tone: '부드럽고 동행형',
      format: '강점 확인 + 함께 도전 1개'
    }
  },
  {
    type_code: 'support_big_plan',
    type_name: '공감하는 계획가',
    emoji: '🫶',
    representative_answers: { 1: 'B', 2: 'B', 3: 'B', 4: 'B', 5: 'A', 6: 'A' },
    description: {
      feedback_style: '지금 기분이나 상황을 먼저 알아주고, 큰 방향을 함께 잡아줘요. 마음이 편해진 다음에 움직이니까 더 잘돼요.',
      action_style: '무리하지 않는 선에서 목표와 순서를 정리해줘요. 내 속도에 맞춰 가니까 지치지 않아요.',
      encouraging_phrase: '지금 속도도 충분히 좋아요. 무리하지 않는 계획으로 가봅시다.'
    },
    style_guide: {
      tone: '공감 우선 + 방향 제시',
      format: '상황 공감 1문장 + 완만한 계획'
    }
  },
  {
    type_code: 'support_big_explore',
    type_name: '공감하는 도전가',
    emoji: '🌱',
    representative_answers: { 1: 'B', 2: 'B', 3: 'B', 4: 'B', 5: 'B', 6: 'B' },
    description: {
      feedback_style: '지금 기분이나 상황을 먼저 알아주고, 큰 방향을 함께 잡아줘요. 내 마음을 알아주니까 더 열리게 돼요.',
      action_style: '호기심을 자극하는 새로운 시도를 제안해줘요. 재밌어서 하다 보면 어느새 성장해 있어요.',
      encouraging_phrase: '마음부터 챙기고, 해볼 만한 시도 하나를 가볍게 해봐요.'
    },
    style_guide: {
      tone: '공감 기반 탐색형',
      format: '공감 1문장 + 실험 제안 1개'
    }
  }
];

const SUPPORT_TAG_GUIDE = {
  '#함께 성장형': '실천 제안 시 협력 활동 포함 (친구와 설명 연습, 모둠 토론, 같이 문제 풀기)',
  '#혼자 집중형': '실천 제안 시 개인 활동 포함 (노트 정리, 혼자 풀어보기, 조용히 복습)'
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
    else picked = q7;
  } else {
    picked = isValid(q7) ? q7 : q8;
  }

  if (picked === 'A') return { learning_env: '함께', support_tag: '#함께 성장형' };
  return { learning_env: '혼자', support_tag: '#혼자 집중형' };
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

  const coachingCode = axes_raw.coaching_style === '해결형' ? 'solver' : 'support';
  const infoCode = axes_raw.info_processing === '디테일형' ? 'detail' : 'big';
  const executionCode = axes_raw.execution_strategy === '계획형' ? 'plan' : 'explore';
  const type_code = `${coachingCode}_${infoCode}_${executionCode}`;

  const catalog = PARTNER_TYPE_BY_CODE[type_code] || null;
  const type_name = catalog ? catalog.type_name : type_code;
  const emoji = catalog ? catalog.emoji : '🎯';
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
    `#함께 성장형: ${SUPPORT_TAG_GUIDE['#함께 성장형']}`,
    `#혼자 집중형: ${SUPPORT_TAG_GUIDE['#혼자 집중형']}`
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
    const { error } = await db.from('student_personality').upsert(payload, { onConflict: 'class_code,student_id' });
    if (error) throw error;
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
    question: '피드백을 받을 때 어떤 방식이 더 도움이 되나요?',
    optionA: { label: 'A', text: '정확히 짚어주고 바로 해볼 행동을 알려주면 좋아요.' },
    optionB: { label: 'B', text: '먼저 공감해주고 같이 방향을 찾아주면 좋아요.' }
  },
  {
    id: 2,
    category: '코칭 스타일',
    question: '실수했을 때 듣고 싶은 말은 무엇에 가깝나요?',
    optionA: { label: 'A', text: '어디서 틀렸는지 분명하게 알려주면 좋아요.' },
    optionB: { label: 'B', text: '괜찮다고 말해주고 다시 해보자고 하면 좋아요.' }
  },
  {
    id: 3,
    category: '정보 처리',
    question: '새로운 내용을 배울 때 더 편한 방식은?',
    optionA: { label: 'A', text: '단계별로 쪼개서 자세히 설명해주는 방식' },
    optionB: { label: 'B', text: '전체 흐름을 먼저 보여주는 방식' }
  },
  {
    id: 4,
    category: '정보 처리',
    question: '정리할 때 어떤 형태가 더 잘 맞나요?',
    optionA: { label: 'A', text: '체크리스트처럼 구체 항목을 정리하는 방식' },
    optionB: { label: 'B', text: '큰 방향과 핵심 포인트를 묶어보는 방식' }
  },
  {
    id: 5,
    category: '실행 전략',
    question: '실천할 때 어떤 접근이 더 잘 맞나요?',
    optionA: { label: 'A', text: '이번 주 계획처럼 일정이 정해져 있으면 좋아요.' },
    optionB: { label: 'B', text: '작게 시도해보며 맞는 방법을 찾는 게 좋아요.' }
  },
  {
    id: 6,
    category: '실행 전략',
    question: '목표를 시작할 때 보통 어떻게 하나요?',
    optionA: { label: 'A', text: '우선순위를 정하고 순서대로 실행해요.' },
    optionB: { label: 'B', text: '가능한 것부터 해보며 방향을 조정해요.' }
  },
  {
    id: 7,
    category: '학습 환경',
    question: '어떤 환경에서 더 집중이 잘 되나요?',
    optionA: { label: 'A', text: '친구와 설명하거나 함께 활동할 때' },
    optionB: { label: 'B', text: '혼자 조용히 정리하고 풀어볼 때' }
  },
  {
    id: 8,
    category: '학습 환경',
    question: '어려운 문제를 만났을 때 더 편한 방식은?',
    optionA: { label: 'A', text: '같이 이야기하면서 해결하는 방식' },
    optionB: { label: 'B', text: '혼자 차분히 풀어보며 해결하는 방식' }
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
    console.error('?먭린?됯? 珥덇린???ㅻ쪟:', error);
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
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
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
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
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

  try {
    if (!isDemoMode) {
      const { error } = await db.from('student_personality').upsert(payload, { onConflict: 'class_code,student_id' });
      if (error) throw error;
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
        await db.from('student_personality').upsert({
          class_code: currentClassCode,
          student_id: currentStudent?.id,
          question_responses: quizAnswers
        }, { onConflict: 'class_code,student_id' });
      }
    } catch (_) { }

    const msg = String(error?.message || error);
    const hint = (msg.includes('partner_type_code') || msg.includes('partner_type_name') || msg.includes('partner_axes') || msg.includes('partner_version'))
      ? '<br><br><small>DB???깆옣?뚰듃??而щ읆???놁뼱 ??ν븯吏 紐삵뻽?댁슂. `supabase_migrations/2026-02-15_add_partner_type_columns.sql`???곸슜??二쇱꽭??</small>'
      : '';
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '성향 저장 중 오류: ' + msg + hint });
  }
}

function getPartnerLearningEnvironmentText(supportTag) {
  if (supportTag === '#함께 성장형') {
    return '친구와 설명 연습, 모둠 토론처럼 함께 배우는 활동에서 강점이 살아나요.';
  }
  if (supportTag === '#혼자 집중형') {
    return '혼자 정리하고 조용히 복습하는 활동에서 집중력이 잘 발휘돼요.';
  }
  return '현재 학습 상황에 맞는 환경을 함께 찾아가면 좋아요.';
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
    return `${typeSubject} 혼자 집중해 정리할 때 강점이 잘 살아나는 유형이에요.`;
  }
  return `${typeSubject} 자신의 속도에 맞춰 성장할 수 있는 유형이에요.`;
}

function getPartnerToneClass(typeCode) {
  const code = String(typeCode || '').trim();
  if (!code) return 'tone-blue';
  if (code.startsWith('?닿껐?뷀뀒??)) return 'tone-blue';     // 援ъ껜?곸씤
  if (code.startsWith('?닿껐?곌렇由?)) return 'tone-purple';   // ?곌렇由쇳삎
  if (code.startsWith('吏吏?뷀뀒??)) return 'tone-green';    // ?④퍡?섎뒗
  if (code.startsWith('吏吏?곌렇由?)) return 'tone-orange';   // 怨듦컧?섎뒗
  return 'tone-blue';
}

const PARTNER_TYPE_HINT_TEXT = {
  '?닿껐?뷀뀒?쇨퀎??: '?뺥솗??吏싳뼱二쇨퀬, 怨꾪쉷?쒕줈 李④렐李④렐 ?뺣━',
  '?닿껐?뷀뀒?쇳깘??: '?뺥솗??吏싳뼱二쇨퀬, ?묒? ?꾩쟾?쇰줈 諛붾줈 ?ㅼ쿇',
  '?닿껐?곌렇由쇨퀎??: '??諛⑺뼢???↔퀬, ?곗꽑?쒖쐞濡?湲몄쓣 ?뺣━',
  '?닿껐?곌렇由쇳깘??: '??諛⑺뼢???↔퀬, ?대낵 留뚰븳 ?좏깮吏瑜??쒖븞',
  '吏吏?뷀뀒?쇨퀎??: '?④퍡 怨좊??섎ŉ, ?④퀎蹂꾨줈 李④렐李④렐 怨꾪쉷',
  '吏吏?뷀뀒?쇳깘??: '?④퍡 怨좊??섎ŉ, 遺???녿뒗 ?꾩쟾???쒖옉',
  '吏吏?곌렇由쇨퀎??: '留덉쓬??癒쇱? ?댄뵾怨? ???띾룄??留욎떠 諛⑺뼢 ?뺣━',
  '吏吏?곌렇由쇳깘??: '留덉쓬??癒쇱? ?댄뵾怨? ?덈줈???쒕룄瑜?媛蹂띻쾶 ?쒖븞'
};

const PARTNER_TYPE_RESULT_COPY = {
  '?닿껐?뷀뀒?쇨퀎??: {
    feedback_style: '?대뵒媛 ?섎릱怨??대뵒媛 遺議깊븳吏 ?뺥솗?섍쾶 吏싳뼱以섏슂. 洹쇨굅? ?④퍡 ?뚮젮二쇰땲源?萸?怨좎퀜???좎? 諛붾줈 ?????덉뼱??',
    action_style: '萸??몄젣源뚯? ?섎㈃ ?섎뒗吏 怨꾪쉷?쒕줈 ?뺣━?댁쨾?? ?섎굹??泥댄겕?섎떎 蹂대㈃ ?깆옣???덉뿉 蹂댁뿬??'
  },
  '?닿껐?뷀뀒?쇳깘??: {
    feedback_style: '?대뵒媛 ?섎릱怨??대뵒媛 遺議깊븳吏 ?뺥솗?섍쾶 吏싳뼱以섏슂. ?듭떖留?肄?吏묒뼱二쇰땲源?諛붾줈 ?됰룞?쇰줈 ??만 ???덉뼱??',
    action_style: '遺???놁씠 ?대낵 ???덈뒗 ?묒? ?꾩쟾???쒖븞?댁쨾?? ??踰??대낫硫??먯떊媛먯씠 遺숈뼱??'
  },
  '?닿껐?곌렇由쇨퀎??: {
    feedback_style: '吏湲??대뵒易??덇퀬 ?대뵒濡?媛硫??섎뒗吏 諛⑺뼢???≪븘以섏슂. ?꾩껜 洹몃┝??蹂댁씠?덇퉴 ?붾뱾由ъ? ?딆븘??',
    action_style: '萸먮????댁빞 ?섎뒗吏 ?곗꽑?쒖쐞瑜??뺣━?댁쨾?? ?쒖꽌?濡??섎떎 蹂대㈃ 湲몄씠 ?좊챸?댁졇??'
  },
  '?닿껐?곌렇由쇳깘??: {
    feedback_style: '吏湲??대뵒易??덇퀬 ?대뵒濡?媛硫??섎뒗吏 諛⑺뼢???≪븘以섏슂. 媛?μ꽦??蹂댁뿬二쇰땲源??꾩쟾?섍퀬 ?띠뼱?몄슂.',
    action_style: '?щ윭 媛?μ꽦 以묒뿉 ?대낵 留뚰븳 嫄??쒖븞?댁쨾?? ?대낫硫댁꽌 ?섑븳??留욌뒗 湲몄쓣 李얠븘媛??'
  },
  '吏吏?뷀뀒?쇨퀎??: {
    feedback_style: '?섑븳 遺遺꾩쓣 癒쇱? ?뚯븘遊먯＜怨? 遺議깊븳 ?먯? 媛숈씠 怨좊??댁쨾?? ?덉떖???섎땲源????붿쭅?섍쾶 諛쏆븘?ㅼ씪 ???덉뼱??',
    action_style: '李④렐李④렐 ?????덈룄濡??④퀎瑜??섎닠???뺣━?댁쨾?? ??嫄몄쓬??媛숈씠 媛???먮굦?댁뿉??'
  },
  '吏吏?뷀뀒?쇳깘??: {
    feedback_style: '?섑븳 遺遺꾩쓣 癒쇱? ?뚯븘遊먯＜怨? 遺議깊븳 ?먯? 媛숈씠 怨좊??댁쨾?? ?쇱옄媛 ?꾨땲?쇰뒗 ?먮굦???섏씠 ?쇱슂.',
    action_style: '遺???녿뒗 ?묒? ?꾩쟾???④퍡 ?쒖옉?댁쨾?? 媛숈씠 ?섎땲源??⑷린媛 ?앷꺼??'
  },
  '吏吏?곌렇由쇨퀎??: {
    feedback_style: '吏湲?湲곕텇?대굹 ?곹솴??癒쇱? ?뚯븘二쇨퀬, ??諛⑺뼢???④퍡 ?≪븘以섏슂. 留덉쓬???명빐吏??ㅼ쓬???吏곸씠?덇퉴 ???섎뤌??',
    action_style: '臾대━?섏? ?딅뒗 ?좎뿉??紐⑺몴? ?쒖꽌瑜??뺣━?댁쨾?? ???띾룄??留욎떠 媛?덇퉴 吏移섏? ?딆븘??'
  },
  '吏吏?곌렇由쇳깘??: {
    feedback_style: '吏湲?湲곕텇?대굹 ?곹솴??癒쇱? ?뚯븘二쇨퀬, ??諛⑺뼢???④퍡 ?≪븘以섏슂. ??留덉쓬???뚯븘二쇰땲源????대━寃??쇱슂.',
    action_style: '?멸린?ъ쓣 ?먭레?섎뒗 ?덈줈???쒕룄瑜??쒖븞?댁쨾?? ?щ컡?댁꽌 ?섎떎 蹂대㈃ ?대뒓???깆옣???덉뼱??'
  }
};

function getPartnerResultCopy(typeInfo) {
  const code = String(typeInfo?.type_code || '').trim();
  const mapped = code ? PARTNER_TYPE_RESULT_COPY[code] : null;

  const fallbackFeedback = '?대뵒媛 ?섎릱怨??대뵒瑜?蹂댁셿?섎㈃ 醫뗭쓣吏 ?뺥솗?섍쾶 吏싳뼱以섏슂.';
  const fallbackAction = '臾댁뾿???몄젣源뚯? ?섎㈃ 醫뗭쓣吏 怨꾪쉷?쇰줈 ?뺣━?댁쨾??';

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
  return '?숈뒿 諛⑹떇???ㅻⅨ ?깆옣 ?뚰듃??;
}

function normalizePartnerQuote(text) {
  const value = String(text || '').trim();
  return value.replace(/^\s*["']+/, '').replace(/["']+\s*$/, '').trim();
}

function showPersonalityResult(type) {
  const partner = (type && typeof type === 'object') ? type : null;
  if (!partner || !partner.type_code) {
    const descEl = document.getElementById('personalityDesc');
    if (descEl) descEl.textContent = '?좏삎 ?뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?댁슂. ?ㅼ떆 吏꾨떒??二쇱꽭??';
    return;
  }

  const iconEl = document.getElementById('personalityIcon');
  const titleEl = document.getElementById('personalityTitle');
  const descEl = document.getElementById('personalityDesc');
  const cardEl = document.getElementById('personalityCard');

  // ?곷떒 湲곕낯 ?ㅻ뜑(湲곗〈 DOM)??鍮꾩썙?먭퀬, 移대뱶 ?대??먯꽌 寃곌낵 ?ㅻ뜑/??낆쓣 ?쇨??섍쾶 ?뚮뜑留곹븳??
  if (iconEl) iconEl.textContent = '';
  if (titleEl) titleEl.textContent = '';

  const partnerCopy = getPartnerResultCopy(partner);
  const feedbackStyle = partnerCopy.feedback_style;
  const actionStyle = partnerCopy.action_style;
  const encouragingPhraseRaw = String(partner.description?.encouraging_phrase || '異⑸텇???섑븯怨??덉뼱. 吏湲?諛⑹떇?濡???嫄몄쓬??媛蹂댁옄.').trim();
  const encouragingPhrase = normalizePartnerQuote(encouragingPhraseRaw);
  const supportTagRaw = String(partner.axes_raw?.support_tag || '').trim();
  const supportTag = supportTagRaw || '#?깆옣 ?뚰듃?덊삎';
  const learningEnvironmentText = getPartnerLearningEnvironmentText(supportTagRaw);
  const empathyText = getPartnerEmpathyText(partner, supportTagRaw);
  const toneClass = getPartnerToneClass(partner.type_code);

  if (descEl) {
    descEl.innerHTML = `
      <div class="partner-result-shell">
        <div class="partner-result-title">?섏쓽 ?깆옣 ?뚰듃?덈? 李얠븯?댁슂!</div>
        <div class="partner-result-identity">
          <div class="partner-result-identity-card ${toneClass}">
            <span class="partner-result-identity-emoji">${escapeHtml(partner.emoji || '?쭬')}</span>
            <span class="partner-result-identity-name">${escapeHtml(partner.type_name || partner.type_code)}</span>
            <span class="partner-result-tag-badge">${escapeHtml(supportTag)}</span>
            <div class="partner-result-identity-message">${escapeHtml(empathyText)}</div>
          </div>
        </div>
        <div class="partner-result-cards">
          <div class="partner-result-card">
            <div class="partner-result-card-title">?뮠 ?쇰뱶諛??ㅽ???/div>
            <div class="partner-result-card-body">${escapeHtml(feedbackStyle)}</div>
          </div>
          <div class="partner-result-card">
            <div class="partner-result-card-title">?? ?ㅼ쿇 諛⑹떇</div>
            <div class="partner-result-card-body">${escapeHtml(actionStyle)}</div>
          </div>
          <div class="partner-result-card">
            <div class="partner-result-card-title">?뱴 ?숈뒿 ?섍꼍</div>
            <div class="partner-result-card-body">${escapeHtml(learningEnvironmentText)}</div>
          </div>
        </div>
        <div class="partner-result-quote">
          <div class="partner-result-card-title">?뮕 ?대윴 留먯씠 ?섏씠 ?쇱슂</div>
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
          <span class="partner-type-summary-title">?뱦 8媛吏 ?깆옣 ?뚰듃???좏삎</span>
          <span class="partner-type-summary-state" aria-hidden="true"></span>
        </summary>
        <div class="partner-type-list">
    `;
    PARTNER_TYPES.forEach(t => {
      const isMine = t.type_code === partner.type_code;
      const meBadge = isMine ? '<strong class="partner-type-me">(??</strong>' : '';
      html += `
        <div class="partner-type-item${isMine ? ' mine' : ''}">
          <div class="partner-type-main">
            <span class="partner-type-emoji">${escapeHtml(t.emoji || '?쭬')}</span>
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
// ?깆옣 ??쒕낫??湲곕뒫
// ============================================

// ??쒕낫???곗씠??濡쒕뱶
async function loadDashboardData() {
  if (!currentStudent || !currentClassCode) return;

  try {
    const { data: recordRows } = await db.from('daily_reflections')
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('student_id', String(currentStudent.id))
      .order('reflection_date', { ascending: false });
    const allRecords = recordRows || [];

    loadGoals(); // 湲곕줉???놁뼱??紐⑺몴??濡쒕뱶
    const safeRecords = Array.isArray(allRecords) ? allRecords : [];
    renderStreakAndBadges(safeRecords);
    renderLearningWordCloud(safeRecords);
    renderSubjectChart(safeRecords);
    renderGrowthTimeline(safeRecords);
  } catch (error) {
    console.error('??쒕낫??濡쒕뱶 ?ㅻ쪟:', error);
  }
}

// ============================================
// ?섏쓽 紐⑺몴 ?ㅼ젙 & 異붿쟻
// ============================================
function renderGoals(goals) {
  const list = document.getElementById('goalList');
  const progress = document.getElementById('goalProgress');
  if (!goals || goals.length === 0) { list.innerHTML = '<div style="text-align:center;color:var(--text-sub);font-size:0.88rem;padding:10px;">紐⑺몴瑜?異붽??대낫?몄슂! ?렞</div>'; progress.innerHTML = ''; return; }
  const completed = goals.filter(g => g.is_completed).length;
  const total = goals.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  progress.innerHTML = '<div style="display:flex;align-items:center;gap:10px;"><div style="flex:1;background:var(--bg-soft);border-radius:10px;height:10px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,var(--color-blue),var(--color-teal));border-radius:10px;transition:width 0.3s;"></div></div><span style="font-size:0.85rem;font-weight:700;color:var(--color-blue);">' + completed + '/' + total + ' (' + pct + '%)</span></div>';
  list.innerHTML = goals.map(g => {
    const typeLabel = g.goal_type === 'weekly' ? '二쇨컙' : '?붽컙';
    const checkStyle = g.is_completed ? 'text-decoration:line-through;color:var(--text-sub);' : '';
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border);"><button type="button" onclick="toggleGoal(\'' + g.id + '\',' + !g.is_completed + ')" style="width:28px;height:28px;padding:0;border-radius:50%;background:' + (g.is_completed ? 'var(--color-result)' : 'var(--bg-soft)') + ';border:2px solid ' + (g.is_completed ? 'var(--color-result)' : 'var(--border)') + ';color:white;font-size:0.8rem;cursor:pointer;flex-shrink:0;">' + (g.is_completed ? '?? : '') + '</button><span style="flex:1;font-size:0.9rem;' + checkStyle + '">' + escapeHtml(g.goal_text) + '</span><span style="font-size:0.72rem;padding:2px 8px;background:var(--bg-soft);border-radius:10px;color:var(--text-sub);">' + typeLabel + '</span><button type="button" onclick="deleteGoal(\'' + g.id + '\')" style="width:24px;height:24px;padding:0;background:none;border:none;color:var(--text-sub);cursor:pointer;font-size:0.9rem;">횞</button></div>';
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
    goalList.innerHTML = '<p style="text-align:center;color:var(--text-sub);font-size:0.85rem;margin:10px 0;">?깅줉??紐⑺몴媛 ?놁뼱?? ?대쾲 二?紐⑺몴瑜??몄썙蹂댁꽭??</p>';
    goalProgress.innerHTML = '';
    return;
  }

  const completedCount = goals.filter(g => g.is_completed).length;
  const totalCount = goals.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  goalProgress.innerHTML = `
    <div style="margin-bottom:5px;display:flex;justify-content:space-between;font-size:0.85rem;">
      <span>紐⑺몴 ?ъ꽦瑜?/span>
      <span style="font-weight:700;color:var(--color-blue);">${percent}%</span>
    </div>
    <div class="progress-bar-container" style="height:10px;background:rgba(0,0,0,0.05);border-radius:10px;overflow:hidden;">
      <div class="progress-bar-fill" style="width:${percent}%;background:var(--color-blue);height:100%;transition:width 0.3s ease;"></div>
    </div>
  `;

  goalList.innerHTML = goals.map(g => {
    const typeLabel = g.goal_type === 'weekly' ? '二쇨컙' : '?붽컙';
    return `
      <div style="display:flex;align-items:center;padding:10px;background:var(--bg-body);border-radius:10px;margin-bottom:8px;border-left:3px solid ${g.is_completed ? 'var(--color-result)' : 'var(--border)'};">
        <input type="checkbox" ${g.is_completed ? 'checked' : ''} onchange="toggleGoal('${g.id}', this.checked)" style="width:20.ex;height:20.ex;cursor:pointer;margin-right:12px;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
             <span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:var(--border);color:var(--text-sub);">${typeLabel}</span>
             <span style="text-decoration:${g.is_completed ? 'line-through' : 'none'};color:${g.is_completed ? 'var(--text-sub)' : 'var(--text-main)'};font-size:0.95rem;">${escapeHtml(g.goal_text)}</span>
          </div>
        </div>
        <button type="button" onclick="deleteGoal('${g.id}')" style="width:auto;padding:4px;background:transparent;box-shadow:none;color:var(--text-sub);font-size:0.8rem;border:none;">??/button>
      </div>
    `;
  }).join('');
}

// ???곗냽 湲곕줉 ?ㅽ듃由?& 諭껋?
function renderStreakAndBadges(records) {
  // ?곗냽 湲곕줉 ?ㅽ듃由?怨꾩궛
  const dates = records.map(r => r.reflection_date).sort();
  const uniqueDates = [...new Set(dates)];
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
  let streak = 0;
  let checkDate = new Date(today);
  while (true) {
    const ds = checkDate.toISOString().split('T')[0];
    if (uniqueDates.includes(ds)) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
    else if (ds === today) { checkDate.setDate(checkDate.getDate() - 1); } // ?ㅻ뒛 ?꾩쭅 ?덉띁?쇰㈃ ?댁젣遺??泥댄겕
    else break;
  }
  const streakEl = document.getElementById('streakDisplay');
  if (streak > 0) streakEl.innerHTML = '?뵦 ?곗냽 <span style="color:var(--color-rose);font-size:1.6rem;">' + streak + '</span>??湲곕줉 以?';
  else streakEl.innerHTML = '?뱷 ?ㅻ뒛 諛곗? ?명듃瑜??⑤낫?몄슂!';

  // 諭껋? 怨꾩궛
  const totalDays = uniqueDates.length;
  const subjectSet = new Set();
  records.forEach(r => {
    if (r.subject_tags && Array.isArray(r.subject_tags)) r.subject_tags.forEach(t => subjectSet.add(t));
  });
  const badges = [];
  if (totalDays >= 1) badges.push({ icon: '?뙮', label: '泥?湲곕줉', desc: '諛곗? ?명듃 泥??묒꽦' });
  if (totalDays >= 7) badges.push({ icon: '?뙼', label: '7???ъ꽦', desc: '7???댁긽 湲곕줉' });
  if (totalDays >= 30) badges.push({ icon: '?뙰', label: '30???ъ꽦', desc: '30???댁긽 湲곕줉' });
  if (streak >= 3) badges.push({ icon: '?뵦', label: '3???곗냽', desc: '3???곗냽 湲곕줉' });
  if (streak >= 7) badges.push({ icon: '?뭿', label: '7???곗냽', desc: '7???곗냽 湲곕줉' });
  if (subjectSet.size >= 5) badges.push({ icon: '?뱴', label: '?ㅼ옱?ㅻ뒫', desc: '5媛??댁긽 怨쇰ぉ 湲곕줉' });

  const badgeEl = document.getElementById('badgeContainer');
  if (badges.length === 0) { badgeEl.innerHTML = '<span style="color:var(--text-sub);font-size:0.85rem;">湲곕줉???볦쑝硫?諭껋?瑜?諛쏆쓣 ???덉뼱??</span>'; return; }
  badgeEl.innerHTML = badges.map(b => '<div class="badge-item" title="' + b.desc + '"><span style="font-size:1.4rem;">' + b.icon + '</span><span style="font-size:0.72rem;color:var(--text-sub);">' + b.label + '</span></div>').join('');
}



// ??諛곗? ?ㅼ썙???뚮뱶?대씪?곕뱶
function renderLearningWordCloud(records) {
  const container = document.getElementById('learningWordCloud');
  const wordCounts = {};

  records.forEach(r => {
    if (!r.learning_text) return;
    // 媛꾨떒???뺥깭??遺꾩꽍: 2湲???댁긽 ?⑥뼱 異붿텧
    const words = r.learning_text.replace(/[^媛-?즑-zA-Z0-9\s]/g, '').split(/\s+/);
    words.forEach(w => {
      if (w.length >= 2) wordCounts[w] = (wordCounts[w] || 0) + 1;
    });
    // 怨쇰ぉ ?쒓렇???ы븿
    if (r.subject_tags && Array.isArray(r.subject_tags)) {
      r.subject_tags.forEach(tag => { wordCounts[tag] = (wordCounts[tag] || 0) + 2; }); // ?쒓렇??媛以묒튂 2
    }
  });

  const sorted = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">?뱷</span><div class="empty-desc">湲곕줉???볦씠硫??ㅼ썙?쒓? ?섑??섏슂!</div></div>';
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

// ??怨쇰ぉ蹂?湲곕줉 ?잛닔
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
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">?뱴</span><div class="empty-desc">怨쇰ぉ ?쒓렇瑜??좏깮?섎㈃ ?듦퀎媛 ?섑??섏슂!</div></div>';
    return;
  }

  const maxCount = sorted[0][1];
  const barColors = ['#4F84C7', '#5A9E8F', '#9575CD', '#C2654A', '#5E8C61', '#D4A574', '#6C63FF', '#FF6B6B'];

  let html = '';
  sorted.forEach(([subject, count], i) => {
    const pct = Math.round((count / maxCount) * 100);
    const color = barColors[i % barColors.length];
    html += '<div class="subject-bar-item"><div class="subject-bar-label">' + subject + '</div><div class="subject-bar-track"><div class="subject-bar-fill" style="width:' + pct + '%; background:' + color + ';">' + count + '??/div></div></div>';
  });

  container.innerHTML = html;
}

// ??媛먯궗 湲곕줉 ?꾪솴
function renderGratitudeStats(records) {
  const container = document.getElementById('gratitudeChart');
  if (!container) return;

  const totalGratitude = records.filter(r => r.gratitude_text).length;
  const totalLearning = records.filter(r => r.learning_text).length;
  const totalDays = records.length;

  // ?곗냽 湲곕줉 怨꾩궛
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
    '<div class="gratitude-stat-item"><span class="gratitude-stat-number">' + totalDays + '</span><span class="gratitude-stat-label">珥?湲곕줉??/span></div>' +
    '<div class="gratitude-stat-item"><span class="gratitude-stat-number" style="color:var(--color-teacher);">' + totalGratitude + '</span><span class="gratitude-stat-label">媛먯궗 湲곕줉</span></div>' +
    '<div class="gratitude-stat-item"><span class="gratitude-stat-number" style="color:var(--color-blue);">' + totalLearning + '</span><span class="gratitude-stat-label">諛곗? 湲곕줉</span></div>' +
    '<div class="gratitude-stat-item"><span class="gratitude-stat-number" style="color:#FF6B6B;">?뵦' + streak + '</span><span class="gratitude-stat-label">?곗냽 湲곕줉</span></div>' +
    '</div>';
}

// ???깆옣 ??꾨씪??(理쒓렐 10媛?
function renderGrowthTimeline(records) {
  const container = document.getElementById('growthTimeline');
  const recent = records.slice(0, 10);

  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">?뙮</span><div class="empty-desc">湲곕줉???볦씠硫??깆옣 怨쇱젙??蹂댁뿬??</div></div>';
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

// 二쇨컙/?붽컙 AI ?붿빟
function activatePartnerMessageTab(period) {
  document.querySelectorAll('.summary-period-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
}

function extractPartnerGoalSuggestion(markdownText) {
  const raw = String(markdownText || '').replace(/\r/g, '').trim();
  if (!raw) return '';

  const sections = raw.split(/\n(?=##\s+)/).map(s => s.trim()).filter(Boolean);
  let actionZone = '';
  if (sections.length >= 3) actionZone = sections[2].replace(/^##\s.*$/m, '').trim();
  if (!actionZone) actionZone = raw;

  const lines = actionZone
    .split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);

  let picked = lines.find(line => /(다음|실천|계획|실험|도전|기록해보|해보)/.test(line) && line.length >= 8)
    || lines.find(line => line.length >= 8)
    || '';

  picked = picked.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (picked.length > 90) picked = picked.slice(0, 90).replace(/[\s,.!?]+$/g, '');
  return picked;
}

function setPartnerGoalSuggestion(markdownText) {
  latestPartnerGoalSuggestion = extractPartnerGoalSuggestion(markdownText);

  const goalBtn = document.getElementById('partnerMessageGoalBtn');
  const goalHint = document.getElementById('partnerMessageGoalHint');
  if (!goalBtn || !goalHint) return;

  if (latestPartnerGoalSuggestion) {
    goalBtn.disabled = false;
    goalHint.textContent = '추천 실천: ' + latestPartnerGoalSuggestion;
  } else {
    goalBtn.disabled = true;
    goalHint.textContent = 'AI 메시지에서 실천 제안을 찾으면 바로 목표로 저장할 수 있어요.';
  }
}

async function applyPartnerMessageGoal() {
  const goalHint = document.getElementById('partnerMessageGoalHint');
  const goalBtn = document.getElementById('partnerMessageGoalBtn');

  if (!latestPartnerGoalSuggestion) {
    if (goalHint) goalHint.textContent = '먼저 AI 메시지를 받아보세요.';
    return;
  }

  if (isDemoMode) { showDemoBlockModal(); return; }
  if (!currentStudent || !currentClassCode) return;

  try {
    await db.from('student_goals').insert({
      class_code: currentClassCode,
      student_id: String(currentStudent.id),
      goal_text: latestPartnerGoalSuggestion,
      goal_type: 'weekly'
    });

    await loadGoals();
    if (goalHint) goalHint.textContent = '실천 목표로 저장했어요. 진행률에서 바로 확인해보세요.';
    if (goalBtn) goalBtn.disabled = true;
    latestPartnerGoalSuggestion = '';
  } catch (error) {
    console.error('applyPartnerMessageGoal error:', error);
    if (goalHint) goalHint.textContent = '목표 저장 중 오류가 발생했어요. 다시 시도해 주세요.';
  }
}

async function generatePartnerMessage(period = 'week') {
  if (!currentStudent || !currentClassCode) return;
  activatePartnerMessageTab(period);

  if (period === 'all') {
    await generateGrowthReport({
      targetAreaId: 'summaryReportArea',
      triggerButtonId: null,
      restoreLabel: '🧭 성장 파트너의 전체 분석 받기',
      unified: true
    });
    return;
  }

  await generateSummaryReport(period, {
    targetAreaId: 'summaryReportArea',
    unified: true
  });
}

// 주간/월간 AI 요약
async function generateSummaryReport(period, options = {}) {
  if (!currentStudent || !currentClassCode) return;

  if (!options.unified) activatePartnerMessageTab(period);

  const area = document.getElementById(options.targetAreaId || 'summaryReportArea');
  if (!area) return;

  area.innerHTML = '<div class="ai-report-loading">💬 성장 파트너가 메시지를 정리하고 있어요...</div>';

  const kr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const endDate = kr.toISOString().split('T')[0];
  const startDate = new Date(kr);
  startDate.setDate(startDate.getDate() - (period === 'week' ? 7 : 30));
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

    let records = (dailyRes.status === 'fulfilled' && dailyRes.value && Array.isArray(dailyRes.value.data)) ? dailyRes.value.data : [];
    let projects = (projectRes.status === 'fulfilled' && projectRes.value && Array.isArray(projectRes.value.data)) ? projectRes.value.data : [];
    let goals = (goalsRes.status === 'fulfilled' && goalsRes.value && Array.isArray(goalsRes.value.data)) ? goalsRes.value.data : [];

    if (records.length === 0 && projects.length === 0 && goals.length === 0) {
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span><div class="empty-desc">이 기간에 기록이 없어요. 먼저 배움 노트/프로젝트/목표를 남겨보세요.</div></div>';
      setPartnerGoalSuggestion('');
      return;
    }

    const clip = (s, maxLen) => {
      if (!s) return '';
      const t = String(s).replace(/\s+/g, ' ').trim();
      return t.length > maxLen ? (t.slice(0, maxLen) + '...') : t;
    };

    const report_kind = period === 'week' ? 'summary_week' : 'summary_month';
    const date_range = startStr + ' ~ ' + endDate;

    const dailySample = records.slice(-10).map(r => ({
      date: r.reflection_date,
      learning_text: clip(r.learning_text, 220) || null,
      gratitude_text: clip(r.gratitude_text, 120) || null,
      subject_tags: Array.isArray(r.subject_tags) ? r.subject_tags : [],
      gratitude_tags: Array.isArray(r.gratitude_tags) ? r.gratitude_tags : []
    }));

    const projectSample = projects.slice(0, 5).map(p => ({
      date: p.reflection_date,
      project_name: p.project_name || '',
      stars: (typeof p.star_rating === 'number' && p.star_rating >= 1 && p.star_rating <= 5) ? p.star_rating : null,
      comment: clip(p.comment, 180) || null
    }));

    const goalsSnapshot = goals.slice(0, 8).map(g => ({
      goal: g.goal_text || '',
      status: g.is_completed ? 'done' : 'ongoing',
      created_at: String(g.created_at || '').slice(0, 10) || null,
      completed_at: g.completed_at ? String(g.completed_at).slice(0, 10) : null
    }));

    const inputObj = {
      student_partner: partner ? {
        type_code: partner.type_code,
        type_name: partner.type_name,
        axes: partner.axes || null,
        axes_raw: partner.axes_raw || null,
        style_guide: partner.style_guide || null
      } : null,
      self_context: {
        report_kind,
        date_range,
        record_counts: {
          daily_reflections: records.length,
          project_reflections: projects.length,
          goals: goals.length
        },
        daily_reflections_sample: dailySample,
        project_reflections_sample: projectSample,
        goals_snapshot: goalsSnapshot
      }
    };

    const header1 = '한눈에 보는 이번 기록';
    const header2 = (partner && partner.axes_raw && partner.axes_raw.info_processing === '디테일형')
      ? '반복되는 패턴(강점/관심사/근거)'
      : '반복되는 패턴(강점/관심사/변화)';
    const header3 = getExecutionStrategyHeader(partner);

    const prompt = [
      '[ROLE]',
      "너는 '배움로그'의 AI 성장 파트너다.",
      "학생에게 1:1로 말하는 톤으로, 반말은 쓰지 않되 딱딱하지 않은 친근한 존댓말(해요체)을 사용한다.",
      "교사가 아니라 '옆에서 같이 고민해주는 파트너' 느낌으로 작성한다.",
      "학생의 '성장 파트너 유형(8유형 + 보조태그)'에 맞춰, 학생이 남긴 배움 기록(배움 노트/프로젝트/목표 등)을 분석해",
      '스스로배움 결과보기(성장 파트너의 메시지/성장 파트너의 전체 분석) 카드에 들어갈 결과를 작성한다.',
      '',
      '[INPUT]',
      JSON.stringify(inputObj, null, 2),
      '',
      '[8 TYPE LIBRARY]',
      buildPartnerTypeLibraryText(),
      '',
      '[OUTPUT: 카드 UI 최적화 / 마크다운만]',
      '- 헤더는 3개로 고정(단, 성향에 맞게 제목 단어는 조절 가능)',
      '## ' + header1,
      '## ' + header2,
      '## ' + header3,
      '',
      '[작성 규칙]',
      '1) 인사말 없이 바로 시작.',
      '2) 데이터가 많아도 핵심만 뽑아 카드에서 읽기 쉽게 작성.',
      '3) report_kind가 summary_week/month일 때: 하이라이트 + 반복 패턴 + 다음 실천 1~2개.',
      '4) 스스로배움 맥락: 기록이 짧거나 부족해도 비판하지 말고, "이걸 기록한 것 자체가 성장이야"처럼 기록 행위를 인정한 뒤 다음 단계를 제안.',
      '5) 학생 성향 반영(필수: student_partner의 3개 축을 모두 조합 적용):',
      '   [코칭 스타일 축 - 전체 톤 결정]',
      '   - 해결형: 직설적으로 짚어주고 구체 행동 제안',
      '   - 지지형: 공감/격려 한 줄 먼저 + 부드럽게 행동 제안',
      '   [정보 처리 축 - 피드백 구조 결정]',
      '   - 디테일형: 항목별 근거 + 단계/체크리스트(최대 3)',
      '   - 큰그림형: 전체 흐름 요약 + 방향 1문장 + 스스로 질문 2개',
      '   [실행 전략 축 - 실천 제안 형태 결정]',
      '   - 계획형: 일정/우선순위 포함',
      '   - 탐색형: 작은 실험 1개 제안',
      '   [보조태그 - 실천 활동 종류 결정]',
      '   - #함께 성장형: 협력 활동 포함',
      '   - #혼자 집중형: 개인 활동 포함',
      '6) 해당 유형의 "이런 말이 힘이 돼요" 예시를 참고해 비슷한 톤으로 작성.',
      '7) summary_week/month 길이: 10~16문장(또는 6~10불릿).',
      '8) 한국어로만 작성.',
      ''
    ].join('\n');

    const result = await callGemini(prompt, { generationConfig: { temperature: 0.5, maxOutputTokens: 900 } });

    if (result.ok) {
      area.innerHTML = renderReportMarkdownAsCards(result.text);
      setPartnerGoalSuggestion(result.text);
    } else {
      const periodLabel = period === 'week' ? '이번 주' : '이번 달';
      area.innerHTML = '<div class="ai-report-fallback">' + periodLabel + ' 기록이 차곡차곡 쌓였어요. 다음에는 한 가지 실천만 더 붙여보자!</div>';
      setPartnerGoalSuggestion('');
    }
  } catch (error) {
    area.innerHTML = '<div class="ai-report-error">메시지 생성 중 오류가 발생했어요.</div>';
    setPartnerGoalSuggestion('');
  }
}

// AI 성장 리포트(전체)
async function generateGrowthReport(options = {}) {
  if (!currentStudent || !currentClassCode) return;

  const area = document.getElementById(options.targetAreaId || 'growthReportArea');
  if (!area) return;

  const btn = options.triggerButtonId ? document.getElementById(options.triggerButtonId) : document.getElementById('growthReportBtn');
  const hasBtn = !!btn;
  const restoreLabel = options.restoreLabel || '🧭 성장 파트너의 전체 분석 받기';

  if (hasBtn) setLoading(true, btn, '🧭 분석 중...');
  area.innerHTML = '<div class="ai-report-loading">전체 기록을 분석하고 있어요...</div>';

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

    let records = (dailyRes.status === 'fulfilled' && dailyRes.value && Array.isArray(dailyRes.value.data)) ? dailyRes.value.data : [];
    let projects = (projectRes.status === 'fulfilled' && projectRes.value && Array.isArray(projectRes.value.data)) ? projectRes.value.data : [];
    let goals = (goalsRes.status === 'fulfilled' && goalsRes.value && Array.isArray(goalsRes.value.data)) ? goalsRes.value.data : [];

    if (records.length < 3 && projects.length === 0 && goals.length === 0) {
      if (hasBtn) setLoading(false, btn, restoreLabel);
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">📝</span><div class="empty-desc">최소 3일 이상 기록하면 전체 분석을 받을 수 있어요.</div></div>';
      setPartnerGoalSuggestion('');
      return;
    }

    const clip = (s, maxLen) => {
      if (!s) return '';
      const t = String(s).replace(/\s+/g, ' ').trim();
      return t.length > maxLen ? (t.slice(0, maxLen) + '...') : t;
    };

    const firstDate = records.length ? records[0].reflection_date : null;
    const lastDate = records.length ? records[records.length - 1].reflection_date : null;
    const date_range = (firstDate && lastDate) ? (firstDate + ' ~ ' + lastDate) : (getDefaultQueryDate() + ' ~ ' + getDefaultQueryDate());

    const dailySampleRaw = (records.length <= 10) ? records : records.slice(0, 3).concat(records.slice(-7));
    const dailySample = dailySampleRaw.map(r => ({
      date: r.reflection_date,
      learning_text: clip(r.learning_text, 220) || null,
      gratitude_text: clip(r.gratitude_text, 120) || null,
      subject_tags: Array.isArray(r.subject_tags) ? r.subject_tags : [],
      gratitude_tags: Array.isArray(r.gratitude_tags) ? r.gratitude_tags : []
    }));

    const projectSample = projects.slice(0, 5).map(p => ({
      date: p.reflection_date,
      project_name: p.project_name || '',
      stars: (typeof p.star_rating === 'number' && p.star_rating >= 1 && p.star_rating <= 5) ? p.star_rating : null,
      comment: clip(p.comment, 180) || null
    }));

    const goalsSnapshot = goals.slice(0, 8).map(g => ({
      goal: g.goal_text || '',
      status: g.is_completed ? 'done' : 'ongoing',
      created_at: String(g.created_at || '').slice(0, 10) || null,
      completed_at: g.completed_at ? String(g.completed_at).slice(0, 10) : null
    }));

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
        daily_reflections_sample: dailySample,
        project_reflections_sample: projectSample,
        goals_snapshot: goalsSnapshot
      }
    };

    const header1 = (partner && partner.axes_raw && partner.axes_raw.coaching_style === '해결형') ? '한눈에 보는 전체 기록(핵심)' : '한눈에 보는 전체 기록';
    const header2 = (partner && partner.axes_raw && partner.axes_raw.info_processing === '디테일형') ? '반복되는 패턴(강점/관심사/근거)' : '반복되는 패턴(강점/관심사/변화)';
    const header3 = getExecutionStrategyHeader(partner);

    const prompt = [
      '[ROLE]',
      "너는 '배움로그'의 AI 성장 파트너다.",
      "학생에게 1:1로 말하는 톤으로, 반말은 쓰지 않되 딱딱하지 않은 친근한 존댓말(해요체)을 사용한다.",
      "교사가 아니라 '옆에서 같이 고민해주는 파트너' 느낌으로 작성한다.",
      "학생의 '성장 파트너 유형(8유형 + 보조태그)'에 맞춰, 학생이 남긴 배움 기록(배움 노트/프로젝트/목표 등)을 분석해",
      '스스로배움 결과보기(성장 파트너의 메시지/성장 파트너의 전체 분석) 카드에 들어갈 결과를 작성한다.',
      '',
      '[INPUT]',
      JSON.stringify(inputObj, null, 2),
      '',
      '[8 TYPE LIBRARY]',
      buildPartnerTypeLibraryText(),
      '',
      '[OUTPUT: 카드 UI 최적화 / 마크다운만]',
      '- 헤더는 3개로 고정(단, 성향에 맞게 제목 단어는 조절 가능)',
      '## ' + header1,
      '## ' + header2,
      '## ' + header3,
      '',
      '[작성 규칙]',
      '1) 인사말 없이 바로 시작.',
      '2) 핵심만 추려 카드에서 읽기 쉽게 작성.',
      '3) report_kind가 growth_all일 때: 초기 vs 최근 변화 + 누적 강점 + 다음 실천.',
      '4) 스스로배움 맥락: 기록이 짧거나 부족해도 비판하지 말고, "이걸 기록한 것 자체가 성장이야"처럼 기록 행위를 인정한 뒤 다음 단계를 제안.',
      '5) 학생 성향 반영(필수: student_partner의 3개 축을 모두 조합 적용):',
      '   [코칭 스타일 축 - 전체 톤 결정]',
      '   - 해결형: 직설적으로 짚어주고 구체 행동 제안',
      '   - 지지형: 공감/격려 한 줄 먼저 + 부드럽게 행동 제안',
      '   [정보 처리 축 - 피드백 구조 결정]',
      '   - 디테일형: 항목별 근거 + 단계/체크리스트(최대 3)',
      '   - 큰그림형: 전체 흐름 요약 + 방향 1문장 + 스스로 질문 2개',
      '   [실행 전략 축 - 실천 제안 형태 결정]',
      '   - 계획형: 일정/우선순위 포함',
      '   - 탐색형: 작은 실험 1개 제안',
      '   [보조태그 - 실천 활동 종류 결정]',
      '   - #함께 성장형: 협력 활동 포함',
      '   - #혼자 집중형: 개인 활동 포함',
      '6) 해당 유형의 "이런 말이 힘이 돼요" 예시를 참고해 비슷한 톤으로 작성.',
      '7) growth_all 길이: 12~20문장(또는 8~12불릿).',
      '8) 한국어로만 작성.',
      ''
    ].join('\n');

    const result = await callGemini(prompt, { generationConfig: { temperature: 0.5, maxOutputTokens: 1100 } });

    if (hasBtn) setLoading(false, btn, restoreLabel);

    if (result.ok) {
      area.innerHTML = renderReportMarkdownAsCards(result.text);
      setPartnerGoalSuggestion(result.text);
    } else {
      area.innerHTML = '<div class="ai-report-fallback">기록이 쌓인 만큼 성장도 쌓였어요. 다음에는 한 가지 실천을 정해 더 선명하게 만들어보자!</div>';
      setPartnerGoalSuggestion('');
    }
  } catch (error) {
    if (hasBtn) setLoading(false, btn, restoreLabel);
    area.innerHTML = '<div class="ai-report-error">분석 생성 중 오류가 발생했어요.</div>';
    setPartnerGoalSuggestion('');
  }
}
checkAuthAndRoute();

// ============================================
// ?쎄?/媛쒖씤?뺣낫泥섎━諛⑹묠 ?곗씠??諛?紐⑤떖 ?⑥닔
// ============================================

const TERMS_HTML = `
<div class="terms-content">
  <div class="terms-section">
    <h3 class="terms-article">??議?(紐⑹쟻)</h3>
    <p>蹂??쎄?? 源?꾪쁽(?댄븯 "?댁쁺??)???쒓났?섎뒗 諛곗?濡쒓렇(BaeumLog) ?쒕퉬?ㅼ쓽 ?댁슜怨?愿?⑦븯??沅뚮━, ?섎Т 諛?梨낆엫?ы빆??洹쒖젙?⑥쓣 紐⑹쟻?쇰줈 ?⑸땲??</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">??議?(?쒕퉬???댁슜)</h3>
    <p>諛곗?濡쒓렇(BaeumLog)???숈뒿 湲곕줉 諛??숇즺 ?됯? 湲곕컲 ?깆옣 愿由??쒕퉬?ㅼ엯?덈떎.</p>
    <ul class="terms-list">
      <li>Google 怨꾩젙 濡쒓렇??/li>
      <li>?숇즺 ?됯? 諛??쇰뱶諛?/li>
      <li>諛곗? ?명듃 諛??꾨줈?앺듃 湲곕줉</li>
      <li>AI 湲곕컲 ?붿빟 諛??쇰뱶諛?/li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">??議?(?뚯썝媛??諛??댁슜?먭꺽)</h3>
    <ol class="terms-list-num">
      <li>Google 怨꾩젙??蹂댁쑀???꾧뎄???댁슜?????덉뒿?덈떎.</li>
      <li>?뚯썝媛?낆? Google ?몄쬆???듯빐 ?먮룞 泥섎━?⑸땲??</li>
      <li>?덉쐞 ?뺣낫 ?깅줉 ???댁슜???쒗븳?????덉뒿?덈떎.</li>
    </ol>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">??議?(?댁슜?먯쓽 ?섎Т)</h3>
    <ul class="terms-list">
      <li>??몄쓽 怨꾩젙 ?꾩슜 湲덉?</li>
      <li>遺?곸젅??肄섑뀗痢??묒꽦 湲덉?</li>
      <li>?쒕퉬???댁쁺 諛⑺빐 湲덉?</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">??議?(?쒕퉬??蹂寃?諛?以묐떒)</h3>
    <p>?댁쁺?먮뒗 ?쒕퉬??媛쒖꽑???꾪빐 湲곕뒫??蹂寃쏀븯嫄곕굹 以묐떒?????덉뒿?덈떎.</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">??議?(梨낆엫 ?쒗븳)</h3>
    <p>蹂??쒕퉬?ㅻ뒗 援먯쑁 吏??紐⑹쟻???꾧뎄濡? ?숈뒿 ?깃낵?????踰뺤쟻 梨낆엫??吏吏 ?딆뒿?덈떎.</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">??議?(遺꾩웳 ?닿껐)</h3>
    <p>蹂??쎄?怨?愿?⑤맂 遺꾩웳? ??쒕?援?踰뺤쓣 ?곕쫭?덈떎.</p>
  </div>

  <div class="terms-section terms-appendix">
    <h3 class="terms-article">遺移?/h3>
    <p>蹂??쎄?? 2026??2??8?쇰????쒗뻾?⑸땲??</p>
  </div>
</div>
`;

const PRIVACY_HTML = `
<div class="terms-content">
  <div class="terms-section">
    <h3 class="terms-article">1. 媛쒖씤?뺣낫 泥섎━ 紐⑹쟻</h3>
    <p>諛곗?濡쒓렇(BaeumLog)???ㅼ쓬 紐⑹쟻???꾪빐 媛쒖씤?뺣낫瑜?泥섎━?⑸땲??</p>
    <ul class="terms-list">
      <li>?ъ슜???몄쬆 諛??쒕퉬???쒓났</li>
      <li>?숆툒 諛??숈뒿 ?쒕룞 愿由?/li>
      <li>?됯? 諛?湲곕줉 ?곗씠??愿由?/li>
      <li>AI 湲곕컲 ?쇰뱶諛??쒓났</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">2. 泥섎━?섎뒗 媛쒖씤?뺣낫 ??ぉ</h3>
    <span class="terms-badge">?꾩닔</span>
    <ul class="terms-list">
      <li>Supabase ?ъ슜??ID</li>
      <li>Google 怨꾩젙 ?대찓??/li>
      <li>??븷(援먯궗/?숈깮)</li>
      <li>?숆툒 肄붾뱶 諛??숆툒紐?/li>
      <li>?숈깮踰덊샇 ?먮뒗 紐⑤몺踰덊샇</li>
      <li>?쒕퉬???댁슜 以??앹꽦?섎뒗 ?곗씠???됯? ?댁슜, 諛곗? ?명듃, 硫붿떆吏, ?깊뼢 吏꾨떒, ?꾨줈?앺듃 湲곕줉 ??</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">3. 媛쒖씤?뺣낫 蹂닿? 湲곌컙</h3>
    <ul class="terms-list">
      <li>?뚯썝 ?덊눜 ?쒓퉴吏 蹂닿?</li>
      <li>踰뺣졊???곕Ⅸ 蹂닿? ?꾩슂 ???대떦 湲곌컙 蹂닿?</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">4. ?몃? ?꾩넚(????泥섎━)</h3>
    <p>AI ?쇰뱶諛??붿빟 湲곕뒫 ?쒓났???꾪빐 ?ъ슜?먭? ?낅젰???띿뒪???곗씠?곌? Google Gemini API濡??꾩넚?섏뼱 泥섎━?????덉뒿?덈떎.</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">5. ?덉쟾???뺣낫議곗튂</h3>
    <ul class="terms-list">
      <li>HTTPS 湲곕컲 ?뷀샇???듭떊</li>
      <li>Supabase ?몄쬆 ?쒖뒪???ъ슜</li>
      <li>?묎렐 沅뚰븳 理쒖냼??/li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">6. ?댁슜?먯쓽 沅뚮━</h3>
    <p>?댁슜?먮뒗 媛쒖씤?뺣낫 ?대엺/?뺤젙/??젣/泥섎━?뺤? ?붿껌???????덉뒿?덈떎.</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">7. 媛쒖씤?뺣낫 蹂댄샇梨낆엫??/h3>
    <ul class="terms-list terms-list-plain">
      <li><strong>?깅챸:</strong> 源?꾪쁽</li>
      <li><strong>?대찓??</strong> dohyun851208@gmail.com</li>
    </ul>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">8. 怨좎? ?섎Т</h3>
    <p>蹂?諛⑹묠? 蹂寃????쒕퉬????怨듭?瑜??듯빐 ?덈궡?⑸땲??</p>
  </div>

  <div class="terms-section terms-appendix">
    <h3 class="terms-article">遺移?/h3>
    <p>蹂?諛⑹묠? 2026??2??8?쇰????쒗뻾?⑸땲??</p>
  </div>
</div>
`;

function openTermsModal() {
  showModal({
    type: 'alert',
    icon: '?뱶',
    title: '諛곗?濡쒓렇 ?댁슜?쎄?',
    message: `<div class="terms-modal-body">${TERMS_HTML}</div>`
  });
}

function openPrivacyModal() {
  showModal({
    type: 'alert',
    icon: '?뵍',
    title: '諛곗?濡쒓렇 媛쒖씤?뺣낫泥섎━諛⑹묠',
    message: `<div class="terms-modal-body">${PRIVACY_HTML}</div>`
  });
}








































