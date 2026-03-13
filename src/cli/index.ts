#!/usr/bin/env node
import { resolve } from "node:path";
import { buildBrowserPreset, launchBrowserSession } from "./browser.js";
import { runTsxScript, runZshScript } from "./process.js";
import { buildNextActions, collectDoctorReport, type DoctorReport } from "./status.js";

function printHelp(): void {
  console.log(`InfoFeeds CLI

Usage:
  infofeeds doctor [--json]
  infofeeds setup checklist [--json]
  infofeeds setup open-browser <x|notebooklm> [--port <number>] [--profile-dir <path>]
  infofeeds setup x-session [--timeout-minutes <number>]
  infofeeds run fulltest [--window-hours <number>] [--youtube-summary <default|notebooklm>] [--x-mode <test|production>] [--include-streams]
  infofeeds run smoke x
  infofeeds run smoke notebooklm
  infofeeds schedule once [--window-hours <number>]
  infofeeds schedule daemon
  infofeeds schedule install-cron
  infofeeds schedule uninstall-cron

Examples:
  npm run cli -- doctor --json
  npm run cli -- setup open-browser x
  npm run cli -- setup open-browser notebooklm --port 9233
  npm run cli -- run fulltest --window-hours 24 --youtube-summary notebooklm
  npm run cli -- run smoke x
  npm run cli -- schedule once --window-hours 24
`);
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function readOption(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function toPositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function printDoctorReport(report: DoctorReport): void {
  console.log("InfoFeeds Doctor");
  console.log(`project_root: ${report.project_root}`);
  console.log("");
  console.log("Files");
  console.log(`  .env: ${report.files.env_exists ? "present" : "missing"}`);
  console.log(
    `  .env.example: ${report.files.env_example_exists ? "present" : "missing"}`,
  );
  console.log(
    `  sourceList.md: ${report.files.source_list_exists ? "present" : "missing"}`,
  );
  console.log(
    `  source counts: telegram=${report.files.source_counts.telegram} substack=${report.files.source_counts.substack} youtube=${report.files.source_counts.youtube} others=${report.files.source_counts.others}`,
  );
  console.log("");
  console.log("Source List");
  console.log(
    `  unchanged from template: ${report.source_list.unchanged_from_template}`,
  );
  if (report.source_list.unchanged_from_template) {
    console.log("  guidance:");
    for (const item of report.source_list.template_guidance) {
      console.log(`    - ${item.section}: ${item.description}`);
      console.log(`      example: ${item.example}`);
      console.log(`      note: ${item.note}`);
    }
    console.log("  template:");
    for (const line of report.source_list.template_markdown.split(/\r?\n/)) {
      console.log(`    ${line}`);
    }
  }
  console.log("");
  console.log("Aggregate LLM");
  console.log(`  active provider: ${report.aggregate_llm.active_provider}`);
  console.log(`  provider name: ${report.aggregate_llm.provider_name}`);
  console.log(
    `  configured: openai_compatible=${report.aggregate_llm.configured.openai_compatible} anthropic=${report.aggregate_llm.configured.anthropic}`,
  );
  console.log(
    `  aliases: llm=${report.aggregate_llm.aliases.llm} openai=${report.aggregate_llm.aliases.openai} bailian=${report.aggregate_llm.aliases.bailian}`,
  );
  console.log("");
  console.log("YouTube");
  console.log(`  yt-dlp: ${report.binaries.yt_dlp_available ? "ok" : "missing"}`);
  console.log(
    `  cookies file: configured=${report.youtube.cookies_file.configured} exists=${report.youtube.cookies_file.exists} path=${report.youtube.cookies_file.path || "N/A"}`,
  );
  console.log("");
  console.log("X");
  console.log(`  cdp endpoint: ${report.x.cdp_endpoint}`);
  console.log(`  cdp reachable: ${report.x.cdp_reachable}`);
  console.log(`  credentials present: ${report.x.credentials_present}`);
  console.log(`  profile dir: ${report.x.profile_dir}`);
  console.log("");
  console.log("NotebookLM");
  console.log(
    `  python: ${report.binaries.notebooklm_python.available} (${report.binaries.notebooklm_python.path})`,
  );
  console.log(
    `  cli: ${report.binaries.notebooklm_cli.available} (${report.binaries.notebooklm_cli.path})`,
  );
  console.log(`  cdp port: ${report.notebooklm.cdp_port}`);
  console.log(`  browser reachable: ${report.notebooklm.browser_reachable}`);
  console.log(`  auth valid: ${report.notebooklm.auth_valid}`);
  console.log("");
  console.log("Reports");
  console.log(`  output dir configured: ${report.reports.output_dir.configured}`);
  console.log(`  output dir exists: ${report.reports.output_dir.exists}`);
  console.log(`  output dir path: ${report.reports.output_dir.path}`);
  console.log(
    `  schedule defaults: ${report.reports.schedule_timezone} ${report.reports.schedule_time}`,
  );
  console.log("");
  console.log("Next actions");
  for (const action of buildNextActions(report)) {
    console.log(`  - ${action}`);
  }
}

async function handleDoctor(args: string[], projectRoot: string): Promise<number> {
  const report = await collectDoctorReport(projectRoot);
  if (hasFlag(args, "--json")) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  printDoctorReport(report);
  return 0;
}

async function handleSetup(args: string[], projectRoot: string): Promise<number> {
  const subcommand = args[0];
  if (subcommand === "checklist") {
    const report = await collectDoctorReport(projectRoot);
    const payload = {
      generated_at: report.generated_at,
      project_root: report.project_root,
      next_actions: report.next_actions,
    };
    if (hasFlag(args, "--json")) {
      console.log(JSON.stringify(payload, null, 2));
      return 0;
    }
    console.log("InfoFeeds Setup Checklist");
    for (const action of report.next_actions) {
      console.log(`- ${action}`);
    }
    return 0;
  }

  if (subcommand === "open-browser") {
    const target = args[1];
    if (target !== "x" && target !== "notebooklm") {
      console.error("Expected target: x | notebooklm");
      return 1;
    }
    const preset = buildBrowserPreset({
      target,
      projectRoot,
      port: toPositiveInt(readOption(args, "--port"), target === "x" ? 9222 : 9233),
      profileDir: readOption(args, "--profile-dir"),
    });
    const launched = await launchBrowserSession(preset);
    console.log(
      JSON.stringify(
        {
          target,
          chrome_path: launched.chromePath,
          pid: launched.pid,
          port: launched.port,
          profile_dir: launched.profileDir,
          start_url: launched.startUrl,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (subcommand === "x-session") {
    const env = {
      ...process.env,
      X_MANUAL_TIMEOUT_MINUTES: String(
        toPositiveInt(readOption(args, "--timeout-minutes"), 8),
      ),
    };
    return await runTsxScript({
      projectRoot,
      scriptPath: "src/x/init-session.ts",
      env,
    });
  }

  printHelp();
  return 1;
}

async function handleRun(args: string[], projectRoot: string): Promise<number> {
  const subcommand = args[0];

  if (subcommand === "fulltest") {
    const windowHours = toPositiveInt(readOption(args, "--window-hours"), 24);
    const youtubeSummary =
      readOption(args, "--youtube-summary") === "notebooklm"
        ? "notebooklm"
        : "default";
    const xMode =
      readOption(args, "--x-mode") === "test" ? "test" : "production";
    const env = {
      ...process.env,
      FULLTEST_WINDOW_HOURS: String(windowHours),
      FULLTEST_X_MODE: xMode,
      FULLTEST_YOUTUBE_SUMMARY_PROVIDER: youtubeSummary,
      YOUTUBE_INCLUDE_STREAM_TRANSCRIPTS: hasFlag(args, "--include-streams")
        ? "1"
        : process.env.YOUTUBE_INCLUDE_STREAM_TRANSCRIPTS || "0",
    };
    const scriptArgs =
      youtubeSummary === "notebooklm" ? ["notebooklm"] : [];
    return await runTsxScript({
      projectRoot,
      scriptPath: "src/fulltest/run.ts",
      args: scriptArgs,
      env,
    });
  }

  if (subcommand === "smoke") {
    const target = args[1];
    if (target === "x") {
      return await runTsxScript({
        projectRoot,
        scriptPath: "src/x/cdp-smoke.ts",
        env: process.env,
      });
    }
    if (target === "notebooklm") {
      return await runStreamingCommandForNotebooklm(projectRoot, ["auth", "status"]);
    }
    console.error("Expected smoke target: x | notebooklm");
    return 1;
  }

  printHelp();
  return 1;
}

async function runStreamingCommandForNotebooklm(
  projectRoot: string,
  args: string[],
): Promise<number> {
  const nlmPath = resolve(projectRoot, ".venv-nlm", "bin", "nlm");
  return await runTsxScript({
    projectRoot,
    scriptPath: "src/cli/nlm.ts",
    args,
    env: {
      ...process.env,
      INFOFEEDS_NLM_BIN: nlmPath,
      ALL_PROXY: "",
      all_proxy: "",
      HTTPS_PROXY: "",
      https_proxy: "",
      HTTP_PROXY: "",
      http_proxy: "",
    },
  });
}

async function handleSchedule(args: string[], projectRoot: string): Promise<number> {
  const subcommand = args[0];
  if (subcommand === "once") {
    const env = {
      ...process.env,
      SCHEDULE_WINDOW_HOURS: String(
        toPositiveInt(readOption(args, "--window-hours"), 24),
      ),
    };
    return await runTsxScript({
      projectRoot,
      scriptPath: "src/scheduler/once.ts",
      env,
    });
  }

  if (subcommand === "daemon") {
    return await runTsxScript({
      projectRoot,
      scriptPath: "src/scheduler/run.ts",
      env: process.env,
    });
  }

  if (subcommand === "install-cron") {
    return await runZshScript({
      projectRoot,
      scriptPath: "scripts/install-cron.sh",
      env: process.env,
    });
  }

  if (subcommand === "uninstall-cron") {
    return await runZshScript({
      projectRoot,
      scriptPath: "scripts/uninstall-cron.sh",
      env: process.env,
    });
  }

  printHelp();
  return 1;
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const args = process.argv.slice(2);
  if (args.length === 0 || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    printHelp();
    return;
  }

  const command = args[0];
  let exitCode = 1;

  if (command === "doctor") {
    exitCode = await handleDoctor(args.slice(1), projectRoot);
  } else if (command === "setup") {
    exitCode = await handleSetup(args.slice(1), projectRoot);
  } else if (command === "run") {
    exitCode = await handleRun(args.slice(1), projectRoot);
  } else if (command === "schedule") {
    exitCode = await handleSchedule(args.slice(1), projectRoot);
  } else {
    printHelp();
    exitCode = 1;
  }

  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
