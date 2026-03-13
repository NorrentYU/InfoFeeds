import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toAbsoluteUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return `https://x.com${raw.startsWith("/") ? raw : `/${raw}`}`;
}

async function extractMainText(page: import("playwright").Page): Promise<string> {
  await page
    .waitForFunction(
      () => {
        const articleCount = document.querySelectorAll(
          "article[data-testid='tweet']",
        ).length;
        if (articleCount > 0) {
          return true;
        }
        const mainText = (document.querySelector("main")?.innerText || "")
          .replace(/\s+/g, " ")
          .trim();
        return mainText.length > 120;
      },
      null,
      { timeout: 10000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1000);

  return page.evaluate(() => {
    const first = document.querySelector("article[data-testid='tweet']");
    const tweetTextNodes = Array.from(
      first?.querySelectorAll("[data-testid='tweetText']") || [],
    );
    const tweetText = tweetTextNodes
      .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n\n");

    if (tweetText) {
      return tweetText;
    }

    const mainText = (document.querySelector("main")?.innerText || "")
      .replace(/\s+/g, " ")
      .trim();
    return mainText;
  });
}

async function main(): Promise<void> {
  const endpoint = process.env.X_CDP_ENDPOINT || "http://127.0.0.1:9222";
  const target =
    process.argv[2] ||
    "https://x.com/GoshawkTrades/status/2030249834943238202";

  const browser = await chromium.connectOverCDP(endpoint);
  try {
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("CDP connected but no browser context found");
    }

    const page = await context.newPage();
    await page.goto(toAbsoluteUrl(target), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const text = normalizeWhitespace(await extractMainText(page));
    const links = await page.evaluate(() => {
      const first = document.querySelector("article[data-testid='tweet']");
      const hrefs = Array.from(first?.querySelectorAll("a[href]") || [])
        .map((node) => node.getAttribute("href") || "")
        .filter(Boolean);
      return Array.from(new Set(hrefs));
    });

    const articleCandidate =
      links.find((href) => /\/article\/\d+/i.test(href)) ||
      links.find((href) => /\/i\/articles\/\d+/i.test(href)) ||
      links.find((href) => /\/i\/grok\/share\//i.test(href));

    let articleText = "";
    if (articleCandidate) {
      const articlePage = await context.newPage();
      try {
        await articlePage.goto(toAbsoluteUrl(articleCandidate), {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await articlePage
          .waitForFunction(
            () => {
              const mainText = (document.querySelector("main")?.innerText || "")
                .replace(/\s+/g, " ")
                .trim();
              return mainText.length > 200;
            },
            null,
            { timeout: 10000 },
          )
          .catch(() => {});
        await articlePage.waitForTimeout(1000);
        articleText = normalizeWhitespace(
          await articlePage.evaluate(
            () => document.querySelector("main")?.innerText || "",
          ),
        );
      } finally {
        await articlePage.close().catch(() => {});
      }
    }

    await page.close().catch(() => {});

    const output = {
      endpoint,
      target,
      extracted_text_length: text.length,
      extracted_text_preview: text.slice(0, 1200),
      links,
      article_candidate: articleCandidate || null,
      article_text_length: articleText.length,
      article_text_preview: articleText.slice(0, 1200),
      success: Boolean(articleText || text.length > 200),
      fetched_at: new Date().toISOString(),
    };

    await mkdir("reports", { recursive: true });
    await writeFile(
      "reports/x-status-probe.json",
      `${JSON.stringify(output, null, 2)}\n`,
      "utf8",
    );

    console.log(
      JSON.stringify(
        {
          target,
          success: output.success,
          extracted_text_length: output.extracted_text_length,
          article_text_length: output.article_text_length,
          output_file: "reports/x-status-probe.json",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(
    `[x:probe-status] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
