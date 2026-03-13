import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { aggregateDigest } from "../../src/aggregate/index.js";
import type { AggregationInput } from "../../src/aggregate/types.js";

function buildInput(): AggregationInput {
  const now = "2026-03-06T01:00:00.000Z";

  return {
    telegram: {
      records: [
        {
          source_type: "telegram",
          source_name: "cookiesreads",
          title: "TG",
          content: "Telegram body with enough details 123 and data.",
          url: "https://example.com/tg-1",
          published_at: now,
          fetched_at: now,
        },
      ],
      failures: [],
    },
    x: {
      records: [
        {
          source_type: "x",
          source_name: "for_you",
          title: "",
          content: "X body with enough details 456 and context.",
          url: "https://x.com/a/status/1",
          published_at: now,
          fetched_at: now,
        },
      ],
      failures: [],
    },
    substack: {
      records: [
        {
          source_type: "substack",
          source_name: "astralcodexten.com",
          title: "Substack",
          content: "Substack body with enough details 789 and context.",
          url: "https://substack.example/p/1",
          published_at: now,
          fetched_at: now,
        },
      ],
      failures: [],
    },
    youtube: {
      records: [
        {
          source_type: "youtube",
          source_name: "PeterYangYT",
          title: "YouTube",
          content: "YouTube transcript body with enough details 999 and context.",
          url: "https://youtube.com/watch?v=abc",
          published_at: now,
          fetched_at: now,
        },
      ],
      failures: [],
    },
    others: {
      records: [
        {
          source_type: "others",
          source_name: "every.to/chain-of-thought",
          title: "Others",
          content: "Others body with enough details 1024 and context.",
          url: "https://every.to/chain-of-thought/p/a",
          published_at: now,
          fetched_at: now,
        },
      ],
      failures: [],
    },
  };
}

describe("aggregate local integration", () => {
  it("generates markdown/pdf/manifest with fixed section order", async () => {
    const input = buildInput();

    const result = await aggregateDigest(
      input,
      {
        now: new Date("2026-03-06T02:00:00.000Z"),
        outputDir: "reports",
        outputBaseName: "digest-test-integration",
      },
      {
        summaryFn: async (request) => `**${request.title || "X"}**\n\n${request.content.slice(0, 80)}`,
        pdfRenderFn: async ({ markdown, outputPath }) => {
          await writeFile(outputPath, markdown, "utf8");
        },
      },
    );

    const markdown = await readFile(result.markdownPath, "utf8");
    const pdfContent = await readFile(result.pdfPath, "utf8");
    const manifestRaw = await readFile(result.manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw);

    expect(markdown.indexOf("# 信息集会")).toBeGreaterThanOrEqual(0);
    expect(markdown.indexOf("## Telegram")).toBeLessThan(
      markdown.indexOf("## X"),
    );
    expect(markdown.indexOf("## X")).toBeLessThan(
      markdown.indexOf("## Substack"),
    );
    expect(markdown.indexOf("## Substack")).toBeLessThan(
      markdown.indexOf("## Youtube"),
    );
    expect(markdown.indexOf("## Youtube")).toBeLessThan(
      markdown.indexOf("## 其他"),
    );

    expect(markdown.includes("原链接：https://example.com/tg-1")).toBe(true);
    expect(markdown.includes("原链接：https://x.com/a/status/1")).toBe(true);
    expect(pdfContent).toBe(markdown);

    expect(manifest.input_count).toBe(5);
    expect(typeof manifest.output_markdown).toBe("string");
    expect(typeof manifest.output_pdf).toBe("string");
    expect(Array.isArray(manifest.failed_items)).toBe(true);
  });
});
