import { readFile } from "node:fs/promises";

export async function loadBasePrompt(customPath?: string): Promise<string> {
  const path = customPath || new URL("../../contracts/prompts/default-summary-prompt.md", import.meta.url);
  const buffer = await readFile(path, "utf8");
  return buffer.trim();
}

export function buildEffectivePrompt(basePrompt: string, userPrompt?: string): string {
  if (!userPrompt || !userPrompt.trim()) {
    return basePrompt.trim();
  }

  return `${basePrompt.trim()}\n\n---\n\n附加用户约束：\n${userPrompt.trim()}`;
}

export function buildSummaryPromptInput(params: {
  effectivePrompt: string;
  sourceType: string;
  sourceName: string;
  title: string;
  content: string;
  publishedAt: string;
  url: string;
}): string {
  return `${params.effectivePrompt}\n\n输入：\nsource_type: ${params.sourceType}\nsource_name: ${params.sourceName}\ntitle: ${params.title}\ncontent: ${params.content}\npublished_at: ${params.publishedAt}\nurl: ${params.url}\n\n输出提醒：第一行直接输出具体标题（例如“**AI芯片供给瓶颈升级**”），禁止输出“标题”“摘要正文”等占位词。`;
}
