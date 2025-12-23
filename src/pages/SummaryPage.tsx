import type { VentureData } from "../types";
import { SummaryView } from "../components/SummaryView";
import { TimelineView } from "../components/TimelineView";
import { GraphPage } from "./GraphPage";
import { TablePage } from "./TablePage";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LayoutDashboard, Calendar, BarChart3, Table } from "lucide-react";

type SummaryPageProps = {
    data: VentureData;
    month: number;
};

export function SummaryPage({ data, month }: SummaryPageProps) {
    return (
        <Tabs defaultValue="dashboard" className="w-full">
            <TabsList className="mb-4">
                <TabsTrigger value="dashboard">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Dashboard
                </TabsTrigger>
                <TabsTrigger value="timeline">
                    <Calendar className="h-4 w-4 mr-2" />
                    Timeline
                </TabsTrigger>
                <TabsTrigger value="graph">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Graph
                </TabsTrigger>
                <TabsTrigger value="table">
                    <Table className="h-4 w-4 mr-2" />
                    Table
                </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
                <SummaryView data={data} month={month} />
            </TabsContent>

            <TabsContent value="timeline">
                <TimelineView data={data} month={month} />
            </TabsContent>

            <TabsContent value="graph">
                <GraphPage data={data} month={month} />
            </TabsContent>

            <TabsContent value="table">
                <TablePage data={data} month={month} />
            </TabsContent>
        </Tabs>
    );
}
