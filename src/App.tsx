import { useState, useEffect, useMemo } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import type { VentureData, Task, Opex, RevenueStream, TimelineEvent, FixedCost } from "./types";
import { loadData, saveData, DEFAULT } from "./utils/storage";
import { fmtCurrency } from "./utils/formatUtils";
import { computeSeries } from "./utils/modelEngine";
import { formatMonthLabel } from "./utils/dateUtils";

// Route Pages
import { TimelinePage } from "./pages/TimelinePage";
import { SummaryPage } from "./pages/SummaryPage";
import { GraphPage } from "./pages/GraphPage";
import { CostsPage } from "./pages/CostsPage";
import { RevenueStreamsPage } from "./pages/RevenueStreamsPage";
import { RevenueStreamDetailPage } from "./pages/RevenueStreamDetailPage";
import { DataPage } from "./pages/DataPage";

/**
 * Venture Proposal Planner
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
            className={`px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${isActive
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
    const [detailsExpanded, setDetailsExpanded] = useState(false);

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

    const setTasks = (tasks: Task[]) => setData((prev) => ({ ...prev, tasks }));
    const setOpex = (opex: Opex[]) => setData((prev) => ({ ...prev, opex }));

    // New data setters for spec-compliant model
    const setRevenueStreams = (revenueStreams: RevenueStream[]) => setData((prev) => ({ ...prev, revenueStreams }));
    const setTimeline = (timeline: TimelineEvent[]) => setData((prev) => ({ ...prev, timeline }));
    const setFixedCosts = (fixedMonthlyCosts: FixedCost[]) =>
        setData((prev) => ({ ...prev, costModel: { ...prev.costModel, fixedMonthlyCosts } }));

    return (
        <BrowserRouter basename="/planner">
            <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">{data.meta.name} Planner</h1>
                        <p className="text-sm text-muted-foreground">venture modelling: tasks + market segments + snapshot financials.</p>
                    </div>
                </div>

                <div className="mt-4 grid gap-4">
                    <Card className="rounded-2xl shadow-sm">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-sm font-medium">Plan Details</div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDetailsExpanded(!detailsExpanded)}
                                    className="rounded-xl h-7"
                                >
                                    {detailsExpanded ? (
                                        <>
                                            <ChevronUp className="h-4 w-4 mr-1" />
                                            Hide
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="h-4 w-4 mr-1" />
                                            Show
                                        </>
                                    )}
                                </Button>
                            </div>

                            {detailsExpanded && (
                                <>
                                    <div className="grid md:grid-cols-4 gap-4 mb-4">
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
                                </>
                            )}

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
                        <NavLink to="/costs">Costs</NavLink>
                        <NavLink to="/revenue-streams">Revenue Streams</NavLink>
                        <NavLink to="/timeline">Timeline</NavLink>
                        <NavLink to="/graph">Graph</NavLink>
                        <NavLink to="/summary">Summary</NavLink>
                        <NavLink to="/data">Data</NavLink>
                    </nav>

                    {/* Routes */}
                    <Routes>
                        <Route path="/" element={<Navigate to="/costs" replace />} />
                        <Route
                            path="/timeline"
                            element={<TimelinePage data={data} month={month} setMonth={setMonth} />}
                        />
                        <Route path="/graph" element={<GraphPage data={data} month={month} />} />
                        <Route path="/summary" element={<SummaryPage data={data} />} />
                        <Route
                            path="/costs"
                            element={
                                <CostsPage
                                    data={data}
                                    setTasks={setTasks}
                                    setFixedCosts={setFixedCosts}
                                    setOpex={setOpex}
                                />
                            }
                        />
                        <Route
                            path="/revenue-streams"
                            element={
                                <RevenueStreamsPage
                                    data={data}
                                    setRevenueStreams={setRevenueStreams}
                                    setTimeline={setTimeline}
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
                        <Route path="/data" element={<DataPage data={data} setData={setData} />} />
                    </Routes>
                </div>
            </div>
        </BrowserRouter>
    );
}
