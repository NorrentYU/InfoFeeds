import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aggregateDigest } from "../../src/aggregate/index.js";

describe("aggregate summary retry", () => {
  it("retries summary generation up to configured count", async () => {
    let attempts = 0;

    const input = {
      telegram: { records: [], failures: [] },
      x: {
        records: [
          {
            source_type: "x" as const,
            source_name: "for_you",
            title: "",
            content: "This is long enough content with context and 2026 number.",
            url: "https://x.com/a/status/1",
            published_at: "2026-03-06T00:00:00.000Z",
            fetched_at: "2026-03-06T01:00:00.000Z",
          },
        ],
        failures: [],
      },
      substack: { records: [], failures: [] },
      youtube: { records: [], failures: [] },
      others: { records: [], failures: [] },
    };

    const outDir = join(tmpdir(), "infofeeds-aggregate-retry");

    await aggregateDigest(
      input,
      {
        now: new Date("2026-03-06T02:00:00.000Z"),
        outputDir: outDir,
        outputBaseName: "digest-retry",
        summaryRetryCount: 2,
      },
      {
        summaryFn: async () => {
          attempts += 1;
          if (attempts < 3) {
            return "摘要不可用：正文无效";
          }
          return "**标题**\n\n摘要正文";
        },
        pdfRenderFn: async ({ outputPath }) => {
          await writeFile(outputPath, "PDF", "utf8");
        },
      },
    );

    expect(attempts).toBe(3);
  });
});
