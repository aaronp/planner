import { calcWidth, calcBarHeight } from "./chartScaling";

/**
 * Simple test runner
 */
function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(error);
        process.exit(1);
    }
}

function assertEquals(actual: any, expected: any, message?: string) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        throw new Error(
            `${message || "Assertion failed"}\nExpected: ${expectedStr}\nActual: ${actualStr}`
        );
    }
}

function assertArraysClose(actual: number[], expected: number[], tolerance: number = 0.01) {
    if (actual.length !== expected.length) {
        throw new Error(`Array lengths don't match: ${actual.length} vs ${expected.length}`);
    }
    for (let i = 0; i < actual.length; i++) {
        const diff = Math.abs(actual[i]! - expected[i]!);
        if (diff > tolerance) {
            throw new Error(`Arrays differ at index ${i}: ${actual[i]} vs ${expected[i]} (diff: ${diff})`);
        }
    }
}

// Test suite
test("calcWidth returns zeros when maxValue is 0", () => {
    const [revPct, costPct] = calcWidth([100, 200], [50, 75], 0);
    assertEquals(revPct, [0, 0]);
    assertEquals(costPct, [0, 0]);
});

test("calcWidth returns zeros when maxValue is negative", () => {
    const [revPct, costPct] = calcWidth([100, 200], [50, 75], -100);
    assertEquals(revPct, [0, 0]);
    assertEquals(costPct, [0, 0]);
});

test("calcWidth returns 100% when value equals maxValue", () => {
    const [revPct, costPct] = calcWidth([26547], [10000], 26547);
    assertArraysClose(revPct, [100]);
    assertArraysClose(costPct, [37.66], 0.1);
});

test("calcWidth handles example from issue: Month 1 with smaller values", () => {
    // Month 1: Stream A: 18270, Stream B: 2448, Total: 20718
    // Max across all months: 26547
    const [revPct, costPct] = calcWidth([18270, 2448], [], 26547);

    // Stream A: 18270 / 26547 * 100 = 68.8%
    // Stream B: 2448 / 26547 * 100 = 9.2%
    assertArraysClose(revPct, [68.8, 9.2], 0.1);
    assertEquals(costPct, []);
});

test("calcWidth handles example from issue: Month 2 with larger values", () => {
    // Month 2: Stream A: 21602, Stream B: 4945, Total: 26547
    // Max across all months: 26547
    const [revPct, costPct] = calcWidth([21602, 4945], [], 26547);

    // Stream A: 21602 / 26547 * 100 = 81.4%
    // Stream B: 4945 / 26547 * 100 = 18.6%
    assertArraysClose(revPct, [81.4, 18.6], 0.1);
    assertEquals(costPct, []);
});

test("calcWidth handles revenue growing from Month 1 to Month 2", () => {
    const maxValue = 26547;

    // Month 1
    const [rev1Pct] = calcWidth([18270, 2448], [], maxValue);

    // Month 2
    const [rev2Pct] = calcWidth([21602, 4945], [], maxValue);

    // Stream A should grow
    if (rev2Pct[0]! <= rev1Pct[0]!) {
        throw new Error(`Stream A should grow from Month 1 to Month 2: ${rev1Pct[0]} -> ${rev2Pct[0]}`);
    }

    // Stream B should grow
    if (rev2Pct[1]! <= rev1Pct[1]!) {
        throw new Error(`Stream B should grow from Month 1 to Month 2: ${rev1Pct[1]} -> ${rev2Pct[1]}`);
    }
});

test("calcWidth handles mixed revenue and costs", () => {
    const [revPct, costPct] = calcWidth([15000, 10000], [5000, 3000], 20000);

    // Revenue: 15000/20000 = 75%, 10000/20000 = 50%
    assertArraysClose(revPct, [75, 50]);

    // Costs: 5000/20000 = 25%, 3000/20000 = 15%
    assertArraysClose(costPct, [25, 15]);
});

test("calcWidth handles empty arrays", () => {
    const [revPct, costPct] = calcWidth([], [], 1000);
    assertEquals(revPct, []);
    assertEquals(costPct, []);
});

test("calcWidth handles single values", () => {
    const [revPct, costPct] = calcWidth([500], [250], 1000);
    assertArraysClose(revPct, [50]);
    assertArraysClose(costPct, [25]);
});

test("calcWidth handles values larger than maxValue", () => {
    // This shouldn't happen in practice, but the function should handle it
    const [revPct, costPct] = calcWidth([1500], [800], 1000);
    assertArraysClose(revPct, [150]); // Over 100%
    assertArraysClose(costPct, [80]);
});

// Tests for calcBarHeight
test("calcBarHeight returns 0 when maxValue is 0", () => {
    assertEquals(calcBarHeight(100, 0), 0);
});

test("calcBarHeight returns 0 when maxValue is negative", () => {
    assertEquals(calcBarHeight(100, -50), 0);
});

test("calcBarHeight returns 100% when value equals maxValue", () => {
    assertArraysClose([calcBarHeight(26547, 26547)], [100]);
});

test("calcBarHeight handles example: Stream A Month 1", () => {
    // Stream A Month 1: 18270 / 26547 = 68.8%
    assertArraysClose([calcBarHeight(18270, 26547)], [68.8], 0.1);
});

test("calcBarHeight handles example: Stream A Month 2", () => {
    // Stream A Month 2: 21602 / 26547 = 81.4%
    assertArraysClose([calcBarHeight(21602, 26547)], [81.4], 0.1);
});

test("calcBarHeight returns 0 when value is 0", () => {
    assertEquals(calcBarHeight(0, 1000), 0);
});

test("calcBarHeight handles fractional percentages", () => {
    assertArraysClose([calcBarHeight(333, 1000)], [33.3], 0.1);
});

console.log("\nAll tests passed! ✓");
