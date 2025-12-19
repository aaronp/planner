import type { ISODate, Task } from "../types";
import { addMonths } from "./dateUtils";

/**
 * Parse duration string (e.g., "2w", "3m", "1y", "5d") and add or subtract from a date
 * @param isoDate - Starting date in ISO format
 * @param duration - Duration string (e.g., "2w", "3m")
 * @param subtract - If true, subtract the duration instead of adding
 * @returns New date after adding/subtracting duration, or undefined if duration is invalid
 */
export function addDuration(isoDate: ISODate, duration: string, subtract = false): ISODate | undefined {
    // Empty duration is valid (means ongoing task)
    if (!duration) return undefined;

    const match = duration.match(/^(\d+)([dwmy])$/);
    if (!match) {
        // Invalid format - return undefined to indicate ongoing/no end date
        return undefined;
    }

    const value = parseInt(match[1]!, 10) * (subtract ? -1 : 1);
    const unit = match[2]!;

    const date = new Date(isoDate + "T00:00:00Z");

    switch (unit) {
        case "d": // days
            date.setUTCDate(date.getUTCDate() + value);
            break;
        case "w": // weeks
            date.setUTCDate(date.getUTCDate() + value * 7);
            break;
        case "m": // months
            return addMonths(isoDate, value);
        case "y": // years
            return addMonths(isoDate, value * 12);
        default:
            // Unknown unit - return undefined
            return undefined;
    }

    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Parse a dependency string (e.g., "T1", "T1e+2w", "T2s+3d", "T3-2m")
 * @param depStr - Dependency string
 * @returns Parsed dependency info, or null if invalid
 */
export function parseDependency(depStr: string): {
    taskId: string;
    anchor: "start" | "end"; // Default to "start" if not specified
    operator?: "+" | "-"; // Whether to add or subtract offset
    offset?: string; // Duration offset (e.g., "2w")
} | null {
    // Match patterns like: T1, T1s, T1e, T1+2w, T1e+2w, T1s+3d, T3-2m, T1e-1w
    // Task IDs are expected to be letters followed by numbers (e.g., T1, FC12, RS3)
    // This prevents the greedy match from consuming the 's' or 'e' anchor
    const match = depStr.match(/^([A-Z]+\d+)([se])?(?:([+-])(.+))?$/);

    if (!match) {
        return null;
    }

    const taskId = match[1]!;
    const anchorChar = match[2];
    const operator = match[3] as "+" | "-" | undefined;
    const offset = match[4];

    return {
        taskId,
        anchor: anchorChar === "e" ? "end" : "start", // Default to "start"
        operator,
        offset,
    };
}

/**
 * Validate a duration string
 * @param duration - Duration string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDuration(duration: string): boolean {
    if (!duration) return true; // Empty is valid (means ongoing)
    return /^\d+[dwmy]$/.test(duration);
}

/**
 * Validate a dependency string
 * @param dep - Dependency string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDependency(dep: string): boolean {
    try {
        const parsed = parseDependency(dep);
        if (!parsed) return false;
        // If there's an offset, validate it's a valid duration
        if (parsed.offset) {
            return isValidDuration(parsed.offset);
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Calculate the actual start date for a task based on its dependencies
 * @param task - The task to calculate start date for
 * @param allTasks - All tasks in the project (to look up dependencies)
 * @param computed - Cache of already computed start dates (for memoization)
 * @param computing - Set of task IDs currently being computed (for circular dependency detection)
 * @returns Calculated start date, or the task's own start date if no valid dependencies
 */
export function calculateTaskStartDate(
    task: Task,
    allTasks: Task[],
    computed: Map<string, ISODate> = new Map(),
    computing: Set<string> = new Set()
): ISODate {
    // Check cache first
    if (computed.has(task.id)) {
        return computed.get(task.id)!;
    }

    // Detect circular dependencies
    if (computing.has(task.id)) {
        console.warn(`Circular dependency detected for task ${task.id}. Using task's own start date.`);
        const fallbackStart = task.start || "";
        computed.set(task.id, fallbackStart);
        return fallbackStart;
    }

    // Mark as being computed
    computing.add(task.id);

    // If no dependencies, use the task's own start date
    if (!task.dependsOn || task.dependsOn.length === 0) {
        const startDate = task.start || "";
        computed.set(task.id, startDate);
        computing.delete(task.id);
        return startDate;
    }

    // Find the latest date from all dependencies
    let latestDate: ISODate | null = null;

    for (const depStr of task.dependsOn) {
        const parsed = parseDependency(depStr);
        if (!parsed) continue; // Skip invalid dependencies

        // Find the dependent task
        const depTask = allTasks.find((t) => t.id === parsed.taskId);
        if (!depTask) continue; // Skip if task not found

        // RECURSIVELY calculate the dependent task's start date
        const depStartDate = calculateTaskStartDate(depTask, allTasks, computed, computing);
        if (!depStartDate) continue;

        // Get the anchor date (start or end of dependent task)
        let anchorDate: ISODate = depStartDate;
        if (parsed.anchor === "end" && depTask.duration) {
            // Calculate end date based on the COMPUTED start date
            const endDate = addDuration(depStartDate, depTask.duration);
            if (endDate) anchorDate = endDate;
        }

        // Apply offset if specified
        let resultDate = anchorDate;
        if (parsed.offset && parsed.operator) {
            const offsetResult = addDuration(anchorDate, parsed.offset, parsed.operator === "-");
            if (offsetResult) resultDate = offsetResult;
        }

        // Track the latest date
        if (!latestDate || resultDate > latestDate) {
            latestDate = resultDate;
        }
    }

    // Return the latest date from dependencies, or fallback to task's own start date
    const finalDate = latestDate || task.start || "";
    computed.set(task.id, finalDate);
    computing.delete(task.id);
    return finalDate;
}
