import { MiningState } from "../shared/types.js";

export interface VpsAccountConfig {
  id: string;
  label: string;
  username: string;
  passwordEnv?: string;
  password?: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastStatus: MiningState;
  lastMessage: string | null;
  lastScreenshotPath?: string | null;
  updatedAt: string;
}

export interface VpsSettings {
  dataDir: string;
  headless: boolean;
  pollIntervalSeconds: number;
  maxStartWaitMinutes: number;
  accountIntervalSeconds: number;
  autoRefreshOnStart: boolean;
  maxRetryAttempts: number;
  monitorEnabled: boolean;
  monitorHost: string;
  monitorPort: number;
  monitorPasswordEnv?: string;
}

export interface VpsConfig {
  settings: VpsSettings;
  accounts: VpsAccountConfig[];
}

export interface VpsRunOptions {
  once: boolean;
  testTelegram: boolean;
  doctor: boolean;
  accountId?: string;
}
