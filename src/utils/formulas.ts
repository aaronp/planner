import type { VentureData, ComputedTask } from "../types";
import {
    streamAcquisitionCostsAtMonth,
    taskCostAtMonth,
    fixedCostsAtMonth,
} from "./logic";
import { segmentActiveUnitsAtMonth } from "./modelEngine";
import { addMonths, isWithin } from "./dateUtils";

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
    computedTasks: ComputedTask[]
): FormulaResult {
    const components: FormulaComponent[] = [];

    // Revenue stream acquisition costs
    if (data.revenueStreams && data.revenueStreams.length > 0) {
        const streamComponents: FormulaComponent[] = [];
        let streamTotal = 0;

        for (const stream of data.revenueStreams) {
            const costs = streamAcquisitionCostsAtMonth(stream, monthIndex, data.timeline);
            if (costs.total > 0) {
                streamComponents.push({
                    label: `${stream.name} acquisition`,
                    value: costs.total,
                    subComponents: [
                        { label: "CAC", value: costs.cac },
                        { label: "Onboarding", value: costs.onboarding },
                    ],
                });
                streamTotal += costs.total;
            }
        }

        if (streamTotal > 0) {
            components.push({
                label: "Acquisition costs",
                value: streamTotal,
                subComponents: streamComponents,
            });
        }
    }

    // Task costs
    const taskComponents: FormulaComponent[] = [];
    let taskTotal = 0;

    for (const task of computedTasks) {
        const { oneOff, monthly, total } = taskCostAtMonth(task, monthIndex, data.meta.start);
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
        data.meta.start
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

    // Opex costs
    if (data.opex && data.opex.length > 0) {
        const monthISO = addMonths(data.meta.start, monthIndex);
        const opexComponents: FormulaComponent[] = [];
        let opexTotal = 0;

        for (const opex of data.opex) {
            if (isWithin(monthISO, opex.start, opex.end)) {
                opexComponents.push({
                    label: opex.category || "Opex",
                    value: opex.monthly,
                });
                opexTotal += opex.monthly;
            }
        }

        if (opexTotal > 0) {
            components.push({
                label: "Opex",
                value: opexTotal,
                subComponents: opexComponents,
            });
        }
    }

    // Segment-based CAC (legacy revenue model)
    if (data.segments && data.segments.length > 0) {
        const segmentComponents: FormulaComponent[] = [];
        let segmentCacTotal = 0;

        for (const seg of data.segments) {
            const units = segmentActiveUnitsAtMonth(seg, data.meta.start, monthIndex);
            const unitsLastMonth = monthIndex > 0 ? segmentActiveUnitsAtMonth(seg, data.meta.start, monthIndex - 1) : 0;
            const newUnits = Math.max(0, units - unitsLastMonth);
            const cac = newUnits * seg.cacPerUnit;

            if (cac > 0) {
                segmentComponents.push({
                    label: `${seg.name} CAC`,
                    value: cac,
                    subComponents: [
                        { label: "New units", value: newUnits },
                        { label: "CAC per unit", value: seg.cacPerUnit },
                    ],
                });
                segmentCacTotal += cac;
            }
        }

        if (segmentCacTotal > 0) {
            components.push({
                label: "Segment CAC (legacy)",
                value: segmentCacTotal,
                subComponents: segmentComponents,
            });
        }
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
    totalRevenue: number
): FormulaResult {
    const costsFormula = calculateTotalCosts(data, monthIndex, computedTasks);

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
