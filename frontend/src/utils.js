// 공통 유틸리티 함수

// 금액을 천 단위 콤마 포맷으로 변환
export function formatAmount(value) {
  const num = Number(value);
  if (isNaN(num)) return '0';
  return num.toLocaleString('ko-KR');
}

// 입력 문자열에서 숫자만 추출해 정수로 변환
export function parseAmount(str) {
  const cleaned = String(str || '').replace(/[^0-9]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

// 날짜를 YYYY-MM-DD 포맷으로 변환
export function toIsoDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 오늘 날짜를 YYYY-MM-DD 포맷으로 반환
export function today() {
  return toIsoDate(new Date());
}

// YYYY-MM 형식의 현재 월 반환
export function currentMonth() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

// 날짜를 한국어 형식으로 포맷 (예: 2024년 1월 15일 화요일)
export function formatDateKo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

// 짧은 날짜 포맷 (예: 1월 15일)
export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

// 월 문자열을 한국어로 (예: 2024-01 → 2024년 1월)
export function formatMonthKo(monthStr) {
  if (!monthStr) return '';
  const [yyyy, mm] = monthStr.split('-');
  return `${yyyy}년 ${parseInt(mm, 10)}월`;
}

// 전월 계산 (YYYY-MM)
export function prevMonth(monthStr) {
  const [yyyy, mm] = monthStr.split('-').map(Number);
  const d = new Date(yyyy, mm - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 다음 달 계산 (YYYY-MM)
export function nextMonth(monthStr) {
  const [yyyy, mm] = monthStr.split('-').map(Number);
  const d = new Date(yyyy, mm, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 퍼센트 계산 (0 나누기 방지)
export function calcPercent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

// 증감률 계산
export function calcChangeRate(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// 결제수단 기본 목록
export const PAYMENT_METHODS = [
  '현금', '신용카드', '체크카드', '자동이체', '이체', '간편결제', '기타',
];

// 요일 이름
export const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// 숫자 입력값 핸들러 (콤마 자동 적용)
export function handleAmountInput(e, setter) {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  const num = parseInt(raw, 10);
  setter(isNaN(num) ? '' : formatAmount(num));
}

// 로컬 스토리지 PIN 세션 (세션 범위 – 앱 재로딩 시 초기화)
const SESSION_KEY = '__pin_unlocked__';
export function setSessionUnlocked() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
}
export function isSessionUnlocked() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}
export function clearSessionUnlocked() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}
