import type { Distribution } from "../types";
import type { DistributionSelection } from "../contexts/RiskContext";

/**
 * Extract a value from a distribution based on selection (min/mode/max)
 */
export function getDistributionValue(
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

    // For simple distributions, return the single value
    return 0;
}

/**
 * Get the mode value from a distribution (backward compatible with existing code)
 */
export function getDistributionMode(dist: Distribution | undefined): number {
    return getDistributionValue(dist, "mode");
}
