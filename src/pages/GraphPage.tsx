import type { VentureData } from "../types";
import { SnapshotView } from "../components/SnapshotView";

type GraphPageProps = {
    data: VentureData;
    month: number;
};

export function GraphPage({ data, month }: GraphPageProps) {
    return <SnapshotView data={data} month={month} />;
}
