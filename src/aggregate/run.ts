import { readFile } from "node:fs/promises";
import { readReportOutputDirectory } from "../common/report-output.js";
import { aggregateDigest } from "./index.js";
import type { AggregationInput, ChannelResult, NormalizedRecord } from "./types.js";

function isRecord(value: any): value is NormalizedRecord {
  return (
    value &&
    typeof value === "object" &&
    typeof value.source_type === "string" &&
    typeof value.source_name === "string" &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    typeof value.url === "string" &&
    typeof value.published_at === "string" &&
    typeof value.fetched_at === "string"
  );
}

async function loadChannelFile(path: string): Promise<ChannelResult> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  const records = Array.isArray(parsed?.records) ? parsed.records.filter(isRecord) : [];
  const failures = Array.isArray(parsed?.failures) ? parsed.failures : [];
  return { records, failures };
}

async function loadXChannel(path: string, mode: "test" | "production"): Promise<ChannelResult> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  const node = mode === "production" ? parsed?.production_mode : parsed?.test_mode;
  const records = Array.isArray(node?.records) ? node.records.filter(isRecord) : [];
  const failures = Array.isArray(node?.failures) ? node.failures : [];
  return { records, failures };
}

async function loadAggregationInput(mode: "test" | "production"): Promise<AggregationInput> {
  const [telegram, substack, youtube, others, x] = await Promise.all([
    loadChannelFile(new URL("../../reports/telegram-sample-output.json", import.meta.url).pathname),
    loadChannelFile(new URL("../../reports/substack-sample-output.json", import.meta.url).pathname),
    loadChannelFile(new URL("../../reports/youtube-sample-output.json", import.meta.url).pathname),
    loadChannelFile(new URL("../../reports/others-sample-output.json", import.meta.url).pathname),
    loadXChannel(new URL("../../reports/x-sample-output.json", import.meta.url).pathname, mode),
  ]);

  return {
    telegram,
    x,
    substack,
    youtube,
    others,
  };
}

async function main(): Promise<void> {
  const mode = process.env.AGGREGATE_X_MODE === "production" ? "production" : "test";
  const input = await loadAggregationInput(mode);
  const outputDir = (await readReportOutputDirectory(process.cwd())).path;

  const result = await aggregateDigest(input, {
    userPrompt: process.env.AGGREGATE_USER_PROMPT || "",
    outputDir,
  });

  console.log(
    JSON.stringify(
      {
        x_mode: mode,
        digest_items: result.digestItems.length,
        summary_failures: result.manifest.summary_failure_count,
        markdown: result.markdownPath,
        pdf: result.pdfPath,
        manifest: result.manifestPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
