import { useMemo, useState, useEffect } from "react";
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { VentureData } from "../types";
import { computeSeries, firstIndexWhere, aggregateByCalendarYear } from "../utils/modelEngine";
import { formatMonthLabel } from "../utils/dateUtils";
import { fmtCurrency } from "../utils/formatUtils";
import { useRisk } from "../contexts/RiskContext";
import { streamMarginAtMonth } from "../utils/logic";

export function SummaryView({ data, month }: { data: VentureData; month: number }) {
    const { multipliers, streamDistributions } = useRisk();
    const series = useMemo(
        () => computeSeries(data, multipliers.tasks, multipliers.fixedCosts, multipliers.revenueStreams, streamDistributions),
        [data, multipliers, streamDistributions]
    );
    const currency = data.meta.currency;

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

    const profitableMonthIdx = useMemo(() => firstIndexWhere(series, (r) => r.profit > 0), [series]);
    const roiBreakevenIdx = useMemo(() => firstIndexWhere(series, (r) => (r.cumRevenue - r.cumCosts) >= 0), [series]);

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
        if (!data.revenueStreams || data.revenueStreams.length === 0) {
            return [] as { name: string; value: number; color: string }[];
        }

        // Use the current month from the time slider
        const monthIndex = Math.min(series.length - 1, Math.max(0, month));

        return data.revenueStreams.map((stream) => {
            const streamMultiplier = multipliers.revenueStreams[stream.id] ?? 1;
            const netRevenue = streamMarginAtMonth(
                stream,
                monthIndex,
                data.timeline,
                streamMultiplier,
                streamDistributions
            );
            const color = streamColors.get(stream.id) || "#4f46e5";

            return {
                name: stream.name,
                value: Math.max(0, netRevenue),
                color,
            };
        }).filter(item => item.value > 0); // Only show streams with positive revenue
    }, [data.revenueStreams, data.timeline, month, series.length, multipliers, streamDistributions, streamColors]);

    return (
        <div className="grid gap-4">
            <div className="grid lg:grid-cols-3 gap-4">
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Milestones</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div>
                            <div className="text-xs text-muted-foreground">Operational profitability (first month EBITDA &gt; 0)</div>
                            <div className="text-lg font-semibold">
                                {profitableMonthIdx === undefined
                                    ? "Not within horizon"
                                    : `${formatMonthLabel(data.meta.start, profitableMonthIdx)} (m${profitableMonthIdx})`}
                            </div>
                        </div>
                        <Separator />
                        <div>
                            <div className="text-xs text-muted-foreground">ROI / Payback (first month cumulative profit ≥ 0)</div>
                            <div className="text-lg font-semibold">
                                {roiBreakevenIdx === undefined
                                    ? "Not within horizon"
                                    : `${formatMonthLabel(data.meta.start, roiBreakevenIdx)} (m${roiBreakevenIdx})`}
                            </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Cumulative profit = cumulative revenue - cumulative costs. EBITDA ≈ profit (no depreciation/amortization modelled yet).
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">ROI by Venture Year</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {roiByYear.map((r) => (
                            <div key={r.year} className="flex items-center justify-between">
                                <div className="text-sm font-medium">Y{r.year} ROI</div>
                                <div className="text-sm">
                                    <span className="font-semibold">{(r.roi * 100).toFixed(1)}%</span>
                                    <span className="text-muted-foreground">
                                        {" "}
                                        · Cash {fmtCurrency(r.cash, currency)} · Costs {fmtCurrency(r.costs, currency)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">Projected P&L (monthly)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={series} margin={{ left: 12, right: 12, top: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.max(1, Math.floor(series.length / 12))} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="costs" name="Costs" stroke="#ef4444" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="profit" name="EBITDA" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">End-of-year summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-auto rounded-xl border">
                            <table className="w-full text-sm">
                                <thead className="bg-background sticky top-0">
                                    <tr className="border-b">
                                        <th className="p-2 text-left">Year</th>
                                        <th className="p-2 text-right">Revenue</th>
                                        <th className="p-2 text-right">Costs</th>
                                        <th className="p-2 text-right">EBITDA</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {yearAgg.map((y) => (
                                        <tr key={y.year} className="border-b last:border-b-0">
                                            <td className="p-2 font-medium">{y.year}</td>
                                            <td className="p-2 text-right">{fmtCurrency(y.revenue, currency)}</td>
                                            <td className="p-2 text-right">{fmtCurrency(y.costs, currency)}</td>
                                            <td className="p-2 text-right">{fmtCurrency(y.ebitda, currency)}</td>
                                        </tr>
                                    ))}
                                    {yearAgg.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-6 text-center text-muted-foreground">
                                                No data
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Revenue Streams ({formatMonthLabel(data.meta.start, month)})</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Tooltip formatter={(value: any) => fmtCurrency(value, currency)} />
                                <Legend />
                                <Pie data={eoyPie} dataKey="value" nameKey="name" outerRadius={110}>
                                    {eoyPie.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
