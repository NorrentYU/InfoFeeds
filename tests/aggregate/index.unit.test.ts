import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aggregateDigest } from "../../src/aggregate/index.js";
import type { AggregationInput, SummaryRequest } from "../../src/aggregate/types.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function emptyChannel() {
  return { records: [], failures: [] };
}

function baseInput(): AggregationInput {
  return {
    telegram: emptyChannel(),
    x: emptyChannel(),
    substack: emptyChannel(),
    youtube: emptyChannel(),
    others: emptyChannel(),
  };
}

describe("aggregate digest pipeline", () => {
  it("dedupes by canonical url and keeps longer content", async () => {
    const input = baseInput();
    input.telegram.records.push({
      source_type: "telegram",
      source_name: "tg",
      title: "A",
      content: "short content short content short content",
      url: "https://example.com/post?utm_source=tg",
      published_at: "2026-03-06T00:00:00.000Z",
      fetched_at: "2026-03-06T01:00:00.000Z",
    });
    input.others.records.push({
      source_type: "others",
      source_name: "other",
      title: "B",
      content: "long content ".repeat(40),
      url: "https://example.com/post",
      published_at: "2026-03-06T00:00:00.000Z",
      fetched_at: "2026-03-06T01:00:00.000Z",
    });

    const outDir = join(tmpdir(), "infofeeds-aggregate-unit-1");

    const result = await aggregateDigest(
      input,
      {
        now: new Date("2026-03-06T02:00:00.000Z"),
        outputDir: outDir,
        outputBaseName: "digest-unit-1",
        minContentLength: 10,
      },
      {
        summaryFn: async (request: SummaryRequest) => `**${request.title || "标题"}**\n\n摘要正文`,
        pdfRenderFn: async ({ outputPath }) => {
          await writeFile(outputPath, "PDF", "utf8");
        },
      },
    );

    expect(result.digestItems).toHaveLength(1);
    expect(result.digestItems[0]?.source_type).toBe("others");
    expect(result.manifest.deduped_count).toBe(1);
    expect(result.manifest.failed_items.some((f) => f.failure_type === "deduped")).toBe(false);
  });

  it("applies default prompt and user prompt together", async () => {
    const input = baseInput();
    input.x.records.push({
      source_type: "x",
      source_name: "for_you",
      title: "",
      content: "This is a sufficiently long tweet content with 123 numbers and context.",
      url: "https://x.com/a/status/1",
      published_at: "2026-03-06T00:00:00.000Z",
      fetched_at: "2026-03-06T01:00:00.000Z",
    });

    const outDir = join(tmpdir(), "infofeeds-aggregate-unit-2");
    let capturedPrompt = "";

    await aggregateDigest(
      input,
      {
        now: new Date("2026-03-06T02:00:00.000Z"),
        outputDir: outDir,
        outputBaseName: "digest-unit-2",
        userPrompt: "请强调风险与数据。",
      },
      {
        summaryFn: async (request: SummaryRequest) => {
          capturedPrompt = request.prompt;
          return "**标题**\n\n摘要正文";
        },
        pdfRenderFn: async ({ outputPath }) => {
          await writeFile(outputPath, "PDF", "utf8");
        },
      },
    );

    expect(capturedPrompt.includes("早报摘要生成 Prompt")).toBe(true);
    expect(capturedPrompt.includes("附加用户约束")).toBe(true);
    expect(capturedPrompt.includes("请强调风险与数据。")).toBe(true);
  });

  it("records summary failures in manifest without blocking report", async () => {
    const input = baseInput();
    input.substack.records.push({
      source_type: "substack",
      source_name: "a",
      title: "A",
      content: "valid content ".repeat(20),
      url: "https://a.com/p/1",
      published_at: "2026-03-06T00:00:00.000Z",
      fetched_at: "2026-03-06T01:00:00.000Z",
    });
    input.substack.records.push({
      source_type: "substack",
      source_name: "b",
      title: "B",
      content: "valid content ".repeat(20),
      url: "https://b.com/p/2",
      published_at: "2026-03-06T00:00:00.000Z",
      fetched_at: "2026-03-06T01:00:00.000Z",
    });

    const outDir = join(tmpdir(), "infofeeds-aggregate-unit-3");

    const result = await aggregateDigest(
      input,
      {
        now: new Date("2026-03-06T02:00:00.000Z"),
        outputDir: outDir,
        outputBaseName: "digest-unit-3",
      },
      {
        summaryFn: async (request: SummaryRequest) => {
          if (request.url.includes("b.com")) {
            return "摘要不可用：正文无效";
          }
          return "**标题**\n\n摘要正文";
        },
        pdfRenderFn: async ({ outputPath }) => {
          await writeFile(outputPath, "PDF", "utf8");
        },
      },
    );

    const manifestRaw = await readFile(result.manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw);

    expect(result.digestItems).toHaveLength(1);
    expect(manifest.summary_failure_count).toBe(1);
    expect(
      manifest.failed_items.some(
        (item: any) => item.failure_type === "summary_format_invalid" && item.url.includes("b.com"),
      ),
    ).toBe(true);
  });

  it("keeps telegram downgrade records with empty url and renders N/A link", async () => {
    const input = baseInput();
    input.telegram.records.push({
      source_type: "telegram",
      source_name: "tg",
      title: "降级样例",
      content: "无外链但正文足够长 ".repeat(20),
      url: "",
      published_at: "2026-03-06T00:00:00.000Z",
      fetched_at: "2026-03-06T01:00:00.000Z",
    });

    const outDir = join(tmpdir(), "infofeeds-aggregate-unit-4");
    const result = await aggregateDigest(
      input,
      {
        now: new Date("2026-03-06T02:00:00.000Z"),
        outputDir: outDir,
        outputBaseName: "digest-unit-4",
      },
      {
        summaryFn: async () => "**标题**\n\n摘要正文",
        pdfRenderFn: async ({ outputPath }) => {
          await writeFile(outputPath, "PDF", "utf8");
        },
      },
    );

    expect(result.digestItems).toHaveLength(1);
    expect(result.digestItems[0]?.source_type).toBe("telegram");
    expect(result.markdown.includes("原链接：N/A（无外链）")).toBe(true);
  });

  it("does not re-filter youtube records by aggregate window", async () => {
    const input = baseInput();
    input.youtube.records.push({
      source_type: "youtube",
      source_name: "live-channel",
      title: "Delayed live transcript",
      content: "valid transcript ".repeat(30),
      url: "https://www.youtube.com/watch?v=delayed-live",
      published_at: "2026-03-04T14:00:00.000Z",
      fetched_at: "2026-03-06T01:00:00.000Z",
    });

    const outDir = join(tmpdir(), "infofeeds-aggregate-unit-5");
    const result = await aggregateDigest(
      input,
      {
        now: new Date("2026-03-06T02:00:00.000Z"),
        windowHours: 24,
        outputDir: outDir,
        outputBaseName: "digest-unit-5",
      },
      {
        summaryFn: async () => "**标题**\n\n摘要正文",
        pdfRenderFn: async ({ outputPath }) => {
          await writeFile(outputPath, "PDF", "utf8");
        },
      },
    );

    expect(result.digestItems).toHaveLength(1);
    expect(result.digestItems[0]?.source_type).toBe("youtube");
    expect(
      result.manifest.failed_items.some((item) =>
        item.detail.includes("超出聚合窗口"),
      ),
    ).toBe(false);
  });

  it("uses REPORT_OUTPUT_DIR when outputDir is not passed", async () => {
    const input = baseInput();
    input.telegram.records.push({
      source_type: "telegram",
      source_name: "tg",
      title: "Output dir sample",
      content: "正文足够长 ".repeat(20),
      url: "https://example.com/output-dir",
      published_at: "2026-03-06T00:00:00.000Z",
      fetched_at: "2026-03-06T01:00:00.000Z",
    });

    const outDir = join(tmpdir(), "infofeeds-aggregate-unit-env-output");
    process.env.REPORT_OUTPUT_DIR = outDir;

    const result = await aggregateDigest(
      input,
      {
        now: new Date("2026-03-06T02:00:00.000Z"),
        outputBaseName: "digest-unit-env-output",
      },
      {
        summaryFn: async () => "**标题**\n\n摘要正文",
        pdfRenderFn: async ({ outputPath }) => {
          await writeFile(outputPath, "PDF", "utf8");
        },
      },
    );

    expect(result.markdownPath.startsWith(outDir)).toBe(true);
    expect(result.pdfPath.startsWith(outDir)).toBe(true);
    expect(result.manifestPath.startsWith(outDir)).toBe(true);
  });
});
