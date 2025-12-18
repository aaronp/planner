import { useParams, useNavigate } from "react-router-dom";
import type { VentureData, RevenueStream, TimelineEvent, Assumption, Risk } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "../components/DataTable";
import { ArrowLeft } from "lucide-react";

type RevenueStreamDetailPageProps = {
    data: VentureData;
    setRevenueStreams: (streams: RevenueStream[]) => void;
    setTimeline: (timeline: TimelineEvent[]) => void;
};

export function RevenueStreamDetailPage({ data, setRevenueStreams, setTimeline }: RevenueStreamDetailPageProps) {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const stream = (data.revenueStreams ?? []).find((s) => s.id === id);

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
        const streams = data.revenueStreams ?? [];
        setRevenueStreams(
            streams.map((s) => (s.id === id ? { ...s, assumptions } : s))
        );
    };

    const setRisks = (risks: Risk[]) => {
        const streams = data.revenueStreams ?? [];
        setRevenueStreams(
            streams.map((s) => (s.id === id ? { ...s, risks } : s))
        );
    };

    if (!stream) {
        return (
            <Card className="rounded-2xl shadow-sm mt-4">
                <CardContent className="p-8 text-center">
                    <p className="text-lg text-muted-foreground">Revenue stream not found</p>
                    <Button onClick={() => navigate("/data")} className="mt-4 rounded-2xl">
                        Back to Data
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate("/data")}
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

            <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-6">
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-semibold mb-2">Overview</h3>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <p className="text-sm text-muted-foreground">Market</p>
                                    <p className="font-medium">
                                        {data.markets?.find((m) => m.id === stream.marketId)?.name ?? stream.marketId}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Pricing Model</p>
                                    <p className="font-medium capitalize">{stream.pricingModel}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Revenue Unit</p>
                                    <p className="font-medium">{stream.revenueUnit}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Unlock Event</p>
                                    <p className="font-medium">
                                        {data.timeline?.find((t) => t.id === stream.unlockEventId)?.name ??
                                            stream.unlockEventId ??
                                            "N/A"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold mb-2">Unit Economics</h3>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <p className="text-sm text-muted-foreground">Delivery Cost Model</p>
                                    <p className="font-medium capitalize">
                                        {stream.unitEconomics.deliveryCostModel.type === "grossMargin"
                                            ? "Gross Margin"
                                            : "Per Unit Cost"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Billing Frequency</p>
                                    <p className="font-medium capitalize">{stream.unitEconomics.billingFrequency}</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold mb-2">Adoption Model</h3>
                            <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                    <p className="text-sm text-muted-foreground">Initial Units</p>
                                    <p className="font-medium">{stream.adoptionModel.initialUnits}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Max Units (SOM)</p>
                                    <p className="font-medium">{stream.adoptionModel.maxUnits ?? "Unlimited"}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-6">
                    <Tabs defaultValue="assumptions" className="w-full">
                        <TabsList className="rounded-2xl">
                            <TabsTrigger value="assumptions" className="rounded-2xl">
                                Assumptions
                            </TabsTrigger>
                            <TabsTrigger value="risks" className="rounded-2xl">
                                Risks
                            </TabsTrigger>
                        </TabsList>

                        {/* Assumptions Tab */}
                        <TabsContent value="assumptions" className="mt-4">
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
                        </TabsContent>

                        {/* Risks Tab */}
                        <TabsContent value="risks" className="mt-4">
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
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
