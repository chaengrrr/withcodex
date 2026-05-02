import type { WorkLog } from "./types";
import { toDateTime } from "./utils";

export async function syncWorkLogToNotion(workLog: WorkLog) {
  const response = await fetch("/api/notion/work-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...workLog,
      startAt: toDateTime(workLog.date, workLog.startTime),
      endAt: toDateTime(workLog.date, workLog.endTime),
    }),
  });

  if (!response.ok) {
    throw new Error("Notion 동기화에 실패했습니다. 로컬 API 서버 설정을 확인하세요.");
  }

  return response.json() as Promise<{ notionPageId: string }>;
}

export const notionDatabaseDesign = [
  ["이름", "Title", "예: 2026-05-03 아르바이트"],
  ["날짜", "Date", "근무일"],
  ["근무 시작", "Date", "시작 일시"],
  ["근무 종료", "Date", "종료 일시"],
  ["근무 시간", "Number", "시간 단위"],
  ["시급", "Number", "원 단위"],
  ["세율", "Number", "퍼센트"],
  ["세전 급여", "Number", "자동 계산값"],
  ["세후 급여", "Number", "자동 계산값"],
  ["메모", "Rich text", "자유 입력"],
  ["정산 주차", "Rich text", "예: 2026-W18"],
  ["정산 월", "Rich text", "예: 2026-05"],
  ["동기화 ID", "Rich text", "앱 내부 ID"],
];
