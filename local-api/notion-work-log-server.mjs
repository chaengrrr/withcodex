import "dotenv/config";
import express from "express";
import cors from "cors";
import { Client } from "@notionhq/client";

const app = express();
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const dataSourceId = process.env.NOTION_WORK_LOG_DATA_SOURCE_ID;

app.use(cors({ origin: "http://127.0.0.1:5173" }));
app.use(express.json());

app.post("/api/notion/work-logs", async (req, res) => {
  if (!dataSourceId) {
    res.status(500).json({ error: "NOTION_WORK_LOG_DATA_SOURCE_ID is missing" });
    return;
  }

  const log = req.body;

  try {
    const page = await notion.pages.create({
      parent: { data_source_id: dataSourceId },
      properties: {
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
      },
    });

    res.json({ notionPageId: page.id });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown Notion API error",
    });
  }
});

app.listen(8787, () => {
  console.log("Notion local API: http://127.0.0.1:8787");
});
