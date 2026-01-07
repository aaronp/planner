import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GripVertical, Plus, Trash2, BarChart3, Table2, Copy, Edit3, Check, Save, FolderOpen } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { fmtCurrency } from "../utils/formatUtils";
import type { WizardData, WizardCostItem, WizardRevenueItem } from "../types/wizard";
import { getSavedWizardModels, saveWizardModel, deleteWizardModel, loadWizardModel, type SavedWizardModel } from "../utils/storage";

export function WizardPage() {
    const [data, setData] = useState<WizardData>({
        costs: [
            { id: "C1", name: "Engineering Team", monthlyAmount: 50000, frequencyMonths: 1, startMonth: 0, durationMonths: undefined },
            { id: "C2", name: "Marketing", monthlyAmount: 20000, frequencyMonths: 1, startMonth: 3, durationMonths: undefined },
        ],
        revenues: [
            { id: "R1", name: "Subscription Revenue", monthlyAmount: 10000, frequencyMonths: 1, startMonth: 6, durationMonths: undefined },
        ],
        initialInvestment: 1000000,
        hurdleRate: 20,
        horizonMonths: 36,
        currency: "USD",
    });

    const [selectedCostId, setSelectedCostId] = useState<string | null>(null);
    const [selectedRevenueId, setSelectedRevenueId] = useState<string | null>(null);
    const [topPanelHeight, setTopPanelHeight] = useState(50); // Percentage
    const [viewMode, setViewMode] = useState<"graph" | "table">("graph");
    const [isEditingData, setIsEditingData] = useState(false);
    const [editedJson, setEditedJson] = useState("");
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [savedModels, setSavedModels] = useState<SavedWizardModel[]>([]);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showLoadDialog, setShowLoadDialog] = useState(false);
    const [saveName, setSaveName] = useState("");

    useEffect(() => {
        setSavedModels(getSavedWizardModels());
    }, []);

    // Calculate financial data
    const chartData = useMemo(() => {
        const result = [];
        let cumulativeCash = data.initialInvestment;
        let cumulativeProfit = -data.initialInvestment; // Start negative (investment is a cost)
        let cumulativeMargin = 0; // Total margin without initial investment
        let cumulativeRevenue = 0;
        let cumulativeCosts = 0;

        // Track occurrence count for each cost/revenue to apply compound growth
        const costOccurrences: Record<string, number> = {};
        const revenueOccurrences: Record<string, number> = {};

        for (let month = 0; month < data.horizonMonths; month++) {
            // Calculate costs for this month
            let totalCost = 0;
            data.costs.forEach(cost => {
                if (month >= cost.startMonth) {
                    if (!cost.durationMonths || month < cost.startMonth + cost.durationMonths) {
                        const monthsSinceStart = month - cost.startMonth;
                        // Only apply cost on months that match the frequency
                        if (monthsSinceStart % cost.frequencyMonths === 0) {
                            // Initialize occurrence count if needed
                            if (!(cost.id in costOccurrences)) {
                                costOccurrences[cost.id] = 0;
                            }
                            // Apply growth rate (compound)
                            const growthRate = cost.growthRate ?? 0;
                            const amount = cost.monthlyAmount * Math.pow(1 + growthRate / 100, costOccurrences[cost.id]);
                            totalCost += amount;
                            costOccurrences[cost.id]++;
                        }
                    }
                }
            });

            // Calculate revenue for this month
            let totalRevenue = 0;
            data.revenues.forEach(revenue => {
                if (month >= revenue.startMonth) {
                    if (!revenue.durationMonths || month < revenue.startMonth + revenue.durationMonths) {
                        const monthsSinceStart = month - revenue.startMonth;
                        // Only apply revenue on months that match the frequency
                        if (monthsSinceStart % revenue.frequencyMonths === 0) {
                            // Initialize occurrence count if needed
                            if (!(revenue.id in revenueOccurrences)) {
                                revenueOccurrences[revenue.id] = 0;
                            }
                            // Apply growth rate (compound)
                            const growthRate = revenue.growthRate ?? 0;
                            const amount = revenue.monthlyAmount * Math.pow(1 + growthRate / 100, revenueOccurrences[revenue.id]);
                            totalRevenue += amount;
                            revenueOccurrences[revenue.id]++;
                        }
                    }
                }
            });

            const netProfit = totalRevenue - totalCost;
            cumulativeCash += netProfit;
            cumulativeProfit += netProfit;
            cumulativeMargin += netProfit;
            cumulativeRevenue += totalRevenue;
            cumulativeCosts += totalCost;

            result.push({
                month,
                costs: totalCost,
                revenue: totalRevenue,
                netProfit,
                cumulativeCash,
                cumulativeProfit,
                cumulativeMargin,
                cumulativeRevenue,
                cumulativeCosts,
            });
        }

        return result;
    }, [data]);

    // Calculate operational profitability month (when monthly revenue > monthly costs)
    const operationalProfitabilityMonth = useMemo(() => {
        const month = chartData.findIndex(d => d.netProfit > 0);
        return month >= 0 ? month : null;
    }, [chartData, data.costs, data.revenues]);

    // Calculate break-even point (when cumulative revenue = cumulative costs)
    const breakEvenMonth = useMemo(() => {
        const month = chartData.findIndex(d => d.cumulativeMargin >= 0);
        return month >= 0 ? month : null;
    }, [chartData, data.costs, data.revenues]);

    // Calculate ROI month (when cumulative margin >= initial investment)
    const roiMonth = useMemo(() => {
        const month = chartData.findIndex(d => d.cumulativeMargin >= data.initialInvestment);
        return month >= 0 ? month : null;
    }, [chartData, data.initialInvestment, data.costs, data.revenues]);

    // Calculate target return date (when cumulative margin reaches hurdle rate return)
    const targetReturnMonth = useMemo(() => {
        const targetReturn = data.initialInvestment * (1 + data.hurdleRate / 100);
        const month = chartData.findIndex(d => d.cumulativeMargin >= targetReturn);
        return month >= 0 ? month : null;
    }, [chartData, data.initialInvestment, data.hurdleRate, data.costs, data.revenues]);

    // Calculate yearly forecast summary
    const yearlyForecast = useMemo(() => {
        const years: { year: number; revenue: number; costs: number; margin: number; ytdReturn: number }[] = [];
        const numYears = Math.ceil(data.horizonMonths / 12);

        for (let year = 1; year <= numYears; year++) {
            const endMonth = Math.min(year * 12 - 1, data.horizonMonths - 1);
            if (endMonth >= 0 && endMonth < chartData.length) {
                const yearData = chartData[endMonth];
                const ytdReturn = data.initialInvestment > 0
                    ? (yearData.cumulativeMargin / data.initialInvestment) * 100
                    : 0;

                years.push({
                    year,
                    revenue: yearData.cumulativeRevenue,
                    costs: yearData.cumulativeCosts,
                    margin: yearData.cumulativeMargin,
                    ytdReturn,
                });
            }
        }

        return years;
    }, [chartData, data.horizonMonths, data.initialInvestment, data.costs, data.revenues]);

    // Drag handlers for resize
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = topPanelHeight;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaY = e.clientY - startY;
            const viewportHeight = window.innerHeight;
            const deltaPercent = (deltaY / viewportHeight) * 100;
            const newHeight = Math.max(20, Math.min(80, startHeight + deltaPercent));
            setTopPanelHeight(newHeight);
        };

        const handleMouseUp = () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    // Helper functions
    const addCost = () => {
        const newId = `C${data.costs.length + 1}`;
        setData({
            ...data,
            costs: [...data.costs, { id: newId, name: "New Cost", monthlyAmount: 0, frequencyMonths: 1, startMonth: 0 }],
        });
    };

    const addRevenue = () => {
        const newId = `R${data.revenues.length + 1}`;
        setData({
            ...data,
            revenues: [...data.revenues, { id: newId, name: "New Revenue", monthlyAmount: 0, frequencyMonths: 1, startMonth: 0 }],
        });
    };

    const updateCost = (id: string, updates: Partial<WizardCostItem>) => {
        setData({
            ...data,
            costs: data.costs.map(c => c.id === id ? { ...c, ...updates } : c),
        });
    };

    const updateRevenue = (id: string, updates: Partial<WizardRevenueItem>) => {
        setData({
            ...data,
            revenues: data.revenues.map(r => r.id === id ? { ...r, ...updates } : r),
        });
    };

    const deleteCost = (id: string) => {
        setData({
            ...data,
            costs: data.costs.filter(c => c.id !== id),
        });
        if (selectedCostId === id) setSelectedCostId(null);
    };

    const deleteRevenue = (id: string) => {
        setData({
            ...data,
            revenues: data.revenues.filter(r => r.id !== id),
        });
        if (selectedRevenueId === id) setSelectedRevenueId(null);
    };

    const handleCopyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const handleEditData = () => {
        setEditedJson(JSON.stringify(data, null, 2));
        setJsonError(null);
        setIsEditingData(true);
    };

    const handleSaveData = () => {
        try {
            const parsed = JSON.parse(editedJson);
            setData(parsed);
            setIsEditingData(false);
            setJsonError(null);
        } catch (err) {
            setJsonError(err instanceof Error ? err.message : "Invalid JSON");
        }
    };

    const handleCancelEdit = () => {
        setIsEditingData(false);
        setJsonError(null);
    };

    const handleSaveModel = () => {
        if (!saveName.trim()) {
            alert("Please enter a name for the model");
            return;
        }
        saveWizardModel(saveName, data);
        setSavedModels(getSavedWizardModels());
        setShowSaveDialog(false);
        setSaveName("");
    };

    const handleLoadModel = (id: string) => {
        const model = loadWizardModel(id);
        if (model) {
            setData(model.data);
            setShowLoadDialog(false);
        }
    };

    const handleDeleteModel = (id: string) => {
        if (confirm("Are you sure you want to delete this saved model?")) {
            deleteWizardModel(id);
            setSavedModels(getSavedWizardModels());
        }
    };

    return (
        <div className="h-screen flex flex-col p-4 gap-4">
            <div className="flex-shrink-0">
                <h1 className="text-3xl font-bold">Financial Wizard</h1>
                <p className="text-sm text-muted-foreground">Simplified financial planning view</p>
            </div>

            {/* Top Panel - Model Data */}
            <div style={{ height: `${topPanelHeight}%` }} className="overflow-hidden flex flex-col">
                <Card className="rounded-2xl shadow-sm border-2 flex-1 flex flex-col min-h-0">
                    <Tabs defaultValue="costs" className="flex-1 flex flex-col min-h-0">
                        <CardHeader className="pb-3 flex-shrink-0">
                            <TabsList className="h-auto w-auto bg-transparent border-b rounded-none p-0 gap-6">
                                <TabsTrigger
                                    value="costs"
                                    className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold rounded-none bg-transparent px-0 pb-2 shadow-none"
                                >
                                    Costs
                                </TabsTrigger>
                                <TabsTrigger
                                    value="revenue"
                                    className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold rounded-none bg-transparent px-0 pb-2 shadow-none"
                                >
                                    Revenue
                                </TabsTrigger>
                                <TabsTrigger
                                    value="data"
                                    className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold rounded-none bg-transparent px-0 pb-2 shadow-none"
                                >
                                    Data
                                </TabsTrigger>
                            </TabsList>
                        </CardHeader>

                        {/* Costs Tab */}
                        <TabsContent value="costs" className="flex-1 overflow-y-auto overflow-x-hidden m-0 min-h-0">
                            <CardContent className="space-y-4">
                                {/* Swimlane Timeline */}
                                <div className="border rounded-lg p-4 bg-muted/30 overflow-x-auto">
                                    <h3 className="text-sm font-semibold mb-3">Timeline</h3>

                                    {/* Timeline scale */}
                                    <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground min-w-max">
                                        <div className="w-32 flex-shrink-0"></div>
                                        {Array.from({ length: Math.min(36, data.horizonMonths) }).map((_, i) => (
                                            <div key={i} className="w-8 text-center flex-shrink-0">
                                                {i % 3 === 0 ? i : "·"}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="space-y-2 min-w-max">
                                        {data.costs.map(cost => {
                                            const barWidth = cost.durationMonths
                                                ? Math.min(cost.durationMonths, data.horizonMonths - cost.startMonth)
                                                : data.horizonMonths - cost.startMonth;
                                            const barWidthPx = barWidth * 32; // 32px per month (w-8)

                                            return (
                                                <div
                                                    key={cost.id}
                                                    onClick={() => setSelectedCostId(cost.id)}
                                                    className={`p-2 rounded transition-colors ${
                                                        selectedCostId === cost.id ? "bg-primary/20 ring-2 ring-primary" : "bg-background hover:bg-muted"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-32 text-sm font-medium truncate flex-shrink-0" title={cost.name}>
                                                            {cost.name}
                                                        </div>
                                                        <div
                                                            className="flex-1 relative h-6"
                                                            onDragOver={(e) => e.preventDefault()}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const offsetX = e.clientX - rect.left;
                                                                const newStartMonth = Math.max(0, Math.round(offsetX / 32));
                                                                if (newStartMonth !== cost.startMonth) {
                                                                    updateCost(cost.id, { startMonth: newStartMonth });
                                                                }
                                                            }}
                                                        >
                                                            <div
                                                                className={`absolute h-full rounded flex items-center gap-1 px-2 text-xs text-white font-medium cursor-move ${
                                                                    selectedCostId === cost.id ? "bg-red-600" : "bg-red-500"
                                                                }`}
                                                                style={{
                                                                    left: `${cost.startMonth * 32}px`,
                                                                    width: cost.durationMonths ? `${barWidthPx}px` : `${barWidthPx}px`,
                                                                    minWidth: "32px",
                                                                }}
                                                                draggable
                                                                onDragStart={(e) => {
                                                                    e.dataTransfer.effectAllowed = "move";
                                                                    e.dataTransfer.setData("costId", cost.id);
                                                                }}
                                                            >
                                                                <GripVertical className="h-3 w-3 flex-shrink-0" />
                                                                <span className="truncate">
                                                                    {cost.durationMonths ? `${cost.durationMonths}m` : "∞"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Costs Table */}
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 border-b">
                                            <tr>
                                                <th className="text-left p-2 font-medium w-12"></th>
                                                <th className="text-left p-2 font-medium">Name</th>
                                                <th className="text-right p-2 font-medium">Amount</th>
                                                <th className="text-right p-2 font-medium">Frequency</th>
                                                <th className="text-right p-2 font-medium">Growth %</th>
                                                <th className="text-right p-2 font-medium">Start Month</th>
                                                <th className="text-right p-2 font-medium">Duration</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.costs.map(cost => (
                                                <tr
                                                    key={cost.id}
                                                    onClick={() => setSelectedCostId(cost.id)}
                                                    className={`border-b cursor-pointer transition-colors ${
                                                        selectedCostId === cost.id ? "bg-primary/10" : "hover:bg-muted/50"
                                                    }`}
                                                >
                                                    <td className="p-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteCost(cost.id);
                                                            }}
                                                            className="h-6 w-6 p-0"
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            value={cost.name}
                                                            onChange={(e) => updateCost(cost.id, { name: e.target.value })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            type="number"
                                                            value={cost.monthlyAmount}
                                                            onChange={(e) => updateCost(cost.id, { monthlyAmount: parseFloat(e.target.value) || 0 })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg text-right"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            type="number"
                                                            min={1}
                                                            value={cost.frequencyMonths}
                                                            onChange={(e) => updateCost(cost.id, { frequencyMonths: Math.max(1, parseInt(e.target.value) || 1) })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg text-right"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            type="number"
                                                            step="0.1"
                                                            value={cost.growthRate ?? 0}
                                                            onChange={(e) => updateCost(cost.id, { growthRate: parseFloat(e.target.value) || 0 })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg text-right"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            type="number"
                                                            value={cost.startMonth}
                                                            onChange={(e) => updateCost(cost.id, { startMonth: parseInt(e.target.value) || 0 })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg text-right"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            type="number"
                                                            value={cost.durationMonths ?? ""}
                                                            placeholder="Infinite"
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                updateCost(cost.id, { durationMonths: val ? parseInt(val) || undefined : undefined });
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg text-right"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="p-2 border-t bg-muted/30">
                                        <Button onClick={addCost} size="sm" variant="outline" className="rounded-lg">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Cost
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </TabsContent>

                        {/* Revenue Tab */}
                        <TabsContent value="revenue" className="flex-1 overflow-y-auto overflow-x-hidden m-0 min-h-0">
                            <CardContent className="space-y-4">
                                {/* Swimlane Timeline */}
                                <div className="border rounded-lg p-4 bg-muted/30 overflow-x-auto">
                                    <h3 className="text-sm font-semibold mb-3">Timeline</h3>

                                    {/* Timeline scale */}
                                    <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground min-w-max">
                                        <div className="w-32 flex-shrink-0"></div>
                                        {Array.from({ length: Math.min(36, data.horizonMonths) }).map((_, i) => (
                                            <div key={i} className="w-8 text-center flex-shrink-0">
                                                {i % 3 === 0 ? i : "·"}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="space-y-2 min-w-max">
                                        {data.revenues.map(revenue => {
                                            const barWidth = revenue.durationMonths
                                                ? Math.min(revenue.durationMonths, data.horizonMonths - revenue.startMonth)
                                                : data.horizonMonths - revenue.startMonth;
                                            const barWidthPx = barWidth * 32; // 32px per month (w-8)

                                            return (
                                                <div
                                                    key={revenue.id}
                                                    onClick={() => setSelectedRevenueId(revenue.id)}
                                                    className={`p-2 rounded transition-colors ${
                                                        selectedRevenueId === revenue.id ? "bg-primary/20 ring-2 ring-primary" : "bg-background hover:bg-muted"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-32 text-sm font-medium truncate flex-shrink-0" title={revenue.name}>
                                                            {revenue.name}
                                                        </div>
                                                        <div
                                                            className="flex-1 relative h-6"
                                                            onDragOver={(e) => e.preventDefault()}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const offsetX = e.clientX - rect.left;
                                                                const newStartMonth = Math.max(0, Math.round(offsetX / 32));
                                                                if (newStartMonth !== revenue.startMonth) {
                                                                    updateRevenue(revenue.id, { startMonth: newStartMonth });
                                                                }
                                                            }}
                                                        >
                                                            <div
                                                                className={`absolute h-full rounded flex items-center gap-1 px-2 text-xs text-white font-medium cursor-move ${
                                                                    selectedRevenueId === revenue.id ? "bg-green-600" : "bg-green-500"
                                                                }`}
                                                                style={{
                                                                    left: `${revenue.startMonth * 32}px`,
                                                                    width: revenue.durationMonths ? `${barWidthPx}px` : `${barWidthPx}px`,
                                                                    minWidth: "32px",
                                                                }}
                                                                draggable
                                                                onDragStart={(e) => {
                                                                    e.dataTransfer.effectAllowed = "move";
                                                                    e.dataTransfer.setData("revenueId", revenue.id);
                                                                }}
                                                            >
                                                                <GripVertical className="h-3 w-3 flex-shrink-0" />
                                                                <span className="truncate">
                                                                    {revenue.durationMonths ? `${revenue.durationMonths}m` : "∞"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Revenue Table */}
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 border-b">
                                            <tr>
                                                <th className="text-left p-2 font-medium w-12"></th>
                                                <th className="text-left p-2 font-medium">Name</th>
                                                <th className="text-right p-2 font-medium">Amount</th>
                                                <th className="text-right p-2 font-medium">Frequency</th>
                                                <th className="text-right p-2 font-medium">Growth %</th>
                                                <th className="text-right p-2 font-medium">Start Month</th>
                                                <th className="text-right p-2 font-medium">Duration</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.revenues.map(revenue => (
                                                <tr
                                                    key={revenue.id}
                                                    onClick={() => setSelectedRevenueId(revenue.id)}
                                                    className={`border-b cursor-pointer transition-colors ${
                                                        selectedRevenueId === revenue.id ? "bg-primary/10" : "hover:bg-muted/50"
                                                    }`}
                                                >
                                                    <td className="p-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteRevenue(revenue.id);
                                                            }}
                                                            className="h-6 w-6 p-0"
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            value={revenue.name}
                                                            onChange={(e) => updateRevenue(revenue.id, { name: e.target.value })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            type="number"
                                                            value={revenue.monthlyAmount}
                                                            onChange={(e) => updateRevenue(revenue.id, { monthlyAmount: parseFloat(e.target.value) || 0 })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg text-right"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            type="number"
                                                            min={1}
                                                            value={revenue.frequencyMonths}
                                                            onChange={(e) => updateRevenue(revenue.id, { frequencyMonths: Math.max(1, parseInt(e.target.value) || 1) })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg text-right"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            type="number"
                                                            step="0.1"
                                                            value={revenue.growthRate ?? 0}
                                                            onChange={(e) => updateRevenue(revenue.id, { growthRate: parseFloat(e.target.value) || 0 })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg text-right"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            type="number"
                                                            value={revenue.startMonth}
                                                            onChange={(e) => updateRevenue(revenue.id, { startMonth: parseInt(e.target.value) || 0 })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg text-right"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <Input
                                                            type="number"
                                                            value={revenue.durationMonths ?? ""}
                                                            placeholder="Infinite"
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                updateRevenue(revenue.id, { durationMonths: val ? parseInt(val) || undefined : undefined });
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 rounded-lg text-right"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="p-2 border-t bg-muted/30">
                                        <Button onClick={addRevenue} size="sm" variant="outline" className="rounded-lg">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Revenue
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </TabsContent>

                        {/* Data Tab */}
                        <TabsContent value="data" className="flex-1 overflow-y-auto overflow-x-hidden m-0 min-h-0">
                            <CardContent className="space-y-4">
                                {/* Action buttons */}
                                <div className="flex gap-2 flex-wrap">
                                    <Button
                                        onClick={() => setShowSaveDialog(!showSaveDialog)}
                                        variant="default"
                                        size="sm"
                                        className="rounded-lg"
                                    >
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Model
                                    </Button>
                                    <Button
                                        onClick={() => setShowLoadDialog(!showLoadDialog)}
                                        variant="outline"
                                        size="sm"
                                        className="rounded-lg"
                                    >
                                        <FolderOpen className="h-4 w-4 mr-2" />
                                        Load Model
                                    </Button>
                                    <Button
                                        onClick={handleCopyToClipboard}
                                        variant="outline"
                                        size="sm"
                                        className="rounded-lg"
                                    >
                                        {copied ? (
                                            <>
                                                <Check className="h-4 w-4 mr-2" />
                                                Copied!
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-4 w-4 mr-2" />
                                                Copy to Clipboard
                                            </>
                                        )}
                                    </Button>
                                    {!isEditingData ? (
                                        <Button
                                            onClick={handleEditData}
                                            variant="outline"
                                            size="sm"
                                            className="rounded-lg"
                                        >
                                            <Edit3 className="h-4 w-4 mr-2" />
                                            Edit
                                        </Button>
                                    ) : (
                                        <>
                                            <Button
                                                onClick={handleSaveData}
                                                variant="default"
                                                size="sm"
                                                className="rounded-lg"
                                            >
                                                Apply Changes
                                            </Button>
                                            <Button
                                                onClick={handleCancelEdit}
                                                variant="outline"
                                                size="sm"
                                                className="rounded-lg"
                                            >
                                                Cancel
                                            </Button>
                                        </>
                                    )}
                                </div>

                                {/* Save Dialog */}
                                {showSaveDialog && (
                                    <div className="border rounded-lg p-4 bg-muted/30">
                                        <h3 className="font-semibold mb-2">Save Model</h3>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="Enter model name..."
                                                value={saveName}
                                                onChange={(e) => setSaveName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleSaveModel();
                                                }}
                                                className="rounded-lg"
                                            />
                                            <Button onClick={handleSaveModel} size="sm" className="rounded-lg">
                                                Save
                                            </Button>
                                            <Button
                                                onClick={() => {
                                                    setShowSaveDialog(false);
                                                    setSaveName("");
                                                }}
                                                variant="outline"
                                                size="sm"
                                                className="rounded-lg"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Load Dialog */}
                                {showLoadDialog && (
                                    <div className="border rounded-lg p-4 bg-muted/30">
                                        <h3 className="font-semibold mb-2">Load Model</h3>
                                        {savedModels.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No saved models yet.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {savedModels.map((model) => (
                                                    <div
                                                        key={model.id}
                                                        className="flex items-center justify-between p-2 border rounded-lg bg-background hover:bg-muted/50"
                                                    >
                                                        <div className="flex-1">
                                                            <p className="font-medium">{model.name}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {new Date(model.savedAt).toLocaleString()}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                onClick={() => handleLoadModel(model.id)}
                                                                size="sm"
                                                                variant="outline"
                                                                className="rounded-lg"
                                                            >
                                                                Load
                                                            </Button>
                                                            <Button
                                                                onClick={() => handleDeleteModel(model.id)}
                                                                size="sm"
                                                                variant="outline"
                                                                className="rounded-lg"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <Button
                                            onClick={() => setShowLoadDialog(false)}
                                            variant="outline"
                                            size="sm"
                                            className="rounded-lg mt-2"
                                        >
                                            Close
                                        </Button>
                                    </div>
                                )}

                                {jsonError && (
                                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
                                        <p className="font-semibold">JSON Error:</p>
                                        <p className="text-sm">{jsonError}</p>
                                    </div>
                                )}

                                <div className="border rounded-lg overflow-hidden">
                                    {isEditingData ? (
                                        <textarea
                                            value={editedJson}
                                            onChange={(e) => setEditedJson(e.target.value)}
                                            className="w-full h-[500px] p-4 font-mono text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                            spellCheck={false}
                                        />
                                    ) : (
                                        <pre className="p-4 overflow-auto text-sm font-mono bg-muted/30">
                                            {JSON.stringify(data, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            </CardContent>
                        </TabsContent>
                    </Tabs>
                </Card>
            </div>

            {/* Resize Handle */}
            <div
                onMouseDown={handleMouseDown}
                className="h-2 cursor-row-resize bg-border hover:bg-primary transition-colors flex-shrink-0"
            />

            {/* Bottom Panel - Graph/Table View */}
            <div style={{ height: `${100 - topPanelHeight - 1}%` }} className="overflow-hidden">
                <Card className="rounded-2xl shadow-sm border-2 h-full flex flex-col">
                    <CardHeader className="flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <CardTitle>Financial Overview</CardTitle>
                            <div className="flex gap-1 border rounded-lg p-1">
                                <Button
                                    variant={viewMode === "graph" ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => setViewMode("graph")}
                                    className="h-7 px-2"
                                >
                                    <BarChart3 className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === "table" ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => setViewMode("table")}
                                    className="h-7 px-2"
                                >
                                    <Table2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1 overflow-auto">
                        {/* Initial Investment and Hurdle Rate Inputs */}
                        <div className="grid gap-4 md:grid-cols-3">
                            <div>
                                <Label>Initial Investment</Label>
                                <Input
                                    type="number"
                                    value={data.initialInvestment}
                                    onChange={(e) => setData({ ...data, initialInvestment: parseFloat(e.target.value) || 0 })}
                                    className="rounded-xl"
                                />
                            </div>
                            <div>
                                <Label>Hurdle Rate (%)</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    value={data.hurdleRate}
                                    onChange={(e) => setData({ ...data, hurdleRate: parseFloat(e.target.value) || 0 })}
                                    className="rounded-xl"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Minimum required rate of return
                                </p>
                            </div>
                            <div>
                                <Label>Time Horizon (years)</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={Math.round(data.horizonMonths / 12)}
                                    onChange={(e) => {
                                        const years = Math.max(1, parseInt(e.target.value) || 1);
                                        setData({ ...data, horizonMonths: years * 12 });
                                    }}
                                    className="rounded-xl"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    {data.horizonMonths} months total
                                </p>
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-lg border p-4">
                                <p className="text-sm text-muted-foreground">Operational Profitability</p>
                                <p className="text-2xl font-semibold">
                                    {operationalProfitabilityMonth !== null
                                        ? `Month ${operationalProfitabilityMonth}`
                                        : "Not reached"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Monthly revenue &gt; costs
                                </p>
                            </div>
                            <div className="rounded-lg border p-4">
                                <p className="text-sm text-muted-foreground">Break-Even Point</p>
                                <p className="text-2xl font-semibold">
                                    {breakEvenMonth !== null ? `Month ${breakEvenMonth}` : "Not reached"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Total revenue = total costs
                                </p>
                            </div>
                            <div className="rounded-lg border p-4">
                                <p className="text-sm text-muted-foreground">ROI Date</p>
                                <p className="text-2xl font-semibold">
                                    {roiMonth !== null ? `Month ${roiMonth}` : "Not reached"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Margin ≥ initial investment
                                </p>
                            </div>
                            <div className="rounded-lg border p-4">
                                <p className="text-sm text-muted-foreground">Target Return ({data.hurdleRate}%)</p>
                                <p className="text-2xl font-semibold">
                                    {targetReturnMonth !== null ? `Month ${targetReturnMonth}` : "Not reached"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Achieves hurdle rate return
                                </p>
                            </div>
                        </div>

                        {/* Yearly Forecast */}
                        {yearlyForecast.length > 0 && (
                            <div className="border rounded-lg overflow-hidden">
                                <div className="bg-muted/50 p-3 border-b">
                                    <h3 className="font-semibold">
                                        {Math.ceil(data.horizonMonths / 12)}-Year Forecast Summary
                                    </h3>
                                </div>
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/30 border-b">
                                        <tr>
                                            <th className="text-left p-2 font-medium">Year</th>
                                            <th className="text-right p-2 font-medium">Cumulative Revenue</th>
                                            <th className="text-right p-2 font-medium">Cumulative Costs</th>
                                            <th className="text-right p-2 font-medium">Cumulative Margin</th>
                                            <th className="text-right p-2 font-medium">YTD Return</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {yearlyForecast.map((year) => (
                                            <tr key={year.year} className="border-b hover:bg-muted/50">
                                                <td className="p-2">Year {year.year}</td>
                                                <td className="p-2 text-right text-green-600">
                                                    {fmtCurrency(year.revenue, data.currency)}
                                                </td>
                                                <td className="p-2 text-right text-red-600">
                                                    {fmtCurrency(year.costs, data.currency)}
                                                </td>
                                                <td className={`p-2 text-right font-medium ${year.margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                    {fmtCurrency(year.margin, data.currency)}
                                                </td>
                                                <td className={`p-2 text-right font-semibold ${year.ytdReturn >= data.hurdleRate ? "text-green-600" : year.ytdReturn >= 0 ? "text-blue-600" : "text-red-600"}`}>
                                                    {year.ytdReturn.toFixed(1)}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Graph or Table View */}
                        {viewMode === "graph" ? (
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" label={{ value: "Month", position: "insideBottom", offset: -5 }} />
                                        <YAxis
                                            yAxisId="left"
                                            label={{ value: "Amount", angle: -90, position: "insideLeft" }}
                                            tickFormatter={(v) => fmtCurrency(v, data.currency)}
                                        />
                                        <Tooltip
                                            formatter={(value: number, name: string) => {
                                                return [fmtCurrency(value, data.currency), name];
                                            }}
                                        />
                                        <Legend />
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="revenue"
                                            stroke="#22c55e"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Revenue"
                                        />
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="costs"
                                            stroke="#ef4444"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Costs"
                                        />
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="cumulativeCash"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Cumulative Cash"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="border rounded-lg overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 border-b sticky top-0">
                                        <tr>
                                            <th className="text-left p-2 font-medium">Month</th>
                                            <th className="text-right p-2 font-medium">Costs</th>
                                            <th className="text-right p-2 font-medium">Revenue</th>
                                            <th className="text-right p-2 font-medium">Margin</th>
                                            <th className="text-right p-2 font-medium">Cumulative Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {chartData.map((row, idx) => (
                                            <tr key={idx} className="border-b hover:bg-muted/50">
                                                <td className="p-2">{row.month}</td>
                                                <td className="p-2 text-right text-red-600">
                                                    {fmtCurrency(row.costs, data.currency)}
                                                </td>
                                                <td className="p-2 text-right text-green-600">
                                                    {fmtCurrency(row.revenue, data.currency)}
                                                </td>
                                                <td className={`p-2 text-right font-medium ${row.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                    {fmtCurrency(row.netProfit, data.currency)}
                                                </td>
                                                <td className={`p-2 text-right font-semibold ${row.cumulativeCash >= 0 ? "text-blue-600" : "text-red-600"}`}>
                                                    {fmtCurrency(row.cumulativeCash, data.currency)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
