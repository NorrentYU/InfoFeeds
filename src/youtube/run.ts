import { writeFile } from "node:fs/promises";
import { fetchYoutubeSources } from "./index.js";

const SOURCES = [
  "https://www.youtube.com/@PeterYangYT",
  "https://www.youtube.com/@Messari",
];

async function main(): Promise<void> {
  const result = await fetchYoutubeSources(SOURCES, {
    maxVideosPerSource: 6,
    retryCount: 1,
    timeoutMs: 30000,
  });

  await writeFile(
    new URL("../../reports/youtube-sample-output.json", import.meta.url),
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
