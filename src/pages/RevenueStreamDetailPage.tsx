import { useParams, useNavigate } from "react-router-dom";
import type { VentureData, RevenueStream, TimelineEvent, Assumption, Risk, Distribution, PricingModel } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "../components/DataTable";
import { ArrowLeft, Trash2, TrendingUp, ChevronLeft, ChevronRight, BarChart3, Table as TableIcon } from "lucide-react";
import { fmtCurrency } from "../utils/formatUtils";
import { calculateStreamMonthlyMetrics, getDistributionMode } from "../utils/logic";
import { Line, LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { useMemo, useState } from "react";

type RevenueStreamDetailPageProps = {
    data: VentureData;
    setRevenueStreams: (streams: RevenueStream[]) => void;
    setTimeline: (timeline: TimelineEvent[]) => void;
};

// Helper to get currency symbol
function getCurrencySymbol(currency?: string): string {
    if (!currency) return "";
    const symbols: Record<string, string> = {
        USD: "$",
        GBP: "£",
        EUR: "€",
        JPY: "¥",
        CNY: "¥",
    };
    return symbols[currency] || currency;
}

// Helper to get value from distribution based on selection
function getDistributionValue(dist: Distribution, selection: "min" | "mode" | "max"): number {
    if (dist.type === "triangular") {
        return selection === "min" ? dist.min : selection === "max" ? dist.max : dist.mode;
    } else if (dist.type === "normal") {
        return dist.mean;
    } else if (dist.type === "lognormal") {
        return selection === "min" ? dist.min : selection === "max" ? dist.max : dist.mode;
    }
    return 0;
}

// Helper to convert distribution to fixed value
function distributionToFixed(dist: Distribution, selection: "min" | "mode" | "max"): Distribution {
    const value = getDistributionValue(dist, selection);
    return { type: "triangular", min: value, mode: value, max: value };
}

// Helper component for editing distributions
function DistributionInput({
    label,
    value,
    onChange,
    currency,
    isPercentage,
}: {
    label: string;
    value: Distribution;
    onChange: (dist: Distribution) => void;
    currency?: string;
    isPercentage?: boolean;
}) {
    const suffix = isPercentage ? "%" : "";
    const prefix = currency && !isPercentage ? getCurrencySymbol(currency) : "";

    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <div className="grid grid-cols-3 gap-2">
                <div>
                    <Label className="text-xs text-muted-foreground">Min</Label>
                    <div className="relative">
                        {prefix && <span className="absolute left-3 top-2 text-sm text-muted-foreground">{prefix}</span>}
                        <Input
                            type="number"
                            value={value.min}
                            onChange={(e) => onChange({ ...value, min: parseFloat(e.target.value) || 0 })}
                            className={`rounded-xl text-right ${prefix ? "pl-8 pr-3" : ""} ${suffix ? "pr-8" : ""}`}
                        />
                        {suffix && <span className="absolute right-3 top-2 text-sm text-muted-foreground">{suffix}</span>}
                    </div>
                </div>
                <div>
                    <Label className="text-xs text-muted-foreground">Mode</Label>
                    <div className="relative">
                        {prefix && <span className="absolute left-3 top-2 text-sm text-muted-foreground">{prefix}</span>}
                        <Input
                            type="number"
                            value={value.mode}
                            onChange={(e) => onChange({ ...value, mode: parseFloat(e.target.value) || 0 })}
                            className={`rounded-xl text-right ${prefix ? "pl-8 pr-3" : ""} ${suffix ? "pr-8" : ""}`}
                        />
                        {suffix && <span className="absolute right-3 top-2 text-sm text-muted-foreground">{suffix}</span>}
                    </div>
                </div>
                <div>
                    <Label className="text-xs text-muted-foreground">Max</Label>
                    <div className="relative">
                        {prefix && <span className="absolute left-3 top-2 text-sm text-muted-foreground">{prefix}</span>}
                        <Input
                            type="number"
                            value={value.max}
                            onChange={(e) => onChange({ ...value, max: parseFloat(e.target.value) || 0 })}
                            className={`rounded-xl text-right ${prefix ? "pl-8 pr-3" : ""} ${suffix ? "pr-8" : ""}`}
                        />
                        {suffix && <span className="absolute right-3 top-2 text-sm text-muted-foreground">{suffix}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function RevenueStreamDetailPage({ data, setRevenueStreams, setTimeline }: RevenueStreamDetailPageProps) {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Collapsible panel state
    const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
    const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

    // Preview distribution selection
    const [previewDistribution, setPreviewDistribution] = useState<"min" | "mode" | "max">("mode");
    const [revenuePreviewMode, setRevenuePreviewMode] = useState<"graph" | "table">("graph");

    const stream = (data.revenueStreams ?? []).find((s) => s.id === id);

    // Update stream helper
    const updateStream = (updates: Partial<RevenueStream>) => {
        const streams = data.revenueStreams ?? [];
        setRevenueStreams(streams.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    };

    // Delete stream
    const handleDelete = () => {
        if (confirm(`Are you sure you want to delete "${stream?.name}"?`)) {
            const streams = data.revenueStreams ?? [];
            setRevenueStreams(streams.filter((s) => s.id !== id));
            navigate("/revenue-streams");
        }
    };

    // Helper functions to get next IDs for assumptions and risks in this stream
    const getNextAssumptionId = () => {
        const assumptions = stream?.assumptions ?? [];
        const aNumbers = assumptions
            .map((a) => {
                const match = a.id.match(/^A(\d+)$/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter((n) => !isNaN(n));
        const maxNum = aNumbers.length > 0 ? Math.max(...aNumbers) : 0;
        return `A${maxNum + 1}`;
    };

    const getNextRiskId = () => {
        const risks = stream?.risks ?? [];
        const rNumbers = risks
            .map((r) => {
                const match = r.id.match(/^R(\d+)$/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter((n) => !isNaN(n));
        const maxNum = rNumbers.length > 0 ? Math.max(...rNumbers) : 0;
        return `R${maxNum + 1}`;
    };

    // Update functions for assumptions and risks
    const setAssumptions = (assumptions: Assumption[]) => {
        updateStream({ assumptions });
    };

    const setRisks = (risks: Risk[]) => {
        updateStream({ risks });
    };

    // Calculate preview data
    const previewData = useMemo(() => {
        if (!stream) return [];

        // Create a modified stream with fixed distribution values based on selection
        const previewStream: RevenueStream = {
            ...stream,
            unitEconomics: {
                ...stream.unitEconomics,
                pricePerUnit: distributionToFixed(stream.unitEconomics.pricePerUnit, previewDistribution),
                deliveryCostModel: stream.unitEconomics.deliveryCostModel.type === "grossMargin"
                    ? {
                        type: "grossMargin",
                        marginPct: distributionToFixed(stream.unitEconomics.deliveryCostModel.marginPct, previewDistribution),
                    }
                    : {
                        type: "perUnitCost",
                        costPerUnit: distributionToFixed(stream.unitEconomics.deliveryCostModel.costPerUnit, previewDistribution),
                    },
            },
            adoptionModel: {
                ...stream.adoptionModel,
                acquisitionRate: distributionToFixed(stream.adoptionModel.acquisitionRate, previewDistribution),
                churnRate: stream.adoptionModel.churnRate
                    ? distributionToFixed(stream.adoptionModel.churnRate, previewDistribution)
                    : undefined,
                expansionRate: stream.adoptionModel.expansionRate
                    ? distributionToFixed(stream.adoptionModel.expansionRate, previewDistribution)
                    : undefined,
            },
            acquisitionCosts: {
                cacPerUnit: distributionToFixed(stream.acquisitionCosts.cacPerUnit, previewDistribution),
                onboardingCostPerUnit: stream.acquisitionCosts.onboardingCostPerUnit
                    ? distributionToFixed(stream.acquisitionCosts.onboardingCostPerUnit, previewDistribution)
                    : undefined,
            },
        };

        const result = [];
        for (let i = 0; i < data.meta.horizonMonths; i++) {
            const metrics = calculateStreamMonthlyMetrics(
                previewStream,
                i,
                data.timeline ?? []
            );
            result.push({
                month: i,
                revenue: metrics.grossRevenue,
                deliveryCosts: metrics.deliveryCosts,
                acquisitionCosts: metrics.acquisitionCosts.total,
                costs: metrics.totalCosts,
                profit: metrics.netProfit,
                users: metrics.units,
            });
        }
        return result;
    }, [stream, data.meta.horizonMonths, data.timeline, previewDistribution]);

    if (!stream) {
        return (
            <Card className="rounded-2xl shadow-sm mt-4">
                <CardContent className="p-8 text-center">
                    <p className="text-lg text-muted-foreground">Revenue stream not found</p>
                    <Button onClick={() => navigate("/revenue-streams")} className="mt-4 rounded-2xl">
                        Back to Revenue Streams
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate("/revenue-streams")}
                        className="rounded-2xl"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h2 className="text-2xl font-semibold">{stream.name}</h2>
                        <p className="text-sm text-muted-foreground">
                            {stream.pricingModel} · {stream.revenueUnit}
                        </p>
                    </div>
                </div>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    className="rounded-2xl"
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Stream
                </Button>
            </div>

            {/* Two-Column Layout */}
            <div className={`grid gap-4 ${leftPanelCollapsed ? 'grid-cols-[auto_1fr]' : rightPanelCollapsed ? 'grid-cols-[1fr_auto]' : 'grid-cols-[1fr_1fr]'}`}>

                {/* Left Column - Editing Tabs */}
                {leftPanelCollapsed ? (
                    <div
                        onClick={() => setLeftPanelCollapsed(false)}
                        className="w-8 bg-muted/30 hover:bg-muted/50 border-2 rounded-2xl cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 py-8"
                        title="Expand editing panel"
                    >
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <div className="writing-mode-vertical text-xs text-muted-foreground font-medium" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                            Edit Details
                        </div>
                    </div>
                ) : (
                    <Card className="rounded-2xl shadow-sm border-2">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Edit Details</CardTitle>
                                {!rightPanelCollapsed && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setLeftPanelCollapsed(true)}
                                        className="rounded-xl h-7 px-2"
                                        title="Collapse editing panel"
                                    >
                                        <ChevronLeft className="h-4 w-4 mr-1" />
                                        Collapse
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="overview" className="space-y-4">
                                <TabsList className="rounded-2xl w-full grid grid-cols-3">
                                    <TabsTrigger value="overview">Overview</TabsTrigger>
                                    <TabsTrigger value="pricing">Pricing</TabsTrigger>
                                    <TabsTrigger value="growth">Growth</TabsTrigger>
                                </TabsList>
                                <TabsList className="rounded-2xl w-full grid grid-cols-3">
                                    <TabsTrigger value="costs">Costs</TabsTrigger>
                                    <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
                                    <TabsTrigger value="risks">Risks</TabsTrigger>
                                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview">
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <CardTitle>Basic Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <Label>Stream Name</Label>
                                    <Input
                                        value={stream.name}
                                        onChange={(e) => updateStream({ name: e.target.value })}
                                        className="rounded-xl"
                                    />
                                </div>
                                <div>
                                    <Label>Pricing Model</Label>
                                    <Select
                                        value={stream.pricingModel}
                                        onValueChange={(v) => updateStream({ pricingModel: v as PricingModel })}
                                    >
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue />
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
                                <div>
                                    <Label>Revenue Unit</Label>
                                    <Input
                                        value={stream.revenueUnit}
                                        onChange={(e) => updateStream({ revenueUnit: e.target.value })}
                                        placeholder="e.g., subscriber, seat, transaction"
                                        className="rounded-xl"
                                    />
                                </div>
                                <div>
                                    <Label>Start Date</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={data.meta.horizonMonths}
                                            value={(() => {
                                                if (!stream.unlockEventId) return 0;
                                                const event = (data.timeline ?? []).find(e => e.id === stream.unlockEventId);
                                                return event?.month ?? 0;
                                            })()}
                                            onChange={(e) => {
                                                const month = Math.max(0, Math.min(data.meta.horizonMonths, parseInt(e.target.value) || 0));
                                                const existingEvent = (data.timeline ?? []).find(t => t.month === month);
                                                if (existingEvent) {
                                                    updateStream({ unlockEventId: existingEvent.id });
                                                } else {
                                                    const newEvent = {
                                                        id: `TL${Date.now()}`,
                                                        name: `Month ${month}`,
                                                        month,
                                                        description: `Auto-created for ${stream.name}`,
                                                    };
                                                    setTimeline([...(data.timeline ?? []), newEvent]);
                                                    updateStream({ unlockEventId: newEvent.id });
                                                }
                                            }}
                                            className="rounded-xl flex-1"
                                        />
                                        <span className="text-sm text-muted-foreground">Month</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Pricing Tab */}
                <TabsContent value="pricing">
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <CardTitle>Pricing & Unit Economics</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <DistributionInput
                                label="Price per Unit"
                                value={stream.unitEconomics.pricePerUnit}
                                onChange={(dist) =>
                                    updateStream({
                                        unitEconomics: {
                                            ...stream.unitEconomics,
                                            pricePerUnit: dist,
                                        },
                                    })
                                }
                                currency={data.meta.currency}
                            />

                            <div>
                                <Label>Billing Frequency</Label>
                                <Select
                                    value={stream.unitEconomics.billingFrequency}
                                    onValueChange={(v) =>
                                        updateStream({
                                            unitEconomics: {
                                                ...stream.unitEconomics,
                                                billingFrequency: v as "monthly" | "annual",
                                            },
                                        })
                                    }
                                >
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                        <SelectItem value="annual">Annual (Custom Period)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {stream.unitEconomics.billingFrequency === "annual" && (
                                <DistributionInput
                                    label="Billing Cycle (months)"
                                    value={stream.unitEconomics.contractLengthMonths ?? { type: "triangular", min: 12, mode: 12, max: 12 }}
                                    onChange={(dist) =>
                                        updateStream({
                                            unitEconomics: {
                                                ...stream.unitEconomics,
                                                contractLengthMonths: dist,
                                            },
                                        })
                                    }
                                />
                            )}

                            <div>
                                <Label>Delivery Cost Model (COGS)</Label>
                                <Select
                                    value={stream.unitEconomics.deliveryCostModel.type}
                                    onValueChange={(v) => {
                                        if (v === "grossMargin") {
                                            updateStream({
                                                unitEconomics: {
                                                    ...stream.unitEconomics,
                                                    deliveryCostModel: {
                                                        type: "grossMargin",
                                                        marginPct: { type: "triangular", min: 70, mode: 80, max: 90 },
                                                    },
                                                },
                                            });
                                        } else {
                                            updateStream({
                                                unitEconomics: {
                                                    ...stream.unitEconomics,
                                                    deliveryCostModel: {
                                                        type: "perUnitCost",
                                                        costPerUnit: { type: "triangular", min: 10, mode: 15, max: 20 },
                                                    },
                                                },
                                            });
                                        }
                                    }}
                                >
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="grossMargin">Gross Margin %</SelectItem>
                                        <SelectItem value="perUnitCost">Delivery Cost per Unit</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {stream.unitEconomics.deliveryCostModel.type === "grossMargin" ? (
                                <DistributionInput
                                    label="Gross Margin %"
                                    value={stream.unitEconomics.deliveryCostModel.marginPct}
                                    onChange={(dist) =>
                                        updateStream({
                                            unitEconomics: {
                                                ...stream.unitEconomics,
                                                deliveryCostModel: {
                                                    type: "grossMargin",
                                                    marginPct: dist,
                                                },
                                            },
                                        })
                                    }
                                    isPercentage
                                />
                            ) : (
                                <DistributionInput
                                    label="Delivery Cost per Unit (COGS)"
                                    value={stream.unitEconomics.deliveryCostModel.costPerUnit}
                                    onChange={(dist) =>
                                        updateStream({
                                            unitEconomics: {
                                                ...stream.unitEconomics,
                                                deliveryCostModel: {
                                                    type: "perUnitCost",
                                                    costPerUnit: dist,
                                                },
                                            },
                                        })
                                    }
                                    currency={data.meta.currency}
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Growth Tab */}
                <TabsContent value="growth">
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <CardTitle>Growth & Adoption Model</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <Label>Initial Units</Label>
                                <Input
                                    type="number"
                                    value={stream.adoptionModel.initialUnits}
                                    onChange={(e) =>
                                        updateStream({
                                            adoptionModel: {
                                                ...stream.adoptionModel,
                                                initialUnits: parseInt(e.target.value) || 0,
                                            },
                                        })
                                    }
                                    className="rounded-xl"
                                />
                            </div>

                            <DistributionInput
                                label="Acquisition Rate (units per month)"
                                value={stream.adoptionModel.acquisitionRate}
                                onChange={(dist) =>
                                    updateStream({
                                        adoptionModel: {
                                            ...stream.adoptionModel,
                                            acquisitionRate: dist,
                                        },
                                    })
                                }
                            />

                            {stream.adoptionModel.churnRate && (
                                <DistributionInput
                                    label="Churn Rate (% per month)"
                                    value={stream.adoptionModel.churnRate}
                                    onChange={(dist) =>
                                        updateStream({
                                            adoptionModel: {
                                                ...stream.adoptionModel,
                                                churnRate: dist,
                                            },
                                        })
                                    }
                                    isPercentage
                                />
                            )}

                            {stream.adoptionModel.expansionRate && (
                                <DistributionInput
                                    label="Expansion Rate (% per month)"
                                    value={stream.adoptionModel.expansionRate}
                                    onChange={(dist) =>
                                        updateStream({
                                            adoptionModel: {
                                                ...stream.adoptionModel,
                                                expansionRate: dist,
                                            },
                                        })
                                    }
                                    isPercentage
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Costs Tab */}
                <TabsContent value="costs">
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <CardTitle>Acquisition & Onboarding Costs</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <DistributionInput
                                label="CAC (Customer Acquisition Cost per Unit)"
                                value={stream.acquisitionCosts.cacPerUnit}
                                onChange={(dist) =>
                                    updateStream({
                                        acquisitionCosts: {
                                            ...stream.acquisitionCosts,
                                            cacPerUnit: dist,
                                        },
                                    })
                                }
                                currency={data.meta.currency}
                            />

                            {stream.acquisitionCosts.onboardingCostPerUnit && (
                                <DistributionInput
                                    label="Onboarding Cost per Unit"
                                    value={stream.acquisitionCosts.onboardingCostPerUnit}
                                    onChange={(dist) =>
                                        updateStream({
                                            acquisitionCosts: {
                                                ...stream.acquisitionCosts,
                                                onboardingCostPerUnit: dist,
                                            },
                                        })
                                    }
                                    currency={data.meta.currency}
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Assumptions Tab */}
                <TabsContent value="assumptions">
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <CardTitle>Assumptions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable<Assumption>
                                title=""
                                rows={stream.assumptions ?? []}
                                setRows={setAssumptions}
                                addRow={() => ({
                                    id: getNextAssumptionId(),
                                    description: "",
                                    owner: "",
                                })}
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
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Risks Tab */}
                <TabsContent value="risks">
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <CardTitle>Risks</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable<Risk>
                                title=""
                                rows={stream.risks ?? []}
                                setRows={setRisks}
                                addRow={() => ({
                                    id: getNextRiskId(),
                                    description: "",
                                    owner: "",
                                    likelihood: 50,
                                    impact: "medium",
                                })}
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
                                        width: "400px",
                                        input: "text",
                                    },
                                    {
                                        key: "owner",
                                        header: "Owner",
                                        width: "180px",
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
                                                        setRisks(
                                                            risks.map((r) =>
                                                                r.id === row.id
                                                                    ? { ...r, likelihood: likelihoodMap[nv as keyof typeof likelihoodMap] }
                                                                    : r
                                                            )
                                                        );
                                                    }}
                                                >
                                                    <SelectTrigger className="h-8 rounded-xl border-0">
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
                                                        setRisks(
                                                            risks.map((r) =>
                                                                r.id === row.id ? { ...r, impact: nv as "minor" | "medium" | "severe" } : r
                                                            )
                                                        );
                                                    }}
                                                >
                                                    <SelectTrigger className="h-8 rounded-xl border-0">
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
                        </CardContent>
                    </Card>
                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                )}

                {/* Right Column - Preview */}
                {rightPanelCollapsed ? (
                    <div
                        onClick={() => setRightPanelCollapsed(false)}
                        className="w-8 bg-muted/30 hover:bg-muted/50 border-2 rounded-2xl cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 py-8"
                        title="Expand preview panel"
                    >
                        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                        <div className="writing-mode-vertical text-xs text-muted-foreground font-medium" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                            Preview
                        </div>
                    </div>
                ) : (
                    <Card className="rounded-2xl shadow-sm border-2">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5" />
                                    <CardTitle className="text-base">Revenue Projection</CardTitle>
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
                                            className="rounded-xl h-7 px-2"
                                            title="Collapse preview panel"
                                        >
                                            Collapse
                                            <ChevronRight className="h-4 w-4 ml-1" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-1 mt-3">
                                <Button
                                    variant={previewDistribution === "min" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setPreviewDistribution("min")}
                                    className="rounded-xl flex-1 text-xs h-7"
                                >
                                    Bear (Min)
                                </Button>
                                <Button
                                    variant={previewDistribution === "mode" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setPreviewDistribution("mode")}
                                    className="rounded-xl flex-1 text-xs h-7"
                                >
                                    Expected (Mode)
                                </Button>
                                <Button
                                    variant={previewDistribution === "max" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setPreviewDistribution("max")}
                                    className="rounded-xl flex-1 text-xs h-7"
                                >
                                    Bull (Max)
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {revenuePreviewMode === "graph" && (
                                <>
                                    <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={previewData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="month"
                                            label={{ value: "Month", position: "insideBottom", offset: -5 }}
                                        />
                                        <YAxis
                                            yAxisId="left"
                                            label={{ value: "Revenue / Costs", angle: -90, position: "insideLeft" }}
                                            tickFormatter={(v) => fmtCurrency(v, data.meta.currency)}
                                        />
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            label={{ value: "Users", angle: 90, position: "insideRight" }}
                                        />
                                        <Tooltip
                                            formatter={(value: number, name: string) => {
                                                if (name === "revenue") {
                                                    return [fmtCurrency(value, data.meta.currency), "Revenue"];
                                                }
                                                if (name === "costs") {
                                                    return [fmtCurrency(value, data.meta.currency), "Costs"];
                                                }
                                                if (name === "profit") {
                                                    return [fmtCurrency(value, data.meta.currency), "Profit"];
                                                }
                                                return [Math.round(value), "Users"];
                                            }}
                                        />
                                        <Legend />
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="revenue"
                                            stroke="#8884d8"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Revenue"
                                        />
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="costs"
                                            stroke="#ff7c7c"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Costs"
                                        />
                                        <Line
                                            yAxisId="right"
                                            type="monotone"
                                            dataKey="users"
                                            stroke="#82ca9d"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Users"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="mt-6 grid gap-4 md:grid-cols-3">
                                <div className="rounded-lg border p-4">
                                    <p className="text-sm text-muted-foreground">Month 12 Revenue</p>
                                    <p className="text-2xl font-semibold">
                                        {fmtCurrency(previewData[11]?.revenue || 0, data.meta.currency)}
                                    </p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-sm text-muted-foreground">Month 12 Users</p>
                                    <p className="text-2xl font-semibold">{Math.round(previewData[11]?.users || 0)}</p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-sm text-muted-foreground">Total 5Y Revenue</p>
                                    <p className="text-2xl font-semibold">
                                        {fmtCurrency(
                                            previewData.slice(0, 60).reduce((sum, m) => sum + m.revenue, 0),
                                            data.meta.currency
                                        )}
                                    </p>
                                </div>
                            </div>
                                </>
                            )}

                            {revenuePreviewMode === "table" && (
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
                                                <th className="text-right p-2 font-medium">Users</th>
                                                <th className="text-right p-2 font-medium">Revenue</th>
                                                <th className="text-right p-2 font-medium">Delivery Costs</th>
                                                <th className="text-right p-2 font-medium">Acq. Costs</th>
                                                <th className="text-right p-2 font-medium">Gross Margin</th>
                                                <th className="text-right p-2 font-medium">Net Profit</th>
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
                                                let phaseUsers = 0;
                                                let phaseRevenue = 0;
                                                let phaseDeliveryCosts = 0;
                                                let phaseAcqCosts = 0;
                                                let phaseGrossMargin = 0;
                                                let phaseNetProfit = 0;

                                                previewData.forEach((row, idx) => {
                                                    const monthNumber = idx;
                                                    const phaseInfo = getPhaseForMonth(monthNumber);
                                                    const phaseIndex = phaseInfo?.index ?? -1;
                                                    const cumulativeProfit = previewData
                                                        .slice(0, idx + 1)
                                                        .reduce((sum, r) => sum + (r.profit || 0), 0);
                                                    const grossMargin = row.revenue - (row.deliveryCosts || 0);

                                                    // Check if we've moved to a new phase
                                                    if (hasPhases && phaseIndex !== currentPhaseIndex) {
                                                        // Add summary row for previous phase (if exists)
                                                        if (currentPhaseIndex >= 0) {
                                                            rows.push(
                                                                <tr key={`summary-${currentPhaseIndex}`} className="bg-muted/50 border-b-2 font-bold">
                                                                    {hasPhases && <td className="p-2"></td>}
                                                                    <td className="p-2">Phase Total</td>
                                                                    <td className="p-2 text-right">{Math.round(phaseUsers)}</td>
                                                                    <td className="p-2 text-right">
                                                                        {fmtCurrency(phaseRevenue, data.meta.currency)}
                                                                    </td>
                                                                    <td className="p-2 text-right">
                                                                        {fmtCurrency(phaseDeliveryCosts, data.meta.currency)}
                                                                    </td>
                                                                    <td className="p-2 text-right">
                                                                        {fmtCurrency(phaseAcqCosts, data.meta.currency)}
                                                                    </td>
                                                                    <td className="p-2 text-right">
                                                                        {fmtCurrency(phaseGrossMargin, data.meta.currency)}
                                                                    </td>
                                                                    <td className="p-2 text-right">
                                                                        {fmtCurrency(phaseNetProfit, data.meta.currency)}
                                                                    </td>
                                                                    <td className="p-2 text-right"></td>
                                                                </tr>
                                                            );
                                                        }

                                                        // Reset phase accumulation
                                                        currentPhaseIndex = phaseIndex;
                                                        phaseStartIdx = idx;
                                                        phaseUsers = 0;
                                                        phaseRevenue = 0;
                                                        phaseDeliveryCosts = 0;
                                                        phaseAcqCosts = 0;
                                                        phaseGrossMargin = 0;
                                                        phaseNetProfit = 0;
                                                    }

                                                    // Accumulate phase totals
                                                    phaseUsers += row.users;
                                                    phaseRevenue += row.revenue;
                                                    phaseDeliveryCosts += row.deliveryCosts || 0;
                                                    phaseAcqCosts += row.acquisitionCosts || 0;
                                                    phaseGrossMargin += grossMargin;
                                                    phaseNetProfit += row.profit || 0;

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
                                                            <td className="p-2 text-right">{Math.round(row.users)}</td>
                                                            <td className="p-2 text-right">{fmtCurrency(row.revenue, data.meta.currency)}</td>
                                                            <td className="p-2 text-right">{fmtCurrency(row.deliveryCosts || 0, data.meta.currency)}</td>
                                                            <td className="p-2 text-right">{fmtCurrency(row.acquisitionCosts || 0, data.meta.currency)}</td>
                                                            <td className="p-2 text-right font-medium">{fmtCurrency(grossMargin, data.meta.currency)}</td>
                                                            <td className="p-2 text-right font-medium">{fmtCurrency(row.profit || 0, data.meta.currency)}</td>
                                                            <td className="p-2 text-right font-semibold">{fmtCurrency(cumulativeProfit, data.meta.currency)}</td>
                                                        </tr>
                                                    );

                                                    // Add summary row for last phase if this is the last row
                                                    if (idx === previewData.length - 1 && hasPhases && currentPhaseIndex >= 0) {
                                                        rows.push(
                                                            <tr key={`summary-${currentPhaseIndex}`} className="bg-muted/50 border-b-2 font-bold">
                                                                {hasPhases && <td className="p-2"></td>}
                                                                <td className="p-2">Phase Total</td>
                                                                <td className="p-2 text-right">{Math.round(phaseUsers)}</td>
                                                                <td className="p-2 text-right">
                                                                    {fmtCurrency(phaseRevenue, data.meta.currency)}
                                                                </td>
                                                                <td className="p-2 text-right">
                                                                    {fmtCurrency(phaseDeliveryCosts, data.meta.currency)}
                                                                </td>
                                                                <td className="p-2 text-right">
                                                                    {fmtCurrency(phaseAcqCosts, data.meta.currency)}
                                                                </td>
                                                                <td className="p-2 text-right">
                                                                    {fmtCurrency(phaseGrossMargin, data.meta.currency)}
                                                                </td>
                                                                <td className="p-2 text-right">
                                                                    {fmtCurrency(phaseNetProfit, data.meta.currency)}
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
    );
}
