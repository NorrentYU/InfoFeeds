import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

export type BrowserTarget = "x" | "notebooklm";

export interface BrowserPreset {
  target: BrowserTarget;
  port: number;
  profileDir: string;
  startUrl: string;
}

export function resolveChromePath(): string | null {
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  if (process.platform === "linux") {
    return "google-chrome";
  }
  if (process.platform === "win32") {
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }
  return null;
}

function toAbsoluteProfileDir(projectRoot: string, profileDir: string): string {
  if (isAbsolute(profileDir)) {
    return profileDir;
  }
  return resolve(projectRoot, profileDir);
}

export function buildBrowserPreset(params: {
  target: BrowserTarget;
  projectRoot: string;
  port?: number;
  profileDir?: string;
}): BrowserPreset {
  if (params.target === "x") {
    return {
      target: "x",
      port: params.port ?? 9222,
      profileDir: toAbsoluteProfileDir(
        params.projectRoot,
        params.profileDir || ".cache/x/profile",
      ),
      startUrl: "https://x.com/home",
    };
  }

  return {
    target: "notebooklm",
    port: params.port ?? 9233,
    profileDir: toAbsoluteProfileDir(
      params.projectRoot,
      params.profileDir || ".chrome-nlm-manual",
    ),
    startUrl: "https://notebooklm.google.com/",
  };
}

export async function launchBrowserSession(preset: BrowserPreset): Promise<{
  chromePath: string;
  port: number;
  profileDir: string;
  startUrl: string;
  pid: number;
}> {
  const chromePath = resolveChromePath();
  if (!chromePath) {
    throw new Error("Google Chrome not found");
  }

  await mkdir(preset.profileDir, { recursive: true });
  const child = spawn(
    chromePath,
    [
      `--remote-debugging-port=${preset.port}`,
      `--user-data-dir=${preset.profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-allow-origins=*",
      preset.startUrl,
    ],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();

  return {
    chromePath,
    port: preset.port,
    profileDir: preset.profileDir,
    startUrl: preset.startUrl,
    pid: child.pid || 0,
  };
}
