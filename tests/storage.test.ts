import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalDataBackup, loadCartSelection, loadLocalData, restoreLocalDataBackup, saveCartSelection } from "../src/storage";

describe("local data backup", () => {
  let values: Record<string, unknown>;

  beforeEach(() => {
    values = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (keys: string[] | string) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => key in values).map((key) => [key, values[key]]))),
          set: vi.fn(async (changes: Record<string, unknown>) => Object.assign(values, changes)),
          remove: vi.fn(async (keys: string[]) => keys.forEach((key) => delete values[key]))
        }
      }
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("restores profile, draft and a legacy team config", async () => {
    await restoreLocalDataBackup({
      backupVersion: 1,
      profile: { department: "电控", applicant: "甲", purchaser: "乙", leader: "丙", captain: "丁", teacher: "戊" },
      draft: { items: [] },
      team: { schemaVersion: 1, teamName: "车队", department: "电控", leader: "丙", captain: "丁", teacher: "戊", annualBudgetCents: 100, templateVersion: "1.0.0" }
    });
    const restored = await loadLocalData();
    expect(restored.profile?.applicant).toBe("甲");
    expect(restored.team?.departments).toEqual(["电控"]);
    expect(restored.draft?.items).toEqual([]);
  });

  it("exports a versioned local backup", async () => {
    values.personalProfileV1 = { department: "电控", applicant: "甲" };
    const backup = await createLocalDataBackup();
    expect(backup).toEqual(expect.objectContaining({ backupVersion: 1, profile: expect.objectContaining({ applicant: "甲" }) }));
  });

  it("keeps a recent cart selection locally and rejects stale selections", async () => {
    await saveCartSelection({ schemaVersion: 1, capturedAt: new Date().toISOString(), items: [] });
    expect(await loadCartSelection()).toEqual(expect.objectContaining({ schemaVersion: 1 }));
    values.cartSelectionV1 = { schemaVersion: 1, capturedAt: "2020-01-01T00:00:00.000Z", items: [] };
    expect(await loadCartSelection()).toBeNull();
  });
});
