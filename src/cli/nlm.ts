#!/usr/bin/env node
import { spawn } from "node:child_process";

async function main(): Promise<void> {
  const bin = process.env.INFOFEEDS_NLM_BIN;
  if (!bin) {
    throw new Error("INFOFEEDS_NLM_BIN missing");
  }

  const args = process.argv.slice(2);
  const child = spawn(bin, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ALL_PROXY: "",
      all_proxy: "",
      HTTPS_PROXY: "",
      https_proxy: "",
      HTTP_PROXY: "",
      http_proxy: "",
    },
    stdio: "inherit",
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
