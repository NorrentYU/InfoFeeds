import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readReportOutputDirectory } from "../common/report-output.js";
import { renderDigestMarkdown } from "./compose.js";
import {
  normalizeSummaryOutput,
  normalizeTextForSummary,
  validateAggregateContent,
  validateSummaryOutput,
} from "./filters.js";
import { renderPdfFromMarkdown } from "./pdf.js";
import {
  buildEffectivePrompt,
  buildSummaryPromptInput,
  loadBasePrompt,
} from "./prompt.js";
import { createSummaryFn } from "./summarizer.js";
import type {
  AggregateDigestOptions,
  AggregateFailureItem,
  AggregationInput,
  DigestItem,
  DigestManifest,
  PdfRenderFn,
  PreparedRecord,
  SourceType,
  SummaryFn,
} from "./types.js";
import { canonicalizeUrl } from "./url.js";

const CHANNEL_ORDER: SourceType[] = [
  "telegram",
  "x",
  "substack",
  "youtube",
  "others",
];

const CHANNEL_ORDER_MAP: Record<SourceType, number> = {
  telegram: 0,
  x: 1,
  substack: 2,
  youtube: 3,
  others: 4,
};

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function syntheticCanonicalForNoUrl(params: {
  sourceType: SourceType;
  sourceName: string;
  publishedAt: string;
  content: string;
}): string {
  let hash = 0;
  for (let i = 0; i < params.content.length; i += 1) {
    hash = (hash * 31 + params.content.charCodeAt(i)) >>> 0;
  }
  return `nourl://${params.sourceType}/${encodeURIComponent(params.sourceName)}/${encodeURIComponent(params.publishedAt)}/${hash.toString(16)}`;
}

function toDigestTimestamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function normalizeOutputPath(params: {
  outputDir: string;
  filename: string;
}): string {
  return resolve(process.cwd(), params.outputDir, params.filename);
}

async function mapLimit<T, U>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, limit) }).map(async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await fn(items[idx] as T, idx);
    }
  });

  await Promise.all(workers);
  return results;
}

async function withTimeout<T>(params: {
  timeoutMs: number;
  abortOnTimeout: boolean;
  task: (signal?: AbortSignal) => Promise<T>;
}): Promise<T> {
  if (!params.abortOnTimeout) {
    return await Promise.race([
      params.task(),
      new Promise<T>((_, reject) => {
        setTimeout(
          () => reject(new Error(`summary timeout (${params.timeoutMs}ms)`)),
          params.timeoutMs,
        );
      }),
    ]);
  }

  const controller = new AbortController();
  let timeoutRef: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      params.task(controller.signal),
      new Promise<T>((_, reject) => {
        timeoutRef = setTimeout(() => {
          controller.abort();
          reject(new Error(`summary timeout (${params.timeoutMs}ms)`));
        }, params.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutRef) {
      clearTimeout(timeoutRef);
    }
  }
}

function flattenAndFilterRecords(params: {
  input: AggregationInput;
  now: Date;
  windowHours: number;
  minContentLength: number;
  failures: AggregateFailureItem[];
}): PreparedRecord[] {
  const sinceMs = params.now.getTime() - params.windowHours * 60 * 60 * 1000;
  const prepared: PreparedRecord[] = [];

  for (const sourceType of CHANNEL_ORDER) {
    const batch = params.input[sourceType];
    for (const record of batch.records) {
      if (record.source_type !== sourceType) {
        params.failures.push({
          source_type: record.source_type,
          source_name: record.source_name,
          url: record.url,
          failure_type: "invalid_content",
          detail: "source_type 与输入渠道不一致",
        });
        continue;
      }

      if (sourceType !== "x" && sourceType !== "youtube") {
        const publishedMs = new Date(record.published_at).getTime();
        if (Number.isNaN(publishedMs) || publishedMs < sinceMs) {
          params.failures.push({
            source_type: record.source_type,
            source_name: record.source_name,
            url: record.url,
            failure_type: "invalid_content",
            detail: `超出聚合窗口(${params.windowHours}h)`,
          });
          continue;
        }
      }

      const validation = validateAggregateContent({
        record,
        minLength: params.minContentLength,
      });
      if (!validation.valid) {
        params.failures.push({
          source_type: record.source_type,
          source_name: record.source_name,
          url: record.url,
          failure_type: "invalid_content",
          detail: validation.reason,
        });
        continue;
      }

      let canonical = "";
      if (!record.url.trim()) {
        canonical = syntheticCanonicalForNoUrl({
          sourceType: record.source_type,
          sourceName: record.source_name,
          publishedAt: record.published_at,
          content: validation.normalizedContent,
        });
      } else {
        const normalized = canonicalizeUrl(record.url);
        if (!normalized) {
          params.failures.push({
            source_type: record.source_type,
            source_name: record.source_name,
            url: record.url,
            failure_type: "invalid_content",
            detail: "URL 无法规范化",
          });
          continue;
        }
        canonical = normalized;
      }

      prepared.push({
        ...record,
        content: validation.normalizedContent,
        canonical_url: canonical,
        channel_order: CHANNEL_ORDER_MAP[record.source_type],
      });
    }
  }

  return prepared;
}

function dedupeRecords(records: PreparedRecord[]): PreparedRecord[] {
  const byCanonical = new Map<string, PreparedRecord>();

  for (const record of records) {
    const existing = byCanonical.get(record.canonical_url);
    if (!existing) {
      byCanonical.set(record.canonical_url, record);
      continue;
    }

    const keepCurrent = record.content.length > existing.content.length;
    const kept = keepCurrent ? record : existing;
    byCanonical.set(record.canonical_url, kept);
  }

  return Array.from(byCanonical.values()).sort((a, b) => {
    if (a.channel_order !== b.channel_order) {
      return a.channel_order - b.channel_order;
    }
    return (
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    );
  });
}

async function summarizeRecord(params: {
  record: PreparedRecord;
  effectivePrompt: string;
  summaryFn: SummaryFn;
  timeoutMs: number;
  retryCount: number;
  abortOnTimeout: boolean;
}): Promise<
  | { success: true; item: DigestItem }
  | { success: false; failure: AggregateFailureItem }
> {
  const maxAttempts = params.retryCount + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = buildSummaryPromptInput({
      effectivePrompt: params.effectivePrompt,
      sourceType: params.record.source_type,
      sourceName: params.record.source_name,
      title: params.record.title,
      content: normalizeTextForSummary(params.record.content),
      publishedAt: params.record.published_at,
      url: params.record.url,
    });

    try {
      const rawSummary = await withTimeout({
        timeoutMs: params.timeoutMs,
        abortOnTimeout: params.abortOnTimeout,
        task: (signal) =>
          params.summaryFn({
            prompt,
            source_type: params.record.source_type,
            source_name: params.record.source_name,
            title: params.record.title,
            content: params.record.content,
            published_at: params.record.published_at,
            url: params.record.url,
            signal,
          }),
      });
      const summary = normalizeSummaryOutput({
        summary: rawSummary,
        fallbackTitle: params.record.title,
        fallbackContent: params.record.content,
      });

      const summaryValidation = validateSummaryOutput(summary);
      if (!summaryValidation.valid) {
        if (attempt < maxAttempts) {
          continue;
        }

        return {
          success: false,
          failure: {
            source_type: params.record.source_type,
            source_name: params.record.source_name,
            url: params.record.url,
            canonical_url: params.record.canonical_url,
            failure_type: "summary_format_invalid",
            detail: summaryValidation.reason,
            attempt,
          },
        };
      }

      return {
        success: true,
        item: {
          source_type: params.record.source_type,
          source_name: params.record.source_name,
          title: params.record.title,
          summary,
          url: params.record.url,
          published_at: params.record.published_at,
          canonical_url: params.record.canonical_url,
        },
      };
    } catch (error) {
      const message = asErrorMessage(error);
      const isTimeout = message.includes("summary timeout");

      if (attempt < maxAttempts) {
        continue;
      }

      return {
        success: false,
        failure: {
          source_type: params.record.source_type,
          source_name: params.record.source_name,
          url: params.record.url,
          canonical_url: params.record.canonical_url,
          failure_type: isTimeout ? "summary_timeout" : "summary_call_failed",
          detail: message,
          attempt,
        },
      };
    }
  }

  return {
    success: false,
    failure: {
      source_type: params.record.source_type,
      source_name: params.record.source_name,
      url: params.record.url,
      canonical_url: params.record.canonical_url,
      failure_type: "unexpected",
      detail: "未知摘要失败",
    },
  };
}

export interface AggregateDigestResult {
  markdown: string;
  markdownPath: string;
  pdfPath: string;
  manifestPath: string;
  manifest: DigestManifest;
  digestItems: DigestItem[];
}

export async function aggregateDigest(
  input: AggregationInput,
  options: AggregateDigestOptions = {},
  dependencies: {
    summaryFn?: SummaryFn;
    pdfRenderFn?: PdfRenderFn;
  } = {},
): Promise<AggregateDigestResult> {
  const now = options.now ?? new Date();
  const windowHours = options.windowHours ?? 24;
  const outputDir =
    options.outputDir ||
    (await readReportOutputDirectory(process.cwd())).path;
  const summaryConcurrency = options.summaryConcurrency ?? 4;
  const summaryTimeoutMs = options.summaryTimeoutMs ?? 45_000;
  const summaryRetryCount = options.summaryRetryCount ?? 2;
  const minContentLength = options.minContentLength ?? 30;
  const debugProgress = options.debugProgress ?? false;
  const progressEvery = Math.max(1, options.progressEvery ?? 10);
  const abortOnTimeout = options.abortOnTimeout ?? false;
  const failures: AggregateFailureItem[] = [];

  const inputCount = CHANNEL_ORDER.reduce(
    (acc, sourceType) => acc + input[sourceType].records.length,
    0,
  );

  const prepared = flattenAndFilterRecords({
    input,
    now,
    windowHours,
    minContentLength,
    failures,
  });

  const deduped = dedupeRecords(prepared);
  const filteredCount = inputCount - prepared.length;
  const dedupedCount = prepared.length - deduped.length;

  const basePrompt = await loadBasePrompt();
  const effectivePrompt = buildEffectivePrompt(basePrompt, options.userPrompt);

  const summaryFn = dependencies.summaryFn || createSummaryFn();
  const totalToSummarize = deduped.length;
  let summaryDone = 0;
  let summaryOk = 0;
  let summaryFailed = 0;

  if (debugProgress) {
    console.log(
      JSON.stringify(
        {
          stage: "aggregate_summary_start",
          total: totalToSummarize,
          concurrency: summaryConcurrency,
          timeout_ms: summaryTimeoutMs,
          retry_count: summaryRetryCount,
          abort_on_timeout: abortOnTimeout,
        },
        null,
        2,
      ),
    );
  }

  const summaryResults = await mapLimit(
    deduped,
    summaryConcurrency,
    async (record) => {
      const result = await summarizeRecord({
        record,
        effectivePrompt,
        summaryFn,
        timeoutMs: summaryTimeoutMs,
        retryCount: summaryRetryCount,
        abortOnTimeout,
      });

      summaryDone += 1;
      if (result.success) {
        summaryOk += 1;
      } else {
        summaryFailed += 1;
      }

      if (
        debugProgress &&
        (summaryDone % progressEvery === 0 || summaryDone === totalToSummarize)
      ) {
        console.log(
          JSON.stringify(
            {
              stage: "aggregate_summary_progress",
              done: summaryDone,
              total: totalToSummarize,
              success: summaryOk,
              failed: summaryFailed,
            },
            null,
            2,
          ),
        );
      }

      return result;
    },
  );

  const digestItems: DigestItem[] = [];
  for (const item of summaryResults) {
    if (item.success) {
      digestItems.push(item.item);
    } else {
      failures.push(item.failure);
    }
  }

  digestItems.sort((a, b) => {
    const orderDiff =
      CHANNEL_ORDER_MAP[a.source_type] - CHANNEL_ORDER_MAP[b.source_type];
    if (orderDiff !== 0) {
      return orderDiff;
    }
    return (
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    );
  });

  const markdown = renderDigestMarkdown({
    items: digestItems,
    now,
  });

  await mkdir(resolve(process.cwd(), outputDir), { recursive: true });
  const baseName = options.outputBaseName || `digest-${toDigestTimestamp(now)}`;
  const markdownPath = normalizeOutputPath({
    outputDir,
    filename: `${baseName}.md`,
  });
  const pdfPath = normalizeOutputPath({
    outputDir,
    filename: `${baseName}.pdf`,
  });
  const manifestPath = normalizeOutputPath({
    outputDir,
    filename: `${baseName}.manifest.json`,
  });

  await writeFile(markdownPath, markdown, "utf8");

  const pdfRenderFn = dependencies.pdfRenderFn || renderPdfFromMarkdown;
  let pdfRenderError: unknown = null;
  try {
    await pdfRenderFn({
      markdown,
      outputPath: pdfPath,
    });
  } catch (error) {
    failures.push({
      source_type: "telegram",
      source_name: "aggregate",
      url: "about:blank",
      failure_type: "pdf_render_failed",
      detail: asErrorMessage(error),
    });
    pdfRenderError = error;
  }

  const manifest: DigestManifest = {
    generated_at: now.toISOString(),
    timezone: options.timezone ?? "UTC+8",
    input_count: inputCount,
    filtered_count: filteredCount,
    deduped_count: dedupedCount,
    summary_success_count: digestItems.length,
    summary_failure_count: failures.filter((item) =>
      [
        "summary_timeout",
        "summary_call_failed",
        "summary_format_invalid",
      ].includes(item.failure_type),
    ).length,
    output_markdown: markdownPath,
    output_pdf: pdfPath,
    failed_items: failures,
  };

  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  if (pdfRenderError) {
    throw pdfRenderError;
  }

  return {
    markdown,
    markdownPath,
    pdfPath,
    manifestPath,
    manifest,
    digestItems,
  };
}
