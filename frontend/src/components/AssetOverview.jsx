import { formatAmount } from '../utils';

function AssetOverview({ assets = [], settings = {} }) {
  const sortedAssets = [...assets].sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
  const totalAsset = sortedAssets.reduce((sum, item) => sum + Number(item.balance || 0), 0);

  const targetAssetAmount = Number(settings?.target_asset_amount || 0);
  const targetProgress = targetAssetAmount > 0
    ? Math.min(100, Math.round((totalAsset / targetAssetAmount) * 100))
    : 0;

  return (
    <section className="stack gap-lg">
      <div className="panel toolbar-row">
        <div>
          <h2>내 자산</h2>
          <p className="muted">기초자산 관리에 등록한 은행별 잔액과 총 자산을 확인합니다.</p>
        </div>
      </div>

      <div className="asset-total-card panel accent-gradient">
        <span>총 자산</span>
        <strong>{formatAmount(totalAsset)}원</strong>
        <p className="muted">등록된 자산 {sortedAssets.length}개 기준</p>
      </div>

      {targetAssetAmount > 0 && (
        <div className="asset-target-card panel">
          <div>
            <span>목표 자산</span>
            <strong>{formatAmount(targetAssetAmount)}원</strong>
            <p className="muted">
              현재 {formatAmount(totalAsset)}원 · 진행률 {targetProgress}%
            </p>
          </div>
      
          <div className="asset-target-track">
            <div
              className="asset-target-fill"
              style={{ width: `${targetProgress}%` }}
            />
          </div>
        </div>
      )}

      {sortedAssets.length === 0 ? (
        <div className="panel empty-state">
          <strong>등록된 자산이 없습니다.</strong>
          <p className="muted">설정/관리 → 기초자산 관리에서 은행별 금액을 먼저 등록해주세요.</p>
        </div>
      ) : (
        <div className="asset-card-grid">
          {sortedAssets.map((asset) => (
            <article
              key={asset.id}
              className={`asset-card panel ${
                asset.name === '현금 보관함'
                  ? 'cash-asset-card'
                  : ''
              }`}
            >
              <div>
                <span className="asset-type">{asset.asset_type || '기타'}</span>
                <h3>
                  {asset.name}
                
                  {asset.name === '현금 보관함' && (
                    <span className="cash-badge">
                      현금
                    </span>
                  )}
                </h3>
              </div>

              <strong>{formatAmount(asset.balance)}원</strong>

              <p className="asset-ratio">
                전체 자산의{' '}
                {totalAsset > 0
                  ? Math.round((Number(asset.balance || 0) / totalAsset) * 100)
                  : 0}
                %
              </p>

              {Number(asset.monthly_change || 0) !== 0 && (
                <p
                  className={
                    Number(asset.monthly_change || 0) > 0
                      ? 'positive-text asset-change-text'
                      : 'danger-text asset-change-text'
                  }
                >
                  {Number(asset.monthly_change || 0) > 0 ? '▲' : '▼'}{' '}
                  {Number(asset.monthly_change || 0) > 0 ? '+' : ''}
                  {formatAmount(asset.monthly_change)}원
                </p>
              )}

              {asset.name === '현금 보관함' ? (
                <p
                  className={`muted unsettled-cash ${
                    Number(asset.unsettled_cash || 0) > 0
                      ? 'danger-text'
                      : ''
                  }`}
                >
                  미정산 현금:
                  {' '}
                  {formatAmount(asset.unsettled_cash || 0)}원
                </p>
              ) : (
                asset.memo && <p className="muted">{asset.memo}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default AssetOverview;
