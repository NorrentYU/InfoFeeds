import { readEnvValue } from "../common/env.js";
import { formatSchedulerError, runScheduledReportJob } from "./job.js";
import { computeNextTriggerAt } from "./time.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readScheduleConfig(): Promise<{
  scheduleTime: string;
  timezone: string;
  leadMinutes: number;
  windowHours: number;
}> {
  const scheduleTime =
    (await readEnvValue("SCHEDULE_TIME")) ||
    (await readEnvValue("DELIVERY_TIME")) ||
    "09:30";
  const timezone =
    (await readEnvValue("SCHEDULE_TIMEZONE")) ||
    (await readEnvValue("DELIVERY_TIMEZONE")) ||
    "UTC+8";
  const leadRaw =
    (await readEnvValue("SCHEDULE_LEAD_MINUTES")) ||
    (await readEnvValue("DELIVERY_LEAD_MINUTES"));
  const windowRaw =
    (await readEnvValue("SCHEDULE_WINDOW_HOURS")) ||
    (await readEnvValue("DELIVERY_WINDOW_HOURS"));
  const leadMinutes = leadRaw ? Number.parseInt(leadRaw, 10) : 5;
  const windowHours = windowRaw ? Number.parseInt(windowRaw, 10) : 24;

  return {
    scheduleTime,
    timezone,
    leadMinutes:
      Number.isFinite(leadMinutes) && leadMinutes >= 0 ? leadMinutes : 5,
    windowHours:
      Number.isFinite(windowHours) && windowHours > 0 ? windowHours : 24,
  };
}

async function main(): Promise<void> {
  const config = await readScheduleConfig();
  console.log(
    JSON.stringify(
      {
        stage: "scheduler_boot",
        config,
        trigger_note:
          "backend trigger time = scheduled report time - lead minutes (generation advance)",
      },
      null,
      2,
    ),
  );

  // Long-running loop: wait until next trigger, execute one scheduled report job, then repeat.
  while (true) {
    const now = new Date();
    const next = computeNextTriggerAt({
      now,
      deliveryTime: config.scheduleTime,
      timezone: config.timezone,
      leadMinutes: config.leadMinutes,
    });
    const waitMs = Math.max(0, next.getTime() - now.getTime());

    console.log(
      JSON.stringify(
        {
          stage: "scheduler_wait",
          now: now.toISOString(),
          next_trigger: next.toISOString(),
          wait_ms: waitMs,
          wait_minutes: Number((waitMs / 60000).toFixed(2)),
        },
        null,
        2,
      ),
    );

    await sleep(waitMs);

    try {
      await runScheduledReportJob({
        projectRoot: process.cwd(),
        windowHours: config.windowHours,
      });
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            stage: "scheduler_job_failed",
            error: formatSchedulerError(error),
          },
          null,
          2,
        ),
      );
    }
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        stage: "scheduler_crash",
        error: formatSchedulerError(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
