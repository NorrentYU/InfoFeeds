import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchYoutubeSourcesV2 } from "./index.js";
import { mapWithConcurrency } from "./pool.js";
import type {
  FailureType,
  YoutubeFetchOptionsV2,
  YoutubeFetchResultV2,
  YoutubeSourceInput,
} from "./types.js";

export interface YoutubeBenchmarkProgressEvent {
  index: number;
  total: number;
  source: string;
  phase: "start" | "done";
  elapsedMs?: number;
  records?: number;
  failures?: number;
}

export interface YoutubeBenchmarkOptions {
  sourceConcurrency?: number;
  fetchOptions?: YoutubeFetchOptionsV2;
  onProgress?: (event: YoutubeBenchmarkProgressEvent) => void;
  fetchFn?: (
    sources: YoutubeSourceInput[],
    options?: YoutubeFetchOptionsV2,
  ) => Promise<YoutubeFetchResultV2>;
}

export interface YoutubeBenchmarkSourceSummary {
  source: string;
  elapsed_ms: number;
  elapsed_seconds: number;
  records: number;
  failures: number;
  failures_by_type: Partial<Record<FailureType, number>>;
}

export interface YoutubeBenchmarkSummary {
  started_at: string;
  source_count: number;
  source_concurrency: number;
  options: YoutubeFetchOptionsV2;
  per_source: YoutubeBenchmarkSourceSummary[];
  total_elapsed_ms: number;
  total_elapsed_seconds: number;
  total_records: number;
  total_failures: number;
}

function countFailureTypes(
  result: YoutubeFetchResultV2,
): Partial<Record<FailureType, number>> {
  return result.failures.reduce<Partial<Record<FailureType, number>>>(
    (acc, item) => {
      acc[item.failure_type] = (acc[item.failure_type] || 0) + 1;
      return acc;
    },
    {},
  );
}

export async function runYoutubeV2Benchmark(
  sources: YoutubeSourceInput[],
  options: YoutubeBenchmarkOptions = {},
): Promise<YoutubeBenchmarkSummary> {
  const startedAt = new Date();
  const fetchFn = options.fetchFn || fetchYoutubeSourcesV2;
  const sourceConcurrency = Math.max(
    1,
    Math.floor(options.sourceConcurrency ?? 4) || 1,
  );
  const fetchOptions = options.fetchOptions || {};

  const perSource = await mapWithConcurrency(
    sources,
    sourceConcurrency,
    async (source, index) => {
      const sourceUrl = typeof source === "string" ? source : source.url;
      options.onProgress?.({
        index: index + 1,
        total: sources.length,
        source: sourceUrl,
        phase: "start",
      });

      const started = Date.now();
      const result = await fetchFn([source], fetchOptions);
      const elapsedMs = Date.now() - started;

      options.onProgress?.({
        index: index + 1,
        total: sources.length,
        source: sourceUrl,
        phase: "done",
        elapsedMs,
        records: result.records.length,
        failures: result.failures.length,
      });

      return {
        source: sourceUrl,
        elapsed_ms: elapsedMs,
        elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
        records: result.records.length,
        failures: result.failures.length,
        failures_by_type: countFailureTypes(result),
      };
    },
  );

  const totalElapsedMs = Date.now() - startedAt.getTime();
  return {
    started_at: startedAt.toISOString(),
    source_count: sources.length,
    source_concurrency: sourceConcurrency,
    options: fetchOptions,
    per_source: perSource,
    total_elapsed_ms: totalElapsedMs,
    total_elapsed_seconds: Number((totalElapsedMs / 1000).toFixed(2)),
    total_records: perSource.reduce((acc, item) => acc + item.records, 0),
    total_failures: perSource.reduce((acc, item) => acc + item.failures, 0),
  };
}

export async function writeYoutubeV2BenchmarkReport(params: {
  summary: YoutubeBenchmarkSummary;
  outputDir?: string;
  fileName?: string;
}): Promise<string> {
  const outputDir = resolve(process.cwd(), params.outputDir || "reports");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName =
    params.fileName || `youtube-v2-benchmark-${stamp}.json`;
  const outputPath = resolve(outputDir, fileName);
  await writeFile(outputPath, `${JSON.stringify(params.summary, null, 2)}\n`, "utf8");
  return outputPath;
}
