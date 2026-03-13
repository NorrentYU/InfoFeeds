import { mkdir, writeFile } from "node:fs/promises";
import { fetchXForYou } from "./index.js";

function toInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

async function main(): Promise<void> {
  const endpoint = process.env.X_CDP_ENDPOINT || "http://127.0.0.1:9222";
  const limit = toInt(process.env.X_CDP_LIMIT, 5);
  const now = new Date();

  const result = await fetchXForYou({
    mode: "test",
    limit,
    now,
    cdpEndpoint: endpoint,
    preferCdp: true,
    allowFallbackAfterCdpFailure: false,
    allowPasswordLogin: false,
    allowManualTakeover: false,
    retryCount: 0,
  });

  const output = {
    endpoint,
    limit,
    fetched_at: now.toISOString(),
    records: result.records,
    failures: result.failures,
  };

  await mkdir("reports", { recursive: true });
  await writeFile("reports/x-cdp-smoke.json", `${JSON.stringify(output, null, 2)}\n`, "utf8");

  if (result.records.length === 0) {
    console.error(
      JSON.stringify(
        {
          endpoint,
          limit,
          records: 0,
          failures: result.failures.map((item) => ({
            failure_type: item.failure_type,
            detail: item.detail,
          })),
          output_file: "reports/x-cdp-smoke.json",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        endpoint,
        limit,
        records: result.records.length,
        output_file: "reports/x-cdp-smoke.json",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`[x:cdp-smoke] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
