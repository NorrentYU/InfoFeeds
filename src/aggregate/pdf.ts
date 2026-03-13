import { chromium } from "playwright";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInlineMarkdown(input: string): string {
  let html = escapeHtml(input);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2">$1</a>',
  );
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>',
  );
  return html;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  const paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) {
      return;
    }
    const content = paragraph.map((line) => renderInlineMarkdown(line)).join("<br />");
    blocks.push(`<p>${content}</p>`);
    paragraph.length = 0;
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      flushParagraph();
      blocks.push(`<h1>${renderInlineMarkdown(h1[1] || "")}</h1>`);
      continue;
    }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      flushParagraph();
      blocks.push(`<h2>${renderInlineMarkdown(h2[1] || "")}</h2>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks.join("\n");
}

export async function renderPdfFromMarkdown(params: {
  markdown: string;
  outputPath: string;
}): Promise<void> {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const body = markdownToHtml(params.markdown);
    const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;line-height:1.7;font-size:13px;color:#111;}
h1{font-size:28px;line-height:1.25;margin:0 0 14px;font-weight:700;}
h2{font-size:20px;line-height:1.35;margin:22px 0 10px;font-weight:700;}
p{margin:0 0 10px;white-space:normal;word-break:break-word;}
a{color:#0f5fcd;text-decoration:none;}
strong{font-weight:700;}
</style></head><body><main>${body}</main></body></html>`;

    await page.setContent(html, {
      waitUntil: "networkidle",
    });

    await page.pdf({
      path: params.outputPath,
      format: "A4",
      margin: {
        top: "16mm",
        right: "12mm",
        bottom: "16mm",
        left: "12mm",
      },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}
