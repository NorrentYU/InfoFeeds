import { writeFile } from "node:fs/promises";
import { fetchXForYou } from "./index.js";

async function main(): Promise<void> {
  const testResult = await fetchXForYou({
    mode: "test",
    preferCdp: true,
    allowFallbackAfterCdpFailure: true,
    headless: true,
    retryCount: 1,
    allowManualTakeover: false,
  });

  const productionResult = await fetchXForYou({
    mode: "production",
    preferCdp: true,
    allowFallbackAfterCdpFailure: true,
    headless: true,
    retryCount: 1,
    allowManualTakeover: false,
  });

  const output = {
    test_mode: testResult,
    production_mode: productionResult,
  };

  await writeFile(
    new URL("../../reports/x-sample-output.json", import.meta.url),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        test_records: testResult.records.length,
        test_failures: testResult.failures.length,
        production_records: productionResult.records.length,
        production_failures: productionResult.failures.length,
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
