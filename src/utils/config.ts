export interface Config {
  notionToken: string;
}

export function loadEnvConfig(): Config {
  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) {
    throw new Error(
      "NOTION_TOKEN is not set. Export it or add to ~/.zshenv.local"
    );
  }
  return { notionToken };
}
