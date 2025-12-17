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

import type { VentureData, Task, Segment, Opex } from "./types";
import { loadData, saveData, DEFAULT } from "./utils/storage";
import { addMonths } from "./utils/dateUtils";
import { fmtCurrency, uid, clamp01 } from "./utils/formatUtils";
import { computeSeries } from "./utils/modelEngine";
import { formatMonthLabel } from "./utils/dateUtils";

import { DataTable } from "./components/DataTable";
import { TimelineView } from "./components/TimelineView";
import { SnapshotView } from "./components/SnapshotView";
import { SummaryView } from "./components/SummaryView";
import { ImportExport } from "./components/ImportExport";

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

                    <TabsContent value="data" className="mt-4 grid gap-4">
                        <DataTable<Task>
                            title="Tasks (Gantt)"
                            rows={data.tasks}
                            setRows={setTasks}
                            addRow={() => ({
                                id: uid("T"),
                                name: "New Task",
                                phase: "Other",
                                start: data.meta.start,
                                end: addMonths(data.meta.start, 1),
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
                                { key: "start", header: "Start", width: "150px", input: "date" },
                                { key: "end", header: "End", width: "150px", input: "date" },
                                { key: "costOneOff", header: "One-off cost", width: "140px", input: "number" },
                                { key: "costMonthly", header: "Monthly cost", width: "140px", input: "number" },
                                {
                                    key: "dependsOn",
                                    header: "Depends on (comma IDs)",
                                    width: "220px",
                                    render: (v, row) => (
                                        <Input
                                            className="h-8 rounded-xl"
                                            value={(Array.isArray(v) ? v.join(",") : "") as any}
                                            onChange={(e) => {
                                                const ids = e.target.value
                                                    .split(",")
                                                    .map((s) => s.trim())
                                                    .filter(Boolean);
                                                setTasks(data.tasks.map((t) => (t.id === row.id ? { ...t, dependsOn: ids } : t)));
                                            }}
                                        />
                                    ),
                                },
                            ]}
                        />

                        <DataTable<Segment>
                            title="Market Segments"
                            rows={data.segments}
                            setRows={setSegments}
                            addRow={() => ({
                                id: uid("M"),
                                name: "New Segment",
                                entry: addMonths(data.meta.start, 6),
                                tam: 100000,
                                samPct: 0.2,
                                somPct: 0.05,
                                pricePerUnit: 50,
                                cacPerUnit: 30,
                                rampMonths: 12,
                            })}
                            columns={[
                                { key: "id", header: "ID", width: "110px", input: "text" },
                                { key: "name", header: "Name", width: "280px", input: "text" },
                                { key: "entry", header: "Entry", width: "150px", input: "date" },
                                { key: "exit", header: "Exit", width: "150px", input: "date" },
                                { key: "tam", header: "TAM", width: "130px", input: "number" },
                                {
                                    key: "samPct",
                                    header: "SAM % (0..1)",
                                    width: "130px",
                                    input: "number",
                                    parse: (v) => clamp01(Number(v || 0)),
                                },
                                {
                                    key: "somPct",
                                    header: "SOM % (0..1)",
                                    width: "130px",
                                    input: "number",
                                    parse: (v) => clamp01(Number(v || 0)),
                                },
                                { key: "pricePerUnit", header: "£/unit/mo", width: "120px", input: "number" },
                                { key: "cacPerUnit", header: "CAC/unit", width: "120px", input: "number" },
                                { key: "rampMonths", header: "Ramp (months)", width: "130px", input: "number" },
                            ]}
                        />

                        <DataTable<Opex>
                            title="Operating Costs (Opex)"
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

                        <Card className="rounded-2xl shadow-sm">
                            <CardContent className="p-6">
                                <div className="text-base font-semibold mb-3">Notes / Next steps</div>
                                <div className="text-sm text-muted-foreground">
                                    <ul className="list-disc pl-5 space-y-2">
                                        <li>
                                            This MVP uses a simple adoption ramp (ease-in-out) to reach <b>SOM % of SAM</b> per segment.
                                        </li>
                                        <li>
                                            Next obvious upgrade: explicit <b>ramp tables</b> (month → SOM%), plus churn/retention.
                                        </li>
                                        <li>
                                            Another upgrade: dependency-aware <b>auto-scheduling</b> (compute task start based on deps).
                                        </li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
