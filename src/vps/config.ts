import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VpsConfig } from "./types.js";

export const DEFAULT_VPS_CONFIG_PATH = path.resolve("vps/accounts.json");

const defaultConfig: VpsConfig = {
  settings: {
    dataDir: "vps-data",
    headless: true,
    pollIntervalSeconds: 2,
    maxStartWaitMinutes: 10,
    accountIntervalSeconds: 20,
    autoRefreshOnStart: true,
    maxRetryAttempts: 2
  },
  accounts: []
};

export async function loadVpsConfig(filePath: string): Promise<VpsConfig> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<VpsConfig>;
    return {
      settings: { ...defaultConfig.settings, ...(parsed.settings ?? {}) },
      accounts: (parsed.accounts ?? []).map((account) => ({
        id: account.id,
        label: account.label || account.username,
        username: account.username,
        passwordEnv: account.passwordEnv,
        password: account.password,
        enabled: account.enabled !== false,
        nextRunAt: account.nextRunAt ?? null,
        lastStatus: account.lastStatus ?? "loggedOut",
        lastMessage: account.lastMessage ?? null,
        updatedAt: account.updatedAt ?? new Date().toISOString()
      }))
    };
  } catch {
    await saveVpsConfig(filePath, defaultConfig);
    return JSON.parse(JSON.stringify(defaultConfig)) as VpsConfig;
  }
}

export async function saveVpsConfig(filePath: string, config: VpsConfig): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

export function resolveDataPath(configPath: string, dataDir: string): string {
  return path.isAbsolute(dataDir) ? dataDir : path.resolve(path.dirname(configPath), dataDir);
}
