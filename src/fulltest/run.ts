import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { aggregateDigest } from "../aggregate/index.js";
import { createYoutubeNotebooklmSummaryFn } from "../aggregate/notebooklm.js";
import { createSummaryFn } from "../aggregate/summarizer.js";
import { ensureReportOutputDirectory } from "../common/report-output.js";
import { fetchOthersSources } from "../others/index.js";
import { fetchSubstackSources } from "../substack/index.js";
import { fetchTelegramSources } from "../telegram/index.js";
import { loadSourceList } from "./source-list.js";
import { resolveYoutubeSummaryProvider } from "./summary-mode.js";
import { fetchXForYou } from "../x/index.js";
import { fetchYoutubeSources } from "../youtube/index.js";

function toTimestamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function readWindowHours(): number {
  const raw = process.env.FULLTEST_WINDOW_HOURS;
  if (!raw) {
    return 24;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 24;
  }
  return parsed;
}

function readAggregateDebugMode(): boolean {
  return process.env.AGGREGATE_DEBUG === "1";
}

function readYoutubeIncludeStreams(): boolean {
  return process.env.YOUTUBE_INCLUDE_STREAM_TRANSCRIPTS === "1";
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const startedAtMs = Date.now();
  const now = new Date();
  const stamp = toTimestamp(now);
  const youtubeSummaryProvider = resolveYoutubeSummaryProvider(
    process.argv.slice(2),
  );
  const root = process.cwd();
  const sourceListPath = resolve(root, "sourceList.md");
  const output = await ensureReportOutputDirectory(root);
  const outputDir = output.path;
  await mkdir(outputDir, { recursive: true });

  const groups = await loadSourceList(sourceListPath);
  const windowHours = readWindowHours();
  const youtubeIncludeStreams = readYoutubeIncludeStreams();
  const youtubeLiveDelayHours =
    youtubeIncludeStreams && windowHours === 24 ? 24 : 0;
  const aggregateDebug = readAggregateDebugMode();
  console.log(
    JSON.stringify(
      {
        stage: "loaded_sources",
        youtube_summary_provider: youtubeSummaryProvider,
        counts: {
          telegram: groups.telegram.length,
          substack: groups.substack.length,
          youtube: groups.youtube.length,
          others: groups.others.length,
        },
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify({ stage: "fetch_channels_start", windowHours }, null, 2),
  );
  const [telegram, substack, youtube, others] = await Promise.all([
    fetchTelegramSources(groups.telegram, {
      windowHours,
      retryCount: 1,
      timeoutMs: 20000,
      maxMessagesPerSource: 30,
    }),
    fetchSubstackSources(groups.substack, {
      windowHours,
      retryCount: 1,
      timeoutMs: 20000,
      maxItemsPerSource: 80,
    }),
    fetchYoutubeSources(groups.youtube, {
      latestOnly: false,
      includeStreamTranscripts: youtubeIncludeStreams,
      windowStartHoursAgo: windowHours,
      windowEndHoursAgo: 0,
      liveDelayHours: youtubeLiveDelayHours,
      retryCount: 1,
      timeoutMs: 45000,
      maxVideosPerSource: 2,
    }),
    fetchOthersSources(groups.others, {
      windowHours,
      retryCount: 1,
      timeoutMs: 20000,
      maxItemsPerSource: 80,
    }),
  ]);
  console.log(JSON.stringify({ stage: "fetch_channels_done" }, null, 2));
  const xContentUrls = Array.from(
    new Set((telegram.x_content_handoffs || []).map((item) => item.x_url)),
  );
  console.log(
    JSON.stringify(
      {
        stage: "telegram_x_handoff_ready",
        x_content_urls: xContentUrls.length,
      },
      null,
      2,
    ),
  );

  const xMode = process.env.FULLTEST_X_MODE === "test" ? "test" : "production";
  console.log(JSON.stringify({ stage: "fetch_x_gate_start" }, null, 2));
  const xGate = await fetchXForYou({
    mode: "test",
    limit: 1,
    contentLimit: 0,
    retryCount: 0,
    timeoutMs: 45000,
    preferCdp: true,
    allowFallbackAfterCdpFailure: false,
    allowPasswordLogin: false,
    allowManualTakeover: false,
  });
  console.log(
    JSON.stringify(
      {
        stage: "fetch_x_gate_done",
        gate_records: xGate.records.length,
        gate_failures: xGate.failures.length,
      },
      null,
      2,
    ),
  );

  const x =
    xGate.records.length === 0
      ? { records: [], failures: xGate.failures }
      : await fetchXForYou({
          mode: xMode,
          contentUrls: xContentUrls,
          retryCount: 1,
          timeoutMs: 45000,
          preferCdp: true,
          allowFallbackAfterCdpFailure: false,
          allowPasswordLogin: false,
          allowManualTakeover: false,
        });
  console.log(JSON.stringify({ stage: "fetch_x_done", xMode }, null, 2));

  const telegramPath = resolve(outputDir, `full-telegram-${stamp}.json`);
  const substackPath = resolve(outputDir, `full-substack-${stamp}.json`);
  const youtubePath = resolve(outputDir, `full-youtube-${stamp}.json`);
  const othersPath = resolve(outputDir, `full-others-${stamp}.json`);
  const xPath = resolve(outputDir, `full-x-${stamp}.json`);

  await Promise.all([
    writeJson(telegramPath, telegram),
    writeJson(substackPath, substack),
    writeJson(youtubePath, youtube),
    writeJson(othersPath, others),
    writeJson(xPath, { mode: xMode, ...x }),
  ]);
  console.log(JSON.stringify({ stage: "write_channel_outputs_done" }, null, 2));

  console.log(
    JSON.stringify(
      { stage: "aggregate_start", windowHours, youtubeSummaryProvider },
      null,
      2,
    ),
  );
  const aggregateSummaryFn =
    youtubeSummaryProvider === "notebooklm"
      ? createYoutubeNotebooklmSummaryFn({
          fallback: createSummaryFn(),
        })
      : undefined;
  const aggregate = await aggregateDigest(
    {
      telegram,
      x,
      substack,
      youtube,
      others,
    },
    {
      now,
      windowHours,
      outputDir,
      outputBaseName: `digest-full-${windowHours}h-${stamp}`,
      userPrompt: process.env.AGGREGATE_USER_PROMPT || "",
      // Debug-only instrumentation; remove after debugging.
      debugProgress: aggregateDebug,
      progressEvery: 10,
      abortOnTimeout: aggregateDebug,
    },
    {
      summaryFn: aggregateSummaryFn,
    },
  );
  console.log(JSON.stringify({ stage: "aggregate_done" }, null, 2));
  const elapsedMsToPdf = Date.now() - startedAtMs;
  console.log(
    JSON.stringify(
      {
        stage: "pdf_ready",
        elapsed_ms: elapsedMsToPdf,
        elapsed_seconds: Number((elapsedMsToPdf / 1000).toFixed(2)),
        pdf_path: aggregate.pdfPath,
      },
      null,
      2,
    ),
  );

  const summaryPath = resolve(
    outputDir,
    `fulltest-${windowHours}h-summary-${stamp}.json`,
  );
  const summary = {
    generated_at: now.toISOString(),
    window_hours: windowHours,
    youtube_summary_provider: youtubeSummaryProvider,
    sources_count: {
      telegram: groups.telegram.length,
      substack: groups.substack.length,
      youtube: groups.youtube.length,
      others: groups.others.length,
      x: 1,
    },
    x_mode: xMode,
    channel_stats: {
      telegram: {
        records: telegram.records.length,
        failures: telegram.failures.length,
        x_content_handoffs: telegram.x_content_handoffs.length,
      },
      substack: {
        records: substack.records.length,
        failures: substack.failures.length,
      },
      youtube: {
        records: youtube.records.length,
        failures: youtube.failures.length,
      },
      others: {
        records: others.records.length,
        failures: others.failures.length,
      },
      x: { records: x.records.length, failures: x.failures.length },
    },
    outputs: {
      telegram: telegramPath,
      substack: substackPath,
      youtube: youtubePath,
      others: othersPath,
      x: xPath,
      digest_markdown: aggregate.markdownPath,
      digest_pdf: aggregate.pdfPath,
      digest_manifest: aggregate.manifestPath,
    },
  };

  await writeJson(summaryPath, summary);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
