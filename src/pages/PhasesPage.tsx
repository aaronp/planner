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

    const createNewPhaseWithFixup = (currentPhases: Phase[]): Phase[] => {
        // If the last phase doesn't have a valid duration, set it to 6m
        let updatedPhases = [...currentPhases];
        if (currentPhases.length > 0) {
            const lastPhase = currentPhases[currentPhases.length - 1]!;
            const hasValidDuration = lastPhase.duration && isValidDuration(lastPhase.duration);
            if (!hasValidDuration) {
                updatedPhases = currentPhases.map((p, idx) =>
                    idx === currentPhases.length - 1 ? { ...p, duration: "6m" } : p
                );
            }
        }

        const newPhase: Phase = {
            id: getNextPhaseId(),
            name: "New Phase",
            duration: "6m",
            color: defaultColors[updatedPhases.length % defaultColors.length]!,
        };
        return [...updatedPhases, newPhase];
    };

    const handleAddPhase = () => {
        setPhases(createNewPhaseWithFixup(phases));
    };

    return (
        <div className="space-y-4">
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Phases</CardTitle>
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
                        <div className="overflow-x-auto rounded-2xl border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 sticky top-0">
                                    <tr className="border-b">
                                        <th className="text-left p-2 font-medium">ID</th>
                                        <th className="text-left p-2 font-medium">Name</th>
                                        <th className="text-left p-2 font-medium">Duration (e.g., 6m, 12m)</th>
                                        <th className="text-left p-2 font-medium">Color</th>
                                        <th className="w-12"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {phases.map((phase) => (
                                        <tr key={phase.id} className="border-b last:border-b-0 hover:bg-muted/30">
                                            <td className="p-2">
                                                <span className="text-sm font-mono">{phase.id}</span>
                                            </td>
                                            <td className="p-2">
                                                <Input
                                                    className="h-8 rounded-xl"
                                                    value={phase.name}
                                                    onChange={(e) => {
                                                        setPhases(phases.map((p) => (p.id === phase.id ? { ...p, name: e.target.value } : p)));
                                                    }}
                                                />
                                            </td>
                                            <td className="p-2">
                                                <div>
                                                    <Input
                                                        className={`h-8 rounded-xl ${!isValidDuration(phase.duration || "") ? "bg-red-50 border-red-300" : ""}`}
                                                        value={phase.duration || ""}
                                                        placeholder="e.g., 6m, 12m"
                                                        title={!isValidDuration(phase.duration || "") ? "Invalid format. Use: 6m, 12m, 1y" : ""}
                                                        onChange={(e) => {
                                                            setPhases(phases.map((p) => (p.id === phase.id ? { ...p, duration: e.target.value } : p)));
                                                        }}
                                                    />
                                                    {!isValidDuration(phase.duration || "") && phase.duration && (
                                                        <div className="text-xs text-red-600 mt-1">Invalid format</div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-2">
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="color"
                                                        className="h-8 w-16 rounded-xl cursor-pointer"
                                                        value={phase.color || "#3b82f6"}
                                                        onChange={(e) => {
                                                            setPhases(phases.map((p) => (p.id === phase.id ? { ...p, color: e.target.value } : p)));
                                                        }}
                                                    />
                                                    <div
                                                        className="h-8 flex-1 rounded-xl border"
                                                        style={{ backgroundColor: `${phase.color}20`, borderColor: `${phase.color}60` }}
                                                    >
                                                        <div className="h-full flex items-center justify-center text-xs font-medium" style={{ color: phase.color }}>
                                                            Preview
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setPhases(phases.filter((p) => p.id !== phase.id));
                                                    }}
                                                    className="h-8 w-8 p-0 rounded-xl text-destructive hover:bg-destructive/10"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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
                                let isEndless = false;
                                if (match) {
                                    const value = parseInt(match[1]!, 10);
                                    const unit = match[2]!;
                                    if (unit === "d") durationMonths = value / 30;
                                    else if (unit === "w") durationMonths = value / 4;
                                    else if (unit === "m") durationMonths = value;
                                    else if (unit === "y") durationMonths = value * 12;
                                } else {
                                    // No valid duration - make it endless (extend to horizon)
                                    durationMonths = data.meta.horizonMonths - startMonth;
                                    isEndless = true;
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
