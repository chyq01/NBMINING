export function parseCountdownToMs(value: string | null | undefined): number | null {
  if (!value) return null;

  const normalized = value.trim();
  const dayMatch = normalized.match(/(?:(\d+)\s*(?:d|day|days|天))?\s*(\d{1,2}):(\d{2}):(\d{2})/i);
  if (!dayMatch) return null;

  const days = Number(dayMatch[1] ?? 0);
  const hours = Number(dayMatch[2]);
  const minutes = Number(dayMatch[3]);
  const seconds = Number(dayMatch[4]);

  if (hours > 23 && days === 0) return null;
  if (minutes > 59 || seconds > 59) return null;

  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

export function nextRunFromCountdown(value: string | null | undefined, now = new Date()): string | null {
  const ms = parseCountdownToMs(value);
  if (ms === null) return null;
  return new Date(now.getTime() + ms).toISOString();
}

export function isCountdownFinished(value: string | null | undefined): boolean {
  const ms = parseCountdownToMs(value);
  return ms !== null && ms <= 0;
}

export function normalizeButtonText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function isStartText(value: string | null | undefined): boolean {
  return normalizeButtonText(value) === "start";
}

export function isMiningText(value: string | null | undefined): boolean {
  const text = normalizeButtonText(value);
  return text === "mining" || text === "mining..." || text.includes("mining");
}
