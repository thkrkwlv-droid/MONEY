import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { calcChangeRate, formatAmount, formatMonthKo } from '../utils';

function StatCard({ title, value, tone = 'neutral', subtitle }) {
  return (
    <div className={`stat-card ${tone}`}>
      <span>{title}</span>
      <strong>{formatAmount(value)}원</strong>
      <small>{subtitle}</small>
    </div>
  );
}

function DashboardPanel({ dashboard, budgets, month, onMoveMonth, onRunAutomation, isSyncing }) {
  const incomeRate = calcChangeRate(dashboard?.income || 0, dashboard?.previousIncome || 0);
  const expenseRate = calcChangeRate(dashboard?.expense || 0, dashboard?.previousExpense || 0);
  const comparisonData = [
    { label: '지난달', income: dashboard?.previousIncome || 0, expense: dashboard?.previousExpense || 0 },
    { label: '이번달', income: dashboard?.income || 0, expense: dashboard?.expense || 0 },
  ];

  return (
    <section className="stack gap-lg">
      <div className="panel toolbar-row">
        <div>
          <p className="eyebrow">대시보드</p>
          <h2>{formatMonthKo(month)} 요약</h2>
          <p className="muted">이번 달 수입 / 지출 / 잔액, 카테고리 합계와 흐름 그래프를 한 번에 볼 수 있습니다.</p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="secondary-button" onClick={() => onMoveMonth(-1)}>이전 달</button>
          <button type="button" className="secondary-button" onClick={() => onMoveMonth(1)}>다음 달</button>
          <button type="button" className="secondary-button" onClick={onRunAutomation} disabled={isSyncing}>
            {isSyncing ? '자동 반영 처리 중...' : '자동 반영 즉시 실행'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          title="이번 달 수입"
          value={dashboard?.income || 0}
          tone="positive"
          subtitle={incomeRate == null ? '지난달 비교 데이터 없음' : `지난달 대비 ${incomeRate > 0 ? '+' : ''}${incomeRate}%`}
        />
        <StatCard
          title="이번 달 지출"
          value={dashboard?.expense || 0}
          tone="danger"
          subtitle={expenseRate == null ? '지난달 비교 데이터 없음' : `지난달 대비 ${expenseRate > 0 ? '+' : ''}${expenseRate}%`}
        />
        <StatCard title="현재 잔액" value={dashboard?.balance || 0} tone="accent" subtitle="월말 누적 잔액" />
      </div>

      <div className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="section-heading compact">
            <div>
              <h3>카테고리별 지출</h3>
              <p className="muted">과도한 그래프 대신 가장 필요한 요약만 보여줍니다.</p>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dashboard?.categorySummary || []} dataKey="total" nameKey="category_name" innerRadius={60} outerRadius={90}>
                  {(dashboard?.categorySummary || []).map((entry) => (
                    <Cell key={entry.category_name} fill={entry.category_color || '#6366f1'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${formatAmount(value)}원`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mini-list">
            {(dashboard?.categorySummary || []).slice(0, 5).map((item) => (
              <div key={item.category_name} className="mini-list-row">
                <span className="color-dot" style={{ backgroundColor: item.category_color }} />
                <span>{item.category_name}</span>
                <strong>{formatAmount(item.total)}원</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="section-heading compact">
            <div>
              <h3>월별 비교</h3>
              <p className="muted">이번 달 vs 지난 달 수입/지출 비교</p>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(value) => `${Math.round(value / 10000)}만`} />
                <Tooltip formatter={(value) => `${formatAmount(value)}원`} />
                <Legend />
                <Bar dataKey="income" fill="#22c55e" name="수입" radius={[8, 8, 0, 0]} />
                <Bar dataKey="expense" fill="#ef4444" name="지출" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <div className="dashboard-grid">
        <article className="panel chart-panel chart-panel-wide">
          <div className="section-heading compact">
            <div>
              <h3>잔액 흐름</h3>
              <p className="muted">일자별 누적 잔액 변화를 보여줍니다.</p>
            </div>
          </div>
          <div className="chart-wrap line-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboard?.balanceFlow || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(value) => `${Math.round(value / 10000)}만`} />
                <Tooltip formatter={(value) => `${formatAmount(value)}원`} />
                <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="section-heading compact">
            <div>
              <h3>결제수단 통계</h3>
              <p className="muted">지출/수입이 어떤 수단에서 많이 발생하는지 확인하세요.</p>
            </div>
          </div>
          <div className="mini-list">
            {(dashboard?.paymentSummary || []).map((item) => (
              <div key={item.payment_method} className="mini-list-row">
                <span>{item.payment_method}</span>
                <strong>{formatAmount(item.total)}원</strong>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="panel stack gap-md">
        <div className="section-heading compact">
          <div>
            <h3>예산 초과 현황</h3>
            <p className="muted">월별 예산 대비 실제 지출을 표시합니다.</p>
          </div>
        </div>
        <div className="budget-list">
          {budgets.length === 0 && <p className="muted">아직 등록된 예산이 없습니다.</p>}
          {budgets.map((budget) => {
            const spent = Number(budget.spent || 0);
            const amount = Number(budget.amount || 0);
            const percent = amount ? Math.min(Math.round((spent / amount) * 100), 100) : 0;
            const isOver = spent > amount;
            return (
              <div key={budget.id} className="budget-card">
                <div className="budget-card-header">
                  <strong>{budget.category_name}</strong>
                  <span className={isOver ? 'danger-text' : 'muted'}>
                    {formatAmount(spent)} / {formatAmount(amount)}원
                  </span>
                </div>
                <div className="budget-bar">
                  <div className={`budget-bar-fill ${isOver ? 'danger' : ''}`} style={{ width: `${percent}%` }} />
                </div>
                <small>{isOver ? '예산 초과' : `${percent}% 사용`}</small>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

export default DashboardPanel;
