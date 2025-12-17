/**
 * Type definitions for Venture Proposal Planner
 */

export type ISODate = string; // YYYY-MM-DD

export type Task = {
    id: string;
    name: string;
    phase: "Inception" | "Build" | "Deploy" | "GoToMarket" | "Other";
    start?: ISODate; // Manual start (only if no dependencies), otherwise calculated
    duration?: string; // e.g., "2w", "3m", "1y" - empty means ongoing task
    costOneOff: number;
    costMonthly: number;
    dependsOn: string[]; // Format: ["T1", "T1e+2w", "T2s+3d"] - ID + optional (s|e) + optional +duration
};

export type ComputedTask = Task & {
    computedStart: ISODate; // Calculated start based on dependencies or manual start
    computedEnd?: ISODate; // Calculated from computedStart + duration (undefined if ongoing)
};

export type Segment = {
    id: string;
    name: string;
    entry: ISODate;
    exit?: ISODate;
    tam: number;
    samPct: number; // 0..1
    somPct: number; // 0..1
    pricePerUnit: number; // £ per unit per month
    cacPerUnit: number; // £ per unit (one-off)
    rampMonths: number;
    notes?: string;
};

export type Opex = {
    id: string;
    category: string;
    start: ISODate;
    end?: ISODate;
    monthly: number;
};

export type VentureData = {
    meta: {
        name: string;
        currency: string;
        start: ISODate;
        horizonMonths: number;
    };
    tasks: Task[];
    segments: Segment[];
    opex: Opex[];
};

export type YearAgg = {
    year: number;
    revenue: number;
    costs: number;
    ebitda: number;
};

export type Col<T> = {
    key: keyof T;
    header: string;
    width?: string;
    input?: "text" | "number" | "date";
    parse?: (v: string) => any;
    render?: (v: any, row: T) => React.ReactNode;
};
