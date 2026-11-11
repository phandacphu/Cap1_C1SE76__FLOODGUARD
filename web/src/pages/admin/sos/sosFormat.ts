export function formatSosTime(value: string | Date | null | undefined): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Chưa được cung cấp";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(value));
}

export function formatSosCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("vi-VN");
}

const situationLabels: Record<string, string> = {
  trapped: "Bị mắc kẹt", evacuation: "Cần sơ tán", injured: "Bị thương",
  vulnerable: "Người dễ bị tổn thương", other: "Khác",
};

const waterLevelLabels: Record<string, string> = {
  below_knee: "Dưới đầu gối", waist: "Ngang thắt lưng",
  chest: "Ngang ngực", above_two_meters: "Trên 2 mét",
};

/** Unknown legacy values are shown verbatim; they are not guessed or reclassified. */
export function formatSosSituations(values: string[] | null): string {
  return values?.length ? values.map(value => situationLabels[value] ?? value).join(" · ") : "Chưa được cung cấp";
}

export function formatSosWaterLevel(value: string | null): string {
  return value ? waterLevelLabels[value] ?? value : "Chưa được cung cấp";
}
