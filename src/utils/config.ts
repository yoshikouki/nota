export interface Config {
  notionToken: string;
}

export function loadConfig(): Config {
  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) {
    console.error("Error: NOTION_TOKEN is not set.");
    process.exit(1);
  }
  return { notionToken };
}
