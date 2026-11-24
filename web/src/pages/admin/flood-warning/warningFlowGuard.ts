/** Tracks read generations and authorization across overlapping V2 operations. */
export class WarningFlowGuard {
  private epoch = 0;
  private listVersion = 0;
  private detailVersion = 0;
  private locked = false;

  beginList() { return { epoch: this.epoch, version: ++this.listVersion }; }
  beginDetail() { return { epoch: this.epoch, version: ++this.detailVersion }; }
  snapshot() { return this.epoch; }
  validEpoch(epoch: number) { return !this.locked && this.epoch === epoch; }
  validList(ticket: { epoch: number; version: number }) { return this.validEpoch(ticket.epoch) && this.listVersion === ticket.version; }
  validDetail(ticket: { epoch: number; version: number }) { return this.validEpoch(ticket.epoch) && this.detailVersion === ticket.version; }
  invalidateDetail() { this.detailVersion++; }
  invalidateList() { this.listVersion++; }
  invalidateAll() { this.epoch++; this.listVersion++; this.detailVersion++; }
  lock() { this.locked = true; this.invalidateAll(); }
  get isLocked() { return this.locked; }
}

/** 5xx includes successful writes followed by an invalid 2xx response envelope. */
export function patchNeedsReconciliation(status: number, code?: string): boolean {
  return status === 0 || status === 429 || status >= 500 || (status === 409 && code !== "ALERT_REVISION_CONFLICT");
}
