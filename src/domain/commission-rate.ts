export function normalizeDefaultCommissionRate(value: number | null | undefined): number {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
    throw new Error("Comissao deve estar entre 0% e 100%");
  }

  const normalized = raw <= 1 ? raw : raw / 100;
  return Number(normalized.toFixed(4));
}

export function formatCommissionRatePercent(value: number | null | undefined): number {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Number((raw * 100).toFixed(2));
}
