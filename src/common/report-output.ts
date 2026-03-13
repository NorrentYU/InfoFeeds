import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { readEnvValue } from "./env.js";

export interface ReportOutputDirectory {
  configured: boolean;
  rawValue: string | null;
  path: string;
  exists: boolean;
}

function toAbsolutePath(projectRoot: string, value: string): string {
  if (isAbsolute(value)) {
    return value;
  }
  return resolve(projectRoot, value);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readReportOutputDirectory(
  projectRoot: string = process.cwd(),
): Promise<ReportOutputDirectory> {
  const rawValue =
    (await readEnvValue("REPORT_OUTPUT_DIR")) ||
    (await readEnvValue("PDF_OUTPUT_DIR")) ||
    null;
  const configured = Boolean(rawValue);
  const path = toAbsolutePath(projectRoot, rawValue || "reports");

  return {
    configured,
    rawValue,
    path,
    exists: await pathExists(path),
  };
}

export async function ensureReportOutputDirectory(
  projectRoot: string = process.cwd(),
): Promise<ReportOutputDirectory> {
  const output = await readReportOutputDirectory(projectRoot);
  await mkdir(output.path, { recursive: true });
  return {
    ...output,
    exists: true,
  };
}
