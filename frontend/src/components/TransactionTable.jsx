import { useMemo, useState } from 'react';
import { PAYMENT_METHODS, formatAmount, formatDateKo } from '../utils';

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
                    ? ''
                    : 'danger'
              }`}
            >
              {transaction.type === 'transfer'
                ? '자산이동'
                : transaction.type === 'income'
                  ? '수입'
                  : '지출'}
            </span>
          
            <span>{transaction.category_name || '미분류'}</span>
            <span>{transaction.payment_method}</span>
          
            {transaction.type === 'transfer' ? (
              <span>
                {transaction.asset_account_name || '출금 자산'} → {transaction.transfer_to_asset_account_name || '입금 자산'}
              </span>
            ) : (
              transaction.asset_account_name && <span>{transaction.asset_account_name}</span>
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
                ? 'muted'
                : 'danger-text'
          }
        >
          {transaction.type === 'transfer'
            ? ''
            : transaction.type === 'income'
              ? '+'
              : '-'}
          {formatAmount(transaction.amount)}원
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
  filters,
  setFilters,
  onEdit,
  onDelete,
  showTransfers,
  setShowTransfers,
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

  const filteredExpenseTransactions = filteredTransactions.filter(
    (transaction) => transaction.type === 'expense'
  );
  
  const filteredIncomeTransactions = filteredTransactions.filter(
    (transaction) => transaction.type === 'income'
  );

  const filteredTransferTransactions = filteredTransactions.filter(
    (transaction) => transaction.type === 'transfer'
  );
  
  const expenseTotalPages = Math.max(1, Math.ceil(filteredExpenseTransactions.length / pageSize));
  const incomeTotalPages = Math.max(1, Math.ceil(filteredIncomeTransactions.length / pageSize));
  const transferTotalPages = Math.max(1, Math.ceil(filteredTransferTransactions.length / pageSize));
  
  const totalPages = Math.max(expenseTotalPages, incomeTotalPages, transferTotalPages);
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
  
  return (
    <section className="panel stack gap-lg">
      <div className="section-heading">
        <div>
          <p className="eyebrow">내역 관리</p>
          <h2>검색 · 필터 · 수정 · 삭제</h2>
          <p className="muted">메모 포함 검색, 날짜/카테고리/수입·지출 필터를 지원합니다.</p>
        </div>
        <span className="badge">총 {filteredTransactions.length}건</span>
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
          onClick={() => setShowTransfers((prev) => !prev)}
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

            <div className="transaction-column">
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
          </div>
        </div>
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
