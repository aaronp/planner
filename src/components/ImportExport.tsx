import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, Upload, RefreshCcw } from "lucide-react";
import type { VentureData } from "../types";
import { DEFAULT } from "../utils/storage";

export function ImportExport({ data, setData }: { data: VentureData; setData: (d: VentureData) => void }) {
    const fileRef = useRef<HTMLInputElement | null>(null);

    const download = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(data.meta.name || "venture").replace(/\s+/g, "-").toLowerCase()}-model.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const onPickFile = async (f: File) => {
        const text = await f.text();
        const parsed = JSON.parse(text);
        if (!parsed?.meta?.start || !Array.isArray(parsed?.tasks) || !Array.isArray(parsed?.segments)) {
            throw new Error("Invalid file format (missing meta/tasks/segments)");
        }
        setData(parsed);
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button onClick={download} variant="secondary" className="rounded-2xl">
                <Download className="h-4 w-4 mr-2" /> Export JSON
            </Button>

            <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                        await onPickFile(f);
                    } finally {
                        e.target.value = "";
                    }
                }}
            />

            <Button onClick={() => fileRef.current?.click()} variant="outline" className="rounded-2xl">
                <Upload className="h-4 w-4 mr-2" /> Import JSON
            </Button>

            <Dialog>
                <DialogTrigger asChild>
                    <Button variant="ghost" className="rounded-2xl">
                        <RefreshCcw className="h-4 w-4 mr-2" /> Reset
                    </Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>Reset model?</DialogTitle>
                    </DialogHeader>
                    <Alert>
                        <AlertTitle>This will overwrite your local data</AlertTitle>
                        <AlertDescription>
                            Your current venture model in local storage will be replaced with the default dataset.
                        </AlertDescription>
                    </Alert>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setData(DEFAULT)}>
                            Reset to default
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
