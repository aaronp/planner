import type { VentureData } from "../types";
import { todayISO, addMonths } from "./dateUtils";

const STORAGE_KEY = "venture-planner:v1";

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
    segments: [
        {
            id: "M1",
            name: "Market Segment 1 (UK SMEs)",
            entry: addMonths(todayISO(), 7),
            tam: 500000,
            samPct: 0.2,
            somPct: 0.05,
            pricePerUnit: 40,
            cacPerUnit: 25,
            rampMonths: 12,
            notes: "Early adoption via partner channels",
        },
        {
            id: "M2",
            name: "Market Segment 2 (EU Enterprise)",
            entry: addMonths(todayISO(), 14),
            tam: 200000,
            samPct: 0.15,
            somPct: 0.03,
            pricePerUnit: 120,
            cacPerUnit: 80,
            rampMonths: 18,
            notes: "Staggered rollout; higher CAC",
        },
    ],
    opex: [
        {
            id: "O1",
            category: "Core Team",
            start: todayISO(),
            monthly: 60000,
        },
    ],
};

export function loadData(): VentureData {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT;
        const parsed = JSON.parse(raw);
        if (!parsed?.meta?.start || !Array.isArray(parsed?.tasks) || !Array.isArray(parsed?.segments)) return DEFAULT;
        return parsed;
    } catch {
        return DEFAULT;
    }
}

export function saveData(data: VentureData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
}
