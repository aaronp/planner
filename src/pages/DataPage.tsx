import type { VentureData, TimelineEvent, FixedCost, Task, Assumption, Risk, Opex } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DataTable } from "../components/DataTable";
import { RevenueStreamsView } from "../components/RevenueStreamsView";
import { uid, clamp01 } from "../utils/formatUtils";
import { isValidDuration, isValidDependency } from "../utils/taskUtils";

type DataPageProps = {
    data: VentureData;
    setRevenueStreams: (streams: any[]) => void;
    setTimeline: (timeline: TimelineEvent[]) => void;
    setFixedCosts: (costs: FixedCost[]) => void;
    setOpex: (opex: Opex[]) => void;
    setTasks: (tasks: Task[]) => void;
    setAssumptions: (assumptions: Assumption[]) => void;
    setRisks: (risks: Risk[]) => void;
};

export function DataPage({
    data,
    setRevenueStreams,
    setTimeline,
    setFixedCosts,
    setOpex,
    setTasks,
    setAssumptions,
    setRisks,
}: DataPageProps) {
    return (
        <Tabs defaultValue="revenue-streams" className="w-full">
            <TabsList className="rounded-2xl">
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
    );
}
