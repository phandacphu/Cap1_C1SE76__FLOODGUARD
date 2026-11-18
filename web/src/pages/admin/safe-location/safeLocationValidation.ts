import { isSafeLocationType } from "./safeLocationTypes";
import type { SafeLocationFields } from "./safeLocationTypes";

export type SafeLocationDraftField = "name" | "address" | "type" | "description" | "latitude" | "longitude";
export type SafeLocationDraft = Record<SafeLocationDraftField, string>;
export type SafeLocationErrors = Partial<Record<SafeLocationDraftField, string>>;

export function validateSafeLocationDraft(draft: SafeLocationDraft): {
  fields: SafeLocationFields | null;
  errors: SafeLocationErrors;
} {
  const errors: SafeLocationErrors = {};
  const name = draft.name.trim();
  const address = draft.address.trim();
  const description = draft.description.trim();
  if (!name) errors.name = "Vui lòng nhập tên địa điểm.";
  else if (name.length > 200) errors.name = "Tên tối đa 200 ký tự (UTF-16).";
  if (!address) errors.address = "Vui lòng nhập địa chỉ.";
  else if (address.length > 500) errors.address = "Địa chỉ tối đa 500 ký tự (UTF-16).";
  if (description.length > 2000) errors.description = "Mô tả tối đa 2000 ký tự (UTF-16).";
  if (!isSafeLocationType(draft.type)) errors.type = "Vui lòng chọn loại hợp lệ.";

  const latitude = Number(draft.latitude.trim());
  const longitude = Number(draft.longitude.trim());
  if (!draft.latitude.trim() || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.latitude = "Vĩ độ phải là số từ -90 đến 90.";
  }
  if (!draft.longitude.trim() || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.longitude = "Kinh độ phải là số từ -180 đến 180.";
  }
  if (Object.keys(errors).length || !isSafeLocationType(draft.type)) return { fields: null, errors };
  return {
    fields: { name, address, type: draft.type, description: description || null, location: { latitude, longitude } },
    errors,
  };
}
