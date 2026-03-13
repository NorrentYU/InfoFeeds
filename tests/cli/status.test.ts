import { describe, expect, it } from "vitest";
import {
  buildNextActions,
  resolveAggregateProvider,
  type DoctorReport,
} from "../../src/cli/status.js";
import { buildBrowserPreset } from "../../src/cli/browser.js";

function baseReport(): DoctorReport {
  return {
    generated_at: "2026-03-13T00:00:00.000Z",
    project_root: "/tmp/infofeeds",
    files: {
      env_exists: true,
      env_example_exists: true,
      source_list_exists: true,
      source_counts: {
        telegram: 2,
        substack: 2,
        youtube: 2,
        others: 2,
      },
    },
    binaries: {
      npm_available: true,
      yt_dlp_available: true,
      chrome: { available: true, path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
      notebooklm_python: { available: true, path: "/tmp/infofeeds/.venv-nlm/bin/python" },
      notebooklm_cli: { available: true, path: "/tmp/infofeeds/.venv-nlm/bin/nlm" },
    },
    aggregate_llm: {
      active_provider: "openai_compatible",
      provider_name: "OpenAI",
      configured: {
        openai_compatible: true,
        gemini: false,
      },
      aliases: {
        llm: true,
        openai: false,
        bailian: false,
      },
    },
    youtube: {
      cookies_file: { configured: true, path: "/tmp/youtube.cookies.txt", exists: true },
      include_streams: false,
    },
    x: {
      cdp_endpoint: "http://127.0.0.1:9222",
      cdp_reachable: true,
      credentials_present: false,
      profile_dir: "/tmp/infofeeds/.cache/x/profile",
    },
    notebooklm: {
      cdp_port: 9233,
      browser_reachable: true,
      auth_valid: true,
    },
    reports: {
      output_dir: {
        configured: true,
        path: "/tmp/infofeeds/reports",
        exists: true,
      },
      schedule_time: "09:30",
      schedule_timezone: "UTC+8",
    },
    readiness: {
      fulltest: true,
      x_assisted_setup: true,
      notebooklm_optional: true,
      local_reports_ready: true,
    },
    next_actions: [],
  };
}

describe("cli status helpers", () => {
  it("resolves aggregate provider by repo priority", () => {
    expect(
      resolveAggregateProvider({
        openai_compatible: true,
        gemini: true,
      }),
    ).toBe("openai_compatible");
    expect(
      resolveAggregateProvider({
        openai_compatible: false,
        gemini: true,
      }),
    ).toBe("gemini");
    expect(
      resolveAggregateProvider({
        openai_compatible: false,
        gemini: false,
      }),
    ).toBe("local");
  });

  it("builds next actions for missing config", () => {
    const report = baseReport();
    report.aggregate_llm.active_provider = "local";
    report.aggregate_llm.provider_name = "Local Fallback";
    report.aggregate_llm.configured = {
      openai_compatible: false,
      gemini: false,
    };
    report.aggregate_llm.aliases = {
      llm: false,
      openai: false,
      bailian: false,
    };
    report.x.cdp_reachable = false;
    report.notebooklm.auth_valid = false;
    report.youtube.cookies_file.exists = false;
    report.reports.output_dir.configured = false;
    const actions = buildNextActions(report);

    expect(actions.some((item) => item.includes("LLM provider"))).toBe(true);
    expect(actions.some((item) => item.includes("REPORT_OUTPUT_DIR"))).toBe(true);
    expect(actions.some((item) => item.includes("open-browser x"))).toBe(true);
    expect(actions.some((item) => item.includes("open-browser notebooklm"))).toBe(
      true,
    );
    expect(actions.some((item) => item.includes("YOUTUBE_COOKIES_FILE"))).toBe(
      true,
    );
  });

  it("builds default browser presets for x and notebooklm", () => {
    const xPreset = buildBrowserPreset({
      target: "x",
      projectRoot: "/tmp/infofeeds",
    });
    const notebooklmPreset = buildBrowserPreset({
      target: "notebooklm",
      projectRoot: "/tmp/infofeeds",
    });

    expect(xPreset.port).toBe(9222);
    expect(xPreset.startUrl).toContain("x.com");
    expect(xPreset.profileDir).toContain(".cache/x/profile");
    expect(notebooklmPreset.port).toBe(9233);
    expect(notebooklmPreset.startUrl).toContain("notebooklm.google.com");
    expect(notebooklmPreset.profileDir).toContain(".chrome-nlm-manual");
  });
});
