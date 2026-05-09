import { formatAmount } from '../utils';

function AssetOverview({ assets = [] }) {
  const sortedAssets = [...assets].sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
  const totalAsset = sortedAssets.reduce((sum, item) => sum + Number(item.balance || 0), 0);

  return (
    <section className="stack gap-lg">
      <div className="panel toolbar-row">
        <div>
          <h2>내 자산</h2>
          <p className="muted">기초자산 관리에 등록한 은행별 잔액과 총 자산을 확인합니다.</p>
        </div>
      </div>

      <div className="asset-total-card panel">
        <span>총 자산</span>
        <strong>{formatAmount(totalAsset)}원</strong>
        <p className="muted">등록된 자산 {sortedAssets.length}개 기준</p>
      </div>

      {sortedAssets.length === 0 ? (
        <div className="panel empty-state">
          <strong>등록된 자산이 없습니다.</strong>
          <p className="muted">설정/관리 → 기초자산 관리에서 은행별 금액을 먼저 등록해주세요.</p>
        </div>
      ) : (
        <div className="asset-card-grid">
          {sortedAssets.map((asset) => (
            <article key={asset.id} className="asset-card panel">
              <div>
                <span className="asset-type">{asset.asset_type || '기타'}</span>
                <h3>{asset.name}</h3>
              </div>

              <strong>{formatAmount(asset.balance)}원</strong>

              {asset.name === '현금 보관함' ? (
                <p className="muted">
                  미정산 현금: {formatAmount(asset.unsettled_cash || 0)}원
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
