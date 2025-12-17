export function round2(n: number) {
    return Math.round(n * 100) / 100;
}

export function fmtCurrency(n: number, currency: string) {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
        }).format(n);
    } catch {
        return `${n.toFixed(0)} ${currency}`;
    }
}

export function fmtCompact(n: number) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (abs >= 1_000) return (n / 1_000).toFixed(2) + "K";
    return Math.round(n).toString();
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const uid = (prefix: string) =>
    `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
