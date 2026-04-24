# 개인용 웹 가계부 서비스

Supabase(PostgreSQL) + Node.js/Express + React(Vite) 기반으로 만든 **실제 배포 가능한 풀스택 웹 가계부 프로젝트**입니다.
단순 더미 UI가 아니라 **모든 데이터가 DB에 저장**되고, 새로고침 후에도 데이터가 유지되며, **반복 입력 / 고정지출 자동 반영 / 예산 관리 / 백업/복원 / 잠금 기능 / 다크모드**까지 포함되어 있습니다.

---

## 1. 프로젝트 핵심 요약

- **프론트엔드**: React + Vite
- **백엔드**: Node.js + Express REST API
- **DB**: Supabase PostgreSQL
- **배포**: Render 배포 구조 포함 (`render.yaml` 포함)
- **데이터 저장 방식**: PostgreSQL만 사용, `localStorage`에 가계부 데이터 저장하지 않음
- **자동화 기능**:
  - 반복 입력 (매일 / 매주 / 매월)
  - 고정지출 자동 반영
  - 서버 기준 날짜 사용
  - 누락된 과거 일정 자동 생성
  - 중복 생성 방지

---

## 2. 폴더 구조

```bash
expense-tracker-app/
├── frontend/                     # React 프론트엔드
│   ├── src/
│   │   ├── components/
│   │   │   ├── CalendarView.jsx
│   │   │   ├── DashboardPanel.jsx
│   │   │   ├── ManagementPanel.jsx
│   │   │   ├── PinLock.jsx
│   │   │   ├── QuickEntryForm.jsx
│   │   │   └── TransactionTable.jsx
│   │   ├── api.js               # 백엔드 API 통신 함수
│   │   ├── App.jsx              # 메인 앱
│   │   ├── App.css              # 전체 UI 스타일
│   │   ├── index.css
│   │   ├── main.jsx
│   │   └── utils.js             # 금액/날짜 포맷 유틸
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # Express 백엔드
│   ├── src/
│   │   ├── services/
│   │   │   ├── automation.js    # 반복/고정지출 자동 생성 로직
│   │   │   └── schedule.js      # 다음 실행일 계산 로직
│   │   ├── config.js
│   │   ├── db.js
│   │   ├── initDatabase.js      # 서버 시작 시 스키마 보장
│   │   ├── schema.sql           # 실제 DB 스키마
│   │   └── validators.js        # zod 입력 검증
│   ├── sql/
│   │   └── supabase-schema.sql  # Supabase SQL Editor용 스키마
│   ├── .env.example
│   ├── index.js                 # Express 서버 진입점
│   └── package.json
│
├── render.yaml                  # Render 배포 설정
├── .env.example                 # 루트 환경변수 예시
├── .gitignore
├── package.json                 # 루트 개발 스크립트
└── README.md
```

---

## 3. 구현된 기능 목록

### 3-1. 가계부 입력

입력 필드:
- 날짜 (기본값 오늘)
- 수입 / 지출 (기본값 지출)
- 금액
- 카테고리
- 메모(선택)
- 결제수단

UX:
- 메모 없이 저장 가능
- 카테고리 + 금액만으로 저장 가능
- 금액 입력 시 숫자만 허용
- 입력 즉시 천 단위 콤마 적용
- DB에는 숫자 타입으로 저장
- 저장 후 금액/메모 초기화
- 최근 카테고리 유지
- 즐겨찾기 템플릿 불러오기 지원
- 자동완성 추천 지원

### 3-2. 내역 관리

- 내역 리스트 조회
- 키워드 검색 (메모 포함)
- 날짜 필터
- 카테고리 필터
- 수입/지출 필터
- 수정 기능
- 삭제 기능

### 3-3. 카테고리 시스템

기본 카테고리 포함:
- 식비
- 교통
- 주거
- 쇼핑
- 취미
- 고정지출
- 적금
- 주식 투자
- 주식 실현손익
- 수입

추가 동작:
- 사용자 카테고리 추가
- 수정
- 삭제
- 삭제 시 연결 데이터는 `미분류`로 이동

### 3-4. 즐겨찾기 기능

- 자주 쓰는 입력 조합 저장
- 클릭 한 번으로 폼에 채우기
- 추가 / 수정 / 삭제 가능

### 3-5. 최근 입력 자동완성

- 최근 메모 자동완성
- 최근 결제수단 자동완성
- 메모 기반 추천 카테고리 지원
- 최근 카테고리 칩 제공

### 3-6. 반복 입력 기능

- 매일 / 매주 / 매월 반복 입력 지원
- 주기 간격 설정 가능
- 시작일 기반 자동 등록
- 중복 생성 방지

### 3-7. 고정지출 자동 반영 (핵심 기능)

예시:
- 월세 / 500,000원 / 고정지출 / 매월 25일

동작 방식:
- 서버 기준 날짜 사용
- 매달 도래한 날짜에 거래 자동 생성
- Render 서버가 꺼졌다 켜져도 누락분을 다시 생성
- 동일 날짜 동일 원본 일정은 중복 생성되지 않음

### 3-8. 대시보드 / 분석

- 이번 달 수입
- 이번 달 지출
- 현재 잔액
- 카테고리별 요약
- 월별 비교
- 잔액 흐름 그래프
- 결제수단별 통계
- 예산 대비 초과 여부
- 캘린더 뷰

### 3-9. 추가 기능

- 백업(JSON 다운로드)
- 복원(JSON 업로드)
- 예산 설정
- 초과 표시
- 다크모드
- PIN 잠금 기능

---

## 4. DB 설계

### 기본 포함 테이블

요구사항에 맞춰 아래 5개 핵심 테이블을 포함합니다.

1. `transactions`
2. `categories`
3. `favorites`
4. `recurring_transactions`
5. `fixed_expenses`

### 추가 테이블

기능 완성을 위해 아래 테이블도 추가했습니다.

6. `budgets`
7. `app_settings`

### 관계 요약

- `transactions.category_id -> categories.id`
- `favorites.category_id -> categories.id`
- `recurring_transactions.category_id -> categories.id`
- `fixed_expenses.category_id -> categories.id`
- `budgets.category_id -> categories.id`

### 자동 생성 중복 방지 방식

`transactions` 테이블에는 다음 조합에 대한 고유 제약이 있습니다.

```sql
unique (source_type, source_id, transaction_date)
```

즉,
- 같은 반복 입력 원본
- 같은 고정지출 원본
- 같은 날짜

조합은 **한 번만 생성**됩니다.

---

## 5. Supabase 연결 방법

### 방법 A. 서버가 자동으로 스키마 생성하도록 사용하기 (권장)

이 프로젝트는 백엔드가 시작될 때 `backend/src/schema.sql`을 읽어 **테이블이 없으면 자동 생성**합니다.
즉, Supabase에서 DB만 만들고 `DATABASE_URL`만 정확히 넣으면 기본적으로 동작합니다.

### 방법 B. Supabase SQL Editor에 직접 스키마 적용하기

1. Supabase 프로젝트 생성
2. 좌측 메뉴에서 **SQL Editor** 열기
3. `backend/sql/supabase-schema.sql` 파일 내용을 그대로 붙여넣기
4. 실행

---

## 6. Supabase DATABASE_URL 구하기

Supabase 프로젝트에서 다음 정보를 확인해서 PostgreSQL 연결 문자열을 구성합니다.

예시:

```env
DATABASE_URL=postgresql://postgres:[비밀번호]@db.[프로젝트ID].supabase.co:5432/postgres
```

> 주의: 실제 비밀번호와 프로젝트 ID로 바꿔야 합니다.

---

## 7. 로컬 실행 방법

### 7-1. 루트 설치

```bash
npm install
```

### 7-2. 백엔드 설치

```bash
cd backend
npm install
```

### 7-3. 프론트엔드 설치

```bash
cd frontend
npm install
```

### 7-4. 환경 변수 파일 생성

#### 루트 참고용

```bash
cp .env.example .env
```

#### 백엔드

```bash
cd backend
cp .env.example .env
```

`backend/.env` 예시:

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-SUPABASE-PROJECT].supabase.co:5432/postgres
PORT=4000
FRONTEND_URL=http://localhost:5173
AUTOMATION_SECRET=
```

#### 프론트엔드

```bash
cd frontend
cp .env.example .env
```

`frontend/.env` 예시:

```env
VITE_API_URL=http://localhost:4000
```

### 7-5. 실행

루트에서 동시 실행:

```bash
npm run dev
```

또는 각각 실행:

#### 백엔드

```bash
cd backend
npm run dev
```

#### 프론트엔드

```bash
cd frontend
npm run dev
```

### 접속 주소

- 프론트엔드: `http://localhost:5173`
- 백엔드: `http://localhost:4000`
- 헬스체크: `http://localhost:4000/api/health`

---

## 8. 배포 방법 (Render)

### 권장 구조

- **백엔드**: Render Web Service
- **프론트엔드**: Render Static Site
- **DB**: Supabase PostgreSQL

### 이미 포함된 파일

- `render.yaml`

즉, GitHub에 업로드 후 Render에서 Blueprint 또는 서비스 생성 시 이 파일을 활용할 수 있습니다.

### Render 배포 순서

1. 이 프로젝트를 GitHub에 업로드
2. Render에서 새 Blueprint 또는 새 서비스 생성
3. 루트의 `render.yaml` 사용
4. 백엔드 환경변수에 `DATABASE_URL` 설정
5. 백엔드 서비스 URL을 프론트엔드 `VITE_API_URL`에 연결
6. 배포 완료

### render.yaml 설명

- `household-ledger-api`: Node 백엔드
- `household-ledger-web`: 정적 React 프론트엔드

---

## 9. API 목록 요약

### 거래 내역

- `GET /api/transactions`
- `POST /api/transactions`
- `PUT /api/transactions/:id`
- `DELETE /api/transactions/:id`
- `GET /api/transactions/autocomplete`

### 카테고리

- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`

### 즐겨찾기

- `GET /api/favorites`
- `POST /api/favorites`
- `PUT /api/favorites/:id`
- `DELETE /api/favorites/:id`

### 반복 입력

- `GET /api/recurring-transactions`
- `POST /api/recurring-transactions`
- `PUT /api/recurring-transactions/:id`
- `DELETE /api/recurring-transactions/:id`

### 고정지출

- `GET /api/fixed-expenses`
- `POST /api/fixed-expenses`
- `PUT /api/fixed-expenses/:id`
- `DELETE /api/fixed-expenses/:id`

### 예산

- `GET /api/budgets`
- `POST /api/budgets`
- `PUT /api/budgets/:id`
- `DELETE /api/budgets/:id`

### 대시보드 / 시스템

- `GET /api/bootstrap`
- `GET /api/dashboard`
- `GET /api/settings`
- `PUT /api/settings/theme`
- `PUT /api/settings/pin`
- `POST /api/settings/unlock`
- `GET /api/system/backup`
- `POST /api/system/restore`
- `POST /api/system/run-automation`

---

## 10. 자동화 로직 설명

### 반복 입력

반복 입력은 `next_run_date` 기준으로 처리됩니다.

- 일정 생성 시 시작일을 기준으로 첫 실행일 계산
- 서버 시작 시 자동 점검
- 이후 매 시간 스케줄 점검
- 대시보드/부트스트랩 조회 시에도 자동 점검
- `next_run_date <= 오늘`인 경우 필요한 횟수만큼 생성
- 생성 후 다음 실행일 갱신

### 고정지출

고정지출도 동일한 방식으로 `next_run_date`를 사용합니다.

예:
- `월세 / 매월 25일`
- 시작일 이후 가장 가까운 25일이 `next_run_date`
- 25일이 지나면 자동 생성 후 다음 달 25일로 이동
- 서비스가 멈췄다가 다시 켜져도 누락분 보정

---

## 11. 프론트엔드 UX 포인트

- 모바일 최적화 반응형 레이아웃
- 탭 기반 구조로 복잡도 감소
- 빠른 입력 중심
- 최근 카테고리 유지
- 즐겨찾기 즉시 불러오기
- 캘린더 뷰 제공
- 다크모드 지원

---

## 12. 테스트/검증 상태

이 프로젝트는 작업 중 아래 항목을 확인했습니다.

### 프론트엔드 빌드 확인

```bash
cd frontend
npm run build
```

빌드 성공.

### 백엔드 문법 및 헬스체크 확인

```bash
cd backend
node --check index.js
node index.js
curl http://localhost:4000/api/health
```

헬스체크 응답 확인.

> 참고: 실제 CRUD 및 DB 기능은 Supabase `DATABASE_URL`이 설정된 상태에서 동작합니다.

---

## 13. 초보자를 위한 실행 순서 한 번 더 정리

1. Supabase 프로젝트 생성
2. DB 비밀번호 확인
3. `backend/.env`에 `DATABASE_URL` 입력
4. `frontend/.env`에 `VITE_API_URL=http://localhost:4000` 입력
5. 루트에서 `npm run dev`
6. 브라우저에서 `http://localhost:5173` 열기
7. 거래 입력 후 새로고침해서 유지되는지 확인

---

## 14. GitHub 업로드 방법

```bash
git init
git add .
git commit -m "feat: household ledger fullstack app"
git branch -M main
git remote add origin [YOUR_GITHUB_REPO_URL]
git push -u origin main
```

---

## 15. 향후 확장 아이디어

현재 요구사항 범위 밖이라 제외했지만, 나중에 쉽게 확장할 수 있습니다.

- 사용자 인증 추가
- 다중 사용자/가구 공유 기능
- CSV 내보내기
- 월간 리포트 PDF 생성
- 카테고리별 상세 추세 분석
- 푸시/이메일 알림

---

## 16. 마무리

이 프로젝트는 다음 요구사항을 모두 충족하도록 설계했습니다.

- GitHub 업로드 가능한 구조
- `/frontend`, `/backend` 분리
- React + Express 풀스택
- Supabase DB 저장
- Render 배포 구조
- 자동 고정지출 반영
- 실제 CRUD API
- 대시보드 / 검색 / 필터 / 월별 비교 / 캘린더 / 백업 / 예산 / 잠금 기능

필요하면 다음 단계로 이어서 도와드릴 수 있습니다.

1. Render 배포용 추가 최적화
2. Supabase 인증(login)까지 확장
3. PWA(앱처럼 설치 가능한 웹앱)로 업그레이드
4. CSV/엑셀 업로드 기능 추가
