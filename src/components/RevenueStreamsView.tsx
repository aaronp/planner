import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Trash2, Plus, Copy, Palette, GripVertical, HelpCircle, AlertTriangle } from "lucide-react";
import type { RevenueStream, Market, TimelineEvent, PricingModel, Distribution, Assumption, Risk } from "../types";
import { uid } from "../utils/formatUtils";
import { DataTable } from "./DataTable";

type RevenueStreamsViewProps = {
    revenueStreams: RevenueStream[];
    markets: Market[];
    timeline: TimelineEvent[];
    onChange: (streams: RevenueStream[]) => void;
    onChangeTimeline?: (timeline: TimelineEvent[]) => void;
    horizonMonths?: number;
};

// Extended stream type with UI-specific properties
type StreamWithColor = RevenueStream & { color?: string };

type Warning = {
    key: string;
    label: string;
    severity: "warn" | "info";
};

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function createSimpleDistribution(value: number): Distribution {
    return { type: "triangular", min: value, mode: value, max: value };
}

function getDistributionMode(dist: Distribution | undefined): number {
    if (!dist) return 0;
    return dist.mode ?? (dist.min + dist.max) / 2;
}

function HelpLabel({ label, help }: { label: string; help: string }) {
    return (
        <div className="flex items-center gap-1">
            <Label>{label}</Label>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button type="button" className="inline-flex items-center" aria-label={`Help: ${label}`}>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                    <div className="text-sm">{help}</div>
                </TooltipContent>
            </Tooltip>
        </div>
    );
}

function computeWarnings(stream: RevenueStream): Warning[] {
    const w: Warning[] = [];

    // Check delivery cost model
    if (stream.unitEconomics.deliveryCostModel.type === "grossMargin") {
        const gm = getDistributionMode(stream.unitEconomics.deliveryCostModel.marginPct);
        if (gm < 0 || gm > 100) w.push({ key: "gm-range", label: "Gross margin out of range", severity: "warn" });
        else if (gm < 30) w.push({ key: "gm-low", label: "Low gross margin", severity: "info" });
    } else {
        const costPerUnit = getDistributionMode(stream.unitEconomics.deliveryCostModel.costPerUnit);
        const pricePerUnit = getDistributionMode(stream.unitEconomics.pricePerUnit);
        if (costPerUnit < 0) w.push({ key: "cost-neg", label: "Delivery cost is negative", severity: "warn" });
        if (costPerUnit >= pricePerUnit) w.push({ key: "cost-high", label: "Delivery cost >= price", severity: "warn" });
    }

    const maxUnits = stream.adoptionModel.maxUnits;
    if (typeof maxUnits === "number" && stream.adoptionModel.initialUnits > maxUnits) {
        w.push({ key: "som-initial", label: "Initial units exceed SOM cap", severity: "warn" });
    }

    const cacMode = getDistributionMode(stream.acquisitionCosts.cacPerUnit);
    if (cacMode < 0) w.push({ key: "cac-neg", label: "CAC is negative", severity: "warn" });

    const priceMode = getDistributionMode(stream.unitEconomics.pricePerUnit);
    if (priceMode <= 0) w.push({ key: "price-zero", label: "Price is zero or negative", severity: "warn" });

    return w;
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
    onSelect,
    onChangeStartMonth,
}: {
    streams: StreamWithColor[];
    horizonMonths: number;
    selectedId?: string;
    timeline: TimelineEvent[];
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

    // Set up drag handlers when dragging starts
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
    }, [draggingId, monthFromClientX, onChangeStartMonth]);

    // Get month for stream
    const getStreamMonth = (stream: RevenueStream) => {
        if (!stream.unlockEventId) return 0;
        const event = timeline.find((t) => t.id === stream.unlockEventId);
        return event?.month ?? 0;
    };

    // Calculate dynamic height based on number of streams
    const timelineHeight = Math.max(112, streams.length * 44 + 24); // 44px per stream + padding

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
                    {/* Month grid lines */}
                    <div className="absolute inset-0 pointer-events-none opacity-60">
                        {Array.from({ length: horizonMonths + 1 }).map((_, i) => (
                            <div
                                key={i}
                                className="absolute top-0 bottom-0 w-px bg-border"
                                style={{ left: `${(i / horizonMonths) * 100}%` }}
                            />
                        ))}
                    </div>

                    {/* Stream bars */}
                    <div className="absolute inset-0 p-3">
                        {streams.map((s, idx) => {
                            const isSel = s.id === selectedId;
                            const month = getStreamMonth(s);
                            const leftPct = (month / horizonMonths) * 100;
                            const color = (s as StreamWithColor).color || "#4f46e5";
                            const isDragging = draggingId === s.id;

                            // Calculate width based on duration
                            let widthPct = 100 - leftPct; // Default: extend to end
                            if (s.duration) {
                                // Parse duration (e.g., "12m" -> 12 months)
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
                                        top: `${idx * 44 + 8}px`,
                                        left: `${leftPct}%`,
                                        width: `${widthPct}%`,
                                        background: `${color}15`,
                                        borderColor: `${color}55`,
                                        transition: isDragging ? "none" : "all 0.2s",
                                    }}
                                >
                                    {/* Grip icon on the left - draggable */}
                                    <div
                                        className={
                                            "flex items-center justify-center w-8 h-8 -ml-2 cursor-grab active:cursor-grabbing hover:bg-black/5 rounded-xl transition-colors " +
                                            (isDragging ? "cursor-grabbing" : "")
                                        }
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            // Avoid a "jump" by preserving where in the bar the user grabbed (in months).
                                            const downMonth = monthFromClientX(e.clientX);
                                            const currentMonth = getStreamMonth(s);
                                            grabOffsetMonthsRef.current = downMonth - currentMonth;
                                            setDraggingId(s.id);
                                            onSelect(s.id);
                                        }}
                                    >
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    </div>

                                    {/* Stream content - clickable to select */}
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

function DistInput({
    label,
    help,
    value,
    onChange,
    suffix,
    hint,
}: {
    label: string;
    help?: string;
    value: Distribution;
    onChange: (v: Distribution) => void;
    suffix?: string;
    hint?: string;
}) {
    const [advanced, setAdvanced] = useState(false);

    useEffect(() => {
        const isAdv = !(value.min === value.mode && value.mode === value.max);
        if (!advanced && isAdv) setAdvanced(true);
    }, [value.min, value.mode, value.max, advanced]);

    return (
        <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
                <div>
                    {help ? (
                        <HelpLabel label={label} help={help} />
                    ) : (
                        <Label className="text-sm">{label}</Label>
                    )}
                    {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Advanced</span>
                    <Switch checked={advanced} onCheckedChange={setAdvanced} />
                </div>
            </div>

            {!advanced ? (
                <div className="flex items-center gap-2">
                    <Input
                        inputMode="decimal"
                        value={String(value.mode ?? value.min)}
                        onChange={(e) => {
                            const x = Number(e.target.value);
                            if (Number.isFinite(x)) onChange({ ...value, min: x, mode: x, max: x });
                        }}
                    />
                    {suffix ? <div className="text-sm text-muted-foreground">{suffix}</div> : null}
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                            Min{suffix ? ` (${suffix})` : ""}
                        </Label>
                        <Input
                            inputMode="decimal"
                            value={String(value.min)}
                            onChange={(e) => onChange({ ...value, min: Number(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                            Likely{suffix ? ` (${suffix})` : ""}
                        </Label>
                        <Input
                            inputMode="decimal"
                            value={String(value.mode ?? value.min)}
                            onChange={(e) => onChange({ ...value, mode: Number(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                            Max{suffix ? ` (${suffix})` : ""}
                        </Label>
                        <Input
                            inputMode="decimal"
                            value={String(value.max)}
                            onChange={(e) => onChange({ ...value, max: Number(e.target.value) })}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function WarningStrip({ warnings }: { warnings: Warning[] }) {
    if (!warnings.length) return null;
    return (
        <div className="rounded-2xl border p-3 bg-muted/30">
            <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Modelling warnings
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
                {warnings.map((w) => (
                    <Badge key={w.key} variant={w.severity === "warn" ? "destructive" : "secondary"}>
                        {w.label}
                    </Badge>
                ))}
            </div>
        </div>
    );
}

function StreamEditor({
    stream,
    onUpdate,
    markets,
    timeline,
    streamColor,
    onColorChange,
}: {
    stream: RevenueStream;
    onUpdate: (s: RevenueStream) => void;
    markets: Market[];
    timeline: TimelineEvent[];
    streamColor: string;
    onColorChange: (color: string) => void;
}) {
    const warnings = useMemo(() => computeWarnings(stream), [stream]);
    const selectedMarket = markets.find((m) => m.id === stream.marketId);

    return (
        <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            {stream.name}
                            {warnings.slice(0, 2).map((w) => (
                                <Badge key={w.key} variant={w.severity === "warn" ? "destructive" : "secondary"}>
                                    {w.severity === "warn" ? "⚠" : "i"} {w.label}
                                </Badge>
                            ))}
                        </CardTitle>
                        <div className="text-sm text-muted-foreground">
                            Capture unit economics, growth, and stream-specific costs.
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 rounded-2xl border px-3 py-2">
                            <Palette className="h-4 w-4" />
                            <input
                                aria-label="Stream color"
                                type="color"
                                value={streamColor}
                                onChange={(e) => onColorChange(e.target.value)}
                                className="h-6 w-10 bg-transparent border-0 p-0"
                            />
                            <div className="text-xs text-muted-foreground">{streamColor}</div>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <WarningStrip warnings={warnings} />

                <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="grid w-full grid-cols-6 rounded-2xl">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="assumptions">Assumptions & Risks</TabsTrigger>
                        <TabsTrigger value="market">Market</TabsTrigger>
                        <TabsTrigger value="pricing">Pricing</TabsTrigger>
                        <TabsTrigger value="growth">Growth</TabsTrigger>
                        <TabsTrigger value="costs">Costs</TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Overview */}
                    <TabsContent value="overview" className="mt-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <HelpLabel
                                    label="Name"
                                    help="A short label for this revenue stream (e.g. 'SaaS Pro Tier', 'Transaction Fees', 'Enterprise Licence')."
                                />
                                <Input value={stream.name} onChange={(e) => onUpdate({ ...stream, name: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <HelpLabel
                                    label="Revenue unit"
                                    help="The 'countable thing' you earn money per. Examples: 'seat / month', 'trade', 'API call', 'org / year'. Keep it consistent with CAC and variable costs."
                                />
                                <Input
                                    value={stream.revenueUnit}
                                    onChange={(e) => onUpdate({ ...stream, revenueUnit: e.target.value })}
                                    placeholder="e.g. seat / month"
                                />
                            </div>
                            <div className="space-y-2">
                                <HelpLabel
                                    label="Pricing model"
                                    help="How customers pay: subscription, usage, transaction fees, licence, or a mix (hybrid)."
                                />
                                <Select
                                    value={stream.pricingModel}
                                    onValueChange={(v) => onUpdate({ ...stream, pricingModel: v as PricingModel })}
                                >
                                    <SelectTrigger className="rounded-2xl">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="subscription">Subscription</SelectItem>
                                        <SelectItem value="usage">Usage</SelectItem>
                                        <SelectItem value="transaction">Transaction</SelectItem>
                                        <SelectItem value="license">License</SelectItem>
                                        <SelectItem value="hybrid">Hybrid</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <HelpLabel
                                    label="Start timeline event"
                                    help="When this stream begins generating revenue. Link to a timeline event or leave blank for Month 0."
                                />
                                <Select
                                    value={stream.unlockEventId ?? "none"}
                                    onValueChange={(value) =>
                                        onUpdate({ ...stream, unlockEventId: value === "none" ? undefined : value })
                                    }
                                >
                                    <SelectTrigger className="rounded-2xl">
                                        <SelectValue placeholder="No timeline event" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No timeline event (Month 0)</SelectItem>
                                        {timeline.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.name} (Month {t.month})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <HelpLabel
                                    label="Duration"
                                    help="How long this revenue stream runs (e.g., '12m', '24m'). Leave blank for infinite duration (extends to horizon)."
                                />
                                <Input
                                    value={stream.duration ?? ""}
                                    onChange={(e) => onUpdate({ ...stream, duration: e.target.value || undefined })}
                                    placeholder="e.g., 12m, 24m (blank = infinite)"
                                />
                            </div>
                        </div>
                        <Separator className="my-5" />
                        <div className="text-sm text-muted-foreground">
                            Tip: keep your <span className="font-medium">Revenue unit</span> consistent with CAC and
                            variable costs.
                        </div>
                    </TabsContent>

                    {/* Tab 2: Assumptions & Risks */}
                    <TabsContent value="assumptions" className="mt-4">
                        <Tabs defaultValue="assumptions" className="w-full">
                            <TabsList className="rounded-2xl mb-4">
                                <TabsTrigger value="assumptions" className="rounded-2xl">
                                    Assumptions
                                </TabsTrigger>
                                <TabsTrigger value="risks" className="rounded-2xl">
                                    Risks
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="assumptions">
                                <DataTable<Assumption>
                                    title=""
                                    rows={stream.assumptions ?? []}
                                    setRows={(assumptions) => onUpdate({ ...stream, assumptions })}
                                    addRow={() => {
                                        const existing = stream.assumptions ?? [];
                                        const aNumbers = existing
                                            .map((a) => {
                                                const match = a.id.match(/^A(\d+)$/);
                                                return match ? parseInt(match[1], 10) : 0;
                                            })
                                            .filter((n) => !isNaN(n));
                                        const maxNum = aNumbers.length > 0 ? Math.max(...aNumbers) : 0;
                                        return {
                                            id: `A${maxNum + 1}`,
                                            description: "",
                                            owner: "",
                                        };
                                    }}
                                    columns={[
                                        {
                                            key: "id",
                                            header: "ID",
                                            width: "110px",
                                            render: (v) => <span className="text-sm font-mono">{v}</span>,
                                        },
                                        {
                                            key: "description",
                                            header: "Description",
                                            width: "500px",
                                            input: "text",
                                        },
                                        {
                                            key: "owner",
                                            header: "Owner",
                                            width: "200px",
                                            input: "text",
                                        },
                                    ]}
                                />
                            </TabsContent>

                            <TabsContent value="risks">
                                <DataTable<Risk>
                                    title=""
                                    rows={stream.risks ?? []}
                                    setRows={(risks) => onUpdate({ ...stream, risks })}
                                    addRow={() => {
                                        const existing = stream.risks ?? [];
                                        const rNumbers = existing
                                            .map((r) => {
                                                const match = r.id.match(/^R(\d+)$/);
                                                return match ? parseInt(match[1], 10) : 0;
                                            })
                                            .filter((n) => !isNaN(n));
                                        const maxNum = rNumbers.length > 0 ? Math.max(...rNumbers) : 0;
                                        return {
                                            id: `R${maxNum + 1}`,
                                            description: "",
                                            owner: "",
                                            likelihood: 50,
                                            impact: "medium" as const,
                                        };
                                    }}
                                    columns={[
                                        {
                                            key: "id",
                                            header: "ID",
                                            width: "110px",
                                            render: (v) => <span className="text-sm font-mono">{v}</span>,
                                        },
                                        {
                                            key: "description",
                                            header: "Description",
                                            width: "350px",
                                            input: "text",
                                        },
                                        {
                                            key: "owner",
                                            header: "Owner",
                                            width: "150px",
                                            input: "text",
                                        },
                                        {
                                            key: "likelihood",
                                            header: "Likelihood",
                                            width: "150px",
                                            render: (v, row) => {
                                                const getLikelihoodLevel = (val?: number): "low" | "medium" | "high" => {
                                                    if (!val) return "medium";
                                                    if (val < 33) return "low";
                                                    if (val < 67) return "medium";
                                                    return "high";
                                                };
                                                const level = getLikelihoodLevel(v);
                                                const colors = {
                                                    low: "bg-green-100 text-green-800 border-green-200",
                                                    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
                                                    high: "bg-red-100 text-red-800 border-red-200",
                                                };
                                                return (
                                                    <Select
                                                        value={level}
                                                        onValueChange={(nv) => {
                                                            const risks = stream.risks ?? [];
                                                            const likelihoodMap = { low: 20, medium: 50, high: 80 };
                                                            onUpdate({
                                                                ...stream,
                                                                risks: risks.map((r) =>
                                                                    r.id === row.id
                                                                        ? { ...r, likelihood: likelihoodMap[nv as keyof typeof likelihoodMap] }
                                                                        : r
                                                                ),
                                                            });
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-8 rounded-xl">
                                                            <Badge className={`${colors[level]} capitalize`}>{level}</Badge>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="low">Low</SelectItem>
                                                            <SelectItem value="medium">Medium</SelectItem>
                                                            <SelectItem value="high">High</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                );
                                            },
                                        },
                                        {
                                            key: "impact",
                                            header: "Impact",
                                            width: "160px",
                                            render: (v, row) => {
                                                const impact = v ?? "medium";
                                                const colors = {
                                                    minor: "bg-blue-100 text-blue-800 border-blue-200",
                                                    medium: "bg-orange-100 text-orange-800 border-orange-200",
                                                    severe: "bg-red-100 text-red-800 border-red-200",
                                                };
                                                return (
                                                    <Select
                                                        value={String(impact)}
                                                        onValueChange={(nv) => {
                                                            const risks = stream.risks ?? [];
                                                            onUpdate({
                                                                ...stream,
                                                                risks: risks.map((r) =>
                                                                    r.id === row.id
                                                                        ? { ...r, impact: nv as "minor" | "medium" | "severe" }
                                                                        : r
                                                                ),
                                                            });
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-8 rounded-xl">
                                                            <Badge className={`${colors[impact as keyof typeof colors]} capitalize`}>
                                                                {impact}
                                                            </Badge>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="minor">Minor</SelectItem>
                                                            <SelectItem value="medium">Medium</SelectItem>
                                                            <SelectItem value="severe">Severe</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                );
                                            },
                                        },
                                    ]}
                                />
                            </TabsContent>
                        </Tabs>
                    </TabsContent>

                    {/* Tab 3: Market */}
                    <TabsContent value="market" className="mt-4">
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <HelpLabel
                                    label="Linked Market"
                                    help="Select which market this revenue stream targets. Markets define the addressable customer base in units."
                                />
                                <Select
                                    value={stream.marketId}
                                    onValueChange={(value) => onUpdate({ ...stream, marketId: value })}
                                >
                                    <SelectTrigger className="rounded-2xl">
                                        <SelectValue placeholder="Select market" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {markets.length === 0 ? (
                                            <div className="p-2 text-sm text-muted-foreground">No markets defined</div>
                                        ) : (
                                            markets.map((m) => (
                                                <SelectItem key={m.id} value={m.id}>
                                                    {m.name}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                                {selectedMarket && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                        SAM: {selectedMarket.samUnits.toLocaleString()} units
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <HelpLabel
                                    label="Initial units"
                                    help="How many paying units/customers exist at the start of this revenue stream. Often 0 for a new product; non-zero for migrations or existing contracts."
                                />
                                <Input
                                    inputMode="numeric"
                                    value={String(stream.adoptionModel.initialUnits)}
                                    onChange={(e) => {
                                        const x = Number(e.target.value);
                                        if (Number.isFinite(x))
                                            onUpdate({
                                                ...stream,
                                                adoptionModel: {
                                                    ...stream.adoptionModel,
                                                    initialUnits: clamp(Math.round(x), 0, 10_000_000),
                                                },
                                            });
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <HelpLabel
                                    label="SOM cap (max units)"
                                    help="Serviceable Obtainable Market: the maximum number of units you realistically expect to capture for this stream. Used to cap adoption growth."
                                />
                                <Input
                                    inputMode="numeric"
                                    value={String(stream.adoptionModel.maxUnits ?? "")}
                                    onChange={(e) => {
                                        const x = Number(e.target.value);
                                        if (!e.target.value) {
                                            const { maxUnits, ...rest } = stream.adoptionModel;
                                            onUpdate({ ...stream, adoptionModel: rest });
                                            return;
                                        }
                                        if (Number.isFinite(x))
                                            onUpdate({
                                                ...stream,
                                                adoptionModel: {
                                                    ...stream.adoptionModel,
                                                    maxUnits: clamp(Math.round(x), 0, 10_000_000_000),
                                                },
                                            });
                                    }}
                                />
                                <div className="text-xs text-muted-foreground">Optional; used to cap adoption.</div>
                            </div>
                        </div>
                        <div className="mt-4 space-y-2">
                            <HelpLabel
                                label="Billing frequency"
                                help="How often you bill. This affects how revenue is recognised in projections."
                            />
                            <Select
                                value={stream.unitEconomics.billingFrequency}
                                onValueChange={(v) =>
                                    onUpdate({
                                        ...stream,
                                        unitEconomics: {
                                            ...stream.unitEconomics,
                                            billingFrequency: v as "monthly" | "annual",
                                        },
                                    })
                                }
                            >
                                <SelectTrigger className="rounded-2xl">
                                    <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="annual">Annual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </TabsContent>

                    {/* Tab 4: Pricing */}
                    <TabsContent value="pricing" className="mt-4">
                        <div className="grid gap-6 md:grid-cols-2">
                            <DistInput
                                label="Price per unit"
                                help="How much you charge per revenue unit. Use Advanced to enter min/likely/max for uncertainty."
                                value={stream.unitEconomics.pricePerUnit}
                                suffix="£"
                                hint={`Per ${stream.revenueUnit}`}
                                onChange={(v) =>
                                    onUpdate({
                                        ...stream,
                                        unitEconomics: { ...stream.unitEconomics, pricePerUnit: v },
                                    })
                                }
                            />

                            <div className="rounded-2xl border p-4">
                                <HelpLabel
                                    label="Delivery cost model"
                                    help="Choose how you want to model the cost to deliver this service. Most users prefer gross margin."
                                />
                                <div className="mt-3 space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name={`delivery-cost-${stream.id}`}
                                            checked={stream.unitEconomics.deliveryCostModel.type === "grossMargin"}
                                            onChange={() => {
                                                onUpdate({
                                                    ...stream,
                                                    unitEconomics: {
                                                        ...stream.unitEconomics,
                                                        deliveryCostModel: {
                                                            type: "grossMargin",
                                                            marginPct: createSimpleDistribution(70),
                                                        },
                                                    },
                                                });
                                            }}
                                            className="h-4 w-4"
                                        />
                                        <span className="text-sm">I know my gross margin %</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name={`delivery-cost-${stream.id}`}
                                            checked={stream.unitEconomics.deliveryCostModel.type === "perUnitCost"}
                                            onChange={() => {
                                                onUpdate({
                                                    ...stream,
                                                    unitEconomics: {
                                                        ...stream.unitEconomics,
                                                        deliveryCostModel: {
                                                            type: "perUnitCost",
                                                            costPerUnit: createSimpleDistribution(5),
                                                        },
                                                    },
                                                });
                                            }}
                                            className="h-4 w-4"
                                        />
                                        <span className="text-sm">I know my delivery cost per unit</span>
                                    </label>
                                </div>
                                <div className="mt-4">
                                    {stream.unitEconomics.deliveryCostModel.type === "grossMargin" ? (
                                        <DistInput
                                            label="Gross margin"
                                            help="% of revenue kept after direct delivery costs (not including CAC or overhead)."
                                            value={stream.unitEconomics.deliveryCostModel.marginPct}
                                            suffix="%"
                                            hint="Revenue kept after direct delivery costs"
                                            onChange={(v) =>
                                                onUpdate({
                                                    ...stream,
                                                    unitEconomics: {
                                                        ...stream.unitEconomics,
                                                        deliveryCostModel: { type: "grossMargin", marginPct: v },
                                                    },
                                                })
                                            }
                                        />
                                    ) : (
                                        <DistInput
                                            label="Delivery cost per unit"
                                            help="Direct cost to deliver one unit (e.g., hosting, COGS). Does not include CAC or overhead."
                                            value={stream.unitEconomics.deliveryCostModel.costPerUnit}
                                            suffix="£"
                                            hint={`Cost per ${stream.revenueUnit}`}
                                            onChange={(v) =>
                                                onUpdate({
                                                    ...stream,
                                                    unitEconomics: {
                                                        ...stream.unitEconomics,
                                                        deliveryCostModel: { type: "perUnitCost", costPerUnit: v },
                                                    },
                                                })
                                            }
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="rounded-2xl border p-4 md:col-span-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-medium">Optional: Contract length & churn</div>
                                        <div className="text-xs text-muted-foreground">
                                            Only if you expect retention effects.
                                        </div>
                                    </div>
                                    <Switch
                                        checked={!!stream.unitEconomics.churnRate}
                                        onCheckedChange={(on) =>
                                            onUpdate({
                                                ...stream,
                                                unitEconomics: {
                                                    ...stream.unitEconomics,
                                                    churnRate: on ? createSimpleDistribution(5) : undefined,
                                                    contractLengthMonths: on
                                                        ? createSimpleDistribution(12)
                                                        : undefined,
                                                },
                                            })
                                        }
                                    />
                                </div>
                                <AnimatePresence>
                                    {stream.unitEconomics.churnRate ? (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="mt-4 grid gap-4 md:grid-cols-2"
                                        >
                                            {stream.unitEconomics.contractLengthMonths && (
                                                <DistInput
                                                    label="Contract length"
                                                    help="Average contract duration in months."
                                                    value={stream.unitEconomics.contractLengthMonths}
                                                    suffix="months"
                                                    onChange={(v) =>
                                                        onUpdate({
                                                            ...stream,
                                                            unitEconomics: {
                                                                ...stream.unitEconomics,
                                                                contractLengthMonths: v,
                                                            },
                                                        })
                                                    }
                                                />
                                            )}
                                            <DistInput
                                                label="Monthly churn"
                                                help="% of customers/units lost each month (if recurring)."
                                                value={stream.unitEconomics.churnRate}
                                                suffix="%"
                                                onChange={(v) =>
                                                    onUpdate({
                                                        ...stream,
                                                        unitEconomics: { ...stream.unitEconomics, churnRate: v },
                                                    })
                                                }
                                            />
                                        </motion.div>
                                    ) : null}
                                </AnimatePresence>
                            </div>
                        </div>
                    </TabsContent>

                    {/* Tab 5: Growth */}
                    <TabsContent value="growth" className="mt-4">
                        <div className="grid gap-6 md:grid-cols-2">
                            <DistInput
                                label="Monthly acquisition"
                                help="How many new revenue units you add per month after the start month. Use Advanced for min/likely/max."
                                value={stream.adoptionModel.acquisitionRate}
                                hint={`New ${stream.revenueUnit} per month`}
                                onChange={(v) =>
                                    onUpdate({
                                        ...stream,
                                        adoptionModel: { ...stream.adoptionModel, acquisitionRate: v },
                                    })
                                }
                            />

                            <div className="rounded-2xl border p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-medium">Churn in adoption model</div>
                                        <div className="text-xs text-muted-foreground">
                                            Use this if churn affects active units directly.
                                        </div>
                                    </div>
                                    <Switch
                                        checked={!!stream.adoptionModel.churnRate}
                                        onCheckedChange={(on) =>
                                            onUpdate({
                                                ...stream,
                                                adoptionModel: {
                                                    ...stream.adoptionModel,
                                                    churnRate: on ? createSimpleDistribution(2) : undefined,
                                                },
                                            })
                                        }
                                    />
                                </div>
                                {stream.adoptionModel.churnRate ? (
                                    <div className="mt-4">
                                        <DistInput
                                            label="Monthly churn"
                                            help="% of active units lost each month (affects active units directly)."
                                            value={stream.adoptionModel.churnRate}
                                            suffix="%"
                                            onChange={(v) =>
                                                onUpdate({
                                                    ...stream,
                                                    adoptionModel: { ...stream.adoptionModel, churnRate: v },
                                                })
                                            }
                                        />
                                    </div>
                                ) : null}
                            </div>

                            <div className="rounded-2xl border p-4 md:col-span-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-medium">Expansion (upsell / usage growth)</div>
                                        <div className="text-xs text-muted-foreground">
                                            Optional; applies to existing units.
                                        </div>
                                    </div>
                                    <Switch
                                        checked={!!stream.adoptionModel.expansionRate}
                                        onCheckedChange={(on) =>
                                            onUpdate({
                                                ...stream,
                                                adoptionModel: {
                                                    ...stream.adoptionModel,
                                                    expansionRate: on ? createSimpleDistribution(1) : undefined,
                                                },
                                            })
                                        }
                                    />
                                </div>
                                {stream.adoptionModel.expansionRate ? (
                                    <div className="mt-4">
                                        <DistInput
                                            label="Monthly expansion"
                                            help="% growth applied to existing units each month (upsell / increased usage)."
                                            value={stream.adoptionModel.expansionRate}
                                            suffix="%"
                                            onChange={(v) =>
                                                onUpdate({
                                                    ...stream,
                                                    adoptionModel: { ...stream.adoptionModel, expansionRate: v },
                                                })
                                            }
                                        />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </TabsContent>

                    {/* Tab 6: Costs */}
                    <TabsContent value="costs" className="mt-4">
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                                <div className="text-sm font-medium text-blue-900">Acquisition Costs</div>
                                <div className="text-xs text-blue-700 mt-1">
                                    These costs are incurred once per new unit and do not affect gross margin.
                                    They impact cash flow and payback period.
                                </div>
                            </div>

                            <div className="grid gap-6 md:grid-cols-2">
                                <DistInput
                                    label="CAC per unit"
                                    help="Sales & marketing cost to acquire one new unit (not included in gross margin)."
                                    value={stream.acquisitionCosts.cacPerUnit}
                                    suffix="£"
                                    hint={`Cost to acquire one ${stream.revenueUnit}`}
                                    onChange={(v) =>
                                        onUpdate({
                                            ...stream,
                                            acquisitionCosts: { ...stream.acquisitionCosts, cacPerUnit: v },
                                        })
                                    }
                                />

                                <div className="rounded-2xl border p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium">Onboarding cost per unit</div>
                                            <div className="text-xs text-muted-foreground">
                                                One-off implementation / setup cost incurred after acquisition.
                                            </div>
                                        </div>
                                        <Switch
                                            checked={!!stream.acquisitionCosts.onboardingCostPerUnit}
                                            onCheckedChange={(on) =>
                                                onUpdate({
                                                    ...stream,
                                                    acquisitionCosts: {
                                                        ...stream.acquisitionCosts,
                                                        onboardingCostPerUnit: on
                                                            ? createSimpleDistribution(100)
                                                            : undefined,
                                                    },
                                                })
                                            }
                                        />
                                    </div>
                                    {stream.acquisitionCosts.onboardingCostPerUnit ? (
                                        <div className="mt-4">
                                            <DistInput
                                                label="Onboarding cost per unit"
                                                help="One-off implementation / setup cost incurred after acquisition (setup, implementation, KYC, etc)."
                                                value={stream.acquisitionCosts.onboardingCostPerUnit}
                                                suffix="£"
                                                onChange={(v) =>
                                                    onUpdate({
                                                        ...stream,
                                                        acquisitionCosts: {
                                                            ...stream.acquisitionCosts,
                                                            onboardingCostPerUnit: v,
                                                        },
                                                    })
                                                }
                                            />
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

export function RevenueStreamsView({
    revenueStreams,
    markets,
    timeline,
    onChange,
    onChangeTimeline,
    horizonMonths = 36,
}: RevenueStreamsViewProps) {
    const [selectedStreamId, setSelectedStreamId] = useState<string | null>(revenueStreams[0]?.id ?? null);

    // Store colors in component state and sync with localStorage
    const [streamColors, setStreamColors] = useState<Map<string, string>>(() => {
        const palette = ["#4f46e5", "#16a34a", "#f97316", "#0ea5e9", "#a855f7", "#ef4444", "#14b8a6"];

        // Try to load from localStorage first
        const stored = localStorage.getItem("streamColors");
        if (stored) {
            try {
                const obj = JSON.parse(stored);
                const loadedMap = new Map<string, string>(Object.entries(obj));

                // Fill in any missing colors for new streams
                revenueStreams.forEach((s, i) => {
                    if (!loadedMap.has(s.id)) {
                        loadedMap.set(s.id, palette[i % palette.length]);
                    }
                });
                return loadedMap;
            } catch {
                // Fall through to default
            }
        }

        // Default initialization
        const map = new Map<string, string>();
        revenueStreams.forEach((s, i) => {
            map.set(s.id, palette[i % palette.length]);
        });
        return map;
    });

    // Save colors to localStorage whenever they change
    useEffect(() => {
        const obj = Object.fromEntries(streamColors);
        localStorage.setItem("streamColors", JSON.stringify(obj));

        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event("streamColorsChanged"));
    }, [streamColors]);

    const addStream = () => {
        const newStream: RevenueStream = {
            id: uid("RS"),
            name: "New Revenue Stream",
            marketId: markets[0]?.id ?? "",
            pricingModel: "subscription",
            revenueUnit: "subscriber",
            unlockEventId: timeline[0]?.id,
            unitEconomics: {
                pricePerUnit: createSimpleDistribution(25),
                deliveryCostModel: { type: "grossMargin", marginPct: createSimpleDistribution(70) },
                billingFrequency: "monthly",
                contractLengthMonths: createSimpleDistribution(12),
                churnRate: createSimpleDistribution(5),
            },
            adoptionModel: {
                initialUnits: 0,
                acquisitionRate: createSimpleDistribution(10),
                maxUnits: undefined,
                churnRate: createSimpleDistribution(5),
                expansionRate: createSimpleDistribution(0),
            },
            acquisitionCosts: {
                cacPerUnit: createSimpleDistribution(300),
                onboardingCostPerUnit: createSimpleDistribution(0),
            },
        };

        const palette = ["#4f46e5", "#16a34a", "#f97316", "#0ea5e9", "#a855f7", "#ef4444", "#14b8a6"];
        setStreamColors((prev) =>
            new Map(prev).set(newStream.id, palette[revenueStreams.length % palette.length])
        );

        onChange([...revenueStreams, newStream]);
        setSelectedStreamId(newStream.id);
    };

    const duplicateStream = (stream: RevenueStream) => {
        const newStream: RevenueStream = {
            ...stream,
            id: uid("RS"),
            name: `${stream.name} (Copy)`,
        };

        const existingColor = streamColors.get(stream.id) || "#4f46e5";
        setStreamColors((prev) => new Map(prev).set(newStream.id, existingColor));

        onChange([...revenueStreams, newStream]);
        setSelectedStreamId(newStream.id);
    };

    const updateStream = useCallback(
        (id: string, updates: Partial<RevenueStream>) => {
            onChange(revenueStreams.map((s) => (s.id === id ? { ...s, ...updates } : s)));
        },
        [onChange, revenueStreams]
    );

    const deleteStream = (id: string) => {
        onChange(revenueStreams.filter((s) => s.id !== id));
        setStreamColors((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
        });
        if (selectedStreamId === id) {
            setSelectedStreamId(revenueStreams[0]?.id ?? null);
        }
    };

    const handleChangeStartMonth = useCallback(
        (id: string, month: number) => {
            const stream = revenueStreams.find((s) => s.id === id);
            if (!stream) return;

            // Find or create timeline event at this month
            const existingEvent = timeline.find((t) => t.month === month);
            if (existingEvent) {
                updateStream(id, { unlockEventId: existingEvent.id });
            } else if (onChangeTimeline) {
                // Create new timeline event
                const newEvent: TimelineEvent = {
                    id: uid("TL"),
                    name: `Month ${month}`,
                    month,
                    description: `Auto-created for ${stream.name}`,
                };
                onChangeTimeline([...timeline, newEvent]);
                updateStream(id, { unlockEventId: newEvent.id });
            }
        },
        [revenueStreams, timeline, onChangeTimeline, updateStream]
    );

    const selectedStream = revenueStreams.find((s) => s.id === selectedStreamId);

    // Add colors to streams for rendering
    const streamsWithColors: StreamWithColor[] = revenueStreams.map((s) => ({
        ...s,
        color: streamColors.get(s.id) || "#4f46e5",
    }));

    return (
        <TooltipProvider>
            <div className="space-y-4">
                {revenueStreams.length === 0 ? (
                    <Card className="p-8 text-center text-muted-foreground">
                        <p>No revenue streams defined yet.</p>
                        <p className="text-sm mt-1">Click "Add Stream" to create your first revenue stream.</p>
                    </Card>
                ) : (
                    <>
                        <DraggableTimeline
                            streams={streamsWithColors}
                            horizonMonths={horizonMonths}
                            selectedId={selectedStreamId ?? undefined}
                            timeline={timeline}
                            onSelect={setSelectedStreamId}
                            onChangeStartMonth={handleChangeStartMonth}
                        />

                        <div className="grid gap-6 md:grid-cols-[320px_1fr]">
                            {/* Left sidebar: Stream list */}
                            <Card className="rounded-2xl shadow-sm">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <CardTitle className="text-base">Streams</CardTitle>
                                        <Button onClick={addStream} size="sm" className="rounded-2xl">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add stream
                                        </Button>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        Click to edit. Drag start month above.
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {streamsWithColors.map((s) => {
                                        const isSel = s.id === selectedStreamId;
                                        const warnings = computeWarnings(s);
                                        const warnCount = warnings.filter((x) => x.severity === "warn").length;
                                        const infoCount = warnings.filter((x) => x.severity === "info").length;

                                        return (
                                            <div
                                                key={s.id}
                                                className={
                                                    "w-full text-left rounded-2xl border px-3 py-3 transition flex items-start justify-between gap-3 cursor-pointer " +
                                                    (isSel ? "bg-muted" : "bg-background hover:bg-muted/50")
                                                }
                                                onClick={() => setSelectedStreamId(s.id)}
                                            >
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="h-3 w-3 rounded-full"
                                                            style={{ background: s.color }}
                                                        />
                                                        <div className="truncate font-medium">{s.name}</div>
                                                        {warnCount > 0 ? (
                                                            <Badge variant="destructive">{warnCount} warn</Badge>
                                                        ) : null}
                                                        {warnCount === 0 && infoCount > 0 ? (
                                                            <Badge variant="secondary">{infoCount} note</Badge>
                                                        ) : null}
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground truncate">
                                                        {s.pricingModel} · {s.revenueUnit}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="rounded-xl h-8 w-8"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            duplicateStream(s);
                                                        }}
                                                        title="Duplicate"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="rounded-xl h-8 w-8"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            deleteStream(s.id);
                                                        }}
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <Separator className="my-3" />
                                    <div className="text-xs text-muted-foreground">
                                        This panel replaces the old "Market Segments" table: streams are first-class.
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Right panel: Stream editor */}
                            {selectedStream ? (
                                <StreamEditor
                                    stream={selectedStream}
                                    markets={markets}
                                    timeline={timeline}
                                    streamColor={streamColors.get(selectedStream.id) || "#4f46e5"}
                                    onColorChange={(color) =>
                                        setStreamColors((prev) => new Map(prev).set(selectedStream.id, color))
                                    }
                                    onUpdate={(s) => updateStream(selectedStream.id, s)}
                                />
                            ) : (
                                <Card className="rounded-2xl">
                                    <CardContent className="p-8 text-sm text-muted-foreground">
                                        Select a stream to edit.
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </>
                )}
            </div>
        </TooltipProvider>
    );
}
