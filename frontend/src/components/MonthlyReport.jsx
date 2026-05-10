import { useMemo, useState } from 'react';
import { formatAmount, formatMonthKo } from '../utils';

const REPORT_MODES = [
  { id: 'category', label: '카테고리별', description: '수입/지출을 카테고리 기준으로 합산합니다.' },
  { id: 'payment', label: '결제수단별', description: '카드, 현금, 계좌이체 등 결제수단 기준으로 합산합니다.' },
  { id: 'asset', label: '자산별', description: '은행/자산 연결 기준으로 합산합니다.' },
];

function getReportKey(item, mode) {
  if (mode === 'payment') return item.payment_method || '미분류';
  if (mode === 'asset') return item.asset_account_name || '미연결';
  return item.category_name || '미분류';
}

function buildReport(transactions = [], fixedExpenses = [], mode = 'category') {
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
    if (item.type === 'transfer') return;
    
    const type = item.type === 'income' ? 'income' : 'expense';
    const amount = Number(item.amount || 0);
    const name = getReportKey(item, mode);
    const key = `${type}-${name}`;

    if (!summary[type][key]) {
      summary[type][key] = {
        key,
        name,
        total: 0,
        count: 0,
        color: item.category_color,
        isFixed:
          Boolean(item.auto_generated) ||
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

function buildSpendingInsights(expenseRows = []) {
  if (!expenseRows.length) {
    return [];
  }

  const topExpense = expenseRows[0];

  return [
    {
      title: '가장 큰 지출',
      text: `${topExpense.name}에 ${formatAmount(topExpense.total)}원을 사용했어요.`,
    },
    {
      title: '지출 비중',
      text: `이번 달 지출 중 ${topExpense.name} 비중이 가장 높아요.`,
    },
  ];
}

function ReportList({ title, rows, type, modeLabel }) {
  const total = rows.reduce((sum, item) => sum + Number(item.total || 0), 0);

  const topItem = rows[0] || null;

  const topPercent = topItem && total
    ? Math.round((Number(topItem.total || 0) / total) * 100)
    : 0;

  return (
    <article className="panel stack gap-md">
      <div className="section-heading compact">
        <div>
          <h3>{title}</h3>
          <p className="muted">{modeLabel} 합계를 금액이 큰 순서로 보여줍니다.</p>
        </div>
      </div>

      {topItem && (
        <div className={`report-top-summary ${type}`}>
          <span>
            {type === 'income' ? '💰 최대 수입' : '💸 최대 지출'}
          </span>
      
          <strong>
            {topItem.name}
          </strong>
      
          <p>
            {formatAmount(topItem.total)}원 · {topPercent}%
          </p>
        </div>
      )}

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
                    <strong>{item.name}</strong>
                    <p className="muted">
                      {item.count}건 · {percent}%
                      {item.isFixed && <span className="fixed-badge">고정지출</span>}
                    </p>
                  </div>
                </div>

                <strong className={type === 'income' ? 'positive-text' : 'danger-text'}>
                  {type === 'income' ? '+' : '-'}{formatAmount(item.total)}원
                </strong>

                <div className="report-bar-track">
                  <div
                    className={`report-bar-fill ${type === 'income' ? 'income' : 'expense'}`}
                    style={{
                      width: `${Math.max(6, percent)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function MonthlyReport({
  transactions = [],
  previousTransactions = [],
  fixedExpenses = [] }) {
  const [reportMode, setReportMode] = useState('category');

  const selectedMode = REPORT_MODES.find((mode) => mode.id === reportMode) || REPORT_MODES[0];

  const report = useMemo(
    () => buildReport(transactions, fixedExpenses, reportMode),
    [transactions, fixedExpenses, reportMode]
  );

  const insights = useMemo(
  () => buildSpendingInsights(report.expenseRows),
  [report.expenseRows]
);

  return (
    <section className="stack gap-lg">
      <div className="panel stack gap-md">
        <div className="toolbar-row">
          <div>
            <h2>{formatMonthKo(month)} 월간 리포트</h2>
            <p className="muted">한 달 동안의 수입과 지출을 다양한 기준으로 확인합니다.</p>
          </div>
        </div>

        <div className="report-mode-row">
          {REPORT_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`report-mode-button ${reportMode === mode.id ? 'active' : ''}`}
              onClick={() => setReportMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <p className="muted">{selectedMode.description}</p>
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

      {insights.length > 0 && (
        <div className="report-insight-grid">
          {insights.map((insight) => (
            <div key={insight.title} className="report-insight-card">
              <span>{insight.title}</span>
              <strong>{insight.text}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="monthly-report-grid">
        <ReportList
          title={`수입 ${selectedMode.label} 합계`}
          rows={report.incomeRows}
          type="income"
          modeLabel={selectedMode.label}
        />
        <ReportList
          title={`지출 ${selectedMode.label} 합계`}
          rows={report.expenseRows}
          type="expense"
          modeLabel={selectedMode.label}
        />
      </div>
    </section>
  );
}

export default MonthlyReport;
