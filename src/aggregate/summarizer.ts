import type { SummaryFn, SummaryRequest } from "./types.js";
import { readEnvValue } from "../common/env.js";
import { readOpenAiCompatibleLlmConfig } from "../common/aggregate-llm.js";

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

function normalizeGeminiModel(raw?: string): string {
  const fallback = "gemini-2.5-flash-lite";
  if (!raw || !raw.trim()) {
    return fallback;
  }

  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith("gemini-")) {
    return trimmed;
  }

  // Accept friendly names like "Gemini 3.1 Flash Lite".
  const normalized = trimmed
    .replace(/^gemini\s+/, "")
    .replace(/\s+/g, "-");
  return `gemini-${normalized}`;
}

function extractTextFromGeminiPayload(payload: any): string {
  if (!Array.isArray(payload?.candidates)) {
    return "";
  }

  const chunks: string[] = [];
  for (const candidate of payload.candidates) {
    if (!Array.isArray(candidate?.content?.parts)) {
      continue;
    }
    for (const part of candidate.content.parts) {
      if (typeof part?.text === "string" && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

async function geminiSummary(request: SummaryRequest): Promise<string> {
  const apiKey = await readConfigValue("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY missing");
  }

  const primaryModel = normalizeGeminiModel(await readConfigValue("GEMINI_MODEL"));
  const candidates = Array.from(
    new Set(
      primaryModel === "gemini-2.5-flash-lite"
        ? [primaryModel]
        : [primaryModel, "gemini-2.5-flash-lite"],
    ),
  );

  let lastError = "gemini request failed";
  for (const model of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: request.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600,
        },
      }),
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      lastError = `gemini http ${response.status}${raw ? `: ${raw.slice(0, 200)}` : ""}`;

      // Fallback to the next model only when the current model is unavailable.
      if (response.status === 404 || response.status === 400) {
        continue;
      }
      throw new Error(lastError);
    }

    const payload = await response.json();
    const text = extractTextFromGeminiPayload(payload);
    if (text) {
      return text;
    }

    const blockReason = payload?.promptFeedback?.blockReason;
    if (typeof blockReason === "string" && blockReason.trim()) {
      throw new Error(`gemini blocked: ${blockReason}`);
    }
    lastError = "gemini empty output";
  }

  throw new Error(lastError);
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
    const geminiApiKey = await readConfigValue("GEMINI_API_KEY");
    const useLocal = !compatConfig.configured && !geminiApiKey;
    if (useLocal) {
      return localSummary(request);
    }
    if (compatConfig.configured) {
      return openAiCompatibleSummary(request);
    }
    if (geminiApiKey) {
      return geminiSummary(request);
    }
    return localSummary(request);
  };
}
