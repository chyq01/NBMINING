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
  textSample: string | null;
}
