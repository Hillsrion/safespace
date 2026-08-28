import { describe, expect, it } from "vitest";
import { activityDayLabel, activityWindow } from "./member-activity";

describe("privacy-minimised activity dates", () => {
  it("counts seven calendar days including today at a UTC month boundary", () => {
    const window = activityWindow(new Date("2026-03-01T00:30:00Z"));
    expect(window.since.toISOString()).toBe("2026-02-23T00:00:00.000Z");
    expect(window.through.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
  it("does not infer activity from registration and never displays time", () => {
    expect(activityDayLabel(null)).toBe("Aucune activité enregistrée");
    expect(activityDayLabel("2026-08-28T00:00:00.000Z")).toBe("28/08/2026");
    expect(activityDayLabel("invalid")).toBe("Date indisponible");
  });
});
