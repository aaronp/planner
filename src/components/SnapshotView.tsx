import { useMemo } from "react";
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
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VentureData } from "../types";
import { computeSeries } from "../utils/modelEngine";
import { fmtCurrency, fmtCompact, round2 } from "../utils/formatUtils";
import { SankeyCard } from "./SankeyCard";

export function SnapshotView({ data, month }: { data: VentureData; month: number }) {
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
        <div className="grid gap-4">
            <div className="grid md:grid-cols-3 gap-4">
                {kpis.map((k) => (
                    <Card key={k.label} className="rounded-2xl shadow-sm">
                        <CardContent className="p-4">
                            <div className="text-xs text-muted-foreground">{k.label}</div>
                            <div className="text-xl font-semibold mt-1">{k.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Revenue vs Costs</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={series} margin={{ left: 12, right: 12, top: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.max(1, Math.floor(series.length / 12))} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Legend />
                                <Area type="monotone" dataKey="revenue" name="Revenue" fillOpacity={0.25} />
                                <Area type="monotone" dataKey="costs" name="Costs" fillOpacity={0.18} />
                                <Line type="monotone" dataKey="profit" name="EBITDA" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Revenue by Segment (snapshot)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Tooltip />
                                <Legend />
                                <Pie data={pie} dataKey="value" nameKey="name" outerRadius={110} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <SankeyCard data={data} month={month} />

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">Cash Over Time</CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={series} margin={{ left: 12, right: 12, top: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.max(1, Math.floor(series.length / 12))} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="cash" name="Cash (cum.)" dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
