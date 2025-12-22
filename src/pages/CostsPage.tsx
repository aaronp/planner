import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { VentureData, Task, FixedCost, ComputedTask } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DataTable } from "../components/DataTable";
import { uid } from "../utils/formatUtils";
import { isValidDuration, isValidDependency, calculateTaskStartDate, parseDependency, addDuration } from "../utils/taskUtils";
import { computeTaskDates } from "../utils/modelEngine";
import { monthIndexFromStart, addMonths } from "../utils/dateUtils";
import { Badge } from "@/components/ui/badge";
import { GripVertical } from "lucide-react";

type CostsPageProps = {
    data: VentureData;
    setTasks: (tasks: Task[]) => void;
    setFixedCosts: (costs: FixedCost[]) => void;
};

type TaskWithColor = Task & { color?: string };

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function MonthTicks({ horizonMonths }: { horizonMonths: number }) {
    const ticks = useMemo(() => {
        const out: number[] = [];
        for (let i = 0; i <= horizonMonths; i++) {
            if (i === 0 || i % 3 === 0 || i === horizonMonths) out.push(i);
        }
        return out;
    }, [horizonMonths]);

    return (
        <div className="relative w-full">
            <div className="flex justify-between text-xs text-muted-foreground">
                {ticks.map((m) => (
                    <div key={m} className="flex flex-col items-center" style={{ width: `${100 / (ticks.length - 1)}%` }}>
                        <div className="h-2 w-px bg-border" />
                        <div className="mt-1">M{m}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DraggableTaskTimeline({
    tasks,
    computedTasks,
    horizonMonths,
    ventureStart,
    selectedId,
    onSelect,
    onChangeTaskStart,
}: {
    tasks: TaskWithColor[];
    computedTasks: ComputedTask[];
    horizonMonths: number;
    ventureStart: string;
    selectedId?: string;
    onSelect: (id: string) => void;
    onChangeTaskStart: (id: string, month: number) => void;
}) {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const draggingIdRef = useRef<string | null>(null);
    const grabOffsetMonthsRef = useRef<number>(0);

    const monthFromClientX = useCallback(
        (clientX: number) => {
            if (!trackRef.current) return 0;
            const rect = trackRef.current.getBoundingClientRect();
            const x = clamp(clientX - rect.left, 0, rect.width);
            return clamp(Math.round((x / rect.width) * horizonMonths), 0, horizonMonths);
        },
        [horizonMonths]
    );

    useEffect(() => {
        if (!draggingId) {
            draggingIdRef.current = null;
            grabOffsetMonthsRef.current = 0;
            return;
        }

        draggingIdRef.current = draggingId;

        const handleMouseMove = (e: MouseEvent) => {
            if (!draggingIdRef.current) return;
            e.preventDefault();
            const raw = monthFromClientX(e.clientX) - (grabOffsetMonthsRef.current || 0);
            const newMonth = clamp(raw, 0, horizonMonths);
            onChangeTaskStart(draggingIdRef.current, newMonth);
        };

        const handleMouseUp = () => {
            setDraggingId(null);
            draggingIdRef.current = null;
            grabOffsetMonthsRef.current = 0;
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [draggingId, monthFromClientX, onChangeTaskStart, horizonMonths]);

    const getTaskMonth = (task: Task) => {
        const computed = computedTasks.find((t) => t.id === task.id);
        if (!computed?.computedStart) return 0;
        return monthIndexFromStart(ventureStart, computed.computedStart);
    };

    const getTaskDurationMonths = (task: Task): number => {
        if (!task.duration) return horizonMonths; // Ongoing task
        const match = task.duration.match(/^(\d+)([dwmy])$/);
        if (!match) return horizonMonths;

        const value = parseInt(match[1]!, 10);
        const unit = match[2]!;

        if (unit === "d") return value / 30;
        if (unit === "w") return value / 4;
        if (unit === "m") return value;
        if (unit === "y") return value * 12;
        return horizonMonths;
    };

    const timelineHeight = Math.max(112, tasks.length * 44 + 24);

    const phaseColors: Record<string, string> = {
        Inception: "#8b5cf6",
        Build: "#3b82f6",
        Deploy: "#10b981",
        GoToMarket: "#f59e0b",
        Other: "#6b7280",
    };

    return (
        <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <CardTitle className="text-base">Task timeline</CardTitle>
                        <div className="text-sm text-muted-foreground">
                            Drag a task bar to change when it starts. Tasks with dependencies will update their offset.
                        </div>
                    </div>
                    <Badge variant="secondary">Horizon: {horizonMonths} months</Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div
                    ref={trackRef}
                    className="relative w-full rounded-2xl border bg-background overflow-visible"
                    style={{ height: `${timelineHeight}px` }}
                >
                    <div className="absolute inset-0 pointer-events-none opacity-60">
                        {Array.from({ length: horizonMonths + 1 }).map((_, i) => (
                            <div
                                key={i}
                                className="absolute top-0 bottom-0 w-px bg-border"
                                style={{ left: `${(i / horizonMonths) * 100}%` }}
                            />
                        ))}
                    </div>

                    <div className="absolute inset-0 p-3">
                        {tasks.map((t, idx) => {
                            const isSel = t.id === selectedId;
                            const month = getTaskMonth(t);
                            const durationMonths = getTaskDurationMonths(t);
                            const leftPct = (month / horizonMonths) * 100;
                            const widthPct = Math.min((durationMonths / horizonMonths) * 100, 100 - leftPct);
                            const color = phaseColors[t.phase] || phaseColors.Other;
                            const isDragging = draggingId === t.id;
                            const hasDeps = t.dependsOn && t.dependsOn.length > 0;

                            return (
                                <div
                                    key={t.id}
                                    className={
                                        "absolute h-10 rounded-2xl border flex items-center justify-between px-3 select-none " +
                                        (isSel ? "ring-2 ring-offset-2" : "")
                                    }
                                    style={{
                                        top: `${idx * 44 + 8}px`,
                                        left: `${leftPct}%`,
                                        width: `${widthPct}%`,
                                        background: `${color}15`,
                                        borderColor: `${color}55`,
                                        transition: isDragging ? "none" : "all 0.2s",
                                    }}
                                >
                                    <div
                                        className={
                                            "flex items-center justify-center w-8 h-8 -ml-2 cursor-grab active:cursor-grabbing hover:bg-black/5 rounded-xl transition-colors " +
                                            (isDragging ? "cursor-grabbing" : "")
                                        }
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const downMonth = monthFromClientX(e.clientX);
                                            const currentMonth = getTaskMonth(t);
                                            grabOffsetMonthsRef.current = downMonth - currentMonth;
                                            setDraggingId(t.id);
                                            onSelect(t.id);
                                        }}
                                    >
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    </div>

                                    <div
                                        className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                                        onClick={() => onSelect(t.id)}
                                    >
                                        <div className="h-3 w-3 rounded-full" style={{ background: color }} />
                                        <div className="truncate text-sm font-medium">{t.name}</div>
                                        <Badge variant="outline">M{month}</Badge>
                                        {hasDeps && (
                                            <Badge variant="secondary" className="text-xs">
                                                Deps
                                            </Badge>
                                        )}
                                        {t.duration && (
                                            <Badge variant="secondary" className="text-xs">
                                                {t.duration}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <MonthTicks horizonMonths={horizonMonths} />
            </CardContent>
        </Card>
    );
}

export function CostsPage({ data, setTasks, setFixedCosts }: CostsPageProps) {
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(data.tasks[0]?.id ?? null);

    // Compute task dates for displaying in Fixed Costs
    const computedTasks = useMemo(() => computeTaskDates(data.tasks, data.meta.start), [data.tasks, data.meta.start]);

    const tasksWithColors: TaskWithColor[] = useMemo(
        () => data.tasks.map((t) => ({ ...t })),
        [data.tasks]
    );

    // Handler for changing task start when dragging
    const handleChangeTaskStart = useCallback(
        (id: string, month: number) => {
            const task = data.tasks.find((t) => t.id === id);
            if (!task) return;

            const newDate = addMonths(data.meta.start, month);

            // If task has dependencies, update the offset
            if (task.dependsOn && task.dependsOn.length > 0) {
                // For tasks with dependencies, we need to update the offset in the dependency string
                const updatedDeps = task.dependsOn.map((depStr) => {
                    const parsed = parseDependency(depStr);
                    if (!parsed) return depStr;

                    // Find the dependent task and its computed date
                    const depTask = data.tasks.find((t) => t.id === parsed.taskId);
                    if (!depTask) return depStr;

                    const depComputed = computedTasks.find((t) => t.id === parsed.taskId);
                    if (!depComputed?.computedStart) return depStr;

                    // Calculate what the anchor date would be
                    let anchorDate = depComputed.computedStart;
                    if (parsed.anchor === "end" && depComputed.computedEnd) {
                        anchorDate = depComputed.computedEnd;
                    }

                    // Calculate the offset needed to get from anchor to new date
                    const anchorMonth = monthIndexFromStart(data.meta.start, anchorDate);
                    const offsetMonths = month - anchorMonth;

                    // Build the new dependency string
                    let newDepStr = parsed.taskId;
                    if (parsed.anchor === "end") newDepStr += "e";
                    else if (parsed.anchor === "start") newDepStr += "s";

                    if (offsetMonths !== 0) {
                        const sign = offsetMonths > 0 ? "+" : "";
                        newDepStr += `${sign}${offsetMonths}m`;
                    }

                    return newDepStr;
                });

                setTasks(
                    data.tasks.map((t) =>
                        t.id === id ? { ...t, dependsOn: updatedDeps } : t
                    )
                );
            } else {
                // No dependencies - just update the start date
                setTasks(
                    data.tasks.map((t) =>
                        t.id === id ? { ...t, start: newDate } : t
                    )
                );
            }
        },
        [data.tasks, data.meta.start, computedTasks, setTasks]
    );

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
                <div className="space-y-4">
                    {/* Draggable Timeline */}
                    {data.tasks.length > 0 && (
                        <DraggableTaskTimeline
                            tasks={tasksWithColors}
                            computedTasks={computedTasks}
                            horizonMonths={data.meta.horizonMonths}
                            ventureStart={data.meta.start}
                            selectedId={selectedTaskId ?? undefined}
                            onSelect={setSelectedTaskId}
                            onChangeTaskStart={handleChangeTaskStart}
                        />
                    )}

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

                                                        // If removing dependencies, set start date to computed start date
                                                        const hadDeps = row.dependsOn && row.dependsOn.length > 0;
                                                        const willHaveDeps = ids.length > 0;

                                                        if (hadDeps && !willHaveDeps) {
                                                            // User is removing all dependencies - preserve computed start date
                                                            const computed = computedTasks.find((t) => t.id === row.id);
                                                            const newStart = computed?.computedStart || row.start || data.meta.start;
                                                            setTasks(data.tasks.map((t) => (t.id === row.id ? { ...t, dependsOn: ids, start: newStart } : t)));
                                                        } else {
                                                            setTasks(data.tasks.map((t) => (t.id === row.id ? { ...t, dependsOn: ids } : t)));
                                                        }
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
                </div>
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
