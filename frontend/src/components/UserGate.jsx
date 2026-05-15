import { useState } from 'react';

const PIN_LENGTH = 4;

function UserGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  async function submitPin(nextPin) {
    if (nextPin.length !== PIN_LENGTH || isUnlocking) return;

    setIsUnlocking(true);
    setError('');

    try {
      await onUnlock(nextPin);
      setPin('');
    } catch (err) {
      setError(err.message || 'PIN이 올바르지 않습니다.');
      setPin('');
    } finally {
      setIsUnlocking(false);
    }
  }

  function handlePress(value) {
    if (isUnlocking) return;

    setError('');

    if (value === 'del') {
      setPin((prev) => prev.slice(0, -1));
      return;
    }

    setPin((prev) => {
      const next = `${prev}${value}`.slice(0, PIN_LENGTH);

      if (next.length === PIN_LENGTH) {
        setTimeout(() => submitPin(next), 80);
      }

      return next;
    });
  }

  return (
    <div className="pin-lock-screen">
      <div className="pin-lock-card panel mobile-pin-card">
        <div>
          <h1>가계부</h1>
          <p className="muted">사용자 PIN을 입력해주세요.</p>
        </div>

        <div className="mobile-pin-dots">
          {Array.from({ length: PIN_LENGTH }).map((_, index) => (
            <span
              key={index}
              className={`mobile-pin-dot ${
                pin.length > index ? 'filled' : ''
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="danger-text">
            {error}
          </p>
        )}

        <div className="mobile-pin-keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
            <button
              key={number}
              type="button"
              className="mobile-pin-key"
              onClick={() => handlePress(String(number))}
              disabled={isUnlocking}
            >
              {number}
            </button>
          ))}

          <div />

          <button
            type="button"
            className="mobile-pin-key"
            onClick={() => handlePress('0')}
            disabled={isUnlocking}
          >
            0
          </button>

          <button
            type="button"
            className="mobile-pin-key del-key"
            onClick={() => handlePress('del')}
            disabled={isUnlocking || pin.length === 0}
            aria-label="삭제"
          >
            <div className="del-icon">
              <span className="del-x">×</span>
            </div>
          </button>
        </div>

        {isUnlocking && (
          <p className="muted">확인 중...</p>
        )}
      </div>
    </div>
  );
}

export default UserGate;
