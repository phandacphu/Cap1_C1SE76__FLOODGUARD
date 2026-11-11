import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/http";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { AppShell } from "../../../components/layout/AppShell";
import { ADMIN_NAV } from "../../../components/layout/navConfig";
import { useClock } from "../../../components/layout/useClock";
import { Icon } from "../../../components/ui/Icon";
import { KpiCard } from "../components/KpiCard";
import { FloodWarningForm } from "./FloodWarningForm";
import { periodLabels, severityLabels, warningPeriod, warningTime, type FloodWarning, type FloodWarningSource, type WarningData, type WarningFields } from "./floodWarningTypes";

const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-water focus:outline-none";
const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-bg disabled:opacity-50";
const title = "Quản lý cảnh báo lũ";

const severityTone = {
  low: "border-water/30 bg-water/10 text-water",
  medium: "border-warn/30 bg-warn/10 text-warn",
  high: "border-sos/30 bg-sos/10 text-sos",
  critical: "border-sos/40 bg-sos/15 text-sos",
};

const periodTone = {
  current: "border-safe/30 bg-safe/10 text-safe",
  upcoming: "border-water/30 bg-water/10 text-water",
  expired: "border-warn/30 bg-warn/10 text-warn",
  inactive: "border-border text-muted",
  unknown: "border-border text-muted",
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: WarningData }
  | { kind: "error"; error: unknown };

function describeError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn.";
    if (error.status === 403) return "Bạn không có quyền quản lý cảnh báo lũ.";
    if (error.status === 404) return "Không tìm thấy cảnh báo hoặc vùng ngập đã chọn.";
    if (error.status === 400) return error.message;
  }
  return "Không thể hoàn tất yêu cầu. Hãy làm mới để kiểm tra dữ liệu trước khi thử lại.";
}

export default function FloodWarningManagementScreen({ source }: { source: FloodWarningSource }) {
  const now = +useClock();
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [loadVersion, setLoadVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("");
  const [period, setPeriod] = useState("");
  const [editor, setEditor] = useState<{ warning: FloodWarning | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; correctable: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const savingRef = useRef(false);
  const request = useRef<{ source: FloodWarningSource; version: number; result: Promise<WarningData> } | null>(null);

  useEffect(() => {
    let current = true;
    if (request.current?.source !== source || request.current.version !== loadVersion) {
      request.current = { source, version: loadVersion, result: source.list() };
    }
    request.current.result.then(
      (data) => { if (current) setLoad({ kind: "ready", data }); },
      (error: unknown) => { if (current) setLoad({ kind: "error", error }); },
    );
    return () => { current = false; };
  }, [source, loadVersion]);

  function refresh() {
    if (load.kind === "loading" || savingRef.current) return;
    setLoad({ kind: "loading" });
    setMessage("");
    setLoadVersion((version) => version + 1);
  }

  function openEditor(warning: FloodWarning | null) {
    setSaveError(null);
    setMessage("");
    setEditor({ warning });
  }

  async function save(fields: WarningFields) {
    if (savingRef.current || !editor || load.kind !== "ready") return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await source.save(editor.warning?.id ?? null, fields);
      const { warnings, areas } = load.data;
      const updated = editor.warning
        ? warnings.map((warning) => warning.id === saved.id ? saved : warning)
        : [saved, ...warnings];
      setLoad({ kind: "ready", data: { warnings: updated, areas } });
      setEditor(null);
      setMessage(source.demo ? "Đã lưu cảnh báo trong dữ liệu thử." : "Đã lưu cảnh báo.");
    } catch (error) {
      setSaveError({ message: describeError(error), correctable: error instanceof ApiError && error.status === 400 });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const data = load.kind === "ready" ? load.data : null;
  const entries = (data?.warnings ?? []).map((warning) => ({ warning, period: warningPeriod(warning, now) }));
  const areas = new Map(data?.areas.map((area) => [area.id, area.name]));
  const search = query.trim().toLocaleLowerCase("vi");
  const visible = entries
    .filter(({ warning, period: effective }) =>
      (!severity || warning.severity === severity) && (!period || effective === period) &&
      (!search || [warning.title, warning.id, warning.areaId, areas.get(warning.areaId) ?? ""]
        .some((value) => value.toLocaleLowerCase("vi").includes(search))))
    .sort((first, second) => (Date.parse(second.warning.startAt) || 0) - (Date.parse(first.warning.startAt) || 0));
  const status = load.kind === "error" && load.error instanceof ApiError ? load.error.status : 0;

  return (
    <AppShell nav={ADMIN_NAV} brandSub="COMMAND C4I" brandTag="ADMIN" roleLabel="QUẢN TRỊ VIÊN C4I" accent="water" header={<AdminHeader title={title} />}>
      <div className="mx-auto max-w-[96rem] space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-widest text-water">ADMIN · CẢNH BÁO LŨ</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h1>
              <p className="mt-2 max-w-xl text-sm text-muted">Quản lý nội dung cảnh báo, vùng ảnh hưởng và thời gian hiệu lực theo giờ Việt Nam.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={refresh} disabled={load.kind === "loading" || saving}>
                <Icon name="refresh" className="h-4 w-4" /> Làm mới
              </button>
              <button type="button" className="rounded-lg bg-water px-4 py-2 text-sm font-bold text-bg hover:bg-water/85 disabled:opacity-50"
                disabled={!data?.areas.length || saving} onClick={() => openEditor(null)}>+ Tạo cảnh báo</button>
            </div>
          </div>
        </section>

        {source.demo && <aside className="rounded-xl border border-warn/35 bg-warn/10 px-4 py-3 text-sm text-warn">
          <strong>TEST ONLY · Dữ liệu mô phỏng</strong>
          <p className="mt-1">Các thay đổi chỉ lưu trong phiên thử của trang. Tải lại trình duyệt sẽ đặt lại dữ liệu.</p>
        </aside>}
        {message && <p role="status" className="rounded-xl border border-safe/30 bg-safe/10 p-3 text-sm text-safe">{message}</p>}

        {load.kind === "loading" && <p role="status" className="rounded-xl border border-border bg-card p-8 text-center text-muted">Đang tải cảnh báo lũ…</p>}
        {load.kind === "error" && <section role="alert" className="space-y-3 rounded-xl border border-sos/35 bg-card p-5">
          <h2 className="font-semibold text-sos">Tải danh sách thất bại</h2>
          <p className="text-sm">{describeError(load.error)}</p>
          {status === 401 ? <Link to="/login" className={button}>Đăng nhập lại</Link> : status !== 403 && <button type="button" className={button} onClick={refresh}>Thử lại</button>}
        </section>}

        {data && <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard label="Tổng cảnh báo" icon="alert" value={String(entries.length)} tone="text" />
            <KpiCard label="Đang hiệu lực" icon="pulse" value={String(entries.filter((item) => item.period === "current").length)} tone="safe" />
            <KpiCard label="Sắp tới" icon="clock" value={String(entries.filter((item) => item.period === "upcoming").length)} tone="water" />
            <KpiCard label="Đã hết hạn" icon="history" value={String(entries.filter((item) => item.period === "expired").length)} tone="warn" />
          </div>
          {!data.areas.length && <p role="status" className="rounded-xl border border-warn/35 bg-warn/10 p-3 text-sm text-warn">Cần có vùng ngập để tạo hoặc cập nhật cảnh báo.</p>}
          <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[2fr_1fr_1fr_auto]" aria-label="Bộ lọc cảnh báo">
            <label className="space-y-1 text-xs text-muted"><span>Tìm cảnh báo</span>
              <input type="search" className={input} placeholder="Tiêu đề, mã hoặc vùng ngập" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs text-muted"><span id="ccf120-managementscreen-severity">Mức độ</span>
              <select aria-labelledby="ccf120-managementscreen-severity" className={input} value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="">Tất cả</option>
                {Object.entries(severityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted"><span id="ccf120-managementscreen-period">Hiệu lực</span>
              <select aria-labelledby="ccf120-managementscreen-period" className={input} value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="">Tất cả</option>
                {Object.entries(periodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <button type="button" className={`${button} self-end`} disabled={!query && !severity && !period} onClick={() => { setQuery(""); setSeverity(""); setPeriod(""); }}>Xóa bộ lọc</button>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border p-4">
              <h2 className="font-bold">Danh sách cảnh báo</h2>
              <span className="text-xs text-muted">{visible.length} / {entries.length} cảnh báo · ICT</span>
            </div>
            {!visible.length ? <p className="p-8 text-center text-sm text-muted">{entries.length ? "Không có kết quả theo bộ lọc." : "Chưa có cảnh báo lũ."}</p> :
              <div className="overflow-x-auto">
                <table className="w-full min-w-[49rem] text-left text-sm">
                  <thead className="bg-bg/65 text-xs text-muted">
                    <tr>{["Cảnh báo", "Mức độ", "Vùng ngập", "Bắt đầu / Kết thúc", "Trạng thái", "Thao tác"].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map(({ warning, period: effective }) => <tr key={warning.id} className="align-top hover:bg-bg/30">
                      <th scope="row" className="max-w-64 break-words px-4 py-4 font-medium">
                        <span className="block">{warning.title}</span>
                        <span className="mt-1 block font-mono text-xs text-muted">{warning.id}</span>
                      </th>
                      <td className="px-4 py-4"><span className={`inline-block rounded-full border px-2 py-1 text-xs ${severityTone[warning.severity]}`}>{severityLabels[warning.severity]}</span></td>
                      <td className="max-w-48 break-words px-4 py-4">{areas.get(warning.areaId) ?? "Vùng chưa có tên"}<span className="mt-1 block font-mono text-xs text-muted">{warning.areaId}</span></td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs leading-6 text-muted"><div>{warningTime(warning.startAt)}</div><div>{warningTime(warning.endAt)}</div></td>
                      <td className="px-4 py-4">
                        <span className={`inline-block rounded-full border px-2 py-1 text-xs ${periodTone[effective]}`}>{periodLabels[effective]}</span>
                        <span className="mt-1 block text-xs text-muted">{warning.status === "active" ? "Đã bật" : "Đã tắt"}</span>
                      </td>
                      <td className="px-4 py-4"><button type="button" className={button} disabled={!data.areas.length || saving} aria-label={`Chỉnh sửa ${warning.title}`} onClick={() => openEditor(warning)}>Chỉnh sửa</button></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
          </section>
        </>}

        {editor && data && <FloodWarningForm warning={editor.warning} areas={data.areas} demo={source.demo} busy={saving} error={saveError} onReview={() => setSaveError(null)} onClose={() => setEditor(null)} onSave={save} />}
      </div>
    </AppShell>
  );
}
