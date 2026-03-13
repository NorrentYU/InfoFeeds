import { afterEach, describe, expect, it, vi } from "vitest";
import { createSummaryFn } from "../../src/aggregate/summarizer.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("aggregate summarizer provider", () => {
  it("uses local summarizer when forceLocal is true", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const summaryFn = createSummaryFn({ forceLocal: true });

    const out = await summaryFn({
      prompt: "p",
      source_type: "telegram",
      source_name: "tg",
      title: "测试标题",
      content: "第一句。第二句。第三句。",
      published_at: "2026-03-06T00:00:00.000Z",
      url: "https://example.com",
    });

    expect(out.startsWith("**测试标题**")).toBe(true);
  });

  it("uses OpenAI-compatible provider first when LLM_API_KEY is provided", async () => {
    process.env.LLM_PROVIDER_NAME = "OpenAI";
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_URL = "https://api.openai.com/v1";
    process.env.LLM_MODEL = "gpt-4.1-mini";
    process.env.GEMINI_API_KEY = "gemini-key";

    const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "**标题**\n\n摘要正文" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const summaryFn = createSummaryFn();
    const out = await summaryFn({
      prompt: "prompt",
      source_type: "substack",
      source_name: "s",
      title: "title",
      content: "content",
      published_at: "2026-03-06T00:00:00.000Z",
      url: "https://example.com/post",
    });

    expect(out).toContain("摘要正文");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(calledUrl).toContain("api.openai.com/v1/chat/completions");
  });

  it("accepts full chat-completions endpoint in LLM_API_URL", async () => {
    process.env.LLM_PROVIDER_NAME = "OpenAI";
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_MODEL = "gpt-4.1-mini";
    process.env.LLM_API_URL = "https://api.openai.com/v1/chat/completions";

    const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "**标题**\n\n摘要正文" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const summaryFn = createSummaryFn();
    const out = await summaryFn({
      prompt: "prompt",
      source_type: "telegram",
      source_name: "t",
      title: "title",
      content: "content",
      published_at: "2026-03-06T00:00:00.000Z",
      url: "https://example.com/post",
    });

    expect(out).toContain("摘要正文");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(calledUrl).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("keeps legacy Bailian aliases working", async () => {
    process.env.BAILIAN_API_KEY = "test-key";
    process.env.BAILIAN_MODEL = "qwen3-max-2026-01-23";
    process.env.BAILIAN_BASE_URL = "https://coding.dashscope.aliyuncs.com/v1";

    const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "**标题**\n\n摘要正文" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const summaryFn = createSummaryFn();
    const out = await summaryFn({
      prompt: "prompt",
      source_type: "telegram",
      source_name: "t",
      title: "title",
      content: "content",
      published_at: "2026-03-06T00:00:00.000Z",
      url: "https://example.com/post",
    });

    expect(out).toContain("摘要正文");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(calledUrl).toBe("https://coding.dashscope.aliyuncs.com/v1/chat/completions");
  });

  it("uses Gemini when GEMINI_API_KEY is provided", async () => {
    process.env.LLM_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.BAILIAN_API_KEY = "";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "Gemini 3.1 Flash Lite";

    const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "**标题**\\n\\n摘要正文" }] } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const summaryFn = createSummaryFn();
    const out = await summaryFn({
      prompt: "prompt",
      source_type: "x",
      source_name: "for_you",
      title: "",
      content: "content",
      published_at: "2026-03-06T00:00:00.000Z",
      url: "https://x.com/a/status/1",
    });

    expect(out).toContain("摘要正文");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(calledUrl).toContain("models/gemini-3.1-flash-lite:generateContent");
  });

  it("falls back to gemini-2.5-flash-lite when primary model is unavailable", async () => {
    process.env.LLM_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.BAILIAN_API_KEY = "";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-3.1-flash-lite";

    const fetchMock = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "model not found" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: "**标题**\\n\\n摘要正文" }] } },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const summaryFn = createSummaryFn();
    const out = await summaryFn({
      prompt: "prompt",
      source_type: "others",
      source_name: "n",
      title: "",
      content: "content",
      published_at: "2026-03-06T00:00:00.000Z",
      url: "https://example.com/post",
    });

    expect(out).toContain("摘要正文");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    const secondUrl = String(fetchMock.mock.calls[1]?.[0] || "");
    expect(firstUrl).toContain("models/gemini-3.1-flash-lite:generateContent");
    expect(secondUrl).toContain("models/gemini-2.5-flash-lite:generateContent");
  });
});
