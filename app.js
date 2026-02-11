
// ============================================
// Supabase 설정
// ============================================
const SUPABASE_URL = 'https://ftvalqzaiooebkulafzg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dmFscXphaW9vZWJrdWxhZnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzk1MzAsImV4cCI6MjA4NTk1NTUzMH0.M1qXvUIuNe2y-9y1gQ2svRdHvDKrMRQ4oMGZPIZveQs';
const GEMINI_API_KEY = 'AIzaSyA3c5OMfaLKwugsWGGJplh9vGyoOlWDNdk';

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

// 나의 기록 전역 변수
let selectedGratitudeTags = [];
let selectedSubjectTags = [];
let currentMessageMode = null; // 'anonymous' or 'named'
let selectedStarCount = 0;
let quizAnswers = {}; // 성향 진단 답변 저장
let studentPersonality = null; // 학생 성향 정보
let calendarMonth = new Date(); // 대시보드 캘린더 월

// ============================================
// 구글 인증 및 라우팅 (New)
// ============================================

// 페이지 로드 시 인증 및 역할 확인
async function checkAuthAndRoute() {
  try {
    const { data, error: authError } = await db.auth.getSession();
    const session = data?.session;

    if (authError) {
      console.error('Auth error:', authError);
    }

    if (!session) {
      const path = window.location.pathname;
      if (!path.includes('index.html')) {
        window.location.href = 'index.html';
      }
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const roleFromUrl = urlParams.get('role');

    // roleFromUrl이 있으면 해당 역할의 프로필만 조회 (역할 전환 지원)
    let profileQuery = db.from('user_profiles').select('*').eq('google_uid', session.user.id);
    if (roleFromUrl) profileQuery = profileQuery.eq('role', roleFromUrl);
    let { data: profile, error: profileError } = await profileQuery.maybeSingle();

    // roleFromUrl 없이 프로필이 여러 개일 경우 대비 폴백
    if (!profile && !roleFromUrl && !profileError) {
      const { data: anyProfile } = await db.from('user_profiles').select('*').eq('google_uid', session.user.id).limit(1).maybeSingle();
      profile = anyProfile;
    }

    if (profileError) throw profileError;

    if (!profile) {
      if (!roleFromUrl) {
        window.location.href = 'index.html';
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

    if (profile.role === 'teacher') {
      currentClassCode = profile.class_code;

      // 먼저 로딩 숨기고 탭을 표시하여 빈 화면 방지
      document.getElementById('authLoadingSection').classList.add('hidden');
      document.getElementById('teacherTab').classList.remove('hidden');
      document.getElementById('teacherMain').classList.remove('hidden');



      // 기본 탭으로 '너의 조언' 진입 (내부에서 loadTeacherData 호출됨)
      try {
        await switchMiniTab('review');
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
      document.getElementById('welcomeMsg').textContent = currentClassCode + ' 클래스 ' + currentStudent.id + '번 ' + typeText + ' 환영합니다!';

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

      // 동료평가 데이터 사전 로드 (실패해도 화면은 유지, 너의 조언 탭 전환 시 재로드됨)
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
  await db.auth.signOut();
  window.location.href = 'index.html';
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
    window.location.href = window.location.pathname + '?role=student';

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
    window.location.href = window.location.pathname + '?role=teacher';

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


const today = new Date();
const krDate = new Date(today.getTime() + (9 * 60 * 60 * 1000));
const todayStr = krDate.toISOString().split('T')[0];

['reviewDate', 'viewDate', 'teacherDate', 'settingDate'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.value = todayStr;
});

// fetchCriteria(todayStr) and fetchRatingCriteria(todayStr) removed 
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
// 다크모드 & 스크롤
// ============================================
function toggleTheme() {
  const html = document.documentElement;
  const icon = document.getElementById('themeIcon');
  if (html.getAttribute('data-theme') === 'dark') { html.removeAttribute('data-theme'); icon.textContent = '🌙'; localStorage.setItem('theme', 'light'); }
  else { html.setAttribute('data-theme', 'dark'); icon.textContent = '☀️'; localStorage.setItem('theme', 'dark'); }
}
(function () { if (localStorage.getItem('theme') === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); document.getElementById('themeIcon').textContent = '☀️'; } })();
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
  const dateInputs = ['reviewDate', 'viewDate', 'teacherDate', 'settingDate', 'selfDate'];
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

// 학생 메인 탭 선택 (나의 기록 vs 너의 조언)
function switchStudentMainTab(mode) {
  // 기존 탭 버튼 대신 하단 내비게이션 버튼 선택
  const btns = document.querySelectorAll('.bottom-nav .nav-item');
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
  document.getElementById('studentSettingClassCode').value = currentClassCode;

  const { data: cls } = await db.from('classes').select('class_name').eq('class_code', currentClassCode).maybeSingle();
  if (cls) {
    document.getElementById('studentSettingClassName').value = cls.class_name;
  }
}

async function saveStudentSettings() {
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

// 너의 조언 세부 탭 (평가하기 vs 결과보기)
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
        console.warn('너의 조언 데이터 로드 오류:', err);
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

// 나의 기록 세부 탭 (성장 일기 vs 대시보드 vs 프로젝트)
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
  const mainTabBtns = document.querySelectorAll('#teacherMain > .mini-tab-container > .mini-tab-btn');
  mainTabBtns.forEach(b => { b.classList.remove('active', 'active-setting'); });

  if (mode === 'review') {
    // 너의 조언 - 하위 탭 표시 후 기본으로 전체 현황
    document.getElementById('reviewSubTabArea').classList.remove('hidden');
    mainTabBtns[0].classList.add('active');
    document.getElementById('rankStudentArea').style.display = 'block';
    await switchReviewSubTab('ranking');
  } else if (mode === 'diary') {
    mainTabBtns[1].classList.add('active');
    document.getElementById('rankStudentArea').style.display = 'none';
    const el = document.getElementById('diaryMiniTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content');
    initDiaryDate(); loadTeacherDiaryData();
  } else if (mode === 'praise') {
    mainTabBtns[2].classList.add('active');
    document.getElementById('rankStudentArea').style.display = 'none';
    const el = document.getElementById('praiseMiniTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content');
    loadPraiseStats(); loadPendingPraises(); loadApprovedPraises(); loadAutoApproveStatus();
  } else if (mode === 'settings') {
    mainTabBtns[3].classList.add('active-setting');
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
function insertTemplate(text) {
  const ta = document.getElementById('reviewContent');
  const start = ta.selectionStart;
  ta.value = ta.value.substring(0, start) + text + ta.value.substring(ta.selectionEnd);
  ta.selectionStart = ta.selectionEnd = start + text.length;
  ta.focus(); updateCharCount();
}
function updateCharCount() {
  const len = document.getElementById('reviewContent').value.length;
  const counter = document.getElementById('charCount'); const submitBtn = document.getElementById('submitBtn');
  counter.textContent = len + '자 / 최소 20자';
  if (len >= 20) { counter.style.color = 'var(--color-eval)'; submitBtn.classList.add('ready'); submitBtn.classList.remove('not-ready'); }
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
function renderTargetGrid(maxCount, myId, completedList, type) {
  const grid = document.getElementById('targetGrid'); grid.innerHTML = '';
  const doneCount = completedList.length; const total = maxCount - 1;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  document.getElementById('progressText').textContent = '평가 진행: ' + doneCount + ' / ' + total + '명 완료 (' + pct + '%)';
  document.getElementById('progressBar').style.width = pct + '%';
  for (let i = 1; i <= maxCount; i++) {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.textContent = type === 'group' ? i + '모둠' : i + '번'; btn.className = 'target-btn';
    if (String(i) === String(myId)) { btn.classList.add('disabled'); btn.title = '자기 자신은 평가할 수 없습니다'; }
    else if (completedList.includes(String(i))) { btn.classList.add('done'); btn.title = '이미 평가 완료 (클릭하면 수정)'; btn.onclick = () => selectTarget(i, btn); }
    else { btn.onclick = () => selectTarget(i, btn); }
    grid.appendChild(btn);
  }
}
function selectTarget(id, button) { document.querySelectorAll('.target-btn.selected').forEach(b => b.classList.remove('selected')); button.classList.add('selected'); document.getElementById('targetId').value = id; }

// ============================================
// 평가 제출
// ============================================
document.getElementById('reviewForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn'); const msg = document.getElementById('submitMsg');
  const data = { class_code: currentClassCode, review_date: document.getElementById('reviewDate').value, reviewer_id: String(currentStudent.id), target_id: document.getElementById('targetId').value, review_content: document.getElementById('reviewContent').value, scores_json: { criteria: ratingCriteria, scores: currentRatings }, review_type: currentStudent.type, reviewer_email: '' };
  if (!data.target_id) { showMsg(msg, '평가 대상을 선택해주세요.', 'error'); return; }
  if (data.reviewer_id === data.target_id) { showMsg(msg, '자기 자신/모둠은 평가할 수 없습니다.', 'error'); return; }
  if (data.review_content.trim().length < 20) { showMsg(msg, '피드백은 최소 20자 이상 입력해주세요.', 'error'); return; }
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
  document.getElementById('reviewForm').reset(); currentRatings = {};
  document.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('selected'));
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
  const { data: reviews } = await db.from('reviews').select('*').eq('class_code', currentClassCode).eq('review_date', date).eq('target_id', String(currentStudent.id)).eq('review_type', currentStudent.type);
  if (!reviews || reviews.length === 0) { setLoading(false, btn, '내 결과 확인하기'); showMsg(msg, '해당 날짜(' + date + ')에 받은 평가가 없습니다.', 'error'); return; }
  const { data: allReviews } = await db.from('reviews').select('target_id, scores_json').eq('class_code', currentClassCode).eq('review_date', date).eq('review_type', currentStudent.type);
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
async function callGemini(promptText, config = {}) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }], ...(config.generationConfig ? { generationConfig: config.generationConfig } : {}) }) });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message || 'HTTP ' + res.status };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? { ok: true, text } : { ok: false, error: '빈 응답' };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function generateSummary(reviews) {
  if (!reviews || reviews.length === 0) return '요약할 리뷰 데이터가 없습니다.';
  const prompt = '역할: 객관적이고 명확한 피드백을 주는 선생님\n목표: 동료 평가 데이터(주관식 피드백)를 분석하여 핵심만 간결하게 전달하기\n\n중요: 아래 리뷰 데이터는 친구들이 작성한 주관식 피드백입니다. 점수와 관련된 내용은 절대 언급하지 마세요.\n\n요구사항:\n1. 편지글 형식이나 인삿말 절대 금지. 바로 본론으로 시작할 것.\n2. 오직 아래 두 가지 헤더로만 구성할 것.\n   ## 칭찬해 주고 싶은 점\n   ## 앞으로를 위한 조언\n3. 칭찬해 주고 싶은 점: 긍정적인 피드백을 요약하여 바로 첫 줄부터 내용을 작성.\n4. 앞으로를 위한 조언: 아쉬운 점을 부드럽고 건설적인 문장(해요체)으로 순화하여 바로 첫 줄부터 내용을 작성.\n5. 점수나 수치와 관련된 내용은 절대 포함하지 말 것.\n6. 각 헤더 바로 다음 줄에 빈 줄 없이 내용을 시작할 것. 7. 응답 맨 첫 줄에 빈 줄이나 공백 없이 바로 내용을 시작할 것.\n\n--- 리뷰 데이터 ---\n' + reviews.join('\n');
  const result = await callGemini(prompt, { generationConfig: { temperature: 0.4, maxOutputTokens: 2048 } });
  return result.ok ? result.text : 'AI 요약 실패: 잠시 후 다시 시도해주세요.';
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
      const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
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
  const bins = [0, 0, 0, 0, 0]; const binLabels = ['1점대', '2점대', '3점대', '4점대', '5점대'];
  ranking.forEach(r => { const avg = r.totalAvg; if (avg >= 4.5) bins[4]++; else if (avg >= 3.5) bins[3]++; else if (avg >= 2.5) bins[2]++; else if (avg >= 1.5) bins[1]++; else bins[0]++; });
  const maxBin = Math.max(...bins, 1); const colors = ['#D4A574', '#C2654A', '#D4785E', '#5E8C61', '#5A9E8F'];
  let h = '<div class="chart-container" style="border-left-color:var(--color-blue);margin-top:20px;"><h4 style="color:var(--color-blue);">📈 ' + (type === 'group' ? '모둠' : '개인') + ' 평균 점수 분포</h4><div class="bar-chart">';
  binLabels.forEach((label, i) => { const pct = (bins[i] / maxBin) * 100; h += '<div class="bar-item"><div class="bar-label">' + label + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:linear-gradient(90deg,' + colors[i] + ' 0%,' + colors[i] + 'CC 100%);"></div></div><div class="bar-value">' + bins[i] + '명</div></div>'; });
  h += '</div></div>'; document.getElementById('rankingTable').insertAdjacentHTML('afterend', h);
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
async function generateCriteriaAI(btn) {
  const date = document.getElementById('settingDate').value;
  const grade = document.getElementById('autoSchoolLevel').value + ' ' + document.getElementById('autoGradeSelect').value;
  const evalTarget = document.getElementById('autoTargetSelect').value;
  const objTask = await getObjectiveAndTask(date);
  if (!objTask.objective && !objTask.task) { showModal({ type: 'alert', icon: '❌', title: '오류', message: "저장된 학습목표나 과제가 없습니다. 먼저 '기본 정보 저장' 버튼을 눌러주세요." }); return; }
  setLoading(true, btn, '🤖 AI 생성 중...');
  const targetText = evalTarget === 'group' ? '모둠' : '개인';
  const prompt = '당신은 초중고 교사를 위한 동료평가 기준 생성 전문가입니다.\n\n[입력 정보]\n- 학년: ' + grade + '\n- 평가 대상: ' + targetText + ' 평가\n- 학습목표: ' + (objTask.objective || '(미입력)') + '\n- 평가과제: ' + (objTask.task || '(미입력)') + '\n\n[출력 규칙]\n1. 반드시 3개 영역, 각 영역 2문항씩 총 6개 문항을 생성.\n2. 모든 문항은 "~했나요?", "~되었나요?" 형태의 질문.\n3. 학생이 이해할 수 있는 쉬운 표현 사용.\n4. \'또래\' 대신 \'친구\' 표현 사용.\n\n[영역별 기준]\n① 지식·이해 영역\n- 문항1: 내용 정확성\n- 문항2: 정보 다양성/근거\n② 과정·기능 영역\n- 문항1: 구성/디자인/가독성\n- 문항2: 전달력/발표/자료활용\n③ 가치·태도 영역\n- 문항1: 집중/책임감\n- 문항2: 협력/역할수행 (' + targetText + ' 특성 반영)\n\n[출력 형식]\n반드시 아래 JSON 형식으로만 응답. 다른 말 절대 금지.\n{"criteria": ["지식이해1", "지식이해2", "과정기능1", "과정기능2", "가치태도1", "가치태도2"]}';
  const result = await callGemini(prompt, { generationConfig: { temperature: 0.2, maxOutputTokens: 512 } });
  setLoading(false, btn, '🤖 2단계: AI로 기준 자동 생성하기');
  if (!result.ok) { showModal({ type: 'alert', icon: '❌', title: '생성 실패', message: result.error }); return; }
  try {
    let text = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = text.indexOf('{'); const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
    const parsed = JSON.parse(text);
    if (parsed.criteria && parsed.criteria.length === 6) {
      for (let i = 0; i < 6; i++) { const input = document.getElementById('autoRate' + (i + 1)); input.value = parsed.criteria[i] || ''; input.removeAttribute('readonly'); input.removeAttribute('disabled'); }
      showModal({ type: 'alert', icon: '✨', title: 'AI 생성 완료', message: '평가기준이 생성되었습니다.<br>내용을 확인하고 <strong>3단계 최종 저장</strong>을 눌러주세요.' });
    } else throw new Error('criteria 6개 불일치');
  } catch (e) { showModal({ type: 'alert', icon: '❌', title: '파싱 실패', message: 'AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.' }); }
}
function resetAllReviewData(btn) {
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
// 나의 기록 (Self-Evaluation) 기능
// ============================================

// 감사 태그 토글
function toggleGratitudeTag(tag) {
  const btnList = document.querySelectorAll('.tag-btn');
  const tagBtn = Array.from(btnList).find(btn => btn.innerText.includes(tag));

  if (!tagBtn) return;

  if (selectedGratitudeTags.includes(tag)) {
    selectedGratitudeTags = selectedGratitudeTags.filter(t => t !== tag);
    tagBtn.classList.remove('selected');
  } else {
    selectedGratitudeTags.push(tag);
    tagBtn.classList.add('selected');
  }

  if (navigator.vibrate) navigator.vibrate(10);
}

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
  } else {
    selectedSubjectTags.push(tag);
    tagBtn.classList.add('selected');
  }

  if (navigator.vibrate) navigator.vibrate(10);
}

// 데일리 나의 기록 로드
async function loadDailyReflection() {
  if (!currentStudent || !currentClassCode) return;

  let targetDate = document.getElementById('selfDate').value;
  if (!targetDate) {
    const kr = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
    targetDate = kr.toISOString().split('T')[0];
    document.getElementById('selfDate').value = targetDate;
  }

  // 오늘 작성한 나의 기록 있는지 확인
  const { data: reflection } = await db.from('daily_reflections')
    .select('*, teacher_messages(*)')
    .eq('class_code', currentClassCode)
    .eq('student_id', String(currentStudent.id))
    .eq('reflection_date', targetDate)
    .maybeSingle();

  if (reflection) {
    document.getElementById('gratitudeText').value = reflection.gratitude_text || '';
    document.getElementById('learningText').value = reflection.learning_text || '';
    selectedGratitudeTags = reflection.gratitude_tags || [];
    selectedSubjectTags = reflection.subject_tags || [];
  } else {
    // 기록이 없으면 폼 초기화
    document.getElementById('gratitudeText').value = '';
    document.getElementById('learningText').value = '';
    selectedGratitudeTags = [];
    selectedSubjectTags = [];
  }

  // 감사 태그 버튼 활성화
  document.querySelectorAll('.tag-btn').forEach(btn => btn.classList.remove('selected'));
  selectedGratitudeTags.forEach(tag => {
    const tagBtn = Array.from(document.querySelectorAll('.tag-btn')).find(btn => btn.innerText.includes(tag));
    if (tagBtn) tagBtn.classList.add('selected');
  });

  // 과목 태그 버튼 활성화
  document.querySelectorAll('.subject-tag-btn').forEach(btn => btn.classList.remove('selected'));
  selectedSubjectTags.forEach(tag => {
    const tagBtn = Array.from(document.querySelectorAll('.subject-tag-btn')).find(btn => btn.innerText.includes(tag));
    if (tagBtn) tagBtn.classList.add('selected');
  });
  // 선생님 답장 확인
  await checkForTeacherReplies();
}

// 데일리 나의 기록 제출
async function submitDailyReflection() {
  if (!currentStudent || !currentClassCode) {
    showModal({ type: 'alert', icon: '⚠️', title: '오류', message: '로그인이 필요합니다.' });
    return;
  }

  const gratitudeText = document.getElementById('gratitudeText').value.trim();
  const learningText = document.getElementById('learningText').value.trim();
  const teacherMessage = document.getElementById('teacherMessage').value.trim();
  const wantsReply = document.getElementById('wantsReply').checked;

  if (!gratitudeText && !learningText) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 필요', message: '감사한 것이나 배운 것 중 하나는 써주세요.' });
    return;
  }

  const btn = document.getElementById('saveDailyBtn');
  const msg = document.getElementById('dailyMsg');
  const targetDate = document.getElementById('selfDate').value;

  setLoading(true, btn, '저장 중...');

  try {
    const reflectionData = {
      class_code: currentClassCode,
      student_id: String(currentStudent.id),
      reflection_date: targetDate,
      gratitude_text: gratitudeText || null,
      gratitude_tags: selectedGratitudeTags.length > 0 ? selectedGratitudeTags : null,
      learning_text: learningText || null,
      subject_tags: selectedSubjectTags.length > 0 ? selectedSubjectTags : null,
      has_teacher_message: !!teacherMessage
    };

    const { data: savedReflection, error: reflectionError } = await db.from('daily_reflections')
      .upsert(reflectionData, { onConflict: 'class_code,student_id,reflection_date' })
      .select()
      .single();

    if (reflectionError) throw reflectionError;

    // 선생님께 메시지가 있으면 저장
    if (teacherMessage && currentMessageMode) {
      const messageData = {
        class_code: currentClassCode,
        reflection_id: savedReflection.id,
        student_id: currentMessageMode === 'named' ? String(currentStudent.id) : null,
        is_anonymous: currentMessageMode === 'anonymous',
        message_content: teacherMessage,
        wants_reply: wantsReply,
        has_reply: false
      };
      const { error: messageError } = await db.from('teacher_messages').insert(messageData);
      if (messageError) throw messageError;
    }

    setLoading(false, btn, '저장하기');
    showMsg(msg, '성공적으로 저장되었습니다! 🎉', 'success');

    // AI 맞춤 피드백 생성
    generateAiFeedback(gratitudeText, learningText, selectedSubjectTags);

    // 입력 필드 초기화 (메시지만)
    if (teacherMessage) {
      document.getElementById('teacherMessage').value = '';
      document.getElementById('wantsReply').checked = false;
      currentMessageMode = null;
      document.getElementById('anonymousBtn').classList.remove('active');
      document.getElementById('namedBtn').classList.remove('active');
      document.getElementById('messageInputArea').classList.add('hidden');
    }

  } catch (error) {
    setLoading(false, btn, '저장하기');
    showMsg(msg, '오류: ' + error.message, 'error');
  }
}

// AI 맞춤 피드백 생성 (감사+배움 글에 대해)
async function generateAiFeedback(gratitude, learning, subjects) {
  const feedbackSection = document.getElementById('aiFeedbackSection');
  const feedbackText = document.getElementById('aiFeedbackText');
  feedbackSection.classList.remove('hidden');
  feedbackText.innerHTML = '<span style="color:var(--text-sub);">🤖 AI가 피드백을 작성 중...</span>';

  const subjectInfo = subjects.length > 0 ? '과목/활동: ' + subjects.join(', ') : '';
  const personalityInfo = studentPersonality ? '학생 성향: ' + studentPersonality.personality_type : '';

  const prompt = '당신은 초등학생의 성장 일기에 따뜻한 맞춤 피드백을 주는 담임선생님입니다.\n\n[학생 기록]\n감사한 것: ' + (gratitude || '(미작성)') + '\n배운 것: ' + (learning || '(미작성)') + '\n' + subjectInfo + '\n' + personalityInfo + '\n\n[피드백 규칙]\n1. 해요체로 부드럽게 3~4문장 이내로 작성\n2. 학생이 쓴 내용을 구체적으로 언급하며 칭찬\n3. 배운 것에 대해 "다음에 이렇게 해보면 더 좋겠다"는 조언 한 가지\n4. 따뜻하고 응원하는 어조\n5. 이모지 적절히 사용\n6. 절대 5문장을 넘기지 말것';

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
    .eq('student_id', String(currentStudent.id))
    .eq('wants_reply', true);

  if (!messages || messages.length === 0) return;

  // 답장이 있는 메시지 찾기
  const repliedMessage = messages.find(m => m.teacher_replies && m.teacher_replies.length > 0);

  if (repliedMessage && repliedMessage.teacher_replies[0]) {
    document.getElementById('teacherReplyContent').textContent = repliedMessage.teacher_replies[0].reply_content;
    document.getElementById('teacherReplyNotification').classList.remove('hidden');
  }
}

// 별점 선택
function selectStarRating(stars) {
  selectedStarCount = stars;
  document.getElementById('selectedStars').value = stars;

  const starBtns = document.querySelectorAll('.star-btn');
  starBtns.forEach((btn, index) => {
    if (index < stars) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });

  if (navigator.vibrate) navigator.vibrate(15);
}

// 프로젝트 나의 기록 제출
async function submitProjectReflection() {
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

  if (selectedStarCount === 0) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 필요', message: '별점을 선택해주세요.' });
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
      star_rating: selectedStarCount,
      comment: comment || null
    };

    const { error } = await db.from('project_reflections')
      .upsert(projectData, { onConflict: 'class_code,student_id,project_name,reflection_date' });

    if (error) throw error;

    setLoading(false, btn, '제출');
    showMsg(msg, '성공적으로 제출되었습니다! 🌟', 'success');

    // AI 분석 생성
    const analysis = await generateProjectAnalysis(selectedStarCount);
    document.getElementById('projectAIText').textContent = analysis;
    document.getElementById('projectAIAnalysis').classList.remove('hidden');

    // 입력 필드 초기화
    document.getElementById('projectName').value = '';
    document.getElementById('projectComment').value = '';
    selectedStarCount = 0;
    document.querySelectorAll('.star-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('selectedStars').value = '0';

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
// 교사용 나의 기록 관리 기능
// ============================================

// 성장 일기 날짜 초기화
function initDiaryDate() {
  const kr = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
  const today = kr.toISOString().split('T')[0];
  document.getElementById('diaryViewDate').value = today;
}

// 교사용 성장 일기 데이터 로드
async function loadTeacherDiaryData() {
  if (!currentClassCode) return;

  const selectedDate = document.getElementById('diaryViewDate').value;
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

    const { data: allMessages } = await db.from('teacher_messages')
      .select('*')
      .eq('class_code', currentClassCode);

    // 통계 업데이트
    document.getElementById('totalReflections').textContent = allReflections?.length || 0;
    document.getElementById('todayReflections').textContent = todayReflections?.length || 0;
    document.getElementById('totalMessages').textContent = allMessages?.length || 0;

    // 선택한 날짜의 메시지 로드
    const { data: messages } = await db.from('teacher_messages')
      .select('*, daily_reflections!inner(*), teacher_replies(*)')
      .eq('class_code', currentClassCode)
      .eq('daily_reflections.reflection_date', selectedDate)
      .order('created_at', { ascending: false });

    renderMessageList(messages || []);

    // 감정 키워드 알림 감지
    renderEmotionAlerts(todayReflections || []);

    // 감사 키워드 통계
    if (todayReflections && todayReflections.length > 0) {
      const tagCounts = {};
      todayReflections.forEach(r => {
        if (r.gratitude_tags && Array.isArray(r.gratitude_tags)) {
          r.gratitude_tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });
      renderKeywordStats(tagCounts);
    } else {
      document.getElementById('gratitudeStats').innerHTML = '<div class="empty-state"><span class="empty-icon">📊</span><div class="empty-desc">이 날짜에 감사 키워드가 없습니다</div></div>';
    }

  } catch (error) {
    console.error('Error loading diary data:', error);
    showModal({ type: 'alert', icon: '❌', title: '오류', message: '데이터 로드 실패: ' + error.message });
  }
}

// ============================================
// 칭찬 우체통
// ============================================
function switchPraiseTab(mode) {
  const btns = document.querySelectorAll('#praiseSection .sub-tab-btn');
  document.getElementById('praiseSendTab').classList.add('hidden');
  document.getElementById('praiseReceivedTab').classList.add('hidden');
  btns.forEach(b => b.classList.remove('active'));
  if (mode === 'send') { btns[0].classList.add('active'); document.getElementById('praiseSendTab').classList.remove('hidden'); }
  else { btns[1].classList.add('active'); document.getElementById('praiseReceivedTab').classList.remove('hidden'); loadReceivedPraises(); }
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

// 교사 - 칭찬 우체통 관리
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
  await db.from('praise_messages').update({ is_approved: true }).eq('id', id);
  loadPendingPraises(); loadApprovedPraises(); loadPraiseStats();
}
async function rejectPraise(id) {
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
    const texts = [r.gratitude_text || '', r.learning_text || ''].join(' ');
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
    const hasReply = msg.teacher_replies && msg.teacher_replies.length > 0;
    const wantsReply = msg.wants_reply;

    const date = new Date(msg.created_at);
    const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    html += `
      <div class="message-card">
        <div class="message-card-header">
          <span class="message-card-badge ${badgeClass}">${studentId}</span>
          ${hasReply ? '<span class="replied-badge">✓ 답장 완료</span>' : (wantsReply ? '<span style="color:var(--color-teal); font-size:0.85rem;">💬 답장 요청</span>' : '')}
        </div>
        <div class="message-card-content">${escapeHtml(msg.message_content)}</div>
        <div class="message-card-meta">
          <span>📅 ${msg.daily_reflections?.reflection_date || '날짜 미상'}</span>
          <span>🕐 ${timeStr}</span>
        </div>
        ${hasReply ? `
          <div style="margin-top:10px; padding:10px; background:var(--color-teacher-bg); border-left:3px solid var(--color-teacher); border-radius:6px;">
            <div style="font-size:0.8rem; color:var(--color-teacher); font-weight:600; margin-bottom:5px;">내 답장:</div>
            <div style="color:var(--text-main); font-size:0.9rem;">${escapeHtml(msg.teacher_replies[0].reply_content)}</div>
          </div>
        ` : `
          <div class="message-card-actions">
            <button class="reply-btn" data-msg-id="${msg.id}" data-student-id="${escapeHtml(studentId)}" data-msg-content="${escapeHtml(msg.message_content)}" onclick="showReplyModal(this.dataset.msgId, this.dataset.studentId, this.dataset.msgContent)">답장하기</button>
          </div>
        `}
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

// 답장 모달 표시
function showReplyModal(messageId, studentId, messageContent) {
  const safeStudentId = escapeHtml(studentId);
  const safeContent = escapeHtml(messageContent);
  const overlay = document.createElement('div');
  overlay.className = 'reply-modal-overlay';
  overlay.innerHTML = `
    <div class="reply-modal">
      <div class="reply-modal-header">
        💌 ${safeStudentId} 학생에게 답장
      </div>
      <div class="reply-modal-content">
        <div style="background:var(--bg-soft); padding:10px; border-radius:8px; margin-bottom:15px; font-size:0.9rem; color:var(--text-sub);">
          <strong>학생 메시지:</strong><br>
          "${safeContent}"
        </div>
        <textarea id="replyTextarea" class="reply-textarea" placeholder="따뜻한 답장을 작성해주세요..."></textarea>
      </div>
      <div class="reply-modal-actions">
        <button class="reply-cancel-btn" onclick="closeReplyModal()">취소</button>
        <button class="reply-submit-btn" data-msg-id="${escapeHtml(messageId)}" onclick="submitReply(this.dataset.msgId)">답장 보내기</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.getElementById('replyTextarea').focus();

  // 모달 외부 클릭 시 닫기
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeReplyModal();
  });
}

// 답장 모달 닫기
function closeReplyModal() {
  const overlay = document.querySelector('.reply-modal-overlay');
  if (overlay) overlay.remove();
}

// 답장 제출
async function submitReply(messageId) {
  const textarea = document.getElementById('replyTextarea');
  const replyContent = textarea.value.trim();

  if (!replyContent) {
    showModal({ type: 'alert', icon: '⚠️', title: '입력 필요', message: '답장 내용을 입력해주세요.' });
    return;
  }

  try {
    // 답장 저장
    const { error: replyError } = await db.from('teacher_replies').insert({
      message_id: messageId,
      reply_content: replyContent
    });

    if (replyError) throw replyError;

    // 메시지 상태 업데이트
    const { error: updateError } = await db.from('teacher_messages')
      .update({ has_reply: true })
      .eq('id', messageId);

    if (updateError) throw updateError;

    closeReplyModal();
    showModal({ type: 'alert', icon: '✅', title: '답장 완료', message: '답장이 성공적으로 전송되었습니다!' });
    loadTeacherDiaryData(); // 목록 새로고침

  } catch (error) {
    showModal({ type: 'alert', icon: '❌', title: '오류', message: '답장 전송 실패: ' + error.message });
  }
}

// (중복 탭 전환 함수 제거됨 - 위의 switchStudentMainTab, switchPeerTab, switchSelfTab 사용)

// ============================================
// 성향 진단 시스템
// ============================================

const personalityQuestions = [
  {
    id: 1,
    category: '피드백 선호도',
    question: '피드백을 받을 때 어떤 방식이 더 좋나요?',
    optionA: { label: 'A', text: '구체적인 개선점과 해결방법' },
    optionB: { label: 'B', text: '잘한 점 중심의 격려와 응원' }
  },
  {
    id: 2,
    category: '피드백 선호도',
    question: '평가 결과를 볼 때 어떤 정보가 더 중요한가요?',
    optionA: { label: 'A', text: '숫자와 데이터 중심의 분석' },
    optionB: { label: 'B', text: '전체적인 느낌과 방향성' }
  },
  {
    id: 3,
    category: '동기부여 유형',
    question: '공부할 때 무엇이 더 동기부여가 되나요?',
    optionA: { label: 'A', text: '목표 달성과 성과 향상' },
    optionB: { label: 'B', text: '새로운 것을 배우는 과정 자체' }
  },
  {
    id: 4,
    category: '동기부여 유형',
    question: '잘못했을 때 어떤 말이 더 도움이 되나요?',
    optionA: { label: 'A', text: '이렇게 하면 더 나아질거야' },
    optionB: { label: 'B', text: '괜찮아, 다음엔 더 잘할 수 있어' }
  },
  {
    id: 5,
    category: '학습 스타일',
    question: '과제를 할 때 어떤 방식이 더 편한가요?',
    optionA: { label: 'A', text: '체계적인 계획을 세우고 진행' },
    optionB: { label: 'B', text: '유연하게 상황에 맞춰 진행' }
  },
  {
    id: 6,
    category: '학습 스타일',
    question: '새로운 걸 배울 때 어떤 게 더 좋나요?',
    optionA: { label: 'A', text: '명확한 지침과 단계' },
    optionB: { label: 'B', text: '자유로운 탐색과 실험' }
  },
  {
    id: 7,
    category: '감정 표현',
    question: '좋은 결과가 나왔을 때 어떤 게 기분이 더 좋나요?',
    optionA: { label: 'A', text: '이 부분이 특히 훌륭했어!' },
    optionB: { label: 'B', text: '정말 잘했어! 멋져!' }
  },
  {
    id: 8,
    category: '감정 표현',
    question: '힘들 때 어떤 말이 더 위로가 되나요?',
    optionA: { label: 'A', text: '이건 이렇게 바꿔보자' },
    optionB: { label: 'B', text: '힘내! 넌 할 수 있어' }
  }
];

// 나의 기록 초기화
async function initSelfEvaluation() {
  // 날짜 초기화 (오늘)
  const selfDateInput = document.getElementById('selfDate');
  if (selfDateInput && !selfDateInput.value) {
    const kr = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
    selfDateInput.value = kr.toISOString().split('T')[0];
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
    console.error('나의 기록 초기화 오류:', error);
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
          <div class="quiz-option" onclick="selectQuizOption(${q.id}, 'A')">
            <div class="quiz-option-label">${q.optionA.label}</div>
            <div class="quiz-option-text">${q.optionA.text}</div>
          </div>
          <div class="quiz-option" onclick="selectQuizOption(${q.id}, 'B')">
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
  quizAnswers[questionId] = answer;

  const questionEl = document.getElementById(`question${questionId}`);
  questionEl.classList.add('answered');
  questionEl.querySelectorAll('.quiz-option').forEach(opt => {
    opt.classList.remove('selected');
  });

  const selectedIndex = answer === 'A' ? 0 : 1;
  questionEl.querySelectorAll('.quiz-option')[selectedIndex].classList.add('selected');

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
    const { error } = await db.from('student_personality').upsert({
      class_code: currentClassCode,
      student_id: currentStudent.id,
      personality_type: personalityType,
      question_responses: quizAnswers
    }, { onConflict: 'class_code,student_id' });

    if (error) throw error;

    studentPersonality = { personality_type: personalityType };
    showPersonalityResult(personalityType);

    document.getElementById('personalityQuiz').classList.add('hidden');
    document.getElementById('personalityResult').classList.remove('hidden');

    setTimeout(() => {
      document.getElementById('personalityResult').classList.add('hidden');
      document.getElementById('selfEvaluationMenu').classList.remove('hidden');
      switchSelfTab('daily');
    }, 4000);

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
}

// 재진단
function retakePersonalityQuiz() {
  document.getElementById('personalityResult').classList.add('hidden');
  document.getElementById('selfEvaluationMenu').classList.add('hidden');
  showPersonalityQuiz();
  document.getElementById('personalityQuiz').classList.remove('hidden');
}

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
    renderCalendar(allRecords);
    renderLearningWordCloud(allRecords);
    renderSubjectChart(allRecords);
    renderGratitudeStats(allRecords);
    renderGrowthTimeline(allRecords);
  } catch (error) {
    console.error('대시보드 로드 오류:', error);
  }
}

// ============================================
// 나의 목표 설정 & 추적
// ============================================
async function loadGoals() {
  if (!currentStudent || !currentClassCode) return;
  const { data: goals } = await db.from('student_goals').select('*').eq('class_code', currentClassCode).eq('student_id', String(currentStudent.id)).order('created_at', { ascending: false }).limit(20);
  renderGoals(goals || []);
}
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
  const input = document.getElementById('goalInput');
  const text = input.value.trim();
  if (!text) return;
  const goalType = document.getElementById('goalType').value;
  await db.from('student_goals').insert({ class_code: currentClassCode, student_id: String(currentStudent.id), goal_text: text, goal_type: goalType });
  input.value = '';
  loadGoals();
}
async function toggleGoal(id, completed) {
  await db.from('student_goals').update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', id);
  loadGoals();
}
async function deleteGoal(id) {
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
  let gratitudeCount = 0;
  records.forEach(r => {
    if (r.gratitude_text) gratitudeCount++;
    if (r.subject_tags && Array.isArray(r.subject_tags)) r.subject_tags.forEach(t => subjectSet.add(t));
  });
  const badges = [];
  if (totalDays >= 1) badges.push({ icon: '🌱', label: '첫 기록', desc: '성장 일기 첫 작성' });
  if (totalDays >= 7) badges.push({ icon: '🌿', label: '7일 달성', desc: '7일 이상 기록' });
  if (totalDays >= 30) badges.push({ icon: '🌳', label: '30일 달성', desc: '30일 이상 기록' });
  if (streak >= 3) badges.push({ icon: '🔥', label: '3일 연속', desc: '3일 연속 기록' });
  if (streak >= 7) badges.push({ icon: '💎', label: '7일 연속', desc: '7일 연속 기록' });
  if (gratitudeCount >= 5) badges.push({ icon: '💝', label: '감사 마스터', desc: '감사 기록 5회 이상' });
  if (subjectSet.size >= 5) badges.push({ icon: '📚', label: '다재다능', desc: '5개 이상 과목 기록' });

  const badgeEl = document.getElementById('badgeContainer');
  if (badges.length === 0) { badgeEl.innerHTML = '<span style="color:var(--text-sub);font-size:0.85rem;">기록을 쌓으면 뱃지를 받을 수 있어요!</span>'; return; }
  badgeEl.innerHTML = badges.map(b => '<div class="badge-item" title="' + b.desc + '"><span style="font-size:1.4rem;">' + b.icon + '</span><span style="font-size:0.72rem;color:var(--text-sub);">' + b.label + '</span></div>').join('');
}

// ① 기록 캘린더
function renderCalendar(records) {
  const grid = document.getElementById('calendarGrid');
  const title = document.getElementById('calendarTitle');
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();

  title.textContent = year + '년 ' + (month + 1) + '월';

  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

  // 날짜별 기록 맵
  const recordMap = {};
  records.forEach(r => { recordMap[r.reflection_date] = r; });

  let html = '';
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  dayNames.forEach(d => { html += '<div class="calendar-header">' + d + '</div>'; });

  // 빈 칸
  for (let i = 0; i < firstDay; i++) html += '<div class="calendar-day empty"></div>';

  for (let d = 1; d <= lastDate; d++) {
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const rec = recordMap[dateStr];
    let cls = 'calendar-day';
    if (dateStr === todayStr) cls += ' today';
    if (rec) {
      if (rec.gratitude_text && rec.learning_text) cls += ' has-both';
      else if (rec.gratitude_text) cls += ' has-gratitude';
      else if (rec.learning_text) cls += ' has-learning';
      cls += ' clickable';
    }
    html += '<div class="' + cls + '" data-date="' + dateStr + '">' + d + '</div>';
  }

  grid.innerHTML = html;
  // 날짜 클릭 시 미리보기
  grid.querySelectorAll('.calendar-day.clickable').forEach(el => {
    el.onclick = () => {
      const date = el.dataset.date;
      const rec = recordMap[date];
      if (!rec) return;
      grid.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
      el.classList.add('selected');
      const preview = document.getElementById('calendarPreview');
      let h = '<div style="font-weight:700;margin-bottom:8px;color:var(--primary);">📅 ' + date + '</div>';
      if (rec.gratitude_text) h += '<div style="margin-bottom:6px;"><span style="font-weight:600;">💝 감사:</span> ' + escapeHtml(rec.gratitude_text.substring(0, 100)) + (rec.gratitude_text.length > 100 ? '...' : '') + '</div>';
      if (rec.learning_text) h += '<div><span style="font-weight:600;">📚 배움:</span> ' + escapeHtml(rec.learning_text.substring(0, 100)) + (rec.learning_text.length > 100 ? '...' : '') + '</div>';
      if (rec.subject_tags && rec.subject_tags.length > 0) h += '<div style="margin-top:6px;">' + rec.subject_tags.map(t => '<span style="display:inline-block;padding:2px 8px;background:var(--bg-soft);border-radius:10px;font-size:0.75rem;margin:2px;">' + t + '</span>').join('') + '</div>';
      preview.innerHTML = h;
      preview.classList.remove('hidden');
    };
  });
}

function changeCalendarMonth(delta) {
  calendarMonth.setMonth(calendarMonth.getMonth() + delta);
  loadDashboardData();
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
    const text = (r.learning_text || r.gratitude_text || '').substring(0, 60);
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
    const gratitudeTexts = records.filter(r => r.gratitude_text).map(r => r.gratitude_text);
    const learningTexts = records.filter(r => r.learning_text).map(r => r.learning_text);
    const allSubjects = [];
    records.forEach(r => { if (r.subject_tags) allSubjects.push(...r.subject_tags); });

    const prompt = '당신은 초등학생의 성장 기록을 요약해주는 따뜻한 담임선생님입니다.\n\n[기간] ' + periodLabel + ' (' + startStr + ' ~ ' + endDate + ')\n[기록 수] ' + records.length + '일\n[감사 기록]\n' + gratitudeTexts.join('\n') + '\n[배움 기록]\n' + learningTexts.join('\n') + '\n[과목/활동] ' + [...new Set(allSubjects)].join(', ') + '\n\n[요약 규칙]\n1. 해요체로 3~5문장 이내\n2. 이 기간 동안의 핵심 성장 포인트 정리\n3. 자주 등장한 과목이나 키워드 언급\n4. 다음 기간에 도전해볼 것 한 가지 제안\n5. 따뜻하고 구체적인 칭찬 포함\n6. 이모지 적절히 사용';

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
    const allGratitude = [];

    records.forEach(r => {
      if (r.subject_tags) allSubjects.push(...r.subject_tags);
      if (r.learning_text) allLearning.push(r.reflection_date + ': ' + r.learning_text);
      if (r.gratitude_text) allGratitude.push(r.gratitude_text);
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
    <p>본 약관은 김도현(이하 "운영자")이 제공하는 GrowLoop 서비스의 이용과 관련하여 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
  </div>

  <div class="terms-section">
    <h3 class="terms-article">제2조 (서비스 내용)</h3>
    <p>GrowLoop는 학습 기록 및 동료 평가 기반 성장 관리 서비스입니다.</p>
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
    <p>GrowLoop는 다음 목적을 위해 개인정보를 처리합니다.</p>
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
    title: 'GrowLoop 이용약관',
    message: `<div class="terms-modal-body">${TERMS_HTML}</div>`
  });
}

function openPrivacyModal() {
  showModal({
    type: 'alert',
    icon: '🔐',
    title: 'GrowLoop 개인정보처리방침',
    message: `<div class="terms-modal-body">${PRIVACY_HTML}</div>`
  });
}


