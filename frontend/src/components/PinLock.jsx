import { useState } from 'react';

function PinLock({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onUnlock(pin);
    } catch (err) {
      setError(err.message || '잠금 해제 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lock-screen">
      <form className="lock-card" onSubmit={handleSubmit}>
        <p className="eyebrow">앱 잠금</p>
        <h1>PIN 입력</h1>
        <p className="muted">개인 가계부를 보호하기 위해 설정한 PIN을 입력하세요.</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="4~8자리 숫자"
        />
        {error && <div className="notice-card danger">{error}</div>}
        <button type="submit" className="primary-button" disabled={loading || pin.length < 4}>
          {loading ? '확인 중...' : '잠금 해제'}
        </button>
      </form>
    </div>
  );
}

export default PinLock;
