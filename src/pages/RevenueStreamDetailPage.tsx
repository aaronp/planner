import { useParams, useNavigate } from "react-router-dom";
import type { VentureData, RevenueStream, TimelineEvent } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
        </div>
    );
}
