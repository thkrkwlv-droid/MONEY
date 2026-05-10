import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { PAYMENT_METHODS, formatAmount, formatDateKo } from '../utils';

function escapeCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function downloadExcel(filename, rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, '거래내역');
  XLSX.writeFile(workbook, filename);
}

function isValidDateText(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text);
}

function normalizeTransactionType(value) {
  const text = String(value || '').replace('예시:', '').trim();

  if (text === '수입') return 'income';
  if (text === '자산이동') return 'transfer';
  return 'expense';
}

function downloadTransactionTemplate() {
  const rows = [
    {
      날짜: '예시: 2026-05-01',
      유형: '예시: 지출',
      금액: '예시: 15000',
      카테고리: '예시: 식비',
      결제수단: '예시: 현금',
      자산: '예시: 현금',
      입금자산: '',
      메모: '예시 행은 업로드 시 제외됩니다. 실제 데이터는 3행부터 입력하세요.',
    },
  ];

  downloadExcel('MONEY_거래내역_업로드_양식.xlsx', rows);
}

function TransactionCard({ transaction, onEdit, onDelete }) {
  return (
    <article className="transaction-card">
      <div className="transaction-main">
        <div>
          <div className="transaction-meta">
            <span
              className={`badge ${
                transaction.type === 'income'
                  ? 'positive'
                  : transaction.type === 'transfer'
                    ? 'neutral'
                    : 'danger'
              }`}
            >
              {transaction.type === 'transfer'
                ? '자산이동'
                : transaction.type === 'income'
                  ? '수입'
                  : '지출'}
            </span>

            {transaction.type === 'transfer' ? (
              <span className="transfer-route">
                {transaction.asset_account_name || '출금 자산'} → {transaction.transfer_to_asset_account_name || '입금 자산'}
              </span>
            ) : (
              <>
                <span>{transaction.category_name || '미분류'}</span>
                <span>{transaction.payment_method}</span>
                <span>{transaction.asset_account_name || '\u00A0'}</span>
              </>
            )}

            {transaction.auto_generated && <span className="badge">자동 생성</span>}
          </div>

          <strong>{transaction.note || '메모 없음'}</strong>
          <p className="muted">{formatDateKo(transaction.transaction_date)}</p>
        </div>

        <strong
          className={
            transaction.type === 'income'
              ? 'positive-text'
              : transaction.type === 'transfer'
                ? ''
                : 'danger-text'
          }
        >
          {transaction.type === 'income' ? '+' : transaction.type === 'transfer' ? '' : '-'}
          {formatAmount(transaction.amount)}원{transaction.type === 'transfer' ? ' 이동' : ''}
        </strong>
      </div>

      <div className="transaction-actions">
        <button type="button" className="secondary-button" onClick={() => onEdit(transaction)}>
          수정
        </button>
        <button type="button" className="ghost-button" onClick={() => onDelete(transaction.id)}>
          삭제
        </button>
      </div>
    </article>
  );
}

function TransactionTable({
  transactions,
  categories,
  assets,
  filters,
  setFilters,
  onEdit,
  onDelete,
  showTransfers,
  setShowTransfers,
  onImportTransactionsExcel,
}) {
  const [page, setPage] = useState(1);
  const pageSize = 7;

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (filters.type && transaction.type !== filters.type) return false;
      if (filters.categoryId && transaction.category_id !== filters.categoryId) return false;
      if (filters.paymentMethod && transaction.payment_method !== filters.paymentMethod) return false;

      if (filters.search) {
        const keyword = filters.search.toLowerCase();
        const searchable = `${transaction.note || ''} ${transaction.category_name || ''} ${transaction.payment_method || ''}`.toLowerCase();

        if (!searchable.includes(keyword)) return false;
      }

      if (filters.startDate && transaction.transaction_date < filters.startDate) return false;
      if (filters.endDate && transaction.transaction_date > filters.endDate) return false;

      return true;
    });
  }, [transactions, filters]);

  const filteredExpenseTransactions = filteredTransactions.filter((transaction) => transaction.type === 'expense');
  const filteredIncomeTransactions = filteredTransactions.filter((transaction) => transaction.type === 'income');
  const filteredTransferTransactions = filteredTransactions.filter((transaction) => transaction.type === 'transfer');

  const expenseTotalPages = Math.max(1, Math.ceil(filteredExpenseTransactions.length / pageSize));
  const incomeTotalPages = Math.max(1, Math.ceil(filteredIncomeTransactions.length / pageSize));
  const transferTotalPages = Math.max(1, Math.ceil(filteredTransferTransactions.length / pageSize));

  const totalPages = Math.max(
    expenseTotalPages,
    incomeTotalPages,
    showTransfers ? transferTotalPages : 1
  );

  const safePage = Math.min(page, totalPages);

  const expenseTransactions = filteredExpenseTransactions.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const incomeTransactions = filteredIncomeTransactions.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const transferTransactions = filteredTransferTransactions.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

    function handleExportCsv() {
      const rows = [
        ['날짜', '유형', '금액', '카테고리', '결제수단', '자산', '입금자산', '메모', '자동생성'],
        ...filteredTransactions.map((transaction) => [
          transaction.transaction_date,
          transaction.type === 'income'
            ? '수입'
            : transaction.type === 'transfer'
              ? '자산이동'
              : '지출',
          transaction.amount,
          transaction.category_name || '',
          transaction.payment_method || '',
          transaction.asset_account_name || '',
          transaction.transfer_to_asset_account_name || '',
          transaction.note || '',
          transaction.auto_generated ? 'Y' : 'N',
        ]),
      ];
  
      downloadCsv(`money-transactions-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    }

  function handleExportExcel() {
    const rows = filteredTransactions.map((transaction) => ({
      날짜: transaction.transaction_date,
      유형:
        transaction.type === 'income'
          ? '수입'
          : transaction.type === 'transfer'
            ? '자산이동'
            : '지출',
      금액: Number(transaction.amount || 0),
      카테고리: transaction.category_name || '',
      결제수단: transaction.payment_method || '',
      자산: transaction.asset_account_name || '',
      입금자산: transaction.transfer_to_asset_account_name || '',
      메모: transaction.note || '',
      자동생성: transaction.auto_generated ? 'Y' : 'N',
    }));

    downloadExcel(`money-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`, rows);
  }

    async function handleTransactionExcelFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const dataRows = rows.slice(1); // 2행 예시는 제외, 3행부터 실제 데이터

    const categoryMap = new Map(
      (categories || []).map((category) => [String(category.name || '').trim(), category.id])
    );

    const assetMap = new Map(
      (assets || []).map((asset) => [String(asset.name || '').trim(), asset.id])
    );

    const invalidRows = [];
    const transactionsToImport = dataRows
      .map((row, index) => {
        const excelRowNumber = index + 3;
        const type = normalizeTransactionType(row.유형);
        const transactionDate = String(row.날짜 || '').replace('예시:', '').trim();
        const amount = Number(String(row.금액 || '').replace('예시:', '').replace(/,/g, '').trim());
        const categoryName = String(row.카테고리 || '').trim();
        const assetName = String(row.자산 || '').trim();
        const toAssetName = String(row.입금자산 || '').trim();

        const categoryId = type === 'transfer' ? null : categoryMap.get(categoryName) || null;
        const assetId = assetMap.get(assetName) || null;
        const toAssetId = type === 'transfer' ? assetMap.get(toAssetName) || null : null;

        const rowErrors = [];

        if (!isValidDateText(transactionDate)) rowErrors.push('날짜');
        if (!Number.isFinite(amount) || amount <= 0) rowErrors.push('금액');
        if (type !== 'transfer' && categoryName && !categoryId) rowErrors.push('카테고리');
        if (assetName && !assetId) rowErrors.push('자산');
        if (type === 'transfer' && (!assetId || !toAssetId)) rowErrors.push('자산이동 자산');

        if (rowErrors.length > 0) {
          invalidRows.push(`${excelRowNumber}행(${rowErrors.join(', ')})`);
          return null;
        }

        return {
          transaction_date: transactionDate,
          type,
          amount,
          category_id: categoryId,
          asset_account_id: assetId,
          from_asset_account_id: assetId,
          to_asset_account_id: toAssetId,
          note: String(row.메모 || '').trim(),
          payment_method: type === 'transfer' ? '' : String(row.결제수단 || '').trim() || '현금',
        };
      })
      .filter(Boolean);

    if (invalidRows.length > 0) {
      alert(`일부 행은 오류가 있어 제외했습니다.\n\n${invalidRows.join('\n')}`);
    }

    if (transactionsToImport.length === 0) {
      alert('등록할 수 있는 거래내역이 없습니다. 3행부터 실제 데이터를 입력했는지 확인해주세요.');
      event.target.value = '';
      return;
    }

    await onImportTransactionsExcel(transactionsToImport);
    event.target.value = '';
  }

  return (
    <section className="panel stack gap-lg">
      <div className="section-heading">
        <div>
          <p className="eyebrow">내역 관리</p>
          <h2>검색 · 필터 · 수정 · 삭제</h2>
          <p className="muted">메모 포함 검색, 날짜/카테고리/수입·지출 필터를 지원합니다.</p>
        </div>

        <div className="inline-actions">
          <span className="badge">총 {filteredTransactions.length}건</span>

          <button
            type="button"
            className="secondary-button"
            onClick={handleExportCsv}
            disabled={filteredTransactions.length === 0}
          >
            CSV 내보내기
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={handleExportExcel}
            disabled={filteredTransactions.length === 0}
          >
            엑셀 내보내기
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={downloadTransactionTemplate}
          >
            거래 양식 다운로드
          </button>
          <label className="secondary-button file-button">
            거래 엑셀 업로드
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleTransactionExcelFile}
              hidden
            />
          </label>
        </div>
      </div>

      <div className="filter-layout">
        <label className="search-filter">
          <span>키워드 검색</span>

          <input
            value={filters.search}
            onChange={(e) => {
              setPage(1);
              setFilters((prev) => ({
                ...prev,
                search: e.target.value,
              }));
            }}
            placeholder="메모, 카테고리, 결제수단 검색"
          />
        </label>

        <div className="filter-grid">
          <label>
            <span>유형</span>

            <select
              value={filters.type}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  type: e.target.value,
                }));
              }}
            >
              <option value="">전체</option>
              <option value="expense">지출</option>
              <option value="income">수입</option>
              <option value="transfer">자산이동</option>
            </select>
          </label>

          <label>
            <span>카테고리</span>

            <select
              value={filters.categoryId}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  categoryId: e.target.value,
                }));
              }}
            >
              <option value="">전체</option>

              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>결제수단</span>

            <select
              value={filters.paymentMethod}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  paymentMethod: e.target.value,
                }));
              }}
            >
              <option value="">전체</option>

              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>시작일</span>

            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  startDate: e.target.value,
                }));
              }}
            />
          </label>

          <label>
            <span>종료일</span>

            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  endDate: e.target.value,
                }));
              }}
            />
          </label>
        </div>
      </div>

      <div className="filter-reset-row">
        <button
          type="button"
          className={`secondary-button ${showTransfers ? 'active-soft' : ''}`}
          onClick={() => {
            setPage(1);
            setShowTransfers((prev) => !prev);
          }}
        >
          자산이동 {showTransfers ? '숨기기' : '보기'}
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setPage(1);
            setFilters({
              search: '',
              type: '',
              categoryId: '',
              paymentMethod: '',
              startDate: '',
              endDate: '',
            });
          }}
        >
          필터 초기화
        </button>
      </div>

      <div className={`transaction-split-grid ${showTransfers ? 'with-transfer' : ''}`}>
        <div className="transaction-column">
          <h3 className="transaction-column-title danger-text">지출</h3>

          {expenseTransactions.length === 0 && (
            <p className="muted">조건에 맞는 지출 내역이 없습니다.</p>
          )}

          <div className="transaction-list">
            {expenseTransactions.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>

        <div className="transaction-column">
          <h3 className="transaction-column-title positive-text">수입</h3>

          {incomeTransactions.length === 0 && (
            <p className="muted">조건에 맞는 수입 내역이 없습니다.</p>
          )}

          <div className="transaction-list">
            {incomeTransactions.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>

        {showTransfers && (
          <div className="transaction-column">
            <h3 className="transaction-column-title">자산이동</h3>

            {transferTransactions.length === 0 && (
              <p className="muted">조건에 맞는 자산이동 내역이 없습니다.</p>
            )}

            <div className="transaction-list">
              {transferTransactions.map((transaction) => (
                <TransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={safePage <= 1}
          >
            이전
          </button>

          <span className="pagination-status">
            {safePage} / {totalPages}
          </span>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={safePage >= totalPages}
          >
            다음
          </button>
        </div>
      )}
    </section>
  );
}

export default TransactionTable;
