import { useState } from 'react';

function UserGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedPin = String(pin || '').trim();

    if (!/^\d{1,8}$/.test(normalizedPin)) {
      setError('PIN은 1~8자리 숫자로 입력해주세요.');
      return;
    }

    setIsUnlocking(true);
    setError('');

    try {
      await onUnlock(normalizedPin);
      setPin('');
    } catch (err) {
      setError(err.message || 'PIN이 올바르지 않습니다.');
    } finally {
      setIsUnlocking(false);
    }
  }

  return (
    <div className="pin-lock-screen">
      <form className="pin-lock-card panel" onSubmit={handleSubmit}>
        <div>
          <h1>MONEY</h1>
          <p className="muted">사용자 PIN을 입력해주세요.</p>
        </div>

        <label>
          <span>PIN</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(event) => {
              setPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 8));
              setError('');
            }}
            placeholder="1~8자리 숫자"
            autoFocus
          />
        </label>

        {error && (
          <p className="danger-text">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="primary-button"
          disabled={isUnlocking}
        >
          {isUnlocking ? '확인 중...' : '들어가기'}
        </button>
      </form>
    </div>
  );
}

export default UserGate;
