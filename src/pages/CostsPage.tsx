import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { VentureData, Task, FixedCost, ComputedTask, Phase } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable } from "../components/DataTable";
import { isValidDuration, isValidDependency, calculateTaskStartDate, parseDependency } from "../utils/taskUtils";
import { computeTaskDates } from "../utils/modelEngine";
import { monthIndexFromStart, addMonths } from "../utils/dateUtils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GripVertical, ChevronLeft, ChevronRight, Palette, BarChart3, Table as TableIcon } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend } from "recharts";
import { fmtCurrency } from "../utils/formatUtils";

type CostsPageProps = {
    data: VentureData;
    setTasks: (tasks: Task[]) => void;
    setFixedCosts: (costs: FixedCost[]) => void;
    setPhases: (phases: Phase[]) => void;
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
    phases,
    onSelect,
    onChangeTaskStart,
}: {
    tasks: TaskWithColor[];
    computedTasks: ComputedTask[];
    horizonMonths: number;
    ventureStart: string;
    selectedId?: string;
    phases?: Phase[];
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

    // Helper to convert duration to months
    const durationToMonths = (duration: string): number => {
        const match = duration.match(/^(\d+)([dwmy])$/);
        if (!match) return 0;
        const value = parseInt(match[1]!, 10);
        const unit = match[2]!;
        if (unit === "d") return value / 30;
        if (unit === "w") return value / 4;
        if (unit === "m") return value;
        if (unit === "y") return value * 12;
        return 0;
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
                    {/* Phase backgrounds */}
                    {phases?.map((phase, idx) => {
                        // Calculate start month based on previous phases
                        let startMonth = 0;
                        for (let i = 0; i < idx; i++) {
                            const prevPhase = phases[i]!;
                            startMonth += durationToMonths(prevPhase.duration);
                        }

                        let durationMonths = durationToMonths(phase.duration);
                        // If no valid duration, make it extend to the end
                        if (durationMonths === 0) {
                            durationMonths = horizonMonths - startMonth;
                        }
                        const leftPct = (startMonth / horizonMonths) * 100;
                        const widthPct = (durationMonths / horizonMonths) * 100;
                        return (
                            <div
                                key={phase.id}
                                className="absolute inset-y-0 pointer-events-none"
                                style={{
                                    left: `${leftPct}%`,
                                    width: `${widthPct}%`,
                                    background: `${phase.color}10`,
                                    borderLeft: `2px solid ${phase.color}40`,
                                    borderRight: `2px solid ${phase.color}40`,
                                }}
                            >
                                <div
                                    className="absolute top-1 left-2 text-xs font-medium opacity-60"
                                    style={{ color: phase.color }}
                                >
                                    {phase.name}
                                </div>
                            </div>
                        );
                    })}

                    <div className="absolute inset-0 pointer-events-none opacity-60">
                        {Array.from({ length: horizonMonths + 1 }).map((_, i) => (
                            <div
                                key={i}
                                className="absolute top-0 bottom-0 w-px bg-border"
                                style={{ left: `${(i / horizonMonths) * 100}%` }}
                            />
                        ))}
                    </div>

                    <div className="absolute inset-0 p-3 pt-6">
                        {tasks.map((t, idx) => {
                            const isSel = t.id === selectedId;
                            const month = getTaskMonth(t);
                            const durationMonths = getTaskDurationMonths(t);
                            const leftPct = (month / horizonMonths) * 100;
                            const widthPct = Math.min((durationMonths / horizonMonths) * 100, 100 - leftPct);
                            const color = t.color || "#3b82f6";
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
                                        top: `${idx * 44 + 12}px`,
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
    const navigate = useNavigate();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(data.tasks[0]?.id ?? null);
    const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
    const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
    const [costPreviewMode, setCostPreviewMode] = useState<"graph" | "table">("graph");

    // Store task colors in component state and sync with localStorage
    const [taskColors, setTaskColors] = useState<Map<string, string>>(() => {
        const palette = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#3b82f6", "#6366f1", "#8b5cf6"];

        // Try to load from localStorage first
        const stored = localStorage.getItem("taskColors");
        if (stored) {
            try {
                const obj = JSON.parse(stored);
                const loadedMap = new Map<string, string>(Object.entries(obj));

                // Fill in any missing colors for new tasks
                data.tasks.forEach((t, i) => {
                    if (!loadedMap.has(t.id)) {
                        loadedMap.set(t.id, palette[i % palette.length]);
                    }
                });
                return loadedMap;
            } catch {
                // Fall through to default
            }
        }

        // Default initialization
        const map = new Map<string, string>();
        data.tasks.forEach((t, i) => {
            map.set(t.id, palette[i % palette.length]);
        });
        return map;
    });

    // Save colors to localStorage whenever they change
    useEffect(() => {
        const obj = Object.fromEntries(taskColors);
        localStorage.setItem("taskColors", JSON.stringify(obj));

        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event("taskColorsChanged"));
    }, [taskColors]);

    // Compute task dates for displaying in Fixed Costs
    const computedTasks = useMemo(() => computeTaskDates(data.tasks, data.meta.start), [data.tasks, data.meta.start]);

    const tasksWithColors: TaskWithColor[] = useMemo(
        () => data.tasks.map((t) => ({ ...t, color: taskColors.get(t.id) || "#3b82f6" })),
        [data.tasks, taskColors]
    );

    // Calculate preview data for cost visualization
    const previewData = useMemo(() => {
        const result = [];
        const fixedCosts = data.costModel?.fixedMonthlyCosts ?? [];

        for (let i = 0; i < data.meta.horizonMonths; i++) {
            // Calculate task costs for this month
            let taskOneOffCosts = 0;
            let taskMonthlyCosts = 0;

            for (const task of data.tasks) {
                const computed = computedTasks.find((t) => t.id === task.id);
                if (!computed?.computedStart) continue;

                const taskStartMonth = monthIndexFromStart(data.meta.start, computed.computedStart);
                const taskEndMonth = computed.computedEnd
                    ? monthIndexFromStart(data.meta.start, computed.computedEnd)
                    : data.meta.horizonMonths;

                // Get count for this task at this month
                const getTaskCountAtMonth = (task: Task, month: number): number => {
                    const baseCount = task.count ?? 1;
                    if (!task.countSchedule || task.countSchedule.length === 0) {
                        return baseCount;
                    }
                    const sortedSchedule = [...task.countSchedule].sort((a, b) => a.month - b.month);
                    let currentCount = baseCount;
                    for (const point of sortedSchedule) {
                        if (point.month <= month) {
                            currentCount = point.count;
                        } else {
                            break;
                        }
                    }
                    return currentCount;
                };

                const count = getTaskCountAtMonth(task, i);

                // One-off costs at start month
                if (i === taskStartMonth && task.costOneOff) {
                    taskOneOffCosts += task.costOneOff * count;
                }

                // Monthly costs during task duration
                if (i >= taskStartMonth && i <= taskEndMonth && task.costMonthly) {
                    taskMonthlyCosts += task.costMonthly * count;
                }
            }

            // Calculate fixed costs for this month
            let fixedMonthlyCosts = 0;
            for (const fc of fixedCosts) {
                if (!fc.startEventId) {
                    // No start event - cost from beginning
                    const costValue = typeof fc.monthlyCost === 'number'
                        ? fc.monthlyCost
                        : fc.monthlyCost.mode ?? fc.monthlyCost.min ?? 0;
                    fixedMonthlyCosts += costValue;
                } else {
                    // Has start event - check if started
                    const startTask = computedTasks.find((t) => t.id === fc.startEventId);
                    if (startTask?.computedStart) {
                        const startMonth = monthIndexFromStart(data.meta.start, startTask.computedStart);
                        if (i >= startMonth) {
                            const costValue = typeof fc.monthlyCost === 'number'
                                ? fc.monthlyCost
                                : fc.monthlyCost.mode ?? fc.monthlyCost.min ?? 0;
                            fixedMonthlyCosts += costValue;
                        }
                    }
                }
            }

            result.push({
                month: i,
                taskOneOff: taskOneOffCosts,
                taskMonthly: taskMonthlyCosts,
                fixedCosts: fixedMonthlyCosts,
                totalCosts: taskOneOffCosts + taskMonthlyCosts + fixedMonthlyCosts,
            });
        }

        return result;
    }, [data.tasks, data.costModel?.fixedMonthlyCosts, data.meta.horizonMonths, data.meta.start, computedTasks]);

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

    return (
        <div className="w-full">
                <div className="space-y-4">
                    {/* Draggable Timeline */}
                    {data.tasks.length > 0 && (
                        <DraggableTaskTimeline
                            tasks={tasksWithColors}
                            computedTasks={computedTasks}
                            horizonMonths={data.meta.horizonMonths}
                            ventureStart={data.meta.start}
                            selectedId={selectedTaskId ?? undefined}
                            phases={data.phases}
                            onSelect={setSelectedTaskId}
                            onChangeTaskStart={handleChangeTaskStart}
                        />
                    )}

                    {/* Two-column layout */}
                    <div
                        className="grid gap-4"
                        style={{
                            gridTemplateColumns: leftPanelCollapsed
                                ? "32px 1fr"
                                : rightPanelCollapsed
                                ? "1fr 32px"
                                : "1fr 1fr",
                        }}
                    >
                        {/* Left Panel - Task Table */}
                        {leftPanelCollapsed ? (
                            <div
                                onClick={() => setLeftPanelCollapsed(false)}
                                className="w-8 bg-muted/30 hover:bg-muted/50 border-2 rounded-2xl cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 py-8"
                                title="Expand task table"
                            >
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                <div
                                    className="text-xs text-muted-foreground font-medium"
                                    style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                                >
                                    Task Table
                                </div>
                            </div>
                        ) : (
                            <Card className="rounded-2xl shadow-sm border-2">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base">Task Table</CardTitle>
                                        {!rightPanelCollapsed && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setLeftPanelCollapsed(true)}
                                                className="rounded-xl"
                                            >
                                                <ChevronLeft className="h-4 w-4 mr-1" />
                                                Collapse
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-6 pt-0">
                        <DataTable<Task>
                            title="Tasks (Gantt)"
                            rows={data.tasks}
                            setRows={setTasks}
                            addRow={() => {
                                const newId = getNextTaskId();
                                const palette = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#3b82f6", "#6366f1", "#8b5cf6"];
                                // Assign color to new task
                                setTaskColors(new Map(taskColors).set(newId, palette[data.tasks.length % palette.length]));
                                return {
                                    id: newId,
                                    name: "New Task",
                                    start: data.meta.start,
                                    duration: "1m",
                                    costOneOff: 0,
                                    costMonthly: 0,
                                    dependsOn: [],
                                };
                            }}
                            columns={[
                                {
                                    key: "id",
                                    header: "ID",
                                    width: "110px",
                                    render: (v, row) => (
                                        <button
                                            onClick={() => navigate(`/cost/${row.id}`)}
                                            className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                        >
                                            {v}
                                        </button>
                                    ),
                                },
                                {
                                    key: "color" as any,
                                    header: "Color",
                                    width: "80px",
                                    render: (_, row) => {
                                        const color = taskColors.get(row.id) || "#3b82f6";
                                        return (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="color"
                                                    value={color}
                                                    onChange={(e) => {
                                                        setTaskColors(new Map(taskColors).set(row.id, e.target.value));
                                                    }}
                                                    className="w-8 h-8 rounded cursor-pointer border"
                                                    title="Choose task color"
                                                />
                                            </div>
                                        );
                                    },
                                },
                                { key: "name", header: "Name", width: "260px", input: "text" },
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
                                    key: "count",
                                    header: "Count (headcount)",
                                    width: "140px",
                                    render: (v, row) => {
                                        return (
                                            <Input
                                                type="number"
                                                min={1}
                                                className="h-8 rounded-xl"
                                                value={v ?? 1}
                                                placeholder="1"
                                                onChange={(e) => {
                                                    const newCount = Math.max(1, parseInt(e.target.value) || 1);
                                                    setTasks(data.tasks.map((t) => (t.id === row.id ? { ...t, count: newCount } : t)));
                                                }}
                                            />
                                        );
                                    },
                                },
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
                        )}

                        {/* Right Panel - Cost Preview */}
                        {rightPanelCollapsed ? (
                            <div
                                onClick={() => setRightPanelCollapsed(false)}
                                className="w-8 bg-muted/30 hover:bg-muted/50 border-2 rounded-2xl cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 py-8"
                                title="Expand preview panel"
                            >
                                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                                <div
                                    className="text-xs text-muted-foreground font-medium"
                                    style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                                >
                                    Cost Preview
                                </div>
                            </div>
                        ) : (
                            <Card className="rounded-2xl shadow-sm border-2">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base">Cost Preview</CardTitle>
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center rounded-xl border">
                                                <Button
                                                    variant={costPreviewMode === "graph" ? "default" : "ghost"}
                                                    size="sm"
                                                    onClick={() => setCostPreviewMode("graph")}
                                                    className="rounded-l-xl rounded-r-none h-7 px-2"
                                                    title="Graph view"
                                                >
                                                    <BarChart3 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant={costPreviewMode === "table" ? "default" : "ghost"}
                                                    size="sm"
                                                    onClick={() => setCostPreviewMode("table")}
                                                    className="rounded-r-xl rounded-l-none h-7 px-2"
                                                    title="Table view"
                                                >
                                                    <TableIcon className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            {!leftPanelCollapsed && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setRightPanelCollapsed(true)}
                                                    className="rounded-xl"
                                                >
                                                    <ChevronRight className="h-4 w-4 ml-1" />
                                                    Collapse
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {costPreviewMode === "graph" && (
                                        <>
                                            {/* Cost Chart */}
                                            <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={previewData}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis
                                                    dataKey="month"
                                                    label={{ value: "Month", position: "insideBottom", offset: -5 }}
                                                />
                                                <YAxis
                                                    label={{ value: "Costs", angle: -90, position: "insideLeft" }}
                                                    tickFormatter={(v) => fmtCurrency(v, data.meta.currency)}
                                                />
                                                <RechartsTooltip
                                                    formatter={(value: number | undefined, name: string | undefined) => {
                                                        const labels: Record<string, string> = {
                                                            taskOneOff: "Task One-off",
                                                            taskMonthly: "Task Monthly",
                                                            fixedCosts: "Fixed Costs",
                                                            totalCosts: "Total Costs",
                                                        };
                                                        return [fmtCurrency(value || 0, data.meta.currency), labels[name || ""] || name || ""];
                                                    }}
                                                />
                                                <Legend />
                                                <Line
                                                    type="monotone"
                                                    dataKey="taskOneOff"
                                                    stroke="#f59e0b"
                                                    strokeWidth={2}
                                                    dot={false}
                                                    name="Task One-off"
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="taskMonthly"
                                                    stroke="#3b82f6"
                                                    strokeWidth={2}
                                                    dot={false}
                                                    name="Task Monthly"
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="fixedCosts"
                                                    stroke="#10b981"
                                                    strokeWidth={2}
                                                    dot={false}
                                                    name="Fixed Costs"
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="totalCosts"
                                                    stroke="#dc2626"
                                                    strokeWidth={3}
                                                    dot={false}
                                                    name="Total Costs"
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Summary Cards */}
                                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                                        <div className="rounded-lg border p-4">
                                            <p className="text-sm text-muted-foreground">Month 12 Costs</p>
                                            <p className="text-2xl font-semibold">
                                                {fmtCurrency(previewData[11]?.totalCosts || 0, data.meta.currency)}
                                            </p>
                                        </div>
                                        <div className="rounded-lg border p-4">
                                            <p className="text-sm text-muted-foreground">Total 5Y Costs</p>
                                            <p className="text-2xl font-semibold">
                                                {fmtCurrency(
                                                    previewData.slice(0, 60).reduce((sum, m) => sum + m.totalCosts, 0),
                                                    data.meta.currency
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                        </>
                                    )}

                                    {costPreviewMode === "table" && (
                                        <>
                                            {/* Tabular View */}
                                            <div>
                                        <h3 className="text-sm font-semibold mb-3">Monthly Breakdown</h3>
                                        <div className="rounded-lg border max-h-[400px] overflow-auto">
                                            <table className="w-full text-xs">
                                                <thead className="sticky top-0 bg-background border-b">
                                                    <tr>
                                                        {data.phases && data.phases.length > 0 && (
                                                            <th className="text-left p-2 font-medium">Phase</th>
                                                        )}
                                                        <th className="text-left p-2 font-medium">Month</th>
                                                        <th className="text-right p-2 font-medium">Task One-off</th>
                                                        <th className="text-right p-2 font-medium">Task Monthly</th>
                                                        <th className="text-right p-2 font-medium">Fixed Costs</th>
                                                        <th className="text-right p-2 font-medium">Total</th>
                                                        <th className="text-right p-2 font-medium">Cumulative</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(() => {
                                                        const phases = data.phases ?? [];
                                                        const hasPhases = phases.length > 0;

                                                        // Helper to get phase for a month
                                                        const getPhaseForMonth = (month: number) => {
                                                            if (!hasPhases) return null;
                                                            let currentMonth = 0;
                                                            for (let i = 0; i < phases.length; i++) {
                                                                const phase = phases[i]!;
                                                                const match = phase.duration.match(/^(\d+)([dwmy])$/);
                                                                let durationMonths = 0;
                                                                if (match) {
                                                                    const value = parseInt(match[1]!, 10);
                                                                    const unit = match[2]!;
                                                                    if (unit === "d") durationMonths = value / 30;
                                                                    else if (unit === "w") durationMonths = value / 4;
                                                                    else if (unit === "m") durationMonths = value;
                                                                    else if (unit === "y") durationMonths = value * 12;
                                                                } else {
                                                                    // Endless phase - extends to horizon
                                                                    durationMonths = data.meta.horizonMonths - currentMonth;
                                                                }
                                                                if (month >= currentMonth && month < currentMonth + durationMonths) {
                                                                    return { phase, index: i, startMonth: currentMonth, endMonth: currentMonth + durationMonths };
                                                                }
                                                                currentMonth += durationMonths;
                                                            }
                                                            return null;
                                                        };

                                                        const rows: JSX.Element[] = [];
                                                        let currentPhaseIndex = -1;
                                                        let phaseStartIdx = 0;
                                                        let phaseTaskOneOff = 0;
                                                        let phaseTaskMonthly = 0;
                                                        let phaseFixedCosts = 0;
                                                        let phaseTotalCosts = 0;

                                                        previewData.forEach((row, idx) => {
                                                            const monthNumber = idx;
                                                            const phaseInfo = getPhaseForMonth(monthNumber);
                                                            const phaseIndex = phaseInfo?.index ?? -1;
                                                            const cumulativeCosts = previewData
                                                                .slice(0, idx + 1)
                                                                .reduce((sum, r) => sum + r.totalCosts, 0);

                                                            // Check if we've moved to a new phase
                                                            if (hasPhases && phaseIndex !== currentPhaseIndex) {
                                                                // Add summary row for previous phase (if exists)
                                                                if (currentPhaseIndex >= 0) {
                                                                    rows.push(
                                                                        <tr key={`summary-${currentPhaseIndex}`} className="bg-muted/50 border-b-2 font-bold">
                                                                            {hasPhases && <td className="p-2"></td>}
                                                                            <td className="p-2">Phase Total</td>
                                                                            <td className="p-2 text-right">
                                                                                {fmtCurrency(phaseTaskOneOff, data.meta.currency)}
                                                                            </td>
                                                                            <td className="p-2 text-right">
                                                                                {fmtCurrency(phaseTaskMonthly, data.meta.currency)}
                                                                            </td>
                                                                            <td className="p-2 text-right">
                                                                                {fmtCurrency(phaseFixedCosts, data.meta.currency)}
                                                                            </td>
                                                                            <td className="p-2 text-right">
                                                                                {fmtCurrency(phaseTotalCosts, data.meta.currency)}
                                                                            </td>
                                                                            <td className="p-2 text-right"></td>
                                                                        </tr>
                                                                    );
                                                                }

                                                                // Reset phase accumulation
                                                                currentPhaseIndex = phaseIndex;
                                                                phaseStartIdx = idx;
                                                                phaseTaskOneOff = 0;
                                                                phaseTaskMonthly = 0;
                                                                phaseFixedCosts = 0;
                                                                phaseTotalCosts = 0;
                                                            }

                                                            // Accumulate phase totals
                                                            phaseTaskOneOff += row.taskOneOff;
                                                            phaseTaskMonthly += row.taskMonthly;
                                                            phaseFixedCosts += row.fixedCosts;
                                                            phaseTotalCosts += row.totalCosts;

                                                            // Add regular row
                                                            rows.push(
                                                                <tr key={idx} className="border-b hover:bg-muted/30">
                                                                    {hasPhases && idx === phaseStartIdx && (
                                                                        <td
                                                                            className="p-2 font-medium text-center align-top"
                                                                            style={{
                                                                                backgroundColor: `${phaseInfo?.phase.color}15`,
                                                                                color: phaseInfo?.phase.color,
                                                                            }}
                                                                            rowSpan={Math.ceil((phaseInfo?.endMonth ?? 0) - (phaseInfo?.startMonth ?? 0))}
                                                                        >
                                                                            {phaseInfo?.phase.name}
                                                                        </td>
                                                                    )}
                                                                    <td className="p-2">{idx + 1}</td>
                                                                    <td className="p-2 text-right">
                                                                        {fmtCurrency(row.taskOneOff, data.meta.currency)}
                                                                    </td>
                                                                    <td className="p-2 text-right">
                                                                        {fmtCurrency(row.taskMonthly, data.meta.currency)}
                                                                    </td>
                                                                    <td className="p-2 text-right">
                                                                        {fmtCurrency(row.fixedCosts, data.meta.currency)}
                                                                    </td>
                                                                    <td className="p-2 text-right font-medium">
                                                                        {fmtCurrency(row.totalCosts, data.meta.currency)}
                                                                    </td>
                                                                    <td className="p-2 text-right font-semibold">
                                                                        {fmtCurrency(cumulativeCosts, data.meta.currency)}
                                                                    </td>
                                                                </tr>
                                                            );

                                                            // Add summary row for last phase if this is the last row
                                                            if (idx === previewData.length - 1 && hasPhases && currentPhaseIndex >= 0) {
                                                                rows.push(
                                                                    <tr key={`summary-${currentPhaseIndex}`} className="bg-muted/50 border-b-2 font-bold">
                                                                        {hasPhases && <td className="p-2"></td>}
                                                                        <td className="p-2">Phase Total</td>
                                                                        <td className="p-2 text-right">
                                                                            {fmtCurrency(phaseTaskOneOff, data.meta.currency)}
                                                                        </td>
                                                                        <td className="p-2 text-right">
                                                                            {fmtCurrency(phaseTaskMonthly, data.meta.currency)}
                                                                        </td>
                                                                        <td className="p-2 text-right">
                                                                            {fmtCurrency(phaseFixedCosts, data.meta.currency)}
                                                                        </td>
                                                                        <td className="p-2 text-right">
                                                                            {fmtCurrency(phaseTotalCosts, data.meta.currency)}
                                                                        </td>
                                                                        <td className="p-2 text-right"></td>
                                                                    </tr>
                                                                );
                                                            }
                                                        });

                                                        return rows;
                                                    })()}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
        </div>
    );
}
