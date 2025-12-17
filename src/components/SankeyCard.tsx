import { useMemo } from "react";
import { ResponsiveContainer, Sankey } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VentureData } from "../types";
import { buildSankeyForMonth } from "../utils/modelEngine";
import { formatMonthLabel } from "../utils/dateUtils";
import { fmtCurrency } from "../utils/formatUtils";

export function SankeyCard({ data, month }: { data: VentureData; month: number }) {
    const { currency, start } = data.meta;
    const sankey = useMemo(() => buildSankeyForMonth(data, month), [data, month]);

    return (
        <Card className="rounded-2xl shadow-sm">
            <CardHeader>
                <CardTitle className="text-base">Sankey (Costs → Segment revenue)</CardTitle>
                <div className="text-sm text-muted-foreground">
                    {formatMonthLabel(start, month)} · Revenue {fmtCurrency(sankey.totals.totalRev, currency)} · Costs{" "}
                    {fmtCurrency(sankey.totals.totalCosts, currency)}
                </div>
            </CardHeader>
            <CardContent className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                    <Sankey data={sankey} nodePadding={18} margin={{ left: 8, right: 8, top: 8, bottom: 8 }} />
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
