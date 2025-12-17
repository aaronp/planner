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

export type UnitEconomics = {
    pricePerUnit: Distribution;
    grossMargin: Distribution; // %
    billingFrequency: "monthly" | "annual";
    contractLengthMonths?: Distribution;
    churnRate?: Distribution; // % monthly churn
};

export type AdoptionModel = {
    initialUnits: number;
    acquisitionRate: Distribution; // units per month
    maxUnits?: number; // SOM cap
    churnRate?: Distribution; // % monthly churn
    expansionRate?: Distribution; // % monthly expansion
};

export type StreamCosts = {
    cacPerUnit: Distribution; // Customer Acquisition Cost per unit
    onboardingCost?: Distribution; // One-time onboarding cost per unit
    variableCostPerUnit?: Distribution; // Variable delivery cost per unit per month
};

export type RevenueStream = {
    id: string;
    name: string;
    marketId: string; // Links to Market
    pricingModel: PricingModel;
    revenueUnit: string; // e.g., "subscriber", "transaction", "license"
    unlockEventId?: string; // Timeline event that unlocks this stream
    unitEconomics: UnitEconomics;
    adoptionModel: AdoptionModel;
    streamCosts: StreamCosts;
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
    confidence: "low" | "medium" | "high";
    affects: string[]; // ids of streams, markets, timeline events
    notes?: string;
};

export type RiskImpact = {
    targetId: string;
    type: "delay" | "scale" | "increase" | "decrease";
    magnitude: Distribution;
};

export type Risk = {
    id: string;
    name: string;
    probability: number; // 0-1
    impact: RiskImpact[];
};

// ============================================================================
// Legacy Types (for backward compatibility during migration)
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
    };
    tasks: Task[];
    segments: Segment[]; // Legacy - will migrate to revenueStreams
    opex: Opex[];
    // New fields for spec compliance
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
