// API 클라이언트 - 모든 백엔드 통신을 담당합니다.
const rawBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const BASE_URL = rawBaseUrl.startsWith('http') ? rawBaseUrl : `https://${rawBaseUrl}`;

const DEFAULT_TIMEOUT_MS = 15000;
const LONG_TIMEOUT_MS = 60000;

async function request(method, path, body, signal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = signal ? null : new AbortController();

  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: signal || controller.signal,
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let response;

  try {
    response = await fetch(`${BASE_URL}${path}`, options);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: response.statusText,
    }));

    const err = new Error(error.message || '요청 실패');

    err.status = response.status;
    err.details = error.details;

    throw err;
  }

  return response.json();
}
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    const err = new Error(error.message || '요청 실패');
    err.status = response.status;
    err.details = error.details;
    throw err;
  }
  return response.json();
}

const get = (path, signal, timeoutMs) =>
  request('GET', path, undefined, signal, timeoutMs);

const post = (path, body, timeoutMs) =>
  request('POST', path, body, undefined, timeoutMs);

const put = (path, body, timeoutMs) =>
  request('PUT', path, body, undefined, timeoutMs);

const del = (path, timeoutMs) =>
  request('DELETE', path, undefined, undefined, timeoutMs);

// Bootstrap - 첫 로드에 필요한 모든 데이터를 한 번에 가져옵니다.
export const fetchBootstrap = (month) =>
  get(`/api/bootstrap${month ? `?month=${month}` : ''}`);

// Dashboard
export const fetchDashboard = (month) =>
  get(`/api/dashboard${month ? `?month=${month}` : ''}`);

// 거래 내역
export const fetchTransactions = (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => v != null && v !== '' && params.append(k, v));
  return get(`/api/transactions${params.toString() ? `?${params}` : ''}`);
};
export const createTransaction = (data) => post('/api/transactions', data);
export const createTransactionsBulk = (transactions) =>
  post(
    '/api/transactions/bulk',
    { transactions },
    LONG_TIMEOUT_MS
  );
export const updateTransaction = (id, data) => put(`/api/transactions/${id}`, data);
export const deleteTransaction = (id) => del(`/api/transactions/${id}`);
export const fetchAutocomplete = (query) =>
  get(`/api/transactions/autocomplete?query=${encodeURIComponent(query || '')}`);

// 카테고리
export const fetchCategories = () => get('/api/categories');
export const createCategory = (data) => post('/api/categories', data);
export const updateCategory = (id, data) => put(`/api/categories/${id}`, data);
export const deleteCategory = (id) => del(`/api/categories/${id}`);

// 즐겨찾기
export const fetchFavorites = () => get('/api/favorites');
export const createFavorite = (data) => post('/api/favorites', data);
export const updateFavorite = (id, data) => put(`/api/favorites/${id}`, data);
export const deleteFavorite = (id) => del(`/api/favorites/${id}`);

// 반복 거래
export const fetchRecurring = () => get('/api/recurring-transactions');
export const createRecurring = (data) => post('/api/recurring-transactions', data);
export const updateRecurring = (id, data) => put(`/api/recurring-transactions/${id}`, data);
export const deleteRecurring = (id) => del(`/api/recurring-transactions/${id}`);

// 고정 지출
export const fetchFixedExpenses = () => get('/api/fixed-expenses');
export const createFixedExpense = (data) => post('/api/fixed-expenses', data);
export const updateFixedExpense = (id, data) => put(`/api/fixed-expenses/${id}`, data);
export const deleteFixedExpense = (id) => del(`/api/fixed-expenses/${id}`);

// 예산
export const fetchBudgets = (month) =>
  get(`/api/budgets${month ? `?month=${month}` : ''}`);
export const createBudget = (data) => post('/api/budgets', data);
export const updateBudget = (id, data) => put(`/api/budgets/${id}`, data);
export const deleteBudget = (id) => del(`/api/budgets/${id}`);

// 기초자산
export const fetchAssets = () => get('/api/assets');
export const createAsset = (data) => post('/api/assets', data);
export const updateAsset = (id, data) => put(`/api/assets/${id}`, data);
export const deleteAsset = (id) => del(`/api/assets/${id}`);
export const recalculateAssets = () =>
  post('/api/assets/recalculate', undefined, LONG_TIMEOUT_MS);

// 설정
export const fetchSettings = () => get('/api/settings');
export const updateTheme = (themeMode) => put('/api/settings/theme', { theme_mode: themeMode });
export const updateLedgerName = (ledgerName) => put('/api/settings/ledger-name', { ledger_name: ledgerName });
export const updateTargetAsset = (targetAssetAmount) =>
  put('/api/settings/target-asset', { target_asset_amount: targetAssetAmount });
export const updatePin = (enabled, pin) => put('/api/settings/pin', { enabled, pin });
export const unlockPin = (pin) => post('/api/settings/unlock', { pin });

// 백업/복원
export const exportBackup = () => get('/api/system/backup');
export const importBackup = (data) =>
  post('/api/system/restore', data, LONG_TIMEOUT_MS);
export const runAutomation = () => post('/api/system/run-automation', {});
export const cleanupCache = () => post('/api/system/cleanup-cache', {});
export const fetchTransactionHistories = () => get('/api/transaction-histories?limit=50');
export const fetchUploadLogs = (limit = 30) => get(`/api/upload-logs?limit=${limit}`);
export const createUploadLog = (data) => post('/api/upload-logs', data);
export const fetchAssetSnapshots = () => get('/api/assets/snapshots?limit=90');
export const createTodayAssetSnapshot = () => post('/api/assets/snapshots/today', {});
