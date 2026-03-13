import { writeFile } from "node:fs/promises";
import { fetchOthersSources } from "./index.js";

const SOURCES = [
  "https://every.to/chain-of-thought/",
  "https://every.to/napkin-math/",
];

async function main(): Promise<void> {
  const result = await fetchOthersSources(SOURCES, {
    latestCountPerSource: 2,
    retryCount: 1,
    timeoutMs: 20000,
    maxItemsPerSource: 80,
  });

  await writeFile(
    new URL("../../reports/others-sample-output.json", import.meta.url),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        records: result.records.length,
        failures: result.failures.length,
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
