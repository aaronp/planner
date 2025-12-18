import type { VentureData } from "../types";
import { SummaryView } from "../components/SummaryView";

type SummaryPageProps = {
    data: VentureData;
    month: number;
};

export function SummaryPage({ data, month }: SummaryPageProps) {
    return <SummaryView data={data} month={month} />;
}
