# 아르바이트 근무 및 수입 관리 앱

React 기반 개인용 근무 기록, 급여 계산, 정산 관리 앱입니다.

## 실행

```bash
npm install
npm run dev
```

앱 주소:

```txt
http://127.0.0.1:5173
```

## 현재 구현

- 날짜, 시작/종료 시간, 시급, 세율, 메모 입력
- 5분 단위 근무 시간 입력
- 총 근무 시간, 세전 급여, 세후 급여 자동 계산
- 주간/월간 정산 요약
- 날짜 기반 조회
- 개인 간 금전 거래 기록 및 미상환 요약
- PWA 앱 설치 지원
- Notion Database 동기화 준비

## Notion 연동 준비

브라우저에 Notion 토큰을 넣지 않기 위해 로컬 API 서버를 따로 실행합니다.

### 1. Notion에서 Integration 만들기

1. Notion Developers에서 새 Integration을 만듭니다.
2. Internal Integration Secret을 복사합니다.
3. 근무 기록 Database를 만들고 Integration에 공유합니다.

### 2. Notion Database 속성 만들기

근무 기록 Database에 아래 속성을 만들어야 합니다.

| 속성명 | 타입 |
| --- | --- |
| 이름 | Title |
| 날짜 | Date |
| 근무 시작 | Date |
| 근무 종료 | Date |
| 근무 시간 | Number |
| 시급 | Number |
| 세율 | Number |
| 세전 급여 | Number |
| 세후 급여 | Number |
| 메모 | Rich text |
| 정산 주차 | Rich text |
| 정산 월 | Rich text |
| 동기화 ID | Rich text |

### 3. 환경 변수 만들기

`.env.example`을 참고해서 `.env` 파일을 만듭니다.

```env
NOTION_API_KEY=secret_xxx
NOTION_WORK_LOG_DATA_SOURCE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_LOCAL_API_PORT=8787
```

### 4. 로컬 API 서버 실행

별도 PowerShell 창에서:

```bash
npm run notion:dev
```

### 5. React 앱 실행

다른 PowerShell 창에서:

```bash
npm run dev
```

앱에서 근무 기록을 저장한 뒤 해당 기록의 `Notion` 버튼을 누르면 Notion Database에 저장됩니다. 이미 동기화된 기록은 같은 Notion 페이지를 업데이트합니다.
