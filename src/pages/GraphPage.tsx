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
    const { multipliers, distributionSelection } = useRisk();
    const currency = data.meta.currency;
    const start = data.meta.start;
    const horizonMonths = data.meta.horizonMonths;

    // UI state
    const [isLogarithmic, setIsLogarithmic] = useState(false);
    const [showBalance, setShowBalance] = useState(true);

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

    // Listen for color changes from other components
    useEffect(() => {
        const handleColorChange = () => {
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
        window.addEventListener("streamColorsChanged", handleColorChange);
        return () => window.removeEventListener("streamColorsChanged", handleColorChange);
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
                    const grossRevenue = streamRevenueAtMonth(stream, m, data.timeline, streamMultiplier, distributionSelection);
                    const acquisitionCosts = streamAcquisitionCostsAtMonth(stream, m, data.timeline, streamMultiplier, distributionSelection);
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
    }, [data, horizonMonths, start, computedTasks, multipliers, distributionSelection]);

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
                        </div>
                    </div>
                </CardHeader>
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
                            {computedTasks.map((task, idx) => {
                                const color = `hsl(0, 70%, ${45 + (idx % 3) * 10}%)`;
                                return (
                                    <Area
                                        key={task.id}
                                        type="monotone"
                                        dataKey={`cost_${task.id}`}
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
                                const color = `hsl(280, 50%, ${45 + (idx % 3) * 10}%)`;
                                return (
                                    <Area
                                        key={fixedCost.id}
                                        type="monotone"
                                        dataKey={`fixed_${fixedCost.id}`}
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
