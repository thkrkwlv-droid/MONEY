import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { PAYMENT_METHODS, formatAmount, formatDateKo } from '../utils';

function escapeCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function downloadExcel(filename, rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  worksheet['!cols'] = [
    { wch: 18 }, // 날짜
    { wch: 14 }, // 유형
    { wch: 18 }, // 금액
    { wch: 16 }, // 카테고리
    { wch: 16 }, // 결제수단
    { wch: 16 }, // 자산
    { wch: 18 }, // 입금자산
    { wch: 55 }, // 메모
    { wch: 28 }, // 중복허용
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, '거래내역');
  XLSX.writeFile(workbook, filename);
}

function normalizeExcelDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');

      return `${parsed.y}-${month}-${day}`;
    }
  }

  const text = String(value || '')
    .replace('예시:', '')
    .trim();

  // 20260501 → 2026-05-01 변환
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  return text;
}

function isValidDateText(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text);
}

function normalizeExcelAmount(value) {
  const text = String(value || '')
    .replace('예시:', '')
    .replace(/원/g, '')
    .replace(/₩/g, '')
    .replace(/,/g, '')
    .trim();

  return Number(text);
}

function normalizeTransactionType(value) {
  const text = String(value || '')
    .replace('예시:', '')
    .trim()
    .toLowerCase();

  if (['수입', '입금', 'income', 'in', '입'].includes(text)) {
    return 'income';
  }

  if (['자산이동', '이체', 'transfer', 'move', '이동'].includes(text)) {
    return 'transfer';
  }

  return 'expense';
}

function isExampleExcelRow(row) {
  return Object.values(row || {}).some((value) =>
    String(value || '').trim().startsWith('예시:')
  );
}

function isEmptyExcelRow(row) {
  return ['날짜', '유형', '금액', '카테고리', '결제수단', '자산', '입금자산', '메모', '중복허용']
    .every((key) => String(row?.[key] ?? '').trim() === '');
}

function normalizeTransactionNote(value) {
  return String(value || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePaymentMethod(value, type) {
  if (type === 'transfer') return '';

  const text = String(value || '')
    .replace('예시:', '')
    .replace(/\s+/g, '')
    .trim();

  return text || '현금';
}

function normalizeLookupName(value) {
  return String(value || '')
    .replace('예시:', '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

function getTransactionUploadRowErrors({
  type,
  transactionDate,
  amount,
  lookupValues,
  matchedIds,
}) {
  const rowErrors = [];

  if (!isValidDateText(transactionDate)) rowErrors.push('날짜');
  if (!Number.isFinite(amount) || amount <= 0) rowErrors.push('금액');
  if (type !== 'transfer' && lookupValues.categoryName && !matchedIds.categoryId) rowErrors.push('카테고리');
  if (lookupValues.assetName && !matchedIds.assetId) rowErrors.push('자산');
  if (type === 'transfer' && (!matchedIds.assetId || !matchedIds.toAssetId)) rowErrors.push('자산이동 자산');

  return rowErrors;
}

function makeTransactionDuplicateKey(transaction) {
  return [
    transaction.transaction_date,
    transaction.type,
    Number(transaction.amount || 0),
    transaction.category_id || '',
    transaction.asset_account_id || '',
    transaction.to_asset_account_id || '',
    normalizeTransactionNote(transaction.note),
    normalizePaymentMethod(transaction.payment_method, transaction.type),
  ].join('|');
}

function isDuplicateTransactionUploadRow({
  allowDuplicate,
  duplicateKey,
  existingTransactionKeys,
  seenExcelKeys,
}) {
  if (allowDuplicate) return false;

  return existingTransactionKeys.has(duplicateKey) || seenExcelKeys.has(duplicateKey);
}

function downloadTransactionTemplate() {
  const rows = [
    {
      날짜: '예시: 2026-05-01 또는 20260501',
      유형: '예시: 지출',
      금액: '예시: 15000 또는 15,000',
      카테고리: '예시: 식비',
      결제수단: '예시: 현금',
      자산: '예시: 현금',
      입금자산: '자산이동일 때만 입력',
      메모: '예시 행은 업로드 시 제외됩니다. 실제 데이터는 3행부터 입력하세요.',
      중복허용: '중복 허용 시 1 입력, 기본은 공란',
    },
  ];

  downloadExcel('MONEY_거래내역_업로드_양식.xlsx', rows);
}

function TransactionCard({ transaction, onEdit, onDelete }) {
  return (
    <article className="transaction-card">
      <div className="transaction-main">
        <div>
          <div className="transaction-meta">
            <span
              className={`badge ${
                transaction.type === 'income'
                  ? 'positive'
                  : transaction.type === 'transfer'
                    ? 'neutral'
                    : 'danger'
              }`}
            >
              {transaction.type === 'transfer'
                ? '자산이동'
                : transaction.type === 'income'
                  ? '수입'
                  : '지출'}
            </span>

            {transaction.type === 'transfer' ? (
              <span className="transfer-route">
                {transaction.asset_account_name || '출금 자산'} → {transaction.transfer_to_asset_account_name || '입금 자산'}
              </span>
            ) : (
              <>
                <span>{transaction.category_name || '미분류'}</span>
                <span>{transaction.payment_method}</span>
                <span>{transaction.asset_account_name || '\u00A0'}</span>
              </>
            )}

            {transaction.auto_generated && <span className="badge">자동 생성</span>}
          </div>

          <strong>{transaction.note || '메모 없음'}</strong>
          <p className="muted">{formatDateKo(transaction.transaction_date)}</p>
        </div>

        <strong
          className={
            transaction.type === 'income'
              ? 'positive-text'
              : transaction.type === 'transfer'
                ? ''
                : 'danger-text'
          }
        >
          {transaction.type === 'income' ? '+' : transaction.type === 'transfer' ? '' : '-'}
          {formatAmount(transaction.amount)}원{transaction.type === 'transfer' ? ' 이동' : ''}
        </strong>
      </div>

      <div className="transaction-actions">
        <button type="button" className="secondary-button" onClick={() => onEdit(transaction)}>
          수정
        </button>
        <button type="button" className="ghost-button" onClick={() => onDelete(transaction.id)}>
          삭제
        </button>
      </div>
    </article>
  );
}

function TransactionTable({
  transactions,
  categories,
  assets,
  filters,
  setFilters,
  onEdit,
  onDelete,
  showTransfers,
  setShowTransfers,
  onImportTransactionsExcel,
  onMoveToMonth,
}) {
  const [page, setPage] = useState(1);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [excelImportStatus, setExcelImportStatus] = useState('');
  const [uploadPreview, setUploadPreview] = useState(null);
  const [excelImportProgress, setExcelImportProgress] = useState(0);
  const transactionExcelInputRef = useRef(null);
  function clearUploadPreview() {
    setUploadPreview(null);
    setExcelImportStatus('');
    setExcelImportProgress(0);
    resetTransactionExcelInput();
  }
  
  function resetTransactionExcelInput() {
    if (transactionExcelInputRef.current) {
      transactionExcelInputRef.current.value = '';
      transactionExcelInputRef.current.blur();
    }
  }
  const pageSize = 7;

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (filters.type && transaction.type !== filters.type) return false;
      if (filters.categoryId && transaction.category_id !== filters.categoryId) return false;
      if (filters.paymentMethod && transaction.payment_method !== filters.paymentMethod) return false;

      if (filters.search) {
        const keyword = filters.search.toLowerCase();
        const searchable = `${transaction.note || ''} ${transaction.category_name || ''} ${transaction.payment_method || ''}`.toLowerCase();

        if (!searchable.includes(keyword)) return false;
      }

      if (filters.startDate && transaction.transaction_date < filters.startDate) return false;
      if (filters.endDate && transaction.transaction_date > filters.endDate) return false;

      return true;
    });
  }, [transactions, filters]);

  const filteredExpenseTransactions = filteredTransactions.filter((transaction) => transaction.type === 'expense');
  const filteredIncomeTransactions = filteredTransactions.filter((transaction) => transaction.type === 'income');
  const filteredTransferTransactions = filteredTransactions.filter((transaction) => transaction.type === 'transfer');

  const expenseTotalPages = Math.max(1, Math.ceil(filteredExpenseTransactions.length / pageSize));
  const incomeTotalPages = Math.max(1, Math.ceil(filteredIncomeTransactions.length / pageSize));
  const transferTotalPages = Math.max(1, Math.ceil(filteredTransferTransactions.length / pageSize));

  const totalPages = Math.max(
    expenseTotalPages,
    incomeTotalPages,
    showTransfers ? transferTotalPages : 1
  );

  const safePage = Math.min(page, totalPages);

  const expenseTransactions = filteredExpenseTransactions.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const incomeTransactions = filteredIncomeTransactions.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const transferTransactions = filteredTransferTransactions.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

    function handleExportCsv() {
      const rows = [
        ['날짜', '유형', '금액', '카테고리', '결제수단', '자산', '입금자산', '메모', '자동생성', '중복허용'],
        ...filteredTransactions.map((transaction) => [
          transaction.transaction_date,
          transaction.type === 'income'
            ? '수입'
            : transaction.type === 'transfer'
              ? '자산이동'
              : '지출',
          transaction.amount,
          transaction.category_name || '',
          transaction.payment_method || '',
          transaction.asset_account_name || '',
          transaction.transfer_to_asset_account_name || '',
          transaction.note || '',
          transaction.auto_generated ? 'Y' : 'N',
          '',
        ]),
      ];
  
      downloadCsv(`money-transactions-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    }

  function handleExportExcel() {
    const rows = filteredTransactions.map((transaction) => ({
      날짜: transaction.transaction_date,
      유형:
        transaction.type === 'income'
          ? '수입'
          : transaction.type === 'transfer'
            ? '자산이동'
            : '지출',
      금액: Number(transaction.amount || 0),
      카테고리: transaction.category_name || '',
      결제수단: transaction.payment_method || '',
      자산: transaction.asset_account_name || '',
      입금자산: transaction.transfer_to_asset_account_name || '',
      메모: transaction.note || '',
      자동생성: transaction.auto_generated ? 'Y' : 'N',
      중복허용: '',
    }));

    downloadExcel(`money-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`, rows);
  }

  async function handleConfirmUploadPreview() {
    if (!uploadPreview?.transactionsToImport?.length) return;

    const { transactionsToImport, summary } = uploadPreview;

    try {
      setIsImportingExcel(true);
      setExcelImportStatus(`${transactionsToImport.length}건 업로드 중...`);
      setExcelImportProgress(80);

      await onImportTransactionsExcel(transactionsToImport, {
        totalRows: summary.totalRows,
        importedRows: summary.importedRows,
        excludedRows: summary.excludedRows,
        transferRows: summary.transferRows,
      });

      setExcelImportStatus('업로드가 완료되었습니다.');
      setExcelImportProgress(100);

      setPage(1);
      setFilters({
        search: '',
        type: '',
        categoryId: '',
        paymentMethod: '',
        startDate: '',
        endDate: '',
      });

      if (transactionsToImport.some((transaction) => transaction.type === 'transfer')) {
        setShowTransfers(true);
      }

      const latestTransactionDate = transactionsToImport
        .map((transaction) => transaction.transaction_date)
        .sort()
        .at(-1);

      if (latestTransactionDate && onMoveToMonth) {
        const latestMonth = latestTransactionDate.slice(0, 7);
        onMoveToMonth(latestMonth);
        setExcelImportStatus(`${latestMonth} 월로 이동했습니다.`);
      }

      setUploadPreview(null);
    } catch (err) {
      setExcelImportStatus('');
      setExcelImportProgress(0);
      throw err;
    } finally {
      setIsImportingExcel(false);
      resetTransactionExcelInput();

      setTimeout(() => {
        setExcelImportStatus('');
        setExcelImportProgress(0);
      }, 2000);
    }
  }

  async function handleTransactionExcelFile(event) {
    if (isImportingExcel) return;

    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingExcel(true);
    setExcelImportStatus('엑셀 파일 읽는 중...');
    setExcelImportProgress(10);

    let dataRows = [];

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!sheet) {
        throw new Error('시트를 찾을 수 없습니다.');
      }

      const rows = XLSX.utils.sheet_to_json(sheet);
      setExcelImportProgress(30);

      const requiredColumns = ['날짜', '유형', '금액', '카테고리', '결제수단', '자산', '입금자산', '메모', '중복허용'];
      const firstRow = rows[0] || {};
      const missingColumns = requiredColumns.filter((column) => !(column in firstRow));

      if (missingColumns.length > 0) {
        alert(`거래 업로드 양식이 올바르지 않습니다.\n\n누락된 컬럼: ${missingColumns.join(', ')}`);
        setIsImportingExcel(false);
        setExcelImportStatus('');
        setExcelImportProgress(0);
        resetTransactionExcelInput();
        return;
      }

      dataRows = rows
        .map((row, index) => ({
          raw: row,
          excelRowNumber: index + 2,
        }))
        .filter((item) => !isExampleExcelRow(item.raw))
        .filter((item) => !isEmptyExcelRow(item.raw)); // 예시 행/빈 행 제외

      setExcelImportStatus(`${dataRows.length}건 검증 중...`);
      setExcelImportProgress(60);

      if (dataRows.length > 500) {
        alert('한 번에 최대 500건까지만 업로드할 수 있습니다.');
        setIsImportingExcel(false);
        setExcelImportStatus('');
        setExcelImportProgress(0);
        resetTransactionExcelInput();
        return;
      }
    } catch (err) {
      alert('엑셀 파일을 읽지 못했습니다. 파일 형식이 올바른지 확인해주세요.');
      setIsImportingExcel(false);
      setExcelImportStatus('');
      setExcelImportProgress(0);
      resetTransactionExcelInput();
      return;
    }

    const categoryMap = new Map(
      (categories || []).map((category) => [normalizeLookupName(category.name), category.id])
    );

    const assetMap = new Map(
      (assets || []).map((asset) => [normalizeLookupName(asset.name), asset.id])
    );

    const existingTransactionKeys = new Set(
      (transactions || []).map((transaction) =>
        makeTransactionDuplicateKey({
          transaction_date: transaction.transaction_date,
          type: transaction.type,
          amount: transaction.amount,
          category_id: transaction.category_id,
          asset_account_id: transaction.asset_account_id,
          to_asset_account_id: transaction.transfer_to_asset_account_id,
          note: transaction.note,
          payment_method: transaction.payment_method,
        })
      )
    );

    const seenExcelKeys = new Set();

    const uploadSummary = {
      invalidRows: [],
      duplicatedRows: [],
    };
    const transactionsToImport = dataRows
      .map((item, index) => {
        const row = item.raw;
        const excelRowNumber = item.excelRowNumber || index + 2;
        const type = normalizeTransactionType(row.유형);
        const transactionDate = normalizeExcelDate(row.날짜);
        const amount = normalizeExcelAmount(row.금액);
        const lookupValues = {
          categoryName: normalizeLookupName(row.카테고리),
          assetName: normalizeLookupName(row.자산),
          toAssetName: normalizeLookupName(row.입금자산),
        };

        const matchedIds = {
          categoryId: type === 'transfer' ? null : categoryMap.get(lookupValues.categoryName) || null,
          assetId: assetMap.get(lookupValues.assetName) || null,
          toAssetId: type === 'transfer' ? assetMap.get(lookupValues.toAssetName) || null : null,
        };

        // 행 단위 검증: 날짜, 금액, 카테고리, 자산 연결 상태를 확인합니다.
        const rowErrors = getTransactionUploadRowErrors({
          type,
          transactionDate,
          amount,
          lookupValues,
          matchedIds,
        });
        
        if (rowErrors.length > 0) {
          uploadSummary.invalidRows.push(`${excelRowNumber}행(${rowErrors.join(', ')})`);
          return null;
        }

        // 중복 검증: 중복허용 컬럼이 1이면 같은 거래도 등록할 수 있습니다.
        const allowDuplicate = String(row.중복허용 || '').trim() === '1';

        const nextTransaction = {
          transaction_date: transactionDate,
          type,
          amount,
          category_id: matchedIds.categoryId,
          asset_account_id: matchedIds.assetId,
          from_asset_account_id: matchedIds.assetId,
          to_asset_account_id: matchedIds.toAssetId,
          note: normalizeTransactionNote(row.메모),
          payment_method: normalizePaymentMethod(row.결제수단, type),
          allow_duplicate: allowDuplicate,
        };
        
        const duplicateKey = makeTransactionDuplicateKey(nextTransaction);

        if (
          isDuplicateTransactionUploadRow({
            allowDuplicate,
            duplicateKey,
            existingTransactionKeys,
            seenExcelKeys,
          })
        ) {
          uploadSummary.duplicatedRows.push(`${excelRowNumber}행`);
          return null;
        }

        if (!allowDuplicate) {
          seenExcelKeys.add(duplicateKey);
        }

        return nextTransaction;
      })
      .filter(Boolean);

    if (uploadSummary.invalidRows.length > 0) {
      alert(`일부 행은 오류가 있어 제외했습니다.\n\n${uploadSummary.invalidRows.join('\n')}`);
    }

    if (uploadSummary.duplicatedRows.length > 0) {
      alert(`이미 등록된 거래 또는 엑셀 안에서 중복된 거래는 제외했습니다.\n\n${uploadSummary.duplicatedRows.join('\n')}`);
    }
      
    if (transactionsToImport.length === 0) {
      alert('등록할 수 있는 거래내역이 없습니다. 3행부터 실제 데이터를 입력했는지 확인해주세요.');
      setIsImportingExcel(false);
      setExcelImportStatus('');
      setExcelImportProgress(0);
      resetTransactionExcelInput();
      return;
    }

    const excludedCount = uploadSummary.invalidRows.length + uploadSummary.duplicatedRows.length;
    const targetRowCount = dataRows.length;
    const transferCount = transactionsToImport.filter((transaction) => transaction.type === 'transfer').length;

    setUploadPreview({
      transactionsToImport,
      summary: {
        totalRows: targetRowCount,
        importedRows: transactionsToImport.length,
        excludedRows: excludedCount,
        transferRows: transferCount,
        invalidRows: uploadSummary.invalidRows,
        duplicatedRows: uploadSummary.duplicatedRows,
      },
    });

    setExcelImportStatus(`${transactionsToImport.length}건 등록 준비 완료`);
    setExcelImportProgress(70);
    setIsImportingExcel(false);
  }
  
  return (
    <section className="panel stack gap-lg">
      <div className="section-heading">
        <div>
          <p className="eyebrow">내역 관리</p>
          <h2>검색 · 필터 · 수정 · 삭제</h2>
          <p className="muted">메모 포함 검색, 날짜/카테고리/수입·지출 필터를 지원합니다.</p>
        </div>

        <div className="inline-actions">
          <span className="badge">총 {filteredTransactions.length}건</span>

          <button
            type="button"
            className="secondary-button"
            onClick={handleExportCsv}
            disabled={filteredTransactions.length === 0}
          >
            CSV 내보내기
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={handleExportExcel}
            disabled={filteredTransactions.length === 0}
          >
            엑셀 내보내기
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={downloadTransactionTemplate}
          >
            거래 양식 다운로드
          </button>
          <label className={`secondary-button file-button ${isImportingExcel ? 'disabled' : ''}`}>
            {isImportingExcel ? '업로드 처리 중...' : '거래 엑셀 업로드'}
            <input
              ref={transactionExcelInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleTransactionExcelFile}
              disabled={isImportingExcel}
              hidden
            />
          </label>

          {excelImportStatus && (
            <div className="excel-import-status">
              {excelImportStatus}
            </div>
          )}

          {excelImportProgress > 0 && (
            <div className="excel-import-progress">
              <div
                className="excel-import-progress-bar"
                style={{ width: `${excelImportProgress}%` }}
              />
            </div>
          )}
          
        </div>
      </div>

      {uploadPreview && (
        <div className="panel stack gap-sm upload-preview-panel">
          <div className="section-heading compact">
            <div>
              <h3>거래 엑셀 업로드 미리보기</h3>
              <p className="muted">
                등록 전 내용을 확인하세요. 등록 실행을 눌러야 실제 거래내역에 반영됩니다.
              </p>
            </div>
          </div>

          <div className="list-grid small-cards">
            <div className="mini-card">
              <strong>업로드 대상</strong>
              <p className="muted">{uploadPreview.summary.totalRows}행</p>
            </div>

            <div className="mini-card">
              <strong>등록 예정</strong>
              <p className="muted">{uploadPreview.summary.importedRows}건</p>
            </div>

            <div className="mini-card">
              <strong>제외 예정</strong>
              <p className="muted">{uploadPreview.summary.excludedRows}건</p>
            </div>

            <div className="mini-card">
              <strong>자산이동</strong>
              <p className="muted">{uploadPreview.summary.transferRows || 0}건</p>
            </div>
          </div>

          {uploadPreview.summary.invalidRows.length > 0 && (
            <div className="upload-preview-warning">
              <strong>오류 제외 행</strong>
              <p className="muted">{uploadPreview.summary.invalidRows.join(', ')}</p>
            </div>
          )}

          {uploadPreview.summary.duplicatedRows.length > 0 && (
            <div className="upload-preview-warning">
              <strong>중복 제외 행</strong>
              <p className="muted">{uploadPreview.summary.duplicatedRows.join(', ')}</p>
            </div>
          )}

          <div className="inline-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleConfirmUploadPreview}
              disabled={isImportingExcel}
            >
              등록 실행
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={clearUploadPreview}
              disabled={isImportingExcel}
            >
              취소
            </button>
          </div>
        </div>
      )}      

      <div className="filter-layout">
        <label className="search-filter">
          <span>키워드 검색</span>

          <input
            value={filters.search}
            onChange={(e) => {
              setPage(1);
              setFilters((prev) => ({
                ...prev,
                search: e.target.value,
              }));
            }}
            placeholder="메모, 카테고리, 결제수단 검색"
          />
        </label>

        <div className="filter-grid">
          <label>
            <span>유형</span>

            <select
              value={filters.type}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  type: e.target.value,
                }));
              }}
            >
              <option value="">전체</option>
              <option value="expense">지출</option>
              <option value="income">수입</option>
              <option value="transfer">자산이동</option>
            </select>
          </label>

          <label>
            <span>카테고리</span>

            <select
              value={filters.categoryId}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  categoryId: e.target.value,
                }));
              }}
            >
              <option value="">전체</option>

              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>결제수단</span>

            <select
              value={filters.paymentMethod}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  paymentMethod: e.target.value,
                }));
              }}
            >
              <option value="">전체</option>

              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>시작일</span>

            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  startDate: e.target.value,
                }));
              }}
            />
          </label>

          <label>
            <span>종료일</span>

            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  endDate: e.target.value,
                }));
              }}
            />
          </label>
        </div>
      </div>

      <div className="filter-reset-row">
        <button
          type="button"
          className={`secondary-button ${showTransfers ? 'active-soft' : ''}`}
          onClick={() => {
            setPage(1);
            setShowTransfers((prev) => !prev);
          }}
        >
          자산이동 {showTransfers ? '숨기기' : '보기'}
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setPage(1);
            setFilters({
              search: '',
              type: '',
              categoryId: '',
              paymentMethod: '',
              startDate: '',
              endDate: '',
            });
          }}
        >
          필터 초기화
        </button>
      </div>

      <div className={`transaction-split-grid ${showTransfers ? 'with-transfer' : ''}`}>
        <div className="transaction-column">
          <h3 className="transaction-column-title danger-text">지출</h3>

          {expenseTransactions.length === 0 && (
            <p className="muted">조건에 맞는 지출 내역이 없습니다.</p>
          )}

          <div className="transaction-list">
            {expenseTransactions.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>

        <div className="transaction-column">
          <h3 className="transaction-column-title positive-text">수입</h3>

          {incomeTransactions.length === 0 && (
            <p className="muted">조건에 맞는 수입 내역이 없습니다.</p>
          )}

          <div className="transaction-list">
            {incomeTransactions.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>

        {showTransfers && (
          <div className="transaction-column">
            <h3 className="transaction-column-title">자산이동</h3>

            {transferTransactions.length === 0 && (
              <p className="muted">조건에 맞는 자산이동 내역이 없습니다.</p>
            )}

            <div className="transaction-list">
              {transferTransactions.map((transaction) => (
                <TransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={safePage <= 1}
          >
            이전
          </button>

          <span className="pagination-status">
            {safePage} / {totalPages}
          </span>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={safePage >= totalPages}
          >
            다음
          </button>
        </div>
      )}
    </section>
  );
}

export default TransactionTable;
