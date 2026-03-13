import { readFile } from "node:fs/promises";
import type { XCredentials } from "./types.js";

function parseDotEnv(content: string): Record<string, string> {
  const lines = content.split(/\r?\n/);
  const output: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    output[key] = value;
  }

  return output;
}

function fromRecord(record: Record<string, string | undefined>): XCredentials | null {
  const username = record.X_USERNAME || record.USERNAME;
  const password = record.X_PASSWORD || record.PASSWORD;
  if (!username || !password) {
    return null;
  }

  return { username, password };
}

export async function loadXCredentials(): Promise<XCredentials | null> {
  const fromEnv = fromRecord(process.env as Record<string, string | undefined>);
  if (fromEnv) {
    return fromEnv;
  }

  try {
    const raw = await readFile(".env", "utf8");
    const parsed = parseDotEnv(raw);
    return fromRecord(parsed);
  } catch {
    return null;
  }
}
