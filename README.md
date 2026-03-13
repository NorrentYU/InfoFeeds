# InfoFeeds

InfoFeeds is a fetch -> summarize -> compose -> export pipeline for daily information digests.

This repo is designed so another AI agent can clone it, read this README, run the CLI, guide the user through the required logins, and then schedule recurring runs.

## What the user must configure

The project needs seven categories of configuration:

1. Source list
   `sourceList.md` controls which Telegram / Substack / YouTube / Others sources are fetched.

2. Aggregate LLM provider
   The default path is an OpenAI-compatible API in `.env`:
   `LLM_PROVIDER_NAME`
   `LLM_API_URL`
   `LLM_API_KEY`
   `LLM_MODEL` (optional)

   Provider priority is:
   1. OpenAI-compatible API
   2. Anthropic
   3. Local fallback

   Legacy aliases are still accepted for compatibility:
   `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
   `BAILIAN_API_KEY`, `BAILIAN_BASE_URL`, `BAILIAN_MODEL`

   Anthropic is also supported via:
   `ANTHROPIC_API_KEY`
   `ANTHROPIC_MODEL`
   `ANTHROPIC_BASE_URL` (optional)
   `ANTHROPIC_VERSION` (optional)

3. Aggregate summary prompt
   The built-in base prompt lives at:
   `src/aggregate/default-summary-prompt.md`

   By default, the summarizer will:
   require the first line to be a Chinese markdown title like `**<标题>**`
   write 1-3 natural paragraphs
   choose different summary strategies for opinion / technical / news content
   preserve key numbers, names, and dates
   reject captcha / login / paywall-like body text as `摘要不可用：正文无效`

   Optional custom override:
   `AGGREGATE_BASE_PROMPT_FILE`

   Optional lightweight add-on constraints:
   `AGGREGATE_USER_PROMPT`

4. YouTube cookies file
   `YOUTUBE_COOKIES_FILE` should point to a readable cookies file if `yt-dlp` needs cookies for video metadata / captions.

5. X login
   The X module is designed around a dedicated Chrome CDP browser on `X_CDP_ENDPOINT` (default `http://127.0.0.1:9222`).
   The user should log in inside that dedicated browser profile.

6. NotebookLM login
   Only needed if YouTube summaries should use NotebookLM.
   NotebookLM uses a dedicated Chrome session on `NOTEBOOKLM_CDP_PORT` (default `9233`).
   The user must log in to Google / NotebookLM inside that browser.

7. Local report output directory
   `REPORT_OUTPUT_DIR` controls where every generated digest PDF / markdown / manifest is written.

## Quick start

1. Install Node dependencies

```bash
npm install
```

2. Copy the environment template

```bash
cp .env.example .env
```

3. Build once

```bash
npm run build
```

4. Run the doctor

```bash
npm run cli -- doctor
```

For agent-friendly machine-readable output:

```bash
npm run cli -- doctor --json
```

If `sourceList.md` is still the demo template, `doctor` will remind the user and print a structured fill-in guide.
`doctor` will also show which summary prompt file is active and remind the user that prompt customization is optional.

## YouTube cookies setup

If YouTube metadata or captions require login cookies, use this Chrome flow:

1. Install the Chrome extension `Get cookies.txt LOCALLY` from the Chrome Web Store:
   [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
2. Use the same Chrome profile that is already logged in to YouTube.
3. Open `https://www.youtube.com/` and confirm the account session is valid.
4. Click the extension icon while the active tab is on YouTube.
5. Export cookies in Netscape `cookies.txt` format.
6. Save the file somewhere stable, for example:
   `/Users/yourname/Desktop/youtube.cookies.txt`
7. Set the path in `.env`:

```bash
YOUTUBE_COOKIES_FILE=/Users/yourname/Desktop/youtube.cookies.txt
```

8. Re-run the doctor:

```bash
npm run cli -- doctor
```

Notes:
- Export from the Chrome profile that is actually signed in to YouTube.
- Prefer `Get cookies.txt LOCALLY`; do not use similarly named alternatives.
- If the cookie file is rotated or expires, export it again and keep the `.env` path unchanged.

## Default summary prompt

The built-in base prompt is stored in:

```text
src/aggregate/default-summary-prompt.md
```

Its default behavior is:

1. The first line must be a concrete markdown title like `**中文标题**`.
2. The body must be 1-3 natural paragraphs, not bullet points.
3. Opinion pieces summarize the author's position, key arguments, and risk framing.
4. Technical pieces summarize what changed, what problem it solves, and why it matters.
5. News items summarize what happened, who is involved, and the impact.
6. Key numbers, names, products, dates, and terms should be preserved.
7. Captcha / login / paywall-like content must not be summarized as valid content.

If you are fine with this built-in prompt, do nothing.

If you want a fully editable copy, run:

```bash
npm run cli -- setup prompt --path ./aggregate-prompt.local.md
```

This creates a local prompt file for editing. Then add this to `.env`:

```bash
AGGREGATE_BASE_PROMPT_FILE=./aggregate-prompt.local.md
```

If you only want minor extra constraints without replacing the base prompt, keep the built-in file and use:

```bash
AGGREGATE_USER_PROMPT=请优先强调风险、估值与时间窗口。
```

## CLI overview

Main entrypoint:

```bash
npm run cli -- <command>
```

After build, the compiled CLI also exists at:

```bash
node dist/cli/index.js <command>
```

### Doctor

Check current project readiness:

```bash
npm run cli -- doctor
npm run cli -- doctor --json
```

### Setup

Show missing steps:

```bash
npm run cli -- setup checklist
npm run cli -- setup checklist --json
```

Open the dedicated X login browser:

```bash
npm run cli -- setup open-browser x
```

Open the dedicated NotebookLM login browser:

```bash
npm run cli -- setup open-browser notebooklm
```

Create an editable copy of the built-in summary prompt:

```bash
npm run cli -- setup prompt --path ./aggregate-prompt.local.md
```

Start the X manual session takeover helper:

```bash
npm run cli -- setup x-session --timeout-minutes 8
```

### Run

Run the full pipeline once:

```bash
npm run cli -- run fulltest --window-hours 24
```

Run the full pipeline once and force YouTube summaries through NotebookLM:

```bash
npm run cli -- run fulltest --window-hours 24 --youtube-summary notebooklm
```

Enable YouTube stream transcript collection during fulltest:

```bash
npm run cli -- run fulltest --window-hours 24 --include-streams
```

Run the X CDP smoke test:

```bash
npm run cli -- run smoke x
```

Run the NotebookLM auth smoke test:

```bash
npm run cli -- run smoke notebooklm
```

### Schedule

Run one scheduled report job:

```bash
npm run cli -- schedule once --window-hours 24
```

Each run writes `digest-*.md`, `digest-*.pdf`, and `digest-*.manifest.json` into `REPORT_OUTPUT_DIR`.

Run the built-in long-running scheduler:

```bash
npm run cli -- schedule daemon
```

Install or remove the legacy local cron wrapper:

```bash
npm run cli -- schedule install-cron
npm run cli -- schedule uninstall-cron
```

## Recommended agent workflow

An AI agent should usually follow this order:

1. Clone repo and install dependencies

```bash
npm install
npm run build
```

2. Run doctor and inspect missing items

```bash
npm run cli -- doctor --json
```

3. Ask the user for the missing configuration

Typical missing items:
`sourceList.md`
an OpenAI-compatible LLM API key / URL or Anthropic API key / model
optional summary prompt override
YouTube cookies file
X login
NotebookLM login
REPORT_OUTPUT_DIR

4. Help the user complete login flows

For X:

```bash
npm run cli -- setup open-browser x
npm run cli -- run smoke x
```

For NotebookLM:

```bash
npm run cli -- setup open-browser notebooklm
npm run cli -- run smoke notebooklm
```

5. Run a real pipeline test

```bash
npm run cli -- run fulltest --window-hours 24
```

If the user wants NotebookLM-based YouTube summaries:

```bash
npm run cli -- run fulltest --window-hours 24 --youtube-summary notebooklm
```

6. Hand the chosen run command to the external scheduler / cron system

For example, an external scheduler can repeatedly run:

```bash
npm run cli -- run fulltest --window-hours 24 --youtube-summary notebooklm
```

or:

```bash
npm run cli -- schedule once --window-hours 24
```

## Notes for NotebookLM mode

- NotebookLM mode only affects YouTube summaries.
- Other channels still use the normal aggregate summarizer provider.
- NotebookLM requires a live logged-in browser session on `NOTEBOOKLM_CDP_PORT`.
- If NotebookLM is not needed, keep `--youtube-summary default`.

## Notes for OpenClaw or other agent schedulers

If your agent platform already provides cron / recurrence, prefer scheduling the CLI directly instead of using the local cron shell scripts.

Suggested commands to schedule:

```bash
npm run cli -- run fulltest --window-hours 24
```

or:

```bash
npm run cli -- schedule once --window-hours 24
```

The agent should re-run `doctor --json` whenever configuration changes or a browser login session expires.
