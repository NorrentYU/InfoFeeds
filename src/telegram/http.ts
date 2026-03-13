export interface FetchTextOptions {
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
}

export interface FetchTextResult {
  body: string;
  finalUrl: string;
  attempt: number;
  status: number;
}

export class FetchTextError extends Error {
  readonly retryable: boolean;
  readonly attempt: number;
  readonly status?: number;

  constructor(message: string, options: { retryable: boolean; attempt: number; status?: number }) {
    super(message);
    this.name = "FetchTextError";
    this.retryable = options.retryable;
    this.attempt = options.attempt;
    this.status = options.status;
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function fetchTextWithRetry(
  url: string,
  partialOptions: Partial<FetchTextOptions> = {}
): Promise<FetchTextResult> {
  const options: FetchTextOptions = {
    timeoutMs: partialOptions.timeoutMs ?? 15000,
    retryCount: partialOptions.retryCount ?? 1,
    retryDelayMs: partialOptions.retryDelayMs ?? 800
  };

  let lastError: FetchTextError | null = null;

  for (let attempt = 1; attempt <= options.retryCount + 1; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml"
        }
      });

      if (!response.ok) {
        const retryable = RETRYABLE_STATUS.has(response.status);
        throw new FetchTextError(`HTTP ${response.status}`, {
          retryable,
          attempt,
          status: response.status
        });
      }

      const body = await response.text();
      return {
        body,
        finalUrl: response.url,
        attempt,
        status: response.status
      };
    } catch (error) {
      const normalized =
        error instanceof FetchTextError
          ? error
          : new FetchTextError(asErrorMessage(error), {
              retryable: true,
              attempt
            });

      lastError = normalized;

      if (!normalized.retryable || attempt > options.retryCount) {
        throw normalized;
      }

      await sleep(options.retryDelayMs * attempt);
    }
  }

  throw (
    lastError ||
    new FetchTextError("unknown network error", {
      retryable: false,
      attempt: 1
    })
  );
}
