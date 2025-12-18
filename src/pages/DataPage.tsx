import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, RefreshCw } from "lucide-react";
import type { VentureData } from "../types";
import { DEFAULT } from "../utils/storage";

type DataPageProps = {
    data: VentureData;
    setData: (data: VentureData) => void;
};

export function DataPage({ data, setData }: DataPageProps) {
    const [copied, setCopied] = useState(false);

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
                            <CardTitle className="text-lg">Raw JSON Data</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                View the raw JSON structure of your venture plan
                            </p>
                        </div>
                        <Button onClick={handleCopy} variant="outline" size="sm" className="rounded-2xl">
                            {copied ? "Copied!" : "Copy to Clipboard"}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-2xl border bg-muted/30 p-4">
                        <pre className="text-xs overflow-auto max-h-[600px]">
                            <code>{JSON.stringify(data, null, 2)}</code>
                        </pre>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
