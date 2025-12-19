import type { RevenueStream, FixedCost, ComputedTask, VentureData, Distribution } from "../types";
import { addMonths, isWithin, monthIndexFromStart } from "./dateUtils";
import type { DistributionSelection } from "../contexts/RiskContext";

/**
 * Get a value from a distribution based on selection (min/mode/max)
 */
export function getDistributionMode(
    dist: Distribution | undefined,
    selection: DistributionSelection = "mode"
): number {
    if (!dist) return 0;

    if (dist.type === "triangular") {
        switch (selection) {
            case "min":
                return dist.min;
            case "max":
                return dist.max;
            case "mode":
            default:
                return dist.mode ?? (dist.min + dist.max) / 2;
        }
    }

    return 0;
}

/**
 * Get a numeric value from a Distribution or number
 */
export function getDistributionValue(
    dist: Distribution | number | undefined,
    selection: DistributionSelection = "mode"
): number {
    if (!dist) return 0;
    if (typeof dist === "number") return dist;
    return getDistributionMode(dist, selection);
}

/**
 * Calculate active units for a revenue stream at a specific month
 */
export function streamUnitsAtMonth(
    stream: RevenueStream,
    monthIndex: number,
    timeline: VentureData["timeline"],
    streamDistributions: Record<string, DistributionSelection> = {}
): number {
    // Check if stream has started (unlockEventId)
    const unlockEvent = timeline?.find((t) => t.id === stream.unlockEventId);
    const startMonth = unlockEvent?.month ?? 0;

    if (monthIndex < startMonth) return 0;

    // Check if stream has ended (duration)
    if (stream.duration) {
        const match = stream.duration.match(/^(\d+)([dwmy])$/);
        if (match) {
            const value = parseInt(match[1]!, 10);
            const unit = match[2]!;
            let durationMonths = 0;
            if (unit === "d") durationMonths = value / 30;
            else if (unit === "w") durationMonths = value / 4;
            else if (unit === "m") durationMonths = value;
            else if (unit === "y") durationMonths = value * 12;

            if (monthIndex >= startMonth + durationMonths) return 0;
        }
    }

    // Calculate units based on adoption model
    const monthsSinceStart = monthIndex - startMonth;
    const { initialUnits, acquisitionRate, churnRate, expansionRate } = stream.adoptionModel;

    const distributionSelection = streamDistributions[stream.id] ?? "mode";
    const acqRate = getDistributionMode(acquisitionRate, distributionSelection);
    const churn = getDistributionMode(churnRate, distributionSelection) || 0;
    const expansion = getDistributionMode(expansionRate, distributionSelection) || 0;

    // Get max units from market sizing SOM if available
    const maxUnits = stream.marketSizing?.som
        ? getDistributionMode(stream.marketSizing.som, distributionSelection)
        : undefined;

    // Simple model: start with initial units, grow by acquisition rate, apply net churn/expansion
    let units = initialUnits;
    for (let i = 0; i < monthsSinceStart; i++) {
        // Add new acquisitions
        units += acqRate;
        // Apply net churn/expansion: units * (1 - churn + expansion)
        units = units * (1 - churn / 100 + expansion / 100);
        // Cap at max units if specified
        if (maxUnits && units > maxUnits) units = maxUnits;
    }

    return Math.max(0, units);
}

/**
 * Calculate revenue for a revenue stream at a specific month
 * Accounts for billing frequency - monthly vs annual billing creates different revenue patterns
 * For annual billing, uses cohort-based billing where each cohort pays when they join and on renewals
 */
export function streamRevenueAtMonth(
    stream: RevenueStream,
    monthIndex: number,
    timeline: VentureData["timeline"],
    streamMultiplier: number = 1,
    streamDistributions: Record<string, DistributionSelection> = {}
): number {
    const distributionSelection = streamDistributions[stream.id] ?? "mode";
    const priceMode = getDistributionMode(stream.unitEconomics.pricePerUnit, distributionSelection);
    const billingFrequency = stream.unitEconomics.billingFrequency || "monthly";

    // Check if stream has started
    const unlockEvent = timeline?.find((t) => t.id === stream.unlockEventId);
    const startMonth = unlockEvent?.month ?? 0;

    if (monthIndex < startMonth) return 0;

    // For monthly billing, all active units generate revenue each month
    if (billingFrequency === "monthly") {
        const units = streamUnitsAtMonth(stream, monthIndex, timeline, streamDistributions);
        return units * priceMode * streamMultiplier;
    }

    // For annual billing, use cohort-based billing
    // Each cohort pays when they join and then every contractLength months after
    if (billingFrequency === "annual") {
        const contractLength = stream.unitEconomics.contractLengthMonths
            ? Math.round(getDistributionMode(stream.unitEconomics.contractLengthMonths, distributionSelection))
            : 12;

        let totalRevenue = 0;

        // Calculate revenue from all cohorts (current month and all previous renewal months)
        // A cohort pays if: (monthIndex - cohortStartMonth) % contractLength === 0
        for (let cohortMonth = startMonth; cohortMonth <= monthIndex; cohortMonth++) {
            const monthsSinceCohortStart = monthIndex - cohortMonth;

            // Check if this cohort is billing this month
            const isCohortBillingMonth = monthsSinceCohortStart % contractLength === 0;

            if (!isCohortBillingMonth) continue;

            // Calculate how many units from this cohort are still active
            // This is: (units at cohortMonth) - (churned units since then)
            // We approximate this by calculating the cohort size at the cohort month
            // and then applying the churn that would have occurred

            const { churnRate, expansionRate } = stream.adoptionModel;
            const churn = getDistributionMode(churnRate, distributionSelection) || 0;
            const expansion = getDistributionMode(expansionRate, distributionSelection) || 0;
            const netRetention = 1 - churn / 100 + expansion / 100;

            // Get units that joined in this cohort month (new acquisitions)
            let cohortSize: number;
            if (cohortMonth === startMonth) {
                // Initial cohort
                cohortSize = stream.adoptionModel.initialUnits;
            } else {
                // New acquisitions = change in units from previous month
                const unitsAtCohortMonth = streamUnitsAtMonth(stream, cohortMonth, timeline, streamDistributions);
                const unitsBeforeCohortMonth = streamUnitsAtMonth(stream, cohortMonth - 1, timeline, streamDistributions);
                const acqRate = getDistributionMode(stream.adoptionModel.acquisitionRate, distributionSelection);

                // New cohort size is approximately the acquisition rate
                // (This is a simplification - the actual calc would need to separate growth from existing users)
                cohortSize = acqRate;
            }

            // Apply retention from cohort start to current month
            const monthsSinceJoined = monthsSinceCohortStart;
            const survivingUnits = cohortSize * Math.pow(netRetention, monthsSinceJoined);

            // Revenue from this cohort
            totalRevenue += survivingUnits * priceMode * contractLength * streamMultiplier;
        }

        return totalRevenue;
    }

    return 0;
}

/**
 * Calculate acquisition costs (CAC + onboarding) for a revenue stream at a specific month
 */
export function streamAcquisitionCostsAtMonth(
    stream: RevenueStream,
    monthIndex: number,
    timeline: VentureData["timeline"],
    streamMultiplier: number = 1,
    streamDistributions: Record<string, DistributionSelection> = {}
): { cac: number; onboarding: number; total: number } {
    const units = streamUnitsAtMonth(stream, monthIndex, timeline, streamDistributions);
    const unitsLastMonth = monthIndex > 0 ? streamUnitsAtMonth(stream, monthIndex - 1, timeline, streamDistributions) : 0;
    const newUnits = Math.max(0, units - unitsLastMonth);

    const distributionSelection = streamDistributions[stream.id] ?? "mode";
    const cacPerUnit = getDistributionMode(stream.acquisitionCosts?.cacPerUnit, distributionSelection);
    const onboardingPerUnit = getDistributionMode(stream.acquisitionCosts?.onboardingCostPerUnit, distributionSelection);

    const cac = newUnits * cacPerUnit * streamMultiplier;
    const onboarding = newUnits * onboardingPerUnit * streamMultiplier;

    return {
        cac,
        onboarding,
        total: cac + onboarding,
    };
}

/**
 * Calculate margin for a revenue stream at a specific month (revenue - acquisition costs)
 */
export function streamMarginAtMonth(
    stream: RevenueStream,
    monthIndex: number,
    timeline: VentureData["timeline"],
    streamMultiplier: number = 1,
    streamDistributions: Record<string, DistributionSelection> = {}
): number {
    const revenue = streamRevenueAtMonth(stream, monthIndex, timeline, streamMultiplier, streamDistributions);
    const costs = streamAcquisitionCostsAtMonth(stream, monthIndex, timeline, streamMultiplier, streamDistributions).total;
    return revenue - costs;
}

/**
 * Calculate cost for a task at a specific month
 */
export function taskCostAtMonth(
    task: ComputedTask,
    monthIndex: number,
    ventureStart: string,
    taskMultiplier: number = 1
): { oneOff: number; monthly: number; total: number } {
    const monthISO = addMonths(ventureStart, monthIndex);
    const isActive = isWithin(monthISO, task.computedStart, task.computedEnd);
    const isStartMonth = task.computedStart === monthISO;

    if (!isActive) return { oneOff: 0, monthly: 0, total: 0 };

    const oneOff = isStartMonth ? task.costOneOff * taskMultiplier : 0;
    const monthly = task.costMonthly * taskMultiplier;
    const total = oneOff + monthly;

    return { oneOff, monthly, total };
}

/**
 * Calculate fixed costs at a specific month
 */
export function fixedCostsAtMonth(
    fixedCosts: FixedCost[] | undefined,
    monthIndex: number,
    computedTasks: ComputedTask[],
    ventureStart: string,
    fixedCostMultipliers: Record<string, number> = {},
    distributionSelection: DistributionSelection = "mode"
): { costs: FixedCost[]; total: number } {
    if (!fixedCosts) return { costs: [], total: 0 };

    const activeCosts = fixedCosts
        .map((fc) => {
            // If no start event, include from beginning
            if (!fc.startEventId) {
                const value = getDistributionValue(fc.monthlyCost, distributionSelection);
                const multiplier = fixedCostMultipliers[fc.id] ?? 1;
                return { ...fc, activeValue: value * multiplier };
            }

            // Find the task this fixed cost starts with
            const startTask = computedTasks.find((t) => t.id === fc.startEventId);
            if (!startTask) return null;

            // Check if we're at or after the start task's start month
            const startTaskMonthIndex = monthIndexFromStart(ventureStart, startTask.computedStart);
            if (monthIndex >= startTaskMonthIndex) {
                const value = getDistributionValue(fc.monthlyCost, distributionSelection);
                const multiplier = fixedCostMultipliers[fc.id] ?? 1;
                return { ...fc, activeValue: value * multiplier };
            }

            return null;
        })
        .filter((fc): fc is FixedCost & { activeValue: number } => fc !== null);

    const total = activeCosts.reduce((sum, fc) => sum + fc.activeValue, 0);

    return { costs: activeCosts, total };
}

/**
 * Calculate comprehensive monthly metrics for a revenue stream
 * Consolidates units, revenue, delivery costs, acquisition costs, and net profit calculations
 */
export function calculateStreamMonthlyMetrics(
    stream: RevenueStream,
    monthIndex: number,
    timeline: VentureData["timeline"],
    distributionSelection: DistributionSelection = "mode",
    multiplier: number = 1
): {
    units: number;
    grossRevenue: number;
    deliveryCosts: number;
    acquisitionCosts: {
        cac: number;
        onboarding: number;
        total: number;
    };
    totalCosts: number;
    netProfit: number;
} {
    // Use the stream-specific distribution selection
    const streamDistributions = { [stream.id]: distributionSelection };

    // Calculate units
    const units = streamUnitsAtMonth(stream, monthIndex, timeline, streamDistributions);

    // Calculate gross revenue
    const grossRevenue = streamRevenueAtMonth(stream, monthIndex, timeline, multiplier, streamDistributions);

    // Calculate acquisition costs (CAC + onboarding)
    const acquisitionCosts = streamAcquisitionCostsAtMonth(stream, monthIndex, timeline, multiplier, streamDistributions);

    // Calculate delivery costs based on delivery cost model
    let deliveryCosts = 0;
    if (stream.unitEconomics.deliveryCostModel.type === "grossMargin") {
        const marginPct = getDistributionMode(stream.unitEconomics.deliveryCostModel.marginPct, distributionSelection);
        // Cost = Revenue * (1 - margin%)
        deliveryCosts = grossRevenue * (1 - marginPct / 100);
    } else {
        // perUnitCost
        const costPerUnit = getDistributionMode(stream.unitEconomics.deliveryCostModel.costPerUnit, distributionSelection);
        deliveryCosts = units * costPerUnit;
    }

    // Calculate totals
    const totalCosts = deliveryCosts + acquisitionCosts.total;
    const netProfit = grossRevenue - totalCosts;

    return {
        units,
        grossRevenue,
        deliveryCosts,
        acquisitionCosts,
        totalCosts,
        netProfit,
    };
}
