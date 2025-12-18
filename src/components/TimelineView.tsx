import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { VentureData, ComputedTask } from "../types";
import { monthIndexFromStart, addMonths, formatMonthLabel, isWithin } from "../utils/dateUtils";
import { fmtCurrency, fmtCompact, clamp01 } from "../utils/formatUtils";
import { computeSeries, segmentActiveUnitsAtMonth, computeTaskDates } from "../utils/modelEngine";
import { calcBarHeight } from "../utils/chartScaling";

// Map currency codes to symbols
function getCurrencySymbol(currency: string): string {
    const symbols: Record<string, string> = {
        USD: "$",
        EUR: "€",
        GBP: "£",
        JPY: "¥",
        CNY: "¥",
        CAD: "$",
        AUD: "$",
        NZD: "$",
        CHF: "Fr",
        INR: "₹",
        KRW: "₩",
        RUB: "₽",
        BRL: "R$",
        ZAR: "R",
        MXN: "$",
        SGD: "$",
        HKD: "$",
        SEK: "kr",
        NOK: "kr",
        DKK: "kr",
        PLN: "zł",
        THB: "฿",
        IDR: "Rp",
        MYR: "RM",
        PHP: "₱",
        TRY: "₺",
        AED: "د.إ",
        SAR: "﷼",
    };
    return symbols[currency] || currency;
}

export function TimelineView({
    data,
    month,
}: {
    data: VentureData;
    month: number;
}) {
    const { start, horizonMonths, currency } = data.meta;
    // Track localStorage version to force reload when colors change
    const [storageVersion, setStorageVersion] = useState(0);

    const months = useMemo(() => Array.from({ length: Math.max(1, horizonMonths) }, (_, i) => i), [horizonMonths]);
    const gridCols = Math.max(12, months.length);

    const monthLabel = formatMonthLabel(start, month);
    const monthISO = addMonths(start, month);

    const series = useMemo(() => computeSeries(data), [data]);
    const snap = series[Math.min(series.length - 1, Math.max(0, month))] ?? series[0];

    // Listen to storage events to reload colors when they change
    React.useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === "streamColors") {
                setStorageVersion(v => v + 1);
            }
        };
        window.addEventListener("storage", handleStorage);

        // Also listen for custom event from same window (storage event doesn't fire in same window)
        const handleCustomStorage = () => {
            setStorageVersion(v => v + 1);
        };
        window.addEventListener("streamColorsChanged", handleCustomStorage);

        return () => {
            window.removeEventListener("storage", handleStorage);
            window.removeEventListener("streamColorsChanged", handleCustomStorage);
        };
    }, []);

    // Load stream colors from localStorage - reactive to storage changes
    const streamColors = useMemo(() => {
        const stored = localStorage.getItem("streamColors");
        if (!stored) return new Map<string, string>();
        try {
            const obj = JSON.parse(stored);
            return new Map<string, string>(Object.entries(obj));
        } catch {
            return new Map<string, string>();
        }
    }, [data.revenueStreams, storageVersion]);

    // Compute task dates
    const computedTasks = useMemo(() => computeTaskDates(data.tasks, start), [data.tasks, start]);

    const taskBlockedByDeps = (t: ComputedTask) => {
        if (!t.dependsOn?.length) return false;
        const tStartM = monthIndexFromStart(start, t.computedStart);
        return t.dependsOn
            .map((depStr) => {
                // Extract just the task ID (ignore s/e and offsets for now)
                const taskId = depStr.match(/^([a-zA-Z0-9_]+)/)?.[1];
                return computedTasks.find((x) => x.id === taskId);
            })
            .filter(Boolean)
            .some((dep) => {
                const depEnd = (dep as ComputedTask).computedEnd || (dep as ComputedTask).computedStart;
                return monthIndexFromStart(start, depEnd) > tStartM;
            });
    };

    const taskCostAtCursor = (t: ComputedTask) => {
        const active = isWithin(monthISO, t.computedStart, t.computedEnd);
        const oneOff = monthIndexFromStart(start, t.computedStart) === month ? t.costOneOff : 0;
        return (active ? t.costMonthly : 0) + oneOff;
    };

    // Calculate cost for a specific task at a specific month index
    const taskCostAtMonth = (t: ComputedTask, m: number) => {
        const monthDate = addMonths(start, m);
        const active = isWithin(monthDate, t.computedStart, t.computedEnd);
        const oneOff = monthIndexFromStart(start, t.computedStart) === m ? t.costOneOff : 0;
        return (active ? t.costMonthly : 0) + oneOff;
    };

    // Calculate cumulative costs to date for a task
    const taskCostsToDate = (t: ComputedTask) => {
        let total = 0;
        for (let m = 0; m <= month; m++) {
            total += taskCostAtMonth(t, m);
        }
        return total;
    };


    const segRevenueAtCursor = (s: any) => segmentActiveUnitsAtMonth(s, start, month) * s.pricePerUnit;

    // Calculate active units for a revenue stream at a specific month
    const streamUnitsAtMonth = (stream: any, m: number) => {
        // Check if stream has started (unlockEventId)
        const unlockEvent = data.timeline?.find((t) => t.id === stream.unlockEventId);
        const startMonth = unlockEvent?.month ?? 0;

        if (m < startMonth) return 0;

        // Check if stream has ended (duration)
        if (stream.duration) {
            const match = stream.duration.match(/^(\d+)([dwmy])$/);
            if (match) {
                const value = parseInt(match[1]!, 10);
                const unit = match[2]!;
                let durationMonths = 0;
                if (unit === "d") durationMonths = value / 30;
                else if (unit === "w") durationMonths = value / 4;
                else if (unit === "m") durationMonths = value;
                else if (unit === "y") durationMonths = value * 12;

                if (m >= startMonth + durationMonths) return 0;
            }
        }

        // Calculate units based on adoption model
        const monthsSinceStart = m - startMonth;
        const { initialUnits, acquisitionRate, maxUnits, churnRate, expansionRate } = stream.adoptionModel;

        // Get distribution mode (most likely value)
        const getMode = (dist: any) => dist?.mode ?? ((dist?.min + dist?.max) / 2) ?? 0;

        const acqRate = getMode(acquisitionRate);
        const churn = getMode(churnRate) || 0;
        const expansion = getMode(expansionRate) || 0;

        // Simple model: start with initial units, grow by acquisition rate, apply net churn/expansion
        let units = initialUnits;
        for (let i = 0; i < monthsSinceStart; i++) {
            // Add new acquisitions
            units += acqRate;
            // Apply net churn/expansion: units * (1 - churn + expansion)
            units = units * (1 - churn / 100 + expansion / 100);
            // Cap at max units if specified
            if (maxUnits && units > maxUnits) units = maxUnits;
        }

        return Math.max(0, units);
    };

    // Calculate revenue for a revenue stream at a specific month
    const streamRevenueAtMonth = (stream: any, m: number) => {
        const units = streamUnitsAtMonth(stream, m);
        const priceMode = stream.unitEconomics.pricePerUnit?.mode ??
                         ((stream.unitEconomics.pricePerUnit?.min + stream.unitEconomics.pricePerUnit?.max) / 2) ?? 0;
        return units * priceMode;
    };

    // Calculate cumulative revenue to date for a revenue stream
    const streamRevenueToDate = (stream: any) => {
        let total = 0;
        for (let m = 0; m <= month; m++) {
            total += streamRevenueAtMonth(stream, m);
        }
        return total;
    };

    // Find max TOTAL revenue per month (sum all streams per month, then find max month)
    const maxMonthlyRevenue = useMemo(() => {
        if (!data.revenueStreams || data.revenueStreams.length === 0) return 1;
        let max = 0;
        for (let m = 0; m < horizonMonths; m++) {
            let totalRevenue = 0;
            for (const stream of data.revenueStreams) {
                totalRevenue += streamRevenueAtMonth(stream, m);
            }
            if (totalRevenue > max) max = totalRevenue;
        }
        return max || 1;
    }, [data.revenueStreams, horizonMonths]);

    // Find max TOTAL cost per month (sum all tasks/fixed costs per month, then find max month)
    const maxMonthlyCost = useMemo(() => {
        let max = 0;
        for (let m = 0; m < horizonMonths; m++) {
            let totalCost = 0;
            // Sum task costs
            for (const t of computedTasks) {
                const monthDate = addMonths(start, m);
                const active = isWithin(monthDate, t.computedStart, t.computedEnd);
                const oneOff = monthIndexFromStart(start, t.computedStart) === m ? t.costOneOff : 0;
                totalCost += (active ? t.costMonthly : 0) + oneOff;
            }
            // Sum fixed costs
            if (data.costModel?.fixedMonthlyCosts) {
                for (const fc of data.costModel.fixedMonthlyCosts) {
                    const mode = fc.monthlyCost.mode ?? (fc.monthlyCost.min + fc.monthlyCost.max) / 2;
                    totalCost += mode;
                }
            }
            if (totalCost > max) max = totalCost;
        }
        return max || 1;
    }, [computedTasks, horizonMonths, start, data.costModel?.fixedMonthlyCosts]);

    // Unified max for both revenue and costs (for proportional bar chart scaling)
    // This is the "biggest value" across all months
    const unifiedMax = useMemo(() => {
        return Math.max(maxMonthlyRevenue, maxMonthlyCost);
    }, [maxMonthlyRevenue, maxMonthlyCost]);

    // Calculate revenue breakdown by stream for current month
    const revenueBreakdown = useMemo(() => {
        if (!data.revenueStreams) return [];
        return data.revenueStreams
            .map((stream) => ({
                stream,
                revenue: streamRevenueAtMonth(stream, month),
                color: streamColors.get(stream.id) || "#4f46e5",
            }))
            .filter((item) => item.revenue > 0)
            .sort((a, b) => b.revenue - a.revenue);
    }, [data.revenueStreams, month, streamColors]);

    // Calculate cost breakdown by task for current month
    const costBreakdown = useMemo(() => {
        return computedTasks
            .map((task, idx) => ({
                task,
                cost: taskCostAtMonth(task, month),
                // Use varying shades of red for different tasks
                color: `hsl(0, 70%, ${45 + (idx % 3) * 10}%)`,
            }))
            .filter((item) => item.cost > 0)
            .sort((a, b) => b.cost - a.cost);
    }, [computedTasks, month]);

    return (
        <Card className="rounded-2xl shadow-sm">
                <CardHeader className="space-y-4">
                    <div className="flex flex-row items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-base">Timeline</CardTitle>
                            <div className="text-sm text-muted-foreground">
                                Month cursor: <span className="font-medium text-foreground">{monthLabel}</span> ({monthISO})
                            </div>
                        </div>
                    </div>

                    {/* Snapshot - Stacked Bar Charts */}
                    <div className="grid grid-cols-[1fr_auto] gap-4 pt-2 border-t">
                        <div className="space-y-3">
                            {/* Revenue Bar */}
                            <div>
                                <div className="text-xs text-muted-foreground mb-1.5">Revenue</div>
                                <div className="flex h-8 rounded overflow-hidden border">
                                    {revenueBreakdown.length > 0 ? (
                                        <>
                                            {revenueBreakdown.map((item) => {
                                                const widthPct = calcBarHeight(item.revenue, unifiedMax);
                                                return (
                                                    <div
                                                        key={item.stream.id}
                                                        className="flex items-center justify-center text-[10px] font-medium text-white"
                                                        style={{
                                                            width: `${widthPct}%`,
                                                            backgroundColor: item.color,
                                                        }}
                                                        title={`${item.stream.name}: ${fmtCurrency(item.revenue, currency)}`}
                                                    >
                                                        {widthPct > 10 && fmtCurrency(item.revenue, currency)}
                                                    </div>
                                                );
                                            })}
                                            {snap.revenue < unifiedMax && (
                                                <div className="flex-1 bg-muted/30" />
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex-1 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                            No revenue
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Run Rate (Costs) Bar */}
                            <div>
                                <div className="text-xs text-muted-foreground mb-1.5">Run Rate</div>
                                <div className="flex h-8 rounded overflow-hidden border">
                                    {costBreakdown.length > 0 ? (
                                        <>
                                            {costBreakdown.map((item) => {
                                                const widthPct = calcBarHeight(item.cost, unifiedMax);
                                                return (
                                                    <div
                                                        key={item.task.id}
                                                        className="flex items-center justify-center text-[10px] font-medium text-white"
                                                        style={{
                                                            width: `${widthPct}%`,
                                                            backgroundColor: item.color,
                                                        }}
                                                        title={`${item.task.name}: ${fmtCurrency(item.cost, currency)}`}
                                                    >
                                                        {widthPct > 10 && fmtCurrency(item.cost, currency)}
                                                    </div>
                                                );
                                            })}
                                            {snap.costs < unifiedMax && (
                                                <div className="flex-1 bg-muted/30" />
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex-1 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                            No costs
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Gross Margin */}
                        <div className="flex flex-col justify-center px-4 border-l space-y-2">
                            <div>
                                <div className="text-xs text-muted-foreground">Gross Margin (at month)</div>
                                <div className="text-lg font-bold">{fmtCurrency(snap.profit, currency)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Gross Margin (to date)</div>
                                <div className="text-lg font-semibold">
                                    {fmtCurrency(snap.cash ?? 0, currency)}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-auto max-h-[600px]">
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
                                {computedTasks
                                    .slice()
                                    .sort((a, b) => monthIndexFromStart(start, a.computedStart) - monthIndexFromStart(start, b.computedStart))
                                    .map((t) => {
                                        const s = monthIndexFromStart(start, t.computedStart);
                                        const e = t.computedEnd ? Math.max(s, monthIndexFromStart(start, t.computedEnd)) : s;
                                        const blocked = taskBlockedByDeps(t);
                                        const active = isWithin(monthISO, t.computedStart, t.computedEnd);
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
                                                    const monthlyCost = taskCostAtMonth(t, m);
                                                    const costPct = calcBarHeight(monthlyCost, unifiedMax);
                                                    const hasContent = inside && monthlyCost > 0;

                                                    return (
                                                        <div key={m} className={`border-b ${isCursor ? "bg-muted/60" : ""} relative`}>
                                                            {hasContent ? (
                                                                <div className="h-full flex flex-col justify-end p-[3px]">
                                                                    <div
                                                                        className={`rounded-lg ${active ? "bg-red-500/25" : "bg-red-500/15"} ${blocked ? "ring-1 ring-destructive/60" : ""} relative flex items-end justify-center`}
                                                                        style={{ height: `${Math.max(20, costPct)}%` }}
                                                                        title={`${t.name}\n${t.computedStart} → ${t.computedEnd || "ongoing"}\nCost this month: ${fmtCurrency(monthlyCost, currency)}\nDuration: ${t.duration || "ongoing"}\nDepends: ${t.dependsOn.join(", ") || "—"}`}
                                                                    >
                                                                        <div
                                                                            className="text-[10px] text-muted-foreground/80 font-medium"
                                                                            style={{
                                                                                writingMode: "vertical-rl",
                                                                                transform: "rotate(180deg)",
                                                                                paddingLeft: "6px",
                                                                            }}
                                                                        >
                                                                            {getCurrencySymbol(currency)}{fmtCompact(monthlyCost)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}

                                                <div className="sticky right-0 bg-background z-10 p-2 border-b text-right">
                                                    <div className="text-xs text-muted-foreground">Costs to Date</div>
                                                    <div className="text-sm font-medium">{fmtCurrency(taskCostsToDate(t), currency)}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>

                            <Separator className="my-4" />

                            {/* Revenue Streams */}
                            <div>
                                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Revenue Streams</div>
                                {data.revenueStreams && data.revenueStreams.length > 0 ? (
                                    data.revenueStreams.map((stream) => {
                                        const unlockEvent = data.timeline?.find((t) => t.id === stream.unlockEventId);
                                        const startMonth = unlockEvent?.month ?? 0;

                                        // Calculate end month based on duration
                                        let endMonth = gridCols - 1;
                                        if (stream.duration) {
                                            const match = stream.duration.match(/^(\d+)([dwmy])$/);
                                            if (match) {
                                                const value = parseInt(match[1]!, 10);
                                                const unit = match[2]!;
                                                let durationMonths = 0;
                                                if (unit === "d") durationMonths = value / 30;
                                                else if (unit === "w") durationMonths = value / 4;
                                                else if (unit === "m") durationMonths = value;
                                                else if (unit === "y") durationMonths = value * 12;
                                                endMonth = Math.min(startMonth + durationMonths - 1, gridCols - 1);
                                            }
                                        }

                                        const revenueToDate = streamRevenueToDate(stream);
                                        const unitsNow = streamUnitsAtMonth(stream, month);
                                        const revenueNow = streamRevenueAtMonth(stream, month);

                                        return (
                                            <div
                                                key={stream.id}
                                                className="grid items-stretch"
                                                style={{
                                                    gridTemplateColumns: `260px repeat(${gridCols}, minmax(26px, 1fr)) 240px`,
                                                }}
                                            >
                                                <div className="sticky left-0 bg-background z-10 p-2 border-b">
                                                    <div className="text-sm font-medium truncate">{stream.name}</div>
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        {stream.id} · {stream.revenueUnit}
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        Start M{startMonth}
                                                        {stream.duration ? ` · ${stream.duration}` : " · Infinite"}
                                                    </div>
                                                </div>

                                                {months.map((m) => {
                                                    const inside = m >= startMonth && m <= endMonth;
                                                    const isCursor = m === month;
                                                    const monthlyRevenue = streamRevenueAtMonth(stream, m);
                                                    const revenuePct = calcBarHeight(monthlyRevenue, unifiedMax);
                                                    const hasRevenue = inside && monthlyRevenue > 0;
                                                    const streamColor = streamColors.get(stream.id) || "#4f46e5";

                                                    return (
                                                        <div key={m} className={`border-b ${isCursor ? "bg-muted/60" : ""} relative`}>
                                                            {hasRevenue ? (
                                                                <div className="h-full flex flex-col justify-end p-[3px]">
                                                                    <div
                                                                        className="rounded-lg relative flex items-end justify-center"
                                                                        style={{
                                                                            height: `${Math.max(20, revenuePct)}%`,
                                                                            backgroundColor: `${streamColor}40`,
                                                                        }}
                                                                        title={`${stream.name}\nRevenue: ${fmtCurrency(monthlyRevenue, currency)}\nUnits: ${fmtCompact(streamUnitsAtMonth(stream, m))}`}
                                                                    >
                                                                        <div
                                                                            className="text-[10px] font-medium"
                                                                            style={{
                                                                                writingMode: "vertical-rl",
                                                                                transform: "rotate(180deg)",
                                                                                paddingLeft: "6px",
                                                                                color: streamColor,
                                                                            }}
                                                                        >
                                                                            {getCurrencySymbol(currency)}{fmtCompact(monthlyRevenue)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}

                                                <div className="sticky right-0 bg-background z-10 p-2 border-b text-right">
                                                    <div className="text-xs text-muted-foreground">Revenue to Date</div>
                                                    <div className="text-sm font-medium">{fmtCurrency(revenueToDate, currency)}</div>
                                                    <div className="text-xs text-muted-foreground mt-1">Units {fmtCompact(unitsNow)}</div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="px-2 py-2 text-xs text-muted-foreground">
                                        No revenue streams defined yet.
                                    </div>
                                )}

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
    );
}
