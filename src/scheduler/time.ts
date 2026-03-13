export interface ParsedClock {
  hour: number;
  minute: number;
}

export function parseClockHHMM(value: string): ParsedClock {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`invalid clock format: ${value}`);
  }

  const hour = Number.parseInt(match[1] || "", 10);
  const minute = Number.parseInt(match[2] || "", 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`invalid clock number: ${value}`);
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`clock out of range: ${value}`);
  }

  return { hour, minute };
}

function parseUtcOffset(value: string): number | null {
  const normalized = value.trim();
  const utcMatch = normalized.match(
    /^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i,
  );
  if (utcMatch) {
    const sign = utcMatch[1] === "-" ? -1 : 1;
    const hh = Number.parseInt(utcMatch[2] || "", 10);
    const mm = Number.parseInt(utcMatch[3] || "0", 10);
    return sign * (hh * 60 + mm);
  }

  const shortMatch = normalized.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (shortMatch) {
    const sign = shortMatch[1] === "-" ? -1 : 1;
    const hh = Number.parseInt(shortMatch[2] || "", 10);
    const mm = Number.parseInt(shortMatch[3] || "", 10);
    return sign * (hh * 60 + mm);
  }

  return null;
}

export function resolveUtcOffsetMinutes(timezone: string): number {
  const normalized = timezone.trim();
  if (!normalized) {
    throw new Error("timezone is empty");
  }

  const parsedOffset = parseUtcOffset(normalized);
  if (parsedOffset !== null) {
    return parsedOffset;
  }

  // Minimal fixed-offset mapping to satisfy current scheduler requirements.
  if (normalized === "Asia/Shanghai") {
    return 8 * 60;
  }

  throw new Error(`unsupported timezone: ${timezone}`);
}

export function computeNextTriggerAt(params: {
  now: Date;
  deliveryTime: string;
  timezone: string;
  leadMinutes: number;
}): Date {
  const nowMs = params.now.getTime();
  const { hour, minute } = parseClockHHMM(params.deliveryTime);
  const offsetMinutes = resolveUtcOffsetMinutes(params.timezone);
  const offsetMs = offsetMinutes * 60 * 1000;

  let triggerMinutes = hour * 60 + minute - params.leadMinutes;
  while (triggerMinutes < 0) {
    triggerMinutes += 24 * 60;
  }
  while (triggerMinutes >= 24 * 60) {
    triggerMinutes -= 24 * 60;
  }

  const localNow = new Date(nowMs + offsetMs);
  const localYear = localNow.getUTCFullYear();
  const localMonth = localNow.getUTCMonth();
  const localDay = localNow.getUTCDate();

  const targetLocalMidnightMs = Date.UTC(localYear, localMonth, localDay);
  let targetUtcMs = targetLocalMidnightMs + triggerMinutes * 60 * 1000 - offsetMs;

  if (targetUtcMs <= nowMs) {
    targetUtcMs += 24 * 60 * 60 * 1000;
  }

  return new Date(targetUtcMs);
}

