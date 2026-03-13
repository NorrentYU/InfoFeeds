import { readEnvValue } from "../common/env.js";
import { formatSchedulerError, runScheduledReportJob } from "./job.js";

async function main(): Promise<void> {
  const windowRaw =
    (await readEnvValue("SCHEDULE_WINDOW_HOURS")) ||
    (await readEnvValue("DELIVERY_WINDOW_HOURS"));
  const windowHours = windowRaw ? Number.parseInt(windowRaw, 10) : 24;

  await runScheduledReportJob({
    projectRoot: process.cwd(),
    windowHours:
      Number.isFinite(windowHours) && windowHours > 0 ? windowHours : 24,
  });
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        stage: "scheduler_once_failed",
        error: formatSchedulerError(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
