import type { VentureData } from "../types";
import { TimelineView } from "../components/TimelineView";

type TimelinePageProps = {
    data: VentureData;
    month: number;
    setMonth: (month: number) => void;
};

export function TimelinePage({ data, month, setMonth }: TimelinePageProps) {
    return <TimelineView data={data} month={month} setMonth={setMonth} />;
}
