
// ============================================
// Supabase 설정
// ============================================
const SUPABASE_URL = 'https://ftvalqzaiooebkulafzg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oNfoK3MlhcFkuvWs9BE97g_6UHbNy_4';
const GEMINI_API_KEY = 'AIzaSyC6pocAnXPU90uhlbzSxpN58258s8DiGgY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// 전역 변수
// ============================================
let currentRatings = {};
let ratingCriteria = [];
let currentStudent = null;
let currentClassCode = '';

function showRegisterMode() {
  document.getElementById('teacherLoginMode').classList.add('hidden');
  document.getElementById('teacherRegisterMode').classList.remove('hidden');
}
function showLoginMode() {
  document.getElementById('teacherRegisterMode').classList.add('hidden');
  document.getElementById('teacherLoginMode').classList.remove('hidden');
}
async function registerClass() {
  const code = document.getElementById('newClassCode').value.trim();
  const pw = document.getElementById('newTeacherPw2').value.trim();
  if (!code || !pw) return showModal({ type: 'alert', icon: '⚠️', title: '입력 오류', message: '클래스 코드와 비밀번호를 모두 입력하세요.' });
  if (code.length > 5) return showModal({ type: 'alert', icon: '⚠️', title: '입력 오류', message: '클래스 코드는 5자리 이내로 입력하세요.' });
  const { data: existing } = await db.from('classes').select('class_code').eq('class_code', code).maybeSingle();
  if (existing) return showModal({ type: 'alert', icon: '🚫', title: '중복', message: '이미 사용 중인 클래스 코드입니다.' });
  await db.from('classes').insert({ class_code: code, teacher_password: pw });
  const students = Array.from({ length: 30 }, (_, i) => ({ class_code: code, student_number: i + 1, auth_code: '1234' }));
  const groups = Array.from({ length: 6 }, (_, i) => ({ class_code: code, group_number: i + 1, auth_code: '1234' }));
  await db.from('student_auth').insert(students);
  await db.from('group_auth').insert(groups);
  showModal({ type: 'alert', icon: '🎉', title: '생성 완료', message: '클래스 코드: ' + code + '\n학생/모둠 기본 비밀번호: 1234' });
  showLoginMode();
}

const today = new Date();
const krDate = new Date(today.getTime() + (9 * 60 * 60 * 1000));
const todayStr = krDate.toISOString().split('T')[0];

['reviewDate', 'viewDate', 'teacherDate', 'settingDate'].forEach(id => document.getElementById(id).value = todayStr);
fetchCriteria(todayStr);
fetchRatingCriteria(todayStr);

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
  const { data } = await db.from('classes').select('*').eq('class_code', currentClassCode).maybeSingle();
  return data;
}
async function getClassSettings() {
  const info = await getClassInfo();
  return { studentCount: info ? info.student_count : 30, groupCount: info ? info.group_count : 6 };
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

function syncAllDates(dateStr) {
  const dateInputs = ['reviewDate', 'viewDate', 'teacherDate', 'settingDate'];
  dateInputs.forEach(id => { const el = document.getElementById(id); if (el) el.value = dateStr; });
}

async function toggleClassActive() {
  const info = await getClassInfo();
  const newState = !info.is_active;
  await db.from('classes').update({ is_active: newState }).eq('class_code', currentClassCode);
  updateClassToggleBtn(newState);
}
function updateClassToggleBtn(isActive) {
  const btn = document.getElementById('classToggleBtn');
  if (btn) {
    if (isActive) { btn.textContent = '🔓 활성화'; btn.style.background = '#5E8C61'; btn.style.color = 'white'; }
    else { btn.textContent = '🔒 비활성화'; btn.style.background = '#BE4B4B'; btn.style.color = 'white'; }
  }
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
function switchMainTab(mode) {
  document.querySelectorAll('.tab-container .tab-btn').forEach(btn => btn.classList.remove('active'));
  const btns = document.querySelectorAll('.tab-container .tab-btn');
  document.getElementById('studentTab').classList.add('hidden');
  document.getElementById('teacherTab').classList.add('hidden');
  if (mode === 'student') { btns[0].classList.add('active'); const el = document.getElementById('studentTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content'); }
  else { btns[1].classList.add('active'); const el = document.getElementById('teacherTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content'); }
}
function switchStudentSubTab(mode) {
  document.querySelectorAll('.mini-tab-btn').forEach(b => b.classList.remove('active-student'));
  const btns = document.querySelectorAll('.mini-tab-container .mini-tab-btn');
  document.getElementById('studentSubmitTab').classList.add('hidden');
  document.getElementById('studentResultTab').classList.add('hidden');
  if (mode === 'submit') { btns[0].classList.add('active-student'); const el = document.getElementById('studentSubmitTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content'); }
  else { btns[1].classList.add('active-student'); const el = document.getElementById('studentResultTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content'); }
}
function switchMiniTab(mode) {
  ['ranking', 'student', 'settings'].forEach(t => document.getElementById(t + 'MiniTab').classList.add('hidden'));
  document.querySelectorAll('#teacherMain .mini-tab-btn').forEach(b => { b.classList.remove('active', 'active-setting'); });
  const el = document.getElementById(mode + 'MiniTab'); el.classList.remove('hidden', 'tab-content'); void el.offsetWidth; el.classList.add('tab-content');
  document.getElementById('rankStudentArea').style.display = (mode === 'settings') ? 'none' : 'block';
  const btnIndex = ['ranking', 'student', 'settings'].indexOf(mode);
  document.querySelectorAll('#teacherMain .mini-tab-btn')[btnIndex].classList.add(mode === 'settings' ? 'active-setting' : 'active');
  if (mode === 'settings') { loadClassSettingsUI(); loadStudentManageData(); loadGroupManageData(); loadCriteriaForEdit(); switchCriteriaMode('auto'); }
}

// ============================================
// 학생 로그인
// ============================================
function toggleLoginType() {
  const type = document.querySelector('input[name="loginType"]:checked').value;
  document.getElementById('loginIdLabel').textContent = type === 'individual' ? '나의 번호' : '나의 모둠';
  document.getElementById('loginId').placeholder = type === 'individual' ? '번호 입력 (예: 15)' : '모둠 번호 입력 (예: 1)';
}
function confirmClassCode() {
  const code = document.getElementById('classCodeInput').value.trim();
  if (!code) return showModal({ type: 'alert', icon: '⚠️', title: '입력 오류', message: '클래스 코드를 입력하세요.' });
  currentClassCode = code;
  document.getElementById('classCodeDisplay').textContent = '클래스: ' + code;
  document.getElementById('classCodeStep').classList.add('hidden');
  document.getElementById('studentCredStep').classList.remove('hidden');
}
function backToClassCode() {
  document.getElementById('studentCredStep').classList.add('hidden');
  document.getElementById('classCodeStep').classList.remove('hidden');
}
async function loginStudent() {
  const type = document.querySelector('input[name="loginType"]:checked').value;
  const id = document.getElementById('loginId').value;
  const pw = document.getElementById('loginPw').value;

  // Class Code is now set in confirmClassCode step
  if (!currentClassCode) return showModal({ type: 'alert', icon: '⚠️', title: '입력 오류', message: '클래스 코드를 입력하세요.' });

  const { data: classInfo } = await db.from('classes').select('is_active').eq('class_code', currentClassCode).maybeSingle();
  if (!classInfo) return showModal({ type: 'alert', icon: '🚫', title: '오류', message: '존재하지 않는 클래스 코드입니다.' });
  if (!classInfo.is_active) return showModal({ type: 'alert', icon: '🔒', title: '접근 불가', message: '현재 클래스가 비활성화 상태입니다.<br>선생님에게 문의하세요.' });

  const msg = document.getElementById('loginMsg');
  const btn = document.getElementById('studentLoginBtn');
  if (!id || !pw) { showMsg(msg, '번호와 비밀번호를 입력해주세요.', 'error'); return; }
  setLoading(true, btn, '로그인 중...');
  const table = type === 'group' ? 'group_auth' : 'student_auth';
  const numCol = type === 'group' ? 'group_number' : 'student_number';
  const { data } = await db.from(table).select('auth_code').eq('class_code', currentClassCode).eq(numCol, parseInt(id)).maybeSingle();
  setLoading(false, btn, '로그인');
  if (data && String(data.auth_code).trim() === String(pw).trim()) { currentStudent = { id, code: pw, type }; showStudentMain(); }
  else showMsg(msg, '번호 또는 비밀번호가 일치하지 않습니다.', 'error');
}
async function showStudentMain() {
  document.getElementById('studentLoginSection').classList.add('hidden');
  document.getElementById('studentMainSection').classList.remove('hidden');
  const typeText = currentStudent.type === 'individual' ? '학생' : '모둠';
  document.getElementById('welcomeMsg').textContent = currentStudent.id + '번 ' + typeText + ' 환영합니다!';
  document.getElementById('reviewerId').value = currentStudent.id;
  document.getElementById('submitReviewerLabel').textContent = currentStudent.type === 'individual' ? '나의 번호' : '나의 모둠';
  const radios = document.getElementsByName('evalTypeDisplay');
  const resultRadios = document.getElementsByName('resultEvalTypeDisplay');
  if (currentStudent.type === 'individual') { radios[0].checked = true; resultRadios[0].checked = true; }
  else { radios[1].checked = true; resultRadios[1].checked = true; }
  const initDate = document.getElementById('reviewDate').value;
  const [objTask, criteria, completed, settings] = await Promise.all([getObjectiveAndTask(initDate), getRatingCriteriaFromDB(initDate), getCompletedTargets(initDate, currentStudent.id, currentStudent.type), getClassSettings()]);
  document.getElementById('objectiveText').textContent = objTask.objective || '등록된 학습목표가 없습니다.';
  document.getElementById('taskText').textContent = objTask.task || '등록된 평가과제가 없습니다.';
  ratingCriteria = criteria; renderRatingItems(criteria);
  const maxCount = currentStudent.type === 'group' ? settings.groupCount : settings.studentCount;
  renderTargetGrid(maxCount, currentStudent.id, completed, currentStudent.type);
  switchStudentSubTab('submit');
}
function logoutStudent() {
  currentStudent = null;
  document.getElementById('studentLoginSection').classList.remove('hidden');
  document.getElementById('studentMainSection').classList.add('hidden');
  document.getElementById('loginId').value = ''; document.getElementById('loginPw').value = '';
  document.getElementById('resultArea').classList.add('hidden');
  document.getElementById('statsSummary').innerHTML = '';
  document.getElementById('barChart').innerHTML = '';
  document.getElementById('mySummary').innerHTML = '';

  // Reset for 2-step login
  document.getElementById('studentCredStep').classList.add('hidden');
  document.getElementById('classCodeStep').classList.remove('hidden');
  document.getElementById('classCodeInput').value = '';
  currentClassCode = '';
}
function switchTypeAndLogout(newType) {
  const typeName = newType === 'group' ? '모둠평가' : '개인평가';
  showCustomConfirm(typeName + ' 버튼을 누르면<br>자동으로 로그아웃 됩니다.<br>동의하십니까?',
    function () { logoutStudent(); document.getElementsByName('loginType').forEach(r => { if (r.value === newType) r.checked = true; }); toggleLoginType(); },
    function () { const ct = currentStudent.type; document.getElementsByName('evalTypeDisplay').forEach(r => { if (r.value === ct) r.checked = true; }); document.getElementsByName('resultEvalTypeDisplay').forEach(r => { if (r.value === ct) r.checked = true; }); }
  );
}

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
  if (error) { showMsg(msg, '오류: ' + error.message, 'error'); return; }
  showMsg(msg, '성공적으로 제출되었습니다!', 'success');
  const savedDate = document.getElementById('reviewDate').value;
  document.getElementById('reviewForm').reset(); currentRatings = {};
  document.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('reviewerId').value = currentStudent.id;
  document.getElementById('reviewDate').value = savedDate;
  document.getElementById('targetId').value = ''; updateCharCount();
  loadEvalTargetGrid();
  document.getElementById('targetGrid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);
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
async function loginTeacher() {
  const code = document.getElementById('teacherClassCode').value.trim();
  const pw = document.getElementById('teacherPassword').value.trim();
  if (!code || !pw) return;
  const { data } = await db.from('classes').select('*').eq('class_code', code).eq('teacher_password', pw).maybeSingle();
  if (!data) { document.getElementById('teacherLoginMsg').textContent = '클래스 코드 또는 비밀번호가 틀립니다.'; document.getElementById('teacherLoginMsg').className = 'message error'; document.getElementById('teacherLoginMsg').style.display = 'block'; return; }
  currentClassCode = code;
  updateClassToggleBtn(data.is_active);
  document.getElementById('teacherLogin').classList.add('hidden');
  document.getElementById('teacherMain').classList.remove('hidden');
  loadTeacherData();
  loadStudentManageData();
  loadGroupManageData();
}
function teacherLogout() { document.getElementById('teacherLogin').classList.remove('hidden'); document.getElementById('teacherMain').classList.add('hidden'); document.getElementById('teacherPassword').value = ''; }

// ============================================
// 교사 - 전체 현황
// ============================================
async function loadTeacherData() {
  const date = document.getElementById('teacherDate').value;
  const type = document.querySelector('input[name="teacherEvalType"]:checked').value;
  document.getElementById('rankingTable').innerHTML = '<p style="text-align:center;">데이터 불러오는 중...</p>';
  const [settings, reviewsResult] = await Promise.all([getClassSettings(), db.from('reviews').select('*').eq('class_code', currentClassCode).eq('review_date', date).eq('review_type', type)]);
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
  renderTeacherDashboard({ ranking, students }, totalStudents);
  renderRankingTable(ranking, allCriteriaList, type);
  renderStudentSelector(students);
  document.getElementById('studentReviews').innerHTML = '';
}
function renderTeacherDashboard(data, totalStudents) {
  const d = document.getElementById('teacherDashboard');
  const evaluated = data.students.length;
  let totalAvg = 0; if (data.ranking.length > 0) totalAvg = (data.ranking.reduce((a, r) => a + r.totalAvg, 0) / data.ranking.length).toFixed(2);
  const totalReviews = data.ranking.reduce((a, r) => a + r.count, 0);
  const participation = totalStudents > 0 ? Math.round((evaluated / totalStudents) * 100) : 0;
  d.innerHTML = '<div class="stat-card"><span class="stat-number">' + participation + '%</span><span class="stat-label">참여율 (' + evaluated + '/' + totalStudents + ')</span></div><div class="stat-card blue"><span class="stat-number">' + totalAvg + '</span><span class="stat-label">전체 평균 점수</span></div><div class="stat-card" style="border-left-color:var(--color-teal);"><span class="stat-number" style="color:var(--color-teal);">' + totalReviews + '건</span><span class="stat-label">총 평가 수</span></div>';
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
}
function saveClassSettingsUI(btn) {
  const sc = parseInt(document.getElementById('settingStudentCount').value) || 30;
  const gc = parseInt(document.getElementById('settingGroupCount').value) || 6;
  showModal({
    type: 'confirm', icon: '🏫', title: '반 구성 변경', message: '학생 <strong>' + sc + '명</strong>, 모둠 <strong>' + gc + '개</strong>로 설정하시겠습니까?',
    onConfirm: async () => {
      setLoading(true, btn, '저장 중...');
      await db.from('classes').update({ student_count: sc, group_count: gc }).eq('class_code', currentClassCode);
      // 인증코드 테이블 조정
      for (let i = 1; i <= sc; i++) { await db.from('student_auth').upsert({ class_code: currentClassCode, student_number: i, auth_code: '1234' }, { onConflict: 'class_code,student_number', ignoreDuplicates: true }); }
      for (let i = 1; i <= gc; i++) { await db.from('group_auth').upsert({ class_code: currentClassCode, group_number: i, auth_code: '1234' }, { onConflict: 'class_code,group_number', ignoreDuplicates: true }); }
      setLoading(false, btn, '💾 반 구성 저장하기');
      showModal({ type: 'alert', icon: '✅', title: '저장 완료', message: '학생 ' + sc + '명, 모둠 ' + gc + '개로 설정되었습니다.' });
      document.getElementById('studentManageGrid').innerHTML = '';
      document.getElementById('groupManageGrid').innerHTML = '';
      loadStudentManageData(); loadGroupManageData();
    }
  });
}
async function loadStudentManageData() {
  const grid = document.getElementById('studentManageGrid'); if (grid.children.length > 0) return;
  grid.innerHTML = '<p>로딩 중...</p>';
  const { data } = await db.from('student_auth').select('*').eq('class_code', currentClassCode).order('student_number');
  grid.innerHTML = '';
  (data || []).forEach(d => { grid.innerHTML += '<div class="student-auth-item"><label>' + d.student_number + '번 학생</label><input type="text" class="auth-input-student" data-id="' + d.student_number + '" value="' + d.auth_code + '"></div>'; });
}
async function loadGroupManageData() {
  const grid = document.getElementById('groupManageGrid'); if (grid.children.length > 0) return;
  grid.innerHTML = '<p>로딩 중...</p>';
  const { data } = await db.from('group_auth').select('*').eq('class_code', currentClassCode).order('group_number');
  grid.innerHTML = '';
  (data || []).forEach(d => { grid.innerHTML += '<div class="student-auth-item"><label>' + d.group_number + ' 모둠</label><input type="text" class="auth-input-group" data-id="' + d.group_number + '" value="' + d.auth_code + '"></div>'; });
}
function saveStudentAuth(btn) {
  showModal({
    type: 'confirm', icon: '💾', title: '비밀번호 저장', message: '학생 비밀번호를 저장하시겠습니까?',
    onConfirm: async () => {
      setLoading(true, btn, '저장 중...');
      const updates = Array.from(document.querySelectorAll('.auth-input-student')).map(input => ({ class_code: currentClassCode, student_number: parseInt(input.getAttribute('data-id')), auth_code: input.value }));
      for (const u of updates) { await db.from('student_auth').upsert(u, { onConflict: 'class_code,student_number' }); }
      setLoading(false, btn, '학생 비밀번호 저장');
      showModal({ type: 'alert', icon: '✅', title: '저장 완료', message: '저장되었습니다.' });
    }
  });
}
function saveGroupAuth(btn) {
  showModal({
    type: 'confirm', icon: '💾', title: '비밀번호 저장', message: '모둠 비밀번호를 저장하시겠습니까?',
    onConfirm: async () => {
      setLoading(true, btn, '저장 중...');
      const updates = Array.from(document.querySelectorAll('.auth-input-group')).map(input => ({ class_code: currentClassCode, group_number: parseInt(input.getAttribute('data-id')), auth_code: input.value }));
      for (const u of updates) { await db.from('group_auth').upsert(u, { onConflict: 'class_code,group_number' }); }
      setLoading(false, btn, '모둠 비밀번호 저장');
      showModal({ type: 'alert', icon: '✅', title: '저장 완료', message: '저장되었습니다.' });
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
function changeTeacherPw(btn) {
  const newPw = document.getElementById('newTeacherPw').value; if (!newPw) return;
  showModal({
    type: 'confirm', icon: '🔐', title: '비밀번호 변경', message: '교사 비밀번호를 <strong>\'' + newPw + '\'</strong>(으)로 변경하시겠습니까?',
    onConfirm: async () => { setLoading(true, btn, '변경 중...'); await db.from('classes').update({ teacher_password: newPw }).eq('class_code', currentClassCode); setLoading(false, btn, '비밀번호 변경'); showModal({ type: 'alert', icon: '✅', title: '변경 완료', message: '비밀번호가 변경되었습니다.' }); document.getElementById('newTeacherPw').value = ''; }
  });
}
function resetAllReviewData(btn) {
  showModal({
    type: 'prompt', icon: '⚠️', title: '데이터 전체 초기화', message: '모든 평가 데이터가 영구적으로 삭제됩니다.<br>삭제하려면 아래 입력창에 <strong>초기화</strong>라고 입력하세요.', inputPlaceholder: '초기화',
    onConfirm: async (val) => {
      if (val === '초기화') { setLoading(true, btn, '초기화 중...'); await db.from('reviews').delete().eq('class_code', currentClassCode).neq('id', 0); setLoading(false, btn, '평가 데이터 전체 초기화'); showModal({ type: 'alert', icon: '🗑️', title: '초기화 완료', message: '모든 평가 데이터가 초기화되었습니다.' }); loadTeacherData(); }
      else showModal({ type: 'alert', icon: '🚫', title: '취소됨', message: '입력값이 일치하지 않아 취소되었습니다.' });
    }
  });
}
