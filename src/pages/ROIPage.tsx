import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, TrendingUp, TrendingDown, PlayCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import type { VentureData } from "../types";
import { fmtCurrency } from "../utils/formatUtils";
import { computeSeries } from "../utils/modelEngine";
import { runMonteCarloSimulation } from "../utils/monteCarlo";
import { useRisk } from "../contexts/RiskContext";

type ROIPageProps = {
    data: VentureData;
    month: number;
};

export function ROIPage({ data, month }: ROIPageProps) {
    const { multipliers, streamDistributions } = useRisk();
    const { currency, initialReserve } = data.meta;
    const [revenueMultiple, setRevenueMultiple] = useState(5);
    const [ebitdaMultiple, setEbitdaMultiple] = useState(8);
    const [discountRate, setDiscountRate] = useState(15);
    const [monteCarloResults, setMonteCarloResults] = useState<ReturnType<typeof runMonteCarloSimulation> | null>(null);
    const [isRunningSimulation, setIsRunningSimulation] = useState(false);

    const series = useMemo(
        () => computeSeries(data, multipliers.tasks, multipliers.fixedCosts, multipliers.revenueStreams, streamDistributions),
        [data, multipliers, streamDistributions]
    );
    const currentSnapshot = series[Math.min(series.length - 1, Math.max(0, month))] ?? series[0];

    // Monte Carlo simulation handler
    const handleRunSimulation = () => {
        setIsRunningSimulation(true);
        // Run in a timeout to allow UI to update
        setTimeout(() => {
            const results = runMonteCarloSimulation(
                data,
                100,
                multipliers.tasks,
                multipliers.fixedCosts,
                multipliers.revenueStreams,
                streamDistributions
            );
            setMonteCarloResults(results);
            setIsRunningSimulation(false);
        }, 100);
    };

    // Calculate cash metrics
    const cashMetrics = useMemo(() => {
        const remainingCash = currentSnapshot?.cash ?? 0;

        // Calculate burn rate (average monthly cash burn over last 3 months)
        const lookback = Math.min(3, month);
        let totalBurn = 0;
        let burnMonths = 0;
        for (let i = month; i > Math.max(0, month - lookback); i--) {
            const snap = series[i];
            if (snap && snap.profit < 0) {
                totalBurn += Math.abs(snap.profit);
                burnMonths++;
            }
        }
        const avgBurnRate = burnMonths > 0 ? totalBurn / burnMonths : 0;

        // Calculate runway (months until cash <= 0)
        let runway: number | null = null;
        if (avgBurnRate > 0 && remainingCash > 0) {
            runway = Math.floor(remainingCash / avgBurnRate);
        }

        // Find break-even month (first month where cumulative profit >= 0)
        let breakEvenMonth: number | null = null;
        for (let i = 0; i < series.length; i++) {
            if ((series[i]?.cash ?? 0) >= initialReserve) {
                breakEvenMonth = i;
                break;
            }
        }

        return { remainingCash, avgBurnRate, runway, breakEvenMonth };
    }, [series, currentSnapshot, month, initialReserve]);

    // Calculate ROI metrics
    const roiMetrics = useMemo(() => {
        const cumulativeInflows = currentSnapshot?.cumRevenue ?? 0;
        const cumulativeOutflows = currentSnapshot?.cumCosts ?? 0;

        // Simple Cash ROI
        const cashProfit = cumulativeInflows - cumulativeOutflows;
        const cashROI = cumulativeOutflows > 0 ? (cashProfit / cumulativeOutflows) * 100 : 0;

        // Find month when ROI crosses 0%
        let roiPositiveMonth: number | null = null;
        for (let i = 0; i < series.length; i++) {
            const snap = series[i];
            if (snap) {
                const profit = snap.cumRevenue - snap.cumCosts;
                if (profit >= 0) {
                    roiPositiveMonth = i;
                    break;
                }
            }
        }

        // IRR calculation (simplified - only if we have positive cashflows and > 12 months)
        let irr: number | null = null;
        if (month >= 12 && cumulativeInflows > 0) {
            // Simplified IRR approximation: (total return / investment)^(1/years) - 1
            const years = month / 12;
            const totalReturn = cumulativeInflows / Math.max(1, cumulativeOutflows);
            irr = (Math.pow(totalReturn, 1 / years) - 1) * 100;
        }

        return { cashProfit, cashROI, roiPositiveMonth, irr };
    }, [currentSnapshot, series, month]);

    // Calculate valuations
    const valuationMetrics = useMemo(() => {
        const annualisedRevenue = (currentSnapshot?.revenue ?? 0) * 12;
        const annualisedEBITDA = (currentSnapshot?.profit ?? 0) * 12;

        // Revenue Multiple Valuation
        const revenueValuation = annualisedRevenue * revenueMultiple;

        // EBITDA Multiple Valuation (only if positive)
        const ebitdaValuation = annualisedEBITDA > 0 ? annualisedEBITDA * ebitdaMultiple : null;

        // DCF-Lite (simplified NPV of future cashflows)
        let dcfValuation = 0;
        const projectionYears = 5;
        const monthlyDiscount = discountRate / 100 / 12;

        for (let i = month; i < Math.min(series.length, month + projectionYears * 12); i++) {
            const snap = series[i];
            if (snap) {
                const monthsOut = i - month;
                const discountFactor = Math.pow(1 + monthlyDiscount, -monthsOut);
                dcfValuation += snap.profit * discountFactor;
            }
        }

        // Paper ROI with valuation (using revenue multiple as default)
        const cumulativeOutflows = currentSnapshot?.cumCosts ?? 0;
        const cumulativeInflows = currentSnapshot?.cumRevenue ?? 0;
        const paperROI = cumulativeOutflows > 0
            ? ((revenueValuation + cumulativeInflows - cumulativeOutflows) / cumulativeOutflows) * 100
            : 0;

        return {
            annualisedRevenue,
            annualisedEBITDA,
            revenueValuation,
            ebitdaValuation,
            dcfValuation,
            paperROI,
        };
    }, [currentSnapshot, series, month, revenueMultiple, ebitdaMultiple, discountRate]);

    return (
        <div className="space-y-4">
            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="rounded-2xl">
                    <TabsTrigger value="overview" className="rounded-2xl">
                        Overview
                    </TabsTrigger>
                    <TabsTrigger value="valuation" className="rounded-2xl">
                        Valuation
                    </TabsTrigger>
                    <TabsTrigger value="simulation" className="rounded-2xl">
                        Monte Carlo
                    </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-4 space-y-4">
                    {/* Cash Section */}
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">Cash Position</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid md:grid-cols-3 gap-4">
                                <div>
                                    <Label className="text-muted-foreground text-xs">Remaining Reserve</Label>
                                    <div className="text-2xl font-semibold mt-1">
                                        {fmtCurrency(cashMetrics.remainingCash, currency)}
                                    </div>
                                    <Badge variant={cashMetrics.remainingCash > 0 ? "default" : "destructive"} className="mt-2">
                                        {cashMetrics.remainingCash >= initialReserve ? "Above initial reserve" : "Below initial reserve"}
                                    </Badge>
                                </div>

                                <div>
                                    <Label className="text-muted-foreground text-xs">Avg Monthly Burn</Label>
                                    <div className="text-2xl font-semibold mt-1">
                                        {fmtCurrency(cashMetrics.avgBurnRate, currency)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-2">
                                        Last 3 months average
                                    </div>
                                </div>

                                <div>
                                    <Label className="text-muted-foreground text-xs">Runway</Label>
                                    <div className="text-2xl font-semibold mt-1">
                                        {cashMetrics.runway !== null ? `${cashMetrics.runway} months` : "Infinite"}
                                    </div>
                                    {cashMetrics.runway !== null && cashMetrics.runway < 6 && (
                                        <Badge variant="destructive" className="mt-2">
                                            <AlertCircle className="h-3 w-3 mr-1" />
                                            Low runway
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            <div>
                                <Label className="text-muted-foreground text-xs">Break-even</Label>
                                <div className="text-lg font-medium mt-1">
                                    {cashMetrics.breakEvenMonth !== null
                                        ? `Month ${cashMetrics.breakEvenMonth} (${series[cashMetrics.breakEvenMonth]?.label})`
                                        : "Not reached in forecast"}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ROI Section */}
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">Return on Investment</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                    Cash ROI measures actual cash returned vs cash invested. This is founder-honest and ignores paper valuations.
                                </AlertDescription>
                            </Alert>

                            <div className="grid md:grid-cols-3 gap-4">
                                <div>
                                    <Label className="text-muted-foreground text-xs">Cash ROI</Label>
                                    <div className="text-2xl font-semibold mt-1 flex items-center gap-2">
                                        {roiMetrics.cashROI > 0 ? (
                                            <TrendingUp className="h-5 w-5 text-green-600" />
                                        ) : (
                                            <TrendingDown className="h-5 w-5 text-red-600" />
                                        )}
                                        {roiMetrics.cashROI.toFixed(1)}%
                                    </div>
                                    <Badge variant={roiMetrics.cashROI > 0 ? "default" : "secondary"} className="mt-2">
                                        {roiMetrics.cashROI > 0 ? "Profitable" : "Unprofitable"}
                                    </Badge>
                                </div>

                                <div>
                                    <Label className="text-muted-foreground text-xs">Cash Profit/Loss</Label>
                                    <div className="text-2xl font-semibold mt-1">
                                        {fmtCurrency(roiMetrics.cashProfit, currency)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-2">
                                        Cumulative to date
                                    </div>
                                </div>

                                <div>
                                    <Label className="text-muted-foreground text-xs">ROI Break-even</Label>
                                    <div className="text-lg font-medium mt-1">
                                        {roiMetrics.roiPositiveMonth !== null
                                            ? `Month ${roiMetrics.roiPositiveMonth}`
                                            : "Not in forecast"}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-2">
                                        When ROI crosses 0%
                                    </div>
                                </div>
                            </div>

                            {roiMetrics.irr !== null && (
                                <div className="border-t pt-4">
                                    <Label className="text-muted-foreground text-xs">Annualised ROI (IRR) - Advanced</Label>
                                    <div className="text-xl font-semibold mt-1">
                                        {roiMetrics.irr.toFixed(1)}%
                                    </div>
                                    <Badge variant="outline" className="mt-2 text-xs">
                                        Projection-based • Time-adjusted
                                    </Badge>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Valuation Tab */}
                <TabsContent value="valuation" className="mt-4 space-y-4">
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                            Valuation is not real until exit. These are market-based heuristics and projections.
                        </AlertDescription>
                    </Alert>

                    {/* Revenue Multiple Valuation */}
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Revenue Multiple Valuation</CardTitle>
                                <Badge variant="outline">Market-based heuristic</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground text-xs">Annualised Revenue</Label>
                                    <div className="text-xl font-semibold mt-1">
                                        {fmtCurrency(valuationMetrics.annualisedRevenue, currency)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Current month × 12
                                    </div>
                                </div>

                                <div>
                                    <Label className="text-muted-foreground text-xs">Revenue Multiple</Label>
                                    <div className="flex items-center gap-4 mt-2">
                                        <Slider
                                            value={[revenueMultiple]}
                                            min={1}
                                            max={15}
                                            step={0.5}
                                            onValueChange={(v) => setRevenueMultiple(v[0] ?? 5)}
                                            className="flex-1"
                                        />
                                        <div className="text-lg font-semibold w-16 text-right">
                                            {revenueMultiple.toFixed(1)}×
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        SaaS: 3–10× • Marketplace: 1–5× • Services: 0.5–2×
                                    </div>
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <Label className="text-muted-foreground text-xs">Estimated Valuation</Label>
                                <div className="text-3xl font-bold mt-1">
                                    {fmtCurrency(valuationMetrics.revenueValuation, currency)}
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <Label className="text-muted-foreground text-xs">Paper ROI (assumes exit at this valuation)</Label>
                                <div className="text-2xl font-semibold mt-1 flex items-center gap-2">
                                    {valuationMetrics.paperROI > 0 ? (
                                        <TrendingUp className="h-5 w-5 text-green-600" />
                                    ) : (
                                        <TrendingDown className="h-5 w-5 text-red-600" />
                                    )}
                                    {valuationMetrics.paperROI.toFixed(1)}%
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    (Valuation + Revenue - Costs) / Costs
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* EBITDA Multiple Valuation */}
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">EBITDA Multiple Valuation</CardTitle>
                                <Badge variant="outline">Profit-based</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {valuationMetrics.annualisedEBITDA > 0 ? (
                                <>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-muted-foreground text-xs">Annualised EBITDA</Label>
                                            <div className="text-xl font-semibold mt-1">
                                                {fmtCurrency(valuationMetrics.annualisedEBITDA, currency)}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                Current month × 12
                                            </div>
                                        </div>

                                        <div>
                                            <Label className="text-muted-foreground text-xs">EBITDA Multiple</Label>
                                            <div className="flex items-center gap-4 mt-2">
                                                <Slider
                                                    value={[ebitdaMultiple]}
                                                    min={3}
                                                    max={20}
                                                    step={0.5}
                                                    onValueChange={(v) => setEbitdaMultiple(v[0] ?? 8)}
                                                    className="flex-1"
                                                />
                                                <div className="text-lg font-semibold w-16 text-right">
                                                    {ebitdaMultiple.toFixed(1)}×
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t pt-4">
                                        <Label className="text-muted-foreground text-xs">Estimated Valuation</Label>
                                        <div className="text-3xl font-bold mt-1">
                                            {fmtCurrency(valuationMetrics.ebitdaValuation ?? 0, currency)}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <Alert>
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">
                                        EBITDA valuation requires positive profitability. Current EBITDA: {fmtCurrency(valuationMetrics.annualisedEBITDA, currency)}
                                    </AlertDescription>
                                </Alert>
                            )}
                        </CardContent>
                    </Card>

                    {/* DCF-Lite Valuation */}
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">DCF-Lite Valuation</CardTitle>
                                <Badge variant="outline">Advanced • Assumption-sensitive</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                    Highly assumption-sensitive. Uses NPV of projected future cashflows over next 5 years.
                                </AlertDescription>
                            </Alert>

                            <div>
                                <Label className="text-muted-foreground text-xs">Discount Rate (Annualised)</Label>
                                <div className="flex items-center gap-4 mt-2">
                                    <Slider
                                        value={[discountRate]}
                                        min={5}
                                        max={30}
                                        step={1}
                                        onValueChange={(v) => setDiscountRate(v[0] ?? 15)}
                                        className="flex-1"
                                    />
                                    <div className="text-lg font-semibold w-16 text-right">
                                        {discountRate}%
                                    </div>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    Typical: 10–20% for early-stage ventures
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <Label className="text-muted-foreground text-xs">Estimated Valuation (DCF)</Label>
                                <div className="text-3xl font-bold mt-1">
                                    {fmtCurrency(valuationMetrics.dcfValuation, currency)}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    NPV of next 5 years cashflows
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Valuation Range Summary */}
                    <Card className="rounded-2xl shadow-sm bg-muted/50">
                        <CardHeader>
                            <CardTitle className="text-base">Valuation Range Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Revenue Multiple</span>
                                    <span className="text-lg font-semibold">
                                        {fmtCurrency(valuationMetrics.revenueValuation, currency)}
                                    </span>
                                </div>
                                {valuationMetrics.ebitdaValuation !== null && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">EBITDA Multiple</span>
                                        <span className="text-lg font-semibold">
                                            {fmtCurrency(valuationMetrics.ebitdaValuation, currency)}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">DCF (NPV)</span>
                                    <span className="text-lg font-semibold">
                                        {fmtCurrency(valuationMetrics.dcfValuation, currency)}
                                    </span>
                                </div>
                                <div className="border-t pt-3 flex justify-between items-center">
                                    <span className="text-sm font-medium">Valuation Range</span>
                                    <span className="text-xl font-bold">
                                        {fmtCurrency(
                                            Math.min(
                                                valuationMetrics.revenueValuation,
                                                valuationMetrics.ebitdaValuation ?? Infinity,
                                                valuationMetrics.dcfValuation
                                            ),
                                            currency
                                        )}
                                        {" – "}
                                        {fmtCurrency(
                                            Math.max(
                                                valuationMetrics.revenueValuation,
                                                valuationMetrics.ebitdaValuation ?? 0,
                                                valuationMetrics.dcfValuation
                                            ),
                                            currency
                                        )}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Monte Carlo Simulation Tab */}
                <TabsContent value="simulation" className="mt-4 space-y-4">
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                            Monte Carlo simulation samples from the uncertainty ranges in your revenue streams and costs to generate bull, base, and bear scenarios.
                        </AlertDescription>
                    </Alert>

                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Run Simulation</CardTitle>
                                <Button
                                    onClick={handleRunSimulation}
                                    disabled={isRunningSimulation}
                                    className="rounded-2xl"
                                >
                                    <PlayCircle className="h-4 w-4 mr-2" />
                                    {isRunningSimulation ? "Running..." : "Run Model"}
                                </Button>
                            </div>
                        </CardHeader>
                        {monteCarloResults && (
                            <CardContent className="space-y-6">
                                {/* Key Milestones */}
                                <div>
                                    <Label className="text-muted-foreground text-xs mb-3 block">Key Milestones (Probability Distribution)</Label>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <Card className="rounded-2xl bg-blue-50/50">
                                            <CardContent className="p-4">
                                                <div className="text-sm font-medium mb-3">Operational Profitability</div>
                                                <div className="text-xs text-muted-foreground mb-2">First month with positive profit</div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-muted-foreground">Bear (P10):</span>
                                                        <span className="text-sm font-semibold">
                                                            {monteCarloResults.metrics.profitableMonth[Math.floor(monteCarloResults.metrics.profitableMonth.length * 0.1)] !== undefined
                                                                ? `Month ${monteCarloResults.metrics.profitableMonth[Math.floor(monteCarloResults.metrics.profitableMonth.length * 0.1)]}`
                                                                : "Not reached"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-muted-foreground">Base (P50):</span>
                                                        <span className="text-sm font-semibold">
                                                            {monteCarloResults.metrics.profitableMonth[Math.floor(monteCarloResults.metrics.profitableMonth.length * 0.5)] !== undefined
                                                                ? `Month ${monteCarloResults.metrics.profitableMonth[Math.floor(monteCarloResults.metrics.profitableMonth.length * 0.5)]}`
                                                                : "Not reached"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-muted-foreground">Bull (P90):</span>
                                                        <span className="text-sm font-semibold">
                                                            {monteCarloResults.metrics.profitableMonth[Math.floor(monteCarloResults.metrics.profitableMonth.length * 0.9)] !== undefined
                                                                ? `Month ${monteCarloResults.metrics.profitableMonth[Math.floor(monteCarloResults.metrics.profitableMonth.length * 0.9)]}`
                                                                : "Not reached"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card className="rounded-2xl bg-green-50/50">
                                            <CardContent className="p-4">
                                                <div className="text-sm font-medium mb-3">ROI Breakeven</div>
                                                <div className="text-xs text-muted-foreground mb-2">First month cumulative profit ≥ 0</div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-muted-foreground">Bear (P10):</span>
                                                        <span className="text-sm font-semibold">
                                                            {monteCarloResults.metrics.roiBreakevenMonth[Math.floor(monteCarloResults.metrics.roiBreakevenMonth.length * 0.1)] !== undefined
                                                                ? `Month ${monteCarloResults.metrics.roiBreakevenMonth[Math.floor(monteCarloResults.metrics.roiBreakevenMonth.length * 0.1)]}`
                                                                : "Not reached"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-muted-foreground">Base (P50):</span>
                                                        <span className="text-sm font-semibold">
                                                            {monteCarloResults.metrics.roiBreakevenMonth[Math.floor(monteCarloResults.metrics.roiBreakevenMonth.length * 0.5)] !== undefined
                                                                ? `Month ${monteCarloResults.metrics.roiBreakevenMonth[Math.floor(monteCarloResults.metrics.roiBreakevenMonth.length * 0.5)]}`
                                                                : "Not reached"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-muted-foreground">Bull (P90):</span>
                                                        <span className="text-sm font-semibold">
                                                            {monteCarloResults.metrics.roiBreakevenMonth[Math.floor(monteCarloResults.metrics.roiBreakevenMonth.length * 0.9)] !== undefined
                                                                ? `Month ${monteCarloResults.metrics.roiBreakevenMonth[Math.floor(monteCarloResults.metrics.roiBreakevenMonth.length * 0.9)]}`
                                                                : "Not reached"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>

                                {/* Yearly Profit Projections */}
                                <div>
                                    <Label className="text-muted-foreground text-xs mb-3 block">Net Profit by Year (Probability Distribution)</Label>
                                    <Card className="rounded-2xl">
                                        <CardContent className="p-4">
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b">
                                                            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Year</th>
                                                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Bear (P10)</th>
                                                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Base (P50)</th>
                                                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Bull (P90)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {monteCarloResults.metrics.yearlyProfit.map((yearData) => {
                                                            const p10 = yearData.profits[Math.floor(yearData.profits.length * 0.1)] ?? 0;
                                                            const p50 = yearData.profits[Math.floor(yearData.profits.length * 0.5)] ?? 0;
                                                            const p90 = yearData.profits[Math.floor(yearData.profits.length * 0.9)] ?? 0;
                                                            return (
                                                                <tr key={yearData.year} className="border-b">
                                                                    <td className="py-2 px-2 font-medium">Year {yearData.year}</td>
                                                                    <td className="py-2 px-2 text-right tabular-nums">{fmtCurrency(p10, currency)}</td>
                                                                    <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtCurrency(p50, currency)}</td>
                                                                    <td className="py-2 px-2 text-right tabular-nums">{fmtCurrency(p90, currency)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Scenario Comparison */}
                                <div>
                                    <Label className="text-muted-foreground text-xs mb-3 block">Scenario Outcomes (End of Horizon)</Label>
                                    <div className="grid md:grid-cols-3 gap-4">
                                        {monteCarloResults.scenarios.map((scenario) => (
                                            <Card key={scenario.label} className="rounded-2xl">
                                                <CardContent className="p-4">
                                                    <div className="text-sm font-medium mb-3">{scenario.label}</div>
                                                    <div className="space-y-2">
                                                        <div>
                                                            <div className="text-xs text-muted-foreground">Cumulative Revenue</div>
                                                            <div className="text-lg font-semibold">
                                                                {fmtCurrency(scenario.cumRevenue, currency)}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted-foreground">Cumulative Costs</div>
                                                            <div className="text-lg font-semibold">
                                                                {fmtCurrency(scenario.cumCosts, currency)}
                                                            </div>
                                                        </div>
                                                        <div className="border-t pt-2">
                                                            <div className="text-xs text-muted-foreground">Cumulative Profit</div>
                                                            <div className="text-xl font-bold">
                                                                {fmtCurrency(scenario.cumProfit, currency)}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted-foreground">Final Cash</div>
                                                            <div className="text-lg font-semibold">
                                                                {fmtCurrency(scenario.finalCash, currency)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>

                                {/* Revenue vs Costs Chart */}
                                <div>
                                    <Label className="text-muted-foreground text-xs mb-3 block">Revenue vs Costs Over Time</Label>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart
                                            data={Array.from({ length: data.meta.horizonMonths }, (_, i) => ({
                                                month: series[i]?.label ?? `M${i}`,
                                                bearRevenue: monteCarloResults.scenarios[0]?.revenue[i] ?? 0,
                                                baseRevenue: monteCarloResults.scenarios[1]?.revenue[i] ?? 0,
                                                bullRevenue: monteCarloResults.scenarios[2]?.revenue[i] ?? 0,
                                                bearCosts: monteCarloResults.scenarios[0]?.costs[i] ?? 0,
                                                baseCosts: monteCarloResults.scenarios[1]?.costs[i] ?? 0,
                                                bullCosts: monteCarloResults.scenarios[2]?.costs[i] ?? 0,
                                            }))}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis
                                                dataKey="month"
                                                tick={{ fontSize: 11 }}
                                                interval={Math.max(1, Math.floor(data.meta.horizonMonths / 12))}
                                            />
                                            <YAxis />
                                            <Tooltip formatter={(value) => fmtCurrency(Number(value), currency)} />
                                            <Legend />
                                            <Line type="monotone" dataKey="bullRevenue" stroke="#10b981" name="Bull Revenue" strokeWidth={2} dot={false} />
                                            <Line type="monotone" dataKey="baseRevenue" stroke="#3b82f6" name="Base Revenue" strokeWidth={2} dot={false} />
                                            <Line type="monotone" dataKey="bearRevenue" stroke="#ef4444" name="Bear Revenue" strokeWidth={2} dot={false} />
                                            <Line type="monotone" dataKey="bullCosts" stroke="#10b981" name="Bull Costs" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                                            <Line type="monotone" dataKey="baseCosts" stroke="#3b82f6" name="Base Costs" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                                            <Line type="monotone" dataKey="bearCosts" stroke="#ef4444" name="Bear Costs" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Profit Distribution */}
                                <div>
                                    <Label className="text-muted-foreground text-xs mb-3 block">Cumulative Profit Distribution</Label>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <AreaChart
                                            data={Array.from({ length: data.meta.horizonMonths }, (_, i) => {
                                                const dist = monteCarloResults.distribution.profit[i] ?? [];
                                                return {
                                                    month: series[i]?.label ?? `M${i}`,
                                                    p10: dist[Math.floor(dist.length * 0.1)] ?? 0,
                                                    p50: dist[Math.floor(dist.length * 0.5)] ?? 0,
                                                    p90: dist[Math.floor(dist.length * 0.9)] ?? 0,
                                                };
                                            })}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis
                                                dataKey="month"
                                                tick={{ fontSize: 11 }}
                                                interval={Math.max(1, Math.floor(data.meta.horizonMonths / 12))}
                                            />
                                            <YAxis />
                                            <Tooltip formatter={(value) => fmtCurrency(Number(value), currency)} />
                                            <Legend />
                                            <Area type="monotone" dataKey="p90" stroke="#10b981" fill="#10b98130" name="P90 (Bull)" />
                                            <Area type="monotone" dataKey="p50" stroke="#3b82f6" fill="#3b82f630" name="P50 (Base)" />
                                            <Area type="monotone" dataKey="p10" stroke="#ef4444" fill="#ef444430" name="P10 (Bear)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        )}
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
