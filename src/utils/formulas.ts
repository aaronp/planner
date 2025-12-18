import type { VentureData, ComputedTask } from "../types";
import type { DistributionSelection } from "../contexts/RiskContext";
import {
    taskCostAtMonth,
    fixedCostsAtMonth,
} from "./logic";

/**
 * Formula component - represents a single line in a formula breakdown
 */
export type FormulaComponent = {
    label: string;
    value: number;
    subComponents?: FormulaComponent[];
};

/**
 * Formula result - includes the total value and breakdown
 */
export type FormulaResult = {
    total: number;
    components: FormulaComponent[];
};

/**
 * Calculate total costs for a given month with full breakdown
 */
export function calculateTotalCosts(
    data: VentureData,
    monthIndex: number,
    computedTasks: ComputedTask[],
    taskMultipliers: Record<string, number> = {},
    fixedCostMultipliers: Record<string, number> = {},
    distributionSelection: DistributionSelection = "mode"
): FormulaResult {
    const components: FormulaComponent[] = [];

    // Task costs
    const taskComponents: FormulaComponent[] = [];
    let taskTotal = 0;

    for (const task of computedTasks) {
        const taskMultiplier = taskMultipliers[task.id] ?? 1;
        const { oneOff, monthly, total } = taskCostAtMonth(task, monthIndex, data.meta.start, taskMultiplier);
        if (total > 0) {
            const subComponents: FormulaComponent[] = [];
            if (oneOff > 0) subComponents.push({ label: "One-off", value: oneOff });
            if (monthly > 0) subComponents.push({ label: "Monthly", value: monthly });

            taskComponents.push({
                label: task.name,
                value: total,
                subComponents,
            });
            taskTotal += total;
        }
    }

    if (taskTotal > 0) {
        components.push({
            label: "Task costs",
            value: taskTotal,
            subComponents: taskComponents,
        });
    }

    // Fixed costs
    const fixedCostData = fixedCostsAtMonth(
        data.costModel?.fixedMonthlyCosts,
        monthIndex,
        computedTasks,
        data.meta.start,
        fixedCostMultipliers,
        distributionSelection
    );

    if (fixedCostData.total > 0) {
        const fixedComponents: FormulaComponent[] = fixedCostData.costs.map((fc) => ({
            label: fc.name,
            value: (fc as any).activeValue || 0,
        }));

        components.push({
            label: "Fixed costs",
            value: fixedCostData.total,
            subComponents: fixedComponents,
        });
    }

    const total = components.reduce((sum, comp) => sum + comp.value, 0);

    return {
        total,
        components,
    };
}

/**
 * Calculate total margin for a given month with full breakdown
 */
export function calculateTotalMargin(
    data: VentureData,
    monthIndex: number,
    computedTasks: ComputedTask[],
    totalRevenue: number,
    taskMultipliers: Record<string, number> = {},
    fixedCostMultipliers: Record<string, number> = {},
    distributionSelection: DistributionSelection = "mode"
): FormulaResult {
    const costsFormula = calculateTotalCosts(data, monthIndex, computedTasks, taskMultipliers, fixedCostMultipliers, distributionSelection);

    const components: FormulaComponent[] = [
        {
            label: "Total revenue",
            value: totalRevenue,
        },
        {
            label: "Total costs",
            value: -costsFormula.total,
            subComponents: costsFormula.components,
        },
    ];

    return {
        total: totalRevenue - costsFormula.total,
        components,
    };
}
