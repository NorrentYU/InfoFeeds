import { describe, expect, it } from "vitest";
import {
  normalizeSummaryOutput,
  normalizeTextForSummary,
  validateAggregateContent,
  validateSummaryOutput,
} from "../../src/aggregate/filters.js";

describe("aggregate filters", () => {
  it("does not reject content by blocker keywords", () => {
    const result = validateAggregateContent({
      record: {
        source_type: "telegram",
        source_name: "a",
        title: "t",
        content: "Just a moment... verify you are human.",
        url: "https://example.com",
        published_at: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      },
      minLength: 10,
    });

    expect(result.valid).toBe(true);
  });

  it("only rejects empty or clearly invalid summary output", () => {
    expect(
      validateSummaryOutput("**标题**\n\n这是第一段。\n\n这是第二段。"),
    ).toEqual({ valid: true });
    expect(validateSummaryOutput("- 这是一条列表")).toEqual({ valid: true });
    expect(validateSummaryOutput("普通段落摘要，不带 markdown 标题")).toEqual({
      valid: true,
    });
    expect(validateSummaryOutput("摘要不可用：正文无效")).toEqual({
      valid: false,
      reason: "摘要明显无效",
    });
  });

  it("truncates long text for summary input", () => {
    const text = normalizeTextForSummary("a".repeat(6000), 1000);
    expect(text.length).toBeGreaterThanOrEqual(1000);
    expect(text.endsWith("...")).toBe(true);
  });

  it("normalizes placeholder title output into concrete title format", () => {
    const out = normalizeSummaryOutput({
      summary: "**标题**（你基于内容重新拟定的中文标题，不超过20字）\n\n摘要正文（1-3个段落）",
      fallbackTitle: "真实文章标题",
      fallbackContent: "这是正文第一句。这是正文第二句。",
    });

    expect(out.startsWith("**真实文章标题**")).toBe(true);
    expect(out.includes("摘要正文（1-3个段落）")).toBe(false);
  });

  it("keeps generated title when model provides a concrete one", () => {
    const out = normalizeSummaryOutput({
      summary: "**AI芯片供给紧张**\n\n第一段。\n\n第二段。",
      fallbackTitle: "备用标题",
      fallbackContent: "正文内容",
    });

    expect(out.startsWith("**AI芯片供给紧张**")).toBe(true);
    expect(out.includes("第一段。")).toBe(true);
  });
});
