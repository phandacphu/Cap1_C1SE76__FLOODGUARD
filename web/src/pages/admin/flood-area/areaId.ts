/** Rút gọn ID dài (UUID / ObjectId...) thành mã ngắn dễ đọc, ví dụ FZ-A1B2C3. */
export function formatAreaId(id: string): string {
  if (id.length <= 10) return id; // ID đã ngắn sẵn thì giữ nguyên
  const compact = id.replace(/[^a-zA-Z0-9]/g, "");
  return `FZ-${compact.slice(-6).toUpperCase()}`;
}