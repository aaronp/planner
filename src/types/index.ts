/**
 * Type definitions for Venture Proposal Planner
 */

export type ISODate = string; // YYYY-MM-DD

// ============================================================================
// Distribution - Uncertainty Primitive for Monte Carlo Simulation
// ============================================================================

export type Distribution = {
    type: "triangular" | "normal" | "lognormal";
    min: number;
    mode?: number; // Most likely value (for triangular)
    max: number;
};

// ============================================================================
// Timeline
// ============================================================================

export type TimelineEvent = {
    id: string;
    name: string;
    month: number; // Month 0 = plan start
    description?: string;
};

// ============================================================================
// Market (Units-First)
// ============================================================================

export type Market = {
    id: string;
    name: string;
    customerType: string;
    geography: string[];
    tamUnits: number; // Total Addressable Market in units
    samUnits: number; // Serviceable Addressable Market in units
    constraints?: string;
};

// ============================================================================
// Revenue Stream (Core Entity)
// ============================================================================

export type PricingModel = "subscription" | "usage" | "transaction" | "license" | "hybrid";

export type DeliveryCostModel =
    | { type: "grossMargin"; marginPct: Distribution }
    | { type: "perUnitCost"; costPerUnit: Distribution };

export type UnitEconomics = {
    pricePerUnit: Distribution;
    deliveryCostModel: DeliveryCostModel;
    billingFrequency: "monthly" | "annual";
    contractLengthMonths?: Distribution; // For annual billing, contract duration
};

export type AdoptionModel = {
    initialUnits: number;
    acquisitionRate: Distribution; // units per month
    churnRate?: Distribution; // % monthly churn
    expansionRate?: Distribution; // % monthly expansion
};

export type AcquisitionCosts = {
    cacPerUnit: Distribution; // Sales & marketing cost to acquire one new unit (not included in gross margin)
    onboardingCostPerUnit?: Distribution; // One-off implementation / setup cost incurred after acquisition
};

export type MarketSizing = {
    tam?: Distribution; // Total Addressable Market in units
    sam?: Distribution; // Serviceable Addressable Market in units
    som?: Distribution; // Serviceable Obtainable Market in units
};

export type RevenueStream = {
    id: string;
    name: string;
    marketId?: string; // Optional - for backward compatibility
    pricingModel: PricingModel;
    revenueUnit: string; // e.g., "subscriber", "transaction", "license"
    unlockEventId?: string; // Timeline event that unlocks this stream
    duration?: string; // e.g., "12m", "24m" - empty/undefined means infinite (runs to horizon)
    marketSizing?: MarketSizing; // TAM/SAM/SOM for this stream
    unitEconomics: UnitEconomics;
    adoptionModel: AdoptionModel;
    acquisitionCosts: AcquisitionCosts;
    assumptions?: Assumption[];
    risks?: Risk[];
};

// ============================================================================
// Costs
// ============================================================================

export type FixedCost = {
    id: string;
    name: string;
    monthlyCost: Distribution;
    startEventId?: string; // Timeline event
};

export type CostModel = {
    fixedMonthlyCosts: FixedCost[];
};

// ============================================================================
// Assumptions & Risks
// ============================================================================

export type Assumption = {
    id: string;
    description: string;
    owner?: string;
    confidence?: "low" | "medium" | "high"; // Legacy
    affects?: string[]; // Legacy - ids of streams, markets, timeline events
    notes?: string; // Legacy
};

export type RiskImpact = {
    targetId: string;
    type: "delay" | "scale" | "increase" | "decrease";
    magnitude: Distribution;
};

export type Risk = {
    id: string;
    description: string;
    owner?: string;
    likelihood?: number; // 0-100 percentage
    impact?: "minor" | "medium" | "severe";
    // Legacy fields
    name?: string;
    probability?: number; // 0-1
    impactDetails?: RiskImpact[];
};

// ============================================================================
// Tasks (Project Management)
// ============================================================================

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

// ============================================================================
// Root Business Plan Object
// ============================================================================

export type BusinessPlan = {
    meta: {
        name: string;
        currency: string;
        start: ISODate;
        horizonMonths: number;
    };
    timeline: TimelineEvent[];
    markets: Market[];
    revenueStreams: RevenueStream[];
    costModel: CostModel;
    assumptions: Assumption[];
    risks: Risk[];
};

export type VentureData = {
    meta: {
        name: string;
        currency: string;
        start: ISODate;
        horizonMonths: number;
        initialReserve: number;
    };
    tasks: Task[];
    timeline?: TimelineEvent[];
    markets?: Market[];
    revenueStreams?: RevenueStream[];
    costModel?: CostModel;
    assumptions?: Assumption[];
    risks?: Risk[];
};

// ============================================================================
// UI & Utility Types
// ============================================================================

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
