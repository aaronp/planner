import type { VentureData, Distribution } from "../types";
import type { DistributionSelection } from "../contexts/RiskContext";
import { computeSeries } from "./modelEngine";

/**
 * Monte Carlo simulation for business planning
 * Samples from distributions to generate best/worst/likely scenarios
 */

type SimulationResult = {
    percentile: number;
    label: string;
    revenue: number[];
    costs: number[];
    profit: number[];
    cash: number[];
    cumRevenue: number;
    cumCosts: number;
    cumProfit: number;
    finalCash: number;
    profitableMonth: number | null; // First month with positive monthly profit
    roiBreakevenMonth: number | null; // First month where cumulative profit >= 0
    yearlyProfit: { year: number; profit: number }[]; // Net profit for each year
};

export type MonteCarloResults = {
    scenarios: SimulationResult[];
    distribution: {
        revenue: number[][];
        costs: number[][];
        profit: number[][];
    };
    metrics: {
        profitableMonth: number[]; // Distribution of when profitability is reached
        roiBreakevenMonth: number[]; // Distribution of when ROI breakeven is reached
        yearlyProfit: { year: number; profits: number[] }[]; // Distribution of yearly profits
    };
};

/**
 * Sample a value from a distribution
 */
function sampleDistribution(dist: Distribution | undefined, percentile: number): number {
    // Handle undefined/null distribution
    if (!dist) {
        return 0;
    }

    const { min, max } = dist;
    const modeValue = dist.mode ?? (min + max) / 2;

    // Handle deterministic case (min === max)
    if (min === max || Math.abs(max - min) < 0.0001) {
        return modeValue;
    }

    if (dist.type === "triangular") {
        // Triangular distribution sampling
        const modeRatio = (modeValue - min) / (max - min);

        if (percentile < modeRatio) {
            // Left side of triangle
            const t = percentile / modeRatio;
            return min + Math.sqrt(t) * (modeValue - min);
        } else {
            // Right side of triangle
            const t = (1 - percentile) / (1 - modeRatio);
            return max - Math.sqrt(t) * (max - modeValue);
        }
    } else if (dist.type === "normal") {
        // Normal distribution - use Box-Muller transform
        const mean = modeValue;
        const stdDev = (max - min) / 6; // 3-sigma range

        // Inverse normal CDF approximation
        const u = Math.max(0.001, Math.min(0.999, percentile)); // Clamp to avoid infinities
        const z = Math.sqrt(2) * erfInv(2 * u - 1);
        return Math.max(min, Math.min(max, mean + z * stdDev)); // Clamp to range
    } else {
        // Lognormal
        const mean = modeValue;
        const variance = Math.pow((max - min) / 6, 2);

        if (mean <= 0) return 0; // Can't do lognormal with non-positive mean

        const mu = Math.log(mean / Math.sqrt(1 + variance / (mean * mean)));
        const sigma = Math.sqrt(Math.log(1 + variance / (mean * mean)));

        const u = Math.max(0.001, Math.min(0.999, percentile)); // Clamp to avoid infinities
        const z = Math.sqrt(2) * erfInv(2 * u - 1);
        return Math.max(0, Math.exp(mu + z * sigma)); // Ensure non-negative
    }
}

/**
 * Inverse error function (approximation)
 */
function erfInv(x: number): number {
    const a = 0.147;
    const b = 2 / (Math.PI * a) + Math.log(1 - x * x) / 2;
    const sqrt1 = Math.sqrt(b * b - Math.log(1 - x * x) / a);
    const sqrt2 = Math.sqrt(sqrt1 - b);
    return Math.sign(x) * sqrt2;
}

/**
 * Create a modified version of the data with sampled distributions
 * The sampled value becomes the new mode, while keeping the original spread
 */
function sampleVentureData(data: VentureData, percentile: number): VentureData {
    // Deep clone the data
    const sampled = JSON.parse(JSON.stringify(data)) as VentureData;

    // Sample revenue streams
    if (sampled.revenueStreams) {
        sampled.revenueStreams = sampled.revenueStreams.map((stream) => {
            // Price per unit
            const sampledPrice = sampleDistribution(stream.unitEconomics.pricePerUnit, percentile);
            const priceSpread = stream.unitEconomics.pricePerUnit
                ? Math.max(0, (stream.unitEconomics.pricePerUnit.max - stream.unitEconomics.pricePerUnit.min) / 2)
                : 0;

            // Acquisition rate
            const sampledAcqRate = sampleDistribution(stream.adoptionModel.acquisitionRate, percentile);
            const acqRateSpread = stream.adoptionModel.acquisitionRate
                ? Math.max(0, (stream.adoptionModel.acquisitionRate.max - stream.adoptionModel.acquisitionRate.min) / 2)
                : 0;

            // CAC
            const sampledCAC = sampleDistribution(stream.acquisitionCosts?.cacPerUnit, percentile);
            const cacSpread = stream.acquisitionCosts?.cacPerUnit
                ? Math.max(0, (stream.acquisitionCosts.cacPerUnit.max - stream.acquisitionCosts.cacPerUnit.min) / 2)
                : 0;

            return {
                ...stream,
                unitEconomics: {
                    ...stream.unitEconomics,
                    pricePerUnit: {
                        type: stream.unitEconomics.pricePerUnit?.type || "triangular",
                        min: Math.max(0, sampledPrice - priceSpread),
                        mode: sampledPrice,
                        max: sampledPrice + priceSpread,
                    },
                    churnRate: stream.unitEconomics.churnRate
                        ? (() => {
                              const sampledChurn = sampleDistribution(stream.unitEconomics.churnRate, percentile);
                              const churnSpread = Math.max(0, (stream.unitEconomics.churnRate.max - stream.unitEconomics.churnRate.min) / 2);
                              return {
                                  ...stream.unitEconomics.churnRate,
                                  min: Math.max(0, sampledChurn - churnSpread),
                                  mode: sampledChurn,
                                  max: Math.min(1, sampledChurn + churnSpread),
                              };
                          })()
                        : undefined,
                },
                adoptionModel: {
                    ...stream.adoptionModel,
                    acquisitionRate: {
                        type: stream.adoptionModel.acquisitionRate?.type || "triangular",
                        min: Math.max(0, sampledAcqRate - acqRateSpread),
                        mode: sampledAcqRate,
                        max: sampledAcqRate + acqRateSpread,
                    },
                },
                acquisitionCosts: {
                    ...stream.acquisitionCosts,
                    cacPerUnit: {
                        type: stream.acquisitionCosts?.cacPerUnit?.type || "triangular",
                        min: Math.max(0, sampledCAC - cacSpread),
                        mode: sampledCAC,
                        max: sampledCAC + cacSpread,
                    },
                },
            };
        });
    }

    // Sample fixed costs
    if (sampled.costModel?.fixedMonthlyCosts) {
        sampled.costModel.fixedMonthlyCosts = sampled.costModel.fixedMonthlyCosts.map((cost) => {
            const sampledCost = sampleDistribution(cost.monthlyCost, percentile);
            const costSpread = cost.monthlyCost
                ? Math.max(0, (cost.monthlyCost.max - cost.monthlyCost.min) / 2)
                : 0;

            return {
                ...cost,
                monthlyCost: {
                    type: cost.monthlyCost?.type || "triangular",
                    min: Math.max(0, sampledCost - costSpread),
                    mode: sampledCost,
                    max: sampledCost + costSpread,
                },
            };
        });
    }

    return sampled;
}

/**
 * Run Monte Carlo simulation
 */
export function runMonteCarloSimulation(
    data: VentureData,
    numSimulations = 1000,
    taskMultipliers: Record<string, number> = {},
    fixedCostMultipliers: Record<string, number> = {},
    revenueStreamMultipliers: Record<string, number> = {},
    streamDistributions: Record<string, DistributionSelection> = {}
): MonteCarloResults {
    const allRuns: SimulationResult[] = [];
    const initialReserve = data.meta.initialReserve || 0;

    // Run simulations at different percentiles
    for (let i = 0; i < numSimulations; i++) {
        const percentile = i / (numSimulations - 1);
        const sampledData = sampleVentureData(data, percentile);
        const snapshots = computeSeries(
            sampledData,
            taskMultipliers,
            fixedCostMultipliers,
            revenueStreamMultipliers,
            streamDistributions
        );

        const revenue = snapshots.map((s) => s.revenue ?? 0);
        const costs = snapshots.map((s) => s.costs ?? 0);
        const profit = revenue.map((r, i) => r - costs[i]!);
        const cash = snapshots.map((s) => s.cash ?? 0);

        // Find first month with positive monthly profit (operational profitability)
        let profitableMonth: number | null = null;
        for (let m = 0; m < profit.length; m++) {
            if (profit[m]! > 0) {
                profitableMonth = m;
                break;
            }
        }

        // Find first month where cumulative profit >= 0 (ROI breakeven)
        let roiBreakevenMonth: number | null = null;
        for (let m = 0; m < snapshots.length; m++) {
            const cumProfit = (snapshots[m]?.cumRevenue ?? 0) - (snapshots[m]?.cumCosts ?? 0);
            if (cumProfit >= 0) {
                roiBreakevenMonth = m;
                break;
            }
        }

        // Calculate net profit for each year
        const yearlyProfit: { year: number; profit: number }[] = [];
        for (let year = 1; year <= 5; year++) {
            const endMonth = Math.min(year * 12 - 1, snapshots.length - 1);
            if (endMonth >= 0) {
                const snapshot = snapshots[endMonth];
                const cumProfit = (snapshot?.cumRevenue ?? 0) - (snapshot?.cumCosts ?? 0);
                yearlyProfit.push({ year, profit: cumProfit });
            }
        }

        allRuns.push({
            percentile,
            label: "",
            revenue,
            costs,
            profit,
            cash,
            cumRevenue: snapshots[snapshots.length - 1]?.cumRevenue ?? 0,
            cumCosts: snapshots[snapshots.length - 1]?.cumCosts ?? 0,
            cumProfit: (snapshots[snapshots.length - 1]?.cumRevenue ?? 0) - (snapshots[snapshots.length - 1]?.cumCosts ?? 0),
            finalCash: snapshots[snapshots.length - 1]?.cash ?? 0,
            profitableMonth,
            roiBreakevenMonth,
            yearlyProfit,
        });
    }

    // Extract key scenarios (P10, P50, P90)
    const scenarios: SimulationResult[] = [
        { ...allRuns[Math.floor(numSimulations * 0.1)]!, label: "Bear Case (P10)" },
        { ...allRuns[Math.floor(numSimulations * 0.5)]!, label: "Base Case (P50)" },
        { ...allRuns[Math.floor(numSimulations * 0.9)]!, label: "Bull Case (P90)" },
    ];

    // Build distribution data for charts
    const numMonths = data.meta.horizonMonths;
    const distribution = {
        revenue: Array.from({ length: numMonths }, (_, month) =>
            allRuns.map((run) => run.revenue[month] ?? 0).sort((a, b) => a - b)
        ),
        costs: Array.from({ length: numMonths }, (_, month) =>
            allRuns.map((run) => run.costs[month] ?? 0).sort((a, b) => a - b)
        ),
        profit: Array.from({ length: numMonths }, (_, month) =>
            allRuns.map((run) => run.profit[month] ?? 0).sort((a, b) => a - b)
        ),
    };

    // Build metrics distributions
    const profitableMonthDist = allRuns
        .map((run) => run.profitableMonth)
        .filter((m): m is number => m !== null)
        .sort((a, b) => a - b);

    const roiBreakevenMonthDist = allRuns
        .map((run) => run.roiBreakevenMonth)
        .filter((m): m is number => m !== null)
        .sort((a, b) => a - b);

    const yearlyProfitDist: { year: number; profits: number[] }[] = [];
    for (let year = 1; year <= 5; year++) {
        const profits = allRuns
            .map((run) => run.yearlyProfit.find((yp) => yp.year === year)?.profit)
            .filter((p): p is number => p !== undefined)
            .sort((a, b) => a - b);
        yearlyProfitDist.push({ year, profits });
    }

    const metrics = {
        profitableMonth: profitableMonthDist,
        roiBreakevenMonth: roiBreakevenMonthDist,
        yearlyProfit: yearlyProfitDist,
    };

    return { scenarios, distribution, metrics };
}
