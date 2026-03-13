import { readEnvValue } from "./env.js";

export type AggregateProvider = "openai_compatible" | "gemini" | "local";
export type OpenAiCompatibleApiStyle = "chat_completions" | "responses";

export interface OpenAiCompatibleLlmConfig {
  configured: boolean;
  providerName: string;
  apiKey: string | null;
  model: string;
  baseUrl: string;
  endpoint: string;
  apiStyle: OpenAiCompatibleApiStyle;
  source: "llm" | "openai" | "bailian" | null;
}

export interface AggregateProviderState {
  activeProvider: AggregateProvider;
  providerName: string;
  configured: {
    openai_compatible: boolean;
    gemini: boolean;
  };
  aliases: {
    llm: boolean;
    openai: boolean;
    bailian: boolean;
  };
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  const value = raw?.trim() || fallback;
  return value.replace(/\/+$/, "");
}

function buildEndpoint(rawBaseUrl: string | undefined, fallback: string): {
  endpoint: string;
  apiStyle: OpenAiCompatibleApiStyle;
  baseUrl: string;
} {
  const baseUrl = normalizeBaseUrl(rawBaseUrl, fallback);
  if (baseUrl.endsWith("/responses")) {
    return {
      endpoint: baseUrl,
      apiStyle: "responses",
      baseUrl,
    };
  }
  if (baseUrl.endsWith("/chat/completions")) {
    return {
      endpoint: baseUrl,
      apiStyle: "chat_completions",
      baseUrl,
    };
  }
  return {
    endpoint: `${baseUrl}/chat/completions`,
    apiStyle: "chat_completions",
    baseUrl,
  };
}

export async function readOpenAiCompatibleLlmConfig(): Promise<OpenAiCompatibleLlmConfig> {
  const llmApiKey = await readEnvValue("LLM_API_KEY");
  const openAiApiKey = await readEnvValue("OPENAI_API_KEY");
  const bailianApiKey = await readEnvValue("BAILIAN_API_KEY");

  if (llmApiKey) {
    const baseUrlRaw =
      (await readEnvValue("LLM_API_URL")) ||
      (await readEnvValue("OPENAI_BASE_URL"));
    const endpoint = buildEndpoint(baseUrlRaw, "https://api.openai.com/v1");
    return {
      configured: true,
      providerName: (await readEnvValue("LLM_PROVIDER_NAME")) || "OpenAI Compatible",
      apiKey: llmApiKey,
      model: (await readEnvValue("LLM_MODEL")) || "gpt-4.1-mini",
      baseUrl: endpoint.baseUrl,
      endpoint: endpoint.endpoint,
      apiStyle: endpoint.apiStyle,
      source: "llm",
    };
  }

  if (openAiApiKey) {
    const baseUrlRaw = await readEnvValue("OPENAI_BASE_URL");
    const endpoint = buildEndpoint(baseUrlRaw, "https://api.openai.com/v1");
    return {
      configured: true,
      providerName: "OpenAI",
      apiKey: openAiApiKey,
      model:
        (await readEnvValue("OPENAI_MODEL")) ||
        (await readEnvValue("LLM_MODEL")) ||
        "gpt-4.1-mini",
      baseUrl: endpoint.baseUrl,
      endpoint: endpoint.endpoint,
      apiStyle: endpoint.apiStyle,
      source: "openai",
    };
  }

  if (bailianApiKey) {
    const baseUrlRaw = await readEnvValue("BAILIAN_BASE_URL");
    const endpoint = buildEndpoint(
      baseUrlRaw,
      "https://coding.dashscope.aliyuncs.com/v1",
    );
    return {
      configured: true,
      providerName: "Bailian",
      apiKey: bailianApiKey,
      model:
        (await readEnvValue("BAILIAN_MODEL")) ||
        (await readEnvValue("LLM_MODEL")) ||
        "qwen-plus-latest",
      baseUrl: endpoint.baseUrl,
      endpoint: endpoint.endpoint,
      apiStyle: endpoint.apiStyle,
      source: "bailian",
    };
  }

  return {
    configured: false,
    providerName: (await readEnvValue("LLM_PROVIDER_NAME")) || "OpenAI Compatible",
    apiKey: null,
    model: (await readEnvValue("LLM_MODEL")) || "gpt-4.1-mini",
    baseUrl: normalizeBaseUrl(
      (await readEnvValue("LLM_API_URL")) ||
        (await readEnvValue("OPENAI_BASE_URL")),
      "https://api.openai.com/v1",
    ),
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiStyle: "chat_completions",
    source: null,
  };
}

export async function readAggregateProviderState(): Promise<AggregateProviderState> {
  const openAiCompatible = await readOpenAiCompatibleLlmConfig();
  const geminiConfigured = Boolean(await readEnvValue("GEMINI_API_KEY"));

  if (openAiCompatible.configured) {
    return {
      activeProvider: "openai_compatible",
      providerName: openAiCompatible.providerName,
      configured: {
        openai_compatible: true,
        gemini: geminiConfigured,
      },
      aliases: {
        llm: openAiCompatible.source === "llm",
        openai: openAiCompatible.source === "openai",
        bailian: openAiCompatible.source === "bailian",
      },
    };
  }

  if (geminiConfigured) {
    return {
      activeProvider: "gemini",
      providerName: "Gemini",
      configured: {
        openai_compatible: false,
        gemini: true,
      },
      aliases: {
        llm: false,
        openai: false,
        bailian: false,
      },
    };
  }

  return {
    activeProvider: "local",
    providerName: "Local Fallback",
    configured: {
      openai_compatible: false,
      gemini: false,
    },
    aliases: {
      llm: false,
      openai: false,
      bailian: false,
    },
  };
}
