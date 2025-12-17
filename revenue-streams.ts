import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Plus,
    Trash2,
    Copy,
    Palette,
    GripVertical,
    HelpCircle,
    AlertTriangle,
} from "lucide-react";

/**
 * UI prototype: revenue-stream-centric planner input.
 * - Add/delete/duplicate named streams
 * - Tabs to navigate streams
 * - Color picker per stream
 * - Horizontal month timeline with draggable start positions (snaps to months)
 * - Stream detail editor with progressive uncertainty inputs (simple → advanced)
 * - Warnings + badges for modelling issues
 * - LocalStorage persistence
 */

type DistType = "triangular";

type Distribution = {
    type: DistType;
    min: number;
    mode: number;
    max: number;
};

type UnitEconomics = {
    pricePerUnit: Distribution;
    grossMarginPct: Distribution;
    billingFrequency: "monthly" | "annual";
    churnPct?: Distribution; // optional
};

type AdoptionModel = {
    initialUnits: number;
    acquisitionPerMonth: Distribution;
    maxUnits?: number;
    churnPct?: Distribution;
    expansionPct?: Distribution;
};

type StreamCosts = {
    cacPerUnit: Distribution;
    onboardingCost?: Distribution;
    variableCostPerUnit?: Distribution;
};

type RevenueStream = {
    id: string;
    name: string;
    color: string;
    startMonth: number; // Month 0 = plan start
    pricingModel: "subscription" | "usage" | "transaction" | "license" | "hybrid";
    revenueUnit: string;
    unitEconomics: UnitEconomics;
    adoptionModel: AdoptionModel;
    streamCosts: StreamCosts;
};

type PlanState = {
    horizonMonths: number;
    streams: RevenueStream[];
    selectedId?: string;
};

type Warning = {
    key: string;
    label: string;
    severity: "warn" | "info";
};

const LS_KEY = "planner.revenue_stream_ui.prototype.v1";

function uid(prefix = "rs") {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function asTriangularFromPoint(x: number, wigglePct = 0.1): Distribution {
    const min = x * (1 - wigglePct);
    const max = x * (1 + wigglePct);
    return { type: "triangular", min: round(min), mode: round(x), max: round(max) };
}

function round(x: number) {
    const abs = Math.abs(x);
    const places = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 10 ? 2 : 3;
    const p = Math.pow(10, places);
    return Math.round(x * p) / p;
}

function defaultStream(name = "New stream"): RevenueStream {
    return {
        id: uid(),
        name,
        color: "#4f46e5",
        startMonth: 1,
        pricingModel: "subscription",
        revenueUnit: "seat / month",
        unitEconomics: {
            pricePerUnit: asTriangularFromPoint(25),
            grossMarginPct: { type: "triangular", min: 60, mode: 75, max: 85 },
            billingFrequency: "monthly",
        },
        adoptionModel: {
            initialUnits: 0,
            acquisitionPerMonth: { type: "triangular", min: 1, mode: 3, max: 6 },
            maxUnits: 250,
        },
        streamCosts: {
            cacPerUnit: asTriangularFromPoint(300),
            onboardingCost: asTriangularFromPoint(0),
            variableCostPerUnit: asTriangularFromPoint(2),
        },
    };
}

function loadState(): PlanState {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { horizonMonths: 36, streams: [defaultStream("Stream A")], selectedId: undefined };
        const parsed = JSON.parse(raw) as PlanState;
        if (!parsed.streams?.length) {
            return { horizonMonths: 36, streams: [defaultStream("Stream A")], selectedId: undefined };
        }
        return parsed;
    } catch {
        return { horizonMonths: 36, streams: [defaultStream("Stream A")], selectedId: undefined };
    }
}

function saveState(s: PlanState) {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function HelpLabel({ label, help }: { label: string; help: string }) {
    return (
        <div className= "flex items-center gap-1" >
        <Label>{ label } </Label>
        < Tooltip >
        <TooltipTrigger asChild >
        <button type="button" className = "inline-flex items-center" aria - label={ `Help: ${label}` }>
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </button>
                </TooltipTrigger>
                < TooltipContent className = "max-w-xs" >
                    <div className="text-sm" > { help } </div>
                        </TooltipContent>
                        </Tooltip>
                        </div>
  );
}

function computeWarnings(stream: RevenueStream, horizonMonths: number): Warning[] {
    const w: Warning[] = [];

    const gm = stream.unitEconomics.grossMarginPct;
    if (gm.mode < 0 || gm.mode > 100) w.push({ key: "gm-range", label: "Gross margin out of range", severity: "warn" });
    else if (gm.mode < 30) w.push({ key: "gm-low", label: "Low gross margin", severity: "info" });

    const maxUnits = stream.adoptionModel.maxUnits;
    if (typeof maxUnits === "number" && stream.adoptionModel.initialUnits > maxUnits) {
        w.push({ key: "som-initial", label: "Initial units exceed SOM cap", severity: "warn" });
    }

    if (typeof maxUnits === "number") {
        const monthsActive = Math.max(0, horizonMonths - stream.startMonth);
        const projected = stream.adoptionModel.initialUnits + stream.adoptionModel.acquisitionPerMonth.mode * monthsActive;
        if (projected > maxUnits) w.push({ key: "som-hit", label: "Projection hits SOM cap", severity: "info" });
    }

    if (stream.streamCosts.cacPerUnit.mode < 0) w.push({ key: "cac-neg", label: "CAC is negative", severity: "warn" });
    if (stream.unitEconomics.pricePerUnit.mode <= 0) w.push({ key: "price-zero", label: "Price is zero", severity: "warn" });

    return w;
}

function MonthTicks({ horizonMonths }: { horizonMonths: number }) {
    const ticks = useMemo(() => {
        const out: number[] = [];
        for (let i = 0; i <= horizonMonths; i++) if (i === 0 || i % 3 === 0 || i === horizonMonths) out.push(i);
        return out;
    }, [horizonMonths]);

    return (
        <div className= "relative w-full" >
        <div className="flex justify-between text-xs text-muted-foreground" >
        {
            ticks.map((m) => (
                <div key= { m } className = "flex flex-col items-center" style = {{ width: `${100 / (ticks.length - 1)}%` }} >
            <div className="h-2 w-px bg-border" />
                <div className="mt-1" > M{ m } </div>
                    </div>
        ))
}
</div>
    </div>
  );
}

function DraggableTimeline({
    streams,
    horizonMonths,
    selectedId,
    onSelect,
    onChangeStartMonth,
}: {
    streams: RevenueStream[];
    horizonMonths: number;
    selectedId?: string;
    onSelect: (id: string) => void;
    onChangeStartMonth: (id: string, month: number) => void;
}) {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);

    function monthFromClientX(clientX: number) {
        if (!trackRef.current) return 0;
        const rect = trackRef.current.getBoundingClientRect();
        const x = clamp(clientX - rect.left, 0, rect.width);
        return clamp(Math.round((x / rect.width) * horizonMonths), 0, horizonMonths);
    }

    useEffect(() => {
        if (!draggingId) return;
        const onMove = (e: PointerEvent) => onChangeStartMonth(draggingId, monthFromClientX(e.clientX));
        const onUp = () => setDraggingId(null);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
    }, [draggingId, horizonMonths, onChangeStartMonth]);

    return (
        <Card className= "rounded-2xl shadow-sm" >
        <CardHeader className="pb-3" >
            <div className="flex items-center justify-between gap-3" >
                <div>
                <CardTitle className="text-base" > Stream start timeline </CardTitle>
                    < div className = "text-sm text-muted-foreground" > Drag a stream bar to change when revenue starts(snaps to months).</div>
                        </div>
                        < Badge variant = "secondary" > Horizon: { horizonMonths } months </Badge>
                            </div>
                            </CardHeader>
                            < CardContent >
                            <div ref={ trackRef } className = "relative h-28 w-full rounded-2xl border bg-background overflow-hidden" >
                                <div className="absolute inset-0 pointer-events-none opacity-60" >
                                    {
                                        Array.from({ length: horizonMonths + 1 }).map((_, i) => (
                                            <div key= { i } className = "absolute top-0 bottom-0 w-px bg-border" style = {{ left: `${(i / horizonMonths) * 100}%` }} />
            ))
}
</div>

    < div className = "absolute inset-0 p-3" >
    {
        streams.map((s, idx) => {
            const isSel = s.id === selectedId;
            const leftPct = (s.startMonth / horizonMonths) * 100;
            return (
                <motion.div
                  key= { s.id }
            initial = {{ opacity: 0, y: 4 }
        }
                  animate = {{ opacity: 1, y: 0 }}
className = {
    "absolute h-10 rounded-2xl border flex items-center justify-between px-3 cursor-grab active:cursor-grabbing select-none " +
        (isSel ? "ring-2 ring-offset-2" : "")
}
style = {{
    top: `${idx * 44 + 8}px`,
        left: `${leftPct}%`,
            width: "min(520px, 70%)",
                background: `${s.color}15`,
                    borderColor: `${s.color}55`,
                  }}
onClick = {() => onSelect(s.id)}
onPointerDown = {(e) => {
    setDraggingId(s.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onChangeStartMonth(s.id, monthFromClientX(e.clientX));
}}
                >
    <div className="flex items-center gap-2 min-w-0" >
        <div className="h-3 w-3 rounded-full" style = {{ background: s.color }} />
            < div className = "truncate text-sm font-medium" > { s.name } </div>
                < Badge variant = "outline" > M{ s.startMonth } </Badge>
                    </div>
                    < GripVertical className = "h-4 w-4 text-muted-foreground" />
                        </motion.div>
              );
            })}
</div>
    </div>
    < MonthTicks horizonMonths = { horizonMonths } />
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value.min, value.mode, value.max]);

    return (
        <div className= "space-y-2" >
        <div className="flex items-start justify-between gap-3" >
            <div>
            { help?<HelpLabel label = { label } help = { help } /> : <Label className="text-sm" > { label } </Label>
}
{ hint ? <div className="text-xs text-muted-foreground" > { hint } </div> : null }
</div>
    < div className = "flex items-center gap-2" >
        <span className="text-xs text-muted-foreground" > Advanced </span>
            < Switch checked = { advanced } onCheckedChange = { setAdvanced } />
                </div>
                </div>

{
    !advanced ? (
        <div className= "flex items-center gap-2" >
        <Input
            inputMode="decimal"
    value = { String(value.mode) }
    onChange = {(e) => {
        const x = Number(e.target.value);
        if (Number.isFinite(x)) onChange({ ...value, min: x, mode: x, max: x });
    }
}
          />
{ suffix ? <div className="text-sm text-muted-foreground" > { suffix } </div> : null }
</div>
      ) : (
    <div className= "grid grid-cols-3 gap-2" >
    <div className="space-y-1" >
        <Label className="text-xs text-muted-foreground" > Min{ suffix ? ` (${suffix})` : "" } </Label>
            < Input inputMode = "decimal" value = { String(value.min) } onChange = {(e) => onChange({ ...value, min: Number(e.target.value) })} />
                </div>
                < div className = "space-y-1" >
                    <Label className="text-xs text-muted-foreground" > Likely{ suffix ? ` (${suffix})` : "" } </Label>
                        < Input inputMode = "decimal" value = { String(value.mode) } onChange = {(e) => onChange({ ...value, mode: Number(e.target.value) })} />
                            </div>
                            < div className = "space-y-1" >
                                <Label className="text-xs text-muted-foreground" > Max{ suffix ? ` (${suffix})` : "" } </Label>
                                    < Input inputMode = "decimal" value = { String(value.max) } onChange = {(e) => onChange({ ...value, max: Number(e.target.value) })} />
                                        </div>
                                        </div>
      )}
</div>
  );
}

function WarningStrip({ warnings }: { warnings: Warning[] }) {
    if (!warnings.length) return null;
    return (
        <div className= "rounded-2xl border p-3 bg-muted/30" >
        <div className="flex items-center gap-2 text-sm font-medium" >
            <AlertTriangle className="h-4 w-4" />
                Modelling warnings
                    </div>
                    < div className = "mt-2 flex flex-wrap gap-2" >
                    {
                        warnings.map((w) => (
                            <Badge key= { w.key } variant = { w.severity === "warn" ? "destructive" : "secondary" } >
                            { w.label }
                            </Badge>
                        ))
                    }
                        </div>
                        </div>
  );
}

function StreamEditor({
    stream,
    onUpdate,
    horizonMonths,
}: {
    stream: RevenueStream;
    onUpdate: (s: RevenueStream) => void;
    horizonMonths: number;
}) {
    const warnings = useMemo(() => computeWarnings(stream, horizonMonths), [stream, horizonMonths]);

    return (
        <Card className= "rounded-2xl shadow-sm" >
        <CardHeader className="pb-3" >
            <div className="flex items-start justify-between gap-3" >
                <div>
                <CardTitle className="text-base flex items-center gap-2" >
                    { stream.name }
    {
        warnings.slice(0, 2).map((w) => (
            <Badge key= { w.key } variant = { w.severity === "warn" ? "destructive" : "secondary" } >
            { w.severity === "warn" ? "⚠" : "i" } { w.label }
        </Badge>
        ))
    }
    </CardTitle>
        < div className = "text-sm text-muted-foreground" > Capture unit economics, growth, and stream - specific costs.</div>
            </div>
            < div className = "flex items-center gap-2" >
                <div className="flex items-center gap-2 rounded-2xl border px-3 py-2" >
                    <Palette className="h-4 w-4" />
                        <input
                aria - label="Stream color"
    type = "color"
    value = { stream.color }
    onChange = {(e) => onUpdate({ ...stream, color: e.target.value })
}
className = "h-6 w-10 bg-transparent border-0 p-0"
    />
    <div className="text-xs text-muted-foreground" > { stream.color } </div>
        </div>
        </div>
        </div>
        </CardHeader>
        < CardContent className = "space-y-4" >
            <WarningStrip warnings={ warnings } />

                < Tabs defaultValue = "overview" className = "w-full" >
                    <TabsList className="grid w-full grid-cols-5 rounded-2xl" >
                        <TabsTrigger value="overview" > Overview </TabsTrigger>
                            < TabsTrigger value = "market" > Market </TabsTrigger>
                                < TabsTrigger value = "pricing" > Pricing </TabsTrigger>
                                    < TabsTrigger value = "growth" > Growth </TabsTrigger>
                                        < TabsTrigger value = "costs" > Costs </TabsTrigger>
                                            </TabsList>

                                            < TabsContent value = "overview" className = "mt-4" >
                                                <div className="grid gap-4 md:grid-cols-2" >
                                                    <div className="space-y-2" >
                                                        <HelpLabel label="Name" help = "A short label for this revenue stream (e.g. ‘SaaS Pro Tier’, ‘Transaction Fees’, ‘Enterprise Licence’)." />
                                                            <Input value={ stream.name } onChange = {(e) => onUpdate({ ...stream, name: e.target.value })} />
                                                                </div>
                                                                < div className = "space-y-2" >
                                                                    <HelpLabel label="Start month" help = "When this stream begins generating revenue, measured in months from the plan start (Month 0). Drag the bar in the timeline to change this." />
                                                                        <div className="flex items-center gap-2" >
                                                                            <Input
                    inputMode="numeric"
value = { String(stream.startMonth) }
onChange = {(e) => {
    const m = Number(e.target.value);
    if (Number.isFinite(m)) onUpdate({ ...stream, startMonth: clamp(Math.round(m), 0, 240) });
}}
                  />
    < div className = "text-sm text-muted-foreground" > Month(relative) </div>
        </div>
        </div>
        < div className = "space-y-2" >
            <HelpLabel label="Pricing model" help = "How customers pay: subscription, usage, transaction fees, licence, or a mix (hybrid)." />
                <Select value={ stream.pricingModel } onValueChange = {(v) => onUpdate({ ...stream, pricingModel: v as RevenueStream["pricingModel"] })}>
                    <SelectTrigger className="rounded-2xl" >
                        <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            < SelectContent >
                            <SelectItem value="subscription" > Subscription </SelectItem>
                                < SelectItem value = "usage" > Usage </SelectItem>
                                    < SelectItem value = "transaction" > Transaction </SelectItem>
                                        < SelectItem value = "license" > License </SelectItem>
                                            < SelectItem value = "hybrid" > Hybrid </SelectItem>
                                                </SelectContent>
                                                </Select>
                                                </div>
                                                < div className = "space-y-2" >
                                                    <HelpLabel label="Revenue unit" help = "The ‘countable thing’ you earn money per. Examples: ‘seat / month’, ‘trade’, ‘API call’, ‘org / year’. Keep it consistent with CAC and variable costs." />
                                                        <Input value={ stream.revenueUnit } onChange = {(e) => onUpdate({ ...stream, revenueUnit: e.target.value })} placeholder = "e.g. seat / month" />
                                                            </div>
                                                            </div>
                                                            < Separator className = "my-5" />
                                                                <div className="text-sm text-muted-foreground" > Tip: keep your < span className = "font-medium" > Revenue unit < /span> consistent with CAC and variable costs.</div >
                                                                    </TabsContent>

                                                                    < TabsContent value = "market" className = "mt-4" >
                                                                        <div className="grid gap-4 md:grid-cols-3" >
                                                                            <div className="space-y-2" >
                                                                                <HelpLabel label="Initial units" help = "How many paying units/customers exist at the start of this revenue stream. Often 0 for a new product; non-zero for migrations or existing contracts." />
                                                                                    <Input
                  inputMode="numeric"
value = { String(stream.adoptionModel.initialUnits) }
onChange = {(e) => {
    const x = Number(e.target.value);
    if (Number.isFinite(x)) onUpdate({ ...stream, adoptionModel: { ...stream.adoptionModel, initialUnits: clamp(Math.round(x), 0, 10_000_000) } });
}}
                />
    </div>
    < div className = "space-y-2" >
        <HelpLabel label="SOM cap (max units)" help = "Serviceable Obtainable Market: the maximum number of units you realistically expect to capture for this stream. Used to cap adoption growth." />
            <Input
                  inputMode="numeric"
value = { String(stream.adoptionModel.maxUnits ?? "") }
onChange = {(e) => {
    const x = Number(e.target.value);
    if (!e.target.value) {
        const { maxUnits, ...rest } = stream.adoptionModel;
        onUpdate({ ...stream, adoptionModel: rest });
        return;
    }
    if (Number.isFinite(x)) onUpdate({ ...stream, adoptionModel: { ...stream.adoptionModel, maxUnits: clamp(Math.round(x), 0, 10_000_000_000) } });
}}
                />
    < div className = "text-xs text-muted-foreground" > Optional; used to cap adoption.</div>
        </div>
        < div className = "space-y-2" >
            <HelpLabel label="Billing frequency" help = "How often you bill. This affects how revenue is recognised in projections." />
                <Select
                  value={ stream.unitEconomics.billingFrequency }
onValueChange = {(v) => onUpdate({ ...stream, unitEconomics: { ...stream.unitEconomics, billingFrequency: v as UnitEconomics["billingFrequency"] } })}
                >
    <SelectTrigger className="rounded-2xl" >
        <SelectValue placeholder="Select" />
            </SelectTrigger>
            < SelectContent >
            <SelectItem value="monthly" > Monthly </SelectItem>
                < SelectItem value = "annual" > Annual </SelectItem>
                    </SelectContent>
                    </Select>
                    </div>
                    </div>
                    </TabsContent>

                    < TabsContent value = "pricing" className = "mt-4" >
                        <div className="grid gap-6 md:grid-cols-2" >
                            <DistInput
                label="Price per unit"
help = "How much you charge per revenue unit. Use Advanced to enter min/likely/max for uncertainty."
value = { stream.unitEconomics.pricePerUnit }
suffix = "£"
hint = {`Per ${stream.revenueUnit}`}
onChange = {(v) => onUpdate({ ...stream, unitEconomics: { ...stream.unitEconomics, pricePerUnit: v } })}
              />
    < DistInput
label = "Gross margin"
help = "% of revenue kept after direct delivery costs (before CAC and overhead)."
value = { stream.unitEconomics.grossMarginPct }
suffix = "%"
hint = "Revenue kept after direct costs (before CAC)."
onChange = {(v) => onUpdate({ ...stream, unitEconomics: { ...stream.unitEconomics, grossMarginPct: v } })}
              />

    < div className = "rounded-2xl border p-4 md:col-span-2" >
        <div className="flex items-center justify-between gap-3" >
            <div>
            <div className="text-sm font-medium" > Recurring economics </div>
                < div className = "text-xs text-muted-foreground" > Only if you expect churn / retention effects.</div>
                    </div>
                    < Switch
checked = {!!stream.unitEconomics.churnPct}
onCheckedChange = {(on) => onUpdate({ ...stream, unitEconomics: { ...stream.unitEconomics, churnPct: on ? { type: "triangular", min: 1, mode: 3, max: 6 } : undefined } })}
                  />
    </div>
    <AnimatePresence>
{
    stream.unitEconomics.churnPct ? (
        <motion.div initial= {{ opacity: 0, height: 0 }
} animate = {{ opacity: 1, height: "auto" }} exit = {{ opacity: 0, height: 0 }} className = "mt-4" >
    <DistInput
                        label="Monthly churn"
help = "% of customers/units lost each month (if recurring)."
value = { stream.unitEconomics.churnPct }
suffix = "%"
onChange = {(v) => onUpdate({ ...stream, unitEconomics: { ...stream.unitEconomics, churnPct: v } })}
                      />
    </motion.div>
                  ) : null}
</AnimatePresence>
    </div>
    </div>
    </TabsContent>

    < TabsContent value = "growth" className = "mt-4" >
        <div className="grid gap-6 md:grid-cols-2" >
            <DistInput
                label="Monthly acquisition"
help = "How many new revenue units you add per month after the start month. Use Advanced for min/likely/max."
value = { stream.adoptionModel.acquisitionPerMonth }
hint = {`New ${stream.revenueUnit} per month`}
onChange = {(v) => onUpdate({ ...stream, adoptionModel: { ...stream.adoptionModel, acquisitionPerMonth: v } })}
              />

    < div className = "rounded-2xl border p-4" >
        <div className="flex items-center justify-between gap-3" >
            <div>
            <div className="text-sm font-medium" > Churn in adoption model </div>
                < div className = "text-xs text-muted-foreground" > Use this if churn affects active units directly.</div>
                    </div>
                    < Switch
checked = {!!stream.adoptionModel.churnPct}
onCheckedChange = {(on) => onUpdate({ ...stream, adoptionModel: { ...stream.adoptionModel, churnPct: on ? { type: "triangular", min: 1, mode: 2, max: 5 } : undefined } })}
                  />
    </div>
{
    stream.adoptionModel.churnPct ? (
        <div className= "mt-4" >
        <DistInput
                      label="Monthly churn"
    help = "% of active units lost each month (affects active units directly)."
    value = { stream.adoptionModel.churnPct }
    suffix = "%"
    onChange = {(v) => onUpdate({ ...stream, adoptionModel: { ...stream.adoptionModel, churnPct: v } })
}
                    />
    </div>
                ) : null}
</div>

    < div className = "rounded-2xl border p-4 md:col-span-2" >
        <div className="flex items-center justify-between gap-3" >
            <div>
            <div className="text-sm font-medium" > Expansion(upsell / usage growth) </div>
                < div className = "text-xs text-muted-foreground" > Optional; applies to existing units.</div>
                    </div>
                    < Switch
checked = {!!stream.adoptionModel.expansionPct}
onCheckedChange = {(on) => onUpdate({ ...stream, adoptionModel: { ...stream.adoptionModel, expansionPct: on ? { type: "triangular", min: 0, mode: 1, max: 3 } : undefined } })}
                  />
    </div>
{
    stream.adoptionModel.expansionPct ? (
        <div className= "mt-4" >
        <DistInput
                      label="Monthly expansion"
    help = "% growth applied to existing units each month (upsell / increased usage)."
    value = { stream.adoptionModel.expansionPct }
    suffix = "%"
    onChange = {(v) => onUpdate({ ...stream, adoptionModel: { ...stream.adoptionModel, expansionPct: v } })
}
                    />
    </div>
                ) : null}
</div>
    </div>
    </TabsContent>

    < TabsContent value = "costs" className = "mt-4" >
        <div className="grid gap-6 md:grid-cols-2" >
            <DistInput
                label="CAC per unit"
help = "Customer Acquisition Cost: sales + marketing cost to acquire one unit/customer for this stream."
value = { stream.streamCosts.cacPerUnit }
suffix = "£"
hint = {`Cost to acquire one ${stream.revenueUnit}`}
onChange = {(v) => onUpdate({ ...stream, streamCosts: { ...stream.streamCosts, cacPerUnit: v } })}
              />

    < DistInput
label = "Variable cost per unit"
help = "Per-unit cost to deliver the product/service (payment fees, infra per txn, support per customer)."
value = { stream.streamCosts.variableCostPerUnit ?? asTriangularFromPoint(0) }
suffix = "£"
hint = "Per-unit delivery / payment fees / support (optional)."
onChange = {(v) => onUpdate({ ...stream, streamCosts: { ...stream.streamCosts, variableCostPerUnit: v } })}
              />

    < div className = "rounded-2xl border p-4 md:col-span-2" >
        <div className="flex items-center justify-between gap-3" >
            <div>
            <div className="text-sm font-medium" > Onboarding cost </div>
                < div className = "text-xs text-muted-foreground" > Optional one - off cost per unit / customer.</div>
                    </div>
                    < Switch
checked = {!!stream.streamCosts.onboardingCost}
onCheckedChange = {(on) => onUpdate({ ...stream, streamCosts: { ...stream.streamCosts, onboardingCost: on ? asTriangularFromPoint(100) : undefined } })}
                  />
    </div>
{
    stream.streamCosts.onboardingCost ? (
        <div className= "mt-4" >
        <DistInput
                      label="Onboarding cost per unit"
    help = "One-off cost incurred when a new unit/customer is onboarded (setup, implementation, KYC, etc)."
    value = { stream.streamCosts.onboardingCost }
    suffix = "£"
    onChange = {(v) => onUpdate({ ...stream, streamCosts: { ...stream.streamCosts, onboardingCost: v } })
}
                    />
    </div>
                ) : null}
</div>
    </div>
    </TabsContent>
    </Tabs>
    </CardContent>
    </Card>
  );
}

export default function RevenueStreamPlannerPrototype() {
    const [state, setState] = useState<PlanState>(() => ({ horizonMonths: 36, streams: [], selectedId: undefined }));

    useEffect(() => {
        const s = loadState();
        const sel = s.selectedId && s.streams.some((x) => x.id === s.selectedId) ? s.selectedId : s.streams[0]?.id;
        setState({ ...s, selectedId: sel });
    }, []);

    useEffect(() => {
        if (!state.streams.length) return;
        saveState(state);
    }, [state]);

    const selected = useMemo(() => state.streams.find((s) => s.id === state.selectedId) ?? state.streams[0], [state.streams, state.selectedId]);

    function updateStream(id: string, updater: (s: RevenueStream) => RevenueStream) {
        setState((prev) => ({ ...prev, streams: prev.streams.map((s) => (s.id === id ? updater(s) : s)) }));
    }

    function addStream() {
        setState((prev) => {
            const n = prev.streams.length + 1;
            const ns = defaultStream(`Stream ${n}`);
            const palette = ["#4f46e5", "#16a34a", "#f97316", "#0ea5e9", "#a855f7", "#ef4444", "#14b8a6"];
            ns.color = palette[(n - 1) % palette.length];
            ns.startMonth = clamp(Math.round((n - 1) * 2), 0, prev.horizonMonths);
            return { ...prev, streams: [...prev.streams, ns], selectedId: ns.id };
        });
    }

    function duplicateStream(id: string) {
        setState((prev) => {
            const s = prev.streams.find((x) => x.id === id);
            if (!s) return prev;
            const copy: RevenueStream = { ...structuredClone(s), id: uid(), name: `${s.name} (copy)` };
            return { ...prev, streams: [...prev.streams, copy], selectedId: copy.id };
        });
    }

    function deleteStream(id: string) {
        setState((prev) => {
            const next = prev.streams.filter((s) => s.id !== id);
            const sel = prev.selectedId === id ? next[0]?.id : prev.selectedId;
            return { ...prev, streams: next, selectedId: sel };
        });
    }

    if (!state.streams.length) {
        return (
            <TooltipProvider>
            <div className= "p-6" >
            <Button onClick={ () => setState({ horizonMonths: 36, streams: [defaultStream("Stream A")], selectedId: undefined }) }> Create sample plan </Button>
                </div>
                </TooltipProvider>
    );
    }

    return (
        <TooltipProvider>
        <div className= "min-h-screen w-full bg-background" >
        <div className="mx-auto max-w-6xl p-6 space-y-6" >
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between" >
                <div>
                <div className="text-2xl font-semibold tracking-tight" > Revenue Streams </div>
                    < div className = "text-sm text-muted-foreground" > Prototype input UI: streams + start timeline + per - stream tabs.</div>
                        </div>
                        < div className = "flex items-center gap-2" >
                            <Button onClick={ addStream } className = "rounded-2xl" > <Plus className="h-4 w-4 mr-2" /> Add stream </Button>
                                < div className = "flex items-center gap-2 rounded-2xl border px-3 py-2" >
                                    <Label className="text-xs text-muted-foreground" > Horizon </Label>
                                        < Input
    className = "h-8 w-20"
    inputMode = "numeric"
    value = { String(state.horizonMonths) }
    onChange = {(e) => {
        const x = Number(e.target.value);
        if (!Number.isFinite(x)) return;
        const m = clamp(Math.round(x), 6, 120);
        setState((prev) => ({
            ...prev,
            horizonMonths: m,
            streams: prev.streams.map((s) => ({ ...s, startMonth: clamp(s.startMonth, 0, m) })),
        }));
    }
}
                />
    < div className = "text-xs text-muted-foreground" > months </div>
        </div>
        </div>
        </div>

        < DraggableTimeline
streams = { state.streams }
horizonMonths = { state.horizonMonths }
selectedId = { state.selectedId }
onSelect = {(id) => setState((p) => ({ ...p, selectedId: id }))}
onChangeStartMonth = {(id, month) => updateStream(id, (s) => ({ ...s, startMonth: month }))}
          />

    < div className = "grid gap-6 md:grid-cols-[320px_1fr]" >
        <Card className="rounded-2xl shadow-sm" >
            <CardHeader className="pb-3" >
                <CardTitle className="text-base" > Streams </CardTitle>
                    < div className = "text-sm text-muted-foreground" > Click to edit.Drag start month above.</div>
                        </CardHeader>
                        < CardContent className = "space-y-2" >
                            {
                                state.streams.map((s) => {
                                    const isSel = s.id === state.selectedId;
                                    const warnings = computeWarnings(s, state.horizonMonths);
                                    const warnCount = warnings.filter((x) => x.severity === "warn").length;
                                    const infoCount = warnings.filter((x) => x.severity === "info").length;

                                    return (
                                        <button
                      key= { s.id }
                                    className = {
                                        "w-full text-left rounded-2xl border px-3 py-3 transition flex items-start justify-between gap-3 " +
                                            (isSel ? "bg-muted" : "bg-background hover:bg-muted/50")
                                    }
                                    onClick = {() => setState((p) => ({ ...p, selectedId: s.id }))
                                }
                    >
                                    <div className="min-w-0" >
                                <div className="flex items-center gap-2" >
                                <div className="h-3 w-3 rounded-full" style = {{ background: s.color }} />
                            <div className="truncate font-medium" > { s.name } </div>
{ warnCount > 0 ? <Badge variant="destructive" > { warnCount } warn </Badge> : null }
{ warnCount === 0 && infoCount > 0 ? <Badge variant="secondary" > { infoCount } note </Badge> : null }
</div>
    < div className = "mt-1 text-xs text-muted-foreground truncate" > { s.pricingModel } · { s.revenueUnit } · start M{ s.startMonth } </div>
        </div>
        < div className = "flex items-center gap-1 shrink-0" >
            <Button variant="ghost" size = "icon" className = "rounded-xl" onClick = {(e) => { e.preventDefault(); e.stopPropagation(); duplicateStream(s.id); }} title = "Duplicate" > <Copy className="h-4 w-4" /> </Button>
                < Button variant = "ghost" size = "icon" className = "rounded-xl" onClick = {(e) => { e.preventDefault(); e.stopPropagation(); deleteStream(s.id); }} title = "Delete" > <Trash2 className="h-4 w-4" /> </Button>
                    </div>
                    </button>
                  );
                })}

<Separator className="my-3" />
    <div className="text-xs text-muted-foreground" > This panel is your replacement for the old “Market Segments” table: streams are first - class.</div>
        </CardContent>
        </Card>

{
    selected ? (
        <StreamEditor stream= { selected } horizonMonths = { state.horizonMonths } onUpdate = {(s) => updateStream(selected.id, () => s)
} />
            ) : (
    <Card className= "rounded-2xl" > <CardContent className="p-8 text-sm text-muted-foreground" > Select a stream to edit.< /CardContent></Card >
            )}
</div>

    < Card className = "rounded-2xl shadow-sm" >
        <CardHeader className="pb-3" > <CardTitle className="text-base" > Notes < /CardTitle></CardHeader >
            <CardContent className="text-sm text-muted-foreground space-y-2" >
                <div>• Timeline dragging snaps to whole months(Month 0..Horizon).</div>
                    <div>• Warnings are heuristic checks(mode - only), not Monte - Carlo.</div>
                        <div>• Badges help you spot streams that need attention before simulation.</div>
                            </CardContent>
                            </Card>
                            </div>
                            </div>
                            </TooltipProvider>
  );
}
