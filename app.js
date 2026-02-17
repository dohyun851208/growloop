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
let studentGroupMappingState = null;

const partnerMessageState = {
  mode: 'daily',
  records: [],
  selectTarget: 'A',
  selectedDateA: null,
  selectedDateB: null,
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  compareHint: ''
};
const dashboardHistoryState = {
  records: [],
  selectedSubject: null,
  selectedDate: null,
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1
};

// 교사용(스스로배움) - 교과세특 생성 상태
let teacherDiarySelectedStudentId = null;
let currentTeacherDiarySubTab = 'overview'; // overview | student | hint | comment
let currentTeacherManageSubTab = 'class'; // class | partner
let currentTeacherPartnerSubTab = 'reference'; // reference | individual
let teacherPartnerIndividualRows = [];
let teacherPartnerSelectedStudentNumber = '';
let teacherSubjectCommentSemester = 1;
let teacherSubjectCommentSelectedSubject = '';
let teacherSubjectCommentLastGenerated = null; // { mode, text, noteCount, key, items[] }
let teacherSubjectCommentSettingsSaveTimer = null;
let teacherSubjectCommentLastSettings = null; // cached class settings
const TEACHER_SUBJECT_COMMENT_ALL_STUDENTS = '__ALL_STUDENTS__';
const TEACHER_SUBJECT_COMMENT_SEMESTER_DEFAULTS = {
  1: { start: '2026-03-01', end: '2026-08-31' },
  2: { start: '2026-09-01', end: '2027-02-28' }
};
const THINK_KEYWORDS = [
  '왜', '어려', '헷갈', '몰랐', '틀렸', '틀린',
  '다시', '고민', '깨달', '알게', '이해가',
  '처음에', '그런데', '결국', '바꿔', '수정'
];
const DASHBOARD_SIGNAL_WINDOW_DAYS = 14;
const DASHBOARD_EFFORT_KEYWORDS = [
  '노력', '연습', '꾸준', '반복', '계속', '끝까지',
  '실천', '적용', '시도', '재시도', '복습', '점검',
  '다음', '목표', '체크', '루틴', '습관', '집중',
  '인내', '다짐', '성실', '매일', '분석', '준비'
];
const DASHBOARD_INFO_DETAIL_KEYWORDS = ['근거', '세부', '정확', '단계', '순서', '기준', '오류', '수정', '비교', '분석', '검토'];
const DASHBOARD_INFO_BIG_PICTURE_KEYWORDS = ['전체', '큰 그림', '흐름', '맥락', '요약', '핵심', '패턴', '연결', '관점', '방향'];
const DASHBOARD_EXEC_PLAN_KEYWORDS = ['계획', '목표', '순서', '점검', '체크', '루틴', '복습', '준비', '실행'];
const DASHBOARD_EXEC_EXPLORE_KEYWORDS = ['탐색', '시도', '실험', '질문', '발견', '도전', '확장', '새로운', '다르게'];
const DASHBOARD_SUPPORT_COLLAB_TAGS = ['모둠활동', '토론', '발표'];
const DASHBOARD_SUPPORT_TOGETHER_TEXT_KEYWORDS = ['함께', '친구', '모둠', '토론', '발표', '협력', '의견', '역할', '같이', '의논', '도움', '서로', '팀', '협업'];
const DASHBOARD_SUPPORT_SOLO_TEXT_KEYWORDS = ['혼자', '스스로', '개별', '집중', '자습', '혼자서', '개인', '자기주도'];
const DASHBOARD_SUPPORT_SOLO_TAGS = ['개별활동', '자습'];
const TOPIC_TOKEN_STOPWORDS = new Set([
  '수업', '학습', '내용', '오늘', '이번', '저번', '활동', '과정', '결과', '부분',
  '시간', '경우', '생각', '느낌', '기록', '정리', '했다', '했음', '했다가', '했는데',
  '있다', '없다', '같다', '통해', '대한', '위해', '그리고', '또한', '그러나', '그래서'
]);
const SAME_TOPIC_TOKEN_OVERLAP_MIN = 4;

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
let lastKnownPersonalityType = null; // legacy personality_type compatibility cache

// 체험 모드 전역 변수
let isDemoMode = false;
let demoRole = null;
const DEMO_FIXED_QUERY_DATE = '2026-03-01';
const DEMO_PERSONALITY_STORAGE_KEY = 'demo_student_personality_v2';
const DEMO_PERSONALITY_STORAGE_KEY_LEGACY = 'demo_student_personality_v1';
const DEMO_TEACHER_GROUP_MAPPING_STORAGE_KEY = 'demo_teacher_group_mapping_v1';
const LOGIN_ROLE_HINT_KEY = 'baeumlog_pending_role';
let demoStudentOneDbLoaded = false;

function normalizeRoleHint(value) {
  return (value === 'student' || value === 'teacher') ? value : null;
}

function readPendingLoginRoleHint() {
  try {
    return normalizeRoleHint(sessionStorage.getItem(LOGIN_ROLE_HINT_KEY));
  } catch (error) {
    return null;
  }
}

function clearPendingLoginRoleHint() {
  try { sessionStorage.removeItem(LOGIN_ROLE_HINT_KEY); } catch (error) { }
}

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

function loadDemoTeacherGroupMappingFromStorage() {
  try {
    const raw = sessionStorage.getItem(DEMO_TEACHER_GROUP_MAPPING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (_) {
    return {};
  }
}

function isDemoStudentOne() {
  return isDemoMode && demoRole === 'student' && String(currentStudent?.id || '') === '1';
}

async function loadDemoPersonalityWithStudentOneDbPriority() {
  if (isDemoStudentOne()) {
    if (!demoStudentOneDbLoaded || !studentPersonality) {
      const fromDb = await loadStudentPersonality();
      demoStudentOneDbLoaded = true;
      if (fromDb) return fromDb;
    } else {
      return studentPersonality;
    }
  }

  return loadDemoPersonalityFromStorage();
}

function saveDemoTeacherGroupMappingToStorage(mapping) {
  try {
    const payload = (mapping && typeof mapping === 'object') ? mapping : {};
    sessionStorage.setItem(DEMO_TEACHER_GROUP_MAPPING_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) { }
}

function getKstTodayStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return kst.toISOString().split('T')[0];
}

function getDefaultQueryDate() {
  return isDemoMode ? DEMO_FIXED_QUERY_DATE : getKstTodayStr();
}

function isAbortLikeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (error?.name === 'AbortError')
    || msg.includes('aborted')
    || msg.includes('signal is aborted');
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

function parseOptionalPositiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function getStudentNumber() {
  if (!currentStudent) return '';
  if (currentStudent.studentNumber !== undefined && currentStudent.studentNumber !== null) return String(currentStudent.studentNumber);
  if (currentStudent.id !== undefined && currentStudent.id !== null) return String(currentStudent.id);
  return '';
}

function getGroupNumber() {
  if (!currentStudent) return '';
  if (currentStudent.groupNumber === undefined || currentStudent.groupNumber === null || currentStudent.groupNumber === '') return '';
  return String(currentStudent.groupNumber);
}

function getActivePeerId(typeOverride = null) {
  if (!currentStudent) return '';
  const type = typeOverride || currentStudent.type || 'individual';
  if (type === 'group') return getGroupNumber();
  return getStudentNumber();
}

function syncPeerTypeRadios(type) {
  const radios = document.getElementsByName('evalTypeDisplay');
  const resultRadios = document.getElementsByName('resultEvalTypeDisplay');
  radios.forEach(r => r.checked = (r.value === type));
  resultRadios.forEach(r => r.checked = (r.value === type));
}

function syncPeerReviewerUi() {
  const type = currentStudent ? (currentStudent.type || 'individual') : 'individual';
  const reviewerId = getActivePeerId(type);
  const label = document.getElementById('submitReviewerLabel');
  if (label) label.textContent = type === 'group' ? '나의 모둠' : '나의 번호';
  const reviewerInput = document.getElementById('reviewerId');
  if (reviewerInput) reviewerInput.value = reviewerId;
}

async function ensureGroupAssignedOrBlock({ showAlert = true, persistFallback = false } = {}) {
  if (!currentStudent || currentStudent.type !== 'group') return true;
  const groupNumber = getGroupNumber();
  if (groupNumber) return true;

  currentStudent.type = 'individual';
  syncPeerTypeRadios('individual');
  syncPeerReviewerUi();

  if (persistFallback) {
    try {
      const { data: { user } } = await db.auth.getUser();
      if (user) {
        await db.from('user_profiles')
          .update({ student_type: 'individual' })
          .eq('google_uid', user.id);
      }
    } catch (syncErr) {
      console.warn('student_type fallback sync failed:', syncErr);
    }
  }

  if (showAlert) {
    showModal({
      type: 'alert',
      icon: '🔒',
      title: '모둠 미배정',
      message: '선생님이 모둠을 배정하기 전입니다.<br>모둠 평가를 사용할 수 없습니다.<br>지금은 개인평가로 전환됩니다.'
    });
  }
  return false;
}


// ============================================
// 구글 인증 및 라우팅 (New)
// ============================================

// 페이지 로드 시 인증 및 역할 확인
async function checkAuthAndRoute(retryCount = 0) {
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
      const hasRoleHint = !!normalizeRoleHint(urlParams.get('role')) || !!readPendingLoginRoleHint();

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
    const roleFromUrl = normalizeRoleHint(urlParams.get('role'));
    const pendingRoleHint = readPendingLoginRoleHint();
    const roleHint = roleFromUrl || pendingRoleHint;

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

    if (roleHint) {
      const byUidWithRole = await findProfileBy('google_uid', session.user.id, roleHint);
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

    if (!profile && roleHint) {
      const byEmailWithRole = await findProfileBy('google_email', session.user.email, roleHint);
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
      if (!roleHint) {
        showRoleSelectInApp();
        return;
      }

      document.getElementById('authLoadingSection').classList.add('hidden');

      if (roleHint === 'student') {
        setAppLayoutMode('student');
        document.getElementById('studentOnboardingSection').classList.remove('hidden');
      } else {
        setAppLayoutMode('teacher');
        document.getElementById('teacherOnboardingSection').classList.remove('hidden');
      }
      clearPendingLoginRoleHint();
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

    if (profile.role && roleHint !== profile.role) {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.set('role', profile.role);
      window.history.replaceState({}, '', 'app.html?' + nextParams.toString());
    }
    clearPendingLoginRoleHint();
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
      const studentNumber = String(profile.student_number || '').trim();
      const rawStudentType = profile.student_type === 'group' ? 'group' : 'individual';
      const normalizedGroupNumber = parseOptionalPositiveInt(profile.group_number);
      const isLegacyGroupAccount = rawStudentType === 'group' && !normalizedGroupNumber;
      currentStudent = {
        id: studentNumber,
        studentNumber,
        groupNumber: isLegacyGroupAccount
          ? studentNumber
          : (normalizedGroupNumber ? String(normalizedGroupNumber) : ''),
        type: rawStudentType,
        name: profile.student_number,
        isLegacyGroupAccount
      };

      if (currentStudent.type === 'group' && !getGroupNumber() && !currentStudent.isLegacyGroupAccount) {
        currentStudent.type = 'individual';
        try {
          await db.from('user_profiles')
            .update({ student_type: 'individual' })
            .eq('id', profile.id);
        } catch (fallbackErr) {
          console.warn('student_type fallback update failed:', fallbackErr);
        }
      }

      // 먼저 로딩 숨기고 UI 표시하여 빈 화면 방지
      document.getElementById('authLoadingSection').classList.add('hidden');
      document.getElementById('studentTab').classList.remove('hidden');
      document.getElementById('studentMainSection').classList.remove('hidden');

      document.getElementById('welcomeMsg').textContent = currentClassCode + ' ' + getStudentNumber() + '번 학생 환영합니다!';
      syncPeerTypeRadios(currentStudent.type);
      syncPeerReviewerUi();

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
          getCompletedTargets(initDate, getActivePeerId(currentStudent.type), currentStudent.type),
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
        renderTargetGrid(maxCount, getActivePeerId(currentStudent.type), completed, currentStudent.type);
      } catch (dataError) {
        console.warn('학생 데이터 로드 중 일부 오류:', dataError);
        // 최소한 기본 그리드는 표시
        renderTargetGrid(isDemoMode ? 24 : 30, getActivePeerId(currentStudent.type), [], currentStudent.type);
      }
    }
  } catch (error) {
    if (isAbortLikeError(error) && retryCount < 2) {
      await new Promise(resolve => setTimeout(resolve, 350));
      return checkAuthAndRoute(retryCount + 1);
    }
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
    currentStudent = {
      id: '1',
      studentNumber: '1',
      groupNumber: '',
      type: 'individual',
      name: '1',
      isLegacyGroupAccount: false
    };
    demoStudentOneDbLoaded = false;
    studentPersonality = isDemoStudentOne() ? null : loadDemoPersonalityFromStorage();

    // 학생 UI 표시
    document.getElementById('studentTab').classList.remove('hidden');
    document.getElementById('studentMainSection').classList.remove('hidden');
    const welcomeEl = document.getElementById('welcomeMsg');
    if (welcomeEl) {
      welcomeEl.classList.add('is-demo-welcome');
      welcomeEl.innerHTML = '<span class="welcome-main-line">체험용 1번 학생 환영합니다!</span> <span class="demo-mode-line">(체험 모드)</span>';
    }
    syncPeerTypeRadios('individual');
    syncPeerReviewerUi();

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
    btn.classList.add('is-demo-exit');
    btn.innerHTML = '<span class="exit-main">🏠 체험</span> <span class="exit-sub">종료</span>';
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
      student_type: 'individual',
      group_number: null
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
  if (!reviewerId || !reviewType) return [];
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
  const nextType = newType === 'group' ? 'group' : 'individual';
  if (nextType === 'group') {
    currentStudent.type = 'group';
    const canUseGroup = await ensureGroupAssignedOrBlock({ showAlert: true, persistFallback: false });
    if (!canUseGroup) return;
  }
  currentStudent.type = nextType;

  // DB 프로필 업데이트
  try {
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      await db.from('user_profiles')
        .update({ student_type: nextType })
        .eq('google_uid', user.id);
    }
  } catch (err) {
    console.warn('타입 업데이트 오류:', err);
  }

  syncPeerTypeRadios(nextType);
  syncPeerReviewerUi();

  // 평가기준 & 대상 그리드 새로 로드
  const reviewerId = getActivePeerId(nextType);
  const date = document.getElementById('reviewDate').value;
  const [criteria, completed, settings] = await Promise.all([
    getRatingCriteriaFromDB(date, nextType),
    getCompletedTargets(date, reviewerId, nextType),
    getClassSettings()
  ]);
  ratingCriteria = criteria;
  renderRatingItems(criteria);
  const max = nextType === 'group' ? settings.groupCount : settings.studentCount;
  renderTargetGrid(max, reviewerId, completed, nextType);
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
      const savedType = normalizePersonalityTypeCandidate(studentPersonality?.personality_type);
      if (savedType) lastKnownPersonalityType = savedType;
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
        if (currentStudent.type === 'group') {
          await ensureGroupAssignedOrBlock({ showAlert: true, persistFallback: true });
        }
        const activeType = currentStudent.type || 'individual';
        const reviewerId = getActivePeerId(activeType);
        const date = document.getElementById('reviewDate').value;
        const [objTask, criteria, completed, settings] = await Promise.all([
          getObjectiveAndTask(date),
          getRatingCriteriaFromDB(date, activeType),
          getCompletedTargets(date, reviewerId, activeType),
          getClassSettings()
        ]);
        document.getElementById('objectiveText').textContent = objTask.objective || '등록된 학습목표가 없습니다.';
        document.getElementById('taskText').textContent = objTask.task || '등록된 평가과제가 없습니다.';
        ratingCriteria = criteria;
        renderRatingItems(criteria);
        const maxCount = activeType === 'group' ? settings.groupCount : settings.studentCount;
        renderTargetGrid(maxCount, reviewerId, completed, activeType);
      } catch (err) {
        console.warn('동료평가 데이터 로드 오류:', err);
        // 에러 시에도 기본 그리드는 표시
        try {
          const activeType = currentStudent.type || 'individual';
          const reviewerId = getActivePeerId(activeType);
          const settings = await getClassSettings();
          const maxCount = activeType === 'group' ? settings.groupCount : settings.studentCount;
          renderTargetGrid(maxCount, reviewerId, [], activeType);
        } catch (e) {
          // classes 테이블 자체가 없을 경우 기본값으로 그리드 표시
          renderTargetGrid(isDemoMode ? 24 : 30, getActivePeerId(currentStudent.type || 'individual'), [], currentStudent.type || 'individual');
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
    hint: 'teacherDiaryHintTab',
    comment: 'teacherDiaryCommentTab'
  };

  Object.values(map).forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  const selId = map[t] || map.overview;
  document.getElementById(selId)?.classList.remove('hidden');

  const btns = document.querySelectorAll('#diaryMiniTab .sub-tab-btn');
  btns.forEach(b => b.classList.remove('active'));
  const order = ['overview', 'student', 'hint', 'comment'];
  const idx = order.indexOf(map[t] ? t : 'overview');
  if (btns[idx]) btns[idx].classList.add('active');

  currentTeacherDiarySubTab = (map[t] ? t : 'overview');

  // Lazy-init the heavy section.
  if (currentTeacherDiarySubTab === "comment") {
    refreshTeacherSubjectCommentActions?.();
  } else if (currentTeacherDiarySubTab === 'hint') {
    const hintDateEl = document.getElementById('diaryHintViewDate');
    if (hintDateEl && !String(hintDateEl.value || '').trim()) {
      hintDateEl.value = getDefaultQueryDate();
    }
    loadTeacherHintData();
  }
}

function getTeacherPartnerEmptyDetailHtml(title, desc, icon = '🧠') {
  return (
    '<div class="empty-state">' +
    '<span class="empty-icon">' + icon + '</span>' +
    '<div class="empty-title">' + escapeHtml(String(title || '안내')) + '</div>' +
    '<div class="empty-desc">' + escapeHtml(String(desc || '')) + '</div>' +
    '</div>'
  );
}

function getTeacherPartnerSupportTag(partner) {
  const axes = (partner && (partner.axes_raw || partner.axes)) || {};
  return String(axes.support_tag || '').trim();
}

function normalizePartnerQuestionResponses(raw) {
  if (!raw) return {};
  let parsed = raw;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (_) { return {}; }
  }
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed;
}

function formatTeacherPartnerReferenceText(raw) {
  const escaped = escapeHtml(String(raw || ''));
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function adaptTeacherFriendlyReferenceHeading(heading, partNumber) {
  let text = String(heading || '').trim();
  if (partNumber === 1) {
    text = text.replace(/\(8문항\s*×\s*4(?:축|영역)\)/, '(8문항 × 4영역 => 총 16유형)');
  }
  if (partNumber === 2) {
    text = text.replace('각 질문의 의미', '각 질문의 의미(교실 해석 가이드)');
  }
  return text;
}

function adaptTeacherFriendlyReferenceCopy(raw, partNumber) {
  let text = String(raw || '');
  if (!text) return text;

  if (partNumber === 1) {
    text = text.replace(
      '이 시스템은 학생이 **"어떤 방식으로 피드백을 받고 싶어하는가"**를 파악하기 위한 것입니다. 성격 자체를 분류하는 것이 아니라, 학습 피드백 수용 선호도를 측정합니다.',
      '이 시스템은 학생의 **피드백 선호 방식**을 파악하기 위한 것입니다. 성격 유형을 분류하려는 목적이 아니라, "어떤 방식으로 조언을 들을 때 더 잘 받아들이는가"를 확인하는 도구입니다.'
    );
    text = text.replace(/^축\t의미\t질문\t역할$/m, '영역\t무엇을 보는가\t질문\t역할');
    text = text.replace(
      /^코칭 스타일\t피드백의 톤\tQ1\(★우선\), Q2\t주 축$/m,
      '피드백 방식\t문제점을 바로 짚는 피드백 vs 공감 후 방향을 제시하는 피드백\tQ1(★우선), Q2\t주요 영역'
    );
    text = text.replace(
      /^정보 처리\t피드백의 구조\tQ3\(★우선\), Q4\t주 축$/m,
      '정보 처리\t세부부터 이해하기 vs 전체 흐름부터 이해하기\tQ3(★우선), Q4\t주요 영역'
    );
    text = text.replace(
      /^실행 전략\t실천 제안의 형태\tQ5\(★우선\), Q6\t주 축$/m,
      '실행 전략\t계획표 중심 실행 vs 해보면서 조정\tQ5(★우선), Q6\t주요 영역'
    );
    text = text.replace(
      /^학습 환경\t활동의 종류\tQ7\(★우선\), Q8\t보조태그$/m,
      '학습 환경\t함께 대화하며 학습 vs 혼자 집중 학습\tQ7(★우선), Q8\t보조 태그'
    );
    text = text.replace('★ 동률 시 우선 질문(Q1, Q3, Q5, Q7)의 답이 적용됩니다.', '★ 동점일 때는 우선 질문(Q1, Q3, Q5, Q7)의 답이 적용됩니다.');
    text = text.replace(
      /(?:^|\n)영역\t무엇을 보는가\t질문\t역할\n피드백 방식\t문제점을 바로 짚는 피드백 vs 공감 후 방향을 제시하는 피드백\tQ1\(★우선\), Q2\t주요 영역\n정보 처리\t세부부터 이해하기 vs 전체 흐름부터 이해하기\tQ3\(★우선\), Q4\t주요 영역\n실행 전략\t계획표 중심 실행 vs 해보면서 조정\tQ5\(★우선\), Q6\t주요 영역\n학습 환경\t함께 대화하며 학습 vs 혼자 집중 학습\tQ7\(★우선\), Q8\t보조 태그\n★ 동점일 때는 우선 질문\(Q1, Q3, Q5, Q7\)의 답이 적용됩니다\./m,
      ''
    );
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    text += '\n\n현장 적용 메모: 이 표는 학생을 고정 유형으로 낙인찍기 위한 표가 아닙니다. 같은 학생도 과목, 시기, 컨디션에 따라 선호 방식이 달라질 수 있으니 정기적으로 다시 확인해 주세요.';
  }

  const lineMap = [
    [/축 1: 코칭 스타일/g, '영역 1: 피드백 방식'],
    [/축 2: 정보 처리/g, '영역 2: 정보 처리'],
    [/축 3: 실행 전략/g, '영역 3: 실행 전략'],
    [/축 4 \(보조\): 학습 환경/g, '영역 4 (보조): 학습 환경'],
    [/코칭 스타일/g, '피드백 방식'],
    [/주 축/g, '주요 영역'],
    [/보조태그/g, '보조 태그'],
    [/🔍\s*교사 해석:/g, '🔍 선생님이 알아야 할 점:'],
    [/→ 해결형/g, '→ 직접형(해결형)'],
    [/→ 지지형/g, '→ 공감형(지지형)'],
    [/이 아이는/g, '이 학생은'],
    [/이런 아이입니다:/g, '이런 학생입니다:'],
    [/교사가 이 학생에게 피드백할 때:/g, '선생님이 이 학생에게 피드백할 때:'],
    [/주의할 점:/g, '수업에서 기억할 점:']
  ];
  lineMap.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  if (partNumber === 2) {
    text = text.replace(
      '영역 1: 피드백 방식 — "이 학생은 직설적 진단을 원하는가, 공감적 동행을 원하는가?"',
      '영역 1: 피드백 방식 — "이 학생은 직접적인 지적을 원하는가, 공감적인 대화를 원하는가?"'
    );
    text = text.replace(
      '영역 2: 정보 처리 — "이 학생은 디테일부터 쌓아가는가, 큰 그림부터 잡는가?"',
      '영역 2: 정보 처리 — "이 학생은 세부부터 이해하는가, 전체 흐름부터 파악하는가?"'
    );
    text = text.replace(
      '영역 3: 실행 전략 — "이 학생은 계획 세우기를 좋아하는가, 일단 해보기를 좋아하는가?"',
      '영역 3: 실행 전략 — "이 학생은 계획형으로 움직이는가, 먼저 시도하며 조정하는가?"'
    );
    text = text.replace(
      '영역 4 (보조): 학습 환경 — "이 학생은 협력형인가, 독립형인가?"',
      '영역 4 (보조): 학습 환경 — "이 학생은 함께 배울 때 강한가, 혼자 집중할 때 강한가?"'
    );
    text = text.replace(
      'A를 고른 학생은 감정보다 해결책을 먼저 원하고, B를 고른 학생은 "혼자가 아니다"는 느낌을 먼저 원합니다.',
      'A를 고른 학생은 감정보다 해결책을 먼저 원하고, B를 고른 학생은 "혼자가 아니다"는 느낌을 먼저 원합니다. 같은 내용이라도 말의 순서에 따라 수용도가 크게 달라질 수 있습니다.'
    );
    text = text.replace(
      '이 축은 주 유형을 바꾸지 않고 보조 태그(#함께 성장형 / #혼자 집중형)로 작동합니다.',
      '이 영역은 주 유형을 바꾸지 않고 보조 태그(#함께 성장형 / #혼자 집중형)로 작동합니다.'
    );
    text += '\n\n수업 적용 팁: 답을 A/B로 나눠 확인할 때는 "왜 그렇게 골랐는지"를 한 문장으로 설명하게 하면 해석 정확도가 높아집니다. 응답 결과는 상담, 수행평가 안내, 모둠 활동 설계와 연결해서 활용하면 효과가 큽니다.';
  }

  if (partNumber === 3) {
    text += '\n\n활용 팁: 유형 설명은 학생에게 꼬리표처럼 전달하기보다, "앞으로 어떤 피드백 방식이 더 도움이 되는지"를 함께 찾는 대화 자료로 활용해 주세요.';
  }

  if (partNumber === 4) {
    text += '\n\n실무 메모: 보조 태그는 활동 선택의 힌트입니다. 수업 목표에 따라 협력 활동과 개인 활동을 번갈아 배치하면, 한쪽 선호가 강한 학생도 균형 있게 성장할 수 있습니다.';
  }

  if (partNumber === 5) {
    text += '\n\n실무 적용 팁: 위 표는 고정 라벨이 아니라 수업 맥락에 따라 유연하게 활용하는 기준표입니다. 학생 상태와 과제 성격에 맞춰 조합해 사용하세요. 특히 평가 직후, 수행 과제 시작 전, 상담 주간처럼 피드백 수요가 높은 시점에 다시 확인하면 활용도가 높아집니다.';
  }

  return text;
}

function getTeacherPartnerTypeEmojiByName(typeName) {
  const normalized = String(typeName || '').replace(/\s+/g, '');
  if (!normalized) return '🧠';
  const list = Array.isArray(PARTNER_TYPES) ? PARTNER_TYPES : [];
  const found = list.find((item) => String(item?.type_name || '').replace(/\s+/g, '') === normalized);
  return found?.emoji || '🧠';
}

function buildTeacherPartnerReferencePart1Visual() {
  const rows = [
    ['피드백 방식', '문제점을 바로 짚는 피드백 vs 공감 후 방향을 제시하는 피드백', 'Q1(★우선), Q2', '주요 영역'],
    ['정보 처리', '세부부터 이해하기 vs 전체 흐름부터 이해하기', 'Q3(★우선), Q4', '주요 영역'],
    ['실행 전략', '계획표 중심 실행 vs 해보면서 조정', 'Q5(★우선), Q6', '주요 영역'],
    ['학습 환경', '함께 대화하며 학습 vs 혼자 집중 학습', 'Q7(★우선), Q8', '보조 태그']
  ];
  const body = rows.map((row) =>
    '<tr>' +
    '<td>' + escapeHtml(row[0]) + '</td>' +
    '<td>' + escapeHtml(row[1]) + '</td>' +
    '<td>' + escapeHtml(row[2]) + '</td>' +
    '<td>' + escapeHtml(row[3]) + '</td>' +
    '</tr>'
  ).join('');
  return (
    '<section class="teacher-partner-reference-visual">' +
    '<div class="teacher-partner-reference-visual-title">질문 구조 빠른표</div>' +
    '<div class="teacher-partner-reference-table-wrap">' +
    '<table class="teacher-partner-reference-table">' +
    '<thead><tr><th>영역</th><th>무엇을 보는가</th><th>질문</th><th>역할</th></tr></thead>' +
    '<tbody>' + body + '</tbody>' +
    '</table>' +
    '</div>' +
    '<p class="teacher-partner-reference-note">동점일 때는 우선 질문(Q1, Q3, Q5, Q7)의 답이 적용됩니다.</p>' +
    '</section>'
  );
}

function buildTeacherPartnerReferencePart2Visual() {
  const areas = [
    {
      title: '영역 1: 피드백 방식',
      subtitle: 'Q1, Q2 · 직접형(해결형) vs 공감형(지지형)',
      guide: '"이 학생은 직접적인 지적을 원하는가, 공감적인 대화를 원하는가?"',
      questions: [
        {
          no: 'Q1',
          prompt: '"시험 결과가 기대보다 낮았을 때, 선생님이 어떻게 말해주면 좋겠어?"',
          answerA: '"구체적으로 분석하고 방법을 알려줘" → 직접형(해결형)',
          answerB: '"같이 방법을 찾아보자고 말해줘" → 공감형(지지형)',
          note: '실패 상황에서 학생이 원하는 첫 반응을 봅니다. A를 고른 학생은 감정보다 해결책을 먼저 원하고, B를 고른 학생은 "혼자가 아니다"는 느낌을 먼저 원합니다. 같은 내용이라도 말의 순서에 따라 수용도가 크게 달라질 수 있습니다.'
        },
        {
          no: 'Q2',
          prompt: '"모둠 활동에서 내가 맡은 부분의 완성도가 떨어질 때, 어떤 반응이 더 도움이 돼?"',
          answerA: '"이 부분은 이렇게 고치면 좋을 것 같아." → 직접형(해결형)',
          answerB: '"고생많았어. 다음엔 이 부분을 신경 써줘." → 공감형(지지형)',
          note: '동료/교사의 비판적 피드백을 받는 장면입니다. A 학생은 무엇이 틀렸는지 바로 듣고 싶어하고, B 학생은 노력을 인정받은 후에 개선점을 듣고 싶어합니다. B 학생에게 인정 없이 지적부터 하면 방어적이 될 수 있습니다.'
        }
      ]
    },
    {
      title: '영역 2: 정보 처리',
      subtitle: 'Q3, Q4 · 디테일형 vs 큰 그림형',
      guide: '"이 학생은 세부부터 이해하는가, 전체 흐름부터 파악하는가?"',
      questions: [
        {
          no: 'Q3',
          prompt: '"새로운 단원을 배울 때, 어떤 게 더 도움이 돼?"',
          answerA: '"개념을 읽고 문제 풀이 과정을 쭉 따라가기" → 디테일형',
          answerB: '"왜 이 단원을 배우는지, 전체 흐름 중 어디인지 먼저 파악" → 큰 그림형',
          note: '학습 진입 방식을 봅니다. A 학생은 구체적 예시와 절차를 따라가며 이해하고, B 학생은 "이걸 왜 배우는지" 맥락이 잡혀야 세부 내용이 들어옵니다. B 학생에게 맥락 없이 문제풀이부터 시키면 동기가 떨어질 수 있습니다.'
        },
        {
          no: 'Q4',
          prompt: '"내 결과물에 대한 조언을 받을 때, 어떤 형식이 더 좋아?"',
          answerA: '"항목별 점수와 구체적 근거" → 디테일형',
          answerB: '"전체적인 흐름 요약과 다음 방향" → 큰 그림형',
          note: '피드백 수신 형태의 선호입니다. A 학생은 "어디서 몇 점 감점됐고 왜"를 원하고, B 학생은 "전체적으로 이런 느낌이고 다음에 이 방향"을 원합니다. A 학생에게 "전체적으로 괜찮아"라고만 하면 불만족하고, B 학생에게 항목별 점수만 나열하면 압도당할 수 있습니다.'
        }
      ]
    },
    {
      title: '영역 3: 실행 전략',
      subtitle: 'Q5, Q6 · 계획형 vs 탐색형',
      guide: '"이 학생은 계획형으로 움직이는가, 먼저 시도하며 조정하는가?"',
      questions: [
        {
          no: 'Q5',
          prompt: '"시험 2주 전, 어떤 공부 방식이 나한테 더 맞아?"',
          answerA: '"과목별 계획표를 짜고 매일 체크" → 계획형',
          answerB: '"일단 시작하고 그날 상태에 따라 조절" → 탐색형',
          note: '시간 관리 성향을 봅니다. A 학생은 구조와 일정이 있으면 안정감을 느끼고, B 학생은 유연성이 있어야 지속할 수 있습니다. B 학생에게 빡빡한 계획표를 강요하면 오히려 포기가 빨라집니다.'
        },
        {
          no: 'Q6',
          prompt: '"방학 동안 뭔가를 배우고 싶을 때, 어떻게 시작해?"',
          answerA: '"목표와 일정을 먼저 정하고 단계적으로" → 계획형',
          answerB: '"일단 관심 가는 걸 해보면서 방향을 잡아가기" → 탐색형',
          note: '자기주도 학습의 시작 패턴입니다. A 학생은 로드맵이 있어야 시작하고, B 학생은 호기심이 출발점입니다. 두 유형 모두 가치 있지만, B 학생에게 "먼저 계획을 세워와"라고 하면 시작 자체를 못할 수 있습니다.'
        }
      ]
    },
    {
      title: '영역 4 (보조): 학습 환경',
      subtitle: 'Q7, Q8 · 함께 성장형 vs 혼자 집중형',
      guide: '"이 학생은 함께 배울 때 강한가, 혼자 집중할 때 강한가?"',
      questions: [
        {
          no: 'Q7',
          prompt: '"어려운 내용을 이해하고 싶을 때, 어떤 방법을 더 좋아해?"',
          answerA: '"친구나 선생님한테 물어보면서 정리" → 함께 성장형',
          answerB: '"혼자 자료를 찾아보며 정리" → 혼자 집중형',
          note: '학습 곤란 상황에서의 대처 방식입니다. A 학생은 대화를 통해 이해를 구성하고, B 학생은 스스로 정리하는 시간이 필요합니다.'
        },
        {
          no: 'Q8',
          prompt: '"시험공부 할 때 어떤 환경이 더 집중이 잘 돼?"',
          answerA: '"친구와 같이 문제 내고 풀기" → 함께 성장형',
          answerB: '"조용히 혼자 집중해서 풀기" → 혼자 집중형',
          note: '집중 환경 선호입니다. 이 영역은 주 유형을 바꾸지 않고 보조 태그(#함께 성장형 / #혼자 집중형)로 작동합니다. AI가 실천 활동을 제안할 때 협력 활동(모둠 토론, 짝 설명 등)을 넣을지, 개인 활동(노트 정리, 혼자 풀기 등)을 넣을지 결정합니다.'
        }
      ]
    }
  ];

  const areaDetails = areas.map((area, index) => (
    '<details class="teacher-partner-question-accordion"' + (index === 0 ? ' open' : '') + '>' +
    '<summary class="teacher-partner-question-summary">' +
    '<div class="teacher-partner-question-summary-text">' +
    '<strong>' + escapeHtml(area.title) + '</strong>' +
    '<span>' + escapeHtml(area.subtitle) + '</span>' +
    '</div>' +
    '<span class="teacher-partner-question-summary-state" aria-hidden="true"></span>' +
    '</summary>' +
    '<div class="teacher-partner-question-panel">' +
    '<p class="teacher-partner-question-guide">' + escapeHtml(area.guide) + '</p>' +
    area.questions.map((q) => (
      '<article class="teacher-partner-question-card">' +
      '<h5>' + escapeHtml(q.no + '. ' + q.prompt.replace(/^"|"$/g, '')) + '</h5>' +
      '<div class="teacher-partner-question-choice">' +
      '<span class="teacher-partner-question-badge is-a">A</span>' +
      '<span>' + escapeHtml(q.answerA) + '</span>' +
      '</div>' +
      '<div class="teacher-partner-question-choice">' +
      '<span class="teacher-partner-question-badge is-b">B</span>' +
      '<span>' + escapeHtml(q.answerB) + '</span>' +
      '</div>' +
      '<p class="teacher-partner-question-note"><strong>🔍 선생님이 알아야 할 점:</strong> ' + escapeHtml(q.note) + '</p>' +
      '</article>'
    )).join('') +
    '</div>' +
    '</details>'
  )).join('');

  return (
    '<section class="teacher-partner-reference-visual">' +
    '<div class="teacher-partner-reference-visual-title">영역별 해석 펼침</div>' +
    '<p class="teacher-partner-reference-note">영역 카드를 눌러 Q1~Q8의 A/B 응답 의미와 해석 포인트를 확인하세요.</p>' +
    '<div class="teacher-partner-question-accordion-list">' +
    areaDetails +
    '</div>' +
    '<p class="teacher-partner-reference-note">수업 적용 팁: 답을 A/B로 나눠 확인할 때는 "왜 그렇게 골랐는지"를 한 문장으로 설명하게 하면 해석 정확도가 높아집니다. 응답 결과는 상담, 수행평가 안내, 모둠 활동 설계와 연결해서 활용하면 효과가 큽니다.</p>' +
    '</div>' +
    '</section>'
  );
}

function buildTeacherPartnerReferencePart3Visual() {
  const typeGuides = [
    {
      title: '구체적인 계획가',
      axes: '해결 × 디테일 × 계획',
      traits: [
        '"뭐가 틀렸는지 정확히 알려주세요"가 입버릇인 학생',
        '점수표, 체크리스트, 일정표를 좋아함',
        '모호한 피드백("좀 더 노력해봐")에 불만을 느낌',
        '계획을 세우면 실행력이 높은 편'
      ],
      good: '"3번 문제 유형에서 실수가 반복되고 있어. 이번 주 월수는 A 유형 5문제씩, 목금은 B 유형으로 연습하자."',
      bad: '"전반적으로 잘하고 있으니까 조금만 더 힘내."',
      notes: [
        '이 학생은 감정적 위로보다 정보를 원합니다. 틀린 부분을 정확히 짚어주는 것이 존중의 표현이라고 느낍니다.',
        '다만 지적만 나열하면 좌절할 수 있으므로, "잘된 부분 1개 + 개선점 2개 + 실행 계획"의 구조가 효과적입니다.',
        '계획을 세워주면 스스로 실행하는 힘이 있으므로, 중간 점검 정도만 해주면 됩니다.'
      ]
    },
    {
      title: '구체적인 도전가',
      axes: '해결 × 디테일 × 탐색',
      traits: [
        '뭐가 문제인지는 정확히 알고 싶지만, 정해진 계획표는 싫어하는 학생',
        '"이거 해봐" 하면 바로 시도하는 행동력이 있음',
        '장기 계획보다 "오늘 당장 해볼 것 하나"에 반응함',
        '틀에 박힌 반복 학습은 금방 지루해함'
      ],
      good: '"이 부분에서 실수가 나왔어. 이 방법으로 딱 3문제만 풀어봐. 맞으면 다음 단계로 넘어가자."',
      bad: '"2주 동안 이 계획표대로 매일 해와."',
      notes: [
        '구체적인 지적은 환영하지만, 장기 로드맵은 부담으로 느낍니다.',
        '작고 명확한 미션 1개를 주고 결과를 같이 확인하는 사이클이 이 학생에게 가장 효과적입니다.',
        '실험 결과를 메모하게 하면 자기 학습 패턴을 스스로 발견하게 됩니다.'
      ]
    },
    {
      title: '큰 그림형 계획가',
      axes: '해결 × 큰 그림 × 계획',
      traits: [
        '"이거 왜 해요?"를 먼저 묻는 학생',
        '세부 항목보다 전체 방향과 우선순위를 중시함',
        '방향이 잡히면 스스로 계획을 세우는 능력이 있음',
        '의미 없는 반복에는 동기 저하가 빠름'
      ],
      good: '"전체적으로 보면 이 방향이야. 이번 주는 이것부터, 다음 주는 저것. 이 순서로 하면 시험 범위가 정리될 거야."',
      bad: '"1번은 ○, 2번은 △, 3번은 ×…" (항목별 나열만)',
      notes: [
        '이 학생에게는 "왜 이 순서인지"를 설명해주는 것이 핵심입니다.',
        '우선순위를 함께 정해주면 이후 실행은 스스로 잘합니다.',
        '숲을 보여주고 나무 순서를 잡아주되, 각 나무를 어떻게 심을지는 학생에게 맡기세요.'
      ]
    },
    {
      title: '큰 그림형 도전가',
      axes: '해결 × 큰 그림 × 탐색',
      traits: [
        '호기심이 많고 다양한 것에 관심을 가지는 학생',
        '정해진 틀보다 "이런 것도 해볼까?"에 눈이 반짝임',
        '방향만 알려주면 자기만의 방식으로 탐색함',
        '너무 구체적인 지시는 오히려 창의성을 막는다고 느낌'
      ],
      good: '"이런 방향도 있어. 한번 해보고 맞는지 느껴봐. 아니면 이쪽도 재밌을 거야."',
      bad: '"이 순서대로 따라 해. 다른 건 나중에."',
      notes: [
        '이 학생은 선택지를 주면 동기부여가 됩니다.',
        '"A 방법과 B 방법이 있는데, 뭐가 더 맞을 것 같아?"처럼 옵션을 제시하세요.',
        '산만해 보일 수 있지만, 다양한 시도 속에서 자기 방식을 찾는 타입입니다. 탐색 자체를 인정해주는 것이 중요합니다.',
        '단, "결국 어디로 가고 있는지"를 가끔 환기시켜주면 좋습니다.'
      ]
    },
    {
      title: '함께하는 계획가',
      axes: '지지 × 디테일 × 계획',
      traits: [
        '잘한 점을 먼저 인정받으면 개선점도 기꺼이 받아들이는 학생',
        '단계별 안내가 있으면 안심하고 따라감',
        '피드백의 순서(인정→개선→실행)가 중요',
        '꼼꼼하고 성실하지만, 자신감이 낮을 수 있음'
      ],
      good: '"이건 진짜 잘했어. 여기는 같이 해보자. 먼저 이것부터, 그 다음에 이것."',
      bad: '"여기 틀렸고, 여기도 부족하고, 이건 다시 해와."',
      notes: [
        '"잘한 점 먼저"가 이 학생에게는 선택이 아니라 필수입니다.',
        '인정 없이 지적부터 시작하면 "나는 못하는 사람"이라는 인식이 강화됩니다.',
        '계획이 있으면 실행을 잘하므로, 1단계→2단계→3단계로 나눠주면 차근차근 따라갑니다.',
        '중간중간 "여기까지 잘하고 있어"라는 확인이 큰 힘이 됩니다.'
      ]
    },
    {
      title: '함께하는 도전가',
      axes: '지지 × 디테일 × 탐색',
      traits: [
        '따뜻한 분위기에서 "같이 해보자"고 하면 용기를 내는 학생',
        '큰 계획보다 "일단 이것만 해볼까?" 식의 가벼운 시작을 좋아함',
        '실패에 대한 두려움이 있을 수 있어서, 심리적 안전감이 중요',
        '누군가와 함께하면 시도 자체를 더 잘함'
      ],
      good: '"이건 잘했어! 여기는 이렇게 한번 해볼까? 부담 없이 하나만."',
      bad: '"여기 틀렸으니까 이 10문제 풀어와."',
      notes: [
        '"같이"라는 단어가 이 학생에게는 마법의 단어입니다.',
        '혼자 과제를 안겨주면 시작 자체가 어렵지만, "선생님이랑 같이 한번 보자" 또는 "친구랑 해봐"라고 하면 시도합니다.',
        '작은 성공 경험을 쌓게 해주는 것이 장기적으로 가장 효과적입니다.',
        '실패해도 "시도한 것 자체가 좋았어"라는 메시지가 다음 시도로 이어집니다.'
      ]
    },
    {
      title: '공감하는 계획가',
      axes: '지지 × 큰 그림 × 계획',
      traits: [
        '기분이나 컨디션에 따라 학습 효율이 크게 달라지는 학생',
        '감정을 먼저 알아줘야 그 다음 내용이 들어옴',
        '방향만 잡아주면 스스로 정리하는 힘이 있음',
        '세부 사항보다 "결국 내가 잘 되고 있는지"가 중요'
      ],
      good: '"많이 노력했지? 잘하고 있어. 이번 주는 이것만 해보자."',
      bad: '"1번에서 3점 감점, 2번에서 2점 감점…" (감정 터치 없이 숫자만)',
      notes: [
        '첫 문장이 공감이어야 합니다. "힘들었겠다", "노력한 거 보여", "걱정했구나" 등.',
        '공감 한 문장 + 방향 한 문장 + 이번 주 할 것 하나. 이 3단계가 이 학생에게 맞는 방법입니다.',
        '감정을 무시하고 바로 과제를 주면, 할 수 있는 능력이 있어도 하지 않게 됩니다.',
        '"지금 어디쯤 왔는지" 알려주면 안심하고 다음 단계로 넘어갑니다.'
      ]
    },
    {
      title: '공감하는 도전가',
      axes: '지지 × 큰 그림 × 탐색',
      traits: [
        '감성적이면서도 새로운 것에 열린 학생',
        '강요보다 영감을 통해 움직이는 타입',
        '"이런 것도 해보면 재밌을 거야"라는 한마디에 반응함',
        '정해진 계획보다 자기만의 페이스를 중시함',
        '예술적이거나 창의적인 활동에 잘 반응하는 경우가 많음'
      ],
      good: '"충분히 잘하고 있어. 이런 것도 해보면 재밌을 거야. 어떻게 생각해?"',
      bad: '"됐고 이 계획표대로 해와."',
      notes: [
        '이 학생에게는 질문이 가장 좋은 피드백 도구입니다.',
        '"이거 해봐"보다 "이런 건 어떨 것 같아?"가 훨씬 효과적입니다.',
        '감정 공감 → 흥미 자극 → 작은 실험 제안의 순서로 접근하세요.',
        '결과보다 과정에서 느낀 것을 물어봐주면 스스로 성찰이 깊어집니다.',
        '가장 자유로운 유형이지만, 방향 없이 표류할 수 있으므로 가끔 "전체적으로 봤을 때 지금 어떤 단계 인 것 같아?"라고 물어봐주면 좋습니다.'
      ]
    }
  ];

  return (
    '<section class="teacher-partner-reference-visual">' +
    '<div class="teacher-partner-reference-visual-title">8가지 유형별 클릭 가이드</div>' +
    '<p class="teacher-partner-reference-note">3개 주요 영역의 조합으로 8가지 유형이 만들어집니다. 유형 카드를 눌러서 학생 특징, 피드백 예시, 수업에서 기억할 점을 확인하세요.</p>' +
    '<div class="teacher-partner-type-accordion-list">' +
    typeGuides.map((item, index) =>
      '<details class="teacher-partner-question-accordion"' + (index === 0 ? ' open' : '') + '>' +
      '<summary class="teacher-partner-question-summary">' +
      '<div class="teacher-partner-question-summary-text">' +
      '<strong>' + escapeHtml(getTeacherPartnerTypeEmojiByName(item.title) + ' ' + item.title) + '</strong>' +
      '<span>' + escapeHtml(item.axes) + '</span>' +
      '</div>' +
      '<span class="teacher-partner-question-summary-state" aria-hidden="true"></span>' +
      '</summary>' +
      '<div class="teacher-partner-type-panel">' +
      '<article class="teacher-partner-type-block">' +
      '<h5>이런 학생입니다:</h5>' +
      '<ul class="teacher-partner-type-list">' +
      item.traits.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') +
      '</ul>' +
      '</article>' +
      '<article class="teacher-partner-type-block">' +
      '<h5>선생님이 이 학생에게 피드백할 때:</h5>' +
      '<div class="teacher-partner-type-feedback is-good">✅ ' + escapeHtml(item.good) + '</div>' +
      '<div class="teacher-partner-type-feedback is-bad">❌ ' + escapeHtml(item.bad) + '</div>' +
      '</article>' +
      '<article class="teacher-partner-type-block">' +
      '<h5>수업에서 기억할 점:</h5>' +
      '<ul class="teacher-partner-type-list">' +
      item.notes.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') +
      '</ul>' +
      '</article>' +
      '</div>' +
      '</details>'
    ).join('') +
    '</div>' +
    '<p class="teacher-partner-reference-note">활용 팁: 유형 설명은 학생에게 꼬리표처럼 전달하기보다, "앞으로 어떤 피드백 방식이 더 도움이 되는지"를 함께 찾는 대화 자료로 활용해 주세요.</p>' +
    '</section>'
  );
}

function buildTeacherPartnerReferencePart4Visual() {
  const tags = [
    {
      tag: '#함께 성장형',
      meaning: '다른 사람과 함께할 때 더 잘 배움',
      examples: '친구와 설명 연습, 모둠 토론, 같이 문제 풀기, 짝 피드백',
      classTip: '같은 "구체적인 계획가"라도 #함께 성장형이면 "친구와 계획 공유하고 매일 체크"를 제안합니다.'
    },
    {
      tag: '#혼자 집중형',
      meaning: '혼자 집중할 때 더 잘 배움',
      examples: '노트 정리, 혼자 풀어보기, 조용히 복습, 자기만의 요약 만들기',
      classTip: '같은 "구체적인 계획가"라도 #혼자 집중형이면 "혼자 계획표에 체크하며 진행"을 제안합니다.'
    }
  ];

  return (
    '<section class="teacher-partner-reference-visual">' +
    '<div class="teacher-partner-reference-visual-title">보조 태그 클릭 가이드</div>' +
    '<p class="teacher-partner-reference-note">보조 태그는 위 8가지 유형에 덧붙여서 실천 활동의 종류를 조절합니다. 각 태그를 눌러 의미와 적용 예시를 확인하세요.</p>' +
    '<div class="teacher-partner-type-accordion-list">' +
    tags.map((item, index) =>
      '<details class="teacher-partner-question-accordion"' + (index === 0 ? ' open' : '') + '>' +
      '<summary class="teacher-partner-question-summary">' +
      '<div class="teacher-partner-question-summary-text">' +
      '<strong>' + escapeHtml(item.tag) + '</strong>' +
      '<span>' + escapeHtml(item.meaning) + '</span>' +
      '</div>' +
      '<span class="teacher-partner-question-summary-state" aria-hidden="true"></span>' +
      '</summary>' +
      '<div class="teacher-partner-type-panel">' +
      '<article class="teacher-partner-type-block">' +
      '<h5>의미</h5>' +
      '<p>' + escapeHtml(item.meaning) + '</p>' +
      '</article>' +
      '<article class="teacher-partner-type-block">' +
      '<h5>실천 활동 예시</h5>' +
      '<p>' + escapeHtml(item.examples) + '</p>' +
      '</article>' +
      '<article class="teacher-partner-type-block">' +
      '<h5>교사 적용 예시</h5>' +
      '<p>' + escapeHtml(item.classTip) + '</p>' +
      '</article>' +
      '</div>' +
      '</details>'
    ).join('') +
    '</div>' +
    '<p class="teacher-partner-reference-note">교사 팁: 보조 태그는 강제가 아닌 권장입니다.</p>' +
    '<p class="teacher-partner-reference-note">상황에 따라 혼자 하는 아이도 모둠 활동이 필요할 수 있고, 함께 하는 아이도 혼자 정리할 시간이 필요합니다.</p>' +
    '<p class="teacher-partner-reference-note">실무 메모: 보조 태그는 활동 선택의 힌트입니다. 수업 목표에 따라 협력 활동과 개인 활동을 번갈아 배치하면, 한쪽 선호가 강한 학생도 균형 있게 성장할 수 있습니다.</p>' +
    '</section>'
  );
}

function buildTeacherPartnerReferencePartVisual(partNumber) {
  if (partNumber === 1) return buildTeacherPartnerReferencePart1Visual();
  if (partNumber === 2) return buildTeacherPartnerReferencePart2Visual();
  if (partNumber === 3) return buildTeacherPartnerReferencePart3Visual();
  if (partNumber === 4) return buildTeacherPartnerReferencePart4Visual();
  if (partNumber === 5) return '';
  return '';
}

function getTeacherPartnerGuideCatalogForDetail() {
  return [
    {
      title: '구체적인 계획가',
      axes: '해결 × 디테일 × 계획',
      traits: [
        '"뭐가 틀렸는지 정확히 알려주세요"가 입버릇인 학생',
        '점수표, 체크리스트, 일정표를 좋아함',
        '모호한 피드백("좀 더 노력해봐")에 불만을 느낌',
        '계획을 세우면 실행력이 높은 편'
      ],
      good: '"3번 문제 유형에서 실수가 반복되고 있어. 이번 주 월수는 A 유형 5문제씩, 목금은 B 유형으로 연습하자."',
      bad: '"전반적으로 잘하고 있으니까 조금만 더 힘내."',
      notes: [
        '이 학생은 감정적 위로보다 정보를 원합니다. 틀린 부분을 정확히 짚어주는 것이 존중의 표현이라고 느낍니다.',
        '다만 지적만 나열하면 좌절할 수 있으므로, "잘된 부분 1개 + 개선점 2개 + 실행 계획"의 구조가 효과적입니다.',
        '계획을 세워주면 스스로 실행하는 힘이 있으므로, 중간 점검 정도만 해주면 됩니다.'
      ]
    },
    {
      title: '구체적인 도전가',
      axes: '해결 × 디테일 × 탐색',
      traits: [
        '뭐가 문제인지는 정확히 알고 싶지만, 정해진 계획표는 싫어하는 학생',
        '"이거 해봐" 하면 바로 시도하는 행동력이 있음',
        '장기 계획보다 "오늘 당장 해볼 것 하나"에 반응함',
        '틀에 박힌 반복 학습은 금방 지루해함'
      ],
      good: '"이 부분에서 실수가 나왔어. 이 방법으로 딱 3문제만 풀어봐. 맞으면 다음 단계로 넘어가자."',
      bad: '"2주 동안 이 계획표대로 매일 해와."',
      notes: [
        '구체적인 지적은 환영하지만, 장기 로드맵은 부담으로 느낍니다.',
        '작고 명확한 미션 1개를 주고 결과를 같이 확인하는 사이클이 이 학생에게 가장 효과적입니다.',
        '실험 결과를 메모하게 하면 자기 학습 패턴을 스스로 발견하게 됩니다.'
      ]
    },
    {
      title: '큰 그림형 계획가',
      axes: '해결 × 큰 그림 × 계획',
      traits: [
        '"이거 왜 해요?"를 먼저 묻는 학생',
        '세부 항목보다 전체 방향과 우선순위를 중시함',
        '방향이 잡히면 스스로 계획을 세우는 능력이 있음',
        '의미 없는 반복에는 동기 저하가 빠름'
      ],
      good: '"전체적으로 보면 이 방향이야. 이번 주는 이것부터, 다음 주는 저것. 이 순서로 하면 시험 범위가 정리될 거야."',
      bad: '"1번은 ○, 2번은 △, 3번은 ×…" (항목별 나열만)',
      notes: [
        '이 학생에게는 "왜 이 순서인지"를 설명해주는 것이 핵심입니다.',
        '우선순위를 함께 정해주면 이후 실행은 스스로 잘합니다.',
        '숲을 보여주고 나무 순서를 잡아주되, 각 나무를 어떻게 심을지는 학생에게 맡기세요.'
      ]
    },
    {
      title: '큰 그림형 도전가',
      axes: '해결 × 큰 그림 × 탐색',
      traits: [
        '호기심이 많고 다양한 것에 관심을 가지는 학생',
        '정해진 틀보다 "이런 것도 해볼까?"에 눈이 반짝임',
        '방향만 알려주면 자기만의 방식으로 탐색함',
        '너무 구체적인 지시는 오히려 창의성을 막는다고 느낌'
      ],
      good: '"이런 방향도 있어. 한번 해보고 맞는지 느껴봐. 아니면 이쪽도 재밌을 거야."',
      bad: '"이 순서대로 따라 해. 다른 건 나중에."',
      notes: [
        '이 학생은 선택지를 주면 동기부여가 됩니다.',
        '"A 방법과 B 방법이 있는데, 뭐가 더 맞을 것 같아?"처럼 옵션을 제시하세요.',
        '산만해 보일 수 있지만, 다양한 시도 속에서 자기 방식을 찾는 타입입니다. 탐색 자체를 인정해주는 것이 중요합니다.',
        '단, "결국 어디로 가고 있는지"를 가끔 환기시켜주면 좋습니다.'
      ]
    },
    {
      title: '함께하는 계획가',
      axes: '지지 × 디테일 × 계획',
      traits: [
        '잘한 점을 먼저 인정받으면 개선점도 기꺼이 받아들이는 학생',
        '단계별 안내가 있으면 안심하고 따라감',
        '피드백의 순서(인정→개선→실행)가 중요',
        '꼼꼼하고 성실하지만, 자신감이 낮을 수 있음'
      ],
      good: '"이건 진짜 잘했어. 여기는 같이 해보자. 먼저 이것부터, 그 다음에 이것."',
      bad: '"여기 틀렸고, 여기도 부족하고, 이건 다시 해와."',
      notes: [
        '"잘한 점 먼저"가 이 학생에게는 선택이 아니라 필수입니다.',
        '인정 없이 지적부터 시작하면 "나는 못하는 사람"이라는 인식이 강화됩니다.',
        '계획이 있으면 실행을 잘하므로, 1단계→2단계→3단계로 나눠주면 차근차근 따라갑니다.',
        '중간중간 "여기까지 잘하고 있어"라는 확인이 큰 힘이 됩니다.'
      ]
    },
    {
      title: '함께하는 도전가',
      axes: '지지 × 디테일 × 탐색',
      traits: [
        '따뜻한 분위기에서 "같이 해보자"고 하면 용기를 내는 학생',
        '큰 계획보다 "일단 이것만 해볼까?" 식의 가벼운 시작을 좋아함',
        '실패에 대한 두려움이 있을 수 있어서, 심리적 안전감이 중요',
        '누군가와 함께하면 시도 자체를 더 잘함'
      ],
      good: '"이건 잘했어! 여기는 이렇게 한번 해볼까? 부담 없이 하나만."',
      bad: '"여기 틀렸으니까 이 10문제 풀어와."',
      notes: [
        '"같이"라는 단어가 이 학생에게는 마법의 단어입니다.',
        '혼자 과제를 안겨주면 시작 자체가 어렵지만, "선생님이랑 같이 한번 보자" 또는 "친구랑 해봐"라고 하면 시도합니다.',
        '작은 성공 경험을 쌓게 해주는 것이 장기적으로 가장 효과적입니다.',
        '실패해도 "시도한 것 자체가 좋았어"라는 메시지가 다음 시도로 이어집니다.'
      ]
    },
    {
      title: '공감하는 계획가',
      axes: '지지 × 큰 그림 × 계획',
      traits: [
        '기분이나 컨디션에 따라 학습 효율이 크게 달라지는 학생',
        '감정을 먼저 알아줘야 그 다음 내용이 들어옴',
        '방향만 잡아주면 스스로 정리하는 힘이 있음',
        '세부 사항보다 "결국 내가 잘 되고 있는지"가 중요'
      ],
      good: '"많이 노력했지? 잘하고 있어. 이번 주는 이것만 해보자."',
      bad: '"1번에서 3점 감점, 2번에서 2점 감점…" (감정 터치 없이 숫자만)',
      notes: [
        '첫 문장이 공감이어야 합니다. "힘들었겠다", "노력한 거 보여", "걱정했구나" 등.',
        '공감 한 문장 + 방향 한 문장 + 이번 주 할 것 하나. 이 3단계가 이 학생에게 맞는 방법입니다.',
        '감정을 무시하고 바로 과제를 주면, 할 수 있는 능력이 있어도 하지 않게 됩니다.',
        '"지금 어디쯤 왔는지" 알려주면 안심하고 다음 단계로 넘어갑니다.'
      ]
    },
    {
      title: '공감하는 도전가',
      axes: '지지 × 큰 그림 × 탐색',
      traits: [
        '감성적이면서도 새로운 것에 열린 학생',
        '강요보다 영감을 통해 움직이는 타입',
        '"이런 것도 해보면 재밌을 거야"라는 한마디에 반응함',
        '정해진 계획보다 자기만의 페이스를 중시함',
        '예술적이거나 창의적인 활동에 잘 반응하는 경우가 많음'
      ],
      good: '"충분히 잘하고 있어. 이런 것도 해보면 재밌을 거야. 어떻게 생각해?"',
      bad: '"됐고 이 계획표대로 해와."',
      notes: [
        '이 학생에게는 질문이 가장 좋은 피드백 도구입니다.',
        '"이거 해봐"보다 "이런 건 어떨 것 같아?"가 훨씬 효과적입니다.',
        '감정 공감 → 흥미 자극 → 작은 실험 제안의 순서로 접근하세요.',
        '결과보다 과정에서 느낀 것을 물어봐주면 스스로 성찰이 깊어집니다.',
        '가장 자유로운 유형이지만, 방향 없이 표류할 수 있으므로 가끔 "전체적으로 봤을 때 지금 어떤 단계 인 것 같아?"라고 물어봐주면 좋습니다.'
      ]
    }
  ];
}

function getTeacherPartnerGuideByPartner(partner) {
  if (!partner) return null;
  const catalog = getTeacherPartnerGuideCatalogForDetail();
  const normalize = (value) => String(value || '').replace(/\s+/g, '').trim();
  const byName = normalize(partner.type_name);
  if (byName) {
    const direct = catalog.find((item) => normalize(item.title) === byName);
    if (direct) return direct;
  }
  const code = String(partner.type_code || '').trim();
  if (code && PARTNER_TYPE_BY_CODE && PARTNER_TYPE_BY_CODE[code]) {
    const codeName = normalize(PARTNER_TYPE_BY_CODE[code].type_name);
    const mapped = catalog.find((item) => normalize(item.title) === codeName);
    if (mapped) return mapped;
  }
  return null;
}

function renderTeacherPartnerGuideDetailSection(partner) {
  const guide = getTeacherPartnerGuideByPartner(partner);
  if (!guide) return '';
  return (
    '<div class="teacher-partner-detail-section teacher-partner-guide-detail-section">' +
    '<h4>유형별 교사 가이드</h4>' +
    '<div class="teacher-partner-guide-detail-card">' +
    '<div class="teacher-partner-guide-detail-head">' +
    '<div class="teacher-partner-guide-detail-title">' + escapeHtml((partner.emoji || '🧠') + ' ' + String(guide.title || '')) + '</div>' +
    '<div class="teacher-partner-guide-detail-axes">' + escapeHtml(String(guide.axes || '')) + '</div>' +
    '</div>' +
    '<div class="teacher-partner-guide-detail-block">' +
    '<h5>이런 학생입니다</h5>' +
    '<ul class="teacher-partner-guide-detail-list">' +
    (Array.isArray(guide.traits) ? guide.traits : []).map((line) => '<li>' + escapeHtml(String(line || '')) + '</li>').join('') +
    '</ul>' +
    '</div>' +
    '<div class="teacher-partner-guide-detail-block">' +
    '<h5>선생님이 이 학생에게 피드백할 때</h5>' +
    '<div class="teacher-partner-guide-detail-feedback is-good">✅ ' + escapeHtml(String(guide.good || '-')) + '</div>' +
    '<div class="teacher-partner-guide-detail-feedback is-bad">❌ ' + escapeHtml(String(guide.bad || '-')) + '</div>' +
    '</div>' +
    '<div class="teacher-partner-guide-detail-block">' +
    '<h5>수업에서 기억할 점</h5>' +
    '<ul class="teacher-partner-guide-detail-list">' +
    (Array.isArray(guide.notes) ? guide.notes : []).map((line) => '<li>' + escapeHtml(String(line || '')) + '</li>').join('') +
    '</ul>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function renderTeacherPartnerReferenceCards() {
  const container = document.getElementById('teacherPartnerReferenceCards');
  const source = document.getElementById('teacherPartnerReferenceRaw');
  if (!container || !source) return;
  if (container.dataset.rendered === '1') return;

  const raw = String(source.textContent || '').replace(/\r\n/g, '\n').trim();
  if (!raw) {
    container.innerHTML = getTeacherPartnerEmptyDetailHtml('레퍼런스 데이터 없음', '레퍼런스 원문을 불러올 수 없습니다.', '📘');
    container.dataset.rendered = '1';
    return;
  }

  const chunks = raw.split(/(?=📌 Part \d+\.)/g).map(s => s.trim()).filter(Boolean);
  let introChunk = '';
  if (chunks.length > 0 && !chunks[0].startsWith('📌 Part')) {
    introChunk = chunks.shift();
  }
  void introChunk;

  const partHtml = chunks.map((chunk, index) => {
    const lines = chunk.split('\n');
    const heading = String(lines.shift() || ('Part ' + (index + 1))).trim();
    const body = lines.join('\n').trim();
    const partNumMatch = heading.match(/Part\s*(\d+)/i);
    const partKicker = partNumMatch ? ('Part ' + partNumMatch[1]) : ('Part ' + (index + 1));
    const partNumber = partNumMatch ? Number(partNumMatch[1]) : (index + 1);
    if (partNumber === 5) return '';
    const friendlyHeading = adaptTeacherFriendlyReferenceHeading(heading, partNumber);
    const friendlyBody = adaptTeacherFriendlyReferenceCopy(body, partNumber);
    const visualHtml = buildTeacherPartnerReferencePartVisual(partNumber);

    return (
      '<article class="teacher-partner-reference-part-card">' +
      '<div class="teacher-partner-reference-part-head">' +
      '<span class="teacher-partner-reference-part-kicker">' + escapeHtml(partKicker) + '</span>' +
      '<h4 class="teacher-partner-reference-part-title">' + escapeHtml(friendlyHeading) + '</h4>' +
      '</div>' +
      visualHtml +
      ((partNumber === 2 || partNumber === 3 || partNumber === 4) ? '' : ('<div class="teacher-partner-reference-part-body">' + formatTeacherPartnerReferenceText(friendlyBody) + '</div>')) +
      '</article>'
    );
  }).join('');

  container.innerHTML = partHtml;
  container.dataset.rendered = '1';
}

function switchTeacherManageSubTab(tab) {
  const mode = (String(tab || '').trim() === 'partner') ? 'partner' : 'class';
  currentTeacherManageSubTab = mode;

  const classTab = document.getElementById('teacherManageClassTab');
  const partnerTab = document.getElementById('teacherManagePartnerTab');
  classTab?.classList.toggle('hidden', mode !== 'class');
  partnerTab?.classList.toggle('hidden', mode !== 'partner');

  const classBtn = document.getElementById('teacherManageClassBtn');
  const partnerBtn = document.getElementById('teacherManagePartnerBtn');
  classBtn?.classList.toggle('active', mode === 'class');
  partnerBtn?.classList.toggle('active', mode === 'partner');

  if (mode === 'class') {
    loadClassSettingsUI();
    loadStudentMappingData();
    return;
  }

  switchTeacherPartnerSubTab('reference');
}

function switchTeacherPartnerSubTab(tab) {
  const mode = (String(tab || '').trim() === 'individual') ? 'individual' : 'reference';
  currentTeacherPartnerSubTab = mode;

  const refTab = document.getElementById('teacherPartnerReferenceTab');
  const indTab = document.getElementById('teacherPartnerIndividualTab');
  refTab?.classList.toggle('hidden', mode !== 'reference');
  indTab?.classList.toggle('hidden', mode !== 'individual');

  const refBtn = document.getElementById('teacherPartnerReferenceBtn');
  const indBtn = document.getElementById('teacherPartnerIndividualBtn');
  refBtn?.classList.toggle('active', mode === 'reference');
  indBtn?.classList.toggle('active', mode === 'individual');

  if (mode === 'reference') {
    renderTeacherPartnerReferenceCards();
    return;
  }

  loadTeacherPartnerIndividualData();
}

function getTeacherPartnerListAccentColor(row, index) {
  const donePalette = ['#22c55e', '#0ea5e9', '#8b5cf6', '#f59e0b', '#14b8a6', '#f97316', '#ec4899', '#6366f1'];
  const pendingPalette = ['#f59e0b', '#f97316', '#eab308', '#f43f5e', '#fb7185'];
  const emptyPalette = ['#94a3b8', '#64748b', '#8b95a7', '#7c8ea3', '#a3afbf'];
  const num = parseOptionalPositiveInt(row?.studentNumber);
  const seed = (num && num > 0) ? num : ((Number(index) || 0) + 1);
  const slot = (seed - 1);
  if (row?.status === '진단완료') return donePalette[slot % donePalette.length];
  if (row?.status === '미진단') return pendingPalette[slot % pendingPalette.length];
  return emptyPalette[slot % emptyPalette.length];
}

function renderTeacherPartnerIndividual(rows) {
  const summaryEl = document.getElementById('teacherPartnerSummary');
  const listEl = document.getElementById('teacherPartnerList');
  if (!summaryEl || !listEl) return;

  const items = Array.isArray(rows) ? rows : [];
  const totalCount = items.length;
  const diagnosedCount = items.filter(item => item.status === '진단완료').length;
  const undiagnosedCount = items.filter(item => item.status === '미진단').length;
  const unregisteredCount = items.filter(item => item.status === '미등록').length;

  summaryEl.innerHTML =
    '<div class="teacher-partner-summary-card">' +
    '<span class="teacher-partner-summary-label">전체</span>' +
    '<strong class="teacher-partner-summary-value">' + totalCount + '명</strong>' +
    '</div>' +
    '<div class="teacher-partner-summary-card is-done">' +
    '<span class="teacher-partner-summary-label">진단완료</span>' +
    '<strong class="teacher-partner-summary-value">' + diagnosedCount + '명</strong>' +
    '</div>' +
    '<div class="teacher-partner-summary-card is-pending">' +
    '<span class="teacher-partner-summary-label">미진단</span>' +
    '<strong class="teacher-partner-summary-value">' + undiagnosedCount + '명</strong>' +
    '</div>' +
    '<div class="teacher-partner-summary-card is-empty">' +
    '<span class="teacher-partner-summary-label">미등록</span>' +
    '<strong class="teacher-partner-summary-value">' + unregisteredCount + '명</strong>' +
    '</div>';

  if (items.length === 0) {
    listEl.innerHTML = getTeacherPartnerEmptyDetailHtml('표시할 학생이 없습니다', '학급 학생 수 설정과 학생 등록 상태를 확인해 주세요.', '📭');
    return;
  }

  listEl.innerHTML = items.map((row, index) => {
    const statusClass = row.status === '진단완료'
      ? 'is-done'
      : (row.status === '미진단' ? 'is-pending' : 'is-empty');
    const itemToneClass = row.status === '진단완료'
      ? 'is-done'
      : (row.status === '미진단' ? 'is-pending' : 'is-empty');
    const partnerName = row.partner
      ? ((row.partner.emoji || '🧠') + ' ' + String(row.partner.type_name || row.partner.type_code || '유형 미확정'))
      : '-';
    const supportTag = row.supportTag || '-';
    const email = row.profile?.google_email || '(미등록)';
    const activeClass = String(row.studentNumber) === String(teacherPartnerSelectedStudentNumber || '') ? ' is-active' : '';
    const accentColor = getTeacherPartnerListAccentColor(row, index);
    return (
      '<button type="button" class="teacher-partner-item ' + itemToneClass + activeClass + '" style="--teacher-partner-item-accent:' + accentColor + ';" data-student-number="' + escapeHtml(String(row.studentNumber)) + '" onclick="renderTeacherPartnerDetail(\'' + escapeHtml(String(row.studentNumber)) + '\')">' +
      '<div class="teacher-partner-item-head">' +
      '<span class="teacher-partner-student">' + escapeHtml(String(row.studentNumber)) + '번</span>' +
      '<span class="teacher-partner-status ' + statusClass + '">' + escapeHtml(row.status) + '</span>' +
      '</div>' +
      '<div class="teacher-partner-type">' + escapeHtml(partnerName) + '</div>' +
      '<div class="teacher-partner-tag">' + escapeHtml(supportTag) + '</div>' +
      '<div class="teacher-partner-email">' + escapeHtml(email) + '</div>' +
      '</button>'
    );
  }).join('');
}

function renderTeacherPartnerDetail(studentNumber) {
  const detailEl = document.getElementById('teacherPartnerDetail');
  if (!detailEl) return;

  const key = String(studentNumber || '').trim();
  if (!key) {
    detailEl.innerHTML = getTeacherPartnerEmptyDetailHtml('학생을 선택해 주세요', '왼쪽 목록에서 학생 번호를 눌러 상세를 확인하세요.');
    return;
  }

  teacherPartnerSelectedStudentNumber = key;
  document.querySelectorAll('#teacherPartnerList .teacher-partner-item').forEach((el) => {
    const isActive = String(el.dataset.studentNumber || '') === key;
    el.classList.toggle('is-active', isActive);
  });

  const row = teacherPartnerIndividualRows.find((item) => String(item.studentNumber) === key);
  if (!row) {
    detailEl.innerHTML = getTeacherPartnerEmptyDetailHtml('데이터를 찾을 수 없습니다', '목록을 새로 불러온 뒤 다시 선택해 주세요.', '⚠️');
    return;
  }

  if (row.status === '미등록') {
    detailEl.innerHTML = getTeacherPartnerEmptyDetailHtml(
      key + '번은 아직 미등록입니다',
      '학생이 Google 계정 온보딩을 완료하면 개별 확인이 가능합니다.',
      '👤'
    );
    return;
  }

  if (row.status === '미진단' || !row.partner) {
    detailEl.innerHTML = getTeacherPartnerEmptyDetailHtml(
      key + '번은 아직 성장 파트너 미진단입니다',
      '학생이 스스로 배움에서 성향 진단(Q1~Q8)을 완료해야 유형이 표시됩니다.',
      '📝'
    );
    return;
  }

  const partner = row.partner;
  const axes = (partner.axes_raw || partner.axes || {});
  const guideSectionHtml = renderTeacherPartnerGuideDetailSection(partner);
  const responses = normalizePartnerQuestionResponses(row.personality?.question_responses);
  const questionList = Array.isArray(personalityQuestions) ? personalityQuestions : [];
  const questionMap = {};
  questionList.forEach((q) => { questionMap[String(q.id)] = q; });

  let answerHtml = '';
  for (let i = 1; i <= 8; i++) {
    const answer = String(responses[String(i)] || responses[i] || '').trim();
    const q = questionMap[String(i)];
    let answerText = '-';
    if (q && answer === 'A') answerText = q.optionA?.text || 'A';
    else if (q && answer === 'B') answerText = q.optionB?.text || 'B';
    else if (answer) answerText = answer;
    answerHtml +=
      '<div class="teacher-partner-answer-item">' +
      '<span class="teacher-partner-answer-q">Q' + i + '</span>' +
      '<span class="teacher-partner-answer-choice">' + escapeHtml(answer || '-') + '</span>' +
      '<span class="teacher-partner-answer-text">' + escapeHtml(answerText) + '</span>' +
      '</div>';
  }

  detailEl.innerHTML =
    '<div class="teacher-partner-detail-head">' +
    '<div class="teacher-partner-detail-title">' + escapeHtml(key) + '번 학생</div>' +
    '<div class="teacher-partner-detail-type">' + escapeHtml((partner.emoji || '🧠') + ' ' + String(partner.type_name || partner.type_code || '유형 미확정')) + '</div>' +
    '</div>' +
    '<div class="teacher-partner-detail-meta">' +
    '<div><span class="teacher-partner-meta-label">유형 코드</span><strong>' + escapeHtml(String(partner.type_code || '-')) + '</strong></div>' +
    '<div><span class="teacher-partner-meta-label">보조태그</span><strong>' + escapeHtml(row.supportTag || '-') + '</strong></div>' +
    '<div><span class="teacher-partner-meta-label">계정</span><strong>' + escapeHtml(String(row.profile?.google_email || '-')) + '</strong></div>' +
    '</div>' +
    '<div class="teacher-partner-detail-section">' +
    '<h4>4축 정보</h4>' +
    '<div class="teacher-partner-axis-grid">' +
    '<div><span>코칭 스타일</span><strong>' + escapeHtml(String(axes.coaching_style || '-')) + '</strong></div>' +
    '<div><span>정보 처리</span><strong>' + escapeHtml(String(axes.info_processing || '-')) + '</strong></div>' +
    '<div><span>실행 전략</span><strong>' + escapeHtml(String(axes.execution_strategy || '-')) + '</strong></div>' +
    '<div><span>학습 환경</span><strong>' + escapeHtml(String(axes.learning_env || '-')) + '</strong></div>' +
    '</div>' +
    '</div>' +
    guideSectionHtml +
    '<div class="teacher-partner-detail-section">' +
    '<h4>Q1~Q8 응답</h4>' +
    '<div class="teacher-partner-answer-grid">' + answerHtml + '</div>' +
    '</div>';
}

async function loadTeacherPartnerIndividualData() {
  const summaryEl = document.getElementById('teacherPartnerSummary');
  const listEl = document.getElementById('teacherPartnerList');
  const detailEl = document.getElementById('teacherPartnerDetail');
  if (!summaryEl || !listEl || !detailEl) return;
  if (!currentClassCode) {
    listEl.innerHTML = getTeacherPartnerEmptyDetailHtml('학급 코드가 없습니다', '교사 계정의 학급 정보를 먼저 확인해 주세요.', '⚠️');
    detailEl.innerHTML = getTeacherPartnerEmptyDetailHtml('데이터 없음', '학급 코드 확인 후 다시 시도해 주세요.');
    return;
  }

  summaryEl.innerHTML = '';
  listEl.innerHTML = '<p class="teacher-list-loading">로딩 중...</p>';
  detailEl.innerHTML = getTeacherPartnerEmptyDetailHtml('학생을 선택해 주세요', '목록을 불러오는 중입니다.');

  try {
    const [classRes, profilesRes, personalityRes] = await Promise.all([
      db.from('classes').select('student_count').eq('class_code', currentClassCode).maybeSingle(),
      db.from('user_profiles')
        .select('id, student_number, google_email')
        .eq('class_code', currentClassCode)
        .eq('role', 'student')
        .order('student_number'),
      db.from('student_personality')
        .select('student_id, question_responses, partner_type_code, partner_type_name, partner_axes, partner_version')
        .eq('class_code', currentClassCode)
    ]);

    if (classRes.error) throw classRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (personalityRes.error) throw personalityRes.error;

    const classStudentCount = parseOptionalPositiveInt(classRes.data?.student_count);
    const profileMap = new Map();
    let inferredStudentCount = 0;
    (profilesRes.data || []).forEach((row) => {
      const num = parseOptionalPositiveInt(row?.student_number);
      if (!num) return;
      profileMap.set(String(num), row);
      if (num > inferredStudentCount) inferredStudentCount = num;
    });

    const personalityMap = new Map();
    (personalityRes.data || []).forEach((row) => {
      const sid = parseOptionalPositiveInt(row?.student_id);
      if (!sid) return;
      personalityMap.set(String(sid), row);
      if (sid > inferredStudentCount) inferredStudentCount = sid;
    });

    const studentCount = classStudentCount || inferredStudentCount;
    if (!classStudentCount && inferredStudentCount > 0) {
      console.warn('[teacher-partner] classes.student_count unavailable. inferred studentCount=', inferredStudentCount);
    }
    if (!studentCount) {
      teacherPartnerIndividualRows = [];
      teacherPartnerSelectedStudentNumber = '';
      renderTeacherPartnerIndividual([]);
      detailEl.innerHTML = getTeacherPartnerEmptyDetailHtml('표시할 학생이 없습니다', '학급 학생 수 또는 학생 등록 데이터를 확인해 주세요.', '📭');
      return;
    }

    const rows = [];
    for (let i = 1; i <= studentCount; i++) {
      const key = String(i);
      const profile = profileMap.get(key) || null;
      const personality = personalityMap.get(key) || null;
      const partner = (profile && personality) ? getPartnerFromPersonalityRow(personality) : null;
      const status = !profile ? '미등록' : (partner ? '진단완료' : '미진단');
      rows.push({
        studentNumber: key,
        profile,
        personality,
        partner,
        supportTag: getTeacherPartnerSupportTag(partner),
        status
      });
    }

    teacherPartnerIndividualRows = rows;
    const selected = rows.find((item) => item.studentNumber === teacherPartnerSelectedStudentNumber)
      || rows.find((item) => item.status === '진단완료')
      || rows.find((item) => item.status === '미진단')
      || rows[0]
      || null;
    teacherPartnerSelectedStudentNumber = selected ? String(selected.studentNumber) : '';

    renderTeacherPartnerIndividual(rows);
    if (selected) {
      renderTeacherPartnerDetail(selected.studentNumber);
    } else {
      detailEl.innerHTML = getTeacherPartnerEmptyDetailHtml('표시할 학생이 없습니다', '학급 학생 수를 확인해 주세요.', '📭');
    }
  } catch (error) {
    console.error('loadTeacherPartnerIndividualData error:', error);
    teacherPartnerIndividualRows = [];
    teacherPartnerSelectedStudentNumber = '';
    summaryEl.innerHTML = '';

    const message = String(error?.message || error || '알 수 없는 오류');
    const rlsLikely = /row[-\s]?level security|permission denied|policy|not allowed|forbidden/i.test(message);
    listEl.innerHTML =
      '<div class="empty-state">' +
      '<span class="empty-icon">⚠️</span>' +
      '<div class="empty-title">성장 파트너 데이터를 불러올 수 없습니다</div>' +
      '<div class="empty-desc">' + escapeHtml(message) + '</div>' +
      (rlsLikely
        ? '<div class="teacher-partner-rls-hint">앱에서 보이지 않는 경우 Supabase RLS 정책에서 student_personality / user_profiles / classes 조회 권한을 먼저 확인해 주세요.</div>'
        : '') +
      '</div>';
    detailEl.innerHTML = getTeacherPartnerEmptyDetailHtml('조회 실패', '목록을 다시 열거나 권한 설정(RLS)을 점검해 주세요.', '⚠️');
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
    switchTeacherManageSubTab('class');
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

function getTeacherSubjectCommentSemesterRange(semester, settings = teacherSubjectCommentLastSettings) {
  const sem = Number(semester) === 2 ? 2 : 1;
  const defaults = TEACHER_SUBJECT_COMMENT_SEMESTER_DEFAULTS[sem] || { start: '', end: '' };
  const start = sem === 1 ? settings?.semester1_start : settings?.semester2_start;
  const end = sem === 1 ? settings?.semester1_end : settings?.semester2_end;
  return {
    start: String(start || defaults.start || ''),
    end: String(end || defaults.end || '')
  };
}

function applyTeacherSemesterDatesFromCache() {
  const startEl = document.getElementById('teacherSubjectCommentStart');
  const endEl = document.getElementById('teacherSubjectCommentEnd');
  if (!startEl || !endEl) return;

  const range = getTeacherSubjectCommentSemesterRange(teacherSubjectCommentSemester);
  startEl.value = range.start;
  endEl.value = range.end;
}

async function loadTeacherSubjectCommentSettings() {
  const sl = document.getElementById('teacherSubjectCommentSchoolLevel');
  if (!sl) return;

  try {
    const info = await getClassInfo();
    if (!info) return;
    teacherSubjectCommentLastSettings = info;
    loadTeacherSemesterSettingsUI(info);

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
  const semester = teacherSubjectCommentSemester;

  clearTimeout(teacherSubjectCommentSettingsSaveTimer);
  teacherSubjectCommentSettingsSaveTimer = setTimeout(async () => {
    const patch = {};
    if (schoolLevel) patch.school_level = schoolLevel;
    if (semester === 1) {
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
      loadTeacherSemesterSettingsUI(teacherSubjectCommentLastSettings);
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

  const custom = unique.filter(t => !presetBase.includes(t) && t !== OTHER_SUBJECT_TAG);
  // 학기/기간 전환 시 태그 수가 줄어들지 않도록 기본 과목 목록은 항상 고정 노출한다.
  const ordered = [...presetBase, ...custom];

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

async function previewTeacherSubjectCommentSources() {
  const btn = document.getElementById('teacherSubjectCommentPreviewBtn');
  const wrap = document.getElementById('teacherSubjectCommentSourceWrap');
  const list = document.getElementById('teacherSubjectCommentSourceList');
  const noteCountEl = document.getElementById('teacherSubjectCommentNoteCount');
  if (!btn || !wrap || !list) return;

  const { start, end, subject, rawSubject, customSubject, studentId } = getTeacherSubjectCommentUIValues();
  if (!studentId) { showModal({ type: 'alert', icon: '⚠️', title: '선택 필요', message: '먼저 학생을 선택해 주세요.' }); return; }
  if (!start || !end) { showModal({ type: 'alert', icon: '⚠️', title: '선택 필요', message: '기간(시작일/종료일)을 선택해 주세요.' }); return; }
  if (start > end) { showModal({ type: 'alert', icon: '⚠️', title: '기간 오류', message: '시작일이 종료일보다 늦습니다. 기간을 확인해 주세요.' }); return; }
  if (!subject) { showModal({ type: 'alert', icon: '⚠️', title: '선택 필요', message: '과목 태그를 1개 선택해 주세요.' }); return; }

  setLoading(true, btn, '조회 중...');
  if (noteCountEl) noteCountEl.textContent = '-';
  list.innerHTML = '<div class="teacher-list-loading">원문을 불러오는 중...</div>';
  wrap.classList.remove('hidden');

  try {
    const records = await fetchTeacherLearningNotes({ studentId, start, end });
    const filtered = (records || []).filter(r => {
      const tags = Array.isArray(r.subject_tags) ? r.subject_tags.map(String) : [];
      return isTeacherSubjectCommentTagMatch(tags, { rawSubject, subject, customSubject })
        && String(r.learning_text || '').trim().length > 0;
    });
    if (noteCountEl) noteCountEl.textContent = String(filtered.length);

    if (filtered.length === 0) {
      list.innerHTML = '<div class="empty-state"><span class="empty-icon">📭</span><div class="empty-desc">선택한 기간/과목에 해당하는 원문이 없습니다.</div></div>';
      return;
    }

    list.innerHTML = filtered.map(r => {
      const sid = String(r.student_id || '').trim();
      const date = escapeHtml(String(r.reflection_date || ''));
      const tags = Array.isArray(r.subject_tags) ? r.subject_tags.filter(Boolean) : [];
      const tagsHtml = tags.length
        ? `<div class="teacher-subject-comment-source-tags">${tags.map(t => `<span class="teacher-subject-comment-source-tag">${escapeHtml(String(t))}</span>`).join('')}</div>`
        : '';
      return `
        <article class="teacher-subject-comment-source-item">
          <div class="teacher-subject-comment-source-meta">
            <span>${escapeHtml(sid)}번</span>
            <span>${date}</span>
          </div>
          ${tagsHtml}
          <div class="teacher-subject-comment-source-text">${escapeHtml(String(r.learning_text || ''))}</div>
        </article>
      `;
    }).join('');
  } catch (err) {
    console.error('source preview error:', err);
    if (noteCountEl) noteCountEl.textContent = '-';
    list.innerHTML = '<div class="message error">원문 조회 중 오류가 발생했습니다.</div>';
  } finally {
    setLoading(false, btn, '조회하기');
  }
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

function getSchoolConfig(lvl) {
  if (lvl === '초') {
    return {
      sentences: 3,
      style:
        '[톤]\n' +
        '- 따뜻하고 구체적인 관찰자 시점으로 서술하라.\n' +
        '- 표현 예: ~에 흥미를 보임, ~하는 과정이 우수함, ~와 연결 지어 생각함\n'
    };
  }
  if (lvl === '중') {
    return {
      sentences: 4,
      style:
        '[톤]\n' +
        '- 탐구 활동과 이해 확장 과정 중심으로 서술하라.\n' +
        '- 표현 예: ~을 탐구함, ~을 비교·분석함, ~하는 과정이 우수함\n'
    };
  }
  return {
    sentences: 5,
    style:
      '[톤]\n' +
      '- 학문적 깊이와 자기주도적 탐구 과정 중심으로 서술하라.\n' +
      '- 표현 예: ~을 논증함, ~에 대한 심화 이해를 보임\n'
  };
}

function extractTopicTokens(text) {
  const src = String(text || '').toLowerCase();
  const tokens = src.replace(/[^가-힣a-z0-9\s]/g, ' ').split(/\s+/).map(t => t.trim()).filter(Boolean);
  const seen = new Set();
  const filtered = [];
  tokens.forEach((token) => {
    if (token.length < 2) return;
    if (TOPIC_TOKEN_STOPWORDS.has(token)) return;
    if (seen.has(token)) return;
    seen.add(token);
    filtered.push(token);
  });
  return filtered;
}

function isSameTopic(noteA, noteB) {
  if (!noteA || !noteB) return false;

  const topicA = String(noteA.topic || '').trim();
  const topicB = String(noteB.topic || '').trim();
  if (topicA && topicB) return topicA === topicB;

  const tokensA = extractTopicTokens(noteA.content);
  const tokensB = extractTopicTokens(noteB.content);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const setB = new Set(tokensB);
  let overlapCount = 0;
  for (const token of tokensA) {
    if (!setB.has(token)) continue;
    overlapCount += 1;
    if (overlapCount >= SAME_TOPIC_TOKEN_OVERLAP_MIN) return true;
  }
  return false;
}

function sortTeacherSubjectCommentNotes(a, b) {
  const lengthDiff = Number(b.content.length || 0) - Number(a.content.length || 0);
  if (lengthDiff !== 0) return lengthDiff;
  const da = String(a.reflection_date || '').slice(0, 10);
  const db = String(b.reflection_date || '').slice(0, 10);
  return db.localeCompare(da);
}

function selectNotes(notes) {
  const source = Array.isArray(notes) ? notes : [];
  const withKeyword = [];
  const withoutKeyword = [];

  source.forEach((note) => {
    const content = String(note?.content || note?.learning_text || '').trim();
    if (!content) return;
    const normalizedNote = {
      ...note,
      topic: String(note?.topic || '').trim(),
      reflection_date: String(note?.reflection_date || '').slice(0, 10),
      content
    };
    const hasKeyword = THINK_KEYWORDS.some((keyword) => content.includes(keyword));
    if (hasKeyword) withKeyword.push(normalizedNote);
    else withoutKeyword.push(normalizedNote);
  });

  withKeyword.sort(sortTeacherSubjectCommentNotes);
  withoutKeyword.sort(sortTeacherSubjectCommentNotes);

  let selected = [];
  if (withKeyword.length >= 1 && withoutKeyword.length >= 1) {
    selected = [withKeyword[0], withoutKeyword[0]];
  } else if (withKeyword.length >= 2) {
    selected = [withKeyword[0], withKeyword[1]];
  } else if (withoutKeyword.length >= 2) {
    selected = [withoutKeyword[0], withoutKeyword[1]];
  } else {
    selected = [...withKeyword, ...withoutKeyword];
  }

  if (selected.length === 2 && isSameTopic(selected[0], selected[1])) {
    const first = selected[0];
    const second = selected[1];
    const secondFromWith = withKeyword.includes(second);
    const pool = secondFromWith ? withKeyword : withoutKeyword;
    const replacement = pool.find((candidate) => candidate !== first && candidate !== second);
    if (replacement) selected[1] = replacement;
  }

  return {
    withKeyword,
    withoutKeyword,
    selectedNotes: selected
  };
}

function preprocessTeacherSubjectCommentNotes(notes) {
  const normalized = (Array.isArray(notes) ? notes : []).map((note) => ({
    ...note,
    topic: String(note?.topic || '').trim(),
    content: String(note?.learning_text || '').trim(),
    reflection_date: String(note?.reflection_date || '').slice(0, 10)
  })).filter(note => note.content.length > 0);

  const picked = selectNotes(normalized);
  const selectedNotes = picked.selectedNotes;
  return {
    selectedNotes,
    evidenceTexts: selectedNotes.map(note => note.content),
    meta: {
      withCount: picked.withKeyword.length,
      withoutCount: picked.withoutKeyword.length,
      selectedCount: selectedNotes.length
    }
  };
}

function buildTeacherSubjectCommentPrompt({ schoolLevel, subject, start, end, evidenceTexts }) {
  const lvl = normalizeSchoolLevel(schoolLevel);
  const config = getSchoolConfig(lvl);
  const evidence = Array.isArray(evidenceTexts)
    ? evidenceTexts.map(text => String(text || '').trim()).filter(Boolean).slice(0, 2)
    : [];
  if (evidence.length === 0) return '';

  const isSingle = evidence.length === 1;
  const sentenceCount = isSingle ? Math.ceil(config.sentences / 2) : config.sentences;
  const noteCountLabel = isSingle ? '1건' : '2건';
  const orderRule = isSingle ? '' : '- 노트1 기반 문장 → 노트2 기반 문장 순서로 작성하라.\n';

  let prompt =
    '너는 ' + lvl + ' ' + subject + ' 담당 교사다.\n' +
    '아래 배움노트 ' + noteCountLabel + '을 근거로 교과세특(' + start + '~' + end + ')을 작성하라.\n\n' +
    '[규칙]\n' +
    '- 교사 관찰 시점, 3인칭 서술. 1인칭 금지.\n' +
    '- 종결: ~함, ~임, ~보임, ~드러남\n' +
    '- 총 ' + sentenceCount + '문장.\n' +
    orderRule +
    '- 번호/불릿/마크다운 없이 줄바꿈으로 나열.\n' +
    '- 근거 밖의 내용을 지어내지 마라.\n\n' +
    '[품질 기준]\n' +
    '- 활동 나열 금지. 각 노트 내에서 학습이 깊어지는 흐름으로 서술하라.\n' +
    '- 역량 키워드를 직접 쓰지 말고 구체적 행동 서술로 역량이 읽히게 하라.\n\n' +
    config.style + '\n' +
    '[좋은 예]\n' +
    '함수의 극한 개념 학습 과정에서 좌극한과 우극한이 다른 사례를 스스로 탐색하며 극한의 존재 조건을 자세하게 정리함. 교과서 풀이와 다른 접근을 시도하다 오류를 발견한 뒤 조건을 재검토하여 수정하는 논리적인 과정이 우수함.\n\n' +
    '[나쁜 예]\n' +
    '자기주도적 학습 태도를 바탕으로 적극적으로 수업에 참여하였으며 비판적 사고력과 탐구 능력이 우수함.\n' +
    '→ 구체성 없음, 역량 키워드 나열\n\n' +
    '[노트1]\n' + evidence[0] + '\n\n';

  if (!isSingle) prompt += '[노트2]\n' + evidence[1] + '\n\n';
  prompt += '[출력]\n';
  return prompt;
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
    return { ok: false, type: 'no_notes', noteCount: 0, selectedCount: 0 };
  }

  const preprocessed = preprocessTeacherSubjectCommentNotes(notes);
  const selectedCount = Number(preprocessed?.meta?.selectedCount || 0);
  if (selectedCount === 0) {
    return { ok: false, type: 'no_notes', noteCount, selectedCount: 0 };
  }

  const prompt = buildTeacherSubjectCommentPrompt({
    schoolLevel,
    subject,
    start,
    end,
    evidenceTexts: preprocessed.evidenceTexts
  });
  if (!prompt) {
    return { ok: false, type: 'unknown', noteCount, selectedCount };
  }

  const result = await callGemini(prompt, { generationConfig: { temperature: 0.4, maxOutputTokens: 3000 } });
  if (!result.ok) return { ok: false, type: 'api', noteCount, selectedCount, error: result.error || 'AI 생성 실패' };

  let out = String(result.text || '').trim();
  out = out.replace(/^\s*[-*•]\s*/gm, '').replace(/^\s*\d+[.)]\s*/gm, '').trim();
  return { ok: true, noteCount, selectedCount, text: out };
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
        setTeacherSubjectCommentResult(null, { resetEmpty: true });
        if (single.type === 'no_notes') {
          setTeacherSubjectCommentError('선택한 기간에 해당 과목 배움노트가 없어 생성할 수 없음. 기간을 조정해 주세요.', { showRetry: false });
        } else if (single.type === 'api') {
          setTeacherSubjectCommentError('생성 중 오류가 발생했습니다: ' + (single.error || 'AI 생성 실패'), { showRetry: true });
        } else {
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
    1: getTeacherSubjectCommentSemesterRange(1, info),
    2: getTeacherSubjectCommentSemesterRange(2, info)
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
  if (!currentStudent) return;
  if (currentStudent.type === 'group') {
    const canUseGroup = await ensureGroupAssignedOrBlock({ showAlert: true, persistFallback: true });
    if (!canUseGroup) return;
  }
  const reviewType = currentStudent.type || 'individual';
  const reviewerId = getActivePeerId(reviewType);
  const date = document.getElementById('reviewDate').value;
  const [completed, settings] = await Promise.all([getCompletedTargets(date, reviewerId, reviewType), getClassSettings()]);
  const max = reviewType === 'group' ? settings.groupCount : settings.studentCount;
  renderTargetGrid(max, reviewerId, completed, reviewType);
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
    let firstSelectable = null;
    const inSubmitTab = !document.getElementById('studentSubmitTab')?.classList.contains('hidden');
    const isDemoStudentOne = String(getStudentNumber()) === '1';
    if (inSubmitTab && type === 'individual' && isDemoStudentOne) {
      const preferred = Array.from(grid.querySelectorAll('.target-btn'))
        .find((btn) => btn.textContent.trim() === '19번' && !btn.classList.contains('disabled'));
      if (preferred) firstSelectable = preferred;
    }
    if (!firstSelectable) firstSelectable = grid.querySelector('.target-btn.done, .target-btn:not(.disabled)');
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
  const reviewType = currentStudent.type || 'individual';
  const reviewerId = getActivePeerId(reviewType);
  try {
    const date = document.getElementById('reviewDate').value;
    const { data: typedRows } = await db.from('reviews')
      .select('scores_json')
      .eq('class_code', currentClassCode)
      .eq('review_date', date)
      .eq('reviewer_id', String(reviewerId))
      .eq('target_id', String(id))
      .eq('review_type', reviewType)
      .limit(1);

    let existing = (typedRows && typedRows.length > 0) ? typedRows[0] : null;

    // Legacy fallback: old rows may not have review_type.
    if (!existing) {
      const { data: legacyRows } = await db.from('reviews')
        .select('scores_json')
        .eq('class_code', currentClassCode)
        .eq('review_date', date)
        .eq('reviewer_id', String(reviewerId))
        .eq('target_id', String(id))
        .limit(1);
      existing = (legacyRows && legacyRows.length > 0) ? legacyRows[0] : null;
    }

    // Final fallback: class_code mismatch in old demo data.
    if (!existing) {
      const { data: looseRows } = await db.from('reviews')
        .select('scores_json')
        .eq('review_date', date)
        .eq('reviewer_id', String(reviewerId))
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
  if (!currentStudent) return;
  if (currentStudent.type === 'group') {
    const canUseGroup = await ensureGroupAssignedOrBlock({ showAlert: true, persistFallback: true });
    if (!canUseGroup) return;
  }
  const reviewType = currentStudent.type || 'individual';
  const reviewerId = getActivePeerId(reviewType);
  const btn = document.getElementById('submitBtn'); const msg = document.getElementById('submitMsg');
  const data = { class_code: currentClassCode, review_date: document.getElementById('reviewDate').value, reviewer_id: String(reviewerId), target_id: document.getElementById('targetId').value, review_content: document.getElementById('reviewContent').value, scores_json: { criteria: ratingCriteria, scores: currentRatings }, review_type: reviewType, reviewer_email: '' };
  if (!data.target_id) { showMsg(msg, '평가 대상을 선택해주세요.', 'error'); return; }
  if (data.reviewer_id === data.target_id) { showMsg(msg, '자기 자신/모둠은 평가할 수 없습니다.', 'error'); return; }
  if (data.review_content.trim().length < 100) { showMsg(msg, '피드백은 최소 100자 이상 입력해주세요.', 'error'); return; }
  if (ratingCriteria.length > 0 && Object.keys(currentRatings).length !== ratingCriteria.length) { showMsg(msg, '모든 평가 기준에 점수를 선택해주세요.', 'error'); return; }
  setLoading(true, btn, '확인 중...');
  const { data: existing } = await db.from('reviews').select('review_content').eq('class_code', currentClassCode).eq('review_date', data.review_date).eq('reviewer_id', data.reviewer_id).eq('target_id', data.target_id).eq('review_type', data.review_type).maybeSingle();
  if (existing) {
    setLoading(false, btn, '평가 제출하기');
    const targetSuffix = data.review_type === 'group' ? '모둠' : '번';
    showModal({
      type: 'confirm', icon: '⚠️', title: '이미 평가한 대상입니다',
      message: data.target_id + targetSuffix + '에게 이미 평가를 제출했습니다.<br><br><div style="background:var(--bg-soft);padding:10px;border-radius:8px;font-size:0.85rem;text-align:left;max-height:80px;overflow-y:auto;margin-bottom:10px;">"' + existing.review_content.substring(0, 60) + (existing.review_content.length > 60 ? '...' : '') + '"</div><strong>새 내용으로 덮어쓰시겠습니까?</strong>',
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
  syncPeerReviewerUi();
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
  if (!currentStudent) return;
  if (currentStudent.type === 'group') {
    const canUseGroup = await ensureGroupAssignedOrBlock({ showAlert: true, persistFallback: true });
    if (!canUseGroup) return;
  }
  const reviewType = currentStudent.type || 'individual';
  const peerId = getActivePeerId(reviewType);
  const date = document.getElementById('viewDate').value;
  const btn = document.getElementById('viewResultBtn'); const msg = document.getElementById('viewMsg');
  setLoading(true, btn, '확인 중...'); document.getElementById('resultArea').classList.add('hidden');
  const { data: reviews, error: reviewsError } = await db.from('reviews').select('*').eq('class_code', currentClassCode).eq('review_date', date).eq('target_id', String(peerId)).eq('review_type', reviewType);
  if (reviewsError) { setLoading(false, btn, '내 결과 확인하기'); showMsg(msg, '결과 조회 중 오류: ' + reviewsError.message, 'error'); return; }
  if (!reviews || reviews.length === 0) { setLoading(false, btn, '내 결과 확인하기'); showMsg(msg, '해당 날짜(' + date + ')에 받은 평가가 없습니다.', 'error'); return; }
  const { data: allReviews, error: allReviewsError } = await db.from('reviews').select('target_id, scores_json').eq('class_code', currentClassCode).eq('review_date', date).eq('review_type', reviewType);
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
    eval_type: reviewType,
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
  } catch (e) { }

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let res;
    try {
      res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptText,
          ...(config.generationConfig ? { generationConfig: config.generationConfig } : {})
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const contentType = res.headers.get('content-type') || '';

    // 에러 응답은 JSON으로 옴
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const apiError = repairMojibakeText(data?.error || '');
      const code = data?.code || 'provider_error';
      if (code === 'auth_error') return { ok: false, code, error: apiError || 'AI authentication error.' };
      if (code === 'quota_exceeded') return { ok: false, code, error: 'AI 사용량 초과: 잠시 후 다시 시도해 주세요.' };
      if (code === 'network_error') return { ok: false, code, error: '네트워크 오류: 인터넷 연결 상태를 확인하거나 잠시 후 다시 시도해 주세요.' };
      if (code === 'provider_unavailable') return { ok: false, code, error: 'AI 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.' };
      return { ok: false, code, error: apiError || ('HTTP ' + res.status) };
    }

    // 스트림 응답 파싱 (SSE 형태: "data: {...}\n" 반복)
    // content-type이 text/event-stream이 아닐 수도 있으므로 body를 텍스트로 읽어서 판별
    const rawBody = await res.text();

    // SSE 형태인지 확인: "data: " 로 시작하는 줄이 있으면 SSE
    if (rawBody.includes('data: {')) {
      let fullText = '';
      const lines = rawBody.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const chunk = JSON.parse(jsonStr);
          if (chunk.error) continue;
          const parts = chunk?.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const p of parts) {
              if (p && typeof p.text === 'string') fullText += p.text;
            }
          }
        } catch { /* 파싱 불가 청크 무시 */ }
      }
      const text = repairMojibakeText(fullText.trim());
      return text ? { ok: true, text } : { ok: false, code: 'empty_response', error: 'AI 응답이 비어 있습니다.' };
    }

    // 폴백: 일반 JSON 응답
    try {
      const data = JSON.parse(rawBody);
      const apiText = repairMojibakeText(data?.text || '');
      return apiText ? { ok: true, text: apiText } : { ok: false, code: 'empty_response', error: 'AI 응답이 비어 있습니다.' };
    } catch {
      return { ok: false, code: 'parse_error', error: 'AI 응답을 파싱할 수 없습니다.' };
    }
  } catch (e) {
    if (isAbortLikeError(e)) {
      return { ok: false, code: 'timeout', error: 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.' };
    }
    return { ok: false, code: 'network_error', error: '네트워크 오류: 인터넷 연결 상태를 확인하거나 잠시 후 다시 시도해 주세요.' };
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
    '친구들이 남긴 피드백을 바탕으로, 학생의 성장 파트너 유형에 맞는',
    '톤·구조·실천 방식으로 맞춤 피드백을 작성한다.',
    '',
    '[INPUT]',
    '{ student_partner, evaluation_context }',
    JSON.stringify(inputObj, null, 2),
    '',
    '[8 TYPE LIBRARY]',
    '{ buildPartnerTypeLibraryText() }',
    buildPartnerTypeLibraryText(),
    '',
    '[OUTPUT: 마크다운만]',
    `## ${header1}`,
    `## ${header2}`,
    `## ${header3}`,
    '',
    '[작성 규칙]',
    '1) review_texts를 의미별로 묶어 3~5개 포인트로 정리.',
    '2) 학생 성향 3축+보조태그 조합 적용(필수):',
    '   [코칭 스타일 — 톤]',
    '   - 해결형: 직설적으로 짚고 구체 행동 제안',
    '   - 지지형: 공감 먼저 + 부드럽게 행동 제안',
    '   [정보 처리 — 구조]',
    '   - 디테일형: 항목별 근거 + 체크리스트(최대 3)',
    '   - 큰그림형: 흐름 요약 + 방향 1문장 + 질문 2개',
    '   [실행 전략 — 실천 형태]',
    '   - 계획형: 일정/우선순위 포함',
    '   - 탐색형: 작은 실험 1개 제안',
    '   [보조태그 — 활동 종류]',
    '   - #함께 성장형: 협력 활동 포함',
    '   - #혼자 집중형: 개인 활동 포함',
    '3) 실천(헤더3)은 1~2개. 전체 12~18문장.'
  ].join('\n');

  const result = await callGemini(prompt, { generationConfig: { temperature: 0.45, maxOutputTokens: 4000 } });
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
    teacherSubjectCommentLastSettings = { ...(teacherSubjectCommentLastSettings || {}), ...info };
  }
  loadTeacherSemesterSettingsUI(info);
}

function loadTeacherSemesterSettingsUI(info = null) {
  const sem1StartEl = document.getElementById('settingSemester1Start');
  const sem1EndEl = document.getElementById('settingSemester1End');
  const sem2StartEl = document.getElementById('settingSemester2Start');
  const sem2EndEl = document.getElementById('settingSemester2End');
  if (!sem1StartEl || !sem1EndEl || !sem2StartEl || !sem2EndEl) return;

  const source = info || teacherSubjectCommentLastSettings || {};
  const sem1 = getTeacherSubjectCommentSemesterRange(1, source);
  const sem2 = getTeacherSubjectCommentSemesterRange(2, source);

  sem1StartEl.value = String(sem1.start || '');
  sem1EndEl.value = String(sem1.end || '');
  sem2StartEl.value = String(sem2.start || '');
  sem2EndEl.value = String(sem2.end || '');
}

async function saveTeacherSemesterSettingsUI(btn) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  if (!currentClassCode) return;

  const sem1StartEl = document.getElementById('settingSemester1Start');
  const sem1EndEl = document.getElementById('settingSemester1End');
  const sem2StartEl = document.getElementById('settingSemester2Start');
  const sem2EndEl = document.getElementById('settingSemester2End');
  if (!sem1StartEl || !sem1EndEl || !sem2StartEl || !sem2EndEl) return;

  const semester1Start = String(sem1StartEl.value || '').trim();
  const semester1End = String(sem1EndEl.value || '').trim();
  const semester2Start = String(sem2StartEl.value || '').trim();
  const semester2End = String(sem2EndEl.value || '').trim();

  if (!semester1Start || !semester1End || !semester2Start || !semester2End) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 확인', message: '1학기/2학기 시작일과 종료일을 모두 입력해 주세요.' });
    return;
  }
  if (semester1Start > semester1End || semester2Start > semester2End) {
    showModal({ type: 'alert', icon: '⚠️', title: '기간 확인', message: '시작일은 종료일보다 늦을 수 없습니다.' });
    return;
  }

  const patch = {
    semester1_start: semester1Start,
    semester1_end: semester1End,
    semester2_start: semester2Start,
    semester2_end: semester2End
  };

  setLoading(true, btn, '저장 중...');
  try {
    const { error } = await db.from('classes').update(patch).eq('class_code', currentClassCode);
    if (error) throw error;

    teacherSubjectCommentLastSettings = { ...(teacherSubjectCommentLastSettings || {}), ...patch };
    loadTeacherSemesterSettingsUI(teacherSubjectCommentLastSettings);
    applyTeacherSemesterDatesFromCache();
    refreshTeacherSubjectCommentSubjects();
    refreshTeacherSubjectCommentActions();

    if (currentTeacherDiarySubTab === 'comment') {
      loadTeacherSavedSubjectComment();
    }

    showModal({ type: 'alert', icon: '✅', title: '저장 완료', message: '학기 기준 기간이 저장되었습니다.' });
  } catch (err) {
    console.warn('Failed to save teacher semester settings:', err);
    showModal({
      type: 'alert',
      icon: '⚠️',
      title: '설정 저장 실패',
      message: '학기 기준 기간을 저장할 수 없습니다. Supabase에 스키마 업데이트(컬럼 추가)가 필요합니다.<br><br><small>classes.semester1_start / semester1_end / semester2_start / semester2_end</small>'
    });
  } finally {
    setLoading(false, btn, '💾 학기 기준 저장하기');
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
function normalizeGroupAssignmentValue(value) {
  const parsed = parseOptionalPositiveInt(value);
  return parsed ? String(parsed) : '';
}

function getStudentGroupMappingDiffs() {
  if (!studentGroupMappingState) return [];
  const ids = Object.keys(studentGroupMappingState.original || {});
  const diffs = [];
  ids.forEach((profileId) => {
    const oldGroup = studentGroupMappingState.original[profileId] || '';
    const newGroup = studentGroupMappingState.draft[profileId] || '';
    if (oldGroup === newGroup) return;
    const meta = (studentGroupMappingState.meta && studentGroupMappingState.meta[profileId]) || {};
    diffs.push({
      profileId,
      studentNumber: meta.studentNumber || '',
      oldGroup: oldGroup || null,
      newGroup: newGroup || null
    });
  });
  return diffs.sort((a, b) => Number(a.studentNumber || 0) - Number(b.studentNumber || 0));
}

function refreshStudentGroupMappingDirtyUi() {
  const saveBtn = document.getElementById('saveGroupMappingBtn');
  const notice = document.getElementById('groupMappingNotice');
  const diffs = getStudentGroupMappingDiffs();
  const dirtyCount = diffs.length;

  if (saveBtn) {
    saveBtn.disabled = dirtyCount === 0;
    saveBtn.classList.toggle('is-dirty', dirtyCount > 0);
    if (isDemoMode) {
      saveBtn.textContent = dirtyCount > 0
        ? '🔒 체험 모드: 저장 불가 (' + dirtyCount + '건 변경)'
        : '🔒 체험 모드: 저장 불가';
    } else {
      saveBtn.textContent = dirtyCount > 0
        ? '💾 모둠 배정 일괄 저장 (' + dirtyCount + '건)'
        : '💾 모둠 배정 일괄 저장';
    }
  }

  if (notice) {
    if (isDemoMode) {
      notice.textContent = dirtyCount > 0
        ? '체험 모드에서는 모둠 선택은 가능하지만 저장되지 않습니다.'
        : '체험 모드입니다. 모둠 선택 체험만 가능하고 실제 저장은 차단됩니다.';
    } else {
      notice.textContent = dirtyCount > 0
        ? '변경 ' + dirtyCount + '건이 있습니다. 저장 시 변경에 연관된 모둠평가 기록(이전+새 모둠)이 초기화됩니다.'
        : '모둠 변경 시 개인정보 보호를 위해 변경에 연관된 모둠평가 기록(이전+새 모둠)이 초기화됩니다.';
    }
  }
}

function persistDemoTeacherGroupMappingDraft() {
  if (!isDemoMode || !studentGroupMappingState) return;
  const draft = studentGroupMappingState.draft || {};
  const payload = {};
  Object.keys(draft).forEach((profileId) => {
    if (!String(profileId).startsWith('demo-')) return;
    payload[profileId] = normalizeGroupAssignmentValue(draft[profileId]);
  });
  saveDemoTeacherGroupMappingToStorage(payload);
}

function handleStudentGroupMappingChange(selectEl) {
  if (!studentGroupMappingState || !selectEl) return;
  const profileId = String(selectEl.dataset.profileId || '');
  if (!profileId) return;
  const newValue = normalizeGroupAssignmentValue(selectEl.value);
  studentGroupMappingState.draft[profileId] = newValue;
  const row = selectEl.closest('.teacher-student-auth-item');
  if (row) row.classList.toggle('is-group-dirty', (studentGroupMappingState.original[profileId] || '') !== newValue);
  if (isDemoMode && profileId.startsWith('demo-')) {
    persistDemoTeacherGroupMappingDraft();
  }
  refreshStudentGroupMappingDirtyUi();
}

async function loadStudentMappingData() {
  const grid = document.getElementById('studentMappingGrid');
  if (!grid) return;
  grid.innerHTML = '<p class="teacher-list-loading">\uB85C\uB529 \uC911...</p>';

  const { data: classData } = await db.from('classes').select('student_count, group_count').eq('class_code', currentClassCode).maybeSingle();
  const studentCount = Number(classData?.student_count) || 30;
  const groupCount = Number(classData?.group_count) || 6;

  const { data: profiles } = await db.from('user_profiles')
    .select('id, student_number, google_email, group_number, student_type')
    .eq('class_code', currentClassCode)
    .eq('role', 'student')
    .order('student_number');

  const profileMap = {};
  (profiles || []).forEach((p) => {
    const studentNumber = parseOptionalPositiveInt(p.student_number);
    if (!studentNumber) return;
    profileMap[studentNumber] = p;
  });

  studentGroupMappingState = {
    groupCount,
    original: {},
    draft: {},
    meta: {}
  };
  const demoGroupDraft = isDemoMode ? loadDemoTeacherGroupMappingFromStorage() : {};

  grid.innerHTML = '';

  for (let i = 1; i <= studentCount; i++) {
    const row = document.createElement('div');
    row.className = 'student-auth-item teacher-student-auth-item';

    const label = document.createElement('label');
    label.className = 'teacher-student-auth-label';
    label.textContent = i + '번';
    row.appendChild(label);

    const p = profileMap[i];
    if (!p && isDemoMode) {
      const demoProfileId = 'demo-' + String(i);
      const email = document.createElement('span');
      email.className = 'teacher-student-auth-email';
      email.title = '체험 학생';
      email.textContent = '(체험 학생)';
      row.appendChild(email);

      const controls = document.createElement('div');
      controls.className = 'teacher-group-mapping-controls';

      const select = document.createElement('select');
      select.className = 'teacher-group-select';
      select.dataset.profileId = demoProfileId;

      const unassigned = document.createElement('option');
      unassigned.value = '';
      unassigned.textContent = '미배정';
      select.appendChild(unassigned);

      for (let g = 1; g <= groupCount; g++) {
        const option = document.createElement('option');
        option.value = String(g);
        option.textContent = g + '모둠';
        select.appendChild(option);
      }

      const savedDraft = normalizeGroupAssignmentValue(
        demoGroupDraft[demoProfileId] || demoGroupDraft[String(i)] || ''
      );
      select.value = savedDraft;
      select.addEventListener('change', () => handleStudentGroupMappingChange(select));
      controls.appendChild(select);

      const demoNote = document.createElement('span');
      demoNote.className = 'teacher-group-note';
      demoNote.textContent = '체험용';
      controls.appendChild(demoNote);
      row.appendChild(controls);

      studentGroupMappingState.original[demoProfileId] = savedDraft;
      studentGroupMappingState.draft[demoProfileId] = savedDraft;
      studentGroupMappingState.meta[demoProfileId] = { studentNumber: String(i), isDemoVirtual: true };

      grid.appendChild(row);
      continue;
    }

    if (!p) {
      const empty = document.createElement('span');
      empty.className = 'teacher-student-auth-empty';
      empty.textContent = '미등록';
      row.appendChild(empty);
      grid.appendChild(row);
      continue;
    }

    const email = document.createElement('span');
    email.className = 'teacher-student-auth-email';
    email.title = p.google_email || '';
    email.textContent = p.google_email
      ? (p.google_email.length > 20 ? p.google_email.substring(0, 18) + '...' : p.google_email)
      : '(이메일 없음)';
    row.appendChild(email);

    const controls = document.createElement('div');
    controls.className = 'teacher-group-mapping-controls';

    const select = document.createElement('select');
    select.className = 'teacher-group-select';
    select.dataset.profileId = String(p.id || '');

    const unassigned = document.createElement('option');
    unassigned.value = '';
    unassigned.textContent = '미배정';
    select.appendChild(unassigned);

    for (let g = 1; g <= groupCount; g++) {
      const option = document.createElement('option');
      option.value = String(g);
      option.textContent = g + '모둠';
      select.appendChild(option);
    }

    const currentGroup = normalizeGroupAssignmentValue(p.group_number);
    const currentGroupNum = parseOptionalPositiveInt(p.group_number);
    const isOutOfRange = !!(currentGroupNum && currentGroupNum > groupCount);
    if (isOutOfRange) {
      const outOfRangeOption = document.createElement('option');
      outOfRangeOption.value = currentGroup;
      outOfRangeOption.textContent = currentGroup + '모둠 (범위 초과)';
      select.appendChild(outOfRangeOption);
      row.classList.add('teacher-group-out-of-range');
    }

    select.value = currentGroup;
    select.addEventListener('change', () => handleStudentGroupMappingChange(select));
    controls.appendChild(select);

    if (p.student_type === 'group' && !currentGroup) {
      const legacyBadge = document.createElement('span');
      legacyBadge.className = 'teacher-group-legacy-badge';
      legacyBadge.textContent = '구형 모둠 계정';
      controls.appendChild(legacyBadge);
    }

    if (isOutOfRange) {
      const outOfRangeNote = document.createElement('span');
      outOfRangeNote.className = 'teacher-group-note teacher-group-out-of-range';
      outOfRangeNote.textContent = '현재 모둠 수 범위를 벗어났습니다.';
      controls.appendChild(outOfRangeNote);
    }

    row.appendChild(controls);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'teacher-student-auth-remove';
    removeBtn.textContent = '해제';
    removeBtn.onclick = () => removeStudentMapping(String(p.id || ''), i);
    row.appendChild(removeBtn);

    const profileId = String(p.id || '');
    studentGroupMappingState.original[profileId] = currentGroup;
    studentGroupMappingState.draft[profileId] = currentGroup;
    studentGroupMappingState.meta[profileId] = { studentNumber: String(i) };

    grid.appendChild(row);
  }

  refreshStudentGroupMappingDirtyUi();
}

async function saveStudentGroupMappings(btn) {
  if (isDemoMode) { showDemoBlockModal(); return; }
  if (!studentGroupMappingState) return;

  const diffs = getStudentGroupMappingDiffs();
  if (diffs.length === 0) {
    showModal({ type: 'alert', icon: 'ℹ️', title: '변경 없음', message: '저장할 모둠 변경 사항이 없습니다.' });
    return;
  }

  const impactedGroups = Array.from(new Set(
    diffs.flatMap((item) => [item.oldGroup, item.newGroup]).filter(Boolean)
  )).sort((a, b) => Number(a) - Number(b));

  const preview = diffs.slice(0, 8).map((item) => {
    const oldText = item.oldGroup ? (item.oldGroup + '모둠') : '미배정';
    const newText = item.newGroup ? (item.newGroup + '모둠') : '미배정';
    return item.studentNumber + '번: ' + oldText + ' → ' + newText;
  }).join('<br>');
  const extraCount = diffs.length > 8 ? ('<br>외 ' + (diffs.length - 8) + '건') : '';
  const impactedText = impactedGroups.length > 0
    ? impactedGroups.map((g) => g + '모둠').join(', ')
    : '없음';

  showModal({
    type: 'confirm',
    icon: '👥',
    title: '모둠 배정 저장',
    message:
      '총 <strong>' + diffs.length + '건</strong>을 저장하시겠습니까?<br><br>' +
      '<div style="text-align:left; background:var(--bg-soft); border-radius:8px; padding:10px; max-height:160px; overflow:auto;">' + preview + extraCount + '</div>' +
      '<p style="margin:10px 0 0; font-size:0.82rem; color:var(--text-sub);">초기화 대상 모둠: ' + impactedText + '<br>개인정보 보호를 위해 해당 모둠의 모둠평가 기록이 삭제됩니다.</p>',
    onConfirm: async () => {
      setLoading(true, btn, '저장 중...');
      try {
        const updateResults = await Promise.all(diffs.map((item) =>
          db.from('user_profiles')
            .update({ group_number: item.newGroup ? Number(item.newGroup) : null })
            .eq('id', item.profileId)
        ));
        const updateError = updateResults.find((r) => r.error)?.error;
        if (updateError) throw updateError;

        let resetError = null;
        if (impactedGroups.length > 0) {
          const inList = impactedGroups
            .map((v) => parseOptionalPositiveInt(v))
            .filter((v) => v !== null)
            .join(',');
          if (inList) {
            const { error } = await db.from('reviews')
              .delete()
              .eq('class_code', currentClassCode)
              .eq('review_type', 'group')
              .or('reviewer_id.in.(' + inList + '),target_id.in.(' + inList + ')');
            if (error) resetError = error;
          }
        }

        await loadStudentMappingData();
        if (resetError) {
          showModal({
            type: 'alert',
            icon: '⚠️',
            title: '배정 저장 완료 (초기화 일부 실패)',
            message: '모둠 배정은 저장되었지만 모둠평가 기록 초기화 중 일부 오류가 발생했습니다.<br><br><small>' + escapeHtml(resetError.message || 'unknown error') + '</small>'
          });
        } else {
          showModal({
            type: 'alert',
            icon: '✅',
            title: '저장 완료',
            message: '모둠 배정 저장 및 연관 모둠평가 기록 초기화가 완료되었습니다.'
          });
        }
      } catch (error) {
        console.error('모둠 배정 저장 오류:', error);
        showModal({ type: 'alert', icon: '❌', title: '저장 실패', message: '모둠 배정을 저장할 수 없습니다: ' + error.message });
      } finally {
        setLoading(false, btn, '💾 모둠 배정 일괄 저장');
        refreshStudentGroupMappingDirtyUi();
      }
    }
  });
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
    } catch (e) { }
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
    '당신은 동료평가 기준을 생성하는 전문가입니다.\n\n' +
    '입력:\n' +
    '- 학년: ' + grade + '\n' +
    '- 평가 대상: ' + targetText + '\n' +
    '- 학습 목표: ' + (objTask.objective || '(none)') + '\n' +
    '- 과제: ' + (objTask.task || '(none)') + '\n\n' +
    '규칙:\n' +
    '1) 입력된 학년/평가 대상/학습 목표/과제를 반드시 반영해 기준을 작성하세요.\n' +
    '2) 3개 영역(지식·이해, 과정·기능, 가치·태도)을 각각 2개씩 포함하세요.\n' +
    '\n' +
    '출력 형식(엄격한 JSON만, 마크다운/설명 금지, criteria 항목 정확히 6개):\n' +
    '{"criteria":["...","...","...","...","...","..."]}';

  const generationConfig = {
    temperature: 0.1,
    maxOutputTokens: 1500,
    responseMimeType: 'application/json'
  };

  const result = await callGemini(prompt, { generationConfig });
  setLoading(false, btn, '\uD83E\uDD16 2\uB2E8\uACC4: AI\uB85C \uAE30\uC900 \uC790\uB3D9 \uC0DD\uC131\uD558\uAE30');

  if (!result.ok) {
    showModal({ type: 'alert', icon: '\u274C', title: '\uC0DD\uC131 \uC2E4\uD328', message: result.error });
    return;
  }

  try {
    const criteria = parseCriteriaFromAiText(result.text);

    if (!criteria || criteria.length !== 6) {
      const rawPreview = String(result.text || '')
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
    '   - 큰 그림형: 오늘 배운 것이 전체에서 어떤 의미인지 한 줄',
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

  const result = await callGemini(prompt, { generationConfig: { temperature: 0.55, maxOutputTokens: 3000 } });

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
  const hintDateEl = document.getElementById('diaryHintViewDate');
  if (hintDateEl && !String(hintDateEl.value || '').trim()) hintDateEl.value = today;
}

function getTeacherDiarySelectedDate() {
  return document.getElementById('diaryViewDate')?.value
    || document.getElementById('diaryStudentViewDate')?.value
    || '';
}

function getTeacherHintSelectedDate() {
  return document.getElementById('diaryHintViewDate')?.value || '';
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

function handleTeacherHintDateChange() {
  const selectedDate = String(getTeacherHintSelectedDate() || '').trim();
  if (!selectedDate) return;
  loadTeacherHintData();
}

async function loadTeacherHintData() {
  if (!currentClassCode) return;

  const selectedDate = String(getTeacherHintSelectedDate() || '').trim();
  if (!selectedDate) return;

  try {
    const { data: rows, error } = await db.from('daily_reflections')
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('reflection_date', selectedDate);
    if (error) throw error;
    renderEmotionAlerts(rows || [], selectedDate);
  } catch (error) {
    console.error('Error loading hint data:', error);
    showModal({ type: 'alert', icon: '❌', title: '오류', message: '수업 개선 단서 로드 실패: ' + error.message });
  }
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
  const maxCount = Number(settings.studentCount) || 0;
  const myStudentNumber = getStudentNumber();
  const grid = document.getElementById('praiseTargetGrid');
  grid.innerHTML = '';
  for (let i = 1; i <= maxCount; i++) {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.textContent = i + '번'; btn.className = 'target-btn';
    if (String(i) === myStudentNumber) { btn.classList.add('disabled'); }
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
    sender_id: String(getStudentNumber()),
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
  const { data: praises } = await db.from('praise_messages').select('*').eq('class_code', currentClassCode).eq('receiver_id', String(getStudentNumber())).eq('is_approved', true).order('created_at', { ascending: false });
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

const teacherDifficultyMapState = {
  selectedSubject: '전체',
  selectedSignal: '전체',
  reflections: [],
  selectedDate: '',
  lastStudentCount: 0,
  lastUnresolvedCount: 0,
  hasInitializedSubject: false
};

function clipDifficultyMapText(text, maxLen = 96) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  return source.length > maxLen ? (source.slice(0, maxLen) + '...') : source;
}

function mergeDifficultyMapList(base, incoming, limit = 3) {
  const merged = Array.isArray(base) ? base.slice() : [];
  const source = Array.isArray(incoming) ? incoming : [];
  source.forEach(item => {
    const clipped = clipDifficultyMapText(item, 96);
    if (!clipped || merged.includes(clipped)) return;
    merged.push(clipped);
  });
  return merged.slice(0, limit);
}

function extractDifficultyMapSignals(text) {
  const source = String(text || '').replace(/\r\n/g, '\n').trim();
  const empty = { hard: [], confusing: [], unresolved: [], resolved: [] };
  if (!source) return empty;

  const hard = [];
  const confusing = [];
  const unresolved = [];
  const resolved = [];
  const pushHard = (value) => { const next = mergeDifficultyMapList(hard, [value], 3); hard.length = 0; hard.push(...next); };
  const pushConfusing = (value) => { const next = mergeDifficultyMapList(confusing, [value], 3); confusing.length = 0; confusing.push(...next); };
  const pushUnresolved = (value) => { const next = mergeDifficultyMapList(unresolved, [value], 3); unresolved.length = 0; unresolved.push(...next); };
  const pushResolved = (value) => { const next = mergeDifficultyMapList(resolved, [value], 2); resolved.length = 0; resolved.push(...next); };

  const labeledRules = [
    { re: /^어려(?:웠던|운)\s*점\s*[:：]\s*(.+)$/i, hard: true, unresolved: true },
    { re: /^헷갈(?:렸던|리는)\s*점\s*[:：]\s*(.+)$/i, confusing: true, unresolved: true },
    { re: /^아직\s*(?:도\s*)?헷갈리는\s*점\s*[:：]\s*(.+)$/i, confusing: true, unresolved: true },
    { re: /^아직\s*해결\s*안\s*된\s*점\s*[:：]\s*(.+)$/i, unresolved: true },
    { re: /^미해결\s*점\s*[:：]\s*(.+)$/i, unresolved: true },
    { re: /^(?:이해\s*\/\s*해결\s*방법|해결\s*방법|해결\s*단서)\s*[:：]\s*(.+)$/i, resolved: true }
  ];

  const lines = source.split('\n').map(line => line.trim()).filter(Boolean);
  lines.forEach(line => {
    for (const rule of labeledRules) {
      const match = line.match(rule.re);
      if (!match) continue;
      const value = clipDifficultyMapText(match[1], 96);
      if (!value) break;
      if (rule.hard) pushHard(value);
      if (rule.confusing) pushConfusing(value);
      if (rule.unresolved) pushUnresolved(value);
      if (rule.resolved) pushResolved(value);
      break;
    }
  });

  const unresolvedRe = /(아직|여전히|계속|헷갈|어렵|모르겠|막혔|막막|이해가\s*잘?\s*안|안\s*풀|못\s*풀)/;
  const resolvedRe = /(해결|알게\s*되|이해했|이해하게|정리(했|하게)|고쳤|개선|방법을?\s*찾|풀어냈)/;
  const hardRe = /(어렵|어려웠|막혔|막막)/;
  const confusingRe = /(헷갈|혼동|구분이\s*안)/;

  const parts = source.split(/\n+|[.!?]\s+/).map(s => s.trim()).filter(Boolean);
  parts.forEach(part => {
    const clipped = clipDifficultyMapText(part, 96);
    if (!clipped) return;
    const isResolved = resolvedRe.test(part);
    const isUnresolved = unresolvedRe.test(part);
    if (isResolved) pushResolved(clipped);
    if (isUnresolved && !isResolved) {
      pushUnresolved(clipped);
      if (hardRe.test(part)) pushHard(clipped);
      if (confusingRe.test(part)) pushConfusing(clipped);
    }
  });

  if (unresolved.length === 0) {
    mergeDifficultyMapList(unresolved, hard, 3).forEach(item => pushUnresolved(item));
    mergeDifficultyMapList(unresolved, confusing, 3).forEach(item => pushUnresolved(item));
  }

  return {
    hard: hard.slice(0, 3),
    confusing: confusing.slice(0, 3),
    unresolved: unresolved.slice(0, 3),
    resolved: resolved.slice(0, 2)
  };
}

function buildDifficultyMapData(reflections, selectedDate = '') {
  const byStudent = new Map();
  (Array.isArray(reflections) ? reflections : []).forEach(reflection => {
    const studentId = String(reflection?.student_id || '').trim();
    if (!studentId) return;

    const signals = extractDifficultyMapSignals(reflection?.learning_text || '');
    const hasSignal = signals.hard.length || signals.confusing.length || signals.unresolved.length;
    if (!hasSignal) return;

    const existing = byStudent.get(studentId) || {
      studentId,
      latestDate: '',
      tags: [],
      hard: [],
      confusing: [],
      unresolved: [],
      resolved: []
    };

    const tags = Array.isArray(reflection?.subject_tags)
      ? reflection.subject_tags.map(tag => String(tag || '').trim()).filter(Boolean)
      : [];
    const normalizedTags = tags.length ? tags : ['미태그'];
    existing.tags = Array.from(new Set(existing.tags.concat(normalizedTags))).slice(0, 12);
    existing.hard = mergeDifficultyMapList(existing.hard, signals.hard, 3);
    existing.confusing = mergeDifficultyMapList(existing.confusing, signals.confusing, 3);
    existing.unresolved = mergeDifficultyMapList(existing.unresolved, signals.unresolved, 3);
    existing.resolved = mergeDifficultyMapList(existing.resolved, signals.resolved, 2);

    const reflectionDate = String(reflection?.reflection_date || selectedDate || '').trim();
    if (reflectionDate && (!existing.latestDate || reflectionDate > existing.latestDate)) {
      existing.latestDate = reflectionDate;
    }
    byStudent.set(studentId, existing);
  });

  const toSortableStudentNumber = (studentId) => {
    const parsed = Number(String(studentId || '').replace(/[^0-9]/g, ''));
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  };

  const students = Array.from(byStudent.values()).sort((a, b) => {
    const unresolvedGap = (b.unresolved.length || 0) - (a.unresolved.length || 0);
    if (unresolvedGap !== 0) return unresolvedGap;
    const dateGap = String(b.latestDate || '').localeCompare(String(a.latestDate || ''));
    if (dateGap !== 0) return dateGap;
    const numberGap = toSortableStudentNumber(a.studentId) - toSortableStudentNumber(b.studentId);
    if (numberGap !== 0) return numberGap;
    return String(a.studentId || '').localeCompare(String(b.studentId || ''));
  });

  const tagMap = new Map();
  students.forEach(student => {
    (student.tags.length ? student.tags : ['미태그']).forEach(tag => {
      const key = String(tag || '').trim() || '미태그';
      const existing = tagMap.get(key) || { tag: key, studentCount: 0, unresolvedCount: 0 };
      existing.studentCount += 1;
      existing.unresolvedCount += student.unresolved.length || 0;
      tagMap.set(key, existing);
    });
  });

  const tagStats = Array.from(tagMap.values()).sort((a, b) => {
    const unresolvedGap = (b.unresolvedCount || 0) - (a.unresolvedCount || 0);
    if (unresolvedGap !== 0) return unresolvedGap;
    const studentGap = (b.studentCount || 0) - (a.studentCount || 0);
    if (studentGap !== 0) return studentGap;
    if (a.tag === '미태그' && b.tag !== '미태그') return 1;
    if (a.tag !== '미태그' && b.tag === '미태그') return -1;
    return String(a.tag || '').localeCompare(String(b.tag || ''), 'ko');
  });

  return { students, tagStats };
}

function renderDifficultyMapTagSummary(tagStats, selectedSubject = '전체') {
  const summary = document.getElementById('difficultyMapTagSummary');
  if (!summary) return;

  const stats = Array.isArray(tagStats) ? tagStats : [];
  const totalStudents = Number(teacherDifficultyMapState.lastStudentCount || 0);
  const totalUnresolved = Number(teacherDifficultyMapState.lastUnresolvedCount || 0);
  const chips = [
    '<button type="button" class="difficulty-map-tag-chip ' + (selectedSubject === '전체' ? 'is-active' : '') + '" data-difficulty-subject="전체">' +
    '<span class="difficulty-map-chip-name">과목 전체</span>' +
    '<span class="difficulty-map-chip-meta">' + totalStudents + '명 · 미해결 ' + totalUnresolved + '</span>' +
    '</button>'
  ];

  stats.forEach(stat => {
    const tag = String(stat?.tag || '').trim();
    if (!tag) return;
    const studentCount = Number(stat?.studentCount || 0);
    const unresolvedCount = Number(stat?.unresolvedCount || 0);
    chips.push(
      '<button type="button" class="difficulty-map-tag-chip ' + (selectedSubject === tag ? 'is-active' : '') + '" data-difficulty-subject="' + escapeHtml(tag) + '">' +
      '<span class="difficulty-map-chip-name">' + escapeHtml(tag) + '</span>' +
      '<span class="difficulty-map-chip-meta">' + studentCount + '명 · 미해결 ' + unresolvedCount + '</span>' +
      '</button>'
    );
  });

  summary.innerHTML = chips.join('');
  Array.from(summary.querySelectorAll('[data-difficulty-subject]')).forEach(btn => {
    btn.addEventListener('click', () => {
      const subject = String(btn.getAttribute('data-difficulty-subject') || '전체');
      setDifficultyMapSubject(subject);
    });
  });
}

function getDifficultySignalLabel(signal) {
  const key = String(signal || '전체');
  if (key === 'hard') return '어려운 점';
  if (key === 'confusing') return '헷갈리는 점';
  if (key === 'unresolved') return '아직 미해결';
  return '전체 단서';
}

function getDifficultySignalItems(student, signal) {
  if (!student) return [];
  const key = String(signal || '전체');
  if (key === 'hard') return Array.isArray(student.hard) ? student.hard : [];
  if (key === 'confusing') return Array.isArray(student.confusing) ? student.confusing : [];
  if (key === 'unresolved') return Array.isArray(student.unresolved) ? student.unresolved : [];
  return [];
}

function renderDifficultyMapSignalSummary(students, selectedSignal = '전체') {
  const summary = document.getElementById('difficultyMapSignalSummary');
  if (!summary) return;

  const rows = Array.isArray(students) ? students : [];
  const stats = [
    { key: '전체', label: '전체', count: rows.length },
    { key: 'hard', label: '어려운 점', count: rows.filter(row => (row?.hard || []).length > 0).length },
    { key: 'confusing', label: '헷갈리는 점', count: rows.filter(row => (row?.confusing || []).length > 0).length },
    { key: 'unresolved', label: '아직 미해결', count: rows.filter(row => (row?.unresolved || []).length > 0).length }
  ];

  summary.innerHTML = stats.map(stat => {
    const toneClass = stat.key === 'hard'
      ? 'tone-hard'
      : (stat.key === 'confusing'
        ? 'tone-confusing'
        : (stat.key === 'unresolved' ? 'tone-unresolved' : 'tone-all'));
    return (
      '<button type="button" class="difficulty-map-tag-chip difficulty-map-signal-chip ' + toneClass + ' ' + (selectedSignal === stat.key ? 'is-active' : '') + '" data-difficulty-signal="' + escapeHtml(stat.key) + '">' +
      '<span class="difficulty-map-chip-name">' + escapeHtml(stat.label) + '</span>' +
      '<span class="difficulty-map-chip-meta">' + stat.count + '명</span>' +
      '</button>'
    );
  }).join('');

  Array.from(summary.querySelectorAll('[data-difficulty-signal]')).forEach(btn => {
    btn.addEventListener('click', () => {
      const signal = String(btn.getAttribute('data-difficulty-signal') || '전체');
      setDifficultyMapSignal(signal);
    });
  });
}

function renderDifficultyMapCards(students, selectedSubject = '전체', selectedSignal = '전체') {
  const list = document.getElementById('emotionAlertList');
  const hint = document.getElementById('difficultyMapFilterHint');
  const signalSummary = document.getElementById('difficultyMapSignalSummary');
  if (!list) return;

  const rows = Array.isArray(students) ? students : [];
  const filteredBySubject = selectedSubject && selectedSubject !== '전체'
    ? rows.filter(row => Array.isArray(row?.tags) && row.tags.includes(selectedSubject))
    : rows;

  const availableSignals = new Set(['전체']);
  if (filteredBySubject.some(row => (row?.hard || []).length > 0)) availableSignals.add('hard');
  if (filteredBySubject.some(row => (row?.confusing || []).length > 0)) availableSignals.add('confusing');
  if (filteredBySubject.some(row => (row?.unresolved || []).length > 0)) availableSignals.add('unresolved');
  if (!availableSignals.has(selectedSignal)) {
    teacherDifficultyMapState.selectedSignal = '전체';
    selectedSignal = '전체';
  }

  if (signalSummary) {
    renderDifficultyMapSignalSummary(filteredBySubject, selectedSignal);
  }

  const filtered = selectedSignal && selectedSignal !== '전체'
    ? filteredBySubject.filter(row => getDifficultySignalItems(row, selectedSignal).length > 0)
    : filteredBySubject;

  if (hint) {
    hint.classList.remove('hidden');
    const dateLabel = teacherDifficultyMapState.selectedDate || '선택 날짜';
    hint.innerHTML =
      '1단계 날짜: <strong>' + escapeHtml(dateLabel) + '</strong> · ' +
      '2단계 과목: <strong>' + escapeHtml(selectedSubject || '전체') + '</strong> · ' +
      '3단계 단서: <strong>' + escapeHtml(getDifficultySignalLabel(selectedSignal)) + '</strong> · ' +
      filtered.length + '명';
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="empty-icon">🧭</span><div class="empty-title">표시할 단서가 없습니다</div><div class="empty-desc">선택한 날짜/과목/단서 조건에 맞는 기록이 없습니다.</div></div>';
    return;
  }

  list.innerHTML = filtered.map((student, idx) => {
    const sid = String(student?.studentId || '').trim();
    const dateText = String(student?.latestDate || teacherDifficultyMapState.selectedDate || '').trim();
    const subtitle = dateText ? (escapeHtml(dateText) + ' 기준') : '선택 날짜 기준';
    const tags = Array.isArray(student?.tags) ? student.tags : [];
    const unresolved = Array.isArray(student?.unresolved) ? student.unresolved : [];
    const hard = Array.isArray(student?.hard) ? student.hard : [];
    const confusing = Array.isArray(student?.confusing) ? student.confusing : [];
    const resolved = Array.isArray(student?.resolved) ? student.resolved : [];
    const selectedRows = selectedSignal === '전체'
      ? (unresolved.length > 0 ? unresolved : mergeDifficultyMapList(hard, confusing, 3))
      : getDifficultySignalItems(student, selectedSignal);
    const selectedTitle = selectedSignal === '전체' ? '아직 해결 안 된 점' : getDifficultySignalLabel(selectedSignal);
    const categoryChips = [
      hard.length > 0 ? ('<span class="difficulty-map-category-chip tone-hard">어려운 점 ' + hard.length + '</span>') : '',
      confusing.length > 0 ? ('<span class="difficulty-map-category-chip tone-confusing">헷갈리는 점 ' + confusing.length + '</span>') : '',
      unresolved.length > 0 ? ('<span class="difficulty-map-category-chip tone-unresolved">아직 미해결 ' + unresolved.length + '</span>') : ''
    ].join('');
    const selectedHtml = selectedRows.length > 0
      ? ('<ul class="emotion-alert-snippet-list">' + selectedRows.map(line => '<li class="emotion-alert-snippet-item">' + escapeHtml(line) + '</li>').join('') + '</ul>')
      : '<div class="difficulty-map-empty-line">' + escapeHtml(selectedTitle) + '이(가) 명시되지 않았습니다.</div>';
    const resolvedHtml = resolved.length > 0
      ? (
        '<details class="difficulty-map-resolved-details" onclick="event.stopPropagation();" onkeydown="event.stopPropagation();">' +
        '<summary onclick="event.stopPropagation();">해결 단서 보기 (' + resolved.length + ')</summary>' +
        '<ul class="emotion-alert-snippet-list">' +
        resolved.map(line => '<li class="emotion-alert-snippet-item">' + escapeHtml(line) + '</li>').join('') +
        '</ul>' +
        '</details>'
      )
      : '';
    const toneClass = 'tone-' + (idx % 3);

    return (
      '<article class="emotion-alert-item difficulty-map-card ' + toneClass + '" role="button" tabindex="0" data-student-id="' + escapeHtml(sid) + '">' +
      '<div class="emotion-alert-head">' +
      '<div class="emotion-alert-student">' + escapeHtml(sid) + '번 학생</div>' +
      '<div class="emotion-alert-date">' + subtitle + '</div>' +
      '</div>' +
      (tags.length > 0
        ? ('<div class="emotion-alert-tags">' + tags.map(tag => '<span class="emotion-alert-tag">' + escapeHtml(tag) + '</span>').join('') + '</div>')
        : '') +
      '<div class="difficulty-map-category-row">' + categoryChips + '</div>' +
      '<div class="emotion-alert-content">' +
      '<div class="emotion-alert-title">' + escapeHtml(selectedTitle) + '</div>' +
      selectedHtml +
      '</div>' +
      resolvedHtml +
      '</article>'
    );
  }).join('');

  Array.from(list.querySelectorAll('.difficulty-map-card')).forEach(card => {
    const sid = String(card.getAttribute('data-student-id') || '').trim();
    if (!sid) return;
    card.addEventListener('click', (event) => {
      if (event.target?.closest?.('.difficulty-map-resolved-details')) return;
      focusTeacherDiaryStudent(sid, teacherDifficultyMapState.selectedDate);
    });
    card.addEventListener('keydown', (event) => {
      if (event.target?.closest?.('.difficulty-map-resolved-details')) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      focusTeacherDiaryStudent(sid, teacherDifficultyMapState.selectedDate);
    });
  });
}

function setDifficultyMapSubject(subject) {
  teacherDifficultyMapState.selectedSubject = String(subject || '전체').trim() || '전체';
  teacherDifficultyMapState.selectedSignal = '전체';
  renderEmotionAlerts(teacherDifficultyMapState.reflections, teacherDifficultyMapState.selectedDate);
}

function setDifficultyMapSignal(signal) {
  teacherDifficultyMapState.selectedSignal = String(signal || '전체').trim() || '전체';
  renderEmotionAlerts(teacherDifficultyMapState.reflections, teacherDifficultyMapState.selectedDate);
}

function setDifficultyMapTag(tag) {
  setDifficultyMapSubject(tag);
}

async function focusTeacherDiaryStudent(studentId, sourceDate = '') {
  const sid = String(studentId || '').trim();
  if (!sid) return;

  const targetDate = String(sourceDate || getTeacherHintSelectedDate() || teacherDifficultyMapState.selectedDate || '').trim();

  // Ensure the target panel is visible.
  try { switchTeacherDiarySubTab('student'); } catch (_) { }

  if (targetDate) {
    const studentDateEl = document.getElementById('diaryStudentViewDate');
    if (studentDateEl) studentDateEl.value = targetDate;
    syncTeacherDiaryDateInputs(targetDate, 'diaryStudentViewDate');
    try { await loadTeacherDiaryData(); } catch (_) { }
  }

  try {
    const listIds = ['diaryStudentSelectorList', 'diaryCompletionList'];
    for (const listId of listIds) {
      const listEl = document.getElementById(listId);
      if (!listEl) continue;
      const btn = Array.from(listEl.querySelectorAll('button')).find(b => (b.textContent || '').includes(sid + '번'));
      if (btn) { btn.click(); return; }
    }
  } catch (_) { }

  // Fallback: at least sync the subject-comment selected student pill if available.
  if (typeof setTeacherSubjectCommentSelectedStudent === 'function') {
    setTeacherSubjectCommentSelectedStudent(sid);
  }
}

// "수업 개선 단서" 렌더링(기존 함수명/호출부 호환 유지)
function renderEmotionAlerts(reflections, selectedDate = null) {
  const area = document.getElementById('emotionAlertArea');
  const list = document.getElementById('emotionAlertList');
  const subjectSummary = document.getElementById('difficultyMapTagSummary');
  const signalSummary = document.getElementById('difficultyMapSignalSummary');
  const filterHint = document.getElementById('difficultyMapFilterHint');
  if (!area || !list) return;

  const dateStr = String(selectedDate || getTeacherHintSelectedDate() || '').trim();
  const prevDate = String(teacherDifficultyMapState.selectedDate || '').trim();
  const sourceRows = Array.isArray(reflections) ? reflections : [];
  const isDateChanged = !!(dateStr && prevDate && prevDate !== dateStr);
  const isDataRefChanged = sourceRows !== teacherDifficultyMapState.reflections;
  teacherDifficultyMapState.reflections = sourceRows.slice();
  teacherDifficultyMapState.selectedDate = dateStr;

  const data = buildDifficultyMapData(teacherDifficultyMapState.reflections, dateStr);
  const totalStudents = data.students.length;
  const totalUnresolved = data.students.reduce((sum, student) => sum + (student.unresolved.length || 0), 0);
  teacherDifficultyMapState.lastStudentCount = totalStudents;
  teacherDifficultyMapState.lastUnresolvedCount = totalUnresolved;

  const orderedSubjects = data.tagStats
    .map(stat => String(stat?.tag || '').trim())
    .filter(Boolean);
  const availableSubjects = new Set(['전체'].concat(orderedSubjects));
  let nextSubject = String(teacherDifficultyMapState.selectedSubject || '').trim() || '전체';

  // 첫 진입은 "과목 전체"가 아니라 데이터의 첫 과목을 기본 선택한다.
  if (!teacherDifficultyMapState.hasInitializedSubject && orderedSubjects.length > 0 && nextSubject === '전체') {
    nextSubject = orderedSubjects[0];
  }
  if ((isDateChanged || isDataRefChanged) && !availableSubjects.has(nextSubject)) {
    nextSubject = orderedSubjects[0] || '전체';
  }
  teacherDifficultyMapState.selectedSubject = nextSubject;
  if (orderedSubjects.length > 0) teacherDifficultyMapState.hasInitializedSubject = true;

  if (totalStudents === 0) {
    area.classList.add('hidden');
    if (subjectSummary) subjectSummary.innerHTML = '';
    if (signalSummary) signalSummary.innerHTML = '';
    if (filterHint) {
      filterHint.classList.add('hidden');
      filterHint.innerHTML = '';
    }
    list.innerHTML = '';
    return;
  }

  area.classList.remove('hidden');
  renderDifficultyMapTagSummary(data.tagStats, teacherDifficultyMapState.selectedSubject);
  renderDifficultyMapCards(data.students, teacherDifficultyMapState.selectedSubject, teacherDifficultyMapState.selectedSignal);
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
    const createdDate = date.toLocaleDateString('ko-KR');
    const reflectionDate = msg.daily_reflections?.reflection_date || createdDate;

    html += `
      <div class="message-card">
        <div class="message-card-header">
          <span class="message-card-badge ${badgeClass}">${studentId}</span>
        </div>
        <div class="message-card-content">${escapeHtml(msg.message_content)}</div>
        <div class="message-card-meta">
          <span>📅 ${reflectionDate}</span>
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
    type_name: '큰 그림형 계획가',
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
    type_name: '큰 그림형 도전가',
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
const PARTNER_TYPE_BY_NAME = {};
PARTNER_TYPES.forEach(t => {
  PARTNER_TYPE_BY_CODE[t.type_code] = t;
  PARTNER_TYPE_BY_NAME[t.type_name] = t;
  PARTNER_TYPE_BY_NAME[t.type_name.replace(/\s+/g, '')] = t;
});

const LEGACY_PARTNER_CODE_BY_CURRENT = {
  '해결디테일계획': 'solver_detail_plan',
  '해결디테일탐색': 'solver_detail_explore',
  '해결큰그림계획': 'solver_big_plan',
  '해결큰그림탐색': 'solver_big_explore',
  '지지디테일계획': 'support_detail_plan',
  '지지디테일탐색': 'support_detail_explore',
  '지지큰그림계획': 'support_big_plan',
  '지지큰그림탐색': 'support_big_explore'
};
const CURRENT_PARTNER_CODE_BY_LEGACY = {};
Object.entries(LEGACY_PARTNER_CODE_BY_CURRENT).forEach(([currentCode, legacyCode]) => {
  CURRENT_PARTNER_CODE_BY_LEGACY[legacyCode] = currentCode;
});

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
  const info_processing = resolveAxisWithPriority(answers, 3, 4, (ans) => ans === 'A' ? '디테일형' : '큰 그림형');
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

function normalizePersonalityTypeCandidate(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function expandPersonalityTypeCandidateVariants(value) {
  const base = normalizePersonalityTypeCandidate(value);
  if (!base) return [];

  const variants = [];
  const push = (v) => {
    const normalized = normalizePersonalityTypeCandidate(v);
    if (!normalized) return;
    if (!variants.includes(normalized)) variants.push(normalized);
  };

  push(base);
  push(base.replace(/\s+/g, ''));
  push(base.replace(/큰\s*그림형/g, '큰그림형'));
  push(base.replace(/큰그림형/g, '큰 그림형'));

  return variants;
}

function collectPersonalityTypeCandidates(partner, existingType, sampledTypes) {
  const candidates = [];
  const push = (value) => {
    const variants = expandPersonalityTypeCandidateVariants(value);
    variants.forEach(v => {
      if (!candidates.includes(v)) candidates.push(v);
    });
  };

  push(existingType);
  (Array.isArray(sampledTypes) ? sampledTypes : []).forEach(push);

  if (partner && typeof partner === 'object') {
    const code = normalizePersonalityTypeCandidate(partner.type_code);
    push(partner.type_name);
    push(code);
    if (code) push(LEGACY_PARTNER_CODE_BY_CURRENT[code]);
  }

  PARTNER_TYPES.forEach(t => {
    push(t.type_name);
    push(t.type_code);
    push(LEGACY_PARTNER_CODE_BY_CURRENT[t.type_code]);
  });

  return candidates;
}

async function sampleExistingPersonalityTypes() {
  if (isDemoMode || !currentClassCode) return [];
  try {
    const { data, error } = await db.from('student_personality')
      .select('personality_type')
      .eq('class_code', currentClassCode)
      .not('personality_type', 'is', null)
      .limit(50);
    if (error) throw error;
    const values = Array.isArray(data) ? data.map(row => row?.personality_type) : [];
    return Array.from(new Set(values.map(normalizePersonalityTypeCandidate).filter(Boolean)));
  } catch (_) {
    return [];
  }
}

function isPersonalityTypeConstraintError(error) {
  const text = [
    error?.message,
    error?.details,
    error?.hint,
    error?.constraint
  ].filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;
  if (text.includes('student_personality_personality_type_check')) return true;
  return text.includes('personality_type') && (
    text.includes('check constraint') ||
    text.includes('violates')
  );
}

async function upsertStudentPersonalityWithFallback(basePayload, typeCandidates) {
  const base = { ...(basePayload || {}) };
  const candidates = Array.from(new Set(
    (Array.isArray(typeCandidates) ? typeCandidates : [])
      .map(normalizePersonalityTypeCandidate)
      .filter(Boolean)
  ));

  const baseType = normalizePersonalityTypeCandidate(base.personality_type);
  if (baseType && !candidates.includes(baseType)) candidates.unshift(baseType);

  const attemptTypes = [null, ...candidates];
  let lastError = null;

  for (let i = 0; i < attemptTypes.length; i++) {
    const personalityType = attemptTypes[i];
    const payload = { ...base };
    if (personalityType) payload.personality_type = personalityType;
    else delete payload.personality_type;

    const { error } = await db.from('student_personality').upsert(payload, { onConflict: 'class_code,student_id' });
    if (!error) {
      const savedType = normalizePersonalityTypeCandidate(payload.personality_type);
      if (savedType) lastKnownPersonalityType = savedType;
      return payload;
    }

    lastError = error;
    if (!isPersonalityTypeConstraintError(error)) break;
  }

  throw lastError || new Error('student_personality upsert failed');
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

function resolvePartnerTypeFromRow(row) {
  if (!row || typeof row !== 'object') return null;

  const rawCode = normalizePersonalityTypeCandidate(row.partner_type_code);
  if (rawCode) {
    const currentCode = PARTNER_TYPE_BY_CODE[rawCode]
      ? rawCode
      : CURRENT_PARTNER_CODE_BY_LEGACY[rawCode];
    if (currentCode && PARTNER_TYPE_BY_CODE[currentCode]) return PARTNER_TYPE_BY_CODE[currentCode];
  }

  const candidates = [
    normalizePersonalityTypeCandidate(row.partner_type_name),
    normalizePersonalityTypeCandidate(row.personality_type)
  ];

  for (let i = 0; i < candidates.length; i++) {
    const value = candidates[i];
    if (!value) continue;

    const byName = PARTNER_TYPE_BY_NAME[value] || PARTNER_TYPE_BY_NAME[value.replace(/\s+/g, '')];
    if (byName) return byName;

    const codeByValue = PARTNER_TYPE_BY_CODE[value]
      ? value
      : CURRENT_PARTNER_CODE_BY_LEGACY[value];
    if (codeByValue && PARTNER_TYPE_BY_CODE[codeByValue]) return PARTNER_TYPE_BY_CODE[codeByValue];
  }

  return null;
}

function inferPartnerAxesFromTypeCode(typeCode, prevAxes = null) {
  const code = normalizePersonalityTypeCandidate(typeCode);
  if (!code) return null;

  const axes = {
    coaching_style: code.startsWith('해결') ? '해결형' : (code.startsWith('지지') ? '지지형' : null),
    info_processing: code.includes('디테일') ? '디테일형' : (code.includes('큰그림') ? '큰 그림형' : null),
    execution_strategy: code.endsWith('계획') ? '계획형' : (code.endsWith('탐색') ? '탐색형' : null),
    learning_env: prevAxes?.learning_env || null,
    support_tag: prevAxes?.support_tag || null
  };

  if (!axes.coaching_style || !axes.info_processing || !axes.execution_strategy) return null;
  return axes;
}

function getPartnerFromPersonalityRow(row) {
  if (!row || typeof row !== 'object') return null;

  const base = resolvePartnerTypeFromRow(row);
  if (base) {
    const code = base.type_code;
    const type_name = base.type_name;
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

    const inferredAxes = inferPartnerAxesFromTypeCode(code, partner.axes_raw || null);
    if (inferredAxes) {
      partner.axes_raw = { ...(partner.axes_raw || {}), ...inferredAxes };
    }

    if (row.question_responses && partner.axes_raw && (!partner.axes_raw.learning_env || !partner.axes_raw.support_tag)) {
      const env = computeLearningEnvAndTag(row.question_responses);
      if (!partner.axes_raw.learning_env && env.learning_env) partner.axes_raw.learning_env = env.learning_env;
      if (!partner.axes_raw.support_tag && env.support_tag) partner.axes_raw.support_tag = env.support_tag;
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
    personality_type: partner.type_code,
    partner_type_code: partner.type_code,
    partner_type_name: partner.type_name,
    partner_axes: { ...(partner.axes_raw || {}) },
    partner_version: PARTNER_VERSION
  };
  if (personalityRow.question_responses) payload.question_responses = personalityRow.question_responses;
  const typeCandidates = collectPersonalityTypeCandidates(
    partner,
    normalizePersonalityTypeCandidate(personalityRow.personality_type) || lastKnownPersonalityType,
    []
  );

  try {
    await upsertStudentPersonalityWithFallback(payload, typeCandidates);
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
    if (isDemoStudentOne()) {
      studentPersonality = await loadDemoPersonalityWithStudentOneDbPriority();
    } else if (!studentPersonality) {
      studentPersonality = loadDemoPersonalityFromStorage();
    }
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
    optionB: { label: 'B', text: '같이 방법을 찾아보자고 말해줘' }
  },
  {
    id: 2,
    category: '코칭 스타일',
    question: '모둠 활동에서 내가 맡기로 한 부분의 완성도가 떨어질 때, 어떤 반응이 더 너에게 도움이 되는 것 같아?',
    optionA: { label: 'A', text: '이 부분은 이렇게 고치면 좋을 것 같아.' },
    optionB: { label: 'B', text: '고생많았어. 다음엔 이 부분을 신경 써줘.' }
  },
  {
    id: 3,
    category: '정보 처리',
    question: '새로운 단원을 배울 때, 어떤 게 더 도움이 돼?',
    optionA: { label: 'A', text: '개념을 읽고 문제 풀이 과정을 쭉 따라가기.' },
    optionB: { label: 'B', text: '내가 왜 이 단원을 배우는지 전체 흐름 중 어디에 해당하는지 먼저 파악' }
  },
  {
    id: 4,
    category: '정보 처리',
    question: '내 결과물에 대한 조언을 받을 때, 어떤 형식이 더 좋아?',
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
    question: '어려운 내용을 이해하고 싶을 때, 어떤 방법이 더 좋아하는 방식이야?',
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
    studentPersonality = await loadDemoPersonalityWithStudentOneDbPriority();
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
    const savedType = normalizePersonalityTypeCandidate(data?.personality_type);
    if (savedType) lastKnownPersonalityType = savedType;
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

  const existingType = normalizePersonalityTypeCandidate(studentPersonality?.personality_type) || lastKnownPersonalityType;
  const sampledTypes = await sampleExistingPersonalityTypes();
  const typeCandidates = collectPersonalityTypeCandidates(partner, existingType, sampledTypes);

  const payload = {
    class_code: currentClassCode,
    student_id: currentStudent?.id,
    personality_type: partner.type_code,
    question_responses: quizAnswers,
    partner_type_code: partner.type_code,
    partner_type_name: partner.type_name,
    partner_axes: { ...(partner.axes_raw || {}) },
    partner_version: PARTNER_VERSION
  };
  try {
    if (!isDemoMode) {
      await upsertStudentPersonalityWithFallback(payload, typeCandidates);
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
        await upsertStudentPersonalityWithFallback(minimalPayload, typeCandidates);
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
  if (code.startsWith('해결큰그림')) return 'tone-purple';   // 큰 그림형
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

function resetDashboardHistoryState(records = []) {
  const year = Number(String(getDefaultQueryDate() || '').slice(0, 4));
  const month = Number(String(getDefaultQueryDate() || '').slice(5, 7));
  dashboardHistoryState.records = Array.isArray(records) ? records : [];
  dashboardHistoryState.selectedSubject = null;
  dashboardHistoryState.selectedDate = null;
  dashboardHistoryState.selectedYear = Number.isFinite(year) ? year : new Date().getFullYear();
  dashboardHistoryState.selectedMonth = (Number.isFinite(month) && month >= 1 && month <= 12) ? month : (new Date().getMonth() + 1);
}

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
    const streakBadgeArea = document.getElementById('streakBadgeArea');
    let partner = studentPartner || null;

    if (!partner) {
      try {
        partner = await ensureStudentPartnerLoaded({ backfill: true });
      } catch (partnerError) {
        console.warn('성향 파트너 로드 오류:', partnerError);
      }
    }

    resetDashboardHistoryState(allRecords);
    resetPartnerMessageState(allRecords);

    if (!allRecords || allRecords.length === 0) {
      if (streakBadgeArea) streakBadgeArea.classList.add('hidden');
      renderLearningSignals([], partner, { windowDays: DASHBOARD_SIGNAL_WINDOW_DAYS });
      renderSubjectChart([], dashboardHistoryState);
      renderRecordHeatmap([], dashboardHistoryState.selectedYear, dashboardHistoryState);
      renderHistoryDetailPanel([], dashboardHistoryState);
      renderBestRecords([]);
      return;
    }

    if (streakBadgeArea) streakBadgeArea.classList.remove('hidden');
    renderStreakAndBadges(allRecords);

    renderLearningSignals(allRecords, partner, { windowDays: DASHBOARD_SIGNAL_WINDOW_DAYS });
    renderSubjectChart(allRecords, dashboardHistoryState);
    renderRecordHeatmap(allRecords, dashboardHistoryState.selectedYear, dashboardHistoryState);
    renderHistoryDetailPanel(allRecords, dashboardHistoryState);
    renderBestRecords(allRecords);
  } catch (error) {
    console.error('대시보드 로드 오류:', error);
  }
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
  if (streak > 0) streakEl.innerHTML = '연속 <span style="color:var(--color-rose);font-size:1.6rem;">' + streak + '</span>일 기록 중';
  else streakEl.innerHTML = '오늘 기록이 아직 없어요';

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



// ② 나의 성장 신호
function parseIsoDateKeyUtc(dateKey) {
  const src = String(dateKey || '').slice(0, 10);
  const match = src.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== (m - 1) || parsed.getUTCDate() !== d) return null;
  return parsed;
}

function formatUtcDateKey(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
  return `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
}

function shiftIsoDateKey(dateKey, deltaDays) {
  const base = parseIsoDateKeyUtc(dateKey);
  if (!base) return '';
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + Number(deltaDays || 0));
  return formatUtcDateKey(next);
}

function normalizeSignalSubjectTags(rawTags) {
  if (Array.isArray(rawTags)) return rawTags.map(tag => String(tag || '').trim()).filter(Boolean);
  if (typeof rawTags === 'string') return rawTags.split(',').map(tag => String(tag || '').trim()).filter(Boolean);
  return [];
}

function countSignalKeywordMatches(text, keywords = []) {
  const src = String(text || '');
  if (!src) return 0;
  let count = 0;
  keywords.forEach((keyword) => {
    const key = String(keyword || '').trim();
    if (!key) return;
    if (src.includes(key)) count++;
  });
  return count;
}

function countSignalTagMatches(tags = [], expectedTags = []) {
  if (!Array.isArray(tags) || tags.length === 0) return 0;
  if (!Array.isArray(expectedTags) || expectedTags.length === 0) return 0;
  const tagSet = new Set(tags.map(tag => String(tag || '').trim()).filter(Boolean));
  let count = 0;
  expectedTags.forEach((tag) => {
    if (tagSet.has(String(tag || '').trim())) count++;
  });
  return count;
}

function escapeRegExp(src) {
  return String(src || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSignalTextKeywords(cardKey, partner) {
  const key = String(cardKey || '').trim();
  if (key === 'thinking') return THINK_KEYWORDS;
  if (key === 'action') return DASHBOARD_EFFORT_KEYWORDS;
  if (key !== 'fit') return [];

  const infoAxis = getPartnerAxisValue(partner, 'info_processing');
  const execAxis = getPartnerAxisValue(partner, 'execution_strategy');
  const supportAxis = getPartnerAxisValue(partner, 'support_tag');

  const keywords = [];
  if (infoAxis === '디테일형') keywords.push(...DASHBOARD_INFO_DETAIL_KEYWORDS);
  else if (infoAxis === '큰 그림형') keywords.push(...DASHBOARD_INFO_BIG_PICTURE_KEYWORDS);

  if (execAxis === '계획형') keywords.push(...DASHBOARD_EXEC_PLAN_KEYWORDS);
  else if (execAxis === '탐색형') keywords.push(...DASHBOARD_EXEC_EXPLORE_KEYWORDS);

  if (supportAxis === '#함께 성장형') keywords.push(...DASHBOARD_SUPPORT_COLLAB_TAGS, ...DASHBOARD_SUPPORT_TOGETHER_TEXT_KEYWORDS);
  else if (supportAxis === '#혼자 집중형') keywords.push(...DASHBOARD_SUPPORT_SOLO_TAGS, ...DASHBOARD_SUPPORT_SOLO_TEXT_KEYWORDS);

  return Array.from(new Set(keywords.map(word => String(word || '').trim()).filter(Boolean)));
}

function formatHighlightedSignalText(rawText, keywords = [], toneClass = '') {
  const text = String(rawText || '').trim();
  if (!text) return '작성된 내용이 없습니다.';

  const uniqueKeywords = Array.from(new Set(
    (Array.isArray(keywords) ? keywords : [])
      .map(word => String(word || '').trim())
      .filter(Boolean)
  )).sort((a, b) => b.length - a.length);

  if (uniqueKeywords.length === 0) return escapeHtml(text).replace(/\r?\n/g, '<br>');

  const regex = new RegExp(uniqueKeywords.map(escapeRegExp).join('|'), 'g');
  let html = '';
  let lastIndex = 0;
  let match = null;

  while ((match = regex.exec(text)) !== null) {
    const index = Number(match.index || 0);
    const token = String(match[0] || '');
    if (!token) {
      regex.lastIndex += 1;
      continue;
    }
    html += escapeHtml(text.slice(lastIndex, index));
    html += '<span class="learning-signal-highlight ' + toneClass + '">' + escapeHtml(token) + '</span>';
    lastIndex = index + token.length;
  }
  html += escapeHtml(text.slice(lastIndex));
  return html.replace(/\r?\n/g, '<br>');
}

function getSignalEvidenceText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return '작성된 내용이 없습니다.';
  return text;
}

function selectSignalEvidence(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .filter(item => Number(item?.matchCount || 0) > 0)
    .sort((a, b) => {
      const diff = Number(b.matchCount || 0) - Number(a.matchCount || 0);
      if (diff !== 0) return diff;
      return String(b.dateKey || '').localeCompare(String(a.dateKey || ''));
    })
    .slice(0, 2)
    .map(item => ({
      date: String(item.dateKey || ''),
      text: getSignalEvidenceText(item.text)
    }));
}

function computeSignalScore(matchCount, totalNotes) {
  if (!Number.isFinite(totalNotes) || totalNotes < 1) return null;
  const raw = Math.round((Number(matchCount || 0) / totalNotes) * 100);
  return Math.max(0, Math.min(100, raw));
}

function buildSignalDelta(
  currentScore,
  previousScore,
  currentNotes,
  previousNotes,
  naTitle = '누계 기록 부족으로 비교 어려움',
  naLabel = '누계 기록 부족으로 비교 어려움'
) {
  if (currentNotes < 1 || previousNotes < 1 || !Number.isFinite(currentScore) || !Number.isFinite(previousScore)) {
    return { state: 'na', label: naLabel, title: naTitle, value: null };
  }

  const delta = currentScore - previousScore;
  if (delta >= 5) return { state: 'up', label: `↑ +${delta}`, title: '최근 14일 상승', value: delta };
  if (delta <= -5) return { state: 'down', label: `↓ ${delta}`, title: '최근 14일 하락', value: delta };
  return { state: 'flat', label: `→ ${delta >= 0 ? `+${delta}` : String(delta)}`, title: '최근 14일 유지', value: delta };
}

function getPartnerAxisValue(partner, axisKey) {
  return String(partner?.axes_raw?.[axisKey] || partner?.axes?.[axisKey] || '').trim();
}

function getSignalInterpretation(kind, score, opts = {}) {
  if (opts.locked) return '성향 분석 완료 후 표시됩니다.';
  if (!Number.isFinite(score)) return '해당 기간 기록이 더 필요합니다.';

  if (kind === 'thinking') {
    if (score >= 70) return '어려움의 이유와 해결 과정을 스스로 점검하는 흐름이 뚜렷합니다.';
    if (score >= 40) return '생각을 되짚는 기록이 꾸준히 보입니다.';
    return '왜 어려웠는지와 바꾼 점을 더 자주 적으면 사고 신호가 선명해집니다.';
  }

  if (kind === 'action') {
    if (score >= 70) return '목표를 세우고 끝까지 해보는 노력 흐름이 꾸준히 나타납니다.';
    if (score >= 40) return '노력의 흔적이 기록에 점점 쌓이고 있습니다.';
    return '시도한 점과 다시 해본 점을 한 줄씩 적으면 노력도가 더 선명해집니다.';
  }

  if (kind === 'fit') {
    if (score >= 70) return '최근 학습 방식이 나의 성향 축과 잘 맞게 작동하고 있습니다.';
    if (score >= 40) return '성향에 맞는 학습 방식이 부분적으로 드러납니다.';
    return '성향과 맞는 방식이 아직 적어, 기록에 더 구체적인 학습 행동이 필요합니다.';
  }

  return '';
}

function computePeriodSignals(records, partner, periodStart, periodEnd) {
  const safeRecords = Array.isArray(records) ? records : [];
  const scoped = safeRecords
    .map((record) => {
      const dateKey = normalizeRecordDateKey(record?.reflection_date);
      const text = String(record?.learning_text || '').trim();
      const tags = normalizeSignalSubjectTags(record?.subject_tags);
      const combined = `${text} ${tags.join(' ')}`.trim();
      return { dateKey, text, tags, combined };
    })
    .filter(item => item.dateKey && item.dateKey >= periodStart && item.dateKey <= periodEnd);

  const totalNotes = scoped.length;
  const thinkingCandidates = [];
  const actionCandidates = [];
  const fitCandidates = [];

  let thinkingMatchCount = 0;
  let actionMatchCount = 0;

  const infoAxis = getPartnerAxisValue(partner, 'info_processing');
  const execAxis = getPartnerAxisValue(partner, 'execution_strategy');
  const supportAxis = getPartnerAxisValue(partner, 'support_tag');

  const infoKeywords = infoAxis === '디테일형'
    ? DASHBOARD_INFO_DETAIL_KEYWORDS
    : (infoAxis === '큰 그림형' ? DASHBOARD_INFO_BIG_PICTURE_KEYWORDS : []);
  const execKeywords = execAxis === '계획형'
    ? DASHBOARD_EXEC_PLAN_KEYWORDS
    : (execAxis === '탐색형' ? DASHBOARD_EXEC_EXPLORE_KEYWORDS : []);

  let infoMatchCount = 0;
  let execMatchCount = 0;
  let supportMatchCount = 0;

  scoped.forEach((note) => {
    const thinkingHitCount = countSignalKeywordMatches(note.text, THINK_KEYWORDS);
    if (thinkingHitCount > 0) {
      thinkingMatchCount++;
      thinkingCandidates.push({ ...note, matchCount: thinkingHitCount });
    }

    const actionHitCount = countSignalKeywordMatches(note.text, DASHBOARD_EFFORT_KEYWORDS);
    if (actionHitCount > 0) {
      actionMatchCount++;
      actionCandidates.push({ ...note, matchCount: actionHitCount });
    }

    let fitHitCount = 0;

    const infoHitCount = infoKeywords.length > 0 ? countSignalKeywordMatches(note.combined, infoKeywords) : 0;
    if (infoKeywords.length > 0 && infoHitCount > 0) infoMatchCount++;
    fitHitCount += infoHitCount;

    const execHitCount = execKeywords.length > 0 ? countSignalKeywordMatches(note.combined, execKeywords) : 0;
    if (execKeywords.length > 0 && execHitCount > 0) execMatchCount++;
    fitHitCount += execHitCount;

    let supportHitCount = 0;
    if (supportAxis === '#함께 성장형') {
      supportHitCount += countSignalTagMatches(note.tags, DASHBOARD_SUPPORT_COLLAB_TAGS);
      supportHitCount += countSignalKeywordMatches(note.combined, DASHBOARD_SUPPORT_TOGETHER_TEXT_KEYWORDS);
    } else if (supportAxis === '#혼자 집중형') {
      supportHitCount += countSignalTagMatches(note.tags, DASHBOARD_SUPPORT_SOLO_TAGS);
      supportHitCount += countSignalKeywordMatches(note.combined, DASHBOARD_SUPPORT_SOLO_TEXT_KEYWORDS);
    }
    if (supportAxis && supportHitCount > 0) supportMatchCount++;
    fitHitCount += supportHitCount;

    if (fitHitCount > 0) fitCandidates.push({ ...note, matchCount: fitHitCount });
  });

  const thinkingScore = computeSignalScore(thinkingMatchCount, totalNotes);
  const actionScore = computeSignalScore(actionMatchCount, totalNotes);

  let fitScore = null;
  if (partner) {
    const axisScores = [];
    const infoScore = infoKeywords.length > 0 ? computeSignalScore(infoMatchCount, totalNotes) : null;
    const execScore = execKeywords.length > 0 ? computeSignalScore(execMatchCount, totalNotes) : null;
    const supportScore = supportAxis ? computeSignalScore(supportMatchCount, totalNotes) : null;
    if (Number.isFinite(infoScore)) axisScores.push(infoScore);
    if (Number.isFinite(execScore)) axisScores.push(execScore);
    // support axis is treated as a bonus axis to avoid over-penalizing otherwise strong fit periods.
    if (Number.isFinite(supportScore) && supportMatchCount > 0) axisScores.push(supportScore);
    if (axisScores.length > 0) {
      const avg = Math.round(axisScores.reduce((sum, score) => sum + score, 0) / axisScores.length);
      const coverageScore = computeSignalScore(fitCandidates.length, totalNotes);
      const blended = Number.isFinite(coverageScore)
        ? Math.round((avg * 0.7) + (coverageScore * 0.3))
        : avg;
      fitScore = Math.max(0, Math.min(100, blended));
      if (fitScore >= 90) fitScore = 100;
    }
  }

  return {
    periodStart,
    periodEnd,
    totalNotes,
    thinkingScore,
    actionScore,
    fitScore,
    evidence: {
      thinking: selectSignalEvidence(thinkingCandidates),
      action: selectSignalEvidence(actionCandidates),
      fit: selectSignalEvidence(fitCandidates)
    }
  };
}

function computeGrowthSignals(records, partner, options = {}) {
  const safeRecords = Array.isArray(records) ? records : [];
  const hasPartner = !!partner;
  const windowDaysInput = Number(options?.windowDays);
  const windowDays = Number.isFinite(windowDaysInput) && windowDaysInput > 0
    ? Math.floor(windowDaysInput)
    : DASHBOARD_SIGNAL_WINDOW_DAYS;
  const todayKey = normalizeRecordDateKey(getDefaultQueryDate());
  const currentEnd = todayKey;
  const currentStart = shiftIsoDateKey(currentEnd, -(windowDays - 1));
  const previousEnd = shiftIsoDateKey(currentStart, -1);
  const previousStart = shiftIsoDateKey(previousEnd, -(windowDays - 1));

  const current = computePeriodSignals(safeRecords, partner, currentStart, currentEnd);
  const previous = computePeriodSignals(safeRecords, partner, previousStart, previousEnd);

  const thinkingDelta = buildSignalDelta(current.thinkingScore, previous.thinkingScore, current.totalNotes, previous.totalNotes);
  const actionDelta = buildSignalDelta(current.actionScore, previous.actionScore, current.totalNotes, previous.totalNotes);
  const fitDelta = hasPartner
    ? buildSignalDelta(current.fitScore, previous.fitScore, current.totalNotes, previous.totalNotes)
    : buildSignalDelta(null, null, 0, 0, '성향 분석 완료 후 표시', '성향 분석 완료 후 표시');

  return {
    windowDays,
    ranges: {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd
    },
    current,
    previous,
    cards: [
      {
        key: 'thinking',
        title: '사고 활성도',
        toneClass: 'tone-thinking',
        score: current.thinkingScore,
        delta: thinkingDelta,
        insight: getSignalInterpretation('thinking', current.thinkingScore),
        evidence: current.evidence.thinking,
        locked: false
      },
      {
        key: 'action',
        title: '노력도',
        toneClass: 'tone-action',
        score: current.actionScore,
        delta: actionDelta,
        insight: getSignalInterpretation('action', current.actionScore),
        evidence: current.evidence.action,
        locked: false
      },
      {
        key: 'fit',
        title: '성향 적용도',
        toneClass: 'tone-fit',
        score: hasPartner ? current.fitScore : null,
        delta: fitDelta,
        insight: getSignalInterpretation('fit', hasPartner ? current.fitScore : null, { locked: !hasPartner }),
        evidence: hasPartner ? current.evidence.fit : [],
        locked: !hasPartner
      }
    ]
  };
}

function bindLearningSignalAccordion(container) {
  if (!container) return;
  const cards = Array.from(container.querySelectorAll('.learning-signal-card'));
  if (cards.length === 0) return;

  // Ensure collapsed-by-default state on each render.
  cards.forEach((card) => { card.open = false; });

  cards.forEach((card) => {
    card.addEventListener('toggle', () => {
      if (!card.open) return;
      cards.forEach((other) => {
        if (other !== card && other.open) other.open = false;
      });
    });
  });
}

function renderLearningSignals(records, partner, options = {}) {
  const container = document.getElementById('learningWordCloud');
  if (!container) return;
  container.classList.add('learning-signals-host');

  const safeRecords = Array.isArray(records) ? records : [];
  if (safeRecords.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-desc">신호를 보려면 기록이 필요해요.</div></div>';
    return;
  }

  const signals = computeGrowthSignals(safeRecords, partner, options);
  const compareCaption = `최근 ${signals.windowDays}일 (${signals.ranges.currentStart}~${signals.ranges.currentEnd}) vs 이전 ${signals.windowDays}일 (${signals.ranges.previousStart}~${signals.ranges.previousEnd})`;
  const currentCountCaption = `최근 구간 기록 ${signals.current.totalNotes}건`;

  const cardsHtml = signals.cards.map((card) => {
    const scoreText = Number.isFinite(card.score) ? String(card.score) : '-';
    const deltaClass = `is-${card.delta.state}`;
    const deltaTitle = escapeHtml(card.delta.title || '');
    const textKeywords = getSignalTextKeywords(card.key, partner);
    const evidenceHtml = card.evidence.length > 0
      ? card.evidence.map((item) => (
        `<li class="learning-signal-evidence-item"><span class="learning-signal-evidence-date">${escapeHtml(item.date)}</span><span class="learning-signal-evidence-text">${formatHighlightedSignalText(item.text, textKeywords, card.toneClass)}</span></li>`
      )).join('')
      : `<li class="learning-signal-empty">${card.locked ? '성향 분석 완료 후 표시됩니다.' : '최근 14일 근거가 아직 부족해요.'}</li>`;

    return `
      <details class="learning-signal-card ${card.toneClass}${card.locked ? ' is-locked' : ''}">
        <summary class="learning-signal-summary">
          <div class="learning-signal-head">
            <h4 class="learning-signal-title">${escapeHtml(card.title)}</h4>
            <div class="learning-signal-score">
              <span class="learning-signal-score-value">${scoreText}</span>
              <span class="learning-signal-score-unit">점</span>
            </div>
          </div>
          <span class="learning-signal-summary-state" aria-hidden="true"></span>
        </summary>
        <div class="learning-signal-content">
          <div class="learning-signal-delta ${deltaClass}" title="${deltaTitle}">${escapeHtml(card.delta.label)}</div>
          <p class="learning-signal-desc">${escapeHtml(card.insight)}</p>
          <ul class="learning-signal-evidence">${evidenceHtml}</ul>
        </div>
      </details>
    `;
  }).join('');

  container.innerHTML = `
    <div class="learning-signals-panel">
      <div class="learning-signals-meta">
        <span>${escapeHtml(compareCaption)}</span>
        <span>${escapeHtml(currentCountCaption)}</span>
      </div>
      <div class="learning-signals-grid">${cardsHtml}</div>
    </div>
  `;
  bindLearningSignalAccordion(container);
}

function renderLearningWordCloud(records, partner, options = {}) {
  renderLearningSignals(records, partner, options);
}

function normalizeRecordDateKey(v) {
  return String(v || '').slice(0, 10);
}

function formatRecordTextForDisplay(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return '작성된 내용이 없습니다.';
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

function toggleHistorySubject(rawSubject) {
  const subject = String(rawSubject || '').trim();
  if (!subject) return;

  dashboardHistoryState.selectedSubject = (dashboardHistoryState.selectedSubject === subject) ? null : subject;
  renderSubjectChart(dashboardHistoryState.records, dashboardHistoryState);
  renderHistoryDetailPanel(dashboardHistoryState.records, dashboardHistoryState);
}

function toggleHistoryDate(dateKey) {
  const key = normalizeRecordDateKey(dateKey);
  if (!key) return;

  dashboardHistoryState.selectedDate = (dashboardHistoryState.selectedDate === key) ? null : key;
  renderRecordHeatmap(dashboardHistoryState.records, dashboardHistoryState.selectedYear, dashboardHistoryState);
  renderHistoryDetailPanel(dashboardHistoryState.records, dashboardHistoryState);
}

function clearHistoryFilters() {
  dashboardHistoryState.selectedSubject = null;
  dashboardHistoryState.selectedDate = null;
  renderSubjectChart(dashboardHistoryState.records, dashboardHistoryState);
  renderRecordHeatmap(dashboardHistoryState.records, dashboardHistoryState.selectedYear, dashboardHistoryState);
  renderHistoryDetailPanel(dashboardHistoryState.records, dashboardHistoryState);
}

function setHistoryMonth(nextMonth) {
  const monthNum = Number(nextMonth);
  if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return;

  dashboardHistoryState.selectedMonth = monthNum;
  dashboardHistoryState.selectedDate = null;
  renderRecordHeatmap(dashboardHistoryState.records, dashboardHistoryState.selectedYear, dashboardHistoryState);
  renderHistoryDetailPanel(dashboardHistoryState.records, dashboardHistoryState);
}

function navigateHistoryMonth(delta) {
  const current = Number(dashboardHistoryState.selectedMonth) || 1;
  const next = (((current - 1 + Number(delta || 0)) % 12) + 12) % 12 + 1;
  setHistoryMonth(next);
}

// ③ 과목별 기록 횟수 (클릭 필터)
function renderSubjectChart(records, state = dashboardHistoryState) {
  const container = document.getElementById('subjectChart');
  if (!container) return;

  const subjectCounts = {};
  (records || []).forEach(r => {
    if (!Array.isArray(r.subject_tags)) return;
    r.subject_tags.forEach(tag => {
      const key = String(tag || '').trim();
      if (!key) return;
      subjectCounts[key] = (subjectCounts[key] || 0) + 1;
    });
  });

  const sorted = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">📚</span><div class="empty-desc">과목 태그를 선택하면 통계가 나타나요!</div></div>';
    return;
  }

  const maxCount = sorted[0][1];
  const barColors = ['#4F84C7', '#5A9E8F', '#9575CD', '#C2654A', '#5E8C61', '#D4A574', '#6C63FF', '#FF6B6B'];

  let rowsHtml = '';
  sorted.forEach(([subject, count], i) => {
    const pct = Math.max(8, Math.round((count / maxCount) * 100));
    const color = barColors[i % barColors.length];
    const isSelected = state.selectedSubject === subject;
    rowsHtml += '<button type="button" class="subject-bar-item' + (isSelected ? ' is-selected' : '') + '" data-subject="' + encodeURIComponent(subject) + '" aria-pressed="' + (isSelected ? 'true' : 'false') + '">' +
      '<span class="subject-bar-label">' + escapeHtml(subject) + '</span>' +
      '<span class="subject-bar-track">' +
      '<span class="subject-bar-fill" style="width:' + pct + '%; background:' + color + ';">' + count + '회</span>' +
      '</span>' +
      '</button>';
  });

  const helpText = state.selectedSubject
    ? ('선택됨: ' + state.selectedSubject)
    : '과목을 누르면 아래 상세 기록이 필터링됩니다.';

  container.innerHTML =
    '<div class="subject-chart-shell">' +
    '<div class="subject-chart-head">' +
    '<span class="subject-chart-stat">총 ' + sorted.length + '과목</span>' +
    '<span class="subject-chart-help">' + escapeHtml(helpText) + '</span>' +
    '</div>' +
    '<div class="subject-chart-list">' + rowsHtml + '</div>' +
    '</div>';

  container.querySelectorAll('.subject-bar-item[data-subject]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const encoded = btn.getAttribute('data-subject') || '';
      let subject = encoded;
      try { subject = decodeURIComponent(encoded); } catch (_) { }
      toggleHistorySubject(subject);
    });
  });
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

// ⑤ 연간 기록 캘린더 히트맵
function renderRecordHeatmap(records, year, state = dashboardHistoryState) {
  const container = document.getElementById('recordHeatmap');
  if (!container) return;

  const safeRecords = Array.isArray(records) ? records : [];

  const parsedYear = Number(year);
  const yearNum = Number.isFinite(parsedYear) ? parsedYear : Number(String(getDefaultQueryDate() || '').slice(0, 4));
  const monthNum = (Number.isFinite(Number(state.selectedMonth)) && Number(state.selectedMonth) >= 1 && Number(state.selectedMonth) <= 12)
    ? Number(state.selectedMonth)
    : Number(String(getDefaultQueryDate() || '').slice(5, 7));
  const firstDay = new Date(Date.UTC(yearNum, monthNum - 1, 1));
  const lastDay = new Date(Date.UTC(yearNum, monthNum, 0));
  const daysInMonth = lastDay.getUTCDate();
  const leadingBlank = firstDay.getUTCDay();
  const trailingBlank = (7 - ((leadingBlank + daysInMonth) % 7)) % 7;
  const dateSet = new Set(safeRecords.map(r => normalizeRecordDateKey(r.reflection_date)).filter(Boolean));
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const value = i + 1;
    const selected = value === monthNum ? ' selected' : '';
    return '<option value="' + value + '"' + selected + '>' + value + '월</option>';
  });
  const todayKey = normalizeRecordDateKey(getDefaultQueryDate());
  const cells = [];
  let recordedCount = 0;

  for (let i = 0; i < leadingBlank; i++) {
    cells.push('<span class="history-heatmap-cell is-outside" aria-hidden="true"></span>');
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hasRecord = dateSet.has(dateKey);
    if (hasRecord) recordedCount++;
    const selectedClass = state.selectedDate === dateKey ? ' is-selected' : '';
    const todayClass = todayKey === dateKey ? ' is-today' : '';
    const cellClass = hasRecord ? ' is-recorded' : ' is-empty';
    const label = `${dateKey} ${hasRecord ? '기록 있음' : '기록 없음'}`;
    const dot = hasRecord ? '<span class="history-heatmap-day-dot" aria-hidden="true"></span>' : '';
    cells.push(
      '<button type="button" class="history-heatmap-cell' + cellClass + selectedClass + todayClass + '" data-date="' + dateKey + '" title="' + label + '" aria-label="' + label + '">' +
      '<span class="history-heatmap-daynum">' + day + '</span>' +
      dot +
      '</button>'
    );
  }

  for (let i = 0; i < trailingBlank; i++) {
    cells.push('<span class="history-heatmap-cell is-outside" aria-hidden="true"></span>');
  }

  const selectedDateText = state.selectedDate
    ? ('선택 날짜: ' + escapeHtml(state.selectedDate))
    : '날짜를 누르면 아래 상세 기록이 필터링됩니다.';
  const monthSummary = recordedCount > 0
    ? `${monthNum}월 기록 ${recordedCount}일`
    : `${monthNum}월 기록 없음`;

  container.innerHTML =
    '<div class="history-heatmap-shell">' +
    '<div class="history-heatmap-header">' +
    '<div class="history-heatmap-controls">' +
    '<button type="button" class="history-heatmap-nav-btn" id="historyMonthPrevBtn" aria-label="이전 월">‹</button>' +
    '<span class="history-heatmap-year">' + yearNum + '년</span>' +
    '<select class="history-heatmap-month-select" id="historyMonthSelect" aria-label="기록 캘린더 월 선택">' + monthOptions.join('') + '</select>' +
    '<button type="button" class="history-heatmap-nav-btn" id="historyMonthNextBtn" aria-label="다음 월">›</button>' +
    '</div>' +
    '<div class="history-heatmap-summary">' +
    '<span class="history-heatmap-stat">' + monthSummary + '</span>' +
    '<span class="history-heatmap-help">' + selectedDateText + '</span>' +
    '</div>' +
    '</div>' +
    '<div class="history-heatmap-weekdays">' + weekdays.map(day => '<span class="history-heatmap-weekday">' + day + '</span>').join('') + '</div>' +
    '<div class="history-heatmap-grid">' + cells.join('') + '</div>' +
    '<div class="history-heatmap-legend">' +
    '<span class="history-heatmap-legend-label">기록 없음</span><span class="history-heatmap-dot is-empty" aria-hidden="true"></span>' +
    '<span class="history-heatmap-legend-label">기록 있음</span><span class="history-heatmap-dot is-recorded" aria-hidden="true"></span>' +
    '</div>' +
    '</div>';

  container.querySelectorAll('.history-heatmap-cell[data-date]').forEach((cell) => {
    cell.addEventListener('click', () => {
      const dateKey = normalizeRecordDateKey(cell.getAttribute('data-date') || '');
      if (!dateKey) return;
      toggleHistoryDate(dateKey);
    });
  });
  const monthSelect = container.querySelector('#historyMonthSelect');
  if (monthSelect) {
    monthSelect.addEventListener('change', (event) => {
      setHistoryMonth(event.target.value);
    });
  }

  const prevBtn = container.querySelector('#historyMonthPrevBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      navigateHistoryMonth(-1);
    });
  }

  const nextBtn = container.querySelector('#historyMonthNextBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      navigateHistoryMonth(1);
    });
  }
}

function renderHistoryDetailPanel(records, state = dashboardHistoryState) {
  const summaryEl = document.getElementById('historyFilterSummary');
  const listEl = document.getElementById('historyDetailList');
  if (!summaryEl || !listEl) return;

  const safeRecords = Array.isArray(records) ? records : [];
  const selectedSubject = String(state.selectedSubject || '').trim();
  const selectedDate = normalizeRecordDateKey(state.selectedDate);
  const hasFilter = Boolean(selectedSubject || selectedDate);

  if (!hasFilter) {
    summaryEl.innerHTML = '<span class="history-filter-placeholder">과목 바 또는 날짜를 선택하면 관련 기록이 표시됩니다.</span>';
    listEl.innerHTML = '<div class="empty-state"><span class="empty-icon">👈</span><div class="empty-desc">먼저 과목 또는 날짜를 선택해 주세요.</div></div>';
    return;
  }

  let filtered = safeRecords.slice();
  if (selectedSubject) {
    filtered = filtered.filter((r) => Array.isArray(r.subject_tags) && r.subject_tags.some((tag) => String(tag || '').trim() === selectedSubject));
  }
  if (selectedDate) {
    filtered = filtered.filter((r) => normalizeRecordDateKey(r.reflection_date) === selectedDate);
  }

  filtered.sort((a, b) => normalizeRecordDateKey(b.reflection_date).localeCompare(normalizeRecordDateKey(a.reflection_date)));

  const chips = [];
  if (selectedSubject) chips.push('<span class="history-filter-chip">과목: ' + escapeHtml(selectedSubject) + '</span>');
  if (selectedDate) chips.push('<span class="history-filter-chip">날짜: ' + escapeHtml(selectedDate) + '</span>');

  summaryEl.innerHTML =
    '<div class="history-filter-meta">' +
    '<div class="history-filter-chips">' + chips.join('') + '</div>' +
    '<div class="history-filter-count">총 ' + filtered.length + '건</div>' +
    '</div>' +
    '<button type="button" class="history-filter-reset-btn" onclick="clearHistoryFilters()">필터 초기화</button>';

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><span class="empty-icon">🔍</span><div class="empty-desc">선택한 조건에 맞는 기록이 없습니다.</div></div>';
    return;
  }

  listEl.innerHTML = filtered.map((r) => {
    const date = normalizeRecordDateKey(r.reflection_date);
    const textHtml = formatRecordTextForDisplay(r.learning_text);
    const tags = Array.isArray(r.subject_tags) ? r.subject_tags.filter(Boolean) : [];
    const tagsHtml = tags.length
      ? ('<div class="history-detail-tags">' + tags.map((tag) => '<span class="history-detail-tag">' + escapeHtml(String(tag)) + '</span>').join('') + '</div>')
      : '';

    return '<article class="history-detail-item">' +
      '<div class="history-detail-item-head"><span class="history-detail-date">' + escapeHtml(date || '-') + '</span></div>' +
      '<div class="history-detail-text">' + textHtml + '</div>' +
      tagsHtml +
      '</article>';
  }).join('');
}

function renderBestRecords(records) {
  const container = document.getElementById('bestRecordList');
  if (!container) return;

  const safeRecords = Array.isArray(records) ? records : [];
  if (safeRecords.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">🏅</span><div class="empty-desc">기록이 쌓이면 베스트 기록이 보여요.</div></div>';
    return;
  }

  const scored = safeRecords.map((r) => {
    const date = normalizeRecordDateKey(r.reflection_date);
    const text = String(r.learning_text || '').trim();
    const textLength = text.length;
    const tags = Array.isArray(r.subject_tags) ? r.subject_tags.filter(Boolean) : [];
    const tagCount = tags.length;
    const score = textLength + (tagCount * 20);
    return { record: r, date, text, textLength, tagCount, score };
  }).filter(item => item.score > 0);

  if (scored.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">🏅</span><div class="empty-desc">베스트 기록을 계산할 수 있는 데이터가 부족해요.</div></div>';
    return;
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.date || '').localeCompare(String(a.date || ''));
  });

  const top = scored.slice(0, 2);
  container.innerHTML = top.map((item, idx) => {
    const textHtml = formatRecordTextForDisplay(item.text);
    return '<article class="best-record-card">' +
      '<div class="best-record-head">' +
      '<span class="best-record-rank">BEST ' + (idx + 1) + '</span>' +
      '<span class="best-record-date">' + escapeHtml(item.date || '-') + '</span>' +
      '</div>' +
      '<div class="best-record-text">' + textHtml + '</div>' +
      '</article>';
  }).join('');
}

// 성장 파트너 메시지 (일간 + 비교)
function resetPartnerMessageState(records = []) {
  const dateKey = String(getDefaultQueryDate() || '');
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));

  partnerMessageState.mode = 'daily';
  partnerMessageState.records = Array.isArray(records) ? records.slice() : [];
  partnerMessageState.selectTarget = 'A';
  partnerMessageState.selectedDateA = null;
  partnerMessageState.selectedDateB = null;
  partnerMessageState.selectedYear = Number.isFinite(year) ? year : new Date().getFullYear();
  partnerMessageState.selectedMonth = (Number.isFinite(month) && month >= 1 && month <= 12) ? month : (new Date().getMonth() + 1);
  partnerMessageState.compareHint = '';

  activatePartnerMessageMode('daily');
  renderPartnerComparePanel();
}

function activatePartnerMessageMode(mode) {
  const nextMode = mode === 'compare' ? 'compare' : 'daily';
  partnerMessageState.mode = nextMode;

  document.querySelectorAll('.partner-message-mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === nextMode);
  });

  const dailyActionRow = document.getElementById('partnerDailyActionRow');
  if (dailyActionRow) dailyActionRow.classList.toggle('hidden', nextMode !== 'daily');

  const comparePanel = document.getElementById('partnerComparePanel');
  if (comparePanel) comparePanel.classList.toggle('hidden', nextMode !== 'compare');

  if (nextMode === 'compare') renderPartnerComparePanel();
}

async function ensurePartnerMessageRecordsLoaded() {
  if (Array.isArray(partnerMessageState.records) && partnerMessageState.records.length > 0) {
    return partnerMessageState.records;
  }
  if (!currentStudent || !currentClassCode) return [];

  try {
    const { data, error } = await db.from('daily_reflections')
      .select('*')
      .eq('class_code', currentClassCode)
      .eq('student_id', String(currentStudent.id))
      .order('reflection_date', { ascending: true });
    if (!error && Array.isArray(data)) {
      partnerMessageState.records = data;
      return data;
    }
  } catch (_) { }

  return Array.isArray(partnerMessageState.records) ? partnerMessageState.records : [];
}

function getPartnerMessageNoteMap(records = []) {
  const noteMap = new Map();
  (Array.isArray(records) ? records : []).forEach((r) => {
    const date = normalizeRecordDateKey(r?.reflection_date);
    const note = String(r?.learning_text || '').trim();
    if (!date || !note) return;
    noteMap.set(date, note);
  });
  return noteMap;
}

function buildPartnerTypeText(partner) {
  if (!partner || typeof partner !== 'object') {
    return [
      'type_code: 미확정',
      'type_name: 성장 파트너 유형 미확정',
      'coaching_style: 미확정',
      'info_processing: 미확정',
      'execution_strategy: 미확정',
      'support_tag: #성장 파트너형',
      'feedback_style: 기록 자체를 인정하고 다음 행동을 부드럽게 제안',
      'action_style: 부담 없는 작은 실천 1개 제안',
      'encouraging_phrase: 충분히 잘하고 있어요. 오늘 기록에서 한 걸음만 더 가봐요.'
    ].join('\n');
  }

  const typeCode = String(partner.type_code || '').trim();
  const typeCatalog = typeCode ? PARTNER_TYPE_BY_CODE[typeCode] : null;
  const axesRaw = (partner.axes_raw && typeof partner.axes_raw === 'object') ? partner.axes_raw : {};
  const axes = (partner.axes && typeof partner.axes === 'object') ? partner.axes : {};
  const coachingStyle = axesRaw.coaching_style || axes.coaching_style || '미확정';
  const infoProcessing = axesRaw.info_processing || axes.info_processing || '미확정';
  const executionStrategy = axesRaw.execution_strategy || axes.execution_strategy || '미확정';
  const supportTag = axesRaw.support_tag || axes.support_tag || '#성장 파트너형';
  const feedbackStyle = String(partner.description?.feedback_style || typeCatalog?.description?.feedback_style || '기록 자체를 인정하고 다음 행동을 부드럽게 제안').trim();
  const actionStyle = String(partner.description?.action_style || typeCatalog?.description?.action_style || '부담 없는 작은 실천 1개 제안').trim();
  const encouragingRaw = String(partner.description?.encouraging_phrase || typeCatalog?.description?.encouraging_phrase || '충분히 잘하고 있어. 오늘 배움을 바탕으로 한 걸음 더 가보자.').trim();
  const encouragingPhrase = normalizePartnerQuote(encouragingRaw) || '충분히 잘하고 있어요. 오늘 배움을 바탕으로 한 걸음 더 가봐요.';

  return [
    `type_code: ${typeCode || '미확정'}`,
    `type_name: ${String(partner.type_name || typeCatalog?.type_name || '성장 파트너').trim()}`,
    `coaching_style: ${coachingStyle}`,
    `info_processing: ${infoProcessing}`,
    `execution_strategy: ${executionStrategy}`,
    `support_tag: ${supportTag}`,
    `feedback_style: ${feedbackStyle}`,
    `action_style: ${actionStyle}`,
    `encouraging_phrase: ${encouragingPhrase}`
  ].join('\n');
}

function toOneLineSummary(text, maxLen = 80) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  if (!src) return '';
  return src.length > maxLen ? `${src.slice(0, maxLen)}...` : src;
}

function buildPrevSummaryFromRecentNotes(records, today, limit = 2) {
  const todayKey = normalizeRecordDateKey(today);
  const safeLimit = Math.max(1, Number(limit) || 2);
  const rows = (Array.isArray(records) ? records : [])
    .map((r) => ({
      date: normalizeRecordDateKey(r?.reflection_date),
      text: String(r?.learning_text || '').trim()
    }))
    .filter((item) => item.date && item.text && item.date !== todayKey)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, safeLimit);

  if (rows.length === 0) return '이전 기록 없음';
  return rows.map((item) => `${item.date}: ${toOneLineSummary(item.text, 88)}`).join('\n');
}

function buildDailyPartnerPromptExact(params = {}) {
  const partnerTypeText = String(params.partnerTypeText || '').trim();
  const prevSummary = String(params.prevSummary || '').trim();
  const todayNote = String(params.todayNote || '').trim();

  const dailyPrompt =
    '[역할]\n' +
    '너는 배움로그의 AI 성장 파트너다. 해요체, 파트너 톤.\n\n' +

    '[학생 유형]\n' +
    partnerTypeText + '\n\n' +

    '[원칙]\n' +
    '- 학생 유형의 coaching_style에 맞는 말투와 접근법으로 전체를 작성하라.\n' +
    '- 학생이 쓴 내용을 되풀이하지 마라.\n' +
    '- 아래 중 1가지만 골라서 2~3문장으로 응답하라:\n' +
    '  a) 사고 확장 질문: 기록에서 한 단계 더 생각해볼 질문\n' +
    '  b) 연결 짓기: 이전 기록과 오늘 기록의 변화나 연결점\n' +
    '  c) 방법 넛지: 유형에 맞는 구체적 학습 팁 1개\n' +
    '- 기록이 짧아도 비판하지 말고 인정 후 질문하라.\n' +
    '- 마크다운/섹션 헤더 없이 자연스러운 문장으로만.\n\n' +

    '[이전 기록 요약]\n' +
    prevSummary + '\n\n' +

    '[오늘 배움노트]\n' +
    todayNote + '\n\n' +

    '[출력]\n';

  return dailyPrompt;
}

function buildComparePartnerPromptExact(params = {}) {
  const partnerTypeText = String(params.partnerTypeText || '').trim();
  const dateA = normalizeRecordDateKey(params.dateA);
  const noteA = String(params.noteA || '').trim();
  const dateB = normalizeRecordDateKey(params.dateB);
  const noteB = String(params.noteB || '').trim();

  const comparePrompt =
    '[역할]\n' +
    '너는 배움로그의 AI 성장 파트너다. 해요체, 파트너 톤.\n\n' +

    '[학생 유형]\n' +
    partnerTypeText + '\n\n' +

    '[원칙]\n' +
    '- 학생 유형의 coaching_style에 맞는 말투와 접근법으로 전체를 작성하라.\n' +
    '- 각 노트 내용을 따로 요약하지 마라.\n' +
    '- 근거 밖의 내용을 지어내지 마라.\n' +
    '- 4~6문장.\n\n' +

    '[비교 관점 - 아래 중 해당되는 것만 골라서 짚어라]\n' +
    '- 학습 깊이: 암기/정리 수준 → 이해/설명 수준으로 변화가 있는가\n' +
    '- 문제 해결 방식: 막힐 때 대처가 달라졌는가\n' +
    '- 기록 방식: 기록의 구체성이나 과정 서술이 달라졌는가\n' +
    '- 자기 인식: 자신의 학습 상태를 파악하는 정도가 달라졌는가\n\n' +

    '[출력 구조]\n' +
    '## 이런 점이 달라졌어요\n' +
    '위 관점 중 해당되는 변화를 구체적으로 짚어라.\n\n' +
    '## 다음은 이거 해볼까요?\n' +
    '발견된 변화를 기반으로 유형 맞춤 제안 1개만.\n\n' +

    '[노트 A: ' + dateA + ']\n' + noteA + '\n\n' +
    '[노트 B: ' + dateB + ']\n' + noteB + '\n\n' +

    '[출력]\n';

  return comparePrompt;
}

function renderPartnerMessagePlainText(text) {
  const area = document.getElementById('summaryReportArea');
  if (!area) return;

  const source = String(text || '').trim();
  if (!source) {
    area.innerHTML = '<div class="empty-state"><span class="empty-icon">💬</span><div class="empty-desc">메시지를 생성하지 못했어요. 다시 시도해 주세요.</div></div>';
    return;
  }

  const normalized = source
    .replace(/^##\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  area.innerHTML = '<div class="partner-message-plain">' + escapeHtml(normalized).replace(/\r?\n/g, '<br>') + '</div>';
}

async function generatePartnerMessage(mode = 'daily') {
  const nextMode = mode === 'compare' ? 'compare' : 'daily';
  activatePartnerMessageMode(nextMode);
  if (nextMode === 'compare') renderPartnerComparePanel();
}

async function generateDailyPartnerMessage() {
  if (!currentStudent || !currentClassCode) return;

  const area = document.getElementById('summaryReportArea');
  if (!area) return;

  area.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">🤖 성장 파트너가 일간 피드백을 작성 중...</div>';

  try {
    const records = await ensurePartnerMessageRecordsLoaded();
    const todayKey = normalizeRecordDateKey(getDefaultQueryDate());
    const todayNote = (Array.isArray(records) ? records : [])
      .filter((r) => normalizeRecordDateKey(r?.reflection_date) === todayKey)
      .map((r) => String(r?.learning_text || '').trim())
      .find(Boolean) || '';

    if (!todayNote) {
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">📝</span><div class="empty-desc">오늘 배움노트를 먼저 작성하면 일간 피드백을 받을 수 있어요.</div></div>';
      return;
    }

    const partner = studentPartner || await ensureStudentPartnerLoaded({ backfill: true });
    const partnerTypeText = buildPartnerTypeText(partner);
    const prevSummary = buildPrevSummaryFromRecentNotes(records, todayKey, 2);
    const prompt = buildDailyPartnerPromptExact({ partnerTypeText, prevSummary, todayNote });
    const result = await callGemini(prompt, { generationConfig: { temperature: 0.5, maxOutputTokens: 3000 } });

    if (!(result.ok && result.text)) {
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">⚠️</span><div class="empty-desc">성장 파트너의 메세지를 받지 못했어요. 다시 눌러주세요.</div></div>';
      return;
    }

    const output = sanitizeAiSummaryText(result.text);
    renderPartnerMessagePlainText(output);
  } catch (error) {
    area.innerHTML = '<div style="color:var(--color-danger);">일간 피드백 생성 중 오류가 발생했습니다.</div>';
  }
}

function setPartnerCompareTarget(target) {
  partnerMessageState.selectTarget = target === 'B' ? 'B' : 'A';
  renderPartnerComparePanel();
}

function setPartnerCompareMonth(nextMonth) {
  const monthNum = Number(nextMonth);
  if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return;
  partnerMessageState.selectedMonth = monthNum;
  renderPartnerComparePanel();
}

function navigatePartnerCompareMonth(delta) {
  const current = Number(partnerMessageState.selectedMonth) || 1;
  const next = (((current - 1 + Number(delta || 0)) % 12) + 12) % 12 + 1;
  setPartnerCompareMonth(next);
}

function setPartnerCompareDate(dateKey) {
  const key = normalizeRecordDateKey(dateKey);
  if (!key) return;

  const noteMap = getPartnerMessageNoteMap(partnerMessageState.records);
  if (!noteMap.has(key)) {
    partnerMessageState.compareHint = '기록이 있는 날짜만 선택할 수 있어요.';
    renderPartnerComparePanel();
    return;
  }

  if (partnerMessageState.selectTarget === 'A') {
    if (partnerMessageState.selectedDateB === key) {
      partnerMessageState.compareHint = 'A와 B는 같은 날짜를 선택할 수 없어요.';
      renderPartnerComparePanel();
      return;
    }
    partnerMessageState.selectedDateA = key;
    partnerMessageState.selectTarget = 'B';
    partnerMessageState.compareHint = '';
    renderPartnerComparePanel();
    return;
  }

  if (partnerMessageState.selectedDateA === key) {
    partnerMessageState.compareHint = 'A와 B는 같은 날짜를 선택할 수 없어요.';
    renderPartnerComparePanel();
    return;
  }

  partnerMessageState.selectedDateB = key;
  partnerMessageState.selectTarget = 'A';
  partnerMessageState.compareHint = '';
  renderPartnerComparePanel();
}

function renderPartnerCompareCalendar(noteMap, year, month) {
  const container = document.getElementById('partnerCompareCalendar');
  if (!container) return;

  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const daysInMonth = lastDay.getUTCDate();
  const leadingBlank = firstDay.getUTCDay();
  const trailingBlank = (7 - ((leadingBlank + daysInMonth) % 7)) % 7;
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const cells = [];

  for (let i = 0; i < leadingBlank; i++) {
    cells.push('<span class="partner-compare-day is-outside" aria-hidden="true"></span>');
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hasNote = noteMap.has(dateKey);
    const isA = partnerMessageState.selectedDateA === dateKey;
    const isB = partnerMessageState.selectedDateB === dateKey;
    const classes = ['partner-compare-day', hasNote ? 'is-recorded' : 'is-empty'];
    if (!hasNote) classes.push('is-disabled');
    if (isA) classes.push('is-a');
    if (isB) classes.push('is-b');

    const labels = [];
    if (isA) labels.push('A');
    if (isB) labels.push('B');
    const badgeHtml = labels.length > 0 ? `<span class="partner-compare-day-badge">${labels.join('/')}</span>` : '';
    const dot = hasNote ? '<span class="partner-compare-day-dot" aria-hidden="true"></span>' : '';
    const title = `${dateKey} ${hasNote ? '기록 있음' : '기록 없음'}`;

    cells.push(
      '<button type="button" class="' + classes.join(' ') + '" data-date="' + dateKey + '" title="' + title + '" aria-label="' + title + '"' + (hasNote ? '' : ' disabled') + '>' +
      badgeHtml +
      '<span class="partner-compare-day-num">' + day + '</span>' +
      dot +
      '</button>'
    );
  }

  for (let i = 0; i < trailingBlank; i++) {
    cells.push('<span class="partner-compare-day is-outside" aria-hidden="true"></span>');
  }

  container.innerHTML =
    '<div class="partner-compare-weekdays">' +
    weekdays.map((day) => '<span class="partner-compare-weekday">' + day + '</span>').join('') +
    '</div>' +
    '<div class="partner-compare-grid">' + cells.join('') + '</div>' +
    '<div class="partner-compare-legend">' +
    '<span class="partner-compare-legend-item"><span class="partner-compare-legend-dot is-empty"></span>기록 없음</span>' +
    '<span class="partner-compare-legend-item"><span class="partner-compare-legend-dot is-recorded"></span>기록 있음</span>' +
    '<span class="partner-compare-legend-item"><span class="partner-compare-legend-dot is-a"></span>A 선택</span>' +
    '<span class="partner-compare-legend-item"><span class="partner-compare-legend-dot is-b"></span>B 선택</span>' +
    '</div>';

  container.querySelectorAll('.partner-compare-day[data-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = normalizeRecordDateKey(btn.getAttribute('data-date'));
      if (!key) return;
      setPartnerCompareDate(key);
    });
  });
}

function renderPartnerComparePanel() {
  const monthSelect = document.getElementById('partnerCompareMonthSelect');
  const monthLabel = document.getElementById('partnerCompareMonthLabel');
  const summary = document.getElementById('partnerCompareSelectionSummary');
  const generateBtn = document.getElementById('partnerCompareGenerateBtn');
  const targetABtn = document.getElementById('partnerCompareTargetABtn');
  const targetBBtn = document.getElementById('partnerCompareTargetBBtn');
  if (!monthSelect || !monthLabel || !summary || !generateBtn || !targetABtn || !targetBBtn) return;

  const year = Number(partnerMessageState.selectedYear) || new Date().getFullYear();
  const month = Number(partnerMessageState.selectedMonth) || (new Date().getMonth() + 1);
  const noteMap = getPartnerMessageNoteMap(partnerMessageState.records);

  monthSelect.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const value = i + 1;
    const selected = value === month ? ' selected' : '';
    return '<option value="' + value + '"' + selected + '>' + value + '월</option>';
  }).join('');
  monthLabel.textContent = `${year}년 ${month}월`;

  targetABtn.classList.toggle('is-active', partnerMessageState.selectTarget === 'A');
  targetBBtn.classList.toggle('is-active', partnerMessageState.selectTarget === 'B');
  targetABtn.textContent = partnerMessageState.selectTarget === 'A' ? 'A 선택중' : 'A 선택';
  targetBBtn.textContent = partnerMessageState.selectTarget === 'B' ? 'B 선택중' : 'B 선택';

  renderPartnerCompareCalendar(noteMap, year, month);

  const selectedA = partnerMessageState.selectedDateA || '미선택';
  const selectedB = partnerMessageState.selectedDateB || '미선택';
  const targetText = partnerMessageState.selectTarget === 'A' ? '지금은 A를 선택 중' : '지금은 B를 선택 중';
  const hint = String(partnerMessageState.compareHint || '').trim();
  const hintHtml = hint ? `<span class="partner-compare-selection-hint">${escapeHtml(hint)}</span>` : '';

  summary.innerHTML =
    '<span class="partner-compare-selection-item">A: ' + escapeHtml(selectedA) + '</span>' +
    '<span class="partner-compare-selection-item">B: ' + escapeHtml(selectedB) + '</span>' +
    '<span class="partner-compare-selection-target">' + escapeHtml(targetText) + '</span>' +
    hintHtml;

  const ready = Boolean(
    partnerMessageState.selectedDateA &&
    partnerMessageState.selectedDateB &&
    partnerMessageState.selectedDateA !== partnerMessageState.selectedDateB &&
    noteMap.has(partnerMessageState.selectedDateA) &&
    noteMap.has(partnerMessageState.selectedDateB)
  );
  generateBtn.disabled = !ready;
}

async function generateComparePartnerMessage() {
  if (!currentStudent || !currentClassCode) return;

  const area = document.getElementById('summaryReportArea');
  if (!area) return;

  area.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">🤖 성장 파트너가 기록 변화를 비교 중...</div>';

  try {
    const records = await ensurePartnerMessageRecordsLoaded();
    const noteMap = getPartnerMessageNoteMap(records);
    const dateA = normalizeRecordDateKey(partnerMessageState.selectedDateA);
    const dateB = normalizeRecordDateKey(partnerMessageState.selectedDateB);

    if (!dateA || !dateB) {
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">🗓️</span><div class="empty-desc">A와 B 날짜를 먼저 선택해 주세요.</div></div>';
      return;
    }
    if (dateA === dateB) {
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">⚠️</span><div class="empty-desc">A와 B는 서로 다른 날짜를 선택해 주세요.</div></div>';
      return;
    }

    const noteA = String(noteMap.get(dateA) || '').trim();
    const noteB = String(noteMap.get(dateB) || '').trim();
    if (!noteA || !noteB) {
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">📝</span><div class="empty-desc">선택한 날짜의 배움노트가 부족해 비교할 수 없어요.</div></div>';
      return;
    }

    const partner = studentPartner || await ensureStudentPartnerLoaded({ backfill: true });
    const partnerTypeText = buildPartnerTypeText(partner);
    const prompt = buildComparePartnerPromptExact({ partnerTypeText, dateA, noteA, dateB, noteB });
    const result = await callGemini(prompt, { generationConfig: { temperature: 0.5, maxOutputTokens: 3000 } });

    if (!(result.ok && result.text)) {
      area.innerHTML = '<div class="empty-state"><span class="empty-icon">⚠️</span><div class="empty-desc">성장 파트너의 메세지를 받지 못했어요. 다시 눌러주세요.</div></div>';
      return;
    }

    const output = sanitizeAiSummaryText(result.text);
    area.innerHTML = '<div style="line-height:1.7; color:var(--text-main); font-size:0.93rem;">' + formatMarkdown(output) + '</div>';
  } catch (error) {
    area.innerHTML = '<div style="color:var(--color-danger);">기록 비교 피드백 생성 중 오류가 발생했습니다.</div>';
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

















