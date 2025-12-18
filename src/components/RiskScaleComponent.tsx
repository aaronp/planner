import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { VentureData } from "../types";

export type RiskMultipliers = {
    tasks: Record<string, number>; // taskId -> multiplier
    fixedCosts: Record<string, number>; // fixedCostId -> multiplier
    revenueStreams: Record<string, number>; // streamId -> multiplier
};

export type DistributionSelection = "min" | "mode" | "max";

type RiskScaleComponentProps = {
    data: VentureData;
    multipliers: RiskMultipliers;
    onMultipliersChange: (multipliers: RiskMultipliers) => void;
    distributionSelection: DistributionSelection;
    onDistributionSelectionChange: (selection: DistributionSelection) => void;
    streamDistributions: Record<string, DistributionSelection>;
    onStreamDistributionsChange: (distributions: Record<string, DistributionSelection>) => void;
};

export function RiskScaleComponent({
    data,
    multipliers,
    onMultipliersChange,
    distributionSelection,
    onDistributionSelectionChange,
    streamDistributions,
    onStreamDistributionsChange,
}: RiskScaleComponentProps) {
    const [tasksCollapsed, setTasksCollapsed] = useState(false);
    const [fixedCostsCollapsed, setFixedCostsCollapsed] = useState(false);
    const [revenueStreamsCollapsed, setRevenueStreamsCollapsed] = useState(false);

    // Load stream colors from localStorage
    const [streamColors, setStreamColors] = useState<Map<string, string>>(() => {
        const stored = localStorage.getItem("streamColors");
        if (stored) {
            try {
                const obj = JSON.parse(stored);
                return new Map(Object.entries(obj));
            } catch {
                return new Map();
            }
        }
        return new Map();
    });

    // Listen for color changes from other components
    useEffect(() => {
        const handleColorChange = () => {
            const stored = localStorage.getItem("streamColors");
            if (stored) {
                try {
                    const obj = JSON.parse(stored);
                    setStreamColors(new Map(Object.entries(obj)));
                } catch {
                    // ignore
                }
            }
        };
        window.addEventListener("streamColorsChanged", handleColorChange);
        return () => window.removeEventListener("streamColorsChanged", handleColorChange);
    }, []);

    const updateTaskMultiplier = (taskId: string, value: number) => {
        onMultipliersChange({
            ...multipliers,
            tasks: { ...multipliers.tasks, [taskId]: value },
        });
    };

    const updateFixedCostMultiplier = (fixedCostId: string, value: number) => {
        onMultipliersChange({
            ...multipliers,
            fixedCosts: { ...multipliers.fixedCosts, [fixedCostId]: value },
        });
    };

    const updateRevenueStreamMultiplier = (streamId: string, value: number) => {
        onMultipliersChange({
            ...multipliers,
            revenueStreams: { ...multipliers.revenueStreams, [streamId]: value },
        });
    };

    const updateStreamDistribution = (streamId: string, selection: DistributionSelection) => {
        onStreamDistributionsChange({
            ...streamDistributions,
            [streamId]: selection,
        });
    };

    return (
        <div className="grid gap-4">
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">Risk Scenario Adjustments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Revenue Streams */}
                    {data.revenueStreams && data.revenueStreams.length > 0 && (
                        <div className="space-y-4">
                            <div
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => setRevenueStreamsCollapsed(!revenueStreamsCollapsed)}
                            >
                                <Label className="text-sm font-medium cursor-pointer">Revenue Streams</Label>
                                {revenueStreamsCollapsed ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronUp className="h-4 w-4" />
                                )}
                            </div>
                            {!revenueStreamsCollapsed && data.revenueStreams.map((stream) => {
                                const multiplier = multipliers.revenueStreams[stream.id] ?? 1;
                                const distribution = streamDistributions[stream.id] ?? "mode";
                                const color = streamColors.get(stream.id) || "#4f46e5";
                                return (
                                    <div
                                        key={stream.id}
                                        className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 items-center p-3 border rounded-2xl"
                                        style={{ backgroundColor: `${color}15` }}
                                    >
                                        <span className="text-sm font-medium">{stream.name}</span>

                                        <Select
                                            value={distribution}
                                            onValueChange={(v) => updateStreamDistribution(stream.id, v as DistributionSelection)}
                                        >
                                            <SelectTrigger className="rounded-2xl h-8 text-xs w-[140px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="min">Bear (Min)</SelectItem>
                                                <SelectItem value="mode">Expected (Mode)</SelectItem>
                                                <SelectItem value="max">Bull (Max)</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <Slider
                                            value={[multiplier]}
                                            min={0}
                                            max={5}
                                            step={0.1}
                                            onValueChange={(v) => updateRevenueStreamMultiplier(stream.id, v[0] ?? 1)}
                                            className="w-full"
                                        />

                                        <span className="text-sm font-medium tabular-nums w-12 text-right">{multiplier.toFixed(1)}x</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Task Costs */}
                    {data.tasks && data.tasks.length > 0 && (
                        <div className="space-y-3">
                            <div
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => setTasksCollapsed(!tasksCollapsed)}
                            >
                                <Label className="text-sm font-medium cursor-pointer">Task Cost Multipliers</Label>
                                {tasksCollapsed ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronUp className="h-4 w-4" />
                                )}
                            </div>
                            {!tasksCollapsed && data.tasks.map((task) => {
                                const multiplier = multipliers.tasks[task.id] ?? 1;
                                return (
                                    <div key={task.id} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">{task.name}</span>
                                            <span className="text-sm font-medium tabular-nums">{multiplier.toFixed(1)}x</span>
                                        </div>
                                        <Slider
                                            value={[multiplier]}
                                            min={0}
                                            max={5}
                                            step={0.1}
                                            onValueChange={(v) => updateTaskMultiplier(task.id, v[0] ?? 1)}
                                            className="w-full"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Fixed Costs */}
                    {data.costModel?.fixedMonthlyCosts && data.costModel.fixedMonthlyCosts.length > 0 && (
                        <div className="space-y-3">
                            <div
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => setFixedCostsCollapsed(!fixedCostsCollapsed)}
                            >
                                <Label className="text-sm font-medium cursor-pointer">Fixed Cost Multipliers</Label>
                                {fixedCostsCollapsed ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronUp className="h-4 w-4" />
                                )}
                            </div>
                            {!fixedCostsCollapsed && data.costModel.fixedMonthlyCosts.map((fixedCost) => {
                                const multiplier = multipliers.fixedCosts[fixedCost.id] ?? 1;
                                return (
                                    <div key={fixedCost.id} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">{fixedCost.name}</span>
                                            <span className="text-sm font-medium tabular-nums">{multiplier.toFixed(1)}x</span>
                                        </div>
                                        <Slider
                                            value={[multiplier]}
                                            min={0}
                                            max={5}
                                            step={0.1}
                                            onValueChange={(v) => updateFixedCostMultiplier(fixedCost.id, v[0] ?? 1)}
                                            className="w-full"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
