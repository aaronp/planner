import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Upload, RefreshCw, Edit, Save, X, Trash2, FolderOpen } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { VentureData } from "../types";
import { DEFAULT, getSavedModels, saveModel, deleteModel, loadModel, type SavedModel } from "../utils/storage";
import { useRisk } from "../contexts/RiskContext";

type DataPageProps = {
    data: VentureData;
    setData: (data: VentureData) => void;
};

export function DataPage({ data, setData }: DataPageProps) {
    const [copied, setCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedJson, setEditedJson] = useState("");
    const [validationError, setValidationError] = useState<string | null>(null);

    // Risk context
    const { multipliers, setMultipliers, distributionSelection, setDistributionSelection, streamDistributions, setStreamDistributions } = useRisk();

    // Model management state
    const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
    const [saveModelName, setSaveModelName] = useState("");
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Load saved models on mount
    useEffect(() => {
        setSavedModels(getSavedModels());
    }, []);

    const handleExport = () => {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.meta.name.toLowerCase().replace(/\s+/g, "-")}-plan.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const imported = JSON.parse(ev.target?.result as string);
                    setData(imported);
                } catch (err) {
                    alert("Invalid JSON file");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleReset = () => {
        if (confirm("Reset all data to default? This cannot be undone.")) {
            setData(DEFAULT);
        }
    };

    const handleCopy = async () => {
        const json = JSON.stringify(data, null, 2);
        await navigator.clipboard.writeText(json);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleStartEdit = () => {
        setEditedJson(JSON.stringify(data, null, 2));
        setValidationError(null);
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditedJson("");
        setValidationError(null);
    };

    const handleSaveEdit = () => {
        try {
            const parsed = JSON.parse(editedJson);

            // Basic validation - check for required fields
            if (!parsed.meta || !parsed.meta.name || !parsed.meta.currency) {
                throw new Error("Invalid data structure: missing required meta fields");
            }

            setData(parsed);
            setIsEditing(false);
            setEditedJson("");
            setValidationError(null);
        } catch (err) {
            setValidationError(err instanceof Error ? err.message : "Invalid JSON");
        }
    };

    const handleSaveModel = () => {
        if (!saveModelName.trim()) {
            return;
        }

        // Save with current risk settings
        const riskSettings = {
            multipliers,
            distributionSelection,
            streamDistributions,
        };

        saveModel(saveModelName.trim(), data, riskSettings);
        setSavedModels(getSavedModels());
        setSaveModelName("");
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    };

    const handleLoadModel = (id: string) => {
        const model = loadModel(id);
        if (model) {
            setData(model.data);

            // Restore risk settings if available
            if (model.riskSettings) {
                setMultipliers(model.riskSettings.multipliers);
                setDistributionSelection(model.riskSettings.distributionSelection);
                setStreamDistributions(model.riskSettings.streamDistributions);
            }
        }
    };

    const handleDeleteModel = (id: string) => {
        if (confirm("Are you sure you want to delete this saved model?")) {
            deleteModel(id);
            setSavedModels(getSavedModels());
        }
    };

    return (
        <div className="space-y-4">
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Data Management</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Export, import, or reset your venture plan data
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleExport} variant="outline" className="rounded-2xl">
                                <Download className="h-4 w-4 mr-2" />
                                Export JSON
                            </Button>
                            <Button onClick={handleImport} variant="outline" className="rounded-2xl">
                                <Upload className="h-4 w-4 mr-2" />
                                Import JSON
                            </Button>
                            <Button onClick={handleReset} variant="destructive" className="rounded-2xl">
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reset to Default
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Saved Models</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Save, load, and manage different versions of your plan
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Save current model */}
                    <div className="rounded-2xl border p-4 bg-muted/30">
                        <div className="text-sm font-medium mb-3">Save Current Model</div>
                        <div className="text-xs text-muted-foreground mb-3">
                            Saves your plan data along with all risk scenario settings (Bear/Expected/Bull and risk scales)
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Enter model name..."
                                value={saveModelName}
                                onChange={(e) => setSaveModelName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSaveModel();
                                    }
                                }}
                                className="rounded-2xl"
                            />
                            <Button
                                onClick={handleSaveModel}
                                disabled={!saveModelName.trim()}
                                className="rounded-2xl"
                            >
                                <Save className="h-4 w-4 mr-2" />
                                Save
                            </Button>
                        </div>
                        {saveSuccess && (
                            <div className="mt-2 text-sm text-green-600">
                                Model saved successfully!
                            </div>
                        )}
                    </div>

                    {/* List of saved models */}
                    <div>
                        <div className="text-sm font-medium mb-3">
                            Saved Models ({savedModels.length})
                        </div>
                        {savedModels.length === 0 ? (
                            <div className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">
                                No saved models yet. Save your current plan above to create one.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {savedModels.map((model) => (
                                    <div
                                        key={model.id}
                                        className="flex items-center justify-between rounded-2xl border p-3 bg-background hover:bg-muted/50 transition"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <div className="font-medium truncate">{model.name}</div>
                                                {model.riskSettings && (
                                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                                        {model.riskSettings.distributionSelection === 'min' ? 'Bear' :
                                                         model.riskSettings.distributionSelection === 'max' ? 'Bull' : 'Expected'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Saved {new Date(model.savedAt).toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="rounded-xl"
                                                onClick={() => handleLoadModel(model.id)}
                                            >
                                                <FolderOpen className="h-4 w-4 mr-2" />
                                                Load
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="rounded-xl"
                                                onClick={() => handleDeleteModel(model.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Raw JSON Data</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                {isEditing ? "Edit the JSON structure of your venture plan" : "View and edit the raw JSON structure of your venture plan"}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            {!isEditing ? (
                                <>
                                    <Button onClick={handleCopy} variant="outline" size="sm" className="rounded-2xl">
                                        {copied ? "Copied!" : "Copy to Clipboard"}
                                    </Button>
                                    <Button onClick={handleStartEdit} variant="outline" size="sm" className="rounded-2xl">
                                        <Edit className="h-4 w-4 mr-2" />
                                        Edit JSON
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button onClick={handleCancelEdit} variant="outline" size="sm" className="rounded-2xl">
                                        <X className="h-4 w-4 mr-2" />
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSaveEdit} variant="default" size="sm" className="rounded-2xl">
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Changes
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {validationError && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{validationError}</AlertDescription>
                        </Alert>
                    )}
                    {isEditing ? (
                        <textarea
                            value={editedJson}
                            onChange={(e) => setEditedJson(e.target.value)}
                            className="w-full rounded-2xl border bg-muted/30 p-4 text-xs font-mono min-h-[600px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                            spellCheck={false}
                        />
                    ) : (
                        <div className="rounded-2xl border bg-muted/30 p-4">
                            <pre className="text-xs overflow-auto max-h-[600px]">
                                <code>{JSON.stringify(data, null, 2)}</code>
                            </pre>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
