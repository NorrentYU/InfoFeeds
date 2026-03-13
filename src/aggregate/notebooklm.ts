import { spawn } from "node:child_process";
import type { SummaryFn, SummaryRequest } from "./types.js";

export interface NotebooklmSummaryOptions {
  pythonBin?: string;
  profile?: string;
  cdpPort?: number;
}

export function wrapNotebooklmAnswer(title: string, answer: string): string {
  const trimmedTitle = title.trim() || "内容摘要";
  const trimmedAnswer = answer.trim();
  return `**${trimmedTitle}**\n\n${trimmedAnswer}`;
}

function buildNotebooklmPythonScript(): string {
  return `
import json
import sys
import time
from nlm.core.auth import AuthManager
from nlm.core.client import NotebookLMClient
from nlm.utils.cdp import extract_cookies_via_cdp

payload = json.loads(sys.argv[1])
profile = payload.get("profile") or "default"
cdp_port = int(payload.get("cdp_port") or 9233)
request = payload["request"]

auth_data = extract_cookies_via_cdp(port=cdp_port, auto_launch=False, wait_for_login=False)
AuthManager(profile).save_profile(
    cookies=auth_data["cookies"],
    csrf_token=auth_data.get("csrf_token", ""),
    session_id=auth_data.get("session_id", ""),
)

client = NotebookLMClient(profile=profile)
notebook_id = None
try:
    notebook = client.create_notebook(f"InfoFeeds NotebookLM - {request['source_name']}")
    notebook_id = notebook.id

    client.add_source_url(notebook_id, request["url"])

    source_id = None
    for _ in range(24):
        sources = client.list_sources(notebook_id)
        if sources:
            source_id = sources[0].get("id")
            break
        time.sleep(5)
    if not source_id:
        raise RuntimeError("notebooklm_source_not_visible_within_timeout")

    content_ready = False
    for _ in range(24):
        content = client.get_source_content(source_id)
        if content.char_count > 0:
            content_ready = True
            break
        time.sleep(5)
    if not content_ready:
        raise RuntimeError("notebooklm_source_content_not_ready_within_timeout")

    response = client.query(notebook_id, request["prompt"])
    answer = (response or {}).get("answer", "") if isinstance(response, dict) else ""
    if not answer.strip():
        raise RuntimeError("notebooklm_empty_answer")

    print(json.dumps({"answer": answer}, ensure_ascii=False))
finally:
    if notebook_id:
        try:
            client.delete_notebook(notebook_id)
        except Exception:
            pass
    client.close()
`.trim();
}

export async function runNotebooklmYoutubeSummary(
  request: SummaryRequest,
  options: NotebooklmSummaryOptions = {},
): Promise<string> {
  if (request.source_type !== "youtube") {
    throw new Error("notebooklm summary only supports youtube records");
  }

  const pythonBin = options.pythonBin || "./.venv-nlm/bin/python";
  const profile = options.profile || process.env.NOTEBOOKLM_PROFILE || "default";
  const cdpPort = Number.parseInt(
    process.env.NOTEBOOKLM_CDP_PORT || `${options.cdpPort || 9233}`,
    10,
  );
  const payload = JSON.stringify({
    profile,
    cdp_port: Number.isFinite(cdpPort) ? cdpPort : 9233,
    request: {
      prompt: request.prompt,
      source_name: request.source_name,
      title: request.title,
      url: request.url,
    },
  });

  const stdout: string[] = [];
  const stderr: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(pythonBin, ["-c", buildNotebooklmPythonScript(), payload], {
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
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk.toString());
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `notebooklm summary failed (${code}): ${stderr.join("").trim() || stdout.join("").trim() || "unknown error"}`,
        ),
      );
    });
  });

  const output = stdout.join("").trim();
  if (!output) {
    throw new Error("notebooklm summary produced no output");
  }

  let parsed: { answer?: string };
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`notebooklm invalid json output: ${output.slice(0, 300)}`);
  }

  const answer = parsed.answer?.trim();
  if (!answer) {
    throw new Error("notebooklm answer missing");
  }

  return wrapNotebooklmAnswer(request.title, answer);
}

export function createYoutubeNotebooklmSummaryFn(params: {
  fallback: SummaryFn;
  notebooklmSummary?: SummaryFn;
}): SummaryFn {
  const notebooklmSummary =
    params.notebooklmSummary || (async (request) => await runNotebooklmYoutubeSummary(request));
  let youtubeQueue = Promise.resolve();

  return async (request) => {
    if (request.source_type !== "youtube") {
      return await params.fallback(request);
    }

    const run = youtubeQueue.then(() => notebooklmSummary(request));
    youtubeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  };
}
