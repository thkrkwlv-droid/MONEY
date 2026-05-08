import { formatAmount, formatMonthKo } from '../utils';

function buildCategoryReport(transactions = [], fixedExpenses = []) {
  const fixedNames = new Set(
    (fixedExpenses || [])
      .map((item) => String(item.name || item.note || '').trim())
      .filter(Boolean)
  );

  const fixedCategoryIds = new Set(
    (fixedExpenses || [])
      .map((item) => item.category_id)
      .filter(Boolean)
  );

  const summary = {
    income: {},
    expense: {},
    totalIncome: 0,
    totalExpense: 0,
  };

  transactions.forEach((item) => {
    const type = item.type === 'income' ? 'income' : 'expense';
    const categoryName = item.category_name || '미분류';
    const amount = Number(item.amount || 0);
    const key = item.category_id || categoryName;

    if (!summary[type][key]) {
      summary[type][key] = {
        key,
        categoryName,
        total: 0,
        count: 0,
        color: item.category_color,
        isFixed:
          fixedCategoryIds.has(item.category_id) ||
          fixedNames.has(String(item.note || '').trim()),
      };
    }

    summary[type][key].total += amount;
    summary[type][key].count += 1;

    if (type === 'income') summary.totalIncome += amount;
    else summary.totalExpense += amount;
  });

  return {
    incomeRows: Object.values(summary.income).sort((a, b) => b.total - a.total),
    expenseRows: Object.values(summary.expense).sort((a, b) => b.total - a.total),
    totalIncome: summary.totalIncome,
    totalExpense: summary.totalExpense,
    balance: summary.totalIncome - summary.totalExpense,
  };
}

function ReportList({ title, rows, type }) {
  const total = rows.reduce((sum, item) => sum + Number(item.total || 0), 0);

  return (
    <article className="panel stack gap-md">
      <div className="section-heading compact">
        <div>
          <h3>{title}</h3>
          <p className="muted">카테고리별 합계를 금액이 큰 순서로 보여줍니다.</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="muted">이번 달에 등록된 내역이 없습니다.</p>
      ) : (
        <div className="monthly-report-list">
          {rows.map((item) => {
            const percent = total ? Math.round((Number(item.total || 0) / total) * 100) : 0;

            return (
              <div key={item.key} className={`monthly-report-row ${item.isFixed ? 'fixed' : ''}`}>
                <div className="monthly-report-main">
                  <span
                    className="color-dot"
                    style={{ backgroundColor: item.color || (type === 'income' ? '#22c55e' : '#ef4444') }}
                  />
                  <div>
                    <strong>{item.categoryName}</strong>
                    <p className="muted">
                      {item.count}건 · {percent}%
                      {item.isFixed && <span className="fixed-badge">고정지출</span>}
                    </p>
                  </div>
                </div>

                <strong className={type === 'income' ? 'positive-text' : 'danger-text'}>
                  {type === 'income' ? '+' : '-'}{formatAmount(item.total)}원
                </strong>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function MonthlyReport({ month, transactions, fixedExpenses }) {
  const report = buildCategoryReport(transactions, fixedExpenses);

  return (
    <section className="stack gap-lg">
      <div className="panel toolbar-row">
        <div>
          <h2>{formatMonthKo(month)} 월간 리포트</h2>
          <p className="muted">한 달 동안의 수입과 지출을 카테고리별로 한눈에 확인합니다.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card positive">
          <span>총 수입</span>
          <strong>{formatAmount(report.totalIncome)}원</strong>
          <small>이번 달 수입 합계</small>
        </div>

        <div className="stat-card danger">
          <span>총 지출</span>
          <strong>{formatAmount(report.totalExpense)}원</strong>
          <small>이번 달 지출 합계</small>
        </div>

        <div className="stat-card accent">
          <span>월 잔액</span>
          <strong>{formatAmount(report.balance)}원</strong>
          <small>수입 - 지출</small>
        </div>
      </div>

      <div className="monthly-report-grid">
        <ReportList title="수입 카테고리별 합계" rows={report.incomeRows} type="income" />
        <ReportList title="지출 카테고리별 합계" rows={report.expenseRows} type="expense" />
      </div>
    </section>
  );
}

export default MonthlyReport;
