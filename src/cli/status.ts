import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { readAggregateProviderState, type AggregateProvider } from "../common/aggregate-llm.js";
import { readEnvValue } from "../common/env.js";
import { readReportOutputDirectory } from "../common/report-output.js";
import {
  isSourceListTemplateUnchanged,
  loadSourceList,
  SOURCE_LIST_TEMPLATE,
  SOURCE_LIST_TEMPLATE_GUIDANCE,
  type SourceListTemplateGuideItem,
} from "../fulltest/source-list.js";
import { loadXCredentials } from "../x/env.js";
import { resolveChromePath } from "./browser.js";

const execFileAsync = promisify(execFile);

export interface DoctorReport {
  generated_at: string;
  project_root: string;
  files: {
    env_exists: boolean;
    env_example_exists: boolean;
    source_list_exists: boolean;
    source_counts: {
      telegram: number;
      substack: number;
      youtube: number;
      others: number;
    };
  };
  source_list: {
    unchanged_from_template: boolean;
    template_markdown: string;
    template_guidance: SourceListTemplateGuideItem[];
  };
  binaries: {
    npm_available: boolean;
    yt_dlp_available: boolean;
    chrome: {
      available: boolean;
      path: string | null;
    };
    notebooklm_python: {
      available: boolean;
      path: string;
    };
    notebooklm_cli: {
      available: boolean;
      path: string;
    };
  };
  aggregate_llm: {
    active_provider: AggregateProvider;
    provider_name: string;
    configured: {
      openai_compatible: boolean;
      anthropic: boolean;
    };
    aliases: {
      llm: boolean;
      openai: boolean;
      bailian: boolean;
    };
  };
  youtube: {
    cookies_file: {
      configured: boolean;
      path: string | null;
      exists: boolean;
    };
    include_streams: boolean;
  };
  x: {
    cdp_endpoint: string;
    cdp_reachable: boolean;
    credentials_present: boolean;
    profile_dir: string;
  };
  notebooklm: {
    cdp_port: number;
    browser_reachable: boolean;
    auth_valid: boolean;
  };
  reports: {
    output_dir: {
      configured: boolean;
      path: string;
      exists: boolean;
    };
    schedule_time: string;
    schedule_timezone: string;
  };
  readiness: {
    fulltest: boolean;
    x_assisted_setup: boolean;
    notebooklm_optional: boolean;
    local_reports_ready: boolean;
  };
  next_actions: string[];
}

export function resolveAggregateProvider(configured: {
  openai_compatible: boolean;
  anthropic: boolean;
}): AggregateProvider {
  if (configured.openai_compatible) {
    return "openai_compatible";
  }
  if (configured.anthropic) {
    return "anthropic";
  }
  return "local";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function commandAvailable(command: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(command, args, {
      timeout: 5000,
      env: process.env,
    });
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return false;
    }
    return true;
  }
}

async function chromeAvailable(chromePath: string | null): Promise<boolean> {
  if (!chromePath) {
    return false;
  }
  if (chromePath.includes("/") || chromePath.includes("\\")) {
    return await pathExists(chromePath);
  }
  return await commandAvailable(chromePath, ["--version"]);
}

async function probeJson(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function checkNotebooklmAuth(projectRoot: string): Promise<boolean> {
  const nlmBin = resolve(projectRoot, ".venv-nlm", "bin", "nlm");
  if (!(await pathExists(nlmBin))) {
    return false;
  }

  try {
    await execFileAsync(nlmBin, ["auth", "status"], {
      cwd: projectRoot,
      timeout: 15000,
      env: {
        ...process.env,
        ALL_PROXY: "",
        all_proxy: "",
        HTTPS_PROXY: "",
        https_proxy: "",
        HTTP_PROXY: "",
        http_proxy: "",
      },
    });
    return true;
  } catch {
    return false;
  }
}

export function buildNextActions(report: DoctorReport): string[] {
  const actions: string[] = [];

  if (!report.files.source_list_exists || report.files.source_counts.youtube === 0) {
    actions.push("Edit sourceList.md and add the channels/newsletters you want to track.");
  }

  if (report.source_list.unchanged_from_template) {
    actions.push(
      "sourceList.md is still the default template. Replace the demo Telegram/Substack/YouTube entries and add your own RSS-supported websites.",
    );
  }

  if (report.aggregate_llm.active_provider === "local") {
    actions.push(
      "Configure an aggregate LLM provider in .env: LLM_API_KEY + LLM_API_URL (+ LLM_MODEL optional), or ANTHROPIC_API_KEY + ANTHROPIC_MODEL.",
    );
  }

  if (!report.reports.output_dir.configured) {
    actions.push(
      "Set REPORT_OUTPUT_DIR in .env so every digest PDF is written to a stable local folder.",
    );
  }

  if (!report.binaries.yt_dlp_available) {
    actions.push("Install yt-dlp and make sure the `yt-dlp` binary is available in PATH.");
  }

  if (
    report.youtube.cookies_file.configured &&
    !report.youtube.cookies_file.exists
  ) {
    actions.push(
      "Export a YouTube cookies file and point YOUTUBE_COOKIES_FILE at the readable file path.",
    );
  }

  if (!report.x.cdp_reachable) {
    actions.push(
      "Launch the dedicated X login browser with `npm run cli -- setup open-browser x`, then log in on x.com.",
    );
  }

  if (!report.notebooklm.auth_valid) {
    actions.push(
      "If you want YouTube summaries via NotebookLM, launch `npm run cli -- setup open-browser notebooklm`, log in to Google/NotebookLM, then rerun `npm run cli -- doctor`.",
    );
  }

  if (actions.length === 0) {
    actions.push("No blocking issues detected. You can run `npm run cli -- run fulltest --window-hours 24`.");
  }

  return actions;
}

export async function collectDoctorReport(
  projectRoot: string = process.cwd(),
): Promise<DoctorReport> {
  const envPath = resolve(projectRoot, ".env");
  const envExamplePath = resolve(projectRoot, ".env.example");
  const sourceListPath = resolve(projectRoot, "sourceList.md");
  const notebooklmPythonPath = resolve(projectRoot, ".venv-nlm", "bin", "python");
  const notebooklmCliPath = resolve(projectRoot, ".venv-nlm", "bin", "nlm");

  const [envExists, envExampleExists, sourceListExists] = await Promise.all([
    pathExists(envPath),
    pathExists(envExamplePath),
    pathExists(sourceListPath),
  ]);

  const sourceListMarkdown = sourceListExists
    ? await readFile(sourceListPath, "utf8")
    : "";
  const sourceCounts = sourceListExists
    ? await loadSourceList(sourceListPath)
    : { telegram: [], substack: [], youtube: [], others: [] };
  const sourceListUnchanged =
    sourceListExists && isSourceListTemplateUnchanged(sourceListMarkdown);

  const aggregateProvider = await readAggregateProviderState();
  const youtubeCookiesPath = await readEnvValue("YOUTUBE_COOKIES_FILE");
  const youtubeCookiesExists = youtubeCookiesPath
    ? await pathExists(youtubeCookiesPath)
    : false;

  const xEndpoint =
    (await readEnvValue("X_CDP_ENDPOINT")) || "http://127.0.0.1:9222";
  const xCredentials = await loadXCredentials();
  const notebooklmPort = Number.parseInt(
    (await readEnvValue("NOTEBOOKLM_CDP_PORT")) || "9233",
    10,
  );
  const chromePath = resolveChromePath();
  const reportOutput = await readReportOutputDirectory(projectRoot);
  const scheduleTime =
    (await readEnvValue("SCHEDULE_TIME")) ||
    (await readEnvValue("DELIVERY_TIME")) ||
    "09:30";
  const scheduleTimezone =
    (await readEnvValue("SCHEDULE_TIMEZONE")) ||
    (await readEnvValue("DELIVERY_TIMEZONE")) ||
    "UTC+8";

  const [
    npmAvailable,
    ytDlpAvailable,
    chromeIsAvailable,
    notebooklmPythonAvailable,
    notebooklmCliAvailable,
    xCdpReachable,
    notebooklmBrowserReachable,
    notebooklmAuthValid,
  ] = await Promise.all([
    commandAvailable(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"]),
    commandAvailable("yt-dlp", ["--version"]),
    chromeAvailable(chromePath),
    pathExists(notebooklmPythonPath),
    pathExists(notebooklmCliPath),
    probeJson(`${xEndpoint.replace(/\/+$/, "")}/json/version`),
    probeJson(`http://127.0.0.1:${notebooklmPort}/json`),
    checkNotebooklmAuth(projectRoot),
  ]);

  const report: DoctorReport = {
    generated_at: new Date().toISOString(),
    project_root: projectRoot,
    files: {
      env_exists: envExists,
      env_example_exists: envExampleExists,
      source_list_exists: sourceListExists,
      source_counts: {
        telegram: sourceCounts.telegram.length,
        substack: sourceCounts.substack.length,
        youtube: sourceCounts.youtube.length,
        others: sourceCounts.others.length,
      },
    },
    source_list: {
      unchanged_from_template: sourceListUnchanged,
      template_markdown: SOURCE_LIST_TEMPLATE,
      template_guidance: SOURCE_LIST_TEMPLATE_GUIDANCE,
    },
    binaries: {
      npm_available: npmAvailable,
      yt_dlp_available: ytDlpAvailable,
      chrome: {
        available: chromeIsAvailable,
        path: chromePath,
      },
      notebooklm_python: {
        available: notebooklmPythonAvailable,
        path: notebooklmPythonPath,
      },
      notebooklm_cli: {
        available: notebooklmCliAvailable,
        path: notebooklmCliPath,
      },
    },
    aggregate_llm: {
      active_provider: resolveAggregateProvider(aggregateProvider.configured),
      provider_name: aggregateProvider.providerName,
      configured: aggregateProvider.configured,
      aliases: aggregateProvider.aliases,
    },
    youtube: {
      cookies_file: {
        configured: Boolean(youtubeCookiesPath),
        path: youtubeCookiesPath || null,
        exists: youtubeCookiesExists,
      },
      include_streams: (await readEnvValue("YOUTUBE_INCLUDE_STREAM_TRANSCRIPTS")) === "1",
    },
    x: {
      cdp_endpoint: xEndpoint,
      cdp_reachable: xCdpReachable,
      credentials_present: Boolean(xCredentials),
      profile_dir: resolve(projectRoot, ".cache", "x", "profile"),
    },
    notebooklm: {
      cdp_port: Number.isFinite(notebooklmPort) ? notebooklmPort : 9233,
      browser_reachable: notebooklmBrowserReachable,
      auth_valid: notebooklmAuthValid,
    },
    reports: {
      output_dir: {
        configured: reportOutput.configured,
        path: reportOutput.path,
        exists: reportOutput.exists,
      },
      schedule_time: scheduleTime,
      schedule_timezone: scheduleTimezone,
    },
    readiness: {
      fulltest:
        sourceListExists && !sourceListUnchanged && npmAvailable && ytDlpAvailable,
      x_assisted_setup: xCdpReachable || Boolean(xCredentials),
      notebooklm_optional:
        notebooklmPythonAvailable && notebooklmCliAvailable && notebooklmAuthValid,
      local_reports_ready: Boolean(reportOutput.path),
    },
    next_actions: [],
  };

  report.next_actions = buildNextActions(report);
  return report;
}
