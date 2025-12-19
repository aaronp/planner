import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import type { SavedModel } from "../utils/storage";
import type { VentureData, Task, FixedCost, RevenueStream } from "../types";
import { uid } from "../utils/formatUtils";

type ImportModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    savedModels: SavedModel[];
    currentData: VentureData;
    onImport: (data: VentureData, riskSettings?: SavedModel["riskSettings"]) => void;
};

export function ImportModelModal({ open, onOpenChange, savedModels, currentData, onImport }: ImportModalProps) {
    const [selectedModelId, setSelectedModelId] = useState<string>("");
    const [selectedModel, setSelectedModel] = useState<SavedModel | null>(null);

    // Selection state
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
    const [selectedFixedCosts, setSelectedFixedCosts] = useState<Set<string>>(new Set());
    const [selectedStreams, setSelectedStreams] = useState<Set<string>>(new Set());
    const [importRiskSettings, setImportRiskSettings] = useState(true);

    // Merge vs Overwrite mode
    const [mergeMode, setMergeMode] = useState(true); // true = merge, false = overwrite

    // Update selected model when ID changes
    useEffect(() => {
        const model = savedModels.find((m) => m.id === selectedModelId);
        setSelectedModel(model || null);

        // Reset selections when model changes
        if (model) {
            setSelectedTasks(new Set(model.data.tasks?.map((t) => t.id) || []));
            setSelectedFixedCosts(new Set(model.data.costModel?.fixedMonthlyCosts?.map((c) => c.id) || []));
            setSelectedStreams(new Set(model.data.revenueStreams?.map((s) => s.id) || []));
            setImportRiskSettings(!!model.riskSettings);
        }
    }, [selectedModelId, savedModels]);

    const handleImport = () => {
        if (!selectedModel) return;

        let resultData: VentureData;

        if (mergeMode) {
            // MERGE MODE: Add selected items to current data with new IDs
            const idMap = new Map<string, string>(); // old ID -> new ID

            // Merge tasks
            const importedTasks = (selectedModel.data.tasks || [])
                .filter((t) => selectedTasks.has(t.id))
                .map((task) => {
                    const newId = uid("T");
                    idMap.set(task.id, newId);
                    return { ...task, id: newId };
                });

            // Update dependsOn references in imported tasks
            const updatedTasks = importedTasks.map((task) => ({
                ...task,
                dependsOn: task.dependsOn?.map((dep) => {
                    // Parse dependency format: "T1" or "T1:end" or "T1:end+1w"
                    const match = dep.match(/^([^:]+)(.*)/);
                    if (match) {
                        const oldId = match[1];
                        const suffix = match[2] || "";
                        const newId = idMap.get(oldId!);
                        return newId ? `${newId}${suffix}` : dep;
                    }
                    return dep;
                }),
            }));

            // Merge fixed costs
            const importedFixedCosts = (selectedModel.data.costModel?.fixedMonthlyCosts || [])
                .filter((c) => selectedFixedCosts.has(c.id))
                .map((cost) => {
                    const newId = uid("FC");
                    idMap.set(cost.id, newId);
                    // Update startEventId if it references an imported task
                    const startEventId = cost.startEventId && idMap.get(cost.startEventId);
                    return { ...cost, id: newId, startEventId: startEventId || cost.startEventId };
                });

            // Merge revenue streams
            const importedStreams = (selectedModel.data.revenueStreams || [])
                .filter((s) => selectedStreams.has(s.id))
                .map((stream) => {
                    const newId = uid("RS");
                    idMap.set(stream.id, newId);
                    // Update unlockEventId if it references a timeline event
                    return { ...stream, id: newId };
                });

            resultData = {
                ...currentData,
                tasks: [...(currentData.tasks || []), ...updatedTasks],
                costModel: {
                    ...currentData.costModel,
                    fixedMonthlyCosts: [
                        ...(currentData.costModel?.fixedMonthlyCosts || []),
                        ...importedFixedCosts,
                    ],
                },
                revenueStreams: [...(currentData.revenueStreams || []), ...importedStreams],
            };
        } else {
            // OVERWRITE MODE: Replace current data with selected items
            const importedTasks = (selectedModel.data.tasks || []).filter((t) => selectedTasks.has(t.id));
            const importedFixedCosts = (selectedModel.data.costModel?.fixedMonthlyCosts || []).filter((c) =>
                selectedFixedCosts.has(c.id)
            );
            const importedStreams = (selectedModel.data.revenueStreams || []).filter((s) =>
                selectedStreams.has(s.id)
            );

            resultData = {
                ...currentData,
                tasks: importedTasks,
                costModel: {
                    ...currentData.costModel,
                    fixedMonthlyCosts: importedFixedCosts,
                },
                revenueStreams: importedStreams,
            };
        }

        // Import risk settings if selected
        const riskSettings = importRiskSettings ? selectedModel.riskSettings : undefined;

        onImport(resultData, riskSettings);
        onOpenChange(false);
    };

    // Toggle handlers
    const toggleAllTasks = () => {
        if (!selectedModel?.data.tasks) return;
        const allTaskIds = new Set(selectedModel.data.tasks.map((t) => t.id));
        if (selectedTasks.size === allTaskIds.size) {
            setSelectedTasks(new Set());
        } else {
            setSelectedTasks(allTaskIds);
        }
    };

    const toggleAllFixedCosts = () => {
        if (!selectedModel?.data.costModel?.fixedMonthlyCosts) return;
        const allCostIds = new Set(selectedModel.data.costModel.fixedMonthlyCosts.map((c) => c.id));
        if (selectedFixedCosts.size === allCostIds.size) {
            setSelectedFixedCosts(new Set());
        } else {
            setSelectedFixedCosts(allCostIds);
        }
    };

    const toggleAllStreams = () => {
        if (!selectedModel?.data.revenueStreams) return;
        const allStreamIds = new Set(selectedModel.data.revenueStreams.map((s) => s.id));
        if (selectedStreams.size === allStreamIds.size) {
            setSelectedStreams(new Set());
        } else {
            setSelectedStreams(allStreamIds);
        }
    };

    const tasksCount = selectedModel?.data.tasks?.length || 0;
    const costsCount = selectedModel?.data.costModel?.fixedMonthlyCosts?.length || 0;
    const streamsCount = selectedModel?.data.revenueStreams?.length || 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl">
                <DialogHeader>
                    <DialogTitle>Import from Saved Model</DialogTitle>
                    <DialogDescription>
                        Select a saved model and choose which items to import
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    {/* Model Selection */}
                    <div className="space-y-2">
                        <Label>Saved Model</Label>
                        <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                            <SelectTrigger className="rounded-2xl">
                                <SelectValue placeholder="Select a saved model..." />
                            </SelectTrigger>
                            <SelectContent>
                                {savedModels.map((model) => (
                                    <SelectItem key={model.id} value={model.id}>
                                        {model.name} ({new Date(model.savedAt).toLocaleDateString()})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedModel && (
                        <>
                            <Separator />

                            {/* Merge/Overwrite Toggle */}
                            <div className="rounded-2xl border p-4 bg-muted/30">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium">Import Mode</div>
                                        <div className="text-sm text-muted-foreground">
                                            {mergeMode
                                                ? "Merge: Add imported items to your current data"
                                                : "Overwrite: Replace your current data with imported items"}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-medium">Overwrite</span>
                                        <Switch checked={mergeMode} onCheckedChange={setMergeMode} />
                                        <span className="text-sm font-medium">Merge</span>
                                    </div>
                                </div>
                            </div>

                            {/* Tasks */}
                            {tasksCount > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-base">Tasks ({selectedTasks.size}/{tasksCount})</Label>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={toggleAllTasks}
                                            className="rounded-xl"
                                        >
                                            {selectedTasks.size === tasksCount ? "Deselect All" : "Select All"}
                                        </Button>
                                    </div>
                                    <div className="rounded-2xl border p-3 max-h-40 overflow-y-auto space-y-2">
                                        {selectedModel.data.tasks?.map((task) => (
                                            <div key={task.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`task-${task.id}`}
                                                    checked={selectedTasks.has(task.id)}
                                                    onCheckedChange={(checked) => {
                                                        const newSet = new Set(selectedTasks);
                                                        if (checked) {
                                                            newSet.add(task.id);
                                                        } else {
                                                            newSet.delete(task.id);
                                                        }
                                                        setSelectedTasks(newSet);
                                                    }}
                                                />
                                                <label
                                                    htmlFor={`task-${task.id}`}
                                                    className="text-sm cursor-pointer flex-1"
                                                >
                                                    {task.name}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Fixed Costs */}
                            {costsCount > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-base">
                                            Fixed Costs ({selectedFixedCosts.size}/{costsCount})
                                        </Label>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={toggleAllFixedCosts}
                                            className="rounded-xl"
                                        >
                                            {selectedFixedCosts.size === costsCount ? "Deselect All" : "Select All"}
                                        </Button>
                                    </div>
                                    <div className="rounded-2xl border p-3 max-h-40 overflow-y-auto space-y-2">
                                        {selectedModel.data.costModel?.fixedMonthlyCosts?.map((cost) => (
                                            <div key={cost.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`cost-${cost.id}`}
                                                    checked={selectedFixedCosts.has(cost.id)}
                                                    onCheckedChange={(checked) => {
                                                        const newSet = new Set(selectedFixedCosts);
                                                        if (checked) {
                                                            newSet.add(cost.id);
                                                        } else {
                                                            newSet.delete(cost.id);
                                                        }
                                                        setSelectedFixedCosts(newSet);
                                                    }}
                                                />
                                                <label
                                                    htmlFor={`cost-${cost.id}`}
                                                    className="text-sm cursor-pointer flex-1"
                                                >
                                                    {cost.name}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Revenue Streams */}
                            {streamsCount > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-base">
                                            Revenue Streams ({selectedStreams.size}/{streamsCount})
                                        </Label>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={toggleAllStreams}
                                            className="rounded-xl"
                                        >
                                            {selectedStreams.size === streamsCount ? "Deselect All" : "Select All"}
                                        </Button>
                                    </div>
                                    <div className="rounded-2xl border p-3 max-h-40 overflow-y-auto space-y-2">
                                        {selectedModel.data.revenueStreams?.map((stream) => (
                                            <div key={stream.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`stream-${stream.id}`}
                                                    checked={selectedStreams.has(stream.id)}
                                                    onCheckedChange={(checked) => {
                                                        const newSet = new Set(selectedStreams);
                                                        if (checked) {
                                                            newSet.add(stream.id);
                                                        } else {
                                                            newSet.delete(stream.id);
                                                        }
                                                        setSelectedStreams(newSet);
                                                    }}
                                                />
                                                <label
                                                    htmlFor={`stream-${stream.id}`}
                                                    className="text-sm cursor-pointer flex-1"
                                                >
                                                    {stream.name}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Risk Settings */}
                            {selectedModel.riskSettings && (
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="import-risk"
                                        checked={importRiskSettings}
                                        onCheckedChange={(checked) => setImportRiskSettings(!!checked)}
                                    />
                                    <label htmlFor="import-risk" className="text-sm cursor-pointer">
                                        Import risk scenario settings (
                                        {selectedModel.riskSettings.distributionSelection === "min"
                                            ? "Bear"
                                            : selectedModel.riskSettings.distributionSelection === "max"
                                            ? "Bull"
                                            : "Expected"}
                                        )
                                    </label>
                                </div>
                            )}

                            <Separator />

                            {/* Action Buttons */}
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-2xl">
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleImport}
                                    disabled={
                                        selectedTasks.size === 0 &&
                                        selectedFixedCosts.size === 0 &&
                                        selectedStreams.size === 0 &&
                                        !importRiskSettings
                                    }
                                    className="rounded-2xl"
                                >
                                    Import Selected
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
