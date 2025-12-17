import type { ISODate } from "../types";

export const todayISO = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const addMonths = (iso: ISODate, months: number) => {
    const d = new Date(iso + "T00:00:00Z");
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const nd = new Date(Date.UTC(y, m + months, day));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())}`;
};

export function monthIndexFromStart(startISO: ISODate, tISO: ISODate): number {
    const s = new Date(startISO + "T00:00:00Z");
    const t = new Date(tISO + "T00:00:00Z");
    const y = t.getUTCFullYear() - s.getUTCFullYear();
    const m = t.getUTCMonth() - s.getUTCMonth();
    const months = y * 12 + m;
    const dayAdjust = t.getUTCDate() < s.getUTCDate() ? -1 : 0;
    return Math.max(0, months + dayAdjust);
}

export function formatMonthLabel(startISO: ISODate, offsetMonths: number): string {
    const d = new Date(startISO + "T00:00:00Z");
    const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
    return nd.toLocaleString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function isWithin(iso: ISODate, start: ISODate, end?: ISODate): boolean {
    const t = new Date(iso + "T00:00:00Z").getTime();
    const s = new Date(start + "T00:00:00Z").getTime();
    const e = end ? new Date(end + "T00:00:00Z").getTime() : Number.POSITIVE_INFINITY;
    return t >= s && t <= e;
}
