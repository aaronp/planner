import type { VentureData, TimelineEvent, Market, RevenueStream } from "../types";
import { todayISO } from "./dateUtils";

const STORAGE_KEY = "venture-planner:v1";

function createSimpleDistribution(value: number) {
    return { type: "triangular" as const, min: value, mode: value, max: value };
}

export const DEFAULT: VentureData = {
    meta: {
        name: "New Venture",
        currency: "GBP",
        start: todayISO(),
        horizonMonths: 36,
    },
    tasks: [
        {
            id: "T1",
            name: "Licensing & Legal",
            phase: "Inception",
            start: todayISO(),
            duration: "3m",
            costOneOff: 35000,
            costMonthly: 0,
            dependsOn: [],
        },
        {
            id: "T2",
            name: "Build MVP",
            phase: "Build",
            duration: "5m",
            costOneOff: 0,
            costMonthly: 45000,
            dependsOn: ["T1"],
        },
        {
            id: "T3",
            name: "Deploy & Ops",
            phase: "Deploy",
            duration: "1m",
            costOneOff: 12000,
            costMonthly: 8000,
            dependsOn: ["T2"],
        },
    ],
    segments: [],
    opex: [],
    // New spec-compliant data structures
    timeline: [
        {
            id: "TL1",
            name: "MVP Launch",
            month: 6,
            description: "Initial product ready for market",
        },
        {
            id: "TL2",
            name: "Beta Testing Complete",
            month: 9,
            description: "First customers onboarded",
        },
        {
            id: "TL3",
            name: "Full Market Entry",
            month: 12,
            description: "Full scale operations",
        },
    ] as TimelineEvent[],
    markets: [
        {
            id: "MKT1",
            name: "UK SME Market",
            customerType: "SME",
            geography: ["UK"],
            tamUnits: 500000,
            samUnits: 100000,
            constraints: "Partner channel required for market access",
        },
        {
            id: "MKT2",
            name: "EU Enterprise Market",
            customerType: "Enterprise",
            geography: ["DE", "FR", "NL"],
            tamUnits: 200000,
            samUnits: 30000,
            constraints: "Regulatory compliance required per country",
        },
    ] as Market[],
    revenueStreams: [
        {
            id: "RS1",
            name: "SME Subscription",
            marketId: "MKT1",
            pricingModel: "subscription",
            revenueUnit: "subscriber",
            unlockEventId: "TL2",
            unitEconomics: {
                pricePerUnit: { type: "triangular", min: 35, mode: 40, max: 50 },
                deliveryCostModel: {
                    type: "grossMargin",
                    marginPct: createSimpleDistribution(75),
                },
                billingFrequency: "monthly",
                contractLengthMonths: createSimpleDistribution(12),
                churnRate: { type: "triangular", min: 3, mode: 5, max: 8 },
            },
            adoptionModel: {
                initialUnits: 0,
                acquisitionRate: { type: "triangular", min: 50, mode: 100, max: 150 },
                maxUnits: 5000,
                churnRate: { type: "triangular", min: 3, mode: 5, max: 8 },
                expansionRate: createSimpleDistribution(2),
            },
            acquisitionCosts: {
                cacPerUnit: { type: "triangular", min: 20, mode: 25, max: 35 },
                onboardingCostPerUnit: createSimpleDistribution(50),
            },
        },
        {
            id: "RS2",
            name: "Enterprise Licenses",
            marketId: "MKT2",
            pricingModel: "license",
            revenueUnit: "license",
            unlockEventId: "TL3",
            unitEconomics: {
                pricePerUnit: { type: "triangular", min: 100, mode: 120, max: 150 },
                deliveryCostModel: {
                    type: "grossMargin",
                    marginPct: createSimpleDistribution(80),
                },
                billingFrequency: "annual",
                contractLengthMonths: { type: "triangular", min: 12, mode: 24, max: 36 },
                churnRate: { type: "triangular", min: 2, mode: 3, max: 5 },
            },
            adoptionModel: {
                initialUnits: 0,
                acquisitionRate: { type: "triangular", min: 10, mode: 20, max: 30 },
                maxUnits: 900,
                churnRate: { type: "triangular", min: 2, mode: 3, max: 5 },
                expansionRate: createSimpleDistribution(5),
            },
            acquisitionCosts: {
                cacPerUnit: { type: "triangular", min: 70, mode: 80, max: 100 },
                onboardingCostPerUnit: createSimpleDistribution(200),
            },
        },
    ] as RevenueStream[],
    costModel: {
        fixedMonthlyCosts: [
            {
                id: "FC1",
                name: "Infrastructure & Hosting",
                monthlyCost: createSimpleDistribution(5000),
                startEventId: "TL1",
            },
            {
                id: "FC2",
                name: "Sales & Marketing",
                monthlyCost: { type: "triangular", min: 15000, mode: 20000, max: 25000 },
                startEventId: "TL2",
            },
        ],
    },
    assumptions: [
        {
            id: "A1",
            description: "Partner channels provide 30% cost reduction in CAC for SME segment",
            confidence: "medium",
            affects: ["RS1"],
            notes: "Based on similar ventures in market",
        },
        {
            id: "A2",
            description: "EU regulatory compliance adds 6-month delay to enterprise rollout",
            confidence: "high",
            affects: ["RS2", "MKT2"],
            notes: "Historical data from legal review",
        },
    ],
    risks: [
        {
            id: "R1",
            name: "Partner Channel Delay",
            probability: 0.3,
            impact: [
                {
                    targetId: "RS1",
                    type: "delay",
                    magnitude: { type: "triangular", min: 1, mode: 2, max: 4 },
                },
            ],
        },
        {
            id: "R2",
            name: "Lower than expected conversion rate",
            probability: 0.4,
            impact: [
                {
                    targetId: "RS1",
                    type: "scale",
                    magnitude: { type: "triangular", min: 0.6, mode: 0.75, max: 0.9 },
                },
            ],
        },
    ],
};

export function loadData(): VentureData {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT;
        const parsed = JSON.parse(raw);
        if (!parsed?.meta?.start || !Array.isArray(parsed?.tasks)) return DEFAULT;

        return parsed;
    } catch {
        return DEFAULT;
    }
}

export function saveData(data: VentureData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
}
