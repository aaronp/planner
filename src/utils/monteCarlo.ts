import type { VentureData, Distribution } from "../types";
import { buildMonthlySnapshots } from "./modelEngine";

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
};

type MonteCarloResults = {
    scenarios: SimulationResult[];
    distribution: {
        revenue: number[][];
        costs: number[][];
        profit: number[][];
    };
};

/**
 * Sample a value from a distribution
 */
function sampleDistribution(dist: Distribution, percentile: number): number {
    if (dist.type === "triangular") {
        // Triangular distribution sampling
        const { min, mode, max } = dist;
        const modeValue = mode ?? (min + max) / 2;

        if (percentile < (modeValue - min) / (max - min)) {
            // Left side of triangle
            const t = percentile * (max - min) / (modeValue - min);
            return min + Math.sqrt(t * (modeValue - min) * (max - min));
        } else {
            // Right side of triangle
            const t = (1 - percentile) * (max - min) / (max - modeValue);
            return max - Math.sqrt(t * (max - modeValue) * (max - min));
        }
    } else if (dist.type === "normal") {
        // Normal distribution - use Box-Muller transform
        const mean = dist.mode ?? (dist.min + dist.max) / 2;
        const stdDev = (dist.max - dist.min) / 6; // 3-sigma range

        // Inverse normal CDF approximation
        const u = percentile;
        const z = Math.sqrt(2) * erfInv(2 * u - 1);
        return mean + z * stdDev;
    } else {
        // Lognormal
        const mean = dist.mode ?? (dist.min + dist.max) / 2;
        const variance = Math.pow((dist.max - dist.min) / 6, 2);

        const mu = Math.log(mean / Math.sqrt(1 + variance / (mean * mean)));
        const sigma = Math.sqrt(Math.log(1 + variance / (mean * mean)));

        const u = percentile;
        const z = Math.sqrt(2) * erfInv(2 * u - 1);
        return Math.exp(mu + z * sigma);
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
 */
function sampleVentureData(data: VentureData, percentile: number): VentureData {
    // Deep clone the data
    const sampled = JSON.parse(JSON.stringify(data)) as VentureData;

    // Sample revenue streams
    if (sampled.revenueStreams) {
        sampled.revenueStreams = sampled.revenueStreams.map((stream) => ({
            ...stream,
            unitEconomics: {
                ...stream.unitEconomics,
                pricePerUnit: {
                    ...stream.unitEconomics.pricePerUnit,
                    min: sampleDistribution(stream.unitEconomics.pricePerUnit, percentile),
                    mode: sampleDistribution(stream.unitEconomics.pricePerUnit, percentile),
                    max: sampleDistribution(stream.unitEconomics.pricePerUnit, percentile),
                },
                deliveryCostModel:
                    stream.unitEconomics.deliveryCostModel.type === "grossMargin"
                        ? {
                              type: "grossMargin",
                              marginPct: {
                                  ...stream.unitEconomics.deliveryCostModel.marginPct,
                                  min: sampleDistribution(stream.unitEconomics.deliveryCostModel.marginPct, percentile),
                                  mode: sampleDistribution(stream.unitEconomics.deliveryCostModel.marginPct, percentile),
                                  max: sampleDistribution(stream.unitEconomics.deliveryCostModel.marginPct, percentile),
                              },
                          }
                        : {
                              type: "perUnitCost",
                              costPerUnit: {
                                  ...stream.unitEconomics.deliveryCostModel.costPerUnit,
                                  min: sampleDistribution(stream.unitEconomics.deliveryCostModel.costPerUnit, percentile),
                                  mode: sampleDistribution(stream.unitEconomics.deliveryCostModel.costPerUnit, percentile),
                                  max: sampleDistribution(stream.unitEconomics.deliveryCostModel.costPerUnit, percentile),
                              },
                          },
                churnRate: stream.unitEconomics.churnRate
                    ? {
                          ...stream.unitEconomics.churnRate,
                          min: sampleDistribution(stream.unitEconomics.churnRate, percentile),
                          mode: sampleDistribution(stream.unitEconomics.churnRate, percentile),
                          max: sampleDistribution(stream.unitEconomics.churnRate, percentile),
                      }
                    : undefined,
            },
            adoptionModel: {
                ...stream.adoptionModel,
                acquisitionRate: {
                    ...stream.adoptionModel.acquisitionRate,
                    min: sampleDistribution(stream.adoptionModel.acquisitionRate, percentile),
                    mode: sampleDistribution(stream.adoptionModel.acquisitionRate, percentile),
                    max: sampleDistribution(stream.adoptionModel.acquisitionRate, percentile),
                },
            },
            acquisitionCosts: {
                ...stream.acquisitionCosts,
                cacPerUnit: {
                    ...stream.acquisitionCosts.cacPerUnit,
                    min: sampleDistribution(stream.acquisitionCosts.cacPerUnit, percentile),
                    mode: sampleDistribution(stream.acquisitionCosts.cacPerUnit, percentile),
                    max: sampleDistribution(stream.acquisitionCosts.cacPerUnit, percentile),
                },
            },
        }));
    }

    // Sample fixed costs
    if (sampled.costModel?.fixedMonthlyCosts) {
        sampled.costModel.fixedMonthlyCosts = sampled.costModel.fixedMonthlyCosts.map((cost) => ({
            ...cost,
            monthlyCost: {
                ...cost.monthlyCost,
                min: sampleDistribution(cost.monthlyCost, percentile),
                mode: sampleDistribution(cost.monthlyCost, percentile),
                max: sampleDistribution(cost.monthlyCost, percentile),
            },
        }));
    }

    return sampled;
}

/**
 * Run Monte Carlo simulation
 */
export function runMonteCarloSimulation(data: VentureData, numSimulations = 1000): MonteCarloResults {
    const allRuns: SimulationResult[] = [];

    // Run simulations at different percentiles
    for (let i = 0; i < numSimulations; i++) {
        const percentile = i / (numSimulations - 1);
        const sampledData = sampleVentureData(data, percentile);
        const snapshots = buildMonthlySnapshots(sampledData);

        const revenue = snapshots.map((s) => s.revenue ?? 0);
        const costs = snapshots.map((s) => s.costs ?? 0);
        const profit = revenue.map((r, i) => r - costs[i]!);
        const cash = snapshots.map((s) => s.cash ?? 0);

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

    return { scenarios, distribution };
}
