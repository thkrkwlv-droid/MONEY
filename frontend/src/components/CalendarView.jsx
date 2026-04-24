import { formatAmount, formatDateShort, formatMonthKo } from '../utils';

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
    const iso = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days.push(iso);
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

function CalendarView({ month, transactions }) {
  const rows = buildCalendarMatrix(month);
  const map = transactions.reduce((acc, item) => {
    if (!acc[item.transaction_date]) acc[item.transaction_date] = [];
    acc[item.transaction_date].push(item);
    return acc;
  }, {});

  return (
    <section className="panel stack gap-lg">
      <div className="section-heading">
        <div>
          <p className="eyebrow">캘린더 뷰</p>
          <h2>{formatMonthKo(month)} 달력</h2>
          <p className="muted">날짜별 내역과 일일 수입/지출 합계를 한눈에 볼 수 있습니다.</p>
        </div>
      </div>

      <div className="calendar-grid headers">
        {['일', '월', '화', '수', '목', '금', '토'].map((label) => (
          <div key={label} className="calendar-header">{label}</div>
        ))}
      </div>

      {rows.map((row, index) => (
        <div key={index} className="calendar-grid">
          {row.map((date) => {
            const items = date ? map[date] || [] : [];
            const income = items.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0);
            const expense = items.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0);
            return (
              <div key={date || `blank-${index}-${Math.random()}`} className={`calendar-cell ${date ? '' : 'empty'}`}>
                {date && (
                  <>
                    <strong>{new Date(date).getDate()}</strong>
                    <small className="muted">{formatDateShort(date)}</small>
                    <div className="calendar-summary">
                      {income > 0 && <span className="positive-text">+{formatAmount(income)}</span>}
                      {expense > 0 && <span className="danger-text">-{formatAmount(expense)}</span>}
                    </div>
                    <div className="calendar-items">
                      {items.slice(0, 3).map((item) => (
                        <div key={item.id} className="calendar-pill">
                          <span>{item.category_name || '미분류'}</span>
                          <span>{formatAmount(item.amount)}</span>
                        </div>
                      ))}
                      {items.length > 3 && <div className="calendar-pill muted">+ {items.length - 3}건 더 보기</div>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

export default CalendarView;
