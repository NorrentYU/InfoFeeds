import { readFile } from "node:fs/promises";

function parseDotEnv(content: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    output[key] = value;
  }
  return output;
}

let dotenvCachePromise: Promise<Record<string, string>> | null = null;

async function loadDotEnv(): Promise<Record<string, string>> {
  if (!dotenvCachePromise) {
    dotenvCachePromise = (async () => {
      try {
        const raw = await readFile(".env", "utf8");
        return parseDotEnv(raw);
      } catch {
        return {};
      }
    })();
  }
  return await dotenvCachePromise;
}

export async function readEnvValue(key: string): Promise<string | undefined> {
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    const fromProcess = process.env[key];
    if (fromProcess && fromProcess.trim()) {
      return fromProcess.trim();
    }
    return undefined;
  }

  const dotenv = await loadDotEnv();
  const fromDotEnv = dotenv[key];
  if (fromDotEnv && fromDotEnv.trim()) {
    return fromDotEnv.trim();
  }
  return undefined;
}

