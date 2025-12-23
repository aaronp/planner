import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VentureData } from "../types";
import { fmtCurrency, fmtCompact } from "../utils/formatUtils";
import { computeSeries, computeTaskDates } from "../utils/modelEngine";
import {
    streamUnitsAtMonth,
    streamRevenueAtMonth,
    streamAcquisitionCostsAtMonth,
    taskCostAtMonth,
    fixedCostsAtMonth,
    getDistributionMode,
} from "../utils/logic";
import { calculateTotalCosts, calculateTotalMargin, type FormulaComponent } from "../utils/formulas";
import { useRisk } from "../contexts/RiskContext";

type TablePageProps = {
    data: VentureData;
    month: number;
};

export function TablePage({ data, month }: TablePageProps) {
    const { multipliers, streamDistributions, distributionSelection } = useRisk();
    const { start, currency } = data.meta;
    // Track expanded cells by "streamId:monthIndex" key
    const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
    // Track localStorage version to force reload when colors change
    const [storageVersion, setStorageVersion] = useState(0);
    // Track collapsed column groups
    const [revenueCollapsed, setRevenueCollapsed] = useState(false);
    const [costsCollapsed, setCostsCollapsed] = useState(false);
    const [totalsCollapsed, setTotalsCollapsed] = useState(false);

    const series = useMemo(
        () => computeSeries(data, multipliers.tasks, multipliers.fixedCosts, multipliers.revenueStreams, streamDistributions),
        [data, multipliers, streamDistributions]
    );

    // Compute task dates for cost calculations
    const computedTasks = useMemo(() => computeTaskDates(data.tasks, data.meta.start), [data.tasks, data.meta.start]);

    // Calculate cumulative profit for each month
    const cumulativeProfits = useMemo(() => {
        let cumulative = 0;
        return series.map((row) => {
            cumulative += row.profit;
            return cumulative;
        });
    }, [series]);

    // Listen to storage events to reload colors when they change
    React.useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === "streamColors" || e.key === "taskColors") {
                setStorageVersion((v) => v + 1);
            }
        };
        window.addEventListener("storage", handleStorage);

        // Also listen for custom event from same window (storage event doesn't fire in same window)
        const handleCustomStreamColors = () => {
            setStorageVersion((v) => v + 1);
        };
        const handleCustomTaskColors = () => {
            setStorageVersion((v) => v + 1);
        };
        window.addEventListener("streamColorsChanged", handleCustomStreamColors);
        window.addEventListener("taskColorsChanged", handleCustomTaskColors);

        return () => {
            window.removeEventListener("storage", handleStorage);
            window.removeEventListener("streamColorsChanged", handleCustomStreamColors);
            window.removeEventListener("taskColorsChanged", handleCustomTaskColors);
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

    // Load task colors from localStorage - reactive to storage changes
    const taskColors = useMemo(() => {
        const stored = localStorage.getItem("taskColors");
        if (!stored) return new Map<string, string>();
        try {
            const obj = JSON.parse(stored);
            return new Map<string, string>(Object.entries(obj));
        } catch {
            return new Map<string, string>();
        }
    }, [data.tasks, storageVersion]);

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
                        <thead className="sticky top-0 bg-card z-10 border-b">
                            {/* Group header row */}
                            <tr className="border-b">
                                {data.phases && data.phases.length > 0 && (
                                    <th className="text-left p-2 font-medium text-foreground sticky left-0 bg-card z-20" rowSpan={2}>
                                        Phase
                                    </th>
                                )}
                                <th className="text-left p-2 font-medium text-foreground bg-card z-10" rowSpan={2} style={data.phases && data.phases.length > 0 ? { position: "sticky", left: "80px", zIndex: 19 } : { position: "sticky", left: "0", zIndex: 20 }}>
                                    Month
                                </th>
                                {(data.revenueStreams?.length ?? 0) > 0 && (
                                    <th
                                        colSpan={revenueCollapsed ? 1 : data.revenueStreams!.length}
                                        className="text-center p-2 font-medium border-l cursor-pointer hover:bg-muted/50 transition-colors"
                                        style={{
                                            backgroundColor: "hsl(142, 70%, 95%)",
                                            borderLeftColor: "hsl(142, 70%, 60%)",
                                            borderLeftWidth: "3px",
                                        }}
                                        onClick={() => setRevenueCollapsed(!revenueCollapsed)}
                                        title="Click to collapse/expand revenue columns"
                                    >
                                        <div className="text-xs text-foreground">
                                            Revenue {revenueCollapsed ? "▸" : "▾"}
                                        </div>
                                    </th>
                                )}
                                {(computedTasks.length + (data.costModel?.fixedMonthlyCosts?.length ?? 0)) > 0 && (
                                    <th
                                        colSpan={costsCollapsed ? 1 : computedTasks.length + (data.costModel?.fixedMonthlyCosts?.length ?? 0)}
                                        className="text-center p-2 font-medium border-l cursor-pointer hover:bg-muted/50 transition-colors"
                                        style={{
                                            backgroundColor: "hsl(0, 70%, 95%)",
                                            borderLeftColor: "hsl(0, 70%, 60%)",
                                            borderLeftWidth: "3px",
                                        }}
                                        onClick={() => setCostsCollapsed(!costsCollapsed)}
                                        title="Click to collapse/expand cost columns"
                                    >
                                        <div className="text-xs text-foreground">
                                            Costs {costsCollapsed ? "▸" : "▾"}
                                        </div>
                                    </th>
                                )}
                                <th
                                    colSpan={totalsCollapsed ? 1 : 5}
                                    className="text-center p-2 font-medium border-l cursor-pointer hover:bg-muted/50 transition-colors"
                                    style={{
                                        backgroundColor: "hsl(220, 70%, 95%)",
                                        borderLeftColor: "hsl(220, 70%, 60%)",
                                        borderLeftWidth: "3px",
                                    }}
                                    onClick={() => setTotalsCollapsed(!totalsCollapsed)}
                                    title="Click to collapse/expand totals columns"
                                >
                                    <div className="text-xs text-foreground">
                                        Totals {totalsCollapsed ? "▸" : "▾"}
                                    </div>
                                </th>
                            </tr>
                            {/* Individual column headers */}
                            <tr className="border-b">
                                {!revenueCollapsed && data.revenueStreams &&
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
                                                <div className="text-xs text-foreground">{stream.name}</div>
                                                <div className="text-xs font-normal text-muted-foreground mt-1">Margin</div>
                                            </th>
                                        );
                                    })}
                                {revenueCollapsed && (data.revenueStreams?.length ?? 0) > 0 && (
                                    <th
                                        className="text-center p-2 font-medium border-l"
                                        style={{
                                            backgroundColor: "hsl(142, 70%, 95%)",
                                            borderLeftColor: "hsl(142, 70%, 60%)",
                                            borderLeftWidth: "3px",
                                        }}
                                    >
                                        <div className="text-xs text-foreground">Net Revenue</div>
                                    </th>
                                )}
                                {!costsCollapsed && computedTasks.map((task) => {
                                    const taskColor = taskColors.get(task.id) || "#3b82f6";
                                    return (
                                        <th
                                            key={task.id}
                                            className="text-center p-2 font-medium border-l"
                                            style={{
                                                backgroundColor: `${taskColor}20`,
                                                borderLeftColor: taskColor,
                                                borderLeftWidth: "3px",
                                            }}
                                        >
                                            <div className="text-xs text-foreground">{task.name}</div>
                                            <div className="text-xs font-normal text-muted-foreground mt-1">Cost</div>
                                        </th>
                                    );
                                })}
                                {!costsCollapsed && (data.costModel?.fixedMonthlyCosts ?? []).map((fixedCost) => (
                                    <th
                                        key={fixedCost.id}
                                        className="text-center p-2 font-medium border-l"
                                        style={{
                                            backgroundColor: "hsl(280, 50%, 95%)",
                                            borderLeftColor: "hsl(280, 50%, 60%)",
                                            borderLeftWidth: "3px",
                                        }}
                                    >
                                        <div className="text-xs text-foreground">{fixedCost.name}</div>
                                        <div className="text-xs font-normal text-muted-foreground mt-1">Fixed Cost</div>
                                    </th>
                                ))}
                                {costsCollapsed && (computedTasks.length + (data.costModel?.fixedMonthlyCosts?.length ?? 0)) > 0 && (
                                    <th
                                        className="text-center p-2 font-medium border-l"
                                        style={{
                                            backgroundColor: "hsl(0, 70%, 95%)",
                                            borderLeftColor: "hsl(0, 70%, 60%)",
                                            borderLeftWidth: "3px",
                                        }}
                                    >
                                        <div className="text-xs text-foreground">Total Costs</div>
                                    </th>
                                )}
                                {!totalsCollapsed && (
                                    <>
                                        {!revenueCollapsed && <th className="text-right p-2 font-medium text-foreground border-l bg-card">Net Revenue</th>}
                                        {!costsCollapsed && <th className="text-right p-2 font-medium text-foreground border-l bg-card">Total Costs</th>}
                                        <th className="text-right p-2 font-medium text-foreground border-l bg-card">Margin</th>
                                        <th className="text-right p-2 font-medium text-foreground border-l bg-card">Cumulative Profit</th>
                                        <th className="text-right p-2 font-medium text-foreground border-l bg-card">Balance</th>
                                    </>
                                )}
                                {totalsCollapsed && (
                                    <th className="text-right p-2 font-medium border-l" style={{
                                        backgroundColor: "hsl(220, 70%, 95%)",
                                        borderLeftColor: "hsl(220, 70%, 60%)",
                                        borderLeftWidth: "3px",
                                    }}>
                                        <div className="text-xs text-foreground">Balance</div>
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const phases = data.phases ?? [];
                                const hasPhases = phases.length > 0;

                                // Helper to get phase for a month
                                const getPhaseForMonth = (monthIdx: number) => {
                                    if (!hasPhases) return null;
                                    let currentMonth = 0;
                                    for (let i = 0; i < phases.length; i++) {
                                        const phase = phases[i]!;
                                        const match = phase.duration.match(/^(\d+)([dwmy])$/);
                                        let durationMonths = 0;
                                        if (match) {
                                            const value = parseInt(match[1]!, 10);
                                            const unit = match[2]!;
                                            if (unit === "d") durationMonths = value / 30;
                                            else if (unit === "w") durationMonths = value / 4;
                                            else if (unit === "m") durationMonths = value;
                                            else if (unit === "y") durationMonths = value * 12;
                                        } else {
                                            // Endless phase - extends to horizon
                                            durationMonths = data.meta.horizonMonths - currentMonth;
                                        }
                                        if (monthIdx >= currentMonth && monthIdx < currentMonth + durationMonths) {
                                            return { phase, index: i, startMonth: currentMonth, endMonth: currentMonth + durationMonths };
                                        }
                                        currentMonth += durationMonths;
                                    }
                                    return null;
                                };

                                const rows: JSX.Element[] = [];
                                let currentPhaseIndex = -1;
                                let phaseStartIdx = 0;

                                // Phase accumulators
                                let phaseRevenue = 0;
                                let phaseCosts = 0;
                                let phaseProfit = 0;

                                series.forEach((row, idx) => {
                                    const isCurrentMonth = idx === month;
                                    const phaseInfo = getPhaseForMonth(idx);
                                    const phaseIndex = phaseInfo?.index ?? -1;

                                    // Check if we've moved to a new phase
                                    if (hasPhases && phaseIndex !== currentPhaseIndex) {
                                        // Add summary row for previous phase (if exists)
                                        if (currentPhaseIndex >= 0) {
                                            rows.push(
                                                <tr key={`summary-${currentPhaseIndex}`} className="border-b-2 bg-muted/50 font-bold">
                                                    {hasPhases && <td className="p-2 sticky left-0 bg-inherit z-10 text-xs"></td>}
                                                    <td className="p-2 text-xs" style={hasPhases ? { position: "sticky", left: "80px", zIndex: 9 } : { position: "sticky", left: "0", zIndex: 10 }}>Phase Total</td>
                                                    {/* Skip individual revenue/cost columns in summary */}
                                                    {!revenueCollapsed && data.revenueStreams && data.revenueStreams.map(() => (
                                                        <td key={Math.random()} className="border-l"></td>
                                                    ))}
                                                    {revenueCollapsed && (data.revenueStreams?.length ?? 0) > 0 && <td className="border-l"></td>}
                                                    {!costsCollapsed && computedTasks.map(() => (
                                                        <td key={Math.random()} className="border-l"></td>
                                                    ))}
                                                    {!costsCollapsed && (data.costModel?.fixedMonthlyCosts ?? []).map(() => (
                                                        <td key={Math.random()} className="border-l"></td>
                                                    ))}
                                                    {costsCollapsed && (computedTasks.length + (data.costModel?.fixedMonthlyCosts?.length ?? 0)) > 0 && <td className="border-l"></td>}
                                                    {!totalsCollapsed && (
                                                        <>
                                                            {!revenueCollapsed && (
                                                                <td className="text-right p-2 border-l text-xs">
                                                                    {fmtCurrency(phaseRevenue, currency)}
                                                                </td>
                                                            )}
                                                            {!costsCollapsed && (
                                                                <td className="text-right p-2 border-l text-xs">
                                                                    {fmtCurrency(phaseCosts, currency)}
                                                                </td>
                                                            )}
                                                            <td className="text-right p-2 border-l text-xs">
                                                                {fmtCurrency(phaseProfit, currency)}
                                                            </td>
                                                            <td className="text-right p-2 border-l text-xs"></td>
                                                            <td className="text-right p-2 border-l text-xs"></td>
                                                        </>
                                                    )}
                                                    {totalsCollapsed && <td className="border-l"></td>}
                                                </tr>
                                            );
                                        }

                                        // Reset phase accumulation
                                        currentPhaseIndex = phaseIndex;
                                        phaseStartIdx = idx;
                                        phaseRevenue = 0;
                                        phaseCosts = 0;
                                        phaseProfit = 0;
                                    }

                                    // Accumulate phase totals
                                    phaseRevenue += row.revenue;
                                    phaseCosts += row.costs;
                                    phaseProfit += row.profit;

                                    // Render the main row
                                    rows.push(
                                        <React.Fragment key={idx}>
                                            {/* Main row with margin values */}
                                            <tr
                                                className={`border-b ${
                                                    isCurrentMonth ? "bg-muted/60 font-medium" : "hover:bg-muted/30"
                                                } transition-colors`}
                                            >
                                                {hasPhases && idx === phaseStartIdx && (
                                                    <td
                                                        className="p-2 text-xs font-medium text-center sticky left-0 bg-inherit z-10"
                                                        style={{
                                                            backgroundColor: `${phaseInfo?.phase.color}15`,
                                                            color: phaseInfo?.phase.color,
                                                        }}
                                                        rowSpan={Math.ceil((phaseInfo?.endMonth ?? 0) - (phaseInfo?.startMonth ?? 0))}
                                                    >
                                                        {phaseInfo?.phase.name}
                                                    </td>
                                                )}
                                                <td className="p-2 bg-inherit z-10 text-xs" style={hasPhases ? { position: "sticky", left: "80px", zIndex: 9 } : { position: "sticky", left: "0", zIndex: 10 }}>{row.label}</td>
                                            {!revenueCollapsed && data.revenueStreams &&
                                                data.revenueStreams.map((stream) => {
                                                    const streamColor = streamColors.get(stream.id) || "#4f46e5";
                                                    const cellKey = `stream:${stream.id}:${idx}`;
                                                    const isExpanded = expandedCells.has(cellKey);

                                                    // Use centralized logic
                                                    const streamMultiplier = multipliers.revenueStreams[stream.id] ?? 1;
                                                    const units = streamUnitsAtMonth(stream, idx, data.timeline, streamDistributions);
                                                    const priceMode = getDistributionMode(stream.unitEconomics.pricePerUnit, streamDistributions);
                                                    const streamRev = streamRevenueAtMonth(stream, idx, data.timeline, streamMultiplier, streamDistributions);
                                                    const costs = streamAcquisitionCostsAtMonth(stream, idx, data.timeline, streamMultiplier, streamDistributions);
                                                    const margin = streamRev - costs.total;

                                                    const unitsLastMonth = idx > 0 ? streamUnitsAtMonth(stream, idx - 1, data.timeline, streamDistributions) : 0;
                                                    const newUnits = Math.max(0, units - unitsLastMonth);

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
                                                                                <span>{fmtCurrency(costs.cac, currency)}</span>
                                                                            </div>
                                                                            <div className="flex justify-between gap-4">
                                                                                <span className="text-muted-foreground">Onboarding:</span>
                                                                                <span>{fmtCurrency(costs.onboarding, currency)}</span>
                                                                            </div>
                                                                            <div className="flex justify-between gap-4 font-medium border-t pt-0.5">
                                                                                <span>Total:</span>
                                                                                <span>{fmtCurrency(costs.total, currency)}</span>
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
                                            {revenueCollapsed && data.revenueStreams && data.revenueStreams.length > 0 && (
                                                <td
                                                    className="text-center p-2 border-l font-medium"
                                                    style={{
                                                        backgroundColor: "hsl(142, 70%, 95%)",
                                                        borderLeftColor: "hsl(142, 70%, 60%)",
                                                        borderLeftWidth: "3px",
                                                    }}
                                                >
                                                    <div className="text-xs whitespace-nowrap">
                                                        {fmtCurrency(
                                                            data.revenueStreams.reduce((sum, stream) => {
                                                                const streamMultiplier = multipliers.revenueStreams[stream.id] ?? 1;
                                                                const streamRev = streamRevenueAtMonth(stream, idx, data.timeline, streamMultiplier, streamDistributions);
                                                                const costs = streamAcquisitionCostsAtMonth(stream, idx, data.timeline, streamMultiplier, streamDistributions);
                                                                return sum + (streamRev - costs.total);
                                                            }, 0),
                                                            currency
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                            {!costsCollapsed && computedTasks.map((task) => {
                                                const cellKey = `task:${task.id}:${idx}`;
                                                const isExpanded = expandedCells.has(cellKey);
                                                const taskMultiplier = multipliers.tasks[task.id] ?? 1;
                                                const { oneOff, monthly, total } = taskCostAtMonth(task, idx, start, taskMultiplier);
                                                const taskColor = taskColors.get(task.id) || "#3b82f6";

                                                return (
                                                    <td
                                                        key={task.id}
                                                        className="text-center p-0 border-l cursor-pointer"
                                                        style={{
                                                            backgroundColor: `${taskColor}15`,
                                                            borderLeftColor: `${taskColor}55`,
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
                                            {!costsCollapsed && (data.costModel?.fixedMonthlyCosts ?? []).map((fixedCost) => {
                                                const cellKey = `fixed:${fixedCost.id}:${idx}`;
                                                const isExpanded = expandedCells.has(cellKey);
                                                const fixedCostData = fixedCostsAtMonth(
                                                    [fixedCost],
                                                    idx,
                                                    computedTasks,
                                                    start,
                                                    multipliers.fixedCosts,
                                                    distributionSelection
                                                );
                                                const isActive = fixedCostData.costs.length > 0;
                                                const costValue = isActive ? fixedCostData.total : 0;

                                                return (
                                                    <td
                                                        key={fixedCost.id}
                                                        className="text-center p-0 border-l cursor-pointer"
                                                        style={{
                                                            backgroundColor: "hsl(280, 50%, 97%)",
                                                            borderLeftColor: "hsl(280, 50%, 85%)",
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
                                                        {isExpanded && isActive ? (
                                                            <div className="p-2">
                                                                <div className="space-y-1 text-[10px]">
                                                                    <div className="font-semibold text-muted-foreground mb-1">
                                                                        Fixed Cost:
                                                                    </div>
                                                                    <div className="pl-2 space-y-0.5">
                                                                        <div className="flex justify-between gap-4">
                                                                            <span className="text-muted-foreground">Monthly:</span>
                                                                            <span>{fmtCurrency(costValue, currency)}</span>
                                                                        </div>
                                                                        {fixedCost.startEventId && (
                                                                            <div className="text-xs text-muted-foreground mt-1">
                                                                                Starts: {computedTasks.find((t) => t.id === fixedCost.startEventId)?.computedStart}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="p-2 text-xs font-medium">
                                                                {isActive ? fmtCurrency(costValue, currency) : "—"}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            {costsCollapsed && (computedTasks.length + (data.costModel?.fixedMonthlyCosts?.length ?? 0)) > 0 && (
                                                <td
                                                    className="text-center p-2 border-l font-medium"
                                                    style={{
                                                        backgroundColor: "hsl(0, 70%, 95%)",
                                                        borderLeftColor: "hsl(0, 70%, 60%)",
                                                        borderLeftWidth: "3px",
                                                    }}
                                                >
                                                    <div className="text-xs whitespace-nowrap">
                                                        {fmtCurrency(row.costs, currency)}
                                                    </div>
                                                </td>
                                            )}
                                            {!totalsCollapsed && (
                                                <>
                                                    {!revenueCollapsed && (
                                                        <td
                                                            className="text-right p-2 border-l font-medium"
                                                            style={{
                                                                backgroundColor: "hsl(142, 70%, 97%)",
                                                            }}
                                                        >
                                                            <div className="text-xs">
                                                                {fmtCurrency(row.revenue, currency)}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {!costsCollapsed && (
                                                        <td
                                                className="text-right p-0 border-l cursor-pointer font-medium"
                                                style={{
                                                    backgroundColor: "hsl(0, 0%, 98%)",
                                                }}
                                                onClick={() => {
                                                    const cellKey = `total-costs:${idx}`;
                                                    const newSet = new Set(expandedCells);
                                                    if (expandedCells.has(cellKey)) {
                                                        newSet.delete(cellKey);
                                                    } else {
                                                        newSet.add(cellKey);
                                                    }
                                                    setExpandedCells(newSet);
                                                }}
                                            >
                                                {(() => {
                                                    const cellKey = `total-costs:${idx}`;
                                                    const isExpanded = expandedCells.has(cellKey);
                                                    const formula = calculateTotalCosts(data, idx, computedTasks, multipliers.tasks, multipliers.fixedCosts, streamDistributions);

                                                    if (isExpanded) {
                                                        return (
                                                            <div className="p-2">
                                                                <div className="space-y-1 text-[10px]">
                                                                    <div className="font-semibold text-muted-foreground mb-1">
                                                                        Cost Breakdown:
                                                                    </div>
                                                                    {formula.components.map((comp, i) => (
                                                                        <div key={i} className="space-y-0.5">
                                                                            <div className="flex justify-between gap-4 font-medium">
                                                                                <span>{comp.label}:</span>
                                                                                <span>{fmtCurrency(comp.value, currency)}</span>
                                                                            </div>
                                                                            {comp.subComponents && (
                                                                                <div className="pl-3 space-y-0.5 text-muted-foreground">
                                                                                    {comp.subComponents.map((sub, j) => (
                                                                                        <div key={j} className="flex justify-between gap-4">
                                                                                            <span className="text-[9px]">• {sub.label}:</span>
                                                                                            <span className="text-[9px]">{fmtCurrency(sub.value, currency)}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                    <div className="border-t mt-1 pt-1">
                                                                        <div className="flex justify-between gap-4 font-semibold">
                                                                            <span>Total:</span>
                                                                            <span>{fmtCurrency(formula.total, currency)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    } else {
                                                        return (
                                                            <div className="p-2 text-xs">
                                                                {fmtCurrency(row.costs, currency)}
                                                            </div>
                                                        );
                                                    }
                                                })()}
                                            </td>
                                                    )}
                                            <td
                                                className="text-right p-0 border-l cursor-pointer font-medium"
                                                style={{
                                                    backgroundColor: "hsl(0, 0%, 98%)",
                                                }}
                                                onClick={() => {
                                                    const cellKey = `total-margin:${idx}`;
                                                    const newSet = new Set(expandedCells);
                                                    if (expandedCells.has(cellKey)) {
                                                        newSet.delete(cellKey);
                                                    } else {
                                                        newSet.add(cellKey);
                                                    }
                                                    setExpandedCells(newSet);
                                                }}
                                            >
                                                {(() => {
                                                    const cellKey = `total-margin:${idx}`;
                                                    const isExpanded = expandedCells.has(cellKey);
                                                    const formula = calculateTotalMargin(data, idx, computedTasks, row.revenue, multipliers.tasks, multipliers.fixedCosts, streamDistributions);

                                                    if (isExpanded) {
                                                        return (
                                                            <div className="p-2">
                                                                <div className="space-y-1 text-[10px]">
                                                                    <div className="font-semibold text-muted-foreground mb-1">
                                                                        Margin Breakdown:
                                                                    </div>
                                                                    {formula.components.map((comp, i) => (
                                                                        <div key={i} className="space-y-0.5">
                                                                            <div className="flex justify-between gap-4 font-medium">
                                                                                <span>{comp.label}:</span>
                                                                                <span>{fmtCurrency(comp.value, currency)}</span>
                                                                            </div>
                                                                            {comp.subComponents && (
                                                                                <div className="pl-3 space-y-0.5 text-muted-foreground">
                                                                                    {comp.subComponents.map((sub, j) => (
                                                                                        <div key={j} className="flex justify-between gap-4">
                                                                                            <span className="text-[9px]">• {sub.label}:</span>
                                                                                            <span className="text-[9px]">{fmtCurrency(sub.value, currency)}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                    <div className="border-t mt-1 pt-1">
                                                                        <div className="flex justify-between gap-4 font-semibold">
                                                                            <span>Total:</span>
                                                                            <span>{fmtCurrency(formula.total, currency)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    } else {
                                                        return (
                                                            <div className="p-2 text-xs whitespace-nowrap">
                                                                {fmtCurrency(row.profit, currency)}
                                                            </div>
                                                        );
                                                    }
                                                })()}
                                            </td>
                                            <td
                                                className="text-right p-2 border-l font-medium"
                                                style={{
                                                    backgroundColor: "hsl(142, 70%, 97%)",
                                                }}
                                            >
                                                <div className="text-xs whitespace-nowrap">
                                                    {fmtCurrency(cumulativeProfits[idx], currency)}
                                                </div>
                                            </td>
                                            <td
                                                className="text-right p-2 border-l font-medium"
                                                style={{
                                                    backgroundColor: "hsl(220, 70%, 97%)",
                                                }}
                                            >
                                                <div className="text-xs whitespace-nowrap">
                                                    {fmtCurrency(data.meta.initialReserve + cumulativeProfits[idx], currency)}
                                                </div>
                                            </td>
                                                </>
                                            )}
                                            {totalsCollapsed && (
                                                <td
                                                    className="text-right p-2 border-l font-medium"
                                                    style={{
                                                        backgroundColor: "hsl(220, 70%, 97%)",
                                                        borderLeftColor: "hsl(220, 70%, 60%)",
                                                        borderLeftWidth: "3px",
                                                    }}
                                                >
                                                    <div className="text-xs whitespace-nowrap">
                                                        {fmtCurrency(data.meta.initialReserve + cumulativeProfits[idx], currency)}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    </React.Fragment>
                                );

                                    // Add summary row for last phase if this is the last row
                                    if (idx === series.length - 1 && hasPhases && currentPhaseIndex >= 0) {
                                        rows.push(
                                            <tr key={`summary-${currentPhaseIndex}`} className="border-b-2 bg-muted/50 font-bold">
                                                {hasPhases && <td className="p-2 sticky left-0 bg-inherit z-10 text-xs"></td>}
                                                <td className="p-2 text-xs" style={hasPhases ? { position: "sticky", left: "80px", zIndex: 9 } : { position: "sticky", left: "0", zIndex: 10 }}>Phase Total</td>
                                                {/* Skip individual revenue/cost columns in summary */}
                                                {!revenueCollapsed && data.revenueStreams && data.revenueStreams.map(() => (
                                                    <td key={Math.random()} className="border-l"></td>
                                                ))}
                                                {revenueCollapsed && (data.revenueStreams?.length ?? 0) > 0 && <td className="border-l"></td>}
                                                {!costsCollapsed && computedTasks.map(() => (
                                                    <td key={Math.random()} className="border-l"></td>
                                                ))}
                                                {!costsCollapsed && (data.costModel?.fixedMonthlyCosts ?? []).map(() => (
                                                    <td key={Math.random()} className="border-l"></td>
                                                ))}
                                                {costsCollapsed && (computedTasks.length + (data.costModel?.fixedMonthlyCosts?.length ?? 0)) > 0 && <td className="border-l"></td>}
                                                {!totalsCollapsed && (
                                                    <>
                                                        {!revenueCollapsed && (
                                                            <td className="text-right p-2 border-l text-xs">
                                                                {fmtCurrency(phaseRevenue, currency)}
                                                            </td>
                                                        )}
                                                        {!costsCollapsed && (
                                                            <td className="text-right p-2 border-l text-xs">
                                                                {fmtCurrency(phaseCosts, currency)}
                                                            </td>
                                                        )}
                                                        <td className="text-right p-2 border-l text-xs">
                                                            {fmtCurrency(phaseProfit, currency)}
                                                        </td>
                                                        <td className="text-right p-2 border-l text-xs"></td>
                                                        <td className="text-right p-2 border-l text-xs"></td>
                                                    </>
                                                )}
                                                {totalsCollapsed && <td className="border-l"></td>}
                                            </tr>
                                        );
                                    }
                                });

                                return rows;
                            })()}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
