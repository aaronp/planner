import type { VentureData } from "../types";
import { TimelineView } from "../components/TimelineView";

type TimelinePageProps = {
    data: VentureData;
    month: number;
};

export function TimelinePage({ data, month }: TimelinePageProps) {
    return <TimelineView data={data} month={month} />;
}
