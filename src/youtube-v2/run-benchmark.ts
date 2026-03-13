import { loadSourceList } from "../fulltest/source-list.js";
import {
  runYoutubeV2Benchmark,
  writeYoutubeV2BenchmarkReport,
} from "./benchmark.js";

async function main(): Promise<void> {
  const groups = await loadSourceList("sourceList.md");
  const summary = await runYoutubeV2Benchmark(groups.youtube, {
    sourceConcurrency: 4,
    fetchOptions: {
      timeoutMs: 30000,
      retryCount: 1,
      jobConcurrency: 2,
      detailsConcurrency: 2,
      captionConcurrency: 2,
    },
    onProgress(event) {
      if (event.phase === "start") {
        console.log(
          `SOURCE_START ${event.index}/${event.total} ${event.source}`,
        );
        return;
      }

      console.log(
        `SOURCE_DONE ${event.index}/${event.total} ${event.source} elapsed_ms=${event.elapsedMs} records=${event.records} failures=${event.failures}`,
      );
    },
  });

  const outputPath = await writeYoutubeV2BenchmarkReport({ summary });
  console.log(`SUMMARY_DONE ${outputPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
