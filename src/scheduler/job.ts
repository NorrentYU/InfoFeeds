import { execFile } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { ensureReportOutputDirectory } from "../common/report-output.js";

const execFileAsync = promisify(execFile);

interface FulltestSummary {
  generated_at: string;
  window_hours: number;
  outputs: {
    digest_markdown: string;
    digest_pdf: string;
    digest_manifest: string;
  };
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function findLatestSummaryFile(
  reportsDir: string,
  windowHours: number,
): Promise<string> {
  const files = await readdir(reportsDir);
  const prefix = `fulltest-${windowHours}h-summary-`;
  const targets = files
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => resolve(reportsDir, name));

  if (targets.length === 0) {
    throw new Error(`no summary found under ${reportsDir} with prefix ${prefix}`);
  }

  let latestPath = targets[0] || "";
  let latestMs = 0;
  for (const filePath of targets) {
    const fileStat = await stat(filePath);
    if (fileStat.mtimeMs > latestMs) {
      latestMs = fileStat.mtimeMs;
      latestPath = filePath;
    }
  }

  if (!latestPath) {
    throw new Error("latest summary path resolved empty");
  }
  return latestPath;
}

async function runFulltest(projectRoot: string, windowHours: number): Promise<void> {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  await execFileAsync(command, ["run", "fulltest"], {
    cwd: projectRoot,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      FULLTEST_WINDOW_HOURS: String(windowHours),
    },
  });
}

export async function runScheduledReportJob(params: {
  projectRoot: string;
  windowHours?: number;
}): Promise<{
  summaryPath: string;
  generatedAt: string;
  outputDir: string;
  digestMarkdown: string;
  digestPdf: string;
  digestManifest: string;
  logPath: string;
}> {
  const windowHours = params.windowHours ?? 24;
  const reportsDir = (await ensureReportOutputDirectory(params.projectRoot)).path;

  console.log(
    JSON.stringify(
      {
        stage: "scheduled_report_start",
        window_hours: windowHours,
        output_dir: reportsDir,
      },
      null,
      2,
    ),
  );

  await runFulltest(params.projectRoot, windowHours);

  const summaryPath = await findLatestSummaryFile(reportsDir, windowHours);
  const raw = await readFile(summaryPath, "utf8");
  const summary = JSON.parse(raw) as FulltestSummary;

  if (!summary.outputs?.digest_pdf || !summary.outputs?.digest_markdown) {
    throw new Error("summary outputs missing digest paths");
  }

  const reportLogPath = resolve(reportsDir, "scheduled-report-last.json");
  await writeFile(
    reportLogPath,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        summary_path: summaryPath,
        output_dir: reportsDir,
        digest_pdf: summary.outputs.digest_pdf,
        digest_markdown: summary.outputs.digest_markdown,
        digest_manifest: summary.outputs.digest_manifest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        stage: "scheduled_report_done",
        summary_path: summaryPath,
        output_dir: reportsDir,
        log_path: reportLogPath,
        digest_pdf: summary.outputs.digest_pdf,
      },
      null,
      2,
    ),
  );

  return {
    summaryPath,
    generatedAt: summary.generated_at,
    outputDir: reportsDir,
    digestMarkdown: summary.outputs.digest_markdown,
    digestPdf: summary.outputs.digest_pdf,
    digestManifest: summary.outputs.digest_manifest,
    logPath: reportLogPath,
  };
}

export function formatSchedulerError(error: unknown): string {
  return asErrorMessage(error);
}
