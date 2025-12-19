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
        initialReserve: 0,
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
            },
            adoptionModel: {
                initialUnits: 0,
                acquisitionRate: { type: "triangular", min: 50, mode: 100, max: 150 },
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
            },
            adoptionModel: {
                initialUnits: 0,
                acquisitionRate: { type: "triangular", min: 10, mode: 20, max: 30 },
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
            owner: "Marketing Team",
        },
        {
            id: "A2",
            description: "EU regulatory compliance adds 6-month delay to enterprise rollout",
            owner: "Legal Team",
        },
    ],
    risks: [
        {
            id: "R1",
            description: "Partner Channel Delay",
            owner: "BD Team",
            likelihood: 30,
            impact: "medium",
        },
        {
            id: "R2",
            description: "Lower than expected conversion rate",
            owner: "Sales Team",
            likelihood: 40,
            impact: "medium",
        },
    ],
};

export function loadData(): VentureData {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT;
        const parsed = JSON.parse(raw);
        if (!parsed?.meta?.start || !Array.isArray(parsed?.tasks)) return DEFAULT;

        // Ensure initialReserve exists for backwards compatibility
        if (parsed.meta && typeof parsed.meta.initialReserve !== 'number') {
            parsed.meta.initialReserve = 0;
        }

        // Ensure assumptions and risks arrays exist
        if (!Array.isArray(parsed.assumptions)) {
            parsed.assumptions = [];
        }
        if (!Array.isArray(parsed.risks)) {
            parsed.risks = [];
        }

        return parsed;
    } catch {
        return DEFAULT;
    }
}

export function saveData(data: VentureData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
}

// ============================================================================
// Saved Models Management
// ============================================================================

const SAVED_MODELS_KEY = "venture-planner:saved-models";

export type RiskSettings = {
    multipliers: {
        tasks: Record<string, number>;
        fixedCosts: Record<string, number>;
        revenueStreams: Record<string, number>;
    };
    distributionSelection: "min" | "mode" | "max";
    streamDistributions: Record<string, "min" | "mode" | "max">;
};

export type SavedModel = {
    id: string;
    name: string;
    data: VentureData;
    riskSettings?: RiskSettings; // Optional for backward compatibility
    savedAt: string; // ISO timestamp
};

export function getSavedModels(): SavedModel[] {
    try {
        const raw = localStorage.getItem(SAVED_MODELS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed;
    } catch {
        return [];
    }
}

export function saveModel(name: string, data: VentureData, riskSettings?: RiskSettings): SavedModel {
    const models = getSavedModels();
    const newModel: SavedModel = {
        id: `model_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        name,
        data,
        riskSettings,
        savedAt: new Date().toISOString(),
    };
    models.push(newModel);
    localStorage.setItem(SAVED_MODELS_KEY, JSON.stringify(models, null, 2));
    return newModel;
}

export function deleteModel(id: string): void {
    const models = getSavedModels();
    const filtered = models.filter(m => m.id !== id);
    localStorage.setItem(SAVED_MODELS_KEY, JSON.stringify(filtered, null, 2));
}

export function loadModel(id: string): SavedModel | null {
    const models = getSavedModels();
    const model = models.find(m => m.id === id);
    return model ?? null;
}
