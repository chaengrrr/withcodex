# 아르바이트 근무 및 수입 관리 앱

React 기반 개인용 근무 기록/정산 앱입니다.

## 실행

```bash
npm install
npm run dev
```

## 현재 구현

- 날짜, 시작/종료 시간, 시급, 세율, 메모 입력
- 총 근무 시간, 세전 급여, 세후 급여 자동 계산
- 주간/월간 정산 요약
- 날짜 기반 조회
- 개인 간 금전 거래 기록 및 미상환 요약
- Notion Database 속성 설계 표시
- Notion 동기화 호출 경계

## Notion 연동

브라우저에 Notion 토큰을 넣지 않기 위해 `local-api/notion-work-log-server.mjs`를 별도 로컬 API로 실행하는 구조를 사용합니다.

필요 패키지:

```bash
npm install express cors dotenv @notionhq/client
node local-api/notion-work-log-server.mjs
```

필요 환경 변수:

```env
NOTION_API_KEY=secret_xxx
NOTION_WORK_LOG_DATA_SOURCE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Notion 통합에는 대상 Database 또는 Data Source에 대한 쓰기 권한과 페이지 공유가 필요합니다.
