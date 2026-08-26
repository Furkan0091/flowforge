import { describe, it, expect } from "vitest";
import { formatDuration, formatTime, formatDateTime, timeAgo, slugify } from "./format";

describe("formatDuration", () => {
  it("formats milliseconds, seconds and minutes", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(90_000)).toBe("1m 30s");
  });

  it("handles missing values", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });
});

describe("formatTime / formatDateTime", () => {
  it("formats a date", () => {
    const date = new Date("2024-01-02T03:04:05Z");
    expect(formatTime(date)).not.toBe("—");
    expect(formatDateTime(date)).not.toBe("—");
  });

  it("handles null", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});

describe("timeAgo", () => {
  it("formats relative timestamps", () => {
    expect(timeAgo(null)).toBe("never");
    expect(timeAgo(new Date())).toBe("just now");
    expect(timeAgo(new Date(Date.now() - 30_000))).toBe("30s ago");
    expect(timeAgo(new Date(Date.now() - 5 * 60_000))).toBe("5m ago");
    expect(timeAgo(new Date(Date.now() - 3 * 3_600_000))).toBe("3h ago");
  });
});

describe("slugify", () => {
  it("produces slug-compatible names", () => {
    expect(slugify("Lead Processing")).toBe("lead_processing");
    expect(slugify("  API  Sync! ")).toBe("api_sync");
    expect(slugify("Webhook → Email")).toBe("webhook_email");
  });
});
