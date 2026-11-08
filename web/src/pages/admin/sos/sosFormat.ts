export function formatSosTime(value: string | Date | null): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Chưa được cung cấp";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(value));
}

export function formatSosCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("vi-VN");
}
