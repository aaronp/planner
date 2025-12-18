import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
}: RiskScaleComponentProps) {
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

    return (
        <div className="grid gap-4">
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">Risk Scenario Adjustments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Distribution Selection for Revenue Streams */}
                    <div>
                        <Label className="text-sm font-medium">Revenue Stream Scenario</Label>
                        <Select value={distributionSelection} onValueChange={(v) => onDistributionSelectionChange(v as DistributionSelection)}>
                            <SelectTrigger className="rounded-2xl mt-2">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="min">Bear Case (Min)</SelectItem>
                                <SelectItem value="mode">Expected Case (Mode)</SelectItem>
                                <SelectItem value="max">Bull Case (Max)</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                            Selects which value to use from distribution ranges (CAC, acquisition rate, etc.)
                        </p>
                    </div>

                    {/* Revenue Streams */}
                    {data.revenueStreams && data.revenueStreams.length > 0 && (
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">Revenue Stream Multipliers</Label>
                            {data.revenueStreams.map((stream) => {
                                const multiplier = multipliers.revenueStreams[stream.id] ?? 1;
                                return (
                                    <div key={stream.id} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">{stream.name}</span>
                                            <span className="text-sm font-medium tabular-nums">{multiplier.toFixed(1)}x</span>
                                        </div>
                                        <Slider
                                            value={[multiplier]}
                                            min={0}
                                            max={5}
                                            step={0.1}
                                            onValueChange={(v) => updateRevenueStreamMultiplier(stream.id, v[0] ?? 1)}
                                            className="w-full"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Task Costs */}
                    {data.tasks && data.tasks.length > 0 && (
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">Task Cost Multipliers</Label>
                            {data.tasks.map((task) => {
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
                            <Label className="text-sm font-medium">Fixed Cost Multipliers</Label>
                            {data.costModel.fixedMonthlyCosts.map((fixedCost) => {
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
