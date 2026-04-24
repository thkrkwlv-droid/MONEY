import { useMemo } from 'react';
import { formatAmount, formatDateKo } from '../utils';

function TransactionTable({ transactions, categories, filters, setFilters, onEdit, onDelete }) {
  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (filters.type && transaction.type !== filters.type) return false;
      if (filters.categoryId && transaction.category_id !== filters.categoryId) return false;
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

      <div className="filter-grid">
        <label>
          <span>키워드 검색</span>
          <input value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="메모, 카테고리, 결제수단" />
        </label>
        <label>
          <span>유형</span>
          <select value={filters.type} onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}>
            <option value="">전체</option>
            <option value="expense">지출</option>
            <option value="income">수입</option>
          </select>
        </label>
        <label>
          <span>카테고리</span>
          <select value={filters.categoryId} onChange={(e) => setFilters((prev) => ({ ...prev, categoryId: e.target.value }))}>
            <option value="">전체</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>시작일</span>
          <input type="date" value={filters.startDate} onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))} />
        </label>
        <label>
          <span>종료일</span>
          <input type="date" value={filters.endDate} onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))} />
        </label>
      </div>

      <div className="transaction-list">
        {filteredTransactions.length === 0 && <p className="muted">조건에 맞는 내역이 없습니다.</p>}
        {filteredTransactions.map((transaction) => (
          <article key={transaction.id} className="transaction-card">
            <div className="transaction-main">
              <div>
                <div className="transaction-meta">
                  <span className={`badge ${transaction.type === 'income' ? 'positive' : 'danger'}`}>
                    {transaction.type === 'income' ? '수입' : '지출'}
                  </span>
                  <span>{transaction.category_name || '미분류'}</span>
                  <span>{transaction.payment_method}</span>
                  {transaction.auto_generated && <span className="badge">자동 생성</span>}
                </div>
                <strong>{transaction.note || '메모 없음'}</strong>
                <p className="muted">{formatDateKo(transaction.transaction_date)}</p>
              </div>
              <strong className={transaction.type === 'income' ? 'positive-text' : 'danger-text'}>
                {transaction.type === 'income' ? '+' : '-'}{formatAmount(transaction.amount)}원
              </strong>
            </div>
            <div className="transaction-actions">
              <button type="button" className="secondary-button" onClick={() => onEdit(transaction)}>수정</button>
              <button type="button" className="ghost-button" onClick={() => onDelete(transaction.id)}>삭제</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default TransactionTable;
