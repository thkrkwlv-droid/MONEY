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
          {sortedAssets.map((asset) => {
            const balance = Number(asset.balance || 0);
          
            const ratio = totalAsset > 0 && balance > 0
              ? Math.round((balance / totalAsset) * 100)
              : 0;
          
            const monthlyChange = Number(asset.monthly_change || 0);
            const previousMonthChange = Number(asset.previous_month_change || 0);
          
            const changePercent = previousMonthChange === 0
              ? null
              : Math.round(((monthlyChange - previousMonthChange) / Math.abs(previousMonthChange)) * 100);
          
            const isCashAsset = asset.name === '현금 보관함';
          
            return (
              <div
                key={asset.id}
                className={`asset-card panel ${isCashAsset ? 'cash-asset-card' : ''}`}
              >
                <div>
                  <strong>
                    {asset.name}
                    {isCashAsset && <span className="cash-badge">현금</span>}
                  </strong>
                  <p className="muted">{asset.asset_type}</p>
                </div>
          
                <b>{formatAmount(balance)}원</b>
          
                <p className="asset-ratio">
                  전체 자산의 {ratio}%
                </p>
          
                {isCashAsset ? (
                  <p className="unsettled-cash">
                    미정산 잔액: {formatAmount(asset.unsettled_cash || 0)}원
                  </p>
                ) : (
                  <div className="asset-card-subline">
                    {monthlyChange !== 0 && (
                      <span className={monthlyChange > 0 ? 'positive-text' : 'danger-text'}>
                        {monthlyChange > 0 ? '▲ +' : '▼ '}
                        {formatAmount(monthlyChange)}원
                        {changePercent !== null && (
                          <>
                            {' '}
                            ({changePercent > 0 ? '+' : ''}
                            {changePercent}%)
                          </>
                        )}
                      </span>
                    )}
          
                    {asset.memo && (
                      <span className="muted">
                        {asset.memo}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default AssetOverview;
