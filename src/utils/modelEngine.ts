import type { VentureData, Segment, ISODate, YearAgg, Task, ComputedTask } from "../types";
import type { DistributionSelection } from "../contexts/RiskContext";
import { monthIndexFromStart, addMonths, isWithin, todayISO } from "./dateUtils";
import { clamp01, round2 } from "./formatUtils";
import { parseDependency, addDuration } from "./taskUtils";
import { streamRevenueAtMonth, streamAcquisitionCostsAtMonth } from "./logic";

/**
 * Compute task start and end dates based on dependencies and durations
 * @param tasks - Array of tasks
 * @param fallbackStart - Fallback start date for tasks without dependencies or manual start
 * @returns Array of computed tasks with calculated start/end dates
 */
export function computeTaskDates(tasks: Task[], fallbackStart: ISODate): ComputedTask[] {
    const taskMap = new Map<string, ComputedTask>();
    const computed = new Set<string>();
    const computing = new Set<string>(); // For circular dependency detection

    // Helper to compute a single task
    const computeTask = (task: Task): ComputedTask => {
        // Already computed
        if (computed.has(task.id)) {
            return taskMap.get(task.id)!;
        }

        // Circular dependency detection
        if (computing.has(task.id)) {
            console.warn(`Circular dependency detected for task ${task.id}. Using fallback start date.`);
            const computedTask: ComputedTask = {
                ...task,
                computedStart: task.start || fallbackStart,
                computedEnd: task.duration ? addDuration(task.start || fallbackStart, task.duration) : undefined,
            };
            taskMap.set(task.id, computedTask);
            computed.add(task.id);
            return computedTask;
        }

        computing.add(task.id);

        let computedStart: ISODate;

        // If task has dependencies, compute start based on dependencies
        if (task.dependsOn && task.dependsOn.length > 0) {
            let latestDate: ISODate | null = null;

            for (const depStr of task.dependsOn) {
                const dep = parseDependency(depStr);

                // Skip invalid dependency strings
                if (!dep) {
                    continue;
                }

                const depTask = tasks.find((t) => t.id === dep.taskId);

                if (!depTask) {
                    continue;
                }

                // Recursively compute the dependency task
                const computedDepTask = computeTask(depTask);

                // Get the anchor date (start or end of dependency)
                let anchorDate: ISODate;
                if (dep.anchor === "start") {
                    anchorDate = computedDepTask.computedStart;
                } else {
                    // anchor === "end"
                    anchorDate = computedDepTask.computedEnd || computedDepTask.computedStart;
                }

                // Apply offset if specified
                let finalDate = anchorDate;
                if (dep.offset && dep.operator) {
                    const subtract = dep.operator === "-";
                    const offsetResult = addDuration(anchorDate, dep.offset, subtract);
                    // If offset is invalid, skip it
                    if (offsetResult) {
                        finalDate = offsetResult;
                    }
                }

                // Track the latest date among all dependencies
                if (!latestDate || new Date(finalDate) > new Date(latestDate)) {
                    latestDate = finalDate;
                }
            }

            computedStart = latestDate || task.start || fallbackStart;
        } else {
            // No dependencies, use manual start or fallback
            computedStart = task.start || fallbackStart;
        }

        // Compute end date from duration
        const computedEnd = task.duration ? addDuration(computedStart, task.duration) : undefined;

        const computedTask: ComputedTask = {
            ...task,
            computedStart,
            computedEnd,
        };

        taskMap.set(task.id, computedTask);
        computed.add(task.id);
        computing.delete(task.id);

        return computedTask;
    };

    // Compute all tasks
    return tasks.map(computeTask);
}

export function computeSeries(
    data: VentureData,
    taskMultipliers: Record<string, number> = {},
    fixedCostMultipliers: Record<string, number> = {},
    revenueStreamMultipliers: Record<string, number> = {},
    streamDistributions: Record<string, DistributionSelection> = {}
) {
    const { start, horizonMonths } = data.meta;
    const months = Array.from({ length: Math.max(1, horizonMonths) }, (_, i) => i);

    // Compute task dates with dependencies
    const computedTasks = computeTaskDates(data.tasks, start);

    const taskMonthlyCost = (m: number) => {
        const monthStartISO = addMonths(start, m);
        return computedTasks.reduce((sum, t) => {
            if (isWithin(monthStartISO, t.computedStart, t.computedEnd)) {
                const multiplier = taskMultipliers[t.id] ?? 1;
                return sum + t.costMonthly * multiplier;
            }
            return sum;
        }, 0);
    };

    const taskOneOffCost = (m: number) =>
        computedTasks.reduce((sum, t) => {
            if (monthIndexFromStart(start, t.computedStart) === m) {
                const multiplier = taskMultipliers[t.id] ?? 1;
                return sum + t.costOneOff * multiplier;
            }
            return sum;
        }, 0);

    const fixedCostsMonthly = (m: number) => {
        if (!data.costModel?.fixedMonthlyCosts) return 0;
        const monthStartISO = addMonths(start, m);

        return data.costModel.fixedMonthlyCosts.reduce((sum, fc) => {
            // If no start event, include from beginning
            if (!fc.startEventId) {
                const costValue = typeof fc.monthlyCost === 'number' ? fc.monthlyCost : (fc.monthlyCost?.mode ?? fc.monthlyCost?.min ?? 0);
                const multiplier = fixedCostMultipliers[fc.id] ?? 1;
                return sum + costValue * multiplier;
            }

            // Find the task this fixed cost starts with
            const startTask = computedTasks.find(t => t.id === fc.startEventId);
            if (!startTask) return sum;

            // Check if we're at or after the start task's start month
            const startTaskMonthIndex = monthIndexFromStart(start, startTask.computedStart);
            if (m >= startTaskMonthIndex) {
                const costValue = typeof fc.monthlyCost === 'number' ? fc.monthlyCost : (fc.monthlyCost?.mode ?? fc.monthlyCost?.min ?? 0);
                const multiplier = fixedCostMultipliers[fc.id] ?? 1;
                return sum + costValue * multiplier;
            }

            return sum;
        }, 0);
    };

    const rows = months.map((m) => {
        const label = formatMonthLabel(start, m);

        let revenue = 0;

        // Revenue streams net revenue (revenue minus acquisition costs per stream)
        // This matches what's shown in individual stream margin columns
        if (data.revenueStreams) {
            for (const stream of data.revenueStreams) {
                const multiplier = revenueStreamMultipliers[stream.id] ?? 1;
                const streamRevenue = streamRevenueAtMonth(stream, m, data.timeline, multiplier, streamDistributions);
                const acquisitionCosts = streamAcquisitionCostsAtMonth(stream, m, data.timeline, multiplier, streamDistributions);
                revenue += (streamRevenue - acquisitionCosts.total);
            }
        }

        const costs = taskMonthlyCost(m) + taskOneOffCost(m) + fixedCostsMonthly(m);

        return {
            m,
            label,
            revenue: round2(revenue),
            costs: round2(costs),
            profit: round2(revenue - costs),
            burn: round2(Math.max(0, costs - revenue)),
            taskMonthly: round2(taskMonthlyCost(m)),
            taskOneOff: round2(taskOneOffCost(m)),
        };
    });

    let cash = data.meta.initialReserve || 0;
    let cumRevenue = 0;
    let cumCosts = 0;
    return rows.map((r) => {
        cash += r.profit;
        cumRevenue += r.revenue;
        cumCosts += r.costs;
        return {
            ...r,
            cash: round2(cash),
            cumRevenue: round2(cumRevenue),
            cumCosts: round2(cumCosts),
        };
    });
}

function formatMonthLabel(startISO: ISODate, offsetMonths: number): string {
    const d = new Date(startISO + "T00:00:00Z");
    const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
    return nd.toLocaleString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function firstIndexWhere<T>(arr: T[], pred: (x: T) => boolean): number | undefined {
    for (let i = 0; i < arr.length; i++) if (pred(arr[i]!)) return i;
    return undefined;
}

export function aggregateByCalendarYear(series: ReturnType<typeof computeSeries>, ventureStart: ISODate): YearAgg[] {
    const start = new Date(ventureStart + "T00:00:00Z");
    const byYear = new Map<number, YearAgg>();

    for (const row of series) {
        const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + row.m, 1));
        const y = d.getUTCFullYear();
        const existing = byYear.get(y) ?? { year: y, revenue: 0, costs: 0, ebitda: 0 };
        existing.revenue += row.revenue;
        existing.costs += row.costs;
        existing.ebitda += row.profit;
        byYear.set(y, existing);
    }

    return Array.from(byYear.values())
        .sort((a, b) => a.year - b.year)
        .map((x) => ({
            ...x,
            revenue: round2(x.revenue),
            costs: round2(x.costs),
            ebitda: round2(x.ebitda),
        }));
}

export function buildSankeyForMonth(data: VentureData, month: number) {
    const series = computeSeries(data);
    const snap = series[Math.min(series.length - 1, Math.max(0, month))] ?? series[0];

    const revBySeg = data.segments.map((s) => {
        const units = (snap.unitsBySeg?.[s.id] ?? 0) as number;
        return { name: s.name, value: round2(units * s.pricePerUnit) };
    });
    const totalRev = revBySeg.reduce((a, b) => a + b.value, 0);

    const costs = [
        { name: "Tasks (monthly)", value: Math.max(0, snap.taskMonthly ?? 0) },
        { name: "Tasks (one-off)", value: Math.max(0, snap.taskOneOff ?? 0) },
        { name: "Opex", value: Math.max(0, snap.opex ?? 0) },
        { name: "CAC", value: Math.max(0, snap.cac ?? 0) },
    ];

    const nodes = [
        ...costs.map((c) => ({ name: c.name })),
        ...revBySeg.map((s) => ({ name: s.name })),
        ...(totalRev === 0 ? [{ name: "No revenue" }] : []),
    ];

    const links: { source: number; target: number; value: number }[] = [];
    const idxNoRev = costs.length + revBySeg.length;

    costs.forEach((c, i) => {
        if (c.value <= 0) return;

        if (totalRev <= 0) {
            links.push({ source: i, target: idxNoRev, value: round2(c.value) });
            return;
        }

        revBySeg.forEach((s, j) => {
            if (s.value <= 0) return;
            const share = s.value / totalRev;
            const v = round2(c.value * share);
            if (v > 0) links.push({ source: i, target: costs.length + j, value: v });
        });
    });

    return {
        nodes,
        links,
        totals: {
            totalRev: round2(totalRev),
            totalCosts: round2(snap.costs ?? 0),
        },
    };
}
