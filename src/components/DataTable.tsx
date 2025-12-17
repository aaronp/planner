import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import type { Col } from "../types";

export function DataTable<T extends { id: string }>(props: {
    title: string;
    rows: T[];
    setRows: (rows: T[]) => void;
    columns: Col<T>[];
    addRow: () => T;
}) {
    const { title, rows, setRows, columns, addRow } = props;

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
            <CardContent>
                <div className="overflow-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-background">
                            <tr className="border-b">
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
                                <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/40">
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
                                    <td colSpan={columns.length + 1} className="p-6 text-center text-muted-foreground">
                                        No rows yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
