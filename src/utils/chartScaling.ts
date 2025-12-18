/**
 * Calculate width percentages for bar chart values relative to a maximum value
 * @param revenueValues - Array of revenue values for a month
 * @param costValues - Array of cost values for a month
 * @param maxValue - The maximum value across all months (unified max)
 * @returns Tuple of [revenuePercentages, costPercentages]
 */
export function calcWidth(
    revenueValues: number[],
    costValues: number[],
    maxValue: number
): [number[], number[]] {
    if (maxValue <= 0) {
        return [revenueValues.map(() => 0), costValues.map(() => 0)];
    }

    const revenuePercentages = revenueValues.map((value) => (value / maxValue) * 100);
    const costPercentages = costValues.map((value) => (value / maxValue) * 100);

    return [revenuePercentages, costPercentages];
}

/**
 * Calculate bar height percentage for a single value
 * @param value - The value to scale
 * @param maxValue - The maximum value across all bars (unified max)
 * @returns Percentage (0-100+)
 */
export function calcBarHeight(value: number, maxValue: number): number {
    if (maxValue <= 0) return 0;
    return (value / maxValue) * 100;
}
