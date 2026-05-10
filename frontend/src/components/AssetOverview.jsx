import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatAmount } from '../utils';

function AssetOverview({ assets = [], settings = {}, assetSnapshots = [] }) {
  const sortedAssets = [...assets].sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
  const totalAsset = sortedAssets.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  
  const chartData = useMemo(() => (
    [...assetSnapshots]
      .slice(0, 30)
      .reverse()
      .map((snapshot) => ({
        date: String(snapshot.snapshot_date || '').slice(0, 10).slice(5) || '-',
        total: Number(snapshot.total_asset_amount || 0),
      }))
  ), [assetSnapshots]);

    const latestSnapshot = useMemo(
      () => assetSnapshots?.[0] || null,
      [assetSnapshots]
    );
    
    const previousSnapshot = useMemo(
      () => assetSnapshots?.[1] || null,
      [assetSnapshots]
    );
    
    const latestChange = useMemo(() => (
      latestSnapshot && previousSnapshot
        ? Number(latestSnapshot.total_asset_amount || 0) - Number(previousSnapshot.total_asset_amount || 0)
        : 0
    ), [latestSnapshot, previousSnapshot]);

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

      {chartData.length > 0 ? (
        <div className="panel asset-chart-card">
          <div className="section-heading compact">
            <div>
              <h3>자산 히스토리</h3>
              <p className="muted">최근 30개 자산 기록 기준 총자산 흐름입니다.</p>
              {latestSnapshot && (
                <p className="muted">
                  최신 기록:
                  {' '}
                  {String(latestSnapshot.snapshot_date || '').slice(0, 10) || '-'}
                  {' '}
                  ·
                  {' '}
                  {formatAmount(latestSnapshot.total_asset_amount || 0)}원
                </p>
              )}
            </div>
          </div>

          {latestSnapshot && previousSnapshot && (
            <p className={latestChange >= 0 ? 'positive-text' : 'danger-text'}>
              직전 기록 대비:
              {' '}
              {latestChange >= 0 ? '+' : ''}
              {formatAmount(latestChange)}원
            </p>
          )}
      
          <div className="asset-chart-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                  <YAxis
                    width={70}
                    tickFormatter={(value) => {
                      const amount = Number(value || 0);
                  
                      if (amount >= 100000000) {
                        return `${Math.round(amount / 100000000)}억`;
                      }
                  
                      return `${Math.round(amount / 10000)}만`;
                    }}
                  />
                <Tooltip
                  formatter={(value) => [`${formatAmount(Number(value || 0))}원`, '총 자산']}
                  labelFormatter={(label) => `기록일: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  strokeWidth={2}
                  fillOpacity={0.25}
                  isAnimationActive={false}
                /> 
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="panel empty-state">
          <strong>아직 자산 히스토리가 없습니다.</strong>
      
          <p className="muted">
            설정/관리 → 기초자산 관리 → 오늘 자산 기록 저장 버튼으로 자산 흐름 데이터를 만들 수 있습니다.
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const settingsTabButton = document.querySelector('[data-tab="manage"]')
          
              if (settingsTabButton) {
                settingsTabButton.click();
              }
            }}
          >
            설정/관리로 이동
          </button>
        </div>
      )}

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
