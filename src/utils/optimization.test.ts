import { describe, it, expect } from "bun:test";
import { runOptimization, runSensitivityAnalysis } from "./optimization";
import type { VentureData } from "../types";

// Simple test model with one revenue stream and one fixed cost
const createTestModel = (): VentureData => ({
    meta: {
        name: "Test Venture",
        currency: "USD",
        startDate: "2024-01-01",
        horizonMonths: 60,
        initialReserve: 100000,
    },
    tasks: [
        {
            id: "T1",
            name: "Build Product",
            phase: "Build",
            start: "2024-01-01", // Start immediately
            duration: "6m",
            costOneOff: 50000,
            costMonthly: 10000,
            dependsOn: [],
        },
    ],
    fixedCosts: [
        {
            id: "FC1",
            name: "Office Rent",
            monthlyCost: {
                type: "triangular",
                min: 2000,
                mode: 3000,
                max: 4000,
            },
        },
    ],
    revenueStreams: [
        {
            id: "RS1",
            name: "SaaS Subscriptions",
            pricingModel: "Subscription",
            startEventId: "T1e", // Start when T1 ends
            unitEconomics: {
                pricePerUnit: {
                    type: "triangular",
                    min: 40,
                    mode: 50,
                    max: 60,
                },
                billingFrequency: "monthly",
                deliveryCostModel: {
                    type: "grossMargin",
                    marginPct: {
                        type: "triangular",
                        min: 70,
                        mode: 80,
                        max: 90,
                    },
                },
            },
            adoptionModel: {
                initialUnits: 0,
                acquisitionRate: {
                    type: "triangular",
                    min: 20,
                    mode: 30,
                    max: 40,
                },
                churnRate: {
                    type: "triangular",
                    min: 3,
                    mode: 5,
                    max: 7,
                },
            },
            acquisitionCosts: {
                cacPerUnit: {
                    type: "triangular",
                    min: 80,
                    mode: 100,
                    max: 120,
                },
            },
        },
    ],
});

describe("Optimization", () => {
    it("should verify test model generates revenue and costs", async () => {
        const model = createTestModel();
        const { computeSeries } = await import("./modelEngine");
        const series = computeSeries(model);

        console.log("\nTest Model Validation:");
        console.log(`Series length: ${series.length}`);
        console.log(`Month 0:`, series[0]);
        console.log(`Month 6:`, series[6]);
        console.log(`Month 12:`, series[12]);
        console.log(`Month 24:`, series[24]);

        // Find first month with revenue
        const firstRevenue = series.findIndex(s => s.totalRevenue > 0);
        console.log(`First month with revenue: ${firstRevenue}`);

        // Find first month with positive profit
        const firstProfit = series.findIndex(s => s.totalRevenue - s.totalCosts > 0);
        console.log(`First month with profit: ${firstProfit}`);

        expect(series.length).toBeGreaterThan(0);
    });

    it("should run sensitivity analysis and return results", () => {
        const model = createTestModel();
        const results = runSensitivityAnalysis(model);

        console.log("Sensitivity Analysis Results:");
        results.slice(0, 5).forEach((result) => {
            console.log(
                `  ${result.streamOrCostName} - ${result.parameter}: ` +
                    `profitability ${result.profitabilityImpact} months, ROI ${result.roiImpact.toFixed(1)}%`
            );
        });

        expect(results.length).toBeGreaterThan(0);
        expect(results[0]).toHaveProperty("parameter");
        expect(results[0]).toHaveProperty("profitabilityImpact");
        expect(results[0]).toHaveProperty("roiImpact");
    });

    it("should run optimization and find improvements for maximize_roi goal", () => {
        const model = createTestModel();
        const result = runOptimization(model, "maximize_roi", {
            streamPrices: true,
            streamCAC: true,
            streamAcquisitionRate: true,
            streamChurn: true,
            fixedCosts: true,
        }, 30);

        console.log("\nOptimization Results (Maximize ROI):");
        console.log("Current Metrics:", result.currentMetrics);
        console.log("Optimized Metrics:", result.optimizedMetrics);
        console.log("Improvements:", result.improvements);
        console.log("Recommendations:", result.recommendations.length);

        result.recommendations.forEach((rec) => {
            console.log(
                `  ${rec.parameter}: ${rec.currentValue.toFixed(2)} → ${rec.suggestedValue.toFixed(2)} (${rec.changePercent > 0 ? "+" : ""}${rec.changePercent.toFixed(1)}%)`
            );
        });

        expect(result.currentMetrics).toHaveProperty("profitableMonth");
        expect(result.currentMetrics).toHaveProperty("roiBreakevenMonth");
        expect(result.currentMetrics).toHaveProperty("roi5Year");
        expect(result.optimizedMetrics).toHaveProperty("roi5Year");
    });

    it("should run optimization for minimize_profitability_time goal", () => {
        const model = createTestModel();
        const result = runOptimization(model, "minimize_profitability_time", {
            streamPrices: true,
            streamCAC: true,
            streamAcquisitionRate: true,
            streamChurn: true,
            fixedCosts: true,
        }, 30);

        console.log("\nOptimization Results (Minimize Profitability Time):");
        console.log("Current Metrics:", result.currentMetrics);
        console.log("Optimized Metrics:", result.optimizedMetrics);
        console.log("Improvements:", result.improvements);
        console.log("Recommendations:", result.recommendations.length);

        result.recommendations.forEach((rec) => {
            console.log(
                `  ${rec.parameter}: ${rec.currentValue.toFixed(2)} → ${rec.suggestedValue.toFixed(2)} (${rec.changePercent > 0 ? "+" : ""}${rec.changePercent.toFixed(1)}%)`
            );
        });

        expect(result).toHaveProperty("recommendations");
    });

    it("should run optimization for balanced goal", () => {
        const model = createTestModel();
        const result = runOptimization(model, "balanced", {
            streamPrices: true,
            streamCAC: true,
            streamAcquisitionRate: true,
            streamChurn: true,
            fixedCosts: true,
        }, 30);

        console.log("\nOptimization Results (Balanced):");
        console.log("Current Metrics:", result.currentMetrics);
        console.log("Optimized Metrics:", result.optimizedMetrics);
        console.log("Improvements:", result.improvements);
        console.log("Recommendations:", result.recommendations.length);

        result.recommendations.forEach((rec) => {
            console.log(
                `  ${rec.parameter}: ${rec.currentValue.toFixed(2)} → ${rec.suggestedValue.toFixed(2)} (${rec.changePercent > 0 ? "+" : ""}${rec.changePercent.toFixed(1)}%)`
            );
        });

        expect(result).toHaveProperty("recommendations");
    });

    it("should respect maxAdjustmentPercent constraint", () => {
        const model = createTestModel();
        const result = runOptimization(model, "maximize_roi", {
            streamPrices: true,
            streamCAC: true,
            streamAcquisitionRate: true,
            streamChurn: true,
            fixedCosts: true,
        }, 10); // Only allow 10% max adjustment

        console.log("\nOptimization with 10% max adjustment:");
        console.log("Recommendations:", result.recommendations.length);

        result.recommendations.forEach((rec) => {
            console.log(
                `  ${rec.parameter}: ${rec.currentValue.toFixed(2)} → ${rec.suggestedValue.toFixed(2)} (${rec.changePercent > 0 ? "+" : ""}${rec.changePercent.toFixed(1)}%)`
            );
            expect(Math.abs(rec.changePercent)).toBeLessThanOrEqual(10);
        });
    });
});
