import { useState } from "react";
import type { VentureData, Phase } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { isValidDuration } from "../utils/taskUtils";

type PhasesPageProps = {
    data: VentureData;
    setPhases: (phases: Phase[]) => void;
};

export function PhasesPage({ data, setPhases }: PhasesPageProps) {
    const phases = data.phases ?? [];

    const getNextPhaseId = () => {
        const phaseNumbers = phases
            .map((p) => {
                const match = p.id.match(/^PH(\d+)$/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter((n) => !isNaN(n));
        const maxNum = phaseNumbers.length > 0 ? Math.max(...phaseNumbers) : 0;
        return `PH${maxNum + 1}`;
    };

    const defaultColors = [
        "#8b5cf6", // Purple
        "#3b82f6", // Blue
        "#10b981", // Green
        "#f59e0b", // Orange
        "#ef4444", // Red
        "#ec4899", // Pink
        "#14b8a6", // Teal
        "#f97316", // Deep Orange
    ];

    const handleAddPhase = () => {
        const newPhase: Phase = {
            id: getNextPhaseId(),
            name: "New Phase",
            duration: "6m",
            color: defaultColors[phases.length % defaultColors.length]!,
        };
        setPhases([...phases, newPhase]);
    };

    return (
        <div className="space-y-4">
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Timeline Phases</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Define colored timeline phases that appear as backgrounds across all views
                            </p>
                        </div>
                        <Button onClick={handleAddPhase} className="rounded-2xl">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Phase
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {phases.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground mb-4">No phases defined yet</p>
                            <Button onClick={handleAddPhase} variant="outline" className="rounded-2xl">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Your First Phase
                            </Button>
                        </div>
                    ) : (
                        <DataTable<Phase>
                            title="Phases"
                            rows={phases}
                            setRows={setPhases}
                            addRow={() => ({
                                id: getNextPhaseId(),
                                name: "New Phase",
                                duration: "6m",
                                color: defaultColors[phases.length % defaultColors.length]!,
                            })}
                            columns={[
                                {
                                    key: "id",
                                    header: "ID",
                                    width: "110px",
                                    render: (v) => <span className="text-sm font-mono">{v}</span>,
                                },
                                { key: "name", header: "Name", width: "260px", input: "text" },
                                {
                                    key: "duration",
                                    header: "Duration (e.g., 6m, 12m)",
                                    width: "200px",
                                    render: (v, row) => {
                                        const isValid = isValidDuration(v || "");
                                        return (
                                            <div>
                                                <Input
                                                    className={`h-8 rounded-xl ${!isValid ? "bg-red-50 border-red-300" : ""}`}
                                                    value={v || ""}
                                                    placeholder="e.g., 6m, 12m"
                                                    title={!isValid ? "Invalid format. Use: 6m, 12m, 1y" : ""}
                                                    onChange={(e) => {
                                                        setPhases(phases.map((p) => (p.id === row.id ? { ...p, duration: e.target.value } : p)));
                                                    }}
                                                />
                                                {!isValid && v && (
                                                    <div className="text-xs text-red-600 mt-1">Invalid format</div>
                                                )}
                                            </div>
                                        );
                                    },
                                },
                                {
                                    key: "color",
                                    header: "Color",
                                    width: "150px",
                                    render: (v, row) => (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="color"
                                                className="h-8 w-16 rounded-xl cursor-pointer"
                                                value={v || "#3b82f6"}
                                                onChange={(e) => {
                                                    setPhases(phases.map((p) => (p.id === row.id ? { ...p, color: e.target.value } : p)));
                                                }}
                                            />
                                            <div
                                                className="h-8 flex-1 rounded-xl border"
                                                style={{ backgroundColor: `${v}20`, borderColor: `${v}60` }}
                                            >
                                                <div className="h-full flex items-center justify-center text-xs font-medium" style={{ color: v }}>
                                                    Preview
                                                </div>
                                            </div>
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Phase Preview */}
            {phases.length > 0 && (
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Phase Timeline Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="relative h-24 rounded-2xl border bg-background overflow-hidden">
                            {/* Month markers */}
                            <div className="absolute inset-0 pointer-events-none opacity-40">
                                {Array.from({ length: Math.min(data.meta.horizonMonths + 1, 61) }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="absolute top-0 bottom-0 w-px bg-border"
                                        style={{ left: `${(i / data.meta.horizonMonths) * 100}%` }}
                                    />
                                ))}
                            </div>

                            {/* Phase backgrounds */}
                            {phases.map((phase, idx) => {
                                // Calculate start month based on previous phases
                                let startMonth = 0;
                                for (let i = 0; i < idx; i++) {
                                    const prevPhase = phases[i]!;
                                    const match = prevPhase.duration.match(/^(\d+)([dwmy])$/);
                                    if (match) {
                                        const value = parseInt(match[1]!, 10);
                                        const unit = match[2]!;
                                        if (unit === "d") startMonth += value / 30;
                                        else if (unit === "w") startMonth += value / 4;
                                        else if (unit === "m") startMonth += value;
                                        else if (unit === "y") startMonth += value * 12;
                                    }
                                }

                                // Calculate duration for this phase
                                const match = phase.duration.match(/^(\d+)([dwmy])$/);
                                let durationMonths = 0;
                                if (match) {
                                    const value = parseInt(match[1]!, 10);
                                    const unit = match[2]!;
                                    if (unit === "d") durationMonths = value / 30;
                                    else if (unit === "w") durationMonths = value / 4;
                                    else if (unit === "m") durationMonths = value;
                                    else if (unit === "y") durationMonths = value * 12;
                                }

                                const endMonth = startMonth + durationMonths;
                                const leftPct = (startMonth / data.meta.horizonMonths) * 100;
                                const widthPct = (durationMonths / data.meta.horizonMonths) * 100;

                                return (
                                    <div
                                        key={phase.id}
                                        className="absolute inset-y-0"
                                        style={{
                                            left: `${leftPct}%`,
                                            width: `${widthPct}%`,
                                            background: `${phase.color}15`,
                                            borderLeft: `2px solid ${phase.color}50`,
                                            borderRight: `2px solid ${phase.color}50`,
                                        }}
                                    >
                                        <div className="p-2">
                                            <div className="text-xs font-medium" style={{ color: phase.color }}>
                                                {phase.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                M{Math.round(startMonth)} → M{Math.round(endMonth)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
