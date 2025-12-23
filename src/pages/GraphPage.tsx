import { useMemo, useState, useEffect } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { VentureData } from "../types";
import { computeTaskDates } from "../utils/modelEngine";
import { streamRevenueAtMonth, streamAcquisitionCostsAtMonth, taskCostAtMonth, fixedCostsAtMonth } from "../utils/logic";
import { fmtCurrency, fmtCompact } from "../utils/formatUtils";
import { addMonths } from "../utils/dateUtils";
import { useRisk } from "../contexts/RiskContext";

type GraphPageProps = {
    data: VentureData;
    month: number;
};

export function GraphPage({ data }: GraphPageProps) {
    const { multipliers, streamDistributions, distributionSelection } = useRisk();
    const currency = data.meta.currency;
    const start = data.meta.start;
    const horizonMonths = data.meta.horizonMonths;

    // UI state
    const [isLogarithmic, setIsLogarithmic] = useState(false);
    const [showBalance, setShowBalance] = useState(true);
    const [showFilters, setShowFilters] = useState(false);

    // Visibility state for revenue streams
    const [visibleStreams, setVisibleStreams] = useState<Set<string>>(() => {
        const allStreamIds = new Set(data.revenueStreams?.map(s => s.id) || []);
        return allStreamIds;
    });

    // Visibility state for costs (tasks + fixed costs)
    const [visibleCosts, setVisibleCosts] = useState<Set<string>>(() => {
        const allCostIds = new Set([
            ...data.tasks.map(t => `cost_${t.id}`),
            ...(data.costModel?.fixedMonthlyCosts?.map(fc => `fixed_${fc.id}`) || [])
        ]);
        return allCostIds;
    });

    // Update visibility sets when data changes
    useEffect(() => {
        setVisibleStreams(prev => {
            const allStreamIds = new Set(data.revenueStreams?.map(s => s.id) || []);
            // Keep only existing streams that were previously visible
            const updated = new Set([...allStreamIds].filter(id => prev.has(id) || prev.size === 0));
            return updated.size > 0 ? updated : allStreamIds;
        });

        setVisibleCosts(prev => {
            const allCostIds = new Set([
                ...data.tasks.map(t => `cost_${t.id}`),
                ...(data.costModel?.fixedMonthlyCosts?.map(fc => `fixed_${fc.id}`) || [])
            ]);
            const updated = new Set([...allCostIds].filter(id => prev.has(id) || prev.size === 0));
            return updated.size > 0 ? updated : allCostIds;
        });
    }, [data]);

    // Load stream colors from localStorage
    const [streamColors, setStreamColors] = useState<Map<string, string>>(() => {
        const stored = localStorage.getItem("streamColors");
        if (stored) {
            try {
                const obj = JSON.parse(stored);
                return new Map(Object.entries(obj));
            } catch {
                return new Map();
            }
        }
        return new Map();
    });

    // Load task colors from localStorage
    const [taskColors, setTaskColors] = useState<Map<string, string>>(() => {
        const stored = localStorage.getItem("taskColors");
        if (stored) {
            try {
                const obj = JSON.parse(stored);
                return new Map(Object.entries(obj));
            } catch {
                return new Map();
            }
        }
        return new Map();
    });

    // Listen for color changes from other components
    useEffect(() => {
        const handleStreamColorChange = () => {
            const stored = localStorage.getItem("streamColors");
            if (stored) {
                try {
                    const obj = JSON.parse(stored);
                    setStreamColors(new Map(Object.entries(obj)));
                } catch {
                    // ignore
                }
            }
        };
        const handleTaskColorChange = () => {
            const stored = localStorage.getItem("taskColors");
            if (stored) {
                try {
                    const obj = JSON.parse(stored);
                    setTaskColors(new Map(Object.entries(obj)));
                } catch {
                    // ignore
                }
            }
        };
        window.addEventListener("streamColorsChanged", handleStreamColorChange);
        window.addEventListener("taskColorsChanged", handleTaskColorChange);
        return () => {
            window.removeEventListener("streamColorsChanged", handleStreamColorChange);
            window.removeEventListener("taskColorsChanged", handleTaskColorChange);
        };
    }, []);

    const computedTasks = useMemo(() => computeTaskDates(data.tasks, start), [data.tasks, start]);

    // Build chart data
    const chartData = useMemo(() => {
        const months = Array.from({ length: horizonMonths }, (_, i) => i);
        let cumulativeProfit = 0;

        return months.map((m) => {
            const monthLabel = addMonths(start, m).slice(0, 7); // YYYY-MM format
            const row: any = { month: monthLabel, monthIndex: m };

            // Add each revenue stream's net revenue
            let totalNetRevenue = 0;
            if (data.revenueStreams) {
                for (const stream of data.revenueStreams) {
                    const streamMultiplier = multipliers.revenueStreams[stream.id] ?? 1;
                    const grossRevenue = streamRevenueAtMonth(stream, m, data.timeline, streamMultiplier, streamDistributions);
                    const acquisitionCosts = streamAcquisitionCostsAtMonth(stream, m, data.timeline, streamMultiplier, streamDistributions);
                    const netRevenue = grossRevenue - acquisitionCosts.total;
                    row[stream.id] = netRevenue;
                    totalNetRevenue += netRevenue;
                }
            }

            // Add each task cost (as negative values for visual separation)
            let totalCosts = 0;
            for (const task of computedTasks) {
                const taskMultiplier = multipliers.tasks[task.id] ?? 1;
                const costData = taskCostAtMonth(task, m, start, taskMultiplier);
                row[`cost_${task.id}`] = -costData.total; // Negative for costs
                totalCosts += costData.total;
            }

            // Add fixed costs
            if (data.costModel?.fixedMonthlyCosts) {
                for (const fixedCost of data.costModel.fixedMonthlyCosts) {
                    const fixedCostData = fixedCostsAtMonth([fixedCost], m, computedTasks, start, multipliers.fixedCosts, distributionSelection);
                    row[`fixed_${fixedCost.id}`] = -fixedCostData.total;
                    totalCosts += fixedCostData.total;
                }
            }

            // Add margin (net profit)
            row.margin = totalNetRevenue - totalCosts;

            // Add cumulative balance
            cumulativeProfit += row.margin;
            row.balance = data.meta.initialReserve + cumulativeProfit;

            return row;
        });
    }, [data, horizonMonths, start, computedTasks, multipliers, streamDistributions]);

    // Toggle helpers
    const toggleStream = (streamId: string) => {
        setVisibleStreams(prev => {
            const updated = new Set(prev);
            if (updated.has(streamId)) {
                updated.delete(streamId);
            } else {
                updated.add(streamId);
            }
            return updated;
        });
    };

    const toggleCost = (costId: string) => {
        setVisibleCosts(prev => {
            const updated = new Set(prev);
            if (updated.has(costId)) {
                updated.delete(costId);
            } else {
                updated.add(costId);
            }
            return updated;
        });
    };

    const toggleAllStreams = () => {
        if (visibleStreams.size === data.revenueStreams?.length) {
            setVisibleStreams(new Set());
        } else {
            setVisibleStreams(new Set(data.revenueStreams?.map(s => s.id) || []));
        }
    };

    const toggleAllCosts = () => {
        const allCostIds = [
            ...data.tasks.map(t => `cost_${t.id}`),
            ...(data.costModel?.fixedMonthlyCosts?.map(fc => `fixed_${fc.id}`) || [])
        ];
        if (visibleCosts.size === allCostIds.length) {
            setVisibleCosts(new Set());
        } else {
            setVisibleCosts(new Set(allCostIds));
        }
    };

    return (
        <div className="grid gap-4">
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Revenue vs Costs</CardTitle>
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="logarithmic"
                                    checked={isLogarithmic}
                                    onCheckedChange={setIsLogarithmic}
                                />
                                <Label htmlFor="logarithmic" className="text-sm cursor-pointer">
                                    Logarithmic
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="show-balance"
                                    checked={showBalance}
                                    onCheckedChange={setShowBalance}
                                />
                                <Label htmlFor="show-balance" className="text-sm cursor-pointer">
                                    Show Balance
                                </Label>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowFilters(!showFilters)}
                                className="rounded-xl"
                            >
                                {showFilters ? "Hide Filters" : "Show Filters"}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                {showFilters && (
                    <CardContent className="border-t pt-4">
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Revenue Streams */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <Label className="text-sm font-medium">Revenue Streams</Label>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={toggleAllStreams}
                                        className="h-7 text-xs"
                                    >
                                        {visibleStreams.size === data.revenueStreams?.length ? "Deselect All" : "Select All"}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {data.revenueStreams?.map((stream) => (
                                        <div key={stream.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`stream-${stream.id}`}
                                                checked={visibleStreams.has(stream.id)}
                                                onCheckedChange={() => toggleStream(stream.id)}
                                            />
                                            <label
                                                htmlFor={`stream-${stream.id}`}
                                                className="text-sm cursor-pointer flex items-center gap-2"
                                            >
                                                <div
                                                    className="w-3 h-3 rounded"
                                                    style={{ backgroundColor: streamColors.get(stream.id) || "#4f46e5" }}
                                                />
                                                {stream.name}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Costs */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <Label className="text-sm font-medium">Costs</Label>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={toggleAllCosts}
                                        className="h-7 text-xs"
                                    >
                                        {visibleCosts.size === (data.tasks.length + (data.costModel?.fixedMonthlyCosts?.length || 0)) ? "Deselect All" : "Select All"}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {computedTasks.map((task, idx) => {
                                        const costId = `cost_${task.id}`;
                                        const color = `hsl(0, 70%, ${45 + (idx % 3) * 10}%)`;
                                        return (
                                            <div key={task.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={costId}
                                                    checked={visibleCosts.has(costId)}
                                                    onCheckedChange={() => toggleCost(costId)}
                                                />
                                                <label
                                                    htmlFor={costId}
                                                    className="text-sm cursor-pointer flex items-center gap-2"
                                                >
                                                    <div
                                                        className="w-3 h-3 rounded"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                    {task.name}
                                                </label>
                                            </div>
                                        );
                                    })}
                                    {data.costModel?.fixedMonthlyCosts?.map((fixedCost, idx) => {
                                        const costId = `fixed_${fixedCost.id}`;
                                        const color = `hsl(280, 50%, ${45 + (idx % 3) * 10}%)`;
                                        return (
                                            <div key={fixedCost.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={costId}
                                                    checked={visibleCosts.has(costId)}
                                                    onCheckedChange={() => toggleCost(costId)}
                                                />
                                                <label
                                                    htmlFor={costId}
                                                    className="text-sm cursor-pointer flex items-center gap-2"
                                                >
                                                    <div
                                                        className="w-3 h-3 rounded"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                    {fixedCost.name} (Fixed)
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                )}
                <CardContent className="h-[600px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ left: 12, right: 12, top: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="month"
                                tick={{ fontSize: 11 }}
                                interval={Math.max(1, Math.floor(horizonMonths / 12))}
                            />
                            <YAxis
                                scale={isLogarithmic ? "log" : "auto"}
                                domain={isLogarithmic ? [1, 'auto'] : ['auto', 'auto']}
                                allowDataOverflow={false}
                                tick={{ fontSize: 11 }}
                                tickFormatter={(value) => {
                                    const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency;
                                    return `${symbol}${fmtCompact(value)}`;
                                }}
                            />
                            <Tooltip
                                formatter={(value: any) => fmtCurrency(value, currency)}
                                labelFormatter={(label) => `Month: ${label}`}
                            />
                            <Legend />

                            {/* Revenue streams - stacked */}
                            {data.revenueStreams?.map((stream) => {
                                if (!visibleStreams.has(stream.id)) return null;
                                const color = streamColors.get(stream.id) || "#4f46e5";
                                return (
                                    <Area
                                        key={stream.id}
                                        type="monotone"
                                        dataKey={stream.id}
                                        name={stream.name}
                                        stackId="revenue"
                                        stroke={color}
                                        fill={color}
                                        fillOpacity={0.6}
                                    />
                                );
                            })}

                            {/* Costs - stacked */}
                            {computedTasks.map((task) => {
                                const costId = `cost_${task.id}`;
                                if (!visibleCosts.has(costId)) return null;
                                const color = taskColors.get(task.id) || "#3b82f6";
                                return (
                                    <Area
                                        key={task.id}
                                        type="monotone"
                                        dataKey={costId}
                                        name={`${task.name} (Cost)`}
                                        stackId="costs"
                                        stroke={color}
                                        fill={color}
                                        fillOpacity={0.6}
                                    />
                                );
                            })}

                            {/* Fixed costs - stacked with other costs */}
                            {data.costModel?.fixedMonthlyCosts?.map((fixedCost, idx) => {
                                const costId = `fixed_${fixedCost.id}`;
                                if (!visibleCosts.has(costId)) return null;
                                const color = `hsl(280, 50%, ${45 + (idx % 3) * 10}%)`;
                                return (
                                    <Area
                                        key={fixedCost.id}
                                        type="monotone"
                                        dataKey={costId}
                                        name={`${fixedCost.name} (Fixed)`}
                                        stackId="costs"
                                        stroke={color}
                                        fill={color}
                                        fillOpacity={0.6}
                                    />
                                );
                            })}

                            {/* Net profit line - bold */}
                            <Line
                                type="monotone"
                                dataKey="margin"
                                name="Margin (Net Profit)"
                                stroke="#000000"
                                strokeWidth={3}
                                dot={false}
                            />

                            {/* Cumulative balance line - bold red (conditional) */}
                            {showBalance && (
                                <Line
                                    type="monotone"
                                    dataKey="balance"
                                    name="Balance (Cumulative)"
                                    stroke="#dc2626"
                                    strokeWidth={3}
                                    dot={false}
                                />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
