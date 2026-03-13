import { constants, existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnvValue } from "../common/env.js";

const modulePath = fileURLToPath(import.meta.url);
const bundledPromptPath = fileURLToPath(
  new URL("./default-summary-prompt.md", import.meta.url),
);
const sourceFallbackPromptPath = resolve(
  dirname(modulePath),
  "../../src/aggregate/default-summary-prompt.md",
);

export const BUILTIN_BASE_PROMPT_PATH = existsSync(bundledPromptPath)
  ? bundledPromptPath
  : sourceFallbackPromptPath;

export interface BasePromptState {
  builtin_path: string;
  configured_path: string | null;
  configured_exists: boolean;
  active_path: string;
  active_exists: boolean;
  using_custom_prompt: boolean;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readBasePromptState(
  projectRoot: string = process.cwd(),
): Promise<BasePromptState> {
  const configuredValue = await readEnvValue("AGGREGATE_BASE_PROMPT_FILE");
  const configuredPath = configuredValue ? resolve(projectRoot, configuredValue) : null;
  const configuredExists = configuredPath ? await pathExists(configuredPath) : false;
  const usingCustomPrompt = Boolean(configuredPath);
  const activePath = configuredPath || BUILTIN_BASE_PROMPT_PATH;
  const activeExists = usingCustomPrompt ? configuredExists : true;

  return {
    builtin_path: BUILTIN_BASE_PROMPT_PATH,
    configured_path: configuredPath,
    configured_exists: configuredExists,
    active_path: activePath,
    active_exists: activeExists,
    using_custom_prompt: usingCustomPrompt,
  };
}

export async function loadBasePrompt(customPath?: string | URL): Promise<string> {
  const path = customPath || BUILTIN_BASE_PROMPT_PATH;
  const buffer = await readFile(path, "utf8");
  return buffer.trim();
}

export async function loadConfiguredBasePrompt(
  projectRoot: string = process.cwd(),
): Promise<string> {
  const state = await readBasePromptState(projectRoot);
  return await loadBasePrompt(state.active_path);
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
