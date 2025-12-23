import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { Col } from "../types";

export function DataTable<T extends { id: string }>(props: {
    title: string;
    rows: T[];
    setRows: (rows: T[]) => void;
    columns: Col<T>[];
    addRow: () => T;
}) {
    const { title, rows, setRows, columns, addRow } = props;
    const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    const tableContent = (
        <div className="relative overflow-visible">
            <div className="overflow-visible rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-background">
                            <tr className="border-b">
                                <th className="p-0 w-[52px]" />
                                {columns.map((c) => (
                                    <th key={String(c.key)} className="text-left font-medium p-2" style={{ width: c.width }}>
                                        {c.header}
                                    </th>
                                ))}
                                <th className="p-2 w-[64px]" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, idx) => (
                                <tr
                                    key={r.id}
                                    className={`border-b last:border-b-0 hover:bg-muted/40 ${
                                        draggedIndex === idx ? "opacity-50" : ""
                                    }`}
                                    onMouseEnter={() => setHoveredRowIndex(idx)}
                                    onMouseLeave={() => setHoveredRowIndex(null)}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = "move";
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggedIndex === null || draggedIndex === idx) return;

                                        const newRows = [...rows];
                                        const [draggedRow] = newRows.splice(draggedIndex, 1);
                                        newRows.splice(idx, 0, draggedRow!);
                                        setRows(newRows);
                                        setDraggedIndex(null);
                                    }}
                                >
                                    {/* Drag handle and insert button column - appears on hover */}
                                    <td className="p-0 align-top relative w-[52px] min-w-[52px]">
                                        <div
                                            className="flex items-center gap-1 p-1 transition-opacity"
                                            style={{ opacity: hoveredRowIndex === idx ? 1 : 0 }}
                                            onMouseEnter={() => setHoveredRowIndex(idx)}
                                            onMouseLeave={() => setHoveredRowIndex(null)}
                                        >
                                            <div
                                                className="rounded-lg h-8 w-8 p-0 cursor-grab active:cursor-grabbing flex items-center justify-center hover:bg-muted transition-colors"
                                                title="Drag to reorder"
                                                draggable
                                                onDragStart={(e) => {
                                                    setDraggedIndex(idx);
                                                    e.dataTransfer.effectAllowed = "move";
                                                }}
                                                onDragEnd={() => {
                                                    setDraggedIndex(null);
                                                }}
                                            >
                                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="rounded-lg h-8 w-8 p-0"
                                                onClick={() => {
                                                    const newRow = addRow();
                                                    const newRows = [...rows];
                                                    newRows.splice(idx + 1, 0, newRow);
                                                    setRows(newRows);
                                                }}
                                                title="Insert row below"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                    {columns.map((c) => {
                                        const val = (r as any)[c.key];
                                        const inputType = c.input ?? "text";
                                        if (c.render) {
                                            return (
                                                <td key={String(c.key)} className="p-2 align-top">
                                                    {c.render(val, r)}
                                                </td>
                                            );
                                        }
                                        return (
                                            <td key={String(c.key)} className="p-2 align-top">
                                                <Input
                                                    className="h-8 rounded-xl"
                                                    type={inputType}
                                                    value={val ?? ""}
                                                    onChange={(e) => {
                                                        const next = [...rows];
                                                        const raw = e.target.value;
                                                        const parsed = c.parse ? c.parse(raw) : inputType === "number" ? Number(raw || 0) : raw;
                                                        (next[idx] as any)[c.key] = parsed;
                                                        setRows(next);
                                                    }}
                                                />
                                            </td>
                                        );
                                    })}
                                    <td className="p-2 align-top">
                                        <Button
                                            variant="ghost"
                                            className="rounded-xl"
                                            onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length + 2} className="p-6 text-center text-muted-foreground">
                                        No rows yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
        </div>
    );

    if (title) {
        return (
            <Card className="rounded-2xl shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <div>
                        <CardTitle className="text-base">{title}</CardTitle>
                        <div className="text-sm text-muted-foreground">Edit values directly. Changes save automatically.</div>
                    </div>
                    <Button onClick={() => setRows([...rows, addRow()])} variant="secondary" className="rounded-2xl">
                        <Plus className="h-4 w-4 mr-2" /> Add
                    </Button>
                </CardHeader>
                <CardContent className="relative overflow-visible">{tableContent}</CardContent>
            </Card>
        );
    }

    return tableContent;
}
