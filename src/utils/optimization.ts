import type { VentureData, Distribution } from "../types";
import { computeSeries } from "./modelEngine";

// Types for optimization
export type OptimizationGoal = "minimize_profitability_time" | "maximize_roi" | "balanced";

export type ParameterAdjustment = {
    type: "revenue_stream" | "fixed_cost" | "task";
    id: string;
    parameter: string;
    currentValue: number;
    suggestedValue: number;
    change: number;
    changePercent: number;
    impact: number;
};

export type OptimizationResult = {
    currentMetrics: {
        profitableMonth: number | null;
        roiBreakevenMonth: number | null;
        roi5Year: number;
    };
    optimizedMetrics: {
        profitableMonth: number | null;
        roiBreakevenMonth: number | null;
        roi5Year: number;
    };
    improvements: {
        profitabilityMonths: number;
        roiBreakevenMonths: number;
        roi5YearDelta: number;
    };
    recommendations: ParameterAdjustment[];
    sensitivityAnalysis: SensitivityResult[];
};

export type SensitivityResult = {
    parameter: string;
    streamOrCostId: string;
    streamOrCostName: string;
    baseline: number;
    profitabilityImpact: number; // Change in months to profitability
    roiImpact: number; // Change in ROI %
};

// Helper to get mode value from distribution
function getDistributionMode(dist: Distribution): number {
    if (dist.type === "triangular") {
        return dist.mode;
    } else if (dist.type === "normal") {
        return dist.mean;
    } else if (dist.type === "lognormal") {
        return dist.mode;
    }
    return 0;
}

// Helper to update distribution mode while preserving relative shape
function updateDistributionMode(dist: Distribution, newMode: number): Distribution {
    if (dist.type === "triangular") {
        const oldMode = dist.mode;
        if (oldMode === 0 || newMode < 0) return dist;
        const scale = newMode / oldMode;
        // Scale min and max proportionally to maintain distribution shape
        const newMin = Math.max(0, dist.min * scale);
        const newMax = dist.max * scale;
        return { ...dist, mode: newMode, min: newMin, max: newMax };
    } else if (dist.type === "normal") {
        const oldMean = dist.mean;
        if (oldMean === 0 || newMode < 0) return dist;
        const scale = newMode / oldMean;
        // Scale stdDev proportionally
        return { ...dist, mean: newMode, stdDev: dist.stdDev * scale };
    } else if (dist.type === "lognormal") {
        const oldMode = dist.mode;
        if (oldMode === 0 || newMode < 0) return dist;
        const scale = newMode / oldMode;
        // Scale min and max proportionally
        const newMin = Math.max(0, dist.min * scale);
        const newMax = dist.max * scale;
        return { ...dist, mode: newMode, min: newMin, max: newMax };
    }
    return dist;
}

// Calculate key metrics from venture data
function calculateMetrics(
    data: VentureData,
    taskMultipliers: Record<string, number> = {},
    fixedCostMultipliers: Record<string, number> = {},
    revenueStreamMultipliers: Record<string, number> = {},
    streamDistributions: Record<string, "min" | "mode" | "max"> = {},
    horizon: number = 60
) {
    const series = computeSeries(data, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);

    // Find profitable month (first month with positive monthly profit)
    let profitableMonth: number | null = null;
    for (let i = 0; i < series.length; i++) {
        const monthProfit = series[i].profit;
        if (monthProfit > 0) {
            profitableMonth = i + 1;
            break;
        }
    }

    // Find ROI breakeven month (first month with cumulative profit >= 0)
    let roiBreakevenMonth: number | null = null;
    for (let i = 0; i < series.length; i++) {
        const cumProfit = series[i].cumRevenue - series[i].cumCosts;
        if (cumProfit >= 0) {
            roiBreakevenMonth = i + 1;
            break;
        }
    }

    // Calculate 5-year ROI
    const months5Year = Math.min(60, series.length);
    const totalRevenue5Y = series[months5Year - 1]?.cumRevenue || 0;
    const totalCosts5Y = series[months5Year - 1]?.cumCosts || 0;
    const roi5Year = totalCosts5Y > 0 ? ((totalRevenue5Y - totalCosts5Y) / totalCosts5Y) * 100 : 0;

    return { profitableMonth, roiBreakevenMonth, roi5Year };
}

// Run sensitivity analysis
export function runSensitivityAnalysis(
    data: VentureData,
    taskMultipliers: Record<string, number> = {},
    fixedCostMultipliers: Record<string, number> = {},
    revenueStreamMultipliers: Record<string, number> = {},
    streamDistributions: Record<string, "min" | "mode" | "max"> = {},
    adjustmentPercent: number = 10
): SensitivityResult[] {
    const results: SensitivityResult[] = [];
    const baselineMetrics = calculateMetrics(data, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);

    // Test each revenue stream parameter
    for (const stream of data.revenueStreams || []) {
        // Test price per unit
        const basePrice = getDistributionMode(stream.unitEconomics.pricePerUnit);
        const testData = JSON.parse(JSON.stringify(data)) as VentureData;
        const testStream = testData.revenueStreams?.find(s => s.id === stream.id);
        if (testStream) {
            testStream.unitEconomics.pricePerUnit = updateDistributionMode(
                testStream.unitEconomics.pricePerUnit,
                basePrice * (1 + adjustmentPercent / 100)
            );
            const testMetrics = calculateMetrics(testData, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
            results.push({
                parameter: "Price per Unit",
                streamOrCostId: stream.id,
                streamOrCostName: stream.name,
                baseline: basePrice,
                profitabilityImpact: (testMetrics.profitableMonth || 999) - (baselineMetrics.profitableMonth || 999),
                roiImpact: testMetrics.roi5Year - baselineMetrics.roi5Year,
            });
        }

        // Test CAC per unit
        if (stream.acquisitionCosts?.cacPerUnit) {
            const baseCac = getDistributionMode(stream.acquisitionCosts.cacPerUnit);
            const testData = JSON.parse(JSON.stringify(data)) as VentureData;
            const testStream = testData.revenueStreams?.find(s => s.id === stream.id);
            if (testStream && testStream.acquisitionCosts?.cacPerUnit) {
                testStream.acquisitionCosts.cacPerUnit = updateDistributionMode(
                    testStream.acquisitionCosts.cacPerUnit,
                    baseCac * (1 - adjustmentPercent / 100) // Reduce CAC
                );
                const testMetrics = calculateMetrics(testData, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
                results.push({
                    parameter: "CAC per Unit",
                    streamOrCostId: stream.id,
                    streamOrCostName: stream.name,
                    baseline: baseCac,
                    profitabilityImpact: (testMetrics.profitableMonth || 999) - (baselineMetrics.profitableMonth || 999),
                    roiImpact: testMetrics.roi5Year - baselineMetrics.roi5Year,
                });
            }
        }

        // Test acquisition rate
        const baseAcqRate = getDistributionMode(stream.adoptionModel.acquisitionRate);
        const testData2 = JSON.parse(JSON.stringify(data)) as VentureData;
        const testStream2 = testData2.revenueStreams?.find(s => s.id === stream.id);
        if (testStream2) {
            testStream2.adoptionModel.acquisitionRate = updateDistributionMode(
                testStream2.adoptionModel.acquisitionRate,
                baseAcqRate * (1 + adjustmentPercent / 100)
            );
            const testMetrics = calculateMetrics(testData2, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
            results.push({
                parameter: "Acquisition Rate",
                streamOrCostId: stream.id,
                streamOrCostName: stream.name,
                baseline: baseAcqRate,
                profitabilityImpact: (testMetrics.profitableMonth || 999) - (baselineMetrics.profitableMonth || 999),
                roiImpact: testMetrics.roi5Year - baselineMetrics.roi5Year,
            });
        }

        // Test churn rate (if exists)
        if (stream.adoptionModel.churnRate) {
            const baseChurn = getDistributionMode(stream.adoptionModel.churnRate);
            const testData3 = JSON.parse(JSON.stringify(data)) as VentureData;
            const testStream3 = testData3.revenueStreams?.find(s => s.id === stream.id);
            if (testStream3 && testStream3.adoptionModel.churnRate) {
                testStream3.adoptionModel.churnRate = updateDistributionMode(
                    testStream3.adoptionModel.churnRate,
                    baseChurn * (1 - adjustmentPercent / 100) // Reduce churn
                );
                const testMetrics = calculateMetrics(testData3, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
                results.push({
                    parameter: "Churn Rate",
                    streamOrCostId: stream.id,
                    streamOrCostName: stream.name,
                    baseline: baseChurn,
                    profitabilityImpact: (testMetrics.profitableMonth || 999) - (baselineMetrics.profitableMonth || 999),
                    roiImpact: testMetrics.roi5Year - baselineMetrics.roi5Year,
                });
            }
        }
    }

    // Test each fixed cost
    for (const cost of data.fixedCosts || []) {
        const baseCost = getDistributionMode(cost.monthlyCost);
        const testData = JSON.parse(JSON.stringify(data)) as VentureData;
        const testCost = testData.fixedCosts?.find(c => c.id === cost.id);
        if (testCost) {
            testCost.monthlyCost = updateDistributionMode(
                testCost.monthlyCost,
                baseCost * (1 - adjustmentPercent / 100) // Reduce cost
            );
            const testMetrics = calculateMetrics(testData, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
            results.push({
                parameter: "Monthly Cost",
                streamOrCostId: cost.id,
                streamOrCostName: cost.name,
                baseline: baseCost,
                profitabilityImpact: (testMetrics.profitableMonth || 999) - (baselineMetrics.profitableMonth || 999),
                roiImpact: testMetrics.roi5Year - baselineMetrics.roi5Year,
            });
        }
    }

    // Sort by impact (combined score)
    results.sort((a, b) => {
        const scoreA = Math.abs(a.profitabilityImpact) + Math.abs(a.roiImpact) / 10;
        const scoreB = Math.abs(b.profitabilityImpact) + Math.abs(b.roiImpact) / 10;
        return scoreB - scoreA;
    });

    return results;
}

// Run optimization to find best parameter values
export function runOptimization(
    data: VentureData,
    goal: OptimizationGoal,
    adjustableParams: {
        streamPrices?: boolean;
        streamCAC?: boolean;
        streamAcquisitionRate?: boolean;
        streamChurn?: boolean;
        fixedCosts?: boolean;
    } = {
        streamPrices: true,
        streamCAC: true,
        streamAcquisitionRate: true,
        streamChurn: true,
        fixedCosts: true,
    },
    maxAdjustmentPercent: number = 30,
    taskMultipliers: Record<string, number> = {},
    fixedCostMultipliers: Record<string, number> = {},
    revenueStreamMultipliers: Record<string, number> = {},
    streamDistributions: Record<string, "min" | "mode" | "max"> = {}
): OptimizationResult {
    const currentMetrics = calculateMetrics(data, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
    let bestData = JSON.parse(JSON.stringify(data)) as VentureData;
    let bestMetrics = { ...currentMetrics };
    const recommendations: ParameterAdjustment[] = [];

    // Define objective function based on goal
    const objectiveScore = (metrics: typeof currentMetrics) => {
        const profitTime = metrics.profitableMonth || 999;
        const roiTime = metrics.roiBreakevenMonth || 999;
        const roi = metrics.roi5Year;

        if (goal === "minimize_profitability_time") {
            return -profitTime; // Negative because we want to minimize
        } else if (goal === "maximize_roi") {
            return roi;
        } else { // balanced
            return roi / 10 - profitTime - roiTime / 2;
        }
    };

    let currentScore = objectiveScore(bestMetrics);
    const stepPercents = [5, 10, 15, 20, 25, 30];

    console.log("Starting optimization:", {
        currentScore,
        profitableMonth: currentMetrics.profitableMonth,
        roiBreakevenMonth: currentMetrics.roiBreakevenMonth,
        roi5Year: currentMetrics.roi5Year,
    });

    // Greedy optimization: try each parameter adjustment
    let improved = true;
    let iterations = 0;
    const maxIterations = 3;

    while (improved && iterations < maxIterations) {
        improved = false;
        iterations++;
        console.log(`Optimization iteration ${iterations}`);

        // Try increasing prices
        if (adjustableParams.streamPrices) {
            for (const stream of bestData.revenueStreams || []) {
                const basePrice = getDistributionMode(stream.unitEconomics.pricePerUnit);

                for (const stepPct of stepPercents) {
                    if (stepPct > maxAdjustmentPercent) continue;

                    const testData = JSON.parse(JSON.stringify(bestData)) as VentureData;
                    const testStream = testData.revenueStreams?.find(s => s.id === stream.id);
                    if (testStream) {
                        testStream.unitEconomics.pricePerUnit = updateDistributionMode(
                            testStream.unitEconomics.pricePerUnit,
                            basePrice * (1 + stepPct / 100)
                        );
                        const testMetrics = calculateMetrics(testData, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
                        const testScore = objectiveScore(testMetrics);

                        if (testScore > currentScore) {
                            console.log(`Found improvement: ${stream.name} price +${stepPct}%`, {
                                oldScore: currentScore,
                                newScore: testScore,
                                improvement: testScore - currentScore,
                            });
                            bestData = testData;
                            bestMetrics = testMetrics;
                            currentScore = testScore;
                            improved = true;

                            recommendations.push({
                                type: "revenue_stream",
                                id: stream.id,
                                parameter: `${stream.name} - Price per Unit`,
                                currentValue: basePrice,
                                suggestedValue: basePrice * (1 + stepPct / 100),
                                change: basePrice * stepPct / 100,
                                changePercent: stepPct,
                                impact: testScore - objectiveScore(currentMetrics),
                            });
                            break;
                        }
                    }
                }
            }
        }

        // Try reducing CAC
        if (adjustableParams.streamCAC) {
            for (const stream of bestData.revenueStreams || []) {
                if (!stream.acquisitionCosts?.cacPerUnit) continue;
                const baseCac = getDistributionMode(stream.acquisitionCosts.cacPerUnit);

                for (const stepPct of stepPercents) {
                    if (stepPct > maxAdjustmentPercent) continue;

                    const testData = JSON.parse(JSON.stringify(bestData)) as VentureData;
                    const testStream = testData.revenueStreams?.find(s => s.id === stream.id);
                    if (testStream && testStream.acquisitionCosts?.cacPerUnit) {
                        testStream.acquisitionCosts.cacPerUnit = updateDistributionMode(
                            testStream.acquisitionCosts.cacPerUnit,
                            baseCac * (1 - stepPct / 100)
                        );
                        const testMetrics = calculateMetrics(testData, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
                        const testScore = objectiveScore(testMetrics);

                        if (testScore > currentScore) {
                            bestData = testData;
                            bestMetrics = testMetrics;
                            currentScore = testScore;
                            improved = true;

                            recommendations.push({
                                type: "revenue_stream",
                                id: stream.id,
                                parameter: `${stream.name} - CAC per Unit`,
                                currentValue: baseCac,
                                suggestedValue: baseCac * (1 - stepPct / 100),
                                change: -baseCac * stepPct / 100,
                                changePercent: -stepPct,
                                impact: testScore - objectiveScore(currentMetrics),
                            });
                            break;
                        }
                    }
                }
            }
        }

        // Try increasing acquisition rate
        if (adjustableParams.streamAcquisitionRate) {
            for (const stream of bestData.revenueStreams || []) {
                const baseAcqRate = getDistributionMode(stream.adoptionModel.acquisitionRate);

                for (const stepPct of stepPercents) {
                    if (stepPct > maxAdjustmentPercent) continue;

                    const testData = JSON.parse(JSON.stringify(bestData)) as VentureData;
                    const testStream = testData.revenueStreams?.find(s => s.id === stream.id);
                    if (testStream) {
                        testStream.adoptionModel.acquisitionRate = updateDistributionMode(
                            testStream.adoptionModel.acquisitionRate,
                            baseAcqRate * (1 + stepPct / 100)
                        );
                        const testMetrics = calculateMetrics(testData, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
                        const testScore = objectiveScore(testMetrics);

                        if (testScore > currentScore) {
                            bestData = testData;
                            bestMetrics = testMetrics;
                            currentScore = testScore;
                            improved = true;

                            recommendations.push({
                                type: "revenue_stream",
                                id: stream.id,
                                parameter: `${stream.name} - Acquisition Rate`,
                                currentValue: baseAcqRate,
                                suggestedValue: baseAcqRate * (1 + stepPct / 100),
                                change: baseAcqRate * stepPct / 100,
                                changePercent: stepPct,
                                impact: testScore - objectiveScore(currentMetrics),
                            });
                            break;
                        }
                    }
                }
            }
        }

        // Try reducing churn
        if (adjustableParams.streamChurn) {
            for (const stream of bestData.revenueStreams || []) {
                if (!stream.adoptionModel.churnRate) continue;
                const baseChurn = getDistributionMode(stream.adoptionModel.churnRate);

                for (const stepPct of stepPercents) {
                    if (stepPct > maxAdjustmentPercent) continue;

                    const testData = JSON.parse(JSON.stringify(bestData)) as VentureData;
                    const testStream = testData.revenueStreams?.find(s => s.id === stream.id);
                    if (testStream && testStream.adoptionModel.churnRate) {
                        testStream.adoptionModel.churnRate = updateDistributionMode(
                            testStream.adoptionModel.churnRate,
                            baseChurn * (1 - stepPct / 100)
                        );
                        const testMetrics = calculateMetrics(testData, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
                        const testScore = objectiveScore(testMetrics);

                        if (testScore > currentScore) {
                            bestData = testData;
                            bestMetrics = testMetrics;
                            currentScore = testScore;
                            improved = true;

                            recommendations.push({
                                type: "revenue_stream",
                                id: stream.id,
                                parameter: `${stream.name} - Churn Rate`,
                                currentValue: baseChurn,
                                suggestedValue: baseChurn * (1 - stepPct / 100),
                                change: -baseChurn * stepPct / 100,
                                changePercent: -stepPct,
                                impact: testScore - objectiveScore(currentMetrics),
                            });
                            break;
                        }
                    }
                }
            }
        }

        // Try reducing fixed costs
        if (adjustableParams.fixedCosts) {
            for (const cost of bestData.fixedCosts || []) {
                const baseCost = getDistributionMode(cost.monthlyCost);

                for (const stepPct of stepPercents) {
                    if (stepPct > maxAdjustmentPercent) continue;

                    const testData = JSON.parse(JSON.stringify(bestData)) as VentureData;
                    const testCost = testData.fixedCosts?.find(c => c.id === cost.id);
                    if (testCost) {
                        testCost.monthlyCost = updateDistributionMode(
                            testCost.monthlyCost,
                            baseCost * (1 - stepPct / 100)
                        );
                        const testMetrics = calculateMetrics(testData, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);
                        const testScore = objectiveScore(testMetrics);

                        if (testScore > currentScore) {
                            bestData = testData;
                            bestMetrics = testMetrics;
                            currentScore = testScore;
                            improved = true;

                            recommendations.push({
                                type: "fixed_cost",
                                id: cost.id,
                                parameter: `${cost.name} - Monthly Cost`,
                                currentValue: baseCost,
                                suggestedValue: baseCost * (1 - stepPct / 100),
                                change: -baseCost * stepPct / 100,
                                changePercent: -stepPct,
                                impact: testScore - objectiveScore(currentMetrics),
                            });
                            break;
                        }
                    }
                }
            }
        }
    }

    // Run sensitivity analysis on the current data
    const sensitivityAnalysis = runSensitivityAnalysis(data, taskMultipliers, fixedCostMultipliers, revenueStreamMultipliers, streamDistributions);

    console.log("Optimization complete:", {
        iterations,
        recommendationsFound: recommendations.length,
        finalScore: currentScore,
        improvements: {
            profitabilityMonths: (currentMetrics.profitableMonth || 999) - (bestMetrics.profitableMonth || 999),
            roiBreakevenMonths: (currentMetrics.roiBreakevenMonth || 999) - (bestMetrics.roiBreakevenMonth || 999),
            roi5YearDelta: bestMetrics.roi5Year - currentMetrics.roi5Year,
        },
    });

    return {
        currentMetrics,
        optimizedMetrics: bestMetrics,
        improvements: {
            profitabilityMonths: (currentMetrics.profitableMonth || 999) - (bestMetrics.profitableMonth || 999),
            roiBreakevenMonths: (currentMetrics.roiBreakevenMonth || 999) - (bestMetrics.roiBreakevenMonth || 999),
            roi5YearDelta: bestMetrics.roi5Year - currentMetrics.roi5Year,
        },
        recommendations,
        sensitivityAnalysis,
    };
}
