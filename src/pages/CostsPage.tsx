import type { VentureData, Task, FixedCost, Opex } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DataTable } from "../components/DataTable";
import { uid } from "../utils/formatUtils";
import { isValidDuration, isValidDependency, calculateTaskStartDate } from "../utils/taskUtils";

type CostsPageProps = {
    data: VentureData;
    setTasks: (tasks: Task[]) => void;
    setFixedCosts: (costs: FixedCost[]) => void;
    setOpex: (opex: Opex[]) => void;
};

export function CostsPage({ data, setTasks, setFixedCosts, setOpex }: CostsPageProps) {
    // Calculate next Task ID based on max existing ID
    const getNextTaskId = () => {
        const taskNumbers = data.tasks
            .map((t) => {
                const match = t.id.match(/^T(\d+)$/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter((n) => !isNaN(n));
        const maxNum = taskNumbers.length > 0 ? Math.max(...taskNumbers) : 0;
        return `T${maxNum + 1}`;
    };

    return (
        <Tabs defaultValue="tasks" className="w-full">
            <TabsList className="rounded-2xl">
                <TabsTrigger value="tasks" className="rounded-2xl">
                    Tasks
                </TabsTrigger>
                <TabsTrigger value="fixed-costs" className="rounded-2xl">
                    Fixed Costs
                </TabsTrigger>
                <TabsTrigger value="opex" className="rounded-2xl">
                    Operating Costs (Legacy)
                </TabsTrigger>
            </TabsList>

            {/* Tasks Tab */}
            <TabsContent value="tasks" className="mt-4">
                <Card className="rounded-2xl shadow-sm">
                    <CardContent className="p-6">
                        <DataTable<Task>
                            title="Tasks (Gantt)"
                            rows={data.tasks}
                            setRows={setTasks}
                            addRow={() => ({
                                id: getNextTaskId(),
                                name: "New Task",
                                phase: "Other",
                                start: data.meta.start,
                                duration: "1m",
                                costOneOff: 0,
                                costMonthly: 0,
                                dependsOn: [],
                            })}
                            columns={[
                                {
                                    key: "id",
                                    header: "ID",
                                    width: "110px",
                                    render: (v) => <span className="text-sm font-mono">{v}</span>,
                                },
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
                                        const calculatedStart = hasDeps ? calculateTaskStartDate(row, data.tasks) : v;
                                        return (
                                            <Input
                                                type="date"
                                                className="h-8 rounded-xl"
                                                value={calculatedStart || ""}
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
                                    header: "Depends on (e.g., T1e+2w, T3-1m)",
                                    width: "260px",
                                    render: (v, row) => {
                                        const deps = Array.isArray(v) ? v : [];
                                        const allValid = deps.length === 0 || deps.every((d) => isValidDependency(d));
                                        const depString = deps.join(",");
                                        return (
                                            <div>
                                                <Input
                                                    className={`h-8 rounded-xl ${!allValid ? "bg-red-50 border-red-300" : ""}`}
                                                    value={depString}
                                                    placeholder="e.g., T1, T1e+2w, T2s+3d, T3-1m"
                                                    title={!allValid ? "Invalid dependency format" : "Use: T1 (end), T1s (start), T1+2w (offset), T3-1m (before)"}
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

            {/* Fixed Costs Tab */}
            <TabsContent value="fixed-costs" className="mt-4">
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
            </TabsContent>

            {/* Opex Tab */}
            <TabsContent value="opex" className="mt-4">
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
        </Tabs>
    );
}
