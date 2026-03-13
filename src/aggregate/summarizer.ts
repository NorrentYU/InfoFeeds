import type { SummaryFn, SummaryRequest } from "./types.js";
import { readEnvValue } from "../common/env.js";
import {
  readAnthropicLlmConfig,
  readOpenAiCompatibleLlmConfig,
} from "../common/aggregate-llm.js";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitSentences(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/(?<=[。！？!?\.])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickSentences(content: string, maxSentences: number): string[] {
  const sentences = splitSentences(content);
  if (sentences.length <= maxSentences) {
    return sentences;
  }

  const withNumbers = sentences.filter((line) => /\d/.test(line));
  const selected: string[] = [];

  for (const line of withNumbers) {
    if (!selected.includes(line)) {
      selected.push(line);
    }
    if (selected.length >= maxSentences) {
      return selected;
    }
  }

  for (const line of sentences) {
    if (!selected.includes(line)) {
      selected.push(line);
    }
    if (selected.length >= maxSentences) {
      break;
    }
  }

  return selected;
}

function localSummary(request: SummaryRequest): string {
  const sourceTitle = request.title?.trim() || "内容摘要";
  const sentences = pickSentences(request.content, 3);
  const paragraph = sentences.join(" ") || normalizeWhitespace(request.content).slice(0, 260);

  return `**${sourceTitle}**\n\n${paragraph}`;
}

function extractTextFromResponsesPayload(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (Array.isArray(payload?.output)) {
    const chunks: string[] = [];
    for (const item of payload.output) {
      if (!Array.isArray(item?.content)) {
        continue;
      }
      for (const c of item.content) {
        if (typeof c?.text === "string" && c.text.trim()) {
          chunks.push(c.text.trim());
        }
      }
    }
    const merged = chunks.join("\n").trim();
    if (merged) {
      return merged;
    }
  }

  return "";
}

function extractTextFromChatCompletionsPayload(payload: any): string {
  if (!Array.isArray(payload?.choices)) {
    return "";
  }

  const chunks: string[] = [];
  for (const choice of payload.choices) {
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) {
      chunks.push(content.trim());
      continue;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part?.text === "string" && part.text.trim()) {
          chunks.push(part.text.trim());
        }
      }
    }
  }

  return chunks.join("\n").trim();
}

async function readConfigValue(key: string): Promise<string | undefined> {
  return await readEnvValue(key);
}

function extractTextFromAnthropicPayload(payload: any): string {
  if (!Array.isArray(payload?.content)) {
    return "";
  }

  const chunks: string[] = [];
  for (const block of payload.content) {
    if (block?.type === "text" && typeof block?.text === "string" && block.text.trim()) {
      chunks.push(block.text.trim());
    }
  }

  return chunks.join("\n").trim();
}

async function anthropicSummary(request: SummaryRequest): Promise<string> {
  const config = await readAnthropicLlmConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("ANTHROPIC_API_KEY missing");
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": config.version,
    },
    signal: request.signal,
    body: JSON.stringify({
      model: config.model,
      max_tokens: 700,
      temperature: 0.2,
      messages: [{ role: "user", content: request.prompt }],
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(
      `anthropic http ${response.status}${raw ? `: ${raw.slice(0, 200)}` : ""}`,
    );
  }

  const payload = await response.json();
  const text = extractTextFromAnthropicPayload(payload);
  if (!text) {
    throw new Error("anthropic empty output");
  }

  return text;
}

async function openAiCompatibleSummary(
  request: SummaryRequest,
): Promise<string> {
  const config = await readOpenAiCompatibleLlmConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("LLM_API_KEY missing");
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    signal: request.signal,
    body:
      config.apiStyle === "responses"
        ? JSON.stringify({
            model: config.model,
            input: request.prompt,
            temperature: 0.2,
            max_output_tokens: 500,
          })
        : JSON.stringify({
            model: config.model,
            messages: [{ role: "user", content: request.prompt }],
            temperature: 0.2,
            max_tokens: 700,
            stream: false,
          }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(
      `${config.providerName.toLowerCase()} http ${response.status}${raw ? `: ${raw.slice(0, 200)}` : ""}`,
    );
  }

  const payload = await response.json();
  const text =
    config.apiStyle === "responses"
      ? extractTextFromResponsesPayload(payload)
      : extractTextFromChatCompletionsPayload(payload);
  if (!text) {
    throw new Error(`${config.providerName.toLowerCase()} empty output`);
  }

  return text;
}

export function createSummaryFn(params: {
  forceLocal?: boolean;
} = {}): SummaryFn {
  return async (request: SummaryRequest): Promise<string> => {
    if (params.forceLocal) {
      return localSummary(request);
    }

    const compatConfig = await readOpenAiCompatibleLlmConfig();
    const anthropicConfig = await readAnthropicLlmConfig();
    const useLocal = !compatConfig.configured && !anthropicConfig.configured;
    if (useLocal) {
      return localSummary(request);
    }
    if (compatConfig.configured) {
      return openAiCompatibleSummary(request);
    }
    if (anthropicConfig.configured) {
      return anthropicSummary(request);
    }
    return localSummary(request);
  };
}
