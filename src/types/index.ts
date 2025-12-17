/**
 * Type definitions for Venture Proposal Planner
 */

export type ISODate = string; // YYYY-MM-DD

export type Task = {
    id: string;
    name: string;
    phase: "Inception" | "Build" | "Deploy" | "GoToMarket" | "Other";
    start: ISODate;
    end: ISODate;
    costOneOff: number;
    costMonthly: number;
    dependsOn: string[];
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
