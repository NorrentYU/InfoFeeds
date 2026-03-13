import { spawn } from "node:child_process";
import { resolve } from "node:path";

function shellBin(name: string): string {
  if (process.platform === "win32") {
    return `${name}.cmd`;
  }
  return name;
}

export function resolveTsxBin(projectRoot: string): string {
  return resolve(
    projectRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );
}

export async function runStreamingCommand(params: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Promise<number> {
  const child = spawn(params.command, params.args, {
    cwd: params.cwd,
    env: params.env,
    stdio: "inherit",
  });

  return await new Promise<number>((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolvePromise(code ?? 1));
  });
}

export async function runTsxScript(params: {
  projectRoot: string;
  scriptPath: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}): Promise<number> {
  return await runStreamingCommand({
    command: resolveTsxBin(params.projectRoot),
    args: [params.scriptPath, ...(params.args || [])],
    cwd: params.projectRoot,
    env: params.env,
  });
}

export async function runNpmScript(params: {
  projectRoot: string;
  scriptName: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}): Promise<number> {
  return await runStreamingCommand({
    command: shellBin("npm"),
    args: ["run", params.scriptName, ...(params.args || [])],
    cwd: params.projectRoot,
    env: params.env,
  });
}

export async function runZshScript(params: {
  projectRoot: string;
  scriptPath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<number> {
  return await runStreamingCommand({
    command: "zsh",
    args: [params.scriptPath],
    cwd: params.projectRoot,
    env: params.env,
  });
}
