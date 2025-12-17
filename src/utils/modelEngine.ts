import type { VentureData, Segment, ISODate, YearAgg } from "../types";
import { monthIndexFromStart, addMonths, isWithin } from "./dateUtils";
import { clamp01, round2 } from "./formatUtils";

export function segmentActiveUnitsAtMonth(seg: Segment, ventureStart: ISODate, month: number): number {
    const entryM = monthIndexFromStart(ventureStart, seg.entry);
    if (month < entryM) return 0;

    const samUnits = seg.tam * clamp01(seg.samPct);
    const targetUnits = samUnits * clamp01(seg.somPct);

    const mSince = month - entryM;
    const ramp = Math.max(1, seg.rampMonths);
    const p = clamp01(mSince / ramp);

    // Ease-in-out ramp
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

    if (seg.exit) {
        const exitM = monthIndexFromStart(ventureStart, seg.exit);
        if (month > exitM) return 0;
    }

    return targetUnits * eased;
}

export function computeSeries(data: VentureData) {
    const { start, horizonMonths } = data.meta;
    const months = Array.from({ length: Math.max(1, horizonMonths) }, (_, i) => i);

    const taskMonthlyCost = (m: number) => {
        const monthStartISO = addMonths(start, m);
        return data.tasks.reduce((sum, t) => (isWithin(monthStartISO, t.start, t.end) ? sum + t.costMonthly : sum), 0);
    };

    const taskOneOffCost = (m: number) =>
        data.tasks.reduce((sum, t) => (monthIndexFromStart(start, t.start) === m ? sum + t.costOneOff : sum), 0);

    const opexMonthly = (m: number) => {
        const monthStartISO = addMonths(start, m);
        return data.opex.reduce((sum, o) => (isWithin(monthStartISO, o.start, o.end) ? sum + o.monthly : sum), 0);
    };

    const segmentUnitsAt = (m: number) =>
        Object.fromEntries(data.segments.map((s) => [s.id, segmentActiveUnitsAtMonth(s, start, m)])) as Record<
            string,
            number
        >;

    const rows = months.map((m) => {
        const label = formatMonthLabel(start, m);
        const unitsNow = segmentUnitsAt(m);
        const unitsPrev =
            m > 0
                ? segmentUnitsAt(m - 1)
                : (Object.fromEntries(data.segments.map((s) => [s.id, 0])) as Record<string, number>);

        let revenue = 0;
        let cac = 0;

        for (const seg of data.segments) {
            const u = unitsNow[seg.id] ?? 0;
            const uPrev = unitsPrev[seg.id] ?? 0;
            revenue += u * seg.pricePerUnit;
            const delta = Math.max(0, u - uPrev);
            cac += delta * seg.cacPerUnit;
        }

        const costs = taskMonthlyCost(m) + opexMonthly(m) + taskOneOffCost(m) + cac;

        return {
            m,
            label,
            revenue: round2(revenue),
            costs: round2(costs),
            profit: round2(revenue - costs),
            burn: round2(Math.max(0, costs - revenue)),
            cac: round2(cac),
            taskMonthly: round2(taskMonthlyCost(m)),
            taskOneOff: round2(taskOneOffCost(m)),
            opex: round2(opexMonthly(m)),
            unitsTotal: round2(Object.values(unitsNow).reduce((a, b) => a + b, 0)),
            unitsBySeg: unitsNow,
        };
    });

    let cash = 0;
    let cumRevenue = 0;
    let cumCosts = 0;
    return rows.map((r) => {
        cash += r.profit;
        cumRevenue += r.revenue;
        cumCosts += r.costs;
        return {
            ...r,
            cash: round2(cash),
            cumRevenue: round2(cumRevenue),
            cumCosts: round2(cumCosts),
        };
    });
}

function formatMonthLabel(startISO: ISODate, offsetMonths: number): string {
    const d = new Date(startISO + "T00:00:00Z");
    const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
    return nd.toLocaleString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function firstIndexWhere<T>(arr: T[], pred: (x: T) => boolean): number | undefined {
    for (let i = 0; i < arr.length; i++) if (pred(arr[i]!)) return i;
    return undefined;
}

export function aggregateByCalendarYear(series: ReturnType<typeof computeSeries>, ventureStart: ISODate): YearAgg[] {
    const start = new Date(ventureStart + "T00:00:00Z");
    const byYear = new Map<number, YearAgg>();

    for (const row of series) {
        const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + row.m, 1));
        const y = d.getUTCFullYear();
        const existing = byYear.get(y) ?? { year: y, revenue: 0, costs: 0, ebitda: 0 };
        existing.revenue += row.revenue;
        existing.costs += row.costs;
        existing.ebitda += row.profit;
        byYear.set(y, existing);
    }

    return Array.from(byYear.values())
        .sort((a, b) => a.year - b.year)
        .map((x) => ({
            ...x,
            revenue: round2(x.revenue),
            costs: round2(x.costs),
            ebitda: round2(x.ebitda),
        }));
}

export function buildSankeyForMonth(data: VentureData, month: number) {
    const series = computeSeries(data);
    const snap = series[Math.min(series.length - 1, Math.max(0, month))] ?? series[0];

    const revBySeg = data.segments.map((s) => {
        const units = (snap.unitsBySeg?.[s.id] ?? 0) as number;
        return { name: s.name, value: round2(units * s.pricePerUnit) };
    });
    const totalRev = revBySeg.reduce((a, b) => a + b.value, 0);

    const costs = [
        { name: "Tasks (monthly)", value: Math.max(0, snap.taskMonthly ?? 0) },
        { name: "Tasks (one-off)", value: Math.max(0, snap.taskOneOff ?? 0) },
        { name: "Opex", value: Math.max(0, snap.opex ?? 0) },
        { name: "CAC", value: Math.max(0, snap.cac ?? 0) },
    ];

    const nodes = [
        ...costs.map((c) => ({ name: c.name })),
        ...revBySeg.map((s) => ({ name: s.name })),
        ...(totalRev === 0 ? [{ name: "No revenue" }] : []),
    ];

    const links: { source: number; target: number; value: number }[] = [];
    const idxNoRev = costs.length + revBySeg.length;

    costs.forEach((c, i) => {
        if (c.value <= 0) return;

        if (totalRev <= 0) {
            links.push({ source: i, target: idxNoRev, value: round2(c.value) });
            return;
        }

        revBySeg.forEach((s, j) => {
            if (s.value <= 0) return;
            const share = s.value / totalRev;
            const v = round2(c.value * share);
            if (v > 0) links.push({ source: i, target: costs.length + j, value: v });
        });
    });

    return {
        nodes,
        links,
        totals: {
            totalRev: round2(totalRev),
            totalCosts: round2(snap.costs ?? 0),
        },
    };
}
