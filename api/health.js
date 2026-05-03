export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    notionConfigured: Boolean(
      process.env.NOTION_API_KEY && process.env.NOTION_WORK_LOG_DATA_SOURCE_ID,
    ),
  });
}
