import type { RevenueStream, FixedCost, ComputedTask, VentureData, Distribution } from "../types";
import { addMonths, isWithin, monthIndexFromStart } from "./dateUtils";

/**
 * Get the mode (most likely value) from a distribution
 */
export function getDistributionMode(dist: Distribution | undefined): number {
    if (!dist) return 0;
    return dist.mode ?? (dist.min + dist.max) / 2;
}

/**
 * Get a numeric value from a Distribution or number
 */
export function getDistributionValue(dist: Distribution | number | undefined): number {
    if (!dist) return 0;
    if (typeof dist === "number") return dist;
    return getDistributionMode(dist);
}

/**
 * Calculate active units for a revenue stream at a specific month
 */
export function streamUnitsAtMonth(
    stream: RevenueStream,
    monthIndex: number,
    timeline: VentureData["timeline"]
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
    const { initialUnits, acquisitionRate, maxUnits, churnRate, expansionRate } = stream.adoptionModel;

    const acqRate = getDistributionMode(acquisitionRate);
    const churn = getDistributionMode(churnRate) || 0;
    const expansion = getDistributionMode(expansionRate) || 0;

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
 */
export function streamRevenueAtMonth(
    stream: RevenueStream,
    monthIndex: number,
    timeline: VentureData["timeline"]
): number {
    const units = streamUnitsAtMonth(stream, monthIndex, timeline);
    const priceMode = getDistributionMode(stream.unitEconomics.pricePerUnit);
    return units * priceMode;
}

/**
 * Calculate acquisition costs (CAC + onboarding) for a revenue stream at a specific month
 */
export function streamAcquisitionCostsAtMonth(
    stream: RevenueStream,
    monthIndex: number,
    timeline: VentureData["timeline"]
): { cac: number; onboarding: number; total: number } {
    const units = streamUnitsAtMonth(stream, monthIndex, timeline);
    const unitsLastMonth = monthIndex > 0 ? streamUnitsAtMonth(stream, monthIndex - 1, timeline) : 0;
    const newUnits = Math.max(0, units - unitsLastMonth);

    const cacPerUnit = getDistributionMode(stream.acquisitionCosts?.cacPerUnit);
    const onboardingPerUnit = getDistributionMode(stream.acquisitionCosts?.onboardingCostPerUnit);

    const cac = newUnits * cacPerUnit;
    const onboarding = newUnits * onboardingPerUnit;

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
    timeline: VentureData["timeline"]
): number {
    const revenue = streamRevenueAtMonth(stream, monthIndex, timeline);
    const costs = streamAcquisitionCostsAtMonth(stream, monthIndex, timeline).total;
    return revenue - costs;
}

/**
 * Calculate cost for a task at a specific month
 */
export function taskCostAtMonth(
    task: ComputedTask,
    monthIndex: number,
    ventureStart: string
): { oneOff: number; monthly: number; total: number } {
    const monthISO = addMonths(ventureStart, monthIndex);
    const isActive = isWithin(monthISO, task.computedStart, task.computedEnd);
    const isStartMonth = task.computedStart === monthISO;

    if (!isActive) return { oneOff: 0, monthly: 0, total: 0 };

    const oneOff = isStartMonth ? task.costOneOff : 0;
    const monthly = task.costMonthly;
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
    ventureStart: string
): { costs: FixedCost[]; total: number } {
    if (!fixedCosts) return { costs: [], total: 0 };

    const activeCosts = fixedCosts
        .map((fc) => {
            // If no start event, include from beginning
            if (!fc.startEventId) {
                const value = getDistributionValue(fc.monthlyCost);
                return { ...fc, activeValue: value };
            }

            // Find the task this fixed cost starts with
            const startTask = computedTasks.find((t) => t.id === fc.startEventId);
            if (!startTask) return null;

            // Check if we're at or after the start task's start month
            const startTaskMonthIndex = monthIndexFromStart(ventureStart, startTask.computedStart);
            if (monthIndex >= startTaskMonthIndex) {
                const value = getDistributionValue(fc.monthlyCost);
                return { ...fc, activeValue: value };
            }

            return null;
        })
        .filter((fc): fc is FixedCost & { activeValue: number } => fc !== null);

    const total = activeCosts.reduce((sum, fc) => sum + fc.activeValue, 0);

    return { costs: activeCosts, total };
}
