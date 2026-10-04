import type { ApplicationDraft, CartSelection, LocalDataBackup, PersonalProfile, TeamConfig } from "./types";
import { parseTeamConfig } from "./validation";

const KEYS = {
  profile: "personalProfileV1",
  team: "teamConfigV1",
  draft: "applicationDraftV1"
} as const;
const CART_SELECTION_KEY = "cartSelectionV1";

export async function saveCartSelection(selection: CartSelection): Promise<void> {
  await chrome.storage.local.set({ [CART_SELECTION_KEY]: selection });
}

export async function loadCartSelection(): Promise<CartSelection | null> {
  const value = (await chrome.storage.local.get(CART_SELECTION_KEY))[CART_SELECTION_KEY] as CartSelection | undefined;
  if (value?.schemaVersion !== 1 || !Array.isArray(value.items)) return null;
  const age = Date.now() - Date.parse(value.capturedAt);
  return Number.isFinite(age) && age >= 0 && age < 2 * 60 * 60 * 1000 ? value : null;
}

export async function loadLocalData(): Promise<{
  profile?: PersonalProfile;
  team?: TeamConfig;
  draft?: ApplicationDraft;
}> {
  const result = await chrome.storage.local.get(Object.values(KEYS));
  const team = parseTeamConfig(result[KEYS.team]);
  if (team && JSON.stringify(team) !== JSON.stringify(result[KEYS.team])) {
    await chrome.storage.local.set({ [KEYS.team]: team });
  }
  return {
    profile: result[KEYS.profile] as PersonalProfile | undefined,
    team: team || undefined,
    draft: result[KEYS.draft] as ApplicationDraft | undefined
  };
}

export async function saveProfile(profile: PersonalProfile): Promise<void> {
  await chrome.storage.local.set({ [KEYS.profile]: profile });
}

export async function saveTeamConfig(config: TeamConfig): Promise<void> {
  await chrome.storage.local.set({ [KEYS.team]: config });
}

export async function saveDraft(draft: ApplicationDraft): Promise<void> {
  await chrome.storage.local.set({ [KEYS.draft]: draft });
}

export async function clearAllLocalData(): Promise<void> {
  await chrome.storage.local.remove([...Object.values(KEYS), CART_SELECTION_KEY]);
}

export async function createLocalDataBackup(): Promise<LocalDataBackup> {
  const current = await loadLocalData();
  return { backupVersion: 1, exportedAt: new Date().toISOString(), ...current };
}

export async function restoreLocalDataBackup(value: unknown): Promise<void> {
  if (!value || typeof value !== "object") throw new Error("备份文件格式不正确");
  const backup = value as Partial<LocalDataBackup>;
  if (backup.backupVersion !== 1) throw new Error("不支持的备份版本");
  const changes: Record<string, unknown> = {};
  if (backup.profile && typeof backup.profile === "object") changes[KEYS.profile] = backup.profile;
  if (backup.draft && typeof backup.draft === "object" && Array.isArray(backup.draft.items)) {
    changes[KEYS.draft] = backup.draft;
  }
  if (backup.team) {
    const team = parseTeamConfig(backup.team);
    if (!team) throw new Error("备份中的团队配置无效");
    changes[KEYS.team] = team;
  }
  if (!Object.keys(changes).length) throw new Error("备份文件中没有可恢复的数据");
  await chrome.storage.local.set(changes);
}
