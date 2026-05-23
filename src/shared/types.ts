export const HOME_URL = "https://nbposer.com/#/home";
export const MINING_URL = "https://nbposer.com/#/mining";
export const NBCOIN_HOST = "nbposer.com";

export type MiningState =
  | "loggedOut"
  | "loggingIn"
  | "readingCountdown"
  | "waitingCountdown"
  | "waitingStartButton"
  | "miningStarted"
  | "needsManual"
  | "failed";

export interface AccountConfig {
  id: string;
  label: string;
  username: string;
  enabled: boolean;
  siteUrl: string;
  sessionPartition: string;
  lastStatus: MiningState;
  nextRunAt: string | null;
  lastMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationSettings {
  certificateWhitelist: string[];
  pollIntervalSeconds: number;
  maxStartWaitMinutes: number;
  accountIntervalSeconds: number;
  schedulerIntervalSeconds: number;
  launchAtLogin: boolean;
  paused: boolean;
  autoRefreshOnLaunch: boolean;
  maxRetryAttempts: number;
}

export interface AppConfig {
  accounts: AccountConfig[];
  settings: AutomationSettings;
  logs: AppLog[];
}

export interface AppLog {
  id: string;
  accountId: string | null;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
}

export interface AccountInput {
  id?: string;
  label: string;
  username: string;
  password?: string;
  enabled: boolean;
}

export interface RunResult {
  accountId: string;
  status: MiningState;
  countdownText: string | null;
  nextRunAt: string | null;
  message: string;
  timestamp: string;
}

export interface MiningSnapshot {
  pageKind: "login" | "home" | "mining" | "unknown";
  urlText: string | null;
  countdownText: string | null;
  buttonText: string | null;
  hasStartButton: boolean;
  hasMiningButton: boolean;
  hasPasswordInput: boolean;
  hasCaptchaHint: boolean;
  hasCompletedReward?: boolean;
  textSample: string | null;
}

export interface PageDiagnostic {
  accountId: string;
  accountLabel: string;
  snapshot: MiningSnapshot;
  message: string;
  timestamp: string;
}

export interface PublicState {
  accounts: AccountConfig[];
  settings: AutomationSettings;
  logs: AppLog[];
  isRunning: boolean;
  runningAccountIds: string[];
  appVersion: string;
}
