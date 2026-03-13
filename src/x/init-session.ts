import { fetchXForYou } from "./index.js";

async function main(): Promise<void> {
  const timeoutMinutes = Number(process.env.X_MANUAL_TIMEOUT_MINUTES || "8");
  const manualTimeoutMs = Number.isFinite(timeoutMinutes)
    ? Math.max(1, timeoutMinutes) * 60 * 1000
    : 8 * 60 * 1000;

  const result = await fetchXForYou({
    mode: "test",
    limit: 1,
    preferCdp: false,
    headless: false,
    retryCount: 0,
    allowPasswordLogin: false,
    allowManualTakeover: true,
    manualTimeoutMs,
  });

  console.log(
    JSON.stringify(
      {
        records: result.records.length,
        failures: result.failures.length,
        first_record_url: result.records[0]?.url || null,
        first_failure: result.failures[0]?.failure_type || null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
