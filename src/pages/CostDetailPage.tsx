import { useParams, useNavigate } from "react-router-dom";
import { useState, useMemo, useRef, useCallback } from "react";
import type { VentureData, Task, CountSchedulePoint, Phase } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, BarChart3, GripVertical } from "lucide-react";
import { fmtCurrency } from "../utils/formatUtils";
import { computeTaskDates } from "../utils/modelEngine";
import { monthIndexFromStart, addMonths } from "../utils/dateUtils";
import { Line, LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";

type CostDetailPageProps = {
    data: VentureData;
    setTasks: (tasks: Task[]) => void;
};

export function CostDetailPage({ data, setTasks }: CostDetailPageProps) {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const task = data.tasks.find((t) => t.id === id);

    if (!task) {
        return (
            <div className="space-y-4">
                <Button onClick={() => navigate("/costs")} variant="outline" className="rounded-2xl">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Costs
                </Button>
                <Card className="rounded-2xl shadow-sm">
                    <CardContent className="p-6">
                        <p className="text-muted-foreground">Task not found</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const updateTask = (updates: Partial<Task>) => {
        setTasks(data.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    };

    const phases = data.phases ?? [];
    const countSchedule = task.countSchedule ?? [];

    // Helper to convert phase to month
    const getPhaseStartMonth = (phaseId: string): number => {
        let currentMonth = 0;
        for (const phase of phases) {
            if (phase.id === phaseId) return currentMonth;
            const match = phase.duration.match(/^(\d+)([dwmy])$/);
            if (match) {
                const value = parseInt(match[1]!, 10);
                const unit = match[2]!;
                if (unit === "d") currentMonth += value / 30;
                else if (unit === "w") currentMonth += value / 4;
                else if (unit === "m") currentMonth += value;
                else if (unit === "y") currentMonth += value * 12;
            }
        }
        return currentMonth;
    };

    // Helper to get count at a specific month
    const getCountAtMonth = (month: number): number => {
        const baseCount = task.count ?? 1;
        if (countSchedule.length === 0) return baseCount;
        const sortedSchedule = [...countSchedule].sort((a, b) => a.month - b.month);
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

    // Calculate cost over time for visualization
    const computedTasks = useMemo(() => computeTaskDates(data.tasks, data.meta.start), [data.tasks, data.meta.start]);
    const computed = computedTasks.find((t) => t.id === task.id);

    const costData = useMemo(() => {
        if (!computed?.computedStart) return [];

        const startMonth = monthIndexFromStart(data.meta.start, computed.computedStart);
        const endMonth = computed.computedEnd
            ? monthIndexFromStart(data.meta.start, computed.computedEnd)
            : data.meta.horizonMonths;

        const result = [];
        for (let m = 0; m < data.meta.horizonMonths; m++) {
            const count = getCountAtMonth(m);
            let oneOff = 0;
            let monthly = 0;

            if (m === startMonth) {
                oneOff = task.costOneOff * count;
            }

            if (m >= startMonth && m <= endMonth) {
                monthly = task.costMonthly * count;
            }

            result.push({
                month: m,
                count,
                oneOff,
                monthly,
                total: oneOff + monthly,
            });
        }

        return result;
    }, [task, computed, data.meta, countSchedule]);

    const handleAddSchedulePoint = () => {
        const newPoint: CountSchedulePoint = {
            month: 0,
            count: task.count ?? 1,
        };
        updateTask({ countSchedule: [...countSchedule, newPoint] });
    };

    const handleUpdateSchedulePoint = (index: number, updates: Partial<CountSchedulePoint>) => {
        const newSchedule = [...countSchedule];
        newSchedule[index] = { ...newSchedule[index]!, ...updates };
        updateTask({ countSchedule: newSchedule });
    };

    const handleDeleteSchedulePoint = (index: number) => {
        updateTask({ countSchedule: countSchedule.filter((_, i) => i !== index) });
    };

    const handleSetPhaseBinding = (index: number, phaseId: string) => {
        const month = getPhaseStartMonth(phaseId);
        handleUpdateSchedulePoint(index, { month });
    };

    // Sort schedule by month for display
    const sortedSchedule = [...countSchedule].sort((a, b) => a.month - b.month);

    // Timeline drag handling
    const [isDragging, setIsDragging] = useState(false);
    const trackRef = useRef<HTMLDivElement | null>(null);

    const handleTimelineDrag = useCallback(
        (clientX: number) => {
            if (!trackRef.current) return;
            const rect = trackRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
            const month = Math.round((x / rect.width) * data.meta.horizonMonths);
            const newDate = addMonths(data.meta.start, Math.max(0, Math.min(month, data.meta.horizonMonths)));
            updateTask({ start: newDate });
        },
        [data.meta.horizonMonths, data.meta.start, updateTask]
    );

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

    const taskStartMonth = computed?.computedStart ? monthIndexFromStart(data.meta.start, computed.computedStart) : 0;
    const taskDurationMonths = task.duration ? durationToMonths(task.duration) : data.meta.horizonMonths;

    return (
        <div className="space-y-4">
            {/* Back button */}
            <Button onClick={() => navigate("/costs")} variant="outline" className="rounded-2xl">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Costs
            </Button>

            {/* Basic Info */}
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg">Task Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Task ID</Label>
                            <Input value={task.id} disabled className="rounded-xl bg-muted" />
                        </div>
                        <div>
                            <Label>Task Name</Label>
                            <Input
                                value={task.name}
                                onChange={(e) => updateTask({ name: e.target.value })}
                                className="rounded-xl"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label>One-off Cost</Label>
                            <Input
                                type="number"
                                value={task.costOneOff}
                                onChange={(e) => updateTask({ costOneOff: parseFloat(e.target.value) || 0 })}
                                className="rounded-xl"
                            />
                        </div>
                        <div>
                            <Label>Monthly Cost (per unit)</Label>
                            <Input
                                type="number"
                                value={task.costMonthly}
                                onChange={(e) => updateTask({ costMonthly: parseFloat(e.target.value) || 0 })}
                                className="rounded-xl"
                            />
                        </div>
                        <div>
                            <Label>Base Count</Label>
                            <Input
                                type="number"
                                min={1}
                                value={task.count ?? 1}
                                onChange={(e) => updateTask({ count: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="rounded-xl"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label>Start Date</Label>
                            <Input
                                type="date"
                                value={task.start || ""}
                                onChange={(e) => updateTask({ start: e.target.value })}
                                className="rounded-xl"
                                disabled={task.dependsOn && task.dependsOn.length > 0}
                                title={task.dependsOn && task.dependsOn.length > 0 ? "Start date is calculated from dependencies" : ""}
                            />
                        </div>
                        <div>
                            <Label>Duration (e.g., 6m, 1y)</Label>
                            <Input
                                value={task.duration || ""}
                                placeholder="Empty = ongoing task"
                                onChange={(e) => updateTask({ duration: e.target.value })}
                                className="rounded-xl"
                            />
                        </div>
                        <div>
                            <Label>Dependencies</Label>
                            <Input
                                value={(task.dependsOn ?? []).join(", ")}
                                placeholder="e.g., T1, T2e+2w"
                                onChange={(e) => {
                                    const deps = e.target.value
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean);
                                    updateTask({ dependsOn: deps });
                                }}
                                className="rounded-xl"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Timeline View */}
            <Card className="rounded-2xl shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-base">Task Timeline</CardTitle>
                            <div className="text-sm text-muted-foreground">
                                Drag the task bar to change when it starts
                            </div>
                        </div>
                        <Badge variant="secondary">Horizon: {data.meta.horizonMonths} months</Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div
                        ref={trackRef}
                        className="relative w-full rounded-2xl border bg-background overflow-visible"
                        style={{ height: "80px" }}
                        onMouseMove={(e) => {
                            if (isDragging && !task.dependsOn?.length) {
                                handleTimelineDrag(e.clientX);
                            }
                        }}
                        onMouseUp={() => setIsDragging(false)}
                        onMouseLeave={() => setIsDragging(false)}
                    >
                        {/* Phase backgrounds */}
                        {phases.map((phase, idx) => {
                            let startMonth = 0;
                            for (let i = 0; i < idx; i++) {
                                const prevPhase = phases[i]!;
                                startMonth += durationToMonths(prevPhase.duration);
                            }

                            let durationMonths = durationToMonths(phase.duration);
                            if (durationMonths === 0) {
                                durationMonths = data.meta.horizonMonths - startMonth;
                            }
                            const leftPct = (startMonth / data.meta.horizonMonths) * 100;
                            const widthPct = (durationMonths / data.meta.horizonMonths) * 100;
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

                        {/* Month markers */}
                        <div className="absolute inset-0 pointer-events-none opacity-60">
                            {Array.from({ length: data.meta.horizonMonths + 1 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="absolute top-0 bottom-0 w-px bg-border"
                                    style={{ left: `${(i / data.meta.horizonMonths) * 100}%` }}
                                />
                            ))}
                        </div>

                        {/* Task bar */}
                        <div
                            className={`absolute h-10 rounded-2xl border flex items-center justify-between px-3 select-none ${
                                task.dependsOn?.length ? "opacity-50 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
                            }`}
                            style={{
                                top: "20px",
                                left: `${(taskStartMonth / data.meta.horizonMonths) * 100}%`,
                                width: `${Math.min((taskDurationMonths / data.meta.horizonMonths) * 100, 100 - (taskStartMonth / data.meta.horizonMonths) * 100)}%`,
                                background: "#3b82f615",
                                borderColor: "#3b82f655",
                                transition: isDragging ? "none" : "all 0.2s",
                            }}
                            onMouseDown={(e) => {
                                if (!task.dependsOn?.length) {
                                    e.preventDefault();
                                    setIsDragging(true);
                                }
                            }}
                        >
                            <div className="flex items-center justify-center w-6 h-6 -ml-2">
                                {!task.dependsOn?.length && <GripVertical className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="h-3 w-3 rounded-full" style={{ background: "#3b82f6" }} />
                                <div className="truncate text-sm font-medium">{task.name}</div>
                                <Badge variant="outline">M{taskStartMonth}</Badge>
                                {task.duration && (
                                    <Badge variant="secondary" className="text-xs">
                                        {task.duration}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Month ticks */}
                    <div className="relative w-full mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            {Array.from({ length: Math.min(11, data.meta.horizonMonths + 1) }).map((_, i) => {
                                const month = Math.round((i / 10) * data.meta.horizonMonths);
                                return (
                                    <div key={i} className="flex flex-col items-center">
                                        <div className="h-2 w-px bg-border" />
                                        <div className="mt-1">M{month}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Count Schedule */}
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Count Schedule</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Adjust headcount/resource count at different points in time
                            </p>
                        </div>
                        <Button onClick={handleAddSchedulePoint} className="rounded-2xl">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Schedule Point
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {sortedSchedule.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-muted-foreground mb-4">
                                No schedule points defined. Count will remain at {task.count ?? 1} throughout.
                            </p>
                            <Button onClick={handleAddSchedulePoint} variant="outline" className="rounded-2xl">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Your First Schedule Point
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sortedSchedule.map((point, idx) => {
                                // Find original index
                                const originalIndex = countSchedule.findIndex(
                                    (p) => p.month === point.month && p.count === point.count
                                );

                                // Find which phase this month falls in
                                const matchingPhase = phases.find((phase) => {
                                    const phaseStart = getPhaseStartMonth(phase.id);
                                    return Math.abs(phaseStart - point.month) < 0.5;
                                });

                                return (
                                    <Card key={idx} className="rounded-xl border-2">
                                        <CardContent className="p-4">
                                            <div className="flex items-end gap-4">
                                                <div className="flex-1">
                                                    <Label>Month</Label>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        max={data.meta.horizonMonths}
                                                        value={point.month}
                                                        onChange={(e) =>
                                                            handleUpdateSchedulePoint(originalIndex, {
                                                                month: Math.max(
                                                                    0,
                                                                    Math.min(
                                                                        data.meta.horizonMonths,
                                                                        parseFloat(e.target.value) || 0
                                                                    )
                                                                ),
                                                            })
                                                        }
                                                        className="rounded-xl"
                                                    />
                                                </div>

                                                {phases.length > 0 && (
                                                    <div className="flex-1">
                                                        <Label>Or bind to Phase</Label>
                                                        <Select
                                                            value={matchingPhase?.id ?? "custom"}
                                                            onValueChange={(phaseId) => {
                                                                if (phaseId !== "custom") {
                                                                    handleSetPhaseBinding(originalIndex, phaseId);
                                                                }
                                                            }}
                                                        >
                                                            <SelectTrigger className="rounded-xl">
                                                                <SelectValue placeholder="Custom month" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="custom">Custom month</SelectItem>
                                                                {phases.map((phase) => (
                                                                    <SelectItem key={phase.id} value={phase.id}>
                                                                        {phase.name} (M{Math.round(getPhaseStartMonth(phase.id))})
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}

                                                <div className="flex-1">
                                                    <Label>New Count</Label>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        value={point.count}
                                                        onChange={(e) =>
                                                            handleUpdateSchedulePoint(originalIndex, {
                                                                count: Math.max(0, parseInt(e.target.value) || 0),
                                                            })
                                                        }
                                                        className="rounded-xl"
                                                    />
                                                </div>

                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteSchedulePoint(originalIndex)}
                                                    className="rounded-xl text-destructive hover:bg-destructive/10"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Cost Preview */}
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg">Cost Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Chart */}
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={costData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" label={{ value: "Month", position: "insideBottom", offset: -5 }} />
                                <YAxis
                                    yAxisId="cost"
                                    label={{ value: "Cost", angle: -90, position: "insideLeft" }}
                                    tickFormatter={(v) => fmtCurrency(v, data.meta.currency)}
                                />
                                <YAxis
                                    yAxisId="count"
                                    orientation="right"
                                    label={{ value: "Count", angle: 90, position: "insideRight" }}
                                />
                                <Tooltip
                                    formatter={(value: number, name: string) => {
                                        if (name === "count") return [value, "Count"];
                                        return [fmtCurrency(value, data.meta.currency), name];
                                    }}
                                />
                                <Legend />
                                <Line
                                    yAxisId="count"
                                    type="stepAfter"
                                    dataKey="count"
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    dot={false}
                                    name="Count"
                                />
                                <Line
                                    yAxisId="cost"
                                    type="monotone"
                                    dataKey="monthly"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={false}
                                    name="Monthly Cost"
                                />
                                <Line
                                    yAxisId="cost"
                                    type="monotone"
                                    dataKey="total"
                                    stroke="#dc2626"
                                    strokeWidth={3}
                                    dot={false}
                                    name="Total Cost"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Summary */}
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-lg border p-4">
                            <p className="text-sm text-muted-foreground">Peak Monthly Cost</p>
                            <p className="text-2xl font-semibold">
                                {fmtCurrency(
                                    Math.max(...costData.map((d) => d.monthly)),
                                    data.meta.currency
                                )}
                            </p>
                        </div>
                        <div className="rounded-lg border p-4">
                            <p className="text-sm text-muted-foreground">Total Cost (All Months)</p>
                            <p className="text-2xl font-semibold">
                                {fmtCurrency(
                                    costData.reduce((sum, d) => sum + d.total, 0),
                                    data.meta.currency
                                )}
                            </p>
                        </div>
                        <div className="rounded-lg border p-4">
                            <p className="text-sm text-muted-foreground">Peak Count</p>
                            <p className="text-2xl font-semibold">
                                {Math.max(...costData.map((d) => d.count))}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
