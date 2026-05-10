import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { PAYMENT_METHODS, formatAmount, parseAmount, today, WEEKDAY_NAMES } from '../utils';

const ASSET_TYPES = ['입출금', '저축/적금', '현금', '증권', '카드대금', '기타'];

function normalizeAssetName(name) {
  return String(name || '').trim().replace(/\s+/g, '').toLowerCase();
}

function normalizeAssetType(type) {
  const value = String(type || '').trim();

  if (ASSET_TYPES.includes(value)) {
    return value;
  }

  return '기타';
}

function isValidAssetAmount(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

const THEME_OPTIONS = [
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
  { value: 'pastel-pink', label: '파스텔 핑크' },
  { value: 'pastel-blue', label: '파스텔 블루' },
  { value: 'pastel-purple', label: '파스텔 퍼플' },
  { value: 'mint', label: '민트' },
  { value: 'yellow', label: '옐로우' },
  { value: 'beige', label: '베이지' },
  { value: 'gray', label: '그레이' },
];

function Section({ title, description, children }) {
  return (
    <details className="panel stack gap-md management-accordion">
      <summary className="section-heading compact accordion-summary">
        <div>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
        <span className="accordion-icon">⌄</span>
      </summary>

      <div className="accordion-content">
        {children}
      </div>
    </details>
  );
}

function ManagementPanel({
  month,
  categories,
  favorites,
  recurringTransactions,
  fixedExpenses,
  budgets,
  assets,
  assetSnapshots,
  transactionHistories,
  uploadLogs,
  onCreateTodayAssetSnapshot,
  settings,
  onSaveCategory,
  onDeleteCategory,
  onSaveFavorite,
  onDeleteFavorite,
  onSaveRecurring,
  onDeleteRecurring,
  onSaveFixedExpense,
  onDeleteFixedExpense,
  onSaveBudget,
  onDeleteBudget,
  onSaveAsset,
  onDeleteAsset,
  onImportAssetsExcel,
  onRecalculateAssets,
  onCleanupCache,
  onChangeTheme,
  onSaveLedgerName,
  onSaveTargetAsset,
  onSavePin,
  onExportBackup,
  onImportBackup,
}) {
  const [categoryForm, setCategoryForm] = useState({ id: '', name: '', type: 'expense', color: '#6366f1' });
  const [favoriteForm, setFavoriteForm] = useState({ id: '', name: '', type: 'expense', amountInput: '', category_id: '', note: '', payment_method: '현금' });
  const [recurringForm, setRecurringForm] = useState({
    id: '', name: '', type: 'expense', amountInput: '', category_id: '', note: '', payment_method: '현금',
    frequency: 'monthly', interval_count: 1, start_date: today(), weekday: 1, day_of_month: 25, is_active: true,
  });
  const [fixedForm, setFixedForm] = useState({
    id: '',
    name: '',
    type: 'expense',
    amountInput: '',
    category_id: '',
    from_asset_account_id: '',
    to_asset_account_id: '',
    note: '',
    payment_method: '자동이체',
    day_of_month: 25,
    start_date: today(),
    is_active: true,
  });
  const [budgetForm, setBudgetForm] = useState({ id: '', month_start: `${month}-01`, category_id: '', amountInput: '' });
  const [assetForm, setAssetForm] = useState({
    id: '',
    name: '',
    asset_type: '입출금',
    balanceInput: '',
    memo: '',
  });
  const [pinEnabled, setPinEnabled] = useState(Boolean(settings?.pin_enabled));
  const [ledgerName, setLedgerName] = useState(settings?.ledger_name || '가계부');

  const [targetAssetAmount, setTargetAssetAmount] = useState(
    formatAmount(settings?.target_asset_amount || 0)
  );
  
  const [pin, setPin] = useState('');
  const [showAllHistories, setShowAllHistories] = useState(false);

  const visibleTransactionHistories = showAllHistories
    ? transactionHistories || []
    : (transactionHistories || []).slice(0, 10);

  const expenseCategories = useMemo(() => categories.filter((item) => item.type !== 'income'), [categories]);

  const incomeCategories = useMemo(() => categories.filter((item) => item.type !== 'expense'), [categories]);

  const fixedCategories = useMemo(() => {
    if (fixedForm.type === 'income') return incomeCategories;
    if (fixedForm.type === 'transfer') return [];
    return expenseCategories;
  }, [fixedForm.type, incomeCategories, expenseCategories]);

  const resetCategoryForm = () => setCategoryForm({ id: '', name: '', type: 'expense', color: '#6366f1' });
  const resetFavoriteForm = () => setFavoriteForm({ id: '', name: '', type: 'expense', amountInput: '', category_id: '', note: '', payment_method: '현금' });
  const resetRecurringForm = () => setRecurringForm({
    id: '', name: '', type: 'expense', amountInput: '', category_id: '', note: '', payment_method: '현금',
    frequency: 'monthly', interval_count: 1, start_date: today(), weekday: 1, day_of_month: 25, is_active: true,
  });
  const resetFixedForm = () => setFixedForm({
    id: '',
    name: '',
    type: 'expense',
    amountInput: '',
    category_id: '',
    from_asset_account_id: '',
    to_asset_account_id: '',
    note: '',
    payment_method: '자동이체',
    day_of_month: 25,
    start_date: today(),
    is_active: true,
  });
  const resetBudgetForm = () => setBudgetForm({ id: '', month_start: `${month}-01`, category_id: '', amountInput: '' });
  const resetAssetForm = () => setAssetForm({
    id: '',
    name: '',
    asset_type: '입출금',
    balanceInput: '',
    memo: '',
  });

    function handleDownloadAssetTemplate() {
      const rows = [
        {
          자산명: '국민은행',
          유형: '입출금',
          현재금액: 1000000,
          메모: '월급 통장',
        },
        {
          자산명: '현금',
          유형: '현금',
          현재금액: 50000,
          메모: '지갑 현금',
        },
      ];
  
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
  
      XLSX.utils.book_append_sheet(workbook, worksheet, '기초자산양식');
      XLSX.writeFile(workbook, 'MONEY_기초자산_업로드_양식.xlsx');
    }
  
    async function handleAssetExcelFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
  
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
  
      const existingAssetNames = new Set(
        (assets || []).map((asset) => normalizeAssetName(asset.name))
      );
      
      const duplicatedInExcel = new Set();
      const seenInExcel = new Set();
      
      const invalidAmountRows = [];

      const assetsToImport = rows
        .map((row, index) => {
          const rawAmount = row.현재금액 ?? row.balance ?? 0;
          const parsedAmount = parseAmount(rawAmount);

          if (!isValidAssetAmount(parsedAmount)) {
            invalidAmountRows.push(index + 2);
          }

          return {
            name: String(row.자산명 || row.name || '').trim(),
            asset_type: normalizeAssetType(row.유형 || row.asset_type || '기타'),
            balance: isValidAssetAmount(parsedAmount) ? parsedAmount : 0,
            initial_balance: isValidAssetAmount(parsedAmount) ? parsedAmount : 0,
            memo: String(row.메모 || row.memo || '').trim(),
          };
        })
        .filter((row) => row.name)
        .filter((row) => {
          const normalizedName = normalizeAssetName(row.name);
      
          if (seenInExcel.has(normalizedName)) {
            duplicatedInExcel.add(row.name);
            return false;
          }
      
          seenInExcel.add(normalizedName);
          return true;
        })
        .filter((row) => {
          const normalizedName = normalizeAssetName(row.name);
          return !existingAssetNames.has(normalizedName);
        });
  
      if (duplicatedInExcel.size > 0) {
        alert(`엑셀 파일 안에 중복된 자산명이 있어 제외했습니다.\n\n${[...duplicatedInExcel].join(', ')}`);
      }

      if (invalidAmountRows.length > 0) {
        alert(`금액이 올바르지 않은 행은 0원으로 처리했습니다.\n\n행 번호: ${invalidAmountRows.join(', ')}`);
      }      
      
      if (assetsToImport.length === 0) {
        alert('등록할 수 있는 신규 자산이 없습니다.\n\n이미 등록된 자산명이거나 엑셀에 유효한 자산명이 없습니다.');
        event.target.value = '';
        return;
      }
  
      await onImportAssetsExcel(assetsToImport);
      event.target.value = '';
    }

  const handleBackupFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    await onImportBackup(data);
    event.target.value = '';
  };

  return (
    <section className="stack gap-lg">
      <Section title="카테고리 관리" description="기본 카테고리 외에도 자유롭게 추가 · 수정 · 삭제할 수 있습니다.">
        <form className="form-grid compact-form" onSubmit={async (e) => {
          e.preventDefault();
          await onSaveCategory(categoryForm);
          resetCategoryForm();
        }}>
          <label>
            <span>이름</span>
            <input value={categoryForm.name} onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))} required />
          </label>
          <label>
            <span>유형</span>
            <select value={categoryForm.type} onChange={(e) => setCategoryForm((prev) => ({ ...prev, type: e.target.value }))}>
              <option value="expense">지출</option>
              <option value="income">수입</option>
              <option value="both">공용</option>
            </select>
          </label>
          <label>
            <span>색상</span>
            <input type="color" value={categoryForm.color} onChange={(e) => setCategoryForm((prev) => ({ ...prev, color: e.target.value }))} />
          </label>
          <div className="actions">
            <button type="submit" className="primary-button">{categoryForm.id ? '카테고리 수정' : '카테고리 추가'}</button>
            {categoryForm.id && <button type="button" className="secondary-button" onClick={resetCategoryForm}>취소</button>}
          </div>
        </form>

        <div className="list-grid small-cards">
          {categories.map((item) => (
            <div key={item.id} className="mini-card">
              <div className="mini-card-header">
                <span className="color-dot" style={{ backgroundColor: item.color }} />
                <strong>{item.name}</strong>
                {item.is_default && <span className="badge">기본</span>}
              </div>
              <p className="muted">유형: {item.type}</p>
              <div className="actions">
                <button type="button" className="secondary-button" onClick={() => setCategoryForm(item)}>수정</button>
                <button type="button" className="ghost-button" onClick={() => onDeleteCategory(item.id)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="즐겨찾기 템플릿" description="자주 쓰는 입력 조합을 저장해 한 번에 불러올 수 있습니다.">
        <form className="form-grid compact-form" onSubmit={async (e) => {
          e.preventDefault();
          await onSaveFavorite({ ...favoriteForm, amount: parseAmount(favoriteForm.amountInput) });
          resetFavoriteForm();
        }}>
          <label><span>이름</span><input value={favoriteForm.name} onChange={(e) => setFavoriteForm((prev) => ({ ...prev, name: e.target.value }))} required /></label>
          <label>
            <span>유형</span>
            <select value={favoriteForm.type} onChange={(e) => setFavoriteForm((prev) => ({ ...prev, type: e.target.value }))}>
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
          </label>
          <label><span>금액</span><input value={favoriteForm.amountInput} onChange={(e) => setFavoriteForm((prev) => ({ ...prev, amountInput: e.target.value.replace(/[^0-9]/g, '') ? formatAmount(Number(e.target.value.replace(/[^0-9]/g, ''))) : '' }))} required /></label>
          <label>
            <span>카테고리</span>
            <select value={favoriteForm.category_id} onChange={(e) => setFavoriteForm((prev) => ({ ...prev, category_id: e.target.value }))}>
              <option value="">선택</option>
              {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field-span-2"><span>메모</span><input value={favoriteForm.note} onChange={(e) => setFavoriteForm((prev) => ({ ...prev, note: e.target.value }))} /></label>
          <label>
            <span>결제수단</span>
            <select value={favoriteForm.payment_method} onChange={(e) => setFavoriteForm((prev) => ({ ...prev, payment_method: e.target.value }))}>
              {PAYMENT_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <div className="actions">
            <button type="submit" className="primary-button">{favoriteForm.id ? '즐겨찾기 수정' : '즐겨찾기 추가'}</button>
            {favoriteForm.id && <button type="button" className="secondary-button" onClick={resetFavoriteForm}>취소</button>}
          </div>
        </form>

        <div className="list-grid small-cards">
          {favorites.map((item) => (
            <div key={item.id} className="mini-card">
              <strong>{item.name}</strong>
              <p className="muted">{item.category_name || '미분류'} · {formatAmount(item.amount)}원 · {item.payment_method}</p>
              <div className="actions">
                <button type="button" className="secondary-button" onClick={() => setFavoriteForm({ ...item, amountInput: formatAmount(item.amount) })}>수정</button>
                <button type="button" className="ghost-button" onClick={() => onDeleteFavorite(item.id)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="자동 거래 관리" description="매월 반복되는 수입 · 지출 · 자산이동을 자동으로 관리합니다.">
        <form className="form-grid compact-form" onSubmit={async (e) => {
          e.preventDefault();
          await onSaveFixedExpense({ ...fixedForm, amount: parseAmount(fixedForm.amountInput) });
          resetFixedForm();
        }}>
          <label><span>거래명</span><input value={fixedForm.name} onChange={(e) => setFixedForm((prev) => ({ ...prev, name: e.target.value }))} required /></label>
          <label>
            <span>자동 거래 유형</span>
            <select
              value={fixedForm.type || 'expense'}
              onChange={(e) =>
                setFixedForm((prev) => ({
                  ...prev,
                  type: e.target.value,
                  category_id: '',
                }))
              }
            >
              <option value="expense">지출</option>
              <option value="income">수입</option>
              <option value="transfer">자산이동</option>
            </select>
          </label>
          <label><span>금액</span><input value={fixedForm.amountInput} onChange={(e) => setFixedForm((prev) => ({ ...prev, amountInput: e.target.value.replace(/[^0-9]/g, '') ? formatAmount(Number(e.target.value.replace(/[^0-9]/g, ''))) : '' }))} required /></label>
          {fixedForm.type === 'transfer' ? (
            <>
              <label>
                <span>출금 자산</span>
                <select
                  value={fixedForm.from_asset_account_id || ''}
                  onChange={(e) =>
                    setFixedForm((prev) => ({
                      ...prev,
                      from_asset_account_id: e.target.value,
                    }))
                  }
                  required
                >
                  <option value="">선택</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
          
              <label>
                <span>입금 자산</span>
                <select
                  value={fixedForm.to_asset_account_id || ''}
                  onChange={(e) =>
                    setFixedForm((prev) => ({
                      ...prev,
                      to_asset_account_id: e.target.value,
                    }))
                  }
                  required
                >
                  <option value="">선택</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label>
              <span>카테고리</span>
              <select
                value={fixedForm.category_id}
                onChange={(e) =>
                  setFixedForm((prev) => ({
                    ...prev,
                    category_id: e.target.value,
                  }))
                }
              >
                <option value="">선택</option>
                {fixedCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {fixedForm.type !== 'transfer' && (
            <label>
              <span>
                {fixedForm.type === 'income' ? '입금 자산' : '출금 자산'}
              </span>
          
              <select
                value={fixedForm.from_asset_account_id || ''}
                onChange={(e) =>
                  setFixedForm((prev) => ({
                    ...prev,
                    from_asset_account_id: e.target.value,
                  }))
                }
              >
                <option value="">선택 안함</option>
          
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          
          <label><span>매월 날짜</span><input type="number" min="1" max="31" value={fixedForm.day_of_month} onChange={(e) => setFixedForm((prev) => ({ ...prev, day_of_month: Number(e.target.value) }))} required /></label>
          <label><span>시작일</span><input type="date" value={fixedForm.start_date} onChange={(e) => setFixedForm((prev) => ({ ...prev, start_date: e.target.value }))} required /></label>
          {fixedForm.type !== 'transfer' && (
            <label>
              <span>결제수단</span>
              <select
                value={fixedForm.payment_method}
                onChange={(e) =>
                  setFixedForm((prev) => ({
                    ...prev,
                    payment_method: e.target.value,
                  }))
                }
              >
                {PAYMENT_METHODS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field-span-2"><span>메모</span><input value={fixedForm.note} onChange={(e) => setFixedForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="예: 월세" /></label>
          <label className="toggle-row"><input type="checkbox" checked={fixedForm.is_active} onChange={(e) => setFixedForm((prev) => ({ ...prev, is_active: e.target.checked }))} /><span>활성화</span></label>
          <div className="actions"><button type="submit" className="primary-button">{fixedForm.id ? '자동 거래 수정' : '자동 거래 추가'}</button>{fixedForm.id && <button type="button" className="secondary-button" onClick={resetFixedForm}>취소</button>}</div>
        </form>

        <div className="list-grid small-cards">
          {fixedExpenses.map((item) => (
            <div key={item.id} className="mini-card">
              <strong>{item.name}</strong>
              <p className="muted auto-transaction-meta">
                <span
                  className={`auto-transaction-badge ${
                    item.type === 'income'
                      ? 'income'
                      : item.type === 'transfer'
                        ? 'transfer'
                        : 'expense'
                  }`}
                >
                  {item.type === 'income'
                    ? '수입'
                    : item.type === 'transfer'
                      ? '자산이동'
                      : '지출'}
                </span>
              
                <span>
                  {item.type === 'transfer'
                    ? `${item.from_asset_name || '출금자산'} → ${item.to_asset_name || '입금자산'}`
                    : `매월 ${item.day_of_month}일 · ${formatAmount(item.amount)}원`}
                </span>
              
                <span>
                  다음 실행 {item.next_run_date}
                </span>
              </p>
              <div className="actions">
                <button type="button" className="secondary-button" onClick={() =>
                  setFixedForm({
                    ...item,
                    type: item.type || 'expense',
                    amountInput: formatAmount(item.amount),
                  })
                }
                >수정</button>
                <button type="button" className="ghost-button" onClick={() => onDeleteFixedExpense(item.id)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="예산 설정" description="카테고리별 또는 전체 예산을 등록하고 초과 여부를 확인하세요.">
        <form className="form-grid compact-form" onSubmit={async (e) => {
          e.preventDefault();
          await onSaveBudget({ ...budgetForm, amount: parseAmount(budgetForm.amountInput) });
          resetBudgetForm();
        }}>
          <label><span>기준 월</span><input type="date" value={budgetForm.month_start} onChange={(e) => setBudgetForm((prev) => ({ ...prev, month_start: e.target.value }))} required /></label>
          <label><span>카테고리</span><select value={budgetForm.category_id} onChange={(e) => setBudgetForm((prev) => ({ ...prev, category_id: e.target.value }))}><option value="">전체</option>{expenseCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>예산</span><input value={budgetForm.amountInput} onChange={(e) => setBudgetForm((prev) => ({ ...prev, amountInput: e.target.value.replace(/[^0-9]/g, '') ? formatAmount(Number(e.target.value.replace(/[^0-9]/g, ''))) : '' }))} required /></label>
          <div className="actions"><button type="submit" className="primary-button">{budgetForm.id ? '예산 수정' : '예산 추가'}</button>{budgetForm.id && <button type="button" className="secondary-button" onClick={resetBudgetForm}>취소</button>}</div>
        </form>

        <div className="list-grid small-cards">
          {budgets.map((item) => (
            <div key={item.id} className="mini-card">
              <strong>{item.category_name}</strong>
              <p className="muted">예산 {formatAmount(item.amount)}원 / 사용 {formatAmount(item.spent)}원</p>
              <div className="actions">
                <button type="button" className="secondary-button" onClick={() => setBudgetForm({ ...item, amountInput: formatAmount(item.amount) })}>수정</button>
                <button type="button" className="ghost-button" onClick={() => onDeleteBudget(item.id)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="기초자산 관리" description="은행별 잔액, 현금, 카드대금 등 현재 보유 자산을 입력합니다.">
        <form className="form-grid compact-form" onSubmit={async (e) => {
          e.preventDefault();
      
          await onSaveAsset({
            ...assetForm,
            balance: parseAmount(assetForm.balanceInput),
          });
      
          resetAssetForm();
        }}>
          <label>
            <span>자산명</span>
      
            <input
              value={assetForm.name}
              onChange={(e) =>
                setAssetForm((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              placeholder="예: 국민은행, 카카오뱅크, 현금"
              required
            />
          </label>
      
          <label>
            <span>유형</span>
      
            <select
              value={assetForm.asset_type}
              onChange={(e) =>
                setAssetForm((prev) => ({
                  ...prev,
                  asset_type: e.target.value,
                }))
              }
            >
              {ASSET_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
      
          <label>
            <span>현재 금액</span>
      
            <input
              value={assetForm.balanceInput}
              onChange={(e) =>
                setAssetForm((prev) => ({
                  ...prev,
                  balanceInput:
                    e.target.value.replace(/[^0-9]/g, '')
                      ? formatAmount(
                          Number(
                            e.target.value.replace(/[^0-9]/g, '')
                          )
                        )
                      : '',
                }))
              }
              placeholder="예: 1,000,000"
              required
            />
          </label>
      
          <label className="field-span-2">
            <span>메모</span>
      
            <input
              value={assetForm.memo || ''}
              onChange={(e) =>
                setAssetForm((prev) => ({
                  ...prev,
                  memo: e.target.value,
                }))
              }
            />
          </label>
      
          <div className="actions">
            <button
              type="submit"
              className="primary-button"
            >
              {assetForm.id ? '기초자산 수정' : '기초자산 추가'}
            </button>
      
            {assetForm.id && (
              <button
                type="button"
                className="secondary-button"
                onClick={resetAssetForm}
              >
                취소
              </button>
            )}
          </div>
        </form>
      
        <div className="asset-maintenance-card wide-card">
          <div>
            <strong>엑셀 업로드 로그</strong>
      
            <p className="muted">
              최근 거래 엑셀 업로드 결과를 확인합니다.
            </p>
          </div>
      
          <div className="history-list">
            {(uploadLogs || []).length > 0 ? (
              uploadLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="history-card">
                  <div className="history-card-header">
                    <strong>
                      {log.status === 'fail' ? '실패' : '성공'}
                    </strong>
      
                    <span className="muted">
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString('ko-KR')
                        : '-'}
                    </span>
                  </div>
      
                  {log.file_name && (
                    <p className="muted">
                      파일: {log.file_name}
                    </p>
                  )}
      
                  <p>
                    업로드 대상 {log.total_rows || 0}행 / 등록 {log.imported_rows || 0}건 / 제외{' '}
                    {log.status === 'fail'
                      ? Number(
                          log.excluded_rows ||
                          log.total_rows ||
                          0
                        )
                      : Math.max(
                          0,
                          Number(log.total_rows || 0) -
                          Number(log.imported_rows || 0)
                        )}건
      
                    {log.transfer_rows
                      ? ` / 자산이동 ${log.transfer_rows}건`
                      : ''}
                  </p>
      
                  {log.error_message && (
                    <p className="muted">
                      {log.error_message}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="muted">
                아직 엑셀 업로드 로그가 없습니다.
              </p>
            )}
          </div>
        </div>
        <div className="asset-maintenance-card wide-card">
          <div>
            <strong>거래 수정/삭제 히스토리</strong>
      
            <p className="muted">
              최근 거래 수정 및 삭제 기록을 확인합니다. 원본 거래내역을 복구하거나 변경하지는 않습니다.
            </p>
          </div>
      
          {(transactionHistories || []).length > 10 && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowAllHistories((prev) => !prev)}
            >
              {showAllHistories
                ? '최근 10개만 보기'
                : `전체 보기 (${transactionHistories.length}건)`}
            </button>
          )}
      
          <div className="history-list">
            {(transactionHistories || []).length > 0 ? (
              visibleTransactionHistories.map((history) => {
                const beforeData = history.before_data || {};
                const afterData = history.after_data || null;
      
                return (
                  <div key={history.id} className="history-card">
                    <div className="history-card-header">
                      <strong>
                        {history.action === 'delete' ? '삭제' : '수정'}
                      </strong>
      
                      <span className="muted">
                        {history.created_at
                          ? new Date(history.created_at).toLocaleString('ko-KR')
                          : '-'}
                      </span>
                    </div>
      
                    <p>
                      <b>수정 전:</b>{' '}
                      {beforeData.transaction_date || '-'} / {beforeData.note || '메모 없음'} /{' '}
                      {Number(beforeData.amount || 0).toLocaleString()}원
                    </p>
      
                    {afterData && (
                      <p>
                        <b>수정 후:</b>{' '}
                        {afterData.transaction_date || '-'} / {afterData.note || '메모 없음'} /{' '}
                        {Number(afterData.amount || 0).toLocaleString()}원
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="muted">
                아직 거래 수정/삭제 히스토리가 없습니다.
              </p>
            )}
          </div>
        </div>
      
        <div className="asset-maintenance-card">
          <div>
            <strong>기초자산 엑셀 등록</strong>
      
            <p className="muted">
              엑셀 양식을 내려받아 자산명, 유형, 현재금액, 메모를 입력한 뒤 한 번에 등록할 수 있습니다.
            </p>
          </div>
      
          <div className="actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleDownloadAssetTemplate}
            >
              엑셀 양식 다운로드
            </button>
      
            <label className="secondary-button file-button">
              엑셀 업로드
      
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleAssetExcelFile}
                hidden
              />
            </label>
          </div>
        </div>
      
        <div className="asset-maintenance-card">
          <div>
            <strong>오래된 캐시 데이터 정리</strong>
      
            <p className="muted">
              24개월보다 오래된 자산 그래프 캐시와 12개월보다 오래된 거래 수정 히스토리만 삭제합니다. 거래내역, 자산 금액, 카테고리, 설정은 삭제되지 않습니다.
            </p>
          </div>
      
          <button
            type="button"
            className="secondary-button"
            onClick={onCleanupCache}
          >
            캐시 정리
          </button>
        </div>
      
        <div className="list-grid small-cards">
          {[...(assets || [])]
            .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
            .map((item) => (
              <div key={item.id} className="mini-card">
                <strong>{item.name}</strong>
      
                <p className="muted">
                  {item.asset_type} · {formatAmount(item.balance)}원
                </p>
      
                {item.memo && (
                  <p className="muted">
                    {item.memo}
                  </p>
                )}
      
                <div className="actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setAssetForm({
                        ...item,
                        balanceInput: formatAmount(item.balance),
                        display_order: item.display_order || 0,
                        memo: item.memo || '',
                      })
                    }
                  >
                    수정
                  </button>
      
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onDeleteAsset(item.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
        </div>
      </Section>
      
      <Section title="백업 · 복원 · 잠금 · 다크모드" description="개인용 서비스 운영에 필요한 보조 기능을 제공합니다.">
        <div className="settings-grid">
                    <div className="mini-card stack gap-sm">
            <strong>가계부 이름</strong>
            <p className="muted">상단에 표시될 가계부 이름을 설정합니다.</p>
            <input
              value={ledgerName}
              maxLength={80}
              onChange={(e) => setLedgerName(e.target.value)}
              placeholder="예: 우리 가계부"
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => onSaveLedgerName(ledgerName)}
            >
              이름 저장
            </button>
          </div>

          <div className="mini-card stack gap-sm">
            <strong>목표 자산</strong>
          
            <p className="muted">
              목표 자산 금액을 설정하고 진행률을 확인합니다.
            </p>
          
            <input
              value={targetAssetAmount}
              onChange={(e) =>
                setTargetAssetAmount(
                  e.target.value.replace(/[^0-9]/g, '')
                    ? formatAmount(
                        Number(e.target.value.replace(/[^0-9]/g, ''))
                      )
                    : ''
                )
              }
              placeholder="예: 10,000,000"
            />
          
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onSaveTargetAsset(
                  parseAmount(targetAssetAmount)
                )
              }
            >
              목표 저장
            </button>
          </div>
                    
          <div className="mini-card stack gap-sm">
            <strong>테마 모드</strong>
            <p className="muted">원하는 색감의 화면 테마를 선택합니다.</p>
            <select
              value={settings?.theme_mode || (settings?.dark_mode ? 'dark' : 'light')}
              onChange={(e) => onChangeTheme(e.target.value)}
            >
              {THEME_OPTIONS.map((theme) => (
                <option key={theme.value} value={theme.value}>
                  {theme.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mini-card stack gap-sm">
            <strong>잠금 기능</strong>
            <label className="toggle-row"><input type="checkbox" checked={pinEnabled} onChange={(e) => setPinEnabled(e.target.checked)} /><span>PIN 잠금 사용</span></label>
            {pinEnabled && <input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))} placeholder="4~8자리 숫자" />}
            <button type="button" className="secondary-button" onClick={() => onSavePin(pinEnabled, pin)}>잠금 설정 저장</button>
          </div>

          <div className="mini-card stack gap-sm">
            <strong>백업 / 복원</strong>
            <button type="button" className="secondary-button" onClick={onExportBackup}>JSON 백업 다운로드</button>
            <label className="upload-button">
              백업 파일 복원
              <input type="file" accept="application/json" onChange={handleBackupFile} />
            </label>
          </div>
        </div>
      </Section>
    </section>
  );
}

export default ManagementPanel;
