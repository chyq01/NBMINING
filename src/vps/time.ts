export function formatBeijingTime(value: string | null | undefined): string {
  if (!value) return "待识别";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function formatRemainingText(value: string | null | undefined): string {
  if (!value) return "待识别";
  const diff = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diff)) return "待识别";
  if (diff <= 0) return "已到点";
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}
