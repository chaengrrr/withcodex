import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const dataSourceId = process.env.NOTION_WORK_LOG_DATA_SOURCE_ID;

function requireConfig(response) {
  if (!process.env.NOTION_API_KEY) {
    response.status(500).json({ error: "NOTION_API_KEY is missing" });
    return false;
  }

  if (!dataSourceId) {
    response.status(500).json({ error: "NOTION_WORK_LOG_DATA_SOURCE_ID is missing" });
    return false;
  }

  return true;
}

function workLogProperties(log) {
  return {
    이름: {
      title: [{ text: { content: `${log.date} 아르바이트` } }],
    },
    날짜: { date: { start: log.date } },
    "근무 시작": { date: { start: log.startAt } },
    "근무 종료": { date: { start: log.endAt } },
    "근무 시간": { number: log.workHours },
    시급: { number: log.hourlyWage },
    세율: { number: log.taxRate },
    "세전 급여": { number: log.grossPay },
    "세후 급여": { number: log.netPay },
    메모: {
      rich_text: [{ text: { content: log.memo ?? "" } }],
    },
    "정산 주차": {
      rich_text: [{ text: { content: log.settlementWeek } }],
    },
    "정산 월": {
      rich_text: [{ text: { content: log.settlementMonth } }],
    },
    "동기화 ID": {
      rich_text: [{ text: { content: log.id } }],
    },
  };
}

function readText(property) {
  if (!property) return "";
  const values = property.rich_text ?? property.title ?? [];
  return values.map((item) => item.plain_text ?? "").join("");
}

function readDate(property) {
  return property?.date?.start ?? "";
}

function readNumber(property) {
  return property?.number ?? 0;
}

function readTimeFromDateProperty(property) {
  const value = readDate(property);
  if (!value) return "00:00";

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(new Date(value));
}

function pageToWorkLog(page) {
  const properties = page.properties;
  const date = readDate(properties["날짜"]).slice(0, 10);
  const id = readText(properties["동기화 ID"]) || `notion_${page.id}`;
  const now = page.last_edited_time ?? new Date().toISOString();

  return {
    id,
    date,
    startTime: readTimeFromDateProperty(properties["근무 시작"]),
    endTime: readTimeFromDateProperty(properties["근무 종료"]),
    hourlyWage: readNumber(properties["시급"]),
    taxRate: readNumber(properties["세율"]),
    memo: readText(properties["메모"]),
    breakMinutes: 0,
    nightPremiumEnabled: false,
    nightPremiumRate: 50,
    nightHours: 0,
    nightPremiumPay: 0,
    workHours: readNumber(properties["근무 시간"]),
    grossPay: readNumber(properties["세전 급여"]),
    netPay: readNumber(properties["세후 급여"]),
    settlementWeek: readText(properties["정산 주차"]),
    settlementMonth: readText(properties["정산 월"]),
    notionPageId: page.id,
    syncedAt: now,
    createdAt: page.created_time ?? now,
    updatedAt: now,
  };
}

function parseBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body;
}

async function getWorkLogs(response) {
  const workLogs = [];
  let cursor;

  do {
    const result = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });

    workLogs.push(...result.results.filter((page) => !page.archived).map(pageToWorkLog));
    cursor = result.has_more ? result.next_cursor : undefined;
  } while (cursor);

  response.status(200).json({ workLogs });
}

async function syncWorkLog(request, response) {
  const log = parseBody(request);

  if (log.notionPageId) {
    try {
      const page = await notion.pages.update({
        page_id: log.notionPageId,
        properties: workLogProperties(log),
      });

      response.status(200).json({ notionPageId: page.id, mode: "updated" });
      return;
    } catch (error) {
      console.warn("Notion page update failed. Creating a new page instead.", error.message);
    }
  }

  const page = await notion.pages.create({
    parent: { data_source_id: dataSourceId },
    properties: workLogProperties(log),
  });

  response.status(200).json({ notionPageId: page.id, mode: "created" });
}

export default async function handler(request, response) {
  if (!requireConfig(response)) return;

  try {
    if (request.method === "GET") {
      await getWorkLogs(response);
      return;
    }

    if (request.method === "POST") {
      await syncWorkLog(request, response);
      return;
    }

    response.setHeader("Allow", "GET, POST");
    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unknown Notion API error",
    });
  }
}
