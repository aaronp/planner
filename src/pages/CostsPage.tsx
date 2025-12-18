import type { VentureData, Task, FixedCost } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DataTable } from "../components/DataTable";
import { uid } from "../utils/formatUtils";
import { isValidDuration, isValidDependency, calculateTaskStartDate } from "../utils/taskUtils";
import { computeTaskDates } from "../utils/modelEngine";
import { useMemo } from "react";

type CostsPageProps = {
    data: VentureData;
    setTasks: (tasks: Task[]) => void;
    setFixedCosts: (costs: FixedCost[]) => void;
};

export function CostsPage({ data, setTasks, setFixedCosts }: CostsPageProps) {
    // Compute task dates for displaying in Fixed Costs
    const computedTasks = useMemo(() => computeTaskDates(data.tasks, data.meta.start), [data.tasks, data.meta.start]);

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

    // Calculate next Fixed Cost ID based on max existing ID
    const getNextFixedCostId = () => {
        const fixedCosts = data.costModel?.fixedMonthlyCosts ?? [];
        const fcNumbers = fixedCosts
            .map((fc) => {
                const match = fc.id.match(/^FC(\d+)$/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter((n) => !isNaN(n));
        const maxNum = fcNumbers.length > 0 ? Math.max(...fcNumbers) : 0;
        return `FC${maxNum + 1}`;
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
                                id: getNextFixedCostId(),
                                name: "New Fixed Cost",
                                monthlyCost: { type: "triangular", min: 0, mode: 0, max: 0 },
                                startEventId: undefined,
                            })}
                            columns={[
                                {
                                    key: "id",
                                    header: "ID",
                                    width: "110px",
                                    render: (v) => <span className="text-sm font-mono">{v}</span>,
                                },
                                { key: "name", header: "Name", width: "280px", input: "text" },
                                {
                                    key: "monthlyCost",
                                    header: "Monthly Cost",
                                    width: "180px",
                                    render: (v, row) => {
                                        const currentValue = typeof v === "number" ? v : v?.mode ?? v?.min ?? 0;
                                        return (
                                            <Input
                                                type="number"
                                                className="h-8 rounded-xl"
                                                value={currentValue}
                                                onChange={(e) => {
                                                    const newValue = Number(e.target.value || 0);
                                                    const fixedCosts = data.costModel?.fixedMonthlyCosts ?? [];
                                                    setFixedCosts(
                                                        fixedCosts.map((fc) =>
                                                            fc.id === row.id
                                                                ? {
                                                                      ...fc,
                                                                      monthlyCost: {
                                                                          type: "triangular",
                                                                          min: newValue,
                                                                          mode: newValue,
                                                                          max: newValue,
                                                                      },
                                                                  }
                                                                : fc
                                                        )
                                                    );
                                                }}
                                            />
                                        );
                                    },
                                },
                                {
                                    key: "startEventId",
                                    header: "Starts on",
                                    width: "240px",
                                    render: (v, row) => {
                                        const selectedTask = computedTasks.find((t) => t.id === v);
                                        return (
                                            <div className="space-y-1">
                                                <Select
                                                    value={v || "none"}
                                                    onValueChange={(nv) => {
                                                        const fixedCosts = data.costModel?.fixedMonthlyCosts ?? [];
                                                        setFixedCosts(
                                                            fixedCosts.map((fc) =>
                                                                fc.id === row.id
                                                                    ? { ...fc, startEventId: nv === "none" ? undefined : nv }
                                                                    : fc
                                                            )
                                                        );
                                                    }}
                                                >
                                                    <SelectTrigger className="h-8 rounded-xl">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">From start</SelectItem>
                                                        {computedTasks.map((t) => (
                                                            <SelectItem key={t.id} value={t.id}>
                                                                {t.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {selectedTask && (
                                                    <div className="text-xs text-muted-foreground">
                                                        From: {selectedTask.computedStart}
                                                    </div>
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
        </Tabs>
    );
}
