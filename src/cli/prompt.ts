import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  loadBasePrompt,
  readBasePromptState,
  type BasePromptState,
} from "../aggregate/prompt.js";

export interface PromptScaffoldResult {
  project_root: string;
  built_in_path: string;
  target_path: string;
  target_exists: boolean;
  created: boolean;
  overwritten: boolean;
  env_key: "AGGREGATE_BASE_PROMPT_FILE";
  env_value: string;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function toEnvValue(projectRoot: string, targetPath: string): string {
  const relativePath = relative(projectRoot, targetPath).replace(/\\/g, "/");
  if (!relativePath || relativePath.startsWith("../")) {
    return targetPath;
  }
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function resolveTargetPath(params: {
  projectRoot: string;
  explicitPath?: string;
  basePromptState: BasePromptState;
}): string {
  if (params.explicitPath) {
    return resolve(params.projectRoot, params.explicitPath);
  }
  if (params.basePromptState.configured_path) {
    return params.basePromptState.configured_path;
  }
  return resolve(params.projectRoot, "aggregate-prompt.local.md");
}

export async function scaffoldCustomPrompt(params: {
  projectRoot?: string;
  path?: string;
  force?: boolean;
} = {}): Promise<PromptScaffoldResult> {
  const projectRoot = params.projectRoot || process.cwd();
  const basePromptState = await readBasePromptState(projectRoot);
  const targetPath = resolveTargetPath({
    projectRoot,
    explicitPath: params.path,
    basePromptState,
  });
  const targetExists = await pathExists(targetPath);

  if (!targetExists || params.force) {
    const prompt = await loadBasePrompt();
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${prompt}\n`, "utf8");
  }

  return {
    project_root: projectRoot,
    built_in_path: basePromptState.builtin_path,
    target_path: targetPath,
    target_exists: targetExists,
    created: !targetExists,
    overwritten: Boolean(targetExists && params.force),
    env_key: "AGGREGATE_BASE_PROMPT_FILE",
    env_value: toEnvValue(projectRoot, targetPath),
  };
}
