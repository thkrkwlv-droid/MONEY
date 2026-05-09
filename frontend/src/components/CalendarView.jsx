import { useState } from 'react';
import { formatAmount, formatMonthKo } from '../utils';

function buildCalendarMatrix(month) {
  const [year, monthIndex] = month.split('-').map(Number);

  const first = new Date(year, monthIndex - 1, 1);
  const last = new Date(year, monthIndex, 0);

  const startOffset = first.getDay();

  const days = [];

  for (let i = 0; i < startOffset; i += 1) {
    days.push(null);
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(
      `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  const rows = [];

  for (let i = 0; i < days.length; i += 7) {
    rows.push(days.slice(i, i + 7));
  }

  return rows;
}

function normalizeDateKey(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function CalendarView({ month, transactions = [], showTransfers = false }) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(null);

  const rows = buildCalendarMatrix(month);

  const map = transactions.reduce((acc, item) => {
    const dateKey = normalizeDateKey(item.transaction_date);

    if (!dateKey) return acc;

    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }

    acc[dateKey].push(item);

    return acc;
  }, {});

  const selectedItems = selectedDate ? map[selectedDate] || [] : [];

  const incomeItems = selectedItems.filter(
    (item) => item.type === 'income'
  );

  const expenseItems = selectedItems.filter(
    (item) => item.type === 'expense'
  );

  const transferItems = selectedItems.filter(
    (item) => item.type === 'transfer'
  );

  return (
    <section className="panel stack gap-lg">
      <div className="section-heading">
        <div>
          <p className="eyebrow">캘린더 뷰</p>

          <h2>{formatMonthKo(month)} 달력</h2>

          <p className="muted">
            날짜별 수입/지출 합계를 확인하고 날짜를 눌러 상세 내역을 봅니다.
          </p>
        </div>
      </div>

      <div className="calendar-grid headers">
        {['일', '월', '화', '수', '목', '금', '토'].map((label) => (
          <div key={label} className="calendar-header">
            {label}
          </div>
        ))}
      </div>

      {rows.map((row, rowIndex) => (
        <div key={`row-${rowIndex}`} className="calendar-grid">
          {row.map((date, dayIndex) => {
            const items = date ? map[date] || [] : [];

            const income = items
              .filter((item) => item.type === 'income')
              .reduce(
                (sum, item) => sum + Number(item.amount || 0),
                0
              );

            const expense = items
              .filter((item) => item.type === 'expense')
              .reduce(
                (sum, item) => sum + Number(item.amount || 0),
                0
              );

            const transferCount = items.filter((item) => item.type === 'transfer').length;

            return (
              <button
                key={date || `blank-${rowIndex}-${dayIndex}`}
                type="button"
                className={`calendar-cell ${date ? '' : 'empty'} ${
                  selectedDate === date ? 'selected' : ''
                } ${date === todayKey ? 'today' : ''}`}
                onClick={() => date && setSelectedDate(date)}
                disabled={!date}
              >
                {date && (
                  <>
                    <strong>
                      {Number(date.slice(8, 10))}
                      {date === todayKey && <span className="today-label">TODAY</span>}
                    </strong>

                    <div className="calendar-summary">
                      {income > 0 && (
                        <span className="positive-text">
                          +{formatAmount(income)}
                        </span>
                      )}

                      {expense > 0 && (
                        <span className="danger-text">
                          -{formatAmount(expense)}
                        </span>
                      )}

                      {transferCount > 0 && (
                        <span className="transfer-calendar-mark">
                          ↔ {transferCount}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {selectedDate && (
        <div
          className="calendar-detail-overlay"
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="calendar-detail-sheet panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="toolbar-row">
              <div>
                <h3>{selectedDate} 내역</h3>
                <p className="muted">{selectedItems.length}건</p>
              </div>
      
              <button
                type="button"
                className="ghost-button"
                onClick={() => setSelectedDate(null)}
              >
                닫기
              </button>
            </div>
      
            <div className={`calendar-detail-columns ${showTransfers ? 'with-transfer' : ''}`}>
              <div className="calendar-detail-column">
                <div className="calendar-detail-title positive-text">수입</div>
      
                {incomeItems.length === 0 ? (
                  <p className="muted">수입 내역 없음</p>
                ) : (
                  <div className="calendar-detail-list">
                    {incomeItems.map((item) => (
                      <div
                        key={item.id}
                        className={`calendar-detail-row ${item.auto_generated ? 'fixed-highlight' : ''}`}
                      >
                        <div>
                          <strong>{item.note || item.category_name || '미분류'}</strong>
                          <p className="muted">
                            {item.category_name || '미분류'}
                            {item.asset_account_name ? ` · ${item.asset_account_name}` : ''}
                          </p>
                        </div>
      
                        <strong className="positive-text">
                          +{formatAmount(item.amount)}원
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
      
              <div className="calendar-detail-column">
                <div className="calendar-detail-title danger-text">지출</div>
      
                {expenseItems.length === 0 ? (
                  <p className="muted">지출 내역 없음</p>
                ) : (
                  <div className="calendar-detail-list">
                    {expenseItems.map((item) => (
                      <div
                        key={item.id}
                        className={`calendar-detail-row ${item.auto_generated ? 'fixed-highlight' : ''}`}
                      >
                        <div>
                          <strong>{item.note || item.category_name || '미분류'}</strong>
                          <p className="muted">
                            {item.category_name || '미분류'}
                            {item.asset_account_name ? ` · ${item.asset_account_name}` : ''}
                          </p>
                        </div>
      
                        <strong className="danger-text">
                          -{formatAmount(item.amount)}원
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
      
              {showTransfers && (
                <div className="calendar-detail-column">
                  <div className="calendar-detail-title">자산이동</div>
      
                  {transferItems.length === 0 ? (
                    <p className="muted">자산이동 내역 없음</p>
                  ) : (
                    <div className="calendar-detail-list">
                      {transferItems.map((item) => (
                        <div key={item.id} className="calendar-detail-row">
                          <div>
                            <strong>{item.note || '자산이동'}</strong>
                            <p className="muted">
                              {item.asset_account_name || '출금 자산'} → {item.transfer_to_asset_account_name || '입금 자산'}
                            </p>
                          </div>
      
                          <strong className="muted">
                            {formatAmount(item.amount)}원
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default CalendarView;
