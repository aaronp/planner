import type { VentureData } from "../types";
import { SummaryView } from "../components/SummaryView";

type SummaryPageProps = {
    data: VentureData;
};

export function SummaryPage({ data }: SummaryPageProps) {
    return <SummaryView data={data} />;
}
