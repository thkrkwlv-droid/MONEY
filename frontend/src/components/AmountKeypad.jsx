import { formatAmount } from '../utils';

function AmountKeypad({ value, onChange, onClose }) {
  const digits = String(value || '').replace(/[^0-9]/g, '');

  function applyDigit(nextDigit) {
    const next = `${digits}${nextDigit}`.replace(/^0+/, '') || '0';
    onChange(formatAmount(Number(next)));
  }

  function removeDigit() {
    const next = digits.slice(0, -1);
    onChange(next ? formatAmount(Number(next)) : '');
  }

  function clearAmount() {
    onChange('');
  }

  return (
    <div className="amount-keypad-overlay" onClick={onClose}>
      <div className="amount-keypad-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="amount-keypad-display">
          <span>금액</span>
          <strong>{value || '0'}원</strong>
        </div>

        <div className="amount-keypad-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
            <button key={number} type="button" className="amount-keypad-key" onClick={() => applyDigit(number)}>
              {number}
            </button>
          ))}

          <button type="button" className="amount-keypad-key sub" onClick={clearAmount}>
            C
          </button>

          <button type="button" className="amount-keypad-key" onClick={() => applyDigit(0)}>
            0
          </button>

          <button type="button" className="amount-keypad-key sub" onClick={removeDigit}>
            DEL
          </button>
        </div>

        <button type="button" className="amount-keypad-done" onClick={onClose}>
          완료
        </button>
      </div>
    </div>
  );
}

export default AmountKeypad;
