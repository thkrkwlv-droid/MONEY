import { useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  createBudget,
  createCategory,
  createFavorite,
  createFixedExpense,
  createRecurring,
  createTransaction,
  deleteBudget,
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
  unlockPin,
  updateBudget,
  updateCategory,
  updateFavorite,
  updateFixedExpense,
  updatePin,
  updateRecurring,
  updateTheme,
  updateTransaction,
} from './api';
import QuickEntryForm from './components/QuickEntryForm';
import DashboardPanel from './components/DashboardPanel';
import TransactionTable from './components/TransactionTable';
import CalendarView from './components/CalendarView';
import ManagementPanel from './components/ManagementPanel';
import PinLock from './components/PinLock';
import { currentMonth, nextMonth, parseAmount, prevMonth, today } from './utils';

const INITIAL_FORM = {
  transaction_date: today(),
  type: 'expense',
  amountInput: '',
  category_id: '',
  note: '',
  payment_method: '현금',
};

function App() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState({
    categories: [],
    favorites: [],
    recurringTransactions: [],
    fixedExpenses: [],
    settings: { dark_mode: false, pin_enabled: false, currency: 'KRW' },
    transactions: [],
    dashboard: null,
    recentCategories: [],
    budgets: [],
  });
  const [form, setForm] = useState(INITIAL_FORM);
  const [filters, setFilters] = useState({ search: '', type: '', categoryId: '', startDate: '', endDate: '' });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [autocomplete, setAutocomplete] = useState({ notes: [], paymentMethods: [], recommendedCategory: null });
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

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
    document.documentElement.dataset.theme = data.settings?.dark_mode ? 'dark' : 'light';
  }, [data.settings?.dark_mode]);

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
        note: form.note,
        payment_method: form.payment_method || '현금',
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
        note: '',
        payment_method: form.payment_method || '현금',
      });

      await refreshCurrentMonth(editingTransaction ? '내역을 수정했습니다.' : '내역을 저장했습니다.');
      setActiveTab('history');
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
      note: transaction.note || '',
      payment_method: transaction.payment_method || '현금',
    });
    setActiveTab('entry');
  }

  function handleCancelEdit() {
    setEditingTransaction(null);
    setForm({ ...INITIAL_FORM, category_id: defaultCategoryId || '' });
  }

  async function handleDeleteTransaction(id) {
    if (!window.confirm('이 내역을 삭제할까요?')) return;
    try {
      await deleteTransaction(id);
      await refreshCurrentMonth('내역을 삭제했습니다.');
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
      note: favorite.note || '',
      payment_method: favorite.payment_method || '현금',
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
      await refreshCurrentMonth(payload.id ? '고정지출을 수정했습니다.' : '고정지출을 추가했습니다.');
    } catch (err) {
      setError(err.message || '고정지출 저장에 실패했습니다.');
    }
  }

  async function removeFixedExpense(id) {
    if (!window.confirm('고정지출을 삭제할까요?')) return;
    try {
      await deleteFixedExpense(id);
      await refreshCurrentMonth('고정지출을 삭제했습니다.');
    } catch (err) {
      setError(err.message || '고정지출 삭제에 실패했습니다.');
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

  async function handleToggleTheme(nextDarkMode) {
    try {
      await updateTheme(nextDarkMode);
      await refreshCurrentMonth(nextDarkMode ? '다크 모드로 전환했습니다.' : '라이트 모드로 전환했습니다.');
    } catch (err) {
      setError(err.message || '테마 변경에 실패했습니다.');
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

  function moveMonth(direction) {
    setMonth((prev) => (direction < 0 ? prevMonth(prev) : nextMonth(prev)));
  }

  const tabs = [
    { id: 'dashboard', label: '대시보드' },
    { id: 'entry', label: '빠른 입력' },
    { id: 'history', label: '내역 관리' },
    { id: 'calendar', label: '캘린더' },
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
          <p className="eyebrow">Supabase + Render 기반</p>
          <h1>개인용 웹 가계부</h1>
          <p className="muted">DB 기반으로 새로고침 후에도 데이터가 유지되며, 반복 입력과 고정지출 자동 반영까지 지원합니다.</p>
        </div>
        <div className="hero-actions">
          <span className="badge">선택 월: {month}</span>
          <button type="button" className="secondary-button" onClick={() => setMonth(currentMonth())}>이번 달로 이동</button>
          <button type="button" className="secondary-button" onClick={() => setActiveTab('entry')}>빠른 입력 열기</button>
        </div>
      </header>

      {(message || error) && (
        <div className={`notice-card ${error ? 'danger' : 'success'}`}>
          {error || message}
        </div>
      )}

      <nav className="tab-nav panel">
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
      </nav>

      <main className="stack gap-lg">
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
            filters={filters}
            setFilters={setFilters}
            onEdit={handleEditTransaction}
            onDelete={handleDeleteTransaction}
          />
        )}

        {activeTab === 'calendar' && <CalendarView month={month} transactions={data.transactions} />}

        {activeTab === 'manage' && (
          <ManagementPanel
            month={month}
            categories={data.categories}
            favorites={data.favorites}
            recurringTransactions={data.recurringTransactions}
            fixedExpenses={data.fixedExpenses}
            budgets={data.budgets}
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
            onToggleTheme={handleToggleTheme}
            onSavePin={handleSavePin}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
          />
        )}
      </main>
    </div>
  );
}

export default App;
