import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VentureData } from "../types";
import { addMonths, isWithin } from "../utils/dateUtils";
import { fmtCurrency, fmtCompact } from "../utils/formatUtils";
import { computeSeries, computeTaskDates } from "../utils/modelEngine";

type TablePageProps = {
    data: VentureData;
    month: number;
};

export function TablePage({ data, month }: TablePageProps) {
    const { start, currency } = data.meta;
    // Track expanded cells by "streamId:monthIndex" key
    const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
    // Track localStorage version to force reload when colors change
    const [storageVersion, setStorageVersion] = useState(0);

    const series = useMemo(() => computeSeries(data), [data]);

    // Compute task dates for cost calculations
    const computedTasks = useMemo(() => computeTaskDates(data.tasks, data.meta.start), [data.tasks, data.meta.start]);

    // Calculate cost for a task at a specific month index
    const taskCostAtMonth = (task: any, monthIdx: number) => {
        const monthISO = addMonths(start, monthIdx);
        const isActive = isWithin(monthISO, task.computedStart, task.computedEnd);
        const isStartMonth = task.computedStart === monthISO;

        if (!isActive) return { oneOff: 0, monthly: 0, total: 0 };

        const oneOff = isStartMonth ? task.costOneOff : 0;
        const monthly = task.costMonthly;
        const total = oneOff + monthly;

        return { oneOff, monthly, total };
    };

    // Listen to storage events to reload colors when they change
    React.useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === "streamColors") {
                setStorageVersion((v) => v + 1);
            }
        };
        window.addEventListener("storage", handleStorage);

        // Also listen for custom event from same window (storage event doesn't fire in same window)
        const handleCustomStorage = () => {
            setStorageVersion((v) => v + 1);
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
        const priceMode =
            stream.unitEconomics.pricePerUnit?.mode ??
            (stream.unitEconomics.pricePerUnit?.min + stream.unitEconomics.pricePerUnit?.max) / 2 ??
            0;
        return units * priceMode;
    };

    return (
        <Card className="rounded-2xl shadow-sm">
            <CardHeader>
                <div>
                    <CardTitle className="text-base">Financial Summary (Table View)</CardTitle>
                    <div className="text-sm text-muted-foreground">Click any cell to see revenue and cost breakdown</div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-auto max-h-[calc(100vh-300px)]">
                    <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 bg-background z-10">
                            <tr className="border-b">
                                <th className="text-left p-2 font-medium text-muted-foreground sticky left-0 bg-background z-20">
                                    Month
                                </th>
                                {data.revenueStreams &&
                                    data.revenueStreams.map((stream) => {
                                        const streamColor = streamColors.get(stream.id) || "#4f46e5";
                                        return (
                                            <th
                                                key={stream.id}
                                                className="text-center p-2 font-medium border-l"
                                                style={{
                                                    backgroundColor: `${streamColor}20`,
                                                    borderLeftColor: streamColor,
                                                    borderLeftWidth: "3px",
                                                }}
                                            >
                                                <div className="text-xs">{stream.name}</div>
                                                <div className="text-xs font-normal text-muted-foreground mt-1">Margin</div>
                                            </th>
                                        );
                                    })}
                                {computedTasks.map((task) => (
                                    <th
                                        key={task.id}
                                        className="text-center p-2 font-medium border-l"
                                        style={{
                                            backgroundColor: "hsl(0, 70%, 95%)",
                                            borderLeftColor: "hsl(0, 70%, 60%)",
                                            borderLeftWidth: "3px",
                                        }}
                                    >
                                        <div className="text-xs">{task.name}</div>
                                        <div className="text-xs font-normal text-muted-foreground mt-1">Cost</div>
                                    </th>
                                ))}
                                <th className="text-right p-2 font-medium text-muted-foreground border-l">Total Costs</th>
                                <th className="text-right p-2 font-medium text-muted-foreground border-l">Total Margin</th>
                            </tr>
                        </thead>
                        <tbody>
                            {series.map((row, idx) => {
                                const isCurrentMonth = idx === month;

                                return (
                                    <React.Fragment key={idx}>
                                        {/* Main row with margin values */}
                                        <tr
                                            className={`border-b ${
                                                isCurrentMonth ? "bg-muted/60 font-medium" : "hover:bg-muted/30"
                                            } transition-colors`}
                                        >
                                            <td className="p-2 sticky left-0 bg-inherit z-10 text-xs">{row.label}</td>
                                            {data.revenueStreams &&
                                                data.revenueStreams.map((stream) => {
                                                    const streamColor = streamColors.get(stream.id) || "#4f46e5";
                                                    const cellKey = `stream:${stream.id}:${idx}`;
                                                    const isExpanded = expandedCells.has(cellKey);

                                                    const units = streamUnitsAtMonth(stream, idx);
                                                    const priceDist = stream.unitEconomics.pricePerUnit;
                                                    const priceMode =
                                                        priceDist?.mode ?? ((priceDist?.min ?? 0) + (priceDist?.max ?? 0)) / 2;
                                                    const streamRev = streamRevenueAtMonth(stream, idx);

                                                    // Calculate costs
                                                    const unitsLastMonth = idx > 0 ? streamUnitsAtMonth(stream, idx - 1) : 0;
                                                    const newUnits = Math.max(0, units - unitsLastMonth);

                                                    const getDistValue = (dist: any) => {
                                                        if (!dist) return 0;
                                                        return dist.mode ?? ((dist.min ?? 0) + (dist.max ?? 0)) / 2;
                                                    };

                                                    const cacPerUnit = stream.acquisitionCosts
                                                        ? getDistValue(stream.acquisitionCosts.cacPerUnit)
                                                        : 0;
                                                    const onboardingPerUnit = stream.acquisitionCosts?.onboardingCostPerUnit
                                                        ? getDistValue(stream.acquisitionCosts.onboardingCostPerUnit)
                                                        : 0;

                                                    const cacCost = newUnits * cacPerUnit;
                                                    const onboardingTotal = newUnits * onboardingPerUnit;
                                                    const totalCosts = cacCost + onboardingTotal;
                                                    const margin = streamRev - totalCosts;

                                                    return (
                                                        <td
                                                            key={stream.id}
                                                            className="text-center p-0 border-l cursor-pointer"
                                                            style={{
                                                                backgroundColor: `${streamColor}10`,
                                                                borderLeftColor: `${streamColor}40`,
                                                            }}
                                                            onClick={() => {
                                                                const newSet = new Set(expandedCells);
                                                                if (isExpanded) {
                                                                    newSet.delete(cellKey);
                                                                } else {
                                                                    newSet.add(cellKey);
                                                                }
                                                                setExpandedCells(newSet);
                                                            }}
                                                        >
                                                            {isExpanded ? (
                                                                <div className="p-2">
                                                                    <div className="space-y-1 text-[10px]">
                                                                        <div className="font-semibold text-muted-foreground mb-1">
                                                                            Revenue:
                                                                        </div>
                                                                        <div className="pl-2 space-y-0.5">
                                                                            <div className="flex justify-between gap-4">
                                                                                <span className="text-muted-foreground">Units:</span>
                                                                                <span>{fmtCompact(units)}</span>
                                                                            </div>
                                                                            <div className="flex justify-between gap-4">
                                                                                <span className="text-muted-foreground">Price/unit:</span>
                                                                                <span>{fmtCurrency(priceMode, currency)}</span>
                                                                            </div>
                                                                            <div className="flex justify-between gap-4 font-medium border-t pt-0.5">
                                                                                <span>Total:</span>
                                                                                <span>{fmtCurrency(streamRev, currency)}</span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="font-semibold text-muted-foreground mt-2 mb-1">
                                                                            Costs:
                                                                        </div>
                                                                        <div className="pl-2 space-y-0.5">
                                                                            <div className="flex justify-between gap-4">
                                                                                <span className="text-muted-foreground">New units:</span>
                                                                                <span>{fmtCompact(newUnits)}</span>
                                                                            </div>
                                                                            <div className="flex justify-between gap-4">
                                                                                <span className="text-muted-foreground">CAC:</span>
                                                                                <span>{fmtCurrency(cacCost, currency)}</span>
                                                                            </div>
                                                                            <div className="flex justify-between gap-4">
                                                                                <span className="text-muted-foreground">Onboarding:</span>
                                                                                <span>{fmtCurrency(onboardingTotal, currency)}</span>
                                                                            </div>
                                                                            <div className="flex justify-between gap-4 font-medium border-t pt-0.5">
                                                                                <span>Total:</span>
                                                                                <span>{fmtCurrency(totalCosts, currency)}</span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="border-t mt-2 pt-1">
                                                                            <div className="flex justify-between gap-4 font-semibold">
                                                                                <span>Margin:</span>
                                                                                <span>{fmtCurrency(margin, currency)}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="p-2 text-xs font-medium">
                                                                    {fmtCurrency(margin, currency)}
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            {computedTasks.map((task) => {
                                                const cellKey = `task:${task.id}:${idx}`;
                                                const isExpanded = expandedCells.has(cellKey);
                                                const { oneOff, monthly, total } = taskCostAtMonth(task, idx);

                                                return (
                                                    <td
                                                        key={task.id}
                                                        className="text-center p-0 border-l cursor-pointer"
                                                        style={{
                                                            backgroundColor: "hsl(0, 70%, 97%)",
                                                            borderLeftColor: "hsl(0, 70%, 85%)",
                                                        }}
                                                        onClick={() => {
                                                            const newSet = new Set(expandedCells);
                                                            if (isExpanded) {
                                                                newSet.delete(cellKey);
                                                            } else {
                                                                newSet.add(cellKey);
                                                            }
                                                            setExpandedCells(newSet);
                                                        }}
                                                    >
                                                        {isExpanded ? (
                                                            <div className="p-2">
                                                                <div className="space-y-1 text-[10px]">
                                                                    <div className="font-semibold text-muted-foreground mb-1">
                                                                        Cost Breakdown:
                                                                    </div>
                                                                    <div className="pl-2 space-y-0.5">
                                                                        {oneOff > 0 && (
                                                                            <div className="flex justify-between gap-4">
                                                                                <span className="text-muted-foreground">One-off:</span>
                                                                                <span>{fmtCurrency(oneOff, currency)}</span>
                                                                            </div>
                                                                        )}
                                                                        <div className="flex justify-between gap-4">
                                                                            <span className="text-muted-foreground">Monthly:</span>
                                                                            <span>{fmtCurrency(monthly, currency)}</span>
                                                                        </div>
                                                                        <div className="flex justify-between gap-4 font-medium border-t pt-0.5">
                                                                            <span>Total:</span>
                                                                            <span>{fmtCurrency(total, currency)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="p-2 text-xs font-medium">
                                                                {total > 0 ? fmtCurrency(total, currency) : "—"}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="text-right p-2 border-l font-medium">
                                                {fmtCurrency(row.costs, currency)}
                                            </td>
                                            <td className="text-right p-2 border-l font-medium">
                                                {fmtCurrency(row.profit, currency)}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
