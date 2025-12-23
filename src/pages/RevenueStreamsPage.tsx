import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { VentureData, RevenueStream, TimelineEvent, Phase } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ChevronRight, GripVertical, ChevronLeft, BarChart3, Table as TableIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { uid, fmtCurrency } from "../utils/formatUtils";
import { calculateStreamMonthlyMetrics } from "../utils/logic";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type RevenueStreamsPageProps = {
    data: VentureData;
    setRevenueStreams: (streams: RevenueStream[]) => void;
    setTimeline: (timeline: TimelineEvent[]) => void;
};

type StreamWithColor = RevenueStream & { color?: string };

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

function DraggableTimeline({
    streams,
    horizonMonths,
    selectedId,
    timeline,
    phases,
    onSelect,
    onChangeStartMonth,
}: {
    streams: StreamWithColor[];
    horizonMonths: number;
    selectedId?: string;
    timeline: TimelineEvent[];
    phases?: Phase[];
    onSelect: (id: string) => void;
    onChangeStartMonth: (id: string, month: number) => void;
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
            onChangeStartMonth(draggingIdRef.current, newMonth);
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
    }, [draggingId, monthFromClientX, onChangeStartMonth, horizonMonths]);

    const getStreamMonth = (stream: RevenueStream) => {
        if (!stream.unlockEventId) return 0;
        const event = timeline.find((t) => t.id === stream.unlockEventId);
        return event?.month ?? 0;
    };

    const timelineHeight = Math.max(112, streams.length * 44 + 24);

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
                        <CardTitle className="text-base">Stream start timeline</CardTitle>
                        <div className="text-sm text-muted-foreground">
                            Drag a stream bar to change when revenue starts (snaps to months).
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
                        {streams.map((s, idx) => {
                            const isSel = s.id === selectedId;
                            const month = getStreamMonth(s);
                            const leftPct = (month / horizonMonths) * 100;
                            const color = (s as StreamWithColor).color || "#4f46e5";
                            const isDragging = draggingId === s.id;

                            let widthPct = 100 - leftPct;
                            if (s.duration) {
                                const match = s.duration.match(/^(\d+)([dwmy])$/);
                                if (match) {
                                    const value = parseInt(match[1]!, 10);
                                    const unit = match[2]!;
                                    let durationMonths = 0;
                                    if (unit === "d") durationMonths = value / 30;
                                    else if (unit === "w") durationMonths = value / 4;
                                    else if (unit === "m") durationMonths = value;
                                    else if (unit === "y") durationMonths = value * 12;

                                    widthPct = (durationMonths / horizonMonths) * 100;
                                }
                            }

                            return (
                                <div
                                    key={s.id}
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
                                            const currentMonth = getStreamMonth(s);
                                            grabOffsetMonthsRef.current = downMonth - currentMonth;
                                            setDraggingId(s.id);
                                            onSelect(s.id);
                                        }}
                                    >
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    </div>

                                    <div
                                        className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                                        onClick={() => onSelect(s.id)}
                                    >
                                        <div className="h-3 w-3 rounded-full" style={{ background: color }} />
                                        <div className="truncate text-sm font-medium">{s.name}</div>
                                        <Badge variant="outline">M{month}</Badge>
                                        {s.duration && (
                                            <Badge variant="secondary" className="text-xs">
                                                {s.duration}
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

export function RevenueStreamsPage({ data, setRevenueStreams, setTimeline }: RevenueStreamsPageProps) {
    const navigate = useNavigate();
    const streams = data.revenueStreams ?? [];
    const [selectedStreamId, setSelectedStreamId] = useState<string | null>(streams[0]?.id ?? null);
    const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
    const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
    const [revenuePreviewMode, setRevenuePreviewMode] = useState<"graph" | "table">("graph");

    // Load stream colors from localStorage
    const [streamColors, setStreamColors] = useState<Map<string, string>>(() => {
        const stored = localStorage.getItem("streamColors");
        if (stored) {
            try {
                const obj = JSON.parse(stored);
                return new Map(Object.entries(obj));
            } catch {
                return new Map();
            }
        }
        return new Map();
    });

    const streamsWithColors: StreamWithColor[] = useMemo(
        () => streams.map((s) => ({ ...s, color: streamColors.get(s.id) || "#4f46e5" })),
        [streams, streamColors]
    );

    // Calculate preview data for all streams
    const previewData = useMemo(() => {
        const result = [];

        for (let i = 0; i < data.meta.horizonMonths; i++) {
            let totalRevenue = 0;
            let totalCosts = 0;
            let totalNetProfit = 0;

            // Aggregate metrics from all streams
            for (const stream of streams) {
                const metrics = calculateStreamMonthlyMetrics(
                    stream,
                    i,
                    data.timeline,
                    "mode", // Default to mode for preview
                    1 // No multiplier for preview
                );

                totalRevenue += metrics.grossRevenue;
                totalCosts += metrics.totalCosts;
                totalNetProfit += metrics.netProfit;
            }

            result.push({
                month: i,
                revenue: totalRevenue,
                costs: totalCosts,
                netProfit: totalNetProfit,
            });
        }

        return result;
    }, [streams, data.timeline, data.meta.horizonMonths]);

    const handleAddNew = () => {
        // Create a new revenue stream with a unique ID
        const newId = `RS${Date.now()}`;
        const newStream: RevenueStream = {
            id: newId,
            name: "New Revenue Stream",
            pricingModel: "subscription",
            revenueUnit: "subscriber",
            unitEconomics: {
                pricePerUnit: { type: "triangular", min: 40, mode: 50, max: 60 },
                billingFrequency: "monthly",
                deliveryCostModel: {
                    type: "grossMargin",
                    marginPct: { type: "triangular", min: 70, mode: 80, max: 90 },
                },
            },
            adoptionModel: {
                initialUnits: 0,
                acquisitionRate: { type: "triangular", min: 20, mode: 30, max: 40 },
                churnRate: { type: "triangular", min: 3, mode: 5, max: 7 },
            },
            acquisitionCosts: {
                cacPerUnit: { type: "triangular", min: 80, mode: 100, max: 120 },
            },
        };

        setRevenueStreams([...streams, newStream]);
        navigate(`/revenue-stream/${newId}`);
    };

    const handleChangeStartMonth = useCallback(
        (id: string, month: number) => {
            const stream = streams.find((s) => s.id === id);
            if (!stream) return;

            const existingEvent = data.timeline?.find((t) => t.month === month);
            if (existingEvent) {
                const updatedStreams = streams.map((s) =>
                    s.id === id ? { ...s, unlockEventId: existingEvent.id } : s
                );
                setRevenueStreams(updatedStreams);
            } else {
                const newEvent: TimelineEvent = {
                    id: uid("TL"),
                    name: `Month ${month}`,
                    month,
                    description: `Auto-created for ${stream.name}`,
                };
                const updatedTimeline = [...(data.timeline ?? []), newEvent];
                setTimeline(updatedTimeline);

                const updatedStreams = streams.map((s) =>
                    s.id === id ? { ...s, unlockEventId: newEvent.id } : s
                );
                setRevenueStreams(updatedStreams);
            }
        },
        [streams, data.timeline, setRevenueStreams, setTimeline]
    );

    const getPricingModelColor = (model: string) => {
        switch (model) {
            case "subscription": return "bg-blue-100 text-blue-800";
            case "usage": return "bg-green-100 text-green-800";
            case "transaction": return "bg-purple-100 text-purple-800";
            case "license": return "bg-orange-100 text-orange-800";
            case "hybrid": return "bg-pink-100 text-pink-800";
            default: return "bg-gray-100 text-gray-800";
        }
    };

    const getUnlockEvent = (eventId?: string) => {
        if (!eventId) return "Month 0";
        const event = data.timeline?.find(e => e.id === eventId);
        return event ? `Month ${event.month}` : "Month 0";
    };

    return (
        <div className="space-y-4">
            {/* Draggable Timeline */}
            {streams.length > 0 && (
                <DraggableTimeline
                    streams={streamsWithColors}
                    horizonMonths={data.meta.horizonMonths}
                    selectedId={selectedStreamId ?? undefined}
                    timeline={data.timeline ?? []}
                    phases={data.phases}
                    onSelect={setSelectedStreamId}
                    onChangeStartMonth={handleChangeStartMonth}
                />
            )}

            {/* Two-column layout with collapsible panels */}
            <div
                className="grid gap-4 items-start"
                style={{
                    gridTemplateColumns: leftPanelCollapsed
                        ? "32px 1fr"
                        : rightPanelCollapsed
                          ? "1fr 32px"
                          : "1fr 1fr",
                }}
            >
                {/* Left Panel: Revenue Streams Table */}
                {leftPanelCollapsed ? (
                    <div className="h-full flex items-center justify-center bg-muted/30 rounded-2xl border border-border">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLeftPanelCollapsed(false)}
                            className="h-full w-full flex items-center justify-center"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Revenue Streams</CardTitle>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Manage your venture's revenue sources and pricing models
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button onClick={handleAddNew} className="rounded-2xl">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Revenue Stream
                                    </Button>
                                    {!rightPanelCollapsed && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setLeftPanelCollapsed(true)}
                                            className="rounded-2xl"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {streams.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-muted-foreground mb-4">No revenue streams yet</p>
                                    <Button onClick={handleAddNew} variant="outline" className="rounded-2xl">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Your First Revenue Stream
                                    </Button>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Pricing Model</TableHead>
                                            <TableHead>Unit Type</TableHead>
                                            <TableHead>Starts</TableHead>
                                            <TableHead className="w-[50px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {streams.map((stream) => (
                                            <TableRow key={stream.id} className="cursor-pointer hover:bg-muted/50">
                                                <TableCell>
                                                    <Link
                                                        to={`/revenue-stream/${stream.id}`}
                                                        className="font-medium hover:underline"
                                                    >
                                                        {stream.name}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={getPricingModelColor(stream.pricingModel)}>
                                                        {stream.pricingModel}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {stream.revenueUnit}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground text-sm">
                                                    {getUnlockEvent(stream.unlockEventId)}
                                                </TableCell>
                                                <TableCell>
                                                    <Link to={`/revenue-stream/${stream.id}`}>
                                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                    </Link>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Right Panel: Revenue Preview */}
                {rightPanelCollapsed ? (
                    <div className="h-full flex items-center justify-center bg-muted/30 rounded-2xl border border-border">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRightPanelCollapsed(false)}
                            className="h-full w-full flex items-center justify-center"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Revenue Preview</CardTitle>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Total revenue, costs, and net profit projections
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center rounded-xl border">
                                        <Button
                                            variant={revenuePreviewMode === "graph" ? "default" : "ghost"}
                                            size="sm"
                                            onClick={() => setRevenuePreviewMode("graph")}
                                            className="rounded-l-xl rounded-r-none h-7 px-2"
                                            title="Graph view"
                                        >
                                            <BarChart3 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant={revenuePreviewMode === "table" ? "default" : "ghost"}
                                            size="sm"
                                            onClick={() => setRevenuePreviewMode("table")}
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
                                            className="rounded-2xl"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {revenuePreviewMode === "graph" && (
                                <>
                            {/* Chart */}
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={previewData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="month"
                                            label={{ value: "Month", position: "insideBottom", offset: -5 }}
                                        />
                                        <YAxis
                                            label={{ value: "Amount", angle: -90, position: "insideLeft" }}
                                            tickFormatter={(value) => fmtCurrency(value, data.meta.currency)}
                                        />
                                        <Tooltip
                                            formatter={(value: number | undefined, name: string | undefined) => {
                                                const labels: Record<string, string> = {
                                                    revenue: "Revenue",
                                                    costs: "Costs",
                                                    netProfit: "Net Profit",
                                                };
                                                return [
                                                    fmtCurrency(value || 0, data.meta.currency),
                                                    labels[name || ""] || name || "",
                                                ];
                                            }}
                                        />
                                        <Legend />
                                        <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
                                        <Line type="monotone" dataKey="costs" stroke="#ef4444" strokeWidth={2} />
                                        <Line type="monotone" dataKey="netProfit" stroke="#3b82f6" strokeWidth={2} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm text-muted-foreground">Month 12 Revenue</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">
                                            {fmtCurrency(previewData[11]?.revenue || 0, data.meta.currency)}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm text-muted-foreground">Total 5Y Revenue</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">
                                            {fmtCurrency(
                                                previewData.slice(0, 60).reduce((sum, d) => sum + d.revenue, 0),
                                                data.meta.currency
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                                </>
                            )}

                            {revenuePreviewMode === "table" && (
                                <>
                            {/* Monthly Breakdown Table */}
                            <div>
                                <h3 className="text-sm font-medium mb-2">Monthly Breakdown</h3>
                                <div className="max-h-96 overflow-y-auto border rounded-lg">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-background">
                                            <TableRow>
                                                {data.phases && data.phases.length > 0 && (
                                                    <TableHead>Phase</TableHead>
                                                )}
                                                <TableHead>Month</TableHead>
                                                <TableHead className="text-right">Revenue</TableHead>
                                                <TableHead className="text-right">Costs</TableHead>
                                                <TableHead className="text-right">Net Profit</TableHead>
                                                <TableHead className="text-right">Cumulative</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
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
                                                let phaseRevenue = 0;
                                                let phaseCosts = 0;
                                                let phaseNetProfit = 0;

                                                previewData.forEach((row, idx) => {
                                                    const monthNumber = idx;
                                                    const phaseInfo = getPhaseForMonth(monthNumber);
                                                    const phaseIndex = phaseInfo?.index ?? -1;
                                                    const cumulative = previewData
                                                        .slice(0, idx + 1)
                                                        .reduce((sum, d) => sum + d.netProfit, 0);

                                                    // Check if we've moved to a new phase
                                                    if (hasPhases && phaseIndex !== currentPhaseIndex) {
                                                        // Add summary row for previous phase (if exists)
                                                        if (currentPhaseIndex >= 0) {
                                                            rows.push(
                                                                <TableRow key={`summary-${currentPhaseIndex}`} className="bg-muted/50 border-b-2 font-bold">
                                                                    {hasPhases && <TableCell></TableCell>}
                                                                    <TableCell>Phase Total</TableCell>
                                                                    <TableCell className="text-right">
                                                                        {fmtCurrency(phaseRevenue, data.meta.currency)}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {fmtCurrency(phaseCosts, data.meta.currency)}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {fmtCurrency(phaseNetProfit, data.meta.currency)}
                                                                    </TableCell>
                                                                    <TableCell className="text-right"></TableCell>
                                                                </TableRow>
                                                            );
                                                        }

                                                        // Reset phase accumulation
                                                        currentPhaseIndex = phaseIndex;
                                                        phaseStartIdx = idx;
                                                        phaseRevenue = 0;
                                                        phaseCosts = 0;
                                                        phaseNetProfit = 0;
                                                    }

                                                    // Accumulate phase totals
                                                    phaseRevenue += row.revenue;
                                                    phaseCosts += row.costs;
                                                    phaseNetProfit += row.netProfit;

                                                    // Add regular row
                                                    rows.push(
                                                        <TableRow key={row.month}>
                                                            {hasPhases && idx === phaseStartIdx && (
                                                                <TableCell
                                                                    className="font-medium text-center align-top"
                                                                    style={{
                                                                        backgroundColor: `${phaseInfo?.phase.color}15`,
                                                                        color: phaseInfo?.phase.color,
                                                                    }}
                                                                    rowSpan={Math.ceil((phaseInfo?.endMonth ?? 0) - (phaseInfo?.startMonth ?? 0))}
                                                                >
                                                                    {phaseInfo?.phase.name}
                                                                </TableCell>
                                                            )}
                                                            <TableCell>M{row.month}</TableCell>
                                                            <TableCell className="text-right">
                                                                {fmtCurrency(row.revenue, data.meta.currency)}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {fmtCurrency(row.costs, data.meta.currency)}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {fmtCurrency(row.netProfit, data.meta.currency)}
                                                            </TableCell>
                                                            <TableCell className="text-right font-medium">
                                                                {fmtCurrency(cumulative, data.meta.currency)}
                                                            </TableCell>
                                                        </TableRow>
                                                    );

                                                    // Add summary row for last phase if this is the last row
                                                    if (idx === previewData.length - 1 && hasPhases && currentPhaseIndex >= 0) {
                                                        rows.push(
                                                            <TableRow key={`summary-${currentPhaseIndex}`} className="bg-muted/50 border-b-2 font-bold">
                                                                {hasPhases && <TableCell></TableCell>}
                                                                <TableCell>Phase Total</TableCell>
                                                                <TableCell className="text-right">
                                                                    {fmtCurrency(phaseRevenue, data.meta.currency)}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    {fmtCurrency(phaseCosts, data.meta.currency)}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    {fmtCurrency(phaseNetProfit, data.meta.currency)}
                                                                </TableCell>
                                                                <TableCell className="text-right"></TableCell>
                                                            </TableRow>
                                                        );
                                                    }
                                                });

                                                return rows;
                                            })()}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
