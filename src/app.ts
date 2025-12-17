import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Sankey,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "@/components/ui/alert";
import {
    Download,
    Plus,
    RefreshCcw,
    Trash2,
    Upload,
} from "lucide-react";

/**
 * Venture Proposal Planner (Local-first)
 *
 * - Timeline view: tasks + market segments with TAM/SAM/SOM stacked bars
 * - Time slider drives snapshot and summary
 * - Tabular editing, localStorage persistence, JSON import/export
 */

// -----------------------------
// Types
// -----------------------------

type ISODate = string; // YYYY-MM-DD

type Task = {
    id: string;
    name: string;
    phase: "Inception" | "Build" | "Deploy" | "GoToMarket" | "Other";
    start: ISODate;
    end: ISODate;
    costOneOff: number;
    costMonthly: number;
    dependsOn: string[];
};

type Segment = {
    id: string;
    name: string;
    entry: ISODate;
    exit?: ISODate;
    tam: number;
    samPct: number; // 0..1
    somPct: number; // 0..1
    pricePerUnit: number; // £ per unit per month
    cacPerUnit: number; // £ per unit (one-off)
    rampMonths: number;
    notes?: string;
};

type Opex = {
    id: string;
    category: string;
    start: ISODate;
    end?: ISODate;
    monthly: number;
};

type VentureData = {
    meta: {
        name: string;
        currency: string;
        start: ISODate;
        horizonMonths: number;
    };
    tasks: Task[];
    segments: Segment[];
    opex: Opex[];
};

// -----------------------------
// Defaults
// -----------------------------

const STORAGE_KEY = "venture-planner:v1";

const todayISO = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const addMonths = (iso: ISODate, months: number) => {
    const d = new Date(iso + "T00:00:00Z");
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const nd = new Date(Date.UTC(y, m + months, day));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())}`;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const uid = (prefix: string) =>
    `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

const DEFAULT: VentureData = {
    meta: {
        name: "New Venture",
        currency: "GBP",
        start: todayISO(),
        horizonMonths: 36,
    },
    tasks: [
        {
            id: "T1",
            name: "Licensing & Legal",
            phase: "Inception",
            start: todayISO(),
            end: addMonths(todayISO(), 3),
            costOneOff: 35000,
            costMonthly: 0,
            dependsOn: [],
        },
        {
            id: "T2",
            name: "Build MVP",
            phase: "Build",
            start: addMonths(todayISO(), 1),
            end: addMonths(todayISO(), 6),
            costOneOff: 0,
            costMonthly: 45000,
            dependsOn: ["T1"],
        },
        {
            id: "T3",
            name: "Deploy & Ops",
            phase: "Deploy",
            start: addMonths(todayISO(), 6),
            end: addMonths(todayISO(), 7),
            costOneOff: 12000,
            costMonthly: 8000,
            dependsOn: ["T2"],
        },
    ],
    segments: [
        {
            id: "M1",
            name: "Market Segment 1 (UK SMEs)",
            entry: addMonths(todayISO(), 7),
            tam: 500000,
            samPct: 0.2,
            somPct: 0.05,
            pricePerUnit: 40,
            cacPerUnit: 25,
            rampMonths: 12,
            notes: "Early adoption via partner channels",
        },
        {
            id: "M2",
            name: "Market Segment 2 (EU Enterprise)",
            entry: addMonths(todayISO(), 14),
            tam: 200000,
            samPct: 0.15,
            somPct: 0.03,
            pricePerUnit: 120,
            cacPerUnit: 80,
            rampMonths: 18,
            notes: "Staggered rollout; higher CAC",
        },
    ],
    opex: [
        {
            id: "O1",
            category: "Core Team",
            start: todayISO(),
            monthly: 60000,
        },
    ],
};

// -----------------------------
// Local storage helpers
// -----------------------------

function loadData(): VentureData {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT;
        const parsed = JSON.parse(raw);
        if (!parsed?.meta?.start || !Array.isArray(parsed?.tasks) || !Array.isArray(parsed?.segments)) return DEFAULT;
        return parsed;
    } catch {
        return DEFAULT;
    }
}

function saveData(data: VentureData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
}

// -----------------------------
// Date/Timeline helpers
// -----------------------------

function monthIndexFromStart(startISO: ISODate, tISO: ISODate): number {
    const s = new Date(startISO + "T00:00:00Z");
    const t = new Date(tISO + "T00:00:00Z");
    const y = t.getUTCFullYear() - s.getUTCFullYear();
    const m = t.getUTCMonth() - s.getUTCMonth();
    const months = y * 12 + m;
    const dayAdjust = t.getUTCDate() < s.getUTCDate() ? -1 : 0;
    return Math.max(0, months + dayAdjust);
}

function formatMonthLabel(startISO: ISODate, offsetMonths: number): string {
    const d = new Date(startISO + "T00:00:00Z");
    const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
    return nd.toLocaleString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
}

function isWithin(iso: ISODate, start: ISODate, end?: ISODate): boolean {
    const t = new Date(iso + "T00:00:00Z").getTime();
    const s = new Date(start + "T00:00:00Z").getTime();
    const e = end ? new Date(end + "T00:00:00Z").getTime() : Number.POSITIVE_INFINITY;
    return t >= s && t <= e;
}

// -----------------------------
// Model engine (simple/deterministic)
// -----------------------------

function segmentActiveUnitsAtMonth(seg: Segment, ventureStart: ISODate, month: number): number {
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

function round2(n: number) {
    return Math.round(n * 100) / 100;
}

function fmtCurrency(n: number, currency: string) {
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

function fmtCompact(n: number) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (abs >= 1_000) return (n / 1_000).toFixed(2) + "K";
    return Math.round(n).toString();
}

function computeSeries(data: VentureData) {
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
            profit: round2(revenue - costs), // treated as EBITDA for now
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

// -----------------------------
// Minimal inline table editor
// -----------------------------

type Col<T> = {
    key: keyof T;
    header: string;
    width?: string;
    input?: "text" | "number" | "date";
    parse?: (v: string) => any;
    render?: (v: any, row: T) => React.ReactNode;
};

function DataTable<T extends { id: string }>(props: {
    title: string;
    rows: T[];
    setRows: (rows: T[]) => void;
    columns: Col<T>[];
    addRow: () => T;
}) {
    const { title, rows, setRows, columns, addRow } = props;

    return (
        <Card className= "rounded-2xl shadow-sm" >
        <CardHeader className="flex flex-row items-center justify-between gap-3" >
            <div>
            <CardTitle className="text-base" > { title } </CardTitle>
                < div className = "text-sm text-muted-foreground" > Edit values directly.Changes save automatically.</div>
                    </div>
                    < Button onClick = {() => setRows([...rows, addRow()])
} variant = "secondary" className = "rounded-2xl" >
    <Plus className="h-4 w-4 mr-2" /> Add
        </Button>
        </CardHeader>
        < CardContent >
        <div className="overflow-auto rounded-xl border" >
            <table className="w-full text-sm" >
                <thead className="sticky top-0 bg-background" >
                    <tr className="border-b" >
                    {
                        columns.map((c) => (
                            <th key= { String(c.key)
                    } className = "text-left font-medium p-2" style = {{ width: c.width }}>
                        { c.header }
                        </th>
                ))}
<th className="p-2 w-[64px]" />
    </tr>
    </thead>
    <tbody>
{
    rows.map((r, idx) => (
        <tr key= { r.id } className = "border-b last:border-b-0 hover:bg-muted/40" >
        {
            columns.map((c) => {
                const val = (r as any)[c.key];
                const inputType = c.input ?? "text";
                if (c.render) {
                    return (
                        <td key= { String(c.key)
        } className = "p-2 align-top" >
        { c.render(val, r) }
        </td>
    );
}
return (
    <td key= { String(c.key) } className = "p-2 align-top" >
        <Input
                          className="h-8 rounded-xl"
type = { inputType }
value = { val ?? ""}
onChange = {(e) => {
    const next = [...rows];
    const raw = e.target.value;
    const parsed = c.parse ? c.parse(raw) : inputType === "number" ? Number(raw || 0) : raw;
    (next[idx] as any)[c.key] = parsed;
    setRows(next);
}}
                        />
    </td>
                    );
                  })}
<td className="p-2 align-top" >
    <Button
                      variant="ghost"
className = "rounded-xl"
onClick = {() => setRows(rows.filter((x) => x.id !== r.id))}
                    >
    <Trash2 className="h-4 w-4" />
        </Button>
        </td>
        </tr>
              ))}
{
    rows.length === 0 && (
        <tr>
        <td colSpan={ columns.length + 1 } className = "p-6 text-center text-muted-foreground" >
            No rows yet.
                  </td>
                </tr>
              )
}
</tbody>
    </table>
    </div>
    </CardContent>
    </Card>
  );
}

// -----------------------------
// Timeline
// -----------------------------

function TimelineView({
    data,
    month,
    setMonth,
}: {
    data: VentureData;
    month: number;
    setMonth: (m: number) => void;
}) {
    const { start, horizonMonths, currency } = data.meta;

    const months = useMemo(() => Array.from({ length: Math.max(1, horizonMonths) }, (_, i) => i), [horizonMonths]);
    const gridCols = Math.max(12, months.length);

    const monthLabel = formatMonthLabel(start, month);
    const monthISO = addMonths(start, month);

    const series = useMemo(() => computeSeries(data), [data]);
    const snap = series[Math.min(series.length - 1, Math.max(0, month))] ?? series[0];

    const taskBlockedByDeps = (t: Task) => {
        if (!t.dependsOn?.length) return false;
        const tStartM = monthIndexFromStart(start, t.start);
        return t.dependsOn
            .map((id) => data.tasks.find((x) => x.id === id))
            .filter(Boolean)
            .some((dep) => monthIndexFromStart(start, (dep as Task).end) > tStartM);
    };

    const taskCostAtCursor = (t: Task) => {
        const active = isWithin(monthISO, t.start, t.end);
        const oneOff = monthIndexFromStart(start, t.start) === month ? t.costOneOff : 0;
        return (active ? t.costMonthly : 0) + oneOff;
    };

    const segRevenueAtCursor = (s: Segment) => segmentActiveUnitsAtMonth(s, start, month) * s.pricePerUnit;

    return (
        <div className= "grid gap-4" >
        <Card className="rounded-2xl shadow-sm" >
            <CardHeader className="flex flex-row items-center justify-between gap-4" >
                <div>
                <CardTitle className="text-base" > Timeline </CardTitle>
                    < div className = "text-sm text-muted-foreground" >
                        Month cursor: <span className="font-medium text-foreground" > { monthLabel } </span> ({monthISO})
                            </div>
                            </div>
                            < div className = "w-[320px]" >
                                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2" >
                                    <span>Start </span>
                                    < span > Horizon { horizonMonths } m </span>
                                        </div>
                                        < Slider
    value = { [month]}
    min = { 0}
    max = { Math.max(0, horizonMonths - 1) }
    step = { 1}
    onValueChange = {(v) => setMonth(v[0] ?? 0)
}
            />
    </div>
    </CardHeader>
    < CardContent >
    <div className="overflow-auto" >
        <div className="min-w-[1100px]" >
            {/* Month header */ }
            < div
className = "grid"
style = {{
    gridTemplateColumns: `260px repeat(${gridCols}, minmax(26px, 1fr)) 240px`,
                }}
              >
    <div className="sticky left-0 bg-background z-20 p-2 text-xs text-muted-foreground border-b" > Lane </div>
{
    months.map((m) => (
        <div
                    key= { m }
                    className = {`p-2 text-[10px] text-muted-foreground border-b ${m === month ? "bg-muted/60" : ""}`}
title = { formatMonthLabel(start, m) }
    >
    { m % 3 === 0 ? formatMonthLabel(start, m) : ""}
</div>
                ))}
<div className="sticky right-0 bg-background z-20 p-2 text-xs text-muted-foreground border-b text-right" >
    Overall(now)
    </div>
    </div>

{/* Tasks */ }
<div className="mt-2" >
    <div className="px-2 py-1 text-xs font-medium text-muted-foreground" > Inception / Execution </div>
{
    data.tasks
    .slice()
    .sort((a, b) => monthIndexFromStart(start, a.start) - monthIndexFromStart(start, b.start))
    .map((t) => {
        const s = monthIndexFromStart(start, t.start);
        const e = Math.max(s, monthIndexFromStart(start, t.end));
        const blocked = taskBlockedByDeps(t);
        const active = isWithin(monthISO, t.start, t.end);
        const nowCost = taskCostAtCursor(t);

        return (
            <div
                        key= { t.id }
        className = "grid items-stretch"
        style = {{
            gridTemplateColumns: `260px repeat(${gridCols}, minmax(26px, 1fr)) 240px`,
                        }
    }
                      >
        <div className="sticky left-0 bg-background z-10 p-2 border-b" >
    <div className="flex items-center justify-between gap-2" >
    <div className="min-w-0" >
    <div className="text-sm font-medium truncate" > { t.name } </div>
    < div className = "text-xs text-muted-foreground truncate" >
    { t.phase } · { t.id }
    </div>
    </div>
                            { blocked && (
            <Badge variant="destructive" className = "rounded-xl" >
            deps
            </Badge>
    )
}
</div>
    < div className = "mt-1 text-xs text-muted-foreground" >
        One - off { fmtCurrency(t.costOneOff, currency) } · Monthly { fmtCurrency(t.costMonthly, currency) }
</div>
    </div>

{
    months.map((m) => {
        const inside = m >= s && m <= e;
        const isCursor = m === month;
        return (
            <div key= { m } className = {`border-b ${isCursor ? "bg-muted/60" : ""}`
    }>
    {
        inside?(
                                <div
                                  className = {`h-full m-[3px] rounded-lg ${active ? "bg-primary/25" : "bg-muted"} ${blocked ? "ring-1 ring-destructive/60" : ""
                }`}
                                  title = {`${t.name}\n${t.start} → ${t.end}\nDepends: ${t.dependsOn.join(", ") || "—"}`}
                                />
                              ) : null}
</div>
                          );
                        })}

<div className="sticky right-0 bg-background z-10 p-2 border-b text-right" >
    <div className="text-xs text-muted-foreground" > Cost(now) </div>
        < div className = "text-sm font-medium" > { fmtCurrency(nowCost, currency) } </div>
            </div>
            </div>
                    );
                  })}
</div>

    < Separator className = "my-4" />

        {/* Segments */ }
        < div >
        <div className="px-2 py-1 text-xs font-medium text-muted-foreground" > Market Segments </div>
{
    data.segments
    .slice()
    .sort((a, b) => monthIndexFromStart(start, a.entry) - monthIndexFromStart(start, b.entry))
    .map((seg) => {
        const entryM = monthIndexFromStart(start, seg.entry);
        const exitM = seg.exit ? monthIndexFromStart(start, seg.exit) : gridCols - 1;

        const samPct = clamp01(seg.samPct);
        const somPct = clamp01(seg.somPct);

        const tam = Math.max(0, seg.tam);
        const sam = tam * samPct;
        const som = sam * somPct;

        const unitsNow = segmentActiveUnitsAtMonth(seg, start, month);
        const revenueNow = segRevenueAtCursor(seg);

        return (
            <div
                        key= { seg.id }
        className = "grid items-stretch"
        style = {{
            gridTemplateColumns: `260px repeat(${gridCols}, minmax(26px, 1fr)) 240px`,
                        }
    }
                      >
        <div className="sticky left-0 bg-background z-10 p-2 border-b" >
    <div className="text-sm font-medium truncate" > { seg.name } </div>
    < div className = "text-xs text-muted-foreground truncate" >
    { seg.id } · Entry { seg.entry }
                            { seg.exit ? ` · Exit ${seg.exit}` : "" }
        </div>
        < div className = "mt-1 flex flex-wrap gap-2" >
        <Badge variant="secondary" className = "rounded-xl" >
        TAM { fmtCompact(tam) }
        </Badge>
    < Badge variant = "secondary" className = "rounded-xl" >
    SAM { fmtCompact(sam) }({(samPct * 100).toFixed(1)}%)
</Badge>
    < Badge variant = "secondary" className = "rounded-xl" >
        SOM { fmtCompact(som) } ({(somPct * 100).toFixed(1)}%)
</Badge>
    </div>
    </div>

{
    months.map((m) => {
        const inside = m >= entryM && m <= exitM;
        const isCursor = m === month;
        if (!inside) return <div key={ m } className = {`border-b ${isCursor ? "bg-muted/60" : ""}`
    } />;

    // Compact stacked bar per month: TAM background; SAM overlay; SOM overlay inside SAM.
    const barH = 34;
    const samW = Math.max(4, Math.round(samPct * 100));
    const somWithinSam = samPct > 0 ? Math.max(2, Math.round((somPct / samPct) * 100)) : 2;

    return (
        <div key= { m } className = {`border-b ${isCursor ? "bg-muted/60" : ""}`
}>
    <div className="m-[6px] rounded-lg bg-muted/70" style = {{ height: barH }}>
        <div className="h-full rounded-lg bg-primary/15" style = {{ width: `${samW}%` }}>
            <div
                                    className="h-full rounded-lg bg-primary/35"
style = {{ width: `${somWithinSam}%` }}
                                  />
    </div>
    </div>
{
    isCursor && (
        <div className="px-1 pb-2 text-[10px] text-muted-foreground" >
            <div className="flex items-center justify-between" >
                <span>SAM { (samPct * 100).toFixed(0) }% </span>
                    < span > SOM { (somPct * 100).toFixed(0) }% </span>
                        </div>
                        </div>
                              )
}
</div>
                          );
                        })}

<div className="sticky right-0 bg-background z-10 p-2 border-b text-right" >
    <div className="text-xs text-muted-foreground" > Now </div>
        < div className = "text-sm font-medium" > { fmtCurrency(revenueNow, currency) } </div>
            < div className = "text-xs text-muted-foreground mt-1" > Units { fmtCompact(unitsNow) } </div>
                </div>
                </div>
                    );
                  })}

{/* Overall row */ }
<div
                  className="grid items-stretch"
style = {{
    gridTemplateColumns: `260px repeat(${gridCols}, minmax(26px, 1fr)) 240px`,
                  }}
                >
    <div className="sticky left-0 bg-background z-10 p-2 border-t" >
        <div className="text-sm font-semibold" > Overall </div>
            < div className = "text-xs text-muted-foreground" > P & L at cursor month </div>
                </div>

{
    months.map((m) => {
        const isCursor = m === month;
        return <div key={ m } className = {`border-t ${isCursor ? "bg-muted/60" : ""}`
    } />;
})}

<div className="sticky right-0 bg-background z-10 p-2 border-t text-right" >
    <div className="text-xs text-muted-foreground" > Revenue </div>
        < div className = "text-sm font-medium" > { fmtCurrency(snap.revenue, currency) } </div>
            < div className = "mt-2 text-xs text-muted-foreground" > Costs </div>
                < div className = "text-sm font-medium" > { fmtCurrency(snap.costs, currency) } </div>
                    < div className = "mt-2 text-xs text-muted-foreground" > EBITDA </div>
                        < div className = "text-sm font-semibold" > { fmtCurrency(snap.profit, currency) } </div>
                            </div>
                            </div>
                            </div>
                            </div>
                            </div>
                            </CardContent>
                            </Card>

                            < SankeyCard data = { data } month = { month } />
                                </div>
  );
}

// -----------------------------
// Snapshot / Sankey
// -----------------------------

function buildSankeyForMonth(data: VentureData, month: number) {
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

function SankeyCard({ data, month }: { data: VentureData; month: number }) {
    const { currency, start } = data.meta;
    const sankey = useMemo(() => buildSankeyForMonth(data, month), [data, month]);

    return (
        <Card className= "rounded-2xl shadow-sm" >
        <CardHeader>
        <CardTitle className="text-base" > Sankey(Costs → Segment revenue) </CardTitle>
            < div className = "text-sm text-muted-foreground" >
                { formatMonthLabel(start, month) } · Revenue { fmtCurrency(sankey.totals.totalRev, currency) } · Costs{ " " }
    { fmtCurrency(sankey.totals.totalCosts, currency) }
    </div>
        </CardHeader>
        < CardContent className = "h-[360px]" >
            <ResponsiveContainer width="100%" height = "100%" >
                <Sankey data={ sankey } nodePadding = { 18} margin = {{ left: 8, right: 8, top: 8, bottom: 8 }
} />
    </ResponsiveContainer>
    </CardContent>
    </Card>
  );
}

function SnapshotView({ data, month }: { data: VentureData; month: number }) {
    const series = useMemo(() => computeSeries(data), [data]);
    const currency = data.meta.currency;
    const snap = series[Math.min(series.length - 1, Math.max(0, month))] ?? series[0];

    const pie = useMemo(() => {
        const units = (snap?.unitsBySeg ?? {}) as Record<string, number>;
        return data.segments.map((s) => ({
            name: s.name,
            value: round2((units[s.id] ?? 0) * s.pricePerUnit),
        }));
    }, [data.segments, snap]);

    const kpis = [
        { label: "Revenue (month)", value: fmtCurrency(snap.revenue, currency) },
        { label: "Costs (month)", value: fmtCurrency(snap.costs, currency) },
        { label: "EBITDA (month)", value: fmtCurrency(snap.profit, currency) },
        { label: "Cash (cumulative)", value: fmtCurrency(snap.cash, currency) },
        { label: "CAC (month)", value: fmtCurrency(snap.cac, currency) },
        { label: "Active units", value: fmtCompact(snap.unitsTotal) },
    ];

    return (
        <div className= "grid gap-4" >
        <div className="grid md:grid-cols-3 gap-4" >
        {
            kpis.map((k) => (
                <Card key= { k.label } className = "rounded-2xl shadow-sm" >
                <CardContent className="p-4" >
            <div className="text-xs text-muted-foreground" > { k.label } </div>
            < div className = "text-xl font-semibold mt-1" > { k.value } </div>
            </CardContent>
            </Card>
            ))
        }
            </div>

            < div className = "grid lg:grid-cols-2 gap-4" >
                <Card className="rounded-2xl shadow-sm" >
                    <CardHeader>
                    <CardTitle className="text-base" > Revenue vs Costs </CardTitle>
                        </CardHeader>
                        < CardContent className = "h-[320px]" >
                            <ResponsiveContainer width="100%" height = "100%" >
                                <AreaChart data={ series } margin = {{ left: 12, right: 12, top: 10, bottom: 0 }
}>
    <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick = {{ fontSize: 11 }} interval = { Math.max(1, Math.floor(series.length / 12)) } />
            <YAxis tick={ { fontSize: 11 } } />
                < Tooltip />
                <Legend />
                < Area type = "monotone" dataKey = "revenue" name = "Revenue" fillOpacity = { 0.25} />
                    <Area type="monotone" dataKey = "costs" name = "Costs" fillOpacity = { 0.18} />
                        <Line type="monotone" dataKey = "profit" name = "EBITDA" dot = { false} />
                            </AreaChart>
                            </ResponsiveContainer>
                            </CardContent>
                            </Card>

                            < Card className = "rounded-2xl shadow-sm" >
                                <CardHeader>
                                <CardTitle className="text-base" > Revenue by Segment(snapshot) </CardTitle>
                                    </CardHeader>
                                    < CardContent className = "h-[320px]" >
                                        <ResponsiveContainer width="100%" height = "100%" >
                                            <PieChart>
                                            <Tooltip />
                                            < Legend />
                                            <Pie data={ pie } dataKey = "value" nameKey = "name" outerRadius = { 110} />
                                                </PieChart>
                                                </ResponsiveContainer>
                                                </CardContent>
                                                </Card>
                                                </div>

                                                < SankeyCard data = { data } month = { month } />

                                                    <Card className="rounded-2xl shadow-sm" >
                                                        <CardHeader>
                                                        <CardTitle className="text-base" > Cash Over Time </CardTitle>
                                                            </CardHeader>
                                                            < CardContent className = "h-[280px]" >
                                                                <ResponsiveContainer width="100%" height = "100%" >
                                                                    <LineChart data={ series } margin = {{ left: 12, right: 12, top: 10, bottom: 0 }}>
                                                                        <CartesianGrid strokeDasharray="3 3" />
                                                                            <XAxis dataKey="label" tick = {{ fontSize: 11 }} interval = { Math.max(1, Math.floor(series.length / 12)) } />
                                                                                <YAxis tick={ { fontSize: 11 } } />
                                                                                    < Tooltip />
                                                                                    <Legend />
                                                                                    < Line type = "monotone" dataKey = "cash" name = "Cash (cum.)" dot = { false} />
                                                                                        </LineChart>
                                                                                        </ResponsiveContainer>
                                                                                        </CardContent>
                                                                                        </Card>
                                                                                        </div>
  );
}

// -----------------------------
// Summary
// -----------------------------

function firstIndexWhere<T>(arr: T[], pred: (x: T) => boolean): number | undefined {
    for (let i = 0; i < arr.length; i++) if (pred(arr[i]!)) return i;
    return undefined;
}

type YearAgg = {
    year: number;
    revenue: number;
    costs: number;
    ebitda: number;
};

function aggregateByCalendarYear(series: ReturnType<typeof computeSeries>, ventureStart: ISODate): YearAgg[] {
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

function SummaryView({ data }: { data: VentureData }) {
    const series = useMemo(() => computeSeries(data), [data]);
    const currency = data.meta.currency;

    const profitableMonthIdx = useMemo(() => firstIndexWhere(series, (r) => r.profit > 0), [series]);
    const cashBreakevenIdx = useMemo(() => firstIndexWhere(series, (r) => r.cash > 0), [series]);

    const roiByYear = useMemo(() => {
        const years = [1, 2, 3];
        return years.map((y) => {
            const endM = y * 12 - 1;
            const row = series[Math.min(series.length - 1, Math.max(0, endM))];
            if (!row) return { year: y, roi: 0, cash: 0, costs: 0 };
            const invested = Math.max(1, Number((row as any).cumCosts ?? 0));
            const cash = Number(row.cash ?? 0);
            return { year: y, roi: cash / invested, cash, costs: invested };
        });
    }, [series]);

    const yearAgg = useMemo(() => aggregateByCalendarYear(series, data.meta.start), [series, data.meta.start]);
    const lastYear = yearAgg[yearAgg.length - 1]?.year;

    const eoyPie = useMemo(() => {
        if (yearAgg.length === 0) return [] as { name: string; value: number }[];
        const y = lastYear ?? yearAgg[0]!.year;
        const found = yearAgg.find((a) => a.year === y) ?? yearAgg[0]!;
        return [
            { name: "Revenue", value: Math.max(0, found.revenue) },
            { name: "EBITDA", value: Math.max(0, found.ebitda) },
        ];
    }, [yearAgg, lastYear]);

    return (
        <div className= "grid gap-4" >
        <div className="grid lg:grid-cols-3 gap-4" >
            <Card className="rounded-2xl shadow-sm" >
                <CardHeader>
                <CardTitle className="text-base" > Milestones </CardTitle>
                    </CardHeader>
                    < CardContent className = "space-y-3" >
                        <div>
                        <div className="text-xs text-muted-foreground" > Operational profitability(first month EBITDA & gt; 0)</div>
                            < div className = "text-lg font-semibold" >
                                { profitableMonthIdx === undefined
                                ? "Not within horizon"
                                : `${formatMonthLabel(data.meta.start, profitableMonthIdx)} (m${profitableMonthIdx})`
}
</div>
    </div>
    < Separator />
    <div>
    <div className="text-xs text-muted-foreground" > ROI / Payback(first month cumulative cash & gt; 0)</div>
        < div className = "text-lg font-semibold" >
            { cashBreakevenIdx === undefined
            ? "Not within horizon"
            : `${formatMonthLabel(data.meta.start, cashBreakevenIdx)} (m${cashBreakevenIdx})`}
</div>
    </div>
    < div className = "text-sm text-muted-foreground" >
        ROI definition: cumulative cash / cumulative costs - to - date.EBITDA ≈ profit(no depreciation / amortization modelled yet).
            </div>
            </CardContent>
            </Card>

            < Card className = "rounded-2xl shadow-sm" >
                <CardHeader>
                <CardTitle className="text-base" > ROI by Venture Year </CardTitle>
                    </CardHeader>
                    < CardContent className = "space-y-3" >
                        {
                            roiByYear.map((r) => (
                                <div key= { r.year } className = "flex items-center justify-between" >
                                <div className="text-sm font-medium" > Y{ r.year } ROI </div>
                            < div className = "text-sm" >
                            <span className="font-semibold" > {(r.roi * 100).toFixed(1)} % </span>
                        < span className = "text-muted-foreground" > · Cash { fmtCurrency(r.cash, currency) } · Costs { fmtCurrency(r.costs, currency) } </span>
                            </div>
                            </div>
            ))}
</CardContent>
    </Card>

    < Card className = "rounded-2xl shadow-sm lg:col-span-2" >
        <CardHeader>
        <CardTitle className="text-base" > Projected P & L(monthly) </CardTitle>
            </CardHeader>
            < CardContent className = "h-[280px]" >
                <ResponsiveContainer width="100%" height = "100%" >
                    <LineChart data={ series } margin = {{ left: 12, right: 12, top: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick = {{ fontSize: 11 }} interval = { Math.max(1, Math.floor(series.length / 12)) } />
                                <YAxis tick={ { fontSize: 11 } } />
                                    < Tooltip />
                                    <Legend />
                                    < Line type = "monotone" dataKey = "revenue" name = "Revenue" dot = { false} />
                                        <Line type="monotone" dataKey = "costs" name = "Costs" dot = { false} />
                                            <Line type="monotone" dataKey = "profit" name = "EBITDA" dot = { false} />
                                                </LineChart>
                                                </ResponsiveContainer>
                                                </CardContent>
                                                </Card>
                                                </div>

                                                < div className = "grid lg:grid-cols-2 gap-4" >
                                                    <Card className="rounded-2xl shadow-sm" >
                                                        <CardHeader>
                                                        <CardTitle className="text-base" > End - of - year summary </CardTitle>
                                                            </CardHeader>
                                                            < CardContent >
                                                            <div className="overflow-auto rounded-xl border" >
                                                                <table className="w-full text-sm" >
                                                                    <thead className="bg-background sticky top-0" >
                                                                        <tr className="border-b" >
                                                                            <th className="p-2 text-left" > Year </th>
                                                                                < th className = "p-2 text-right" > Revenue </th>
                                                                                    < th className = "p-2 text-right" > Costs </th>
                                                                                        < th className = "p-2 text-right" > EBITDA </th>
                                                                                            </tr>
                                                                                            </thead>
                                                                                            <tbody>
{
    yearAgg.map((y) => (
        <tr key= { y.year } className = "border-b last:border-b-0" >
        <td className="p-2 font-medium" > { y.year } </td>
    < td className = "p-2 text-right" > { fmtCurrency(y.revenue, currency)
} </td>
    < td className = "p-2 text-right" > { fmtCurrency(y.costs, currency) } </td>
        < td className = "p-2 text-right" > { fmtCurrency(y.ebitda, currency) } </td>
            </tr>
                  ))}
{
    yearAgg.length === 0 && (
        <tr>
        <td colSpan={ 4 } className = "p-6 text-center text-muted-foreground" >
            No data
                </td>
                </tr>
                  )
}
</tbody>
    </table>
    </div>
    </CardContent>
    </Card>

    < Card className = "rounded-2xl shadow-sm" >
        <CardHeader>
        <CardTitle className="text-base" > EOY pie(Revenue vs EBITDA) </CardTitle>
            </CardHeader>
            < CardContent className = "h-[320px]" >
                <ResponsiveContainer width="100%" height = "100%" >
                    <PieChart>
                    <Tooltip />
                    < Legend />
                    <Pie data={ eoyPie } dataKey = "value" nameKey = "name" outerRadius = { 110} />
                        </PieChart>
                        </ResponsiveContainer>
                        </CardContent>
                        </Card>
                        </div>
                        </div>
  );
}

// -----------------------------
// Import / Export
// -----------------------------

function ImportExport({ data, setData }: { data: VentureData; setData: (d: VentureData) => void }) {
    const fileRef = useRef<HTMLInputElement | null>(null);

    const download = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(data.meta.name || "venture").replace(/\s+/g, "-").toLowerCase()}-model.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const onPickFile = async (f: File) => {
        const text = await f.text();
        const parsed = JSON.parse(text);
        if (!parsed?.meta?.start || !Array.isArray(parsed?.tasks) || !Array.isArray(parsed?.segments)) {
            throw new Error("Invalid file format (missing meta/tasks/segments)");
        }
        setData(parsed);
    };

    return (
        <div className= "flex flex-wrap items-center gap-2" >
        <Button onClick={ download } variant = "secondary" className = "rounded-2xl" >
            <Download className="h-4 w-4 mr-2" /> Export JSON
                </Button>

                < input
    ref = { fileRef }
    type = "file"
    accept = "application/json"
    className = "hidden"
    onChange = { async(e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
            await onPickFile(f);
        } finally {
            e.target.value = "";
        }
    }
}
      />

    < Button onClick = {() => fileRef.current?.click()} variant = "outline" className = "rounded-2xl" >
        <Upload className="h-4 w-4 mr-2" /> Import JSON
            </Button>

            < Dialog >
            <DialogTrigger asChild >
            <Button variant="ghost" className = "rounded-2xl" >
                <RefreshCcw className="h-4 w-4 mr-2" /> Reset
                    </Button>
                    </DialogTrigger>
                    < DialogContent className = "rounded-2xl" >
                        <DialogHeader>
                        <DialogTitle>Reset model ? </DialogTitle>
                            </DialogHeader>
                            < Alert >
                            <AlertTitle>This will overwrite your local data </AlertTitle>
                                <AlertDescription>
              Your current venture model in local storage will be replaced with the default dataset.
            </AlertDescription>
    </Alert>
    < DialogFooter >
    <Button variant="outline" className = "rounded-2xl" onClick = {() => setData(DEFAULT)}>
        Reset to default
</Button>
    </DialogFooter>
    </DialogContent>
    </Dialog>
    </div>
  );
}

// -----------------------------
// Main App
// -----------------------------

export default function VentureProposalPlannerApp() {
    const [data, setData] = useState<VentureData>(() => {
        if (typeof window === "undefined") return DEFAULT;
        return loadData();
    });

    const [month, setMonth] = useState(0);

    useEffect(() => {
        if (typeof window === "undefined") return;
        saveData(data);
    }, [data]);

    useEffect(() => {
        setMonth((m) => Math.min(Math.max(0, m), Math.max(0, data.meta.horizonMonths - 1)));
    }, [data.meta.horizonMonths]);

    const currency = data.meta.currency;
    const series = useMemo(() => computeSeries(data), [data]);
    const snap = series[Math.min(series.length - 1, Math.max(0, month))] ?? series[0];

    const setTasks = (tasks: Task[]) => setData({ ...data, tasks });
    const setSegments = (segments: Segment[]) => setData({ ...data, segments });
    const setOpex = (opex: Opex[]) => setData({ ...data, opex });

    return (
        <div className= "p-4 md:p-6 max-w-[1400px] mx-auto" >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between" >
            <div>
            <h1 className="text-2xl font-semibold" > Venture Proposal Planner </h1>
                < p className = "text-sm text-muted-foreground" > Local - first venture modelling: tasks + market segments + snapshot financials.</p>
                    </div>
                    < ImportExport data = { data } setData = { setData } />
                        </div>

                        < div className = "mt-4 grid gap-4" >
                            <Card className="rounded-2xl shadow-sm" >
                                <CardContent className="p-4" >
                                    <div className="grid md:grid-cols-4 gap-4" >
                                        <div>
                                        <Label>Venture name </Label>
                                            < Input
    className = "rounded-2xl mt-1"
    value = { data.meta.name }
    onChange = {(e) => setData({ ...data, meta: { ...data.meta, name: e.target.value } })
}
                />
    </div>
    < div >
    <Label>Currency </Label>
    < Select
value = { data.meta.currency }
onValueChange = {(v) => setData({ ...data, meta: { ...data.meta, currency: v } })}
                >
    <SelectTrigger className="rounded-2xl mt-1" >
        <SelectValue placeholder="Currency" />
            </SelectTrigger>
            < SelectContent >
            <SelectItem value="GBP" > GBP </SelectItem>
                < SelectItem value = "USD" > USD </SelectItem>
                    < SelectItem value = "EUR" > EUR </SelectItem>
                        </SelectContent>
                        </Select>
                        </div>
                        < div >
                        <Label>Start date </Label>
                            < Input
type = "date"
className = "rounded-2xl mt-1"
value = { data.meta.start }
onChange = {(e) => setData({ ...data, meta: { ...data.meta, start: e.target.value } })}
                />
    </div>
    < div >
    <Label>Horizon(months) </Label>
    < Input
type = "number"
className = "rounded-2xl mt-1"
value = { data.meta.horizonMonths }
onChange = {(e) =>
setData({
    ...data,
    meta: { ...data.meta, horizonMonths: Math.max(1, Number(e.target.value || 1)) },
})
                  }
                />
    </div>
    </div>

    < Separator className = "my-4" />

        <div className="flex flex-wrap gap-3 items-center" >
            <div className="text-sm" >
                <span className="text-muted-foreground" > Snapshot: </span>{" "}
                    < span className = "font-medium" > { formatMonthLabel(data.meta.start, month) } </span>
                        </div>
                        < Badge variant = "secondary" className = "rounded-xl" >
                            Revenue { fmtCurrency(snap?.revenue ?? 0, currency) }
</Badge>
    < Badge variant = "secondary" className = "rounded-xl" >
        Costs { fmtCurrency(snap?.costs ?? 0, currency) }
</Badge>
    < Badge variant = "secondary" className = "rounded-xl" >
        Cash { fmtCurrency(snap?.cash ?? 0, currency) }
</Badge>
    < div className = "ml-auto w-[320px]" >
        <Slider
                  value={ [month] }
min = { 0}
max = { Math.max(0, data.meta.horizonMonths - 1) }
step = { 1}
onValueChange = {(v) => setMonth(v[0] ?? 0)}
                />
    </div>
    </div>
    </CardContent>
    </Card>

    < Tabs defaultValue = "timeline" className = "w-full" >
        <TabsList className="rounded-2xl" >
            <TabsTrigger value="timeline" className = "rounded-2xl" >
                Timeline
                </TabsTrigger>
                < TabsTrigger value = "data" className = "rounded-2xl" >
                    Data
                    </TabsTrigger>
                    < TabsTrigger value = "snapshot" className = "rounded-2xl" >
                        Snapshot
                        </TabsTrigger>
                        < TabsTrigger value = "summary" className = "rounded-2xl" >
                            Summary
                            </TabsTrigger>
                            </TabsList>

                            < TabsContent value = "timeline" className = "mt-4" >
                                <TimelineView data={ data } month = { month } setMonth = { setMonth } />
                                    </TabsContent>

                                    < TabsContent value = "snapshot" className = "mt-4" >
                                        <SnapshotView data={ data } month = { month } />
                                            </TabsContent>

                                            < TabsContent value = "summary" className = "mt-4" >
                                                <SummaryView data={ data } />
                                                    </TabsContent>

                                                    < TabsContent value = "data" className = "mt-4 grid gap-4" >
                                                        <DataTable<Task>
              title="Tasks (Gantt)"
rows = { data.tasks }
setRows = { setTasks }
addRow = {() => ({
    id: uid("T"),
    name: "New Task",
    phase: "Other",
    start: data.meta.start,
    end: addMonths(data.meta.start, 1),
    costOneOff: 0,
    costMonthly: 0,
    dependsOn: [],
})}
columns = {
    [
    { key: "id", header: "ID", width: "110px", input: "text" },
    { key: "name", header: "Name", width: "260px", input: "text" },
    {
        key: "phase",
        header: "Phase",
        width: "160px",
        render: (v, row) => (
            <Select
                      value= { String(v) }
                      onValueChange={(nv) => {
    setTasks(data.tasks.map((t) => (t.id === row.id ? { ...t, phase: nv as any } : t)));
}
}
    >
    <SelectTrigger className="h-8 rounded-xl" >
        <SelectValue />
        </SelectTrigger>
        <SelectContent>
{
    ["Inception", "Build", "Deploy", "GoToMarket", "Other"].map((p) => (
        <SelectItem key= { p } value = { p } >
        { p }
        </SelectItem>
    ))
}
</SelectContent>
    </Select>
                  ),
                },
{ key: "start", header: "Start", width: "150px", input: "date" },
{ key: "end", header: "End", width: "150px", input: "date" },
{ key: "costOneOff", header: "One-off cost", width: "140px", input: "number" },
{ key: "costMonthly", header: "Monthly cost", width: "140px", input: "number" },
{
    key: "dependsOn",
        header: "Depends on (comma IDs)",
            width: "220px",
                render: (v, row) => (
                    <Input
                      className= "h-8 rounded-xl"
    value = {(Array.isArray(v) ? v.join(",") : "") as any
}
onChange = {(e) => {
    const ids = e.target.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    setTasks(data.tasks.map((t) => (t.id === row.id ? { ...t, dependsOn: ids } : t)));
}}
                    />
                  ),
                },
              ]}
            />

    < DataTable<Segment>
title = "Market Segments"
rows = { data.segments }
setRows = { setSegments }
addRow = {() => ({
    id: uid("M"),
    name: "New Segment",
    entry: addMonths(data.meta.start, 6),
    tam: 100000,
    samPct: 0.2,
    somPct: 0.05,
    pricePerUnit: 50,
    cacPerUnit: 30,
    rampMonths: 12,
})}
columns = {
    [
    { key: "id", header: "ID", width: "110px", input: "text" },
    { key: "name", header: "Name", width: "280px", input: "text" },
    { key: "entry", header: "Entry", width: "150px", input: "date" },
    { key: "exit", header: "Exit", width: "150px", input: "date" },
    { key: "tam", header: "TAM", width: "130px", input: "number" },
    {
        key: "samPct",
        header: "SAM % (0..1)",
        width: "130px",
        input: "number",
        parse: (v) => clamp01(Number(v || 0)),
    },
    {
        key: "somPct",
        header: "SOM % (0..1)",
        width: "130px",
        input: "number",
        parse: (v) => clamp01(Number(v || 0)),
    },
    { key: "pricePerUnit", header: "£/unit/mo", width: "120px", input: "number" },
    { key: "cacPerUnit", header: "CAC/unit", width: "120px", input: "number" },
    { key: "rampMonths", header: "Ramp (months)", width: "130px", input: "number" },
              ]}
    />

    <DataTable<Opex>
              title="Operating Costs (Opex)"
rows = { data.opex }
setRows = { setOpex }
addRow = {() => ({
    id: uid("O"),
    category: "New Opex",
    start: data.meta.start,
    monthly: 0,
})}
columns = {
    [
    { key: "id", header: "ID", width: "110px", input: "text" },
    { key: "category", header: "Category", width: "260px", input: "text" },
    { key: "start", header: "Start", width: "150px", input: "date" },
    { key: "end", header: "End", width: "150px", input: "date" },
    { key: "monthly", header: "Monthly", width: "160px", input: "number" },
              ]}
    />

    <Card className="rounded-2xl shadow-sm" >
        <CardHeader>
        <CardTitle className="text-base" > Notes / Next steps </CardTitle>
            </CardHeader>
            < CardContent className = "text-sm text-muted-foreground" >
                <ul className="list-disc pl-5 space-y-2" >
                    <li>
                    This MVP uses a simple adoption ramp(ease -in -out) to reach < b > SOM % of SAM </b> per segment.
                        </li>
                        <li>
                    Next obvious upgrade: explicit < b > ramp tables < /b> (month → SOM%), plus churn/retention.
                  </li>
    <li>
                    Another upgrade: dependency - aware < b > auto - scheduling </b> (compute task start based on deps).
    </li>
    </ul>
    </CardContent>
    </Card>
    </TabsContent>
    </Tabs>
    </div>
    </div>
  );
}

// -----------------------------
// Self-tests (no test runner required)
// -----------------------------

function assert(condition: any, message: string) {
    if (!condition) throw new Error(`Self-test failed: ${message}`);
}

function approxEqual(a: number, b: number, eps = 1e-6) {
    return Math.abs(a - b) <= eps;
}

function runSelfTests() {
    // monthIndexFromStart basics
    assert(monthIndexFromStart("2025-01-15", "2025-01-15") === 0, "monthIndexFromStart same day");
    assert(monthIndexFromStart("2025-01-15", "2025-02-15") === 1, "monthIndexFromStart next month");
    assert(monthIndexFromStart("2025-01-15", "2025-02-01") === 0, "monthIndexFromStart dayAdjust");

    // clamp01
    assert(clamp01(-1) === 0, "clamp01 low");
    assert(clamp01(2) === 1, "clamp01 high");

    // segmentActiveUnitsAtMonth ramps up
    const seg: Segment = {
        id: "S",
        name: "Seg",
        entry: "2025-01-01",
        tam: 1000,
        samPct: 0.5,
        somPct: 0.1,
        pricePerUnit: 10,
        cacPerUnit: 1,
        rampMonths: 10,
    };
    const u0 = segmentActiveUnitsAtMonth(seg, "2025-01-01", 0);
    const u5 = segmentActiveUnitsAtMonth(seg, "2025-01-01", 5);
    const u10 = segmentActiveUnitsAtMonth(seg, "2025-01-01", 10);
    assert(u0 >= 0, "segment units non-negative");
    assert(u5 > u0, "segment units should increase mid-ramp");
    assert(u10 > u5, "segment units should increase by end of ramp");
    const target = seg.tam * seg.samPct * seg.somPct;
    assert(u10 <= target + 1e-3, "segment units should not exceed target by much");

    // computeSeries length + cash
    const d: VentureData = { ...DEFAULT, meta: { ...DEFAULT.meta, start: "2025-01-01", horizonMonths: 6 } };
    const s = computeSeries(d);
    assert(s.length === 6, "computeSeries uses horizonMonths");
    assert(!Number.isNaN(s[0].cash), "cash is numeric");
    assert(approxEqual(s[s.length - 1].cash, s.reduce((acc, r) => acc + r.profit, 0)), "cash equals sum(profit)");
    assert(
        approxEqual((s[s.length - 1] as any).cumRevenue, s.reduce((acc, r) => acc + r.revenue, 0)),
        "cumRevenue equals sum(revenue)",
    );
    assert(
        approxEqual((s[s.length - 1] as any).cumCosts, s.reduce((acc, r) => acc + r.costs, 0)),
        "cumCosts equals sum(costs)",
    );
    const invested = Math.max(1, Number((s[s.length - 1] as any).cumCosts));
    const roi = Number(s[s.length - 1].cash) / invested;
    assert(Number.isFinite(roi), "ROI is finite");

    // summary helpers
    const idx = firstIndexWhere([0, 1, 2, 3], (x) => x >= 2);
    assert(idx === 2, "firstIndexWhere finds first match");
    const agg = aggregateByCalendarYear(s, d.meta.start);
    assert(Array.isArray(agg), "aggregateByCalendarYear returns array");
}

// Only run when explicitly in test mode (avoid surprising behavior in the browser)
if (typeof window === "undefined" && typeof process !== "undefined" && (process as any)?.env?.NODE_ENV === "test") {
    runSelfTests();
}
