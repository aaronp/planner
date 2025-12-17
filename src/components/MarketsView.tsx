import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { Trash2, Plus } from "lucide-react";
import type { Market } from "../types";
import { uid } from "../utils/formatUtils";

type MarketsViewProps = {
    markets: Market[];
    onChange: (markets: Market[]) => void;
};

export function MarketsView({ markets, onChange }: MarketsViewProps) {
    const addMarket = () => {
        const newMarket: Market = {
            id: uid("MKT"),
            name: "New Market",
            customerType: "",
            geography: [],
            tamUnits: 0,
            samUnits: 0,
            constraints: "",
        };
        onChange([...markets, newMarket]);
    };

    const updateMarket = (id: string, updates: Partial<Market>) => {
        onChange(markets.map((m) => (m.id === id ? { ...m, ...updates } : m)));
    };

    const deleteMarket = (id: string) => {
        onChange(markets.filter((m) => m.id !== id));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Markets</h3>
                    <p className="text-sm text-muted-foreground">
                        Define your addressable markets in units (no pricing here)
                    </p>
                </div>
                <Button onClick={addMarket} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Market
                </Button>
            </div>

            <div className="space-y-3">
                {markets.length === 0 ? (
                    <Card className="p-8 text-center text-muted-foreground">
                        <p>No markets defined yet.</p>
                        <p className="text-sm mt-1">Click "Add Market" to create your first market.</p>
                    </Card>
                ) : (
                    markets.map((market) => (
                        <Card key={market.id} className="p-4">
                            <div className="space-y-4">
                                {/* Header with delete button */}
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Market Name</Label>
                                            <Input
                                                value={market.name}
                                                onChange={(e) => updateMarket(market.id, { name: e.target.value })}
                                                placeholder="e.g., UK SMEs"
                                                className="h-9 mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Customer Type</Label>
                                            <Input
                                                value={market.customerType}
                                                onChange={(e) =>
                                                    updateMarket(market.id, { customerType: e.target.value })
                                                }
                                                placeholder="e.g., SME, Enterprise"
                                                className="h-9 mt-1"
                                            />
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => deleteMarket(market.id)}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>

                                {/* Geography and Units */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <Label className="text-xs text-muted-foreground">
                                            Geography (comma-separated)
                                        </Label>
                                        <Input
                                            value={market.geography.join(", ")}
                                            onChange={(e) => {
                                                const geo = e.target.value
                                                    .split(",")
                                                    .map((s) => s.trim())
                                                    .filter(Boolean);
                                                updateMarket(market.id, { geography: geo });
                                            }}
                                            placeholder="e.g., UK, EU, US"
                                            className="h-9 mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">
                                            TAM (Total Addressable Market in units)
                                        </Label>
                                        <Input
                                            type="number"
                                            value={market.tamUnits}
                                            onChange={(e) =>
                                                updateMarket(market.id, {
                                                    tamUnits: parseFloat(e.target.value) || 0,
                                                })
                                            }
                                            placeholder="0"
                                            className="h-9 mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">
                                            SAM (Serviceable Addressable Market in units)
                                        </Label>
                                        <Input
                                            type="number"
                                            value={market.samUnits}
                                            onChange={(e) =>
                                                updateMarket(market.id, { samUnits: parseFloat(e.target.value) || 0 })
                                            }
                                            placeholder="0"
                                            className="h-9 mt-1"
                                        />
                                    </div>
                                </div>

                                {/* Constraints */}
                                <div>
                                    <Label className="text-xs text-muted-foreground">
                                        Constraints / Notes (optional)
                                    </Label>
                                    <Input
                                        value={market.constraints || ""}
                                        onChange={(e) => updateMarket(market.id, { constraints: e.target.value })}
                                        placeholder="Any market constraints or regulatory considerations"
                                        className="h-9 mt-1"
                                    />
                                </div>

                                {/* Market ID (read-only) */}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-mono bg-muted px-2 py-1 rounded">ID: {market.id}</span>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
