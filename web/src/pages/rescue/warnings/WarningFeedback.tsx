import { WarningSessionAction } from "./WarningSessionAction";
import type { WarningResource } from "./useWarningResource";
export function WarningFeedback({
  resource,
  noun,
}: {
  resource: WarningResource<unknown>;
  noun: string;
}) {
  if (resource.error)
    return (
      <div role="status" className="rw-feedback rw-error">
        <strong>
          {resource.data !== null
            ? "Chưa thể cập nhật"
            : `Chưa tải được ${noun}`}
        </strong>
        <p>{resource.error}</p>
        {resource.data !== null && (
          <p>Đang hiển thị dữ liệu đã tải trước đó, chưa xác nhận lại.</p>
        )}
        {resource.errorStatus === 401 ? (
          <WarningSessionAction />
        ) : (
          <button
            type="button"
            disabled={resource.loading}
            onClick={resource.refresh}
          >
            {resource.loading ? "Đang thử lại…" : "Thử lại"}
          </button>
        )}
      </div>
    );
  return resource.loading ? (
    <p role="status" className="rw-feedback">
      Đang {resource.data === null ? "tải" : "cập nhật"} {noun}…
    </p>
  ) : null;
}
