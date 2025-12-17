import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import type { VentureData, Task } from "../types";
import { monthIndexFromStart, addMonths, formatMonthLabel, isWithin } from "../utils/dateUtils";
import { fmtCurrency, fmtCompact, clamp01 } from "../utils/formatUtils";
import { computeSeries, segmentActiveUnitsAtMonth } from "../utils/modelEngine";
import { SankeyCard } from "./SankeyCard";

export function TimelineView({
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

    const segRevenueAtCursor = (s: any) => segmentActiveUnitsAtMonth(s, start, month) * s.pricePerUnit;

    return (
        <div className="grid gap-4">
            <Card className="rounded-2xl shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-base">Timeline</CardTitle>
                        <div className="text-sm text-muted-foreground">
                            Month cursor: <span className="font-medium text-foreground">{monthLabel}</span> ({monthISO})
                        </div>
                    </div>
                    <div className="w-[320px]">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                            <span>Start</span>
                            <span>Horizon {horizonMonths}m</span>
                        </div>
                        <Slider
                            value={[month]}
                            min={0}
                            max={Math.max(0, horizonMonths - 1)}
                            step={1}
                            onValueChange={(v) => setMonth(v[0] ?? 0)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-auto">
                        <div className="min-w-[1100px]">
                            {/* Month header */}
                            <div
                                className="grid"
                                style={{
                                    gridTemplateColumns: `260px repeat(${gridCols}, minmax(26px, 1fr)) 240px`,
                                }}
                            >
                                <div className="sticky left-0 bg-background z-20 p-2 text-xs text-muted-foreground border-b">Lane</div>
                                {months.map((m) => (
                                    <div
                                        key={m}
                                        className={`p-2 text-[10px] text-muted-foreground border-b ${m === month ? "bg-muted/60" : ""}`}
                                        title={formatMonthLabel(start, m)}
                                    >
                                        {m % 3 === 0 ? formatMonthLabel(start, m) : ""}
                                    </div>
                                ))}
                                <div className="sticky right-0 bg-background z-20 p-2 text-xs text-muted-foreground border-b text-right">
                                    Overall (now)
                                </div>
                            </div>

                            {/* Tasks */}
                            <div className="mt-2">
                                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Inception / Execution</div>
                                {data.tasks
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
                                                key={t.id}
                                                className="grid items-stretch"
                                                style={{
                                                    gridTemplateColumns: `260px repeat(${gridCols}, minmax(26px, 1fr)) 240px`,
                                                }}
                                            >
                                                <div className="sticky left-0 bg-background z-10 p-2 border-b">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium truncate">{t.name}</div>
                                                            <div className="text-xs text-muted-foreground truncate">
                                                                {t.phase} · {t.id}
                                                            </div>
                                                        </div>
                                                        {blocked && (
                                                            <Badge variant="destructive" className="rounded-xl">
                                                                deps
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        One-off {fmtCurrency(t.costOneOff, currency)} · Monthly {fmtCurrency(t.costMonthly, currency)}
                                                    </div>
                                                </div>

                                                {months.map((m) => {
                                                    const inside = m >= s && m <= e;
                                                    const isCursor = m === month;
                                                    return (
                                                        <div key={m} className={`border-b ${isCursor ? "bg-muted/60" : ""}`}>
                                                            {inside ? (
                                                                <div
                                                                    className={`h-full m-[3px] rounded-lg ${active ? "bg-primary/25" : "bg-muted"} ${blocked ? "ring-1 ring-destructive/60" : ""}`}
                                                                    title={`${t.name}\n${t.start} → ${t.end}\nDepends: ${t.dependsOn.join(", ") || "—"}`}
                                                                />
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}

                                                <div className="sticky right-0 bg-background z-10 p-2 border-b text-right">
                                                    <div className="text-xs text-muted-foreground">Cost (now)</div>
                                                    <div className="text-sm font-medium">{fmtCurrency(nowCost, currency)}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>

                            <Separator className="my-4" />

                            {/* Segments */}
                            <div>
                                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Market Segments</div>
                                {data.segments
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
                                                key={seg.id}
                                                className="grid items-stretch"
                                                style={{
                                                    gridTemplateColumns: `260px repeat(${gridCols}, minmax(26px, 1fr)) 240px`,
                                                }}
                                            >
                                                <div className="sticky left-0 bg-background z-10 p-2 border-b">
                                                    <div className="text-sm font-medium truncate">{seg.name}</div>
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        {seg.id} · Entry {seg.entry}
                                                        {seg.exit ? ` · Exit ${seg.exit}` : ""}
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap gap-2">
                                                        <Badge variant="secondary" className="rounded-xl">
                                                            TAM {fmtCompact(tam)}
                                                        </Badge>
                                                        <Badge variant="secondary" className="rounded-xl">
                                                            SAM {fmtCompact(sam)} ({(samPct * 100).toFixed(1)}%)
                                                        </Badge>
                                                        <Badge variant="secondary" className="rounded-xl">
                                                            SOM {fmtCompact(som)} ({(somPct * 100).toFixed(1)}%)
                                                        </Badge>
                                                    </div>
                                                </div>

                                                {months.map((m) => {
                                                    const inside = m >= entryM && m <= exitM;
                                                    const isCursor = m === month;
                                                    if (!inside) return <div key={m} className={`border-b ${isCursor ? "bg-muted/60" : ""}`} />;

                                                    const barH = 34;
                                                    const samW = Math.max(4, Math.round(samPct * 100));
                                                    const somWithinSam = samPct > 0 ? Math.max(2, Math.round((somPct / samPct) * 100)) : 2;

                                                    return (
                                                        <div key={m} className={`border-b ${isCursor ? "bg-muted/60" : ""}`}>
                                                            <div className="m-[6px] rounded-lg bg-muted/70" style={{ height: barH }}>
                                                                <div className="h-full rounded-lg bg-primary/15" style={{ width: `${samW}%` }}>
                                                                    <div
                                                                        className="h-full rounded-lg bg-primary/35"
                                                                        style={{ width: `${somWithinSam}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                            {isCursor && (
                                                                <div className="px-1 pb-2 text-[10px] text-muted-foreground">
                                                                    <div className="flex items-center justify-between">
                                                                        <span>SAM {(samPct * 100).toFixed(0)}%</span>
                                                                        <span>SOM {(somPct * 100).toFixed(0)}%</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                                <div className="sticky right-0 bg-background z-10 p-2 border-b text-right">
                                                    <div className="text-xs text-muted-foreground">Now</div>
                                                    <div className="text-sm font-medium">{fmtCurrency(revenueNow, currency)}</div>
                                                    <div className="text-xs text-muted-foreground mt-1">Units {fmtCompact(unitsNow)}</div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                {/* Overall row */}
                                <div
                                    className="grid items-stretch"
                                    style={{
                                        gridTemplateColumns: `260px repeat(${gridCols}, minmax(26px, 1fr)) 240px`,
                                    }}
                                >
                                    <div className="sticky left-0 bg-background z-10 p-2 border-t">
                                        <div className="text-sm font-semibold">Overall</div>
                                        <div className="text-xs text-muted-foreground">P&L at cursor month</div>
                                    </div>

                                    {months.map((m) => {
                                        const isCursor = m === month;
                                        return <div key={m} className={`border-t ${isCursor ? "bg-muted/60" : ""}`} />;
                                    })}

                                    <div className="sticky right-0 bg-background z-10 p-2 border-t text-right">
                                        <div className="text-xs text-muted-foreground">Revenue</div>
                                        <div className="text-sm font-medium">{fmtCurrency(snap.revenue, currency)}</div>
                                        <div className="mt-2 text-xs text-muted-foreground">Costs</div>
                                        <div className="text-sm font-medium">{fmtCurrency(snap.costs, currency)}</div>
                                        <div className="mt-2 text-xs text-muted-foreground">EBITDA</div>
                                        <div className="text-sm font-semibold">{fmtCurrency(snap.profit, currency)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <SankeyCard data={data} month={month} />
        </div>
    );
}
