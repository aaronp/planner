import { useMemo } from "react";
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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { VentureData } from "../types";
import { computeSeries, firstIndexWhere, aggregateByCalendarYear } from "../utils/modelEngine";
import { formatMonthLabel } from "../utils/dateUtils";
import { fmtCurrency } from "../utils/formatUtils";

export function SummaryView({ data }: { data: VentureData }) {
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
                            <div className="text-xs text-muted-foreground">ROI / Payback (first month cumulative cash &gt; 0)</div>
                            <div className="text-lg font-semibold">
                                {cashBreakevenIdx === undefined
                                    ? "Not within horizon"
                                    : `${formatMonthLabel(data.meta.start, cashBreakevenIdx)} (m${cashBreakevenIdx})`}
                            </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            ROI definition: cumulative cash / cumulative costs-to-date. EBITDA ≈ profit (no depreciation/amortization modelled yet).
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
                                <Line type="monotone" dataKey="revenue" name="Revenue" dot={false} />
                                <Line type="monotone" dataKey="costs" name="Costs" dot={false} />
                                <Line type="monotone" dataKey="profit" name="EBITDA" dot={false} />
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
                        <CardTitle className="text-base">EOY pie (Revenue vs EBITDA)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Tooltip />
                                <Legend />
                                <Pie data={eoyPie} dataKey="value" nameKey="name" outerRadius={110} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
