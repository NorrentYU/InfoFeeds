export type YoutubeSummaryProvider = "default" | "notebooklm";

export function resolveYoutubeSummaryProvider(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): YoutubeSummaryProvider {
  const normalizedArgs = args.map((arg) => arg.trim().toLowerCase());
  if (normalizedArgs.includes("notebooklm")) {
    return "notebooklm";
  }

  const explicit = env.FULLTEST_YOUTUBE_SUMMARY_PROVIDER?.trim().toLowerCase();
  if (explicit === "notebooklm") {
    return "notebooklm";
  }

  if (env.npm_config_notebooklm === "true") {
    return "notebooklm";
  }

  return "default";
}
