import { useMemo, useState } from 'react';
import { PAYMENT_METHODS, formatAmount, parseAmount, today, WEEKDAY_NAMES } from '../utils';

function Section({ title, description, children }) {
  return (
    <article className="panel stack gap-md">
      <div className="section-heading compact">
        <div>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
      </div>
      {children}
    </article>
  );
}

function ManagementPanel({
  month,
  categories,
  favorites,
  recurringTransactions,
  fixedExpenses,
  budgets,
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
  onToggleTheme,
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
    id: '', name: '', amountInput: '', category_id: '', note: '', payment_method: '자동이체', day_of_month: 25, start_date: today(), is_active: true,
  });
  const [budgetForm, setBudgetForm] = useState({ id: '', month_start: `${month}-01`, category_id: '', amountInput: '' });
  const [pinEnabled, setPinEnabled] = useState(Boolean(settings?.pin_enabled));
  const [pin, setPin] = useState('');

  const expenseCategories = useMemo(() => categories.filter((item) => item.type !== 'income'), [categories]);

  const resetCategoryForm = () => setCategoryForm({ id: '', name: '', type: 'expense', color: '#6366f1' });
  const resetFavoriteForm = () => setFavoriteForm({ id: '', name: '', type: 'expense', amountInput: '', category_id: '', note: '', payment_method: '현금' });
  const resetRecurringForm = () => setRecurringForm({
    id: '', name: '', type: 'expense', amountInput: '', category_id: '', note: '', payment_method: '현금',
    frequency: 'monthly', interval_count: 1, start_date: today(), weekday: 1, day_of_month: 25, is_active: true,
  });
  const resetFixedForm = () => setFixedForm({
    id: '', name: '', amountInput: '', category_id: '', note: '', payment_method: '자동이체', day_of_month: 25, start_date: today(), is_active: true,
  });
  const resetBudgetForm = () => setBudgetForm({ id: '', month_start: `${month}-01`, category_id: '', amountInput: '' });

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

      <Section title="반복 입력" description="매일 · 매주 · 매월 패턴으로 자동 등록됩니다.">
        <form className="form-grid compact-form" onSubmit={async (e) => {
          e.preventDefault();
          await onSaveRecurring({ ...recurringForm, amount: parseAmount(recurringForm.amountInput) });
          resetRecurringForm();
        }}>
          <label><span>이름</span><input value={recurringForm.name} onChange={(e) => setRecurringForm((prev) => ({ ...prev, name: e.target.value }))} required /></label>
          <label><span>유형</span><select value={recurringForm.type} onChange={(e) => setRecurringForm((prev) => ({ ...prev, type: e.target.value }))}><option value="expense">지출</option><option value="income">수입</option></select></label>
          <label><span>금액</span><input value={recurringForm.amountInput} onChange={(e) => setRecurringForm((prev) => ({ ...prev, amountInput: e.target.value.replace(/[^0-9]/g, '') ? formatAmount(Number(e.target.value.replace(/[^0-9]/g, ''))) : '' }))} required /></label>
          <label><span>카테고리</span><select value={recurringForm.category_id} onChange={(e) => setRecurringForm((prev) => ({ ...prev, category_id: e.target.value }))}><option value="">선택</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>결제수단</span><select value={recurringForm.payment_method} onChange={(e) => setRecurringForm((prev) => ({ ...prev, payment_method: e.target.value }))}>{PAYMENT_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>시작일</span><input type="date" value={recurringForm.start_date} onChange={(e) => setRecurringForm((prev) => ({ ...prev, start_date: e.target.value }))} required /></label>
          <label><span>주기</span><select value={recurringForm.frequency} onChange={(e) => setRecurringForm((prev) => ({ ...prev, frequency: e.target.value }))}><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label>
          <label><span>간격</span><input type="number" min="1" value={recurringForm.interval_count} onChange={(e) => setRecurringForm((prev) => ({ ...prev, interval_count: Number(e.target.value) }))} /></label>
          {recurringForm.frequency === 'weekly' && (
            <label><span>요일</span><select value={recurringForm.weekday} onChange={(e) => setRecurringForm((prev) => ({ ...prev, weekday: Number(e.target.value) }))}>{WEEKDAY_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
          )}
          {recurringForm.frequency === 'monthly' && (
            <label><span>매월 날짜</span><input type="number" min="1" max="31" value={recurringForm.day_of_month} onChange={(e) => setRecurringForm((prev) => ({ ...prev, day_of_month: Number(e.target.value) }))} /></label>
          )}
          <label className="field-span-2"><span>메모</span><input value={recurringForm.note} onChange={(e) => setRecurringForm((prev) => ({ ...prev, note: e.target.value }))} /></label>
          <label className="toggle-row"><input type="checkbox" checked={recurringForm.is_active} onChange={(e) => setRecurringForm((prev) => ({ ...prev, is_active: e.target.checked }))} /><span>활성화</span></label>
          <div className="actions"><button type="submit" className="primary-button">{recurringForm.id ? '반복 거래 수정' : '반복 거래 추가'}</button>{recurringForm.id && <button type="button" className="secondary-button" onClick={resetRecurringForm}>취소</button>}</div>
        </form>

        <div className="list-grid small-cards">
          {recurringTransactions.map((item) => (
            <div key={item.id} className="mini-card">
              <strong>{item.name}</strong>
              <p className="muted">{item.frequency} · {formatAmount(item.amount)}원 · 다음 실행 {item.next_run_date}</p>
              <div className="actions">
                <button type="button" className="secondary-button" onClick={() => setRecurringForm({ ...item, amountInput: formatAmount(item.amount) })}>수정</button>
                <button type="button" className="ghost-button" onClick={() => onDeleteRecurring(item.id)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="고정지출 자동 반영" description="서버 날짜 기준으로 자동 생성되며, 누락된 과거 월도 중복 없이 보정됩니다.">
        <form className="form-grid compact-form" onSubmit={async (e) => {
          e.preventDefault();
          await onSaveFixedExpense({ ...fixedForm, amount: parseAmount(fixedForm.amountInput) });
          resetFixedForm();
        }}>
          <label><span>지출명</span><input value={fixedForm.name} onChange={(e) => setFixedForm((prev) => ({ ...prev, name: e.target.value }))} required /></label>
          <label><span>금액</span><input value={fixedForm.amountInput} onChange={(e) => setFixedForm((prev) => ({ ...prev, amountInput: e.target.value.replace(/[^0-9]/g, '') ? formatAmount(Number(e.target.value.replace(/[^0-9]/g, ''))) : '' }))} required /></label>
          <label><span>카테고리</span><select value={fixedForm.category_id} onChange={(e) => setFixedForm((prev) => ({ ...prev, category_id: e.target.value }))}><option value="">선택</option>{expenseCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>매월 날짜</span><input type="number" min="1" max="31" value={fixedForm.day_of_month} onChange={(e) => setFixedForm((prev) => ({ ...prev, day_of_month: Number(e.target.value) }))} required /></label>
          <label><span>시작일</span><input type="date" value={fixedForm.start_date} onChange={(e) => setFixedForm((prev) => ({ ...prev, start_date: e.target.value }))} required /></label>
          <label><span>결제수단</span><select value={fixedForm.payment_method} onChange={(e) => setFixedForm((prev) => ({ ...prev, payment_method: e.target.value }))}>{PAYMENT_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="field-span-2"><span>메모</span><input value={fixedForm.note} onChange={(e) => setFixedForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="예: 월세" /></label>
          <label className="toggle-row"><input type="checkbox" checked={fixedForm.is_active} onChange={(e) => setFixedForm((prev) => ({ ...prev, is_active: e.target.checked }))} /><span>활성화</span></label>
          <div className="actions"><button type="submit" className="primary-button">{fixedForm.id ? '고정지출 수정' : '고정지출 추가'}</button>{fixedForm.id && <button type="button" className="secondary-button" onClick={resetFixedForm}>취소</button>}</div>
        </form>

        <div className="list-grid small-cards">
          {fixedExpenses.map((item) => (
            <div key={item.id} className="mini-card">
              <strong>{item.name}</strong>
              <p className="muted">매월 {item.day_of_month}일 · {formatAmount(item.amount)}원 · 다음 실행 {item.next_run_date}</p>
              <div className="actions">
                <button type="button" className="secondary-button" onClick={() => setFixedForm({ ...item, amountInput: formatAmount(item.amount) })}>수정</button>
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

      <Section title="백업 · 복원 · 잠금 · 다크모드" description="개인용 서비스 운영에 필요한 보조 기능을 제공합니다.">
        <div className="settings-grid">
          <div className="mini-card stack gap-sm">
            <strong>다크모드</strong>
            <button type="button" className="secondary-button" onClick={() => onToggleTheme(!settings.dark_mode)}>
              {settings.dark_mode ? '라이트 모드로 전환' : '다크 모드로 전환'}
            </button>
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
