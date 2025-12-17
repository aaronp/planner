import { useState, useEffect, useMemo } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import type { VentureData, Task, Segment, Opex, Market, RevenueStream, TimelineEvent, Assumption, Risk, FixedCost } from "./types";
import { loadData, saveData, DEFAULT } from "./utils/storage";
import { fmtCurrency } from "./utils/formatUtils";
import { computeSeries } from "./utils/modelEngine";
import { formatMonthLabel } from "./utils/dateUtils";

import { ImportExport } from "./components/ImportExport";

// Route Pages
import { TimelinePage } from "./pages/TimelinePage";
import { SummaryPage } from "./pages/SummaryPage";
import { GraphPage } from "./pages/GraphPage";
import { DataPage } from "./pages/DataPage";
import { RevenueStreamDetailPage } from "./pages/RevenueStreamDetailPage";

/**
 * Venture Proposal Planner (Local-first)
 *
 * - Timeline view: tasks + market segments with TAM/SAM/SOM stacked bars
 * - Time slider drives snapshot and summary
 * - Tabular editing, localStorage persistence, JSON import/export
 */

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
    const location = useLocation();
    const isActive = location.pathname === to || location.pathname.startsWith(to + "/");

    return (
        <Link
            to={to}
            className={`px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${
                isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
        >
            {children}
        </Link>
    );
}

export default function App() {
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

    // New data setters for spec-compliant model
    const setMarkets = (markets: Market[]) => setData({ ...data, markets });
    const setRevenueStreams = (revenueStreams: RevenueStream[]) => setData({ ...data, revenueStreams });
    const setTimeline = (timeline: TimelineEvent[]) => setData({ ...data, timeline });
    const setAssumptions = (assumptions: Assumption[]) => setData({ ...data, assumptions });
    const setRisks = (risks: Risk[]) => setData({ ...data, risks });
    const setFixedCosts = (fixedMonthlyCosts: FixedCost[]) =>
        setData({ ...data, costModel: { ...data.costModel, fixedMonthlyCosts } });

    return (
        <BrowserRouter basename="/planner">
            <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Venture Proposal Planner</h1>
                        <p className="text-sm text-muted-foreground">Local-first venture modelling: tasks + market segments + snapshot financials.</p>
                    </div>
                    <ImportExport data={data} setData={setData} />
                </div>

                <div className="mt-4 grid gap-4">
                    <Card className="rounded-2xl shadow-sm">
                        <CardContent className="p-4">
                            <div className="grid md:grid-cols-4 gap-4">
                                <div>
                                    <Label>Venture name</Label>
                                    <Input
                                        className="rounded-2xl mt-1"
                                        value={data.meta.name}
                                        onChange={(e) => setData({ ...data, meta: { ...data.meta, name: e.target.value } })}
                                    />
                                </div>
                                <div>
                                    <Label>Currency</Label>
                                    <Select
                                        value={data.meta.currency}
                                        onValueChange={(v) => setData({ ...data, meta: { ...data.meta, currency: v } })}
                                    >
                                        <SelectTrigger className="rounded-2xl mt-1">
                                            <SelectValue placeholder="Currency" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="GBP">GBP</SelectItem>
                                            <SelectItem value="USD">USD</SelectItem>
                                            <SelectItem value="EUR">EUR</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Start date</Label>
                                    <Input
                                        type="date"
                                        className="rounded-2xl mt-1"
                                        value={data.meta.start}
                                        onChange={(e) => setData({ ...data, meta: { ...data.meta, start: e.target.value } })}
                                    />
                                </div>
                                <div>
                                    <Label>Horizon (months)</Label>
                                    <Input
                                        type="number"
                                        className="rounded-2xl mt-1"
                                        value={data.meta.horizonMonths}
                                        onChange={(e) =>
                                            setData({
                                                ...data,
                                                meta: { ...data.meta, horizonMonths: Math.max(1, Number(e.target.value || 1)) },
                                            })
                                        }
                                    />
                                </div>
                            </div>

                            <Separator className="my-4" />

                            <div className="flex flex-wrap gap-3 items-center">
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Snapshot:</span>{" "}
                                    <span className="font-medium">{formatMonthLabel(data.meta.start, month)}</span>
                                </div>
                                <Badge variant="secondary" className="rounded-xl">
                                    Revenue {fmtCurrency(snap?.revenue ?? 0, currency)}
                                </Badge>
                                <Badge variant="secondary" className="rounded-xl">
                                    Costs {fmtCurrency(snap?.costs ?? 0, currency)}
                                </Badge>
                                <Badge variant="secondary" className="rounded-xl">
                                    Cash {fmtCurrency(snap?.cash ?? 0, currency)}
                                </Badge>
                                <div className="ml-auto w-[320px]">
                                    <Slider
                                        value={[month]}
                                        min={0}
                                        max={Math.max(0, data.meta.horizonMonths - 1)}
                                        step={1}
                                        onValueChange={(v) => setMonth(v[0] ?? 0)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Navigation */}
                    <nav className="flex gap-2 px-4">
                        <NavLink to="/timeline">Timeline</NavLink>
                        <NavLink to="/graph">Graph</NavLink>
                        <NavLink to="/summary">Summary</NavLink>
                        <NavLink to="/data">Data</NavLink>
                    </nav>

                    {/* Routes */}
                    <Routes>
                        <Route path="/" element={<Navigate to="/timeline" replace />} />
                        <Route
                            path="/timeline"
                            element={<TimelinePage data={data} month={month} setMonth={setMonth} />}
                        />
                        <Route path="/graph" element={<GraphPage data={data} month={month} />} />
                        <Route path="/summary" element={<SummaryPage data={data} />} />
                        <Route
                            path="/data"
                            element={
                                <DataPage
                                    data={data}
                                    setRevenueStreams={setRevenueStreams}
                                    setTimeline={setTimeline}
                                    setFixedCosts={setFixedCosts}
                                    setOpex={setOpex}
                                    setTasks={setTasks}
                                    setAssumptions={setAssumptions}
                                    setRisks={setRisks}
                                />
                            }
                        />
                        <Route
                            path="/revenue-stream/:id"
                            element={
                                <RevenueStreamDetailPage
                                    data={data}
                                    setRevenueStreams={setRevenueStreams}
                                    setTimeline={setTimeline}
                                />
                            }
                        />
                    </Routes>
                </div>
            </div>
        </BrowserRouter>
    );
}
