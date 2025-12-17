import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import type { VentureData, Task, Segment, Opex, Market, RevenueStream, TimelineEvent, Assumption, Risk, FixedCost } from "./types";
import { loadData, saveData, DEFAULT } from "./utils/storage";
import { addMonths } from "./utils/dateUtils";
import { fmtCurrency, uid, clamp01 } from "./utils/formatUtils";
import { computeSeries } from "./utils/modelEngine";
import { formatMonthLabel } from "./utils/dateUtils";
import { isValidDuration, isValidDependency } from "./utils/taskUtils";

import { DataTable } from "./components/DataTable";
import { TimelineView } from "./components/TimelineView";
import { SnapshotView } from "./components/SnapshotView";
import { SummaryView } from "./components/SummaryView";
import { ImportExport } from "./components/ImportExport";
import { MarketsView } from "./components/MarketsView";
import { RevenueStreamsView } from "./components/RevenueStreamsView";

/**
 * Venture Proposal Planner (Local-first)
 *
 * - Timeline view: tasks + market segments with TAM/SAM/SOM stacked bars
 * - Time slider drives snapshot and summary
 * - Tabular editing, localStorage persistence, JSON import/export
 */

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

                <Tabs defaultValue="timeline" className="w-full">
                    <TabsList className="rounded-2xl">
                        <TabsTrigger value="timeline" className="rounded-2xl">
                            Timeline
                        </TabsTrigger>
                        <TabsTrigger value="data" className="rounded-2xl">
                            Data
                        </TabsTrigger>
                        <TabsTrigger value="snapshot" className="rounded-2xl">
                            Snapshot
                        </TabsTrigger>
                        <TabsTrigger value="summary" className="rounded-2xl">
                            Summary
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="timeline" className="mt-4">
                        <TimelineView data={data} month={month} setMonth={setMonth} />
                    </TabsContent>

                    <TabsContent value="snapshot" className="mt-4">
                        <SnapshotView data={data} month={month} />
                    </TabsContent>

                    <TabsContent value="summary" className="mt-4">
                        <SummaryView data={data} />
                    </TabsContent>

                    <TabsContent value="data" className="mt-4">
                        <Tabs defaultValue="markets" className="w-full">
                            <TabsList className="rounded-2xl">
                                <TabsTrigger value="markets" className="rounded-2xl">
                                    Markets
                                </TabsTrigger>
                                <TabsTrigger value="revenue-streams" className="rounded-2xl">
                                    Revenue Streams
                                </TabsTrigger>
                                <TabsTrigger value="timeline" className="rounded-2xl">
                                    Timeline
                                </TabsTrigger>
                                <TabsTrigger value="costs" className="rounded-2xl">
                                    Costs
                                </TabsTrigger>
                                <TabsTrigger value="tasks" className="rounded-2xl">
                                    Tasks
                                </TabsTrigger>
                                <TabsTrigger value="assumptions" className="rounded-2xl">
                                    Assumptions
                                </TabsTrigger>
                                <TabsTrigger value="risks" className="rounded-2xl">
                                    Risks
                                </TabsTrigger>
                            </TabsList>

                            {/* Markets Tab */}
                            <TabsContent value="markets" className="mt-4">
                                <Card className="rounded-2xl shadow-sm">
                                    <CardContent className="p-6">
                                        <MarketsView
                                            markets={data.markets ?? []}
                                            onChange={setMarkets}
                                        />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Revenue Streams Tab */}
                            <TabsContent value="revenue-streams" className="mt-4">
                                <Card className="rounded-2xl shadow-sm">
                                    <CardContent className="p-6">
                                        <RevenueStreamsView
                                            revenueStreams={data.revenueStreams ?? []}
                                            markets={data.markets ?? []}
                                            timeline={data.timeline ?? []}
                                            onChange={setRevenueStreams}
                                            onChangeTimeline={setTimeline}
                                            horizonMonths={data.meta.horizonMonths}
                                        />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Timeline Tab */}
                            <TabsContent value="timeline" className="mt-4">
                                <Card className="rounded-2xl shadow-sm">
                                    <CardContent className="p-6">
                                        <DataTable<TimelineEvent>
                                            title="Timeline Events"
                                            rows={data.timeline ?? []}
                                            setRows={setTimeline}
                                            addRow={() => ({
                                                id: uid("TL"),
                                                name: "New Event",
                                                month: 0,
                                                description: "",
                                            })}
                                            columns={[
                                                { key: "id", header: "ID", width: "110px", input: "text" },
                                                { key: "name", header: "Name", width: "280px", input: "text" },
                                                { key: "month", header: "Month (from start)", width: "150px", input: "number" },
                                                { key: "description", header: "Description", width: "400px", input: "text" },
                                            ]}
                                        />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Costs Tab */}
                            <TabsContent value="costs" className="mt-4 space-y-4">
                                <Card className="rounded-2xl shadow-sm">
                                    <CardContent className="p-6">
                                        <DataTable<FixedCost>
                                            title="Fixed Monthly Costs"
                                            rows={data.costModel?.fixedMonthlyCosts ?? []}
                                            setRows={setFixedCosts}
                                            addRow={() => ({
                                                id: uid("FC"),
                                                name: "New Fixed Cost",
                                                monthlyCost: { type: "triangular", min: 0, mode: 0, max: 0 },
                                                startEventId: undefined,
                                            })}
                                            columns={[
                                                { key: "id", header: "ID", width: "110px", input: "text" },
                                                { key: "name", header: "Name", width: "280px", input: "text" },
                                                {
                                                    key: "monthlyCost",
                                                    header: "Monthly Cost (simple value)",
                                                    width: "200px",
                                                    render: (v) => {
                                                        const dist = typeof v === "number" ? v : v?.mode ?? v?.min ?? 0;
                                                        return <span>{dist}</span>;
                                                    },
                                                },
                                                { key: "startEventId", header: "Start Event ID", width: "150px", input: "text" },
                                            ]}
                                        />
                                    </CardContent>
                                </Card>

                                <Card className="rounded-2xl shadow-sm">
                                    <CardContent className="p-6">
                                        <DataTable<Opex>
                                            title="Operating Costs (Opex) - Legacy"
                                            rows={data.opex}
                                            setRows={setOpex}
                                            addRow={() => ({
                                                id: uid("O"),
                                                category: "New Opex",
                                                start: data.meta.start,
                                                monthly: 0,
                                            })}
                                            columns={[
                                                { key: "id", header: "ID", width: "110px", input: "text" },
                                                { key: "category", header: "Category", width: "260px", input: "text" },
                                                { key: "start", header: "Start", width: "150px", input: "date" },
                                                { key: "end", header: "End", width: "150px", input: "date" },
                                                { key: "monthly", header: "Monthly", width: "160px", input: "number" },
                                            ]}
                                        />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Tasks Tab */}
                            <TabsContent value="tasks" className="mt-4">
                                <Card className="rounded-2xl shadow-sm">
                                    <CardContent className="p-6">
                                        <DataTable<Task>
                                            title="Tasks (Gantt)"
                                            rows={data.tasks}
                                            setRows={setTasks}
                                            addRow={() => ({
                                                id: uid("T"),
                                                name: "New Task",
                                                phase: "Other",
                                                start: data.meta.start,
                                                duration: "1m",
                                                costOneOff: 0,
                                                costMonthly: 0,
                                                dependsOn: [],
                                            })}
                                            columns={[
                                                { key: "id", header: "ID", width: "110px", input: "text" },
                                                { key: "name", header: "Name", width: "260px", input: "text" },
                                                {
                                                    key: "phase",
                                                    header: "Phase",
                                                    width: "160px",
                                                    render: (v, row) => (
                                                        <Select
                                                            value={String(v)}
                                                            onValueChange={(nv) => {
                                                                setTasks(data.tasks.map((t) => (t.id === row.id ? { ...t, phase: nv as any } : t)));
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 rounded-xl">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {["Inception", "Build", "Deploy", "GoToMarket", "Other"].map((p) => (
                                                                    <SelectItem key={p} value={p}>
                                                                        {p}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    ),
                                                },
                                                {
                                                    key: "start",
                                                    header: "Start",
                                                    width: "150px",
                                                    render: (v, row) => {
                                                        const hasDeps = row.dependsOn && row.dependsOn.length > 0;
                                                        return (
                                                            <Input
                                                                type="date"
                                                                className="h-8 rounded-xl"
                                                                value={v || ""}
                                                                disabled={hasDeps}
                                                                title={hasDeps ? "Start date is calculated from dependencies" : ""}
                                                                onChange={(e) => {
                                                                    setTasks(data.tasks.map((t) => (t.id === row.id ? { ...t, start: e.target.value } : t)));
                                                                }}
                                                            />
                                                        );
                                                    },
                                                },
                                                {
                                                    key: "duration",
                                                    header: "Duration (e.g., 2w, 3m)",
                                                    width: "180px",
                                                    render: (v, row) => {
                                                        const isValid = isValidDuration(v || "");
                                                        return (
                                                            <div>
                                                                <Input
                                                                    className={`h-8 rounded-xl ${!isValid ? "bg-red-50 border-red-300" : ""}`}
                                                                    value={v || ""}
                                                                    placeholder="e.g., 2w, 3m (empty = ongoing)"
                                                                    title={!isValid ? "Invalid format. Use: 2w, 3m, 1y, 5d" : ""}
                                                                    onChange={(e) => {
                                                                        setTasks(data.tasks.map((t) => (t.id === row.id ? { ...t, duration: e.target.value } : t)));
                                                                    }}
                                                                />
                                                                {!isValid && v && (
                                                                    <div className="text-xs text-red-600 mt-1">Invalid format</div>
                                                                )}
                                                            </div>
                                                        );
                                                    },
                                                },
                                                { key: "costOneOff", header: "One-off cost", width: "140px", input: "number" },
                                                { key: "costMonthly", header: "Monthly cost", width: "140px", input: "number" },
                                                {
                                                    key: "dependsOn",
                                                    header: "Depends on (e.g., T1e+2w)",
                                                    width: "240px",
                                                    render: (v, row) => {
                                                        const deps = Array.isArray(v) ? v : [];
                                                        const allValid = deps.length === 0 || deps.every((d) => isValidDependency(d));
                                                        const depString = deps.join(",");
                                                        return (
                                                            <div>
                                                                <Input
                                                                    className={`h-8 rounded-xl ${!allValid ? "bg-red-50 border-red-300" : ""}`}
                                                                    value={depString}
                                                                    placeholder="e.g., T1, T1e+2w, T2s+3d"
                                                                    title={!allValid ? "Invalid dependency format" : ""}
                                                                    onChange={(e) => {
                                                                        const ids = e.target.value
                                                                            .split(",")
                                                                            .map((s) => s.trim())
                                                                            .filter(Boolean);
                                                                        setTasks(data.tasks.map((t) => (t.id === row.id ? { ...t, dependsOn: ids } : t)));
                                                                    }}
                                                                />
                                                                {!allValid && deps.length > 0 && (
                                                                    <div className="text-xs text-red-600 mt-1">Invalid dependency format</div>
                                                                )}
                                                            </div>
                                                        );
                                                    },
                                                },
                                            ]}
                                        />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Assumptions Tab */}
                            <TabsContent value="assumptions" className="mt-4">
                                <Card className="rounded-2xl shadow-sm">
                                    <CardContent className="p-6">
                                        <DataTable<Assumption>
                                            title="Assumptions"
                                            rows={data.assumptions ?? []}
                                            setRows={setAssumptions}
                                            addRow={() => ({
                                                id: uid("A"),
                                                description: "New assumption",
                                                confidence: "medium",
                                                affects: [],
                                                notes: "",
                                            })}
                                            columns={[
                                                { key: "id", header: "ID", width: "110px", input: "text" },
                                                { key: "description", header: "Description", width: "400px", input: "text" },
                                                {
                                                    key: "confidence",
                                                    header: "Confidence",
                                                    width: "130px",
                                                    render: (v, row) => (
                                                        <Select
                                                            value={String(v)}
                                                            onValueChange={(nv) => {
                                                                setAssumptions(
                                                                    (data.assumptions ?? []).map((a) =>
                                                                        a.id === row.id ? { ...a, confidence: nv as any } : a
                                                                    )
                                                                );
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 rounded-xl">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {["low", "medium", "high"].map((c) => (
                                                                    <SelectItem key={c} value={c}>
                                                                        {c}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    ),
                                                },
                                                {
                                                    key: "affects",
                                                    header: "Affects (comma-separated IDs)",
                                                    width: "280px",
                                                    render: (v, row) => (
                                                        <Input
                                                            className="h-8 rounded-xl"
                                                            value={Array.isArray(v) ? v.join(", ") : ""}
                                                            placeholder="e.g., RS1, MKT1"
                                                            onChange={(e) => {
                                                                const ids = e.target.value
                                                                    .split(",")
                                                                    .map((s) => s.trim())
                                                                    .filter(Boolean);
                                                                setAssumptions(
                                                                    (data.assumptions ?? []).map((a) =>
                                                                        a.id === row.id ? { ...a, affects: ids } : a
                                                                    )
                                                                );
                                                            }}
                                                        />
                                                    ),
                                                },
                                                { key: "notes", header: "Notes", width: "300px", input: "text" },
                                            ]}
                                        />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Risks Tab */}
                            <TabsContent value="risks" className="mt-4">
                                <Card className="rounded-2xl shadow-sm">
                                    <CardContent className="p-6">
                                        <DataTable<Risk>
                                            title="Risks"
                                            rows={data.risks ?? []}
                                            setRows={setRisks}
                                            addRow={() => ({
                                                id: uid("R"),
                                                name: "New risk",
                                                probability: 0.3,
                                                impact: [],
                                            })}
                                            columns={[
                                                { key: "id", header: "ID", width: "110px", input: "text" },
                                                { key: "name", header: "Name", width: "280px", input: "text" },
                                                {
                                                    key: "probability",
                                                    header: "Probability (0-1)",
                                                    width: "150px",
                                                    input: "number",
                                                    parse: (v) => clamp01(Number(v || 0)),
                                                },
                                                {
                                                    key: "impact",
                                                    header: "Impact (complex - edit in JSON)",
                                                    width: "300px",
                                                    render: (v) => (
                                                        <span className="text-xs text-muted-foreground">
                                                            {Array.isArray(v) ? `${v.length} impact(s)` : "No impacts"}
                                                        </span>
                                                    ),
                                                },
                                            ]}
                                        />
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
