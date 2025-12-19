import type { VentureData, RevenueStream, TimelineEvent } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { RevenueStreamsView } from "../components/RevenueStreamsView";

type RevenueStreamsPageProps = {
    data: VentureData;
    setRevenueStreams: (streams: RevenueStream[]) => void;
    setTimeline: (timeline: TimelineEvent[]) => void;
};

export function RevenueStreamsPage({ data, setRevenueStreams, setTimeline }: RevenueStreamsPageProps) {
    return (
        <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-6">
                <RevenueStreamsView
                    revenueStreams={data.revenueStreams ?? []}
                    markets={data.markets ?? []}
                    timeline={data.timeline ?? []}
                    onChange={setRevenueStreams}
                    onChangeTimeline={setTimeline}
                    horizonMonths={data.meta.horizonMonths}
                    ventureStart={data.meta.start}
                    currency={data.meta.currency}
                />
            </CardContent>
        </Card>
    );
}
