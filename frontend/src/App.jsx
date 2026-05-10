import { useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  createBudget,
  createCategory,
  createFavorite,
  createFixedExpense,
  createRecurring,
  createTransaction,
  createTransactionsBulk,
  deleteBudget,
  createAsset,
  updateAsset,
  deleteAsset,
  recalculateAssets,
  deleteCategory,
  deleteFavorite,
  deleteFixedExpense,
  deleteRecurring,
  deleteTransaction,
  exportBackup,
  fetchAutocomplete,
  fetchBootstrap,
  importBackup,
  runAutomation,
  cleanupCache,
  fetchTransactionHistories,
  fetchUploadLogs,
  createUploadLog,
  fetchAssetSnapshots,
  createTodayAssetSnapshot,
  unlockPin,
  updateBudget,
  updateCategory,
  updateFavorite,
  updateFixedExpense,
  updatePin,
  updateRecurring,
  updateTheme,
  updateLedgerName,
  updateTargetAsset,
  updateTransaction,
} from './api';
import QuickEntryForm from './components/QuickEntryForm';
import DashboardPanel from './components/DashboardPanel';
import TransactionTable from './components/TransactionTable';
import CalendarView from './components/CalendarView';
import MonthlyReport from './components/MonthlyReport';
import AssetOverview from './components/AssetOverview';
import ManagementPanel from './components/ManagementPanel';
import PinLock from './components/PinLock';
import { currentMonth, nextMonth, parseAmount, prevMonth, today } from './utils';

function monthToDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function formatMonthInput(digits) {
  if (digits.length === 6) {
    return `${digits.slice(0, 4)}년 ${digits.slice(4, 6)}월`;
  }

  return digits;
}

function isValidMonthDigits(digits) {
  if (digits.length !== 6) return false;

  const year = Number(digits.slice(0, 4));
  const monthNumber = Number(digits.slice(4, 6));

  return year >= 1900 && year <= 2099 && monthNumber >= 1 && monthNumber <= 12;
}

const INITIAL_FORM = {
  transaction_date: today(),
  type: 'expense',
  amountInput: '',
  category_id: '',
  asset_account_id: '',
  from_asset_account_id: '',
  to_asset_account_id: '',
  note: '',
  payment_method: '체크카드',
};

function App() {
  const [month, setMonth] = useState(currentMonth());
  const [monthInput, setMonthInput] = useState(monthToDigits(currentMonth()));
  const [data, setData] = useState({
    categories: [],
    favorites: [],
    recurringTransactions: [],
    fixedExpenses: [],
    settings: { dark_mode: false, theme_mode: 'light', pin_enabled: false, currency: 'KRW', ledger_name: '가계부', target_asset_amount: 0, },
    transactions: [],
    previousTransactions: [],
    dashboard: null,
    recentCategories: [],
    budgets: [],
    assets: [],
  });
  const [form, setForm] = useState(INITIAL_FORM);
  const [filters, setFilters] = useState({
    search: '',
    type: '',
    categoryId: '',
    paymentMethod: '',
    startDate: '',
    endDate: '',
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [autocomplete, setAutocomplete] = useState({ notes: [], paymentMethods: [], recommendedCategory: null });
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showTransfers, setShowTransfers] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [assetSnapshots, setAssetSnapshots] = useState([]);
  const [transactionHistories, setTransactionHistories] = useState([]);
  const [uploadLogs, setUploadLogs] = useState([]);

  const defaultCategoryId = useMemo(() => {
    return (
      data.recentCategories?.[0]?.category_id ||
      data.categories.find((item) => item.name === '식비')?.id ||
      data.categories.find((item) => item.type !== 'income')?.id ||
      ''
    );
  }, [data.categories, data.recentCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMessage('');
      setError('');
    }, 3000);
    return () => clearTimeout(timer);
  }, [message, error]);

  useEffect(() => {
    document.documentElement.dataset.theme = 
      data.settings?.theme_mode || (data.settings?.dark_mode ? 'dark' : 'light');
  }, [data.settings?.theme_mode, data.settings?.dark_mode]);

  useEffect(() => {
    if (!form.category_id && defaultCategoryId) {
      setForm((prev) => ({ ...prev, category_id: defaultCategoryId }));
    }
  }, [defaultCategoryId, form.category_id]);

  useEffect(() => {
    if (!data.settings?.pin_enabled) {
      setIsUnlocked(true);
    }
  }, [data.settings?.pin_enabled]);

  useEffect(() => {
    loadBootstrap(month);
    refreshAssetSnapshots();
    refreshTransactionHistories();
    refreshUploadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    const query = form.note?.trim();
    const timer = setTimeout(async () => {
      try {
        const nextAutocomplete = await fetchAutocomplete(query);
        setAutocomplete(nextAutocomplete);
      } catch {
        // 자동완성 실패는 앱 전체 동작을 막지 않도록 무시합니다.
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [form.note]);

    async function refreshUploadLogs() {
    try {
      const rows = await fetchUploadLogs();
      setUploadLogs(rows);
    } catch (err) {
      console.error(err);
    }
  }

    async function refreshTransactionHistories() {
    try {
      const rows = await fetchTransactionHistories();
      setTransactionHistories(rows);
    } catch (err) {
      console.error(err);
    }
  }

    async function refreshAssetSnapshots() {
    try {
      const rows = await fetchAssetSnapshots();
      setAssetSnapshots(rows);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateTodayAssetSnapshot() {
    try {
      await createTodayAssetSnapshot();
      await refreshAssetSnapshots();
      setMessage('오늘 기준 자산 기록을 저장했습니다.');
    } catch (err) {
      setError(err.message || '자산 기록 저장에 실패했습니다.');
    }
  }

  async function loadBootstrap(targetMonth) {
    setLoading(true);
    setError('');
    try {
      const response = await fetchBootstrap(targetMonth);
      setData(response);
      setIsUnlocked((prev) => (response.settings?.pin_enabled ? prev : true));
      setForm((prev) => ({
        ...prev,
        transaction_date: today(),
        category_id: prev.category_id || response.recentCategories?.[0]?.category_id || prev.category_id,
      }));
    } catch (err) {
      setError(err.message || '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshCurrentMonth(successText = '') {
    await loadBootstrap(month);
    if (successText) setMessage(successText);
  }

  async function handleSubmitTransaction(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      const amount = parseAmount(form.amountInput);
      if (!amount) throw new Error('금액을 입력해주세요.');
      const categoryId = form.category_id || autocomplete?.recommendedCategory?.category_id || defaultCategoryId || null;
      const payload = {
        transaction_date: form.transaction_date || today(),
        type: form.type || 'expense',
        amount,
        category_id: categoryId,
        asset_account_id: form.asset_account_id || null,
        from_asset_account_id: form.from_asset_account_id || null,
        to_asset_account_id: form.to_asset_account_id || null,
        note: form.note,
        payment_method: form.payment_method || '체크카드',
      };

      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, payload);
      } else {
        await createTransaction(payload);
      }

      const preservedCategory = categoryId || defaultCategoryId;
      setEditingTransaction(null);
      setForm({
        transaction_date: today(),
        type: 'expense',
        amountInput: '',
        category_id: preservedCategory || '',
        asset_account_id: form.asset_account_id || '',
        from_asset_account_id: '',
        to_asset_account_id: '',
        note: '',
        payment_method: form.payment_method || '체크카드',
      });

      setMessage(editingTransaction ? '내역을 수정했습니다.' : '내역을 저장했습니다.');
      loadBootstrap(month);
      refreshTransactionHistories();
    } catch (err) {
      setError(err.message || '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleEditTransaction(transaction) {
    setEditingTransaction(transaction);
    setForm({
      transaction_date: transaction.transaction_date,
      type: transaction.type,
      amountInput: String(Number(transaction.amount || 0).toLocaleString('ko-KR')),
      category_id: transaction.category_id || '',
      asset_account_id: transaction.asset_account_id || '',
      from_asset_account_id: transaction.asset_account_id || '',
      to_asset_account_id: transaction.transfer_to_asset_account_id || '',
      note: transaction.note || '',
      payment_method: transaction.payment_method || '체크카드',
    });
    setActiveTab('entry');
  }

  function handleCancelEdit() {
    setEditingTransaction(null);
    setForm({ ...INITIAL_FORM, category_id: defaultCategoryId || '', asset_account_id: '' });
  }

  async function handleDeleteTransaction(id) {
    if (!window.confirm('이 내역을 삭제할까요?')) return;
    try {
      await deleteTransaction(id);
      await refreshCurrentMonth('내역을 삭제했습니다.');
      await refreshTransactionHistories();
    } catch (err) {
      setError(err.message || '삭제에 실패했습니다.');
    }
  }

  function applyFavorite(favorite) {
    setForm({
      transaction_date: today(),
      type: favorite.type,
      amountInput: Number(favorite.amount).toLocaleString('ko-KR'),
      category_id: favorite.category_id || defaultCategoryId || '',
      asset_account_id: '',
      note: favorite.note || '',
      payment_method: favorite.payment_method || '체크카드',
    });
    setActiveTab('entry');
    setMessage(`${favorite.name} 즐겨찾기를 불러왔습니다.`);
  }

  async function saveCategory(payload) {
    try {
      if (payload.id) await updateCategory(payload.id, payload);
      else await createCategory(payload);
      await refreshCurrentMonth(payload.id ? '카테고리를 수정했습니다.' : '카테고리를 추가했습니다.');
    } catch (err) {
      setError(err.message || '카테고리 저장에 실패했습니다.');
    }
  }

  async function removeCategory(id) {
    if (!window.confirm('카테고리를 삭제하면 연결된 데이터는 미분류로 이동합니다. 삭제할까요?')) return;
    try {
      await deleteCategory(id);
      await refreshCurrentMonth('카테고리를 삭제했습니다.');
    } catch (err) {
      setError(err.message || '카테고리 삭제에 실패했습니다.');
    }
  }

  async function saveFavorite(payload) {
    try {
      if (payload.id) await updateFavorite(payload.id, payload);
      else await createFavorite(payload);
      await refreshCurrentMonth(payload.id ? '즐겨찾기를 수정했습니다.' : '즐겨찾기를 추가했습니다.');
    } catch (err) {
      setError(err.message || '즐겨찾기 저장에 실패했습니다.');
    }
  }

  async function removeFavorite(id) {
    if (!window.confirm('즐겨찾기를 삭제할까요?')) return;
    try {
      await deleteFavorite(id);
      await refreshCurrentMonth('즐겨찾기를 삭제했습니다.');
    } catch (err) {
      setError(err.message || '즐겨찾기 삭제에 실패했습니다.');
    }
  }

  async function saveRecurring(payload) {
    try {
      if (payload.id) await updateRecurring(payload.id, payload);
      else await createRecurring(payload);
      await refreshCurrentMonth(payload.id ? '반복 입력을 수정했습니다.' : '반복 입력을 추가했습니다.');
    } catch (err) {
      setError(err.message || '반복 입력 저장에 실패했습니다.');
    }
  }

  async function removeRecurring(id) {
    if (!window.confirm('반복 입력을 삭제할까요?')) return;
    try {
      await deleteRecurring(id);
      await refreshCurrentMonth('반복 입력을 삭제했습니다.');
    } catch (err) {
      setError(err.message || '반복 입력 삭제에 실패했습니다.');
    }
  }

  async function saveFixedExpense(payload) {
    try {
      if (payload.id) await updateFixedExpense(payload.id, payload);
      else await createFixedExpense(payload);
      await refreshCurrentMonth(payload.id ? '자동 거래를 수정했습니다.' : '자동 거래를 추가했습니다.');
    } catch (err) {
      setError(err.message || '자동 거래 저장에 실패했습니다.');
    }
  }

  async function removeFixedExpense(id) {
    if (!window.confirm('자동 거래를 삭제할까요?')) return;
    try {
      await deleteFixedExpense(id);
      await refreshCurrentMonth('자동 거래를 삭제했습니다.');
    } catch (err) {
      setError(err.message || '자동 거래 삭제에 실패했습니다.');
    }
  }

  async function saveBudget(payload) {
    try {
      if (payload.id) await updateBudget(payload.id, payload);
      else await createBudget(payload);
      await refreshCurrentMonth(payload.id ? '예산을 수정했습니다.' : '예산을 저장했습니다.');
    } catch (err) {
      setError(err.message || '예산 저장에 실패했습니다.');
    }
  }

  async function removeBudget(id) {
    if (!window.confirm('예산을 삭제할까요?')) return;
    try {
      await deleteBudget(id);
      await refreshCurrentMonth('예산을 삭제했습니다.');
    } catch (err) {
      setError(err.message || '예산 삭제에 실패했습니다.');
    }
  }

  async function saveAsset(payload) {
    try {
      if (payload.id) await updateAsset(payload.id, payload);
      else await createAsset(payload);
      await refreshCurrentMonth(payload.id ? '기초자산을 수정했습니다.' : '기초자산을 추가했습니다.');
    } catch (err) {
      setError(err.message || '기초자산 저장에 실패했습니다.');
    }
  }

  async function importTransactionsExcel(transactionsToImport, summary = null) {
    const confirmMessage = summary
      ? `거래내역 엑셀 업로드를 진행할까요?

업로드 대상: ${summary.totalRows}행
등록 예정: ${summary.importedRows}건
제외 예정: ${summary.excludedRows}건${summary.transferRows ? `
자산이동: ${summary.transferRows}건` : ''}`
      : `${transactionsToImport.length}개의 거래내역을 등록할까요?`;


    if (!window.confirm(confirmMessage)) return;
    
    try {
      await createTransactionsBulk(transactionsToImport);

      if (summary) {
        await createUploadLog({
          upload_type: 'transaction_excel',
          total_rows: summary.totalRows,
          imported_rows: summary.importedRows,
          excluded_rows: summary.excludedRows,
          transfer_rows: summary.transferRows || 0,
          status: 'success',
        });

        await refreshUploadLogs();
      }

      try {
        await createTodayAssetSnapshot();
      } catch (snapshotError) {
        console.error(snapshotError);
      }

      await refreshCurrentMonth();

      const message = summary
        ? `엑셀 업로드 완료: 업로드 대상 ${summary.totalRows}행 중 ${summary.importedRows}건 등록, ${summary.excludedRows}건 제외했습니다.${summary.transferRows ? ` 자산이동 ${summary.transferRows}건 포함.` : ''}`
        : `${transactionsToImport.length}개의 거래내역을 엑셀로 등록했습니다.`;

      await refreshCurrentMonth(message);
      await refreshTransactionHistories();
      await refreshAssetSnapshots();
    } catch (err) {
      const detailMessage = Array.isArray(err.details)
        ? `\n${err.details.join('\n')}`
        : '';

      if (summary) {
        try {
          await createUploadLog({
            upload_type: 'transaction_excel',
            total_rows: summary.totalRows,
            imported_rows: 0,
            excluded_rows: summary.totalRows,
            transfer_rows: summary.transferRows || 0,
            status: 'fail',
            error_message: `${err.message || '거래내역 엑셀 등록 실패'}${detailMessage}`,
          });

          await refreshUploadLogs();
        } catch (logError) {
          console.error(logError);
        }
      }

      setError(`${err.message || '거래내역 엑셀 등록에 실패했습니다.'}${detailMessage}`);
    }
  }

    async function importAssetsExcel(assetsToImport) {
      if (!window.confirm(`${assetsToImport.length}개의 기초자산을 등록할까요?`)) return;
  
      try {
        for (const asset of assetsToImport) {
          await createAsset(asset);
        }
  
        await refreshCurrentMonth(`${assetsToImport.length}개의 기초자산을 엑셀로 등록했습니다.`);
      } catch (err) {
        setError(err.message || '기초자산 엑셀 등록에 실패했습니다.');
      }
    }

  async function removeAsset(id) {
    if (!window.confirm('기초자산을 삭제할까요?')) return;
    try {
      await deleteAsset(id);
      await refreshCurrentMonth('기초자산을 삭제했습니다.');
    } catch (err) {
      setError(err.message || '기초자산 삭제에 실패했습니다.');
    }
  }

  async function handleRecalculateAssets() {
    if (!window.confirm('기초자산 기준으로 모든 거래를 다시 반영해 자산 금액을 재계산할까요?')) return;
  
    try {
      await recalculateAssets();
      await refreshCurrentMonth('자산 금액을 재계산했습니다.');
    } catch (err) {
      setError(err.message || '자산 재계산에 실패했습니다.');
    }
  }
  
  async function handleChangeTheme(themeMode) {
    try {
      await updateTheme(themeMode);
      await refreshCurrentMonth('테마를 변경했습니다.');
    } catch (err) {
      setError(err.message || '테마 변경에 실패했습니다.');
    }
  }

  async function handleSaveLedgerName(ledgerName) {
    try {
      await updateLedgerName(ledgerName);
      await refreshCurrentMonth('가계부 이름을 저장했습니다.');
    } catch (err) {
      setError(err.message || '가계부 이름 저장에 실패했습니다.');
    }
  }

  async function handleSaveTargetAsset(targetAssetAmount) {
    try {
      await updateTargetAsset(targetAssetAmount);
      await refreshCurrentMonth('목표 자산을 저장했습니다.');
    } catch (err) {
      setError(err.message || '목표 자산 저장에 실패했습니다.');
    }
  }
  
  async function handleSavePin(enabled, pin) {
    try {
      await updatePin(enabled, pin);
      await refreshCurrentMonth(enabled ? 'PIN 잠금을 설정했습니다.' : 'PIN 잠금을 해제했습니다.');
      setIsUnlocked(!enabled);
    } catch (err) {
      setError(err.message || 'PIN 설정에 실패했습니다.');
    }
  }

  async function handleExportBackup() {
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `expense-backup-${month}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('백업 파일을 다운로드했습니다.');
    } catch (err) {
      setError(err.message || '백업 다운로드에 실패했습니다.');
    }
  }

  async function handleImportBackup(payload) {
    if (!window.confirm('복원하면 현재 데이터가 백업 파일 내용으로 교체됩니다. 계속할까요?')) return;
    try {
      await importBackup(payload);
      await refreshCurrentMonth('백업 복원을 완료했습니다.');
    } catch (err) {
      setError(err.message || '백업 복원에 실패했습니다.');
    }
  }

    async function handleCleanupCache() {
      if (!window.confirm('24개월보다 오래된 자산 그래프 캐시만 정리합니다. 거래내역과 자산 금액은 삭제되지 않습니다. 계속할까요?')) return;
  
      try {
        const result = await cleanupCache();
        setMessage(
          `정리 완료: 자산 스냅샷 ${result.deleted?.asset_snapshots || 0}건, 거래 히스토리 ${result.deleted?.transaction_histories || 0}건을 삭제했습니다.`
        );
      } catch (err) {
        setError(err.message || '오래된 캐시 데이터 정리에 실패했습니다.');
      }
    }

  async function handleRunAutomation() {
    setIsSyncing(true);
    try {
      await runAutomation();
      await refreshCurrentMonth('자동 생성 로직을 즉시 실행했습니다.');
    } catch (err) {
      setError(err.message || '자동 반영 실행에 실패했습니다.');
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleUnlock(pin) {
    await unlockPin(pin);
    setIsUnlocked(true);
    setMessage('잠금이 해제되었습니다.');
  }

  function handleMonthInputChange(event) {
    const digits = monthToDigits(event.target.value);
    setMonthInput(digits);

    if (isValidMonthDigits(digits)) {
      setMonth(`${digits.slice(0, 4)}-${digits.slice(4, 6)}`);
    }
  }
  
  function moveMonth(direction) {
  setMonth((prev) => {
    const next = direction < 0 ? prevMonth(prev) : nextMonth(prev);
    setMonthInput(monthToDigits(next));
    return next;
  });
}

  function moveYear(direction) {
    setMonth((prev) => {
      const [year, monthNumber] = prev.split('-').map(Number);
  
      const next = `${year + direction}-${String(monthNumber).padStart(2, '0')}`;
  
      setMonthInput(monthToDigits(next));
  
      return next;
    });
  }
  
  function moveToCurrentMonth() {
    const next = currentMonth();
  
    setMonth(next);
    setMonthInput(monthToDigits(next));
  }
  
  function selectMonth(monthNumber) {
    setMonth((prev) => {
      const [year] = prev.split('-').map(Number);
  
      const next = `${year}-${String(monthNumber).padStart(2, '0')}`;
  
      setMonthInput(monthToDigits(next));
  
      return next;
    });
  }

  const tabs = [
    { id: 'dashboard', label: '대시보드' },
    { id: 'entry', label: '빠른 입력' },
    { id: 'history', label: '내역 관리' },
    { id: 'calendar', label: '캘린더' },
    { id: 'monthly-report', label: '월간 리포트' },
    { id: 'assets', label: '내 자산' },
    { id: 'manage', label: '설정/관리' },
  ];

  if (loading) {
    return <div className="loading-screen">가계부 데이터를 불러오는 중입니다...</div>;
  }

  if (data.settings?.pin_enabled && !isUnlocked) {
    return <PinLock onUnlock={handleUnlock} />;
  }

    return (
    <div className="app-shell">
      <header className="hero-header panel">
  <div>
    <h1>{data.settings?.ledger_name || '가계부'}</h1>
  </div>

  <div className="month-control-panel">
    <div className="month-year-actions">
      <button type="button" className="month-mini-button" onClick={() => moveYear(-1)}>
        작년
      </button>

      <button type="button" className="month-mini-button" onClick={moveToCurrentMonth}>
        현재
      </button>

      <button type="button" className="month-mini-button" onClick={() => moveYear(1)}>
        내년
      </button>
    </div>

    <div className="month-nav-row">
      <button type="button" className="month-arrow-button" onClick={() => moveMonth(-1)}>
        ◀
      </button>

      <label className="month-picker">
        <span>조회 월</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="예: 202606"
          value={formatMonthInput(monthInput)}
          onChange={handleMonthInputChange}
        />
      </label>

      <button type="button" className="month-arrow-button" onClick={() => moveMonth(1)}>
        ▶
      </button>
    </div>
  </div>
</header>

      {(message || error) && (
        <div className={`notice-card ${error ? 'danger' : 'success'}`}>
          {error || message}
        </div>
      )}

      <div className="app-layout">
        <aside className="side-nav panel">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        <main className="stack gap-lg content-area">
          {activeTab === 'dashboard' && (
            <DashboardPanel
              dashboard={data.dashboard}
              budgets={data.budgets}
              month={month}
              onMoveMonth={moveMonth}
              onRunAutomation={handleRunAutomation}
              isSyncing={isSyncing}
            />
          )}

          {activeTab === 'entry' && (
            <QuickEntryForm
              categories={data.categories}
              assets={data.assets}
              form={form}
              setForm={setForm}
              onSubmit={handleSubmitTransaction}
              onApplyFavorite={applyFavorite}
              favorites={data.favorites}
              recentCategories={data.recentCategories}
              autocomplete={autocomplete}
              isSaving={isSaving}
              editingTransaction={editingTransaction}
              onCancelEdit={handleCancelEdit}
            />
          )}

          {activeTab === 'history' && (
            <TransactionTable
              transactions={data.transactions}
              categories={data.categories}
              assets={data.assets}
              filters={filters}
              setFilters={setFilters}
              onEdit={handleEditTransaction}
              onDelete={handleDeleteTransaction}
              showTransfers={showTransfers}
              setShowTransfers={setShowTransfers}
              onImportTransactionsExcel={importTransactionsExcel}
              onMoveToMonth={(nextMonth) => {
                setMonth(nextMonth);
                setMonthInput(monthToDigits(nextMonth));
              }}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              month={month}
              transactions={data.transactions}
              showTransfers={showTransfers}
            />
          )}

          {activeTab === 'monthly-report' && (
            <MonthlyReport
              month={month}
              transactions={data.transactions}
              previousTransactions={data.previousTransactions}
              fixedExpenses={data.fixedExpenses}
            />
          )}

          {activeTab === 'assets' && (
            <AssetOverview assets={data.assets} settings={data.settings} />
          )}
          
          {activeTab === 'manage' && (
            <ManagementPanel
              month={month}
              categories={data.categories}
              favorites={data.favorites}
              recurringTransactions={data.recurringTransactions}
              fixedExpenses={data.fixedExpenses}
              budgets={data.budgets}
              assets={data.assets}
              assetSnapshots={assetSnapshots}
              transactionHistories={transactionHistories}
              uploadLogs={uploadLogs}
              onCreateTodayAssetSnapshot={handleCreateTodayAssetSnapshot}
              settings={data.settings}
              onSaveCategory={saveCategory}
              onDeleteCategory={removeCategory}
              onSaveFavorite={saveFavorite}
              onDeleteFavorite={removeFavorite}
              onSaveRecurring={saveRecurring}
              onDeleteRecurring={removeRecurring}
              onSaveFixedExpense={saveFixedExpense}
              onDeleteFixedExpense={removeFixedExpense}
              onSaveBudget={saveBudget}
              onDeleteBudget={removeBudget}
              onSaveAsset={saveAsset}
              onDeleteAsset={removeAsset}
              onImportAssetsExcel={importAssetsExcel}
              onRecalculateAssets={handleRecalculateAssets}
              onCleanupCache={handleCleanupCache}
              onChangeTheme={handleChangeTheme}
              onSaveLedgerName={handleSaveLedgerName}
              onSaveTargetAsset={handleSaveTargetAsset}
              onSavePin={handleSavePin}
              onExportBackup={handleExportBackup}
              onImportBackup={handleImportBackup}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
