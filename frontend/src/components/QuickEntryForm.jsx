import { PAYMENT_METHODS, formatAmount, parseAmount, today } from '../utils';

function QuickEntryForm({
  categories,
  assets = [],
  form,
  setForm,
  onSubmit,
  onApplyFavorite,
  favorites,
  recentCategories,
  autocomplete,
  isSaving,
  editingTransaction,
  onCancelEdit,
  viewMode,
}) {
  const recentCategoryIds = new Set(recentCategories.map((item) => item.category_id));

  const handleAmountChange = (event) => {
    const digits = event.target.value.replace(/[^0-9]/g, '');
    setForm((prev) => ({
      ...prev,
      amountInput: digits ? formatAmount(Number(digits)) : '',
    }));
  };

  if (viewMode === 'shared') {
    return null;
  }

  return (
    <section className="panel stack gap-lg">
      <div className="section-heading">
        <div>
          <p className="eyebrow">빠른 입력</p>
          <h2>{editingTransaction ? '내역 수정' : '오늘의 가계부 입력'}</h2>
          <p className="muted">메모는 선택 사항이고, 카테고리 + 금액만으로 바로 저장할 수 있습니다.</p>
        </div>
        <div className="inline-badge-group">
          <span className="badge positive">입력 후 금액/메모 초기화</span>
          <span className="badge">기본 타입: 지출</span>
        </div>
      </div>

      <div className="favorite-chip-wrap">
        {favorites.slice(0, 6).map((favorite) => (
          <button
            key={favorite.id}
            type="button"
            className="chip chip-action"
            onClick={() => onApplyFavorite(favorite)}
          >
            ★ {favorite.name} · {formatAmount(favorite.amount)}원
          </button>
        ))}
      </div>

      {autocomplete?.recommendedCategory && !form.category_id && (
        <div className="notice-card info">
          <strong>자동 추천 카테고리</strong>
          <span>{autocomplete.recommendedCategory.name}</span>
        </div>
      )}

      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          <span>날짜</span>
          <input
            type="date"
            value={form.transaction_date}
            onChange={(e) => setForm((prev) => ({ ...prev, transaction_date: e.target.value || today() }))}
          />
        </label>

        <label>
          <span>수입 / 지출</span>
          <select
            value={form.type}
            onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
          >
            <option value="expense">지출</option>
            <option value="income">수입</option>
            <option value="transfer">자산이동</option>
          </select>
        </label>

        <label>
          <span>금액</span>
          <input
            value={form.amountInput}
            onChange={(e) => setForm((prev) => ({ ...prev, amountInput: e.target.value }))}
            placeholder="0"
            required
          />
        
          <div className="amount-quick-buttons">
            {[
              { label: '+1만', value: 10000 },
              { label: '+5만', value: 50000 },
              { label: '+10만', value: 100000 },
              { label: '+50만', value: 500000 },
            ].map((button) => (
              <button
                key={button.value}
                type="button"
                className="amount-chip"
                onClick={() => {
                  const current = Number(String(form.amountInput || '').replace(/[^0-9]/g, '')) || 0;
                  const next = current + button.value;
                  setForm((prev) => ({
                    ...prev,
                    amountInput: next.toLocaleString('ko-KR'),
                  }));
                }}
              >
                {button.label}
              </button>
            ))}
        
            <button
              type="button"
              className="amount-chip reset"
              onClick={() => setForm((prev) => ({ ...prev, amountInput: '' }))}
            >
              초기화
            </button>
          </div>
        </label>

        <label>
          {form.type !== 'transfer' && (
            <label>
              <span>카테고리</span>
              <select
                value={form.category_id || ''}
                onChange={(e) => {
                  const selectedCategory = categories.find((category) => category.id === e.target.value);
          
                  setForm((prev) => ({
                    ...prev,
                    category_id: e.target.value,
                    type:
                      selectedCategory?.type === 'income'
                        ? 'income'
                        : selectedCategory?.type === 'expense'
                          ? 'expense'
                          : prev.type,
                  }));
                }}
              >
                <option value="">카테고리 선택</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          
          {form.type === 'transfer' ? (
            <>
              <label>
                <span>출금 자산</span>
                <select
                  value={form.from_asset_account_id || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
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
                  value={form.to_asset_account_id || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
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
              <span>자산/계좌</span>
              <select
                value={form.asset_account_id || ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    asset_account_id: e.target.value,
                  }))
                }
              >
                <option value="">선택 안 함</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          
          {form.type !== 'transfer' && (
            <label>
              <span>결제수단</span>
          
              <select
                value={form.payment_method || '체크카드'}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    payment_method: e.target.value,
                  }))
                }
              >
                <option value="체크카드">체크카드</option>
                <option value="신용카드">신용카드</option>
                <option value="계좌이체">계좌이체</option>
                <option value="자동이체">자동이체</option>
                <option value="현금">현금</option>
                <option value="간편결제">간편결제</option>
                <option value="기타">기타</option>
              </select>
            </label>
          )}
          <label className="field-span-2">
            <span>메모</span>
            <input
              value={form.note || ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  note: e.target.value,
                }))
              }
              placeholder="메모 입력"
            />
          </label>
        </label>

        <div className="field-span-2 stack gap-sm">
          <span>최근 카테고리</span>
          <div className="favorite-chip-wrap">
            {categories
              .filter((item) => recentCategoryIds.has(item.id))
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${form.category_id === item.id ? 'chip-selected' : ''}`}
                  onClick={() => setForm((prev) => ({ ...prev, category_id: item.id }))}
                >
                  {item.name}
                </button>
              ))}
          </div>
        </div>

        <div className="actions field-span-2">
          <button type="submit" className="primary-button" disabled={isSaving || parseAmount(form.amountInput) <= 0}>
            {isSaving ? '저장 중...' : editingTransaction ? '수정 저장' : '저장'}
          </button>
          {editingTransaction && (
            <button type="button" className="secondary-button" onClick={onCancelEdit}>
              수정 취소
            </button>
          )}
        </div>
      </form>

      <div className="hint-box">
        <ul>
          <li>숫자만 입력하면 자동으로 콤마가 적용됩니다.</li>
          <li>저장 후 날짜는 오늘로, 유형은 지출로 복귀하고 최근 카테고리는 유지됩니다.</li>
          <li>금액만 바꿔 빠르게 연속 입력할 수 있도록 결제수단과 최근 카테고리를 유지합니다.</li>
        </ul>
      </div>
    </section>
  );
}

export default QuickEntryForm;
