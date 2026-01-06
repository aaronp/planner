import { createContext, useContext, useState, ReactNode } from "react";

export type RiskMultipliers = {
    tasks: Record<string, number>; // taskId -> multiplier
    fixedCosts: Record<string, number>; // fixedCostId -> multiplier
    revenueStreams: Record<string, number>; // streamId -> multiplier
};

export type DistributionSelection = "min" | "mode" | "max";

export type StreamDistributionSelections = {
    price: DistributionSelection;
    growth: DistributionSelection;
};

type RiskContextType = {
    multipliers: RiskMultipliers;
    setMultipliers: (multipliers: RiskMultipliers) => void;
    distributionSelection: DistributionSelection;
    setDistributionSelection: (selection: DistributionSelection) => void;
    streamDistributions: Record<string, StreamDistributionSelections>;
    setStreamDistributions: (distributions: Record<string, StreamDistributionSelections>) => void;
    getTaskMultiplier: (taskId: string) => number;
    getFixedCostMultiplier: (fixedCostId: string) => number;
    getRevenueStreamMultiplier: (streamId: string) => number;
    getStreamDistribution: (streamId: string, type: "price" | "growth") => DistributionSelection;
};

const RiskContext = createContext<RiskContextType | undefined>(undefined);

export function RiskProvider({ children }: { children: ReactNode }) {
    const [multipliers, setMultipliers] = useState<RiskMultipliers>({
        tasks: {},
        fixedCosts: {},
        revenueStreams: {},
    });

    const [distributionSelection, setDistributionSelection] = useState<DistributionSelection>("mode");
    const [streamDistributions, setStreamDistributions] = useState<Record<string, StreamDistributionSelections>>({});

    const getTaskMultiplier = (taskId: string) => multipliers.tasks[taskId] ?? 1;
    const getFixedCostMultiplier = (fixedCostId: string) => multipliers.fixedCosts[fixedCostId] ?? 1;
    const getRevenueStreamMultiplier = (streamId: string) => multipliers.revenueStreams[streamId] ?? 1;
    const getStreamDistribution = (streamId: string, type: "price" | "growth") =>
        streamDistributions[streamId]?.[type] ?? "mode";

    return (
        <RiskContext.Provider
            value={{
                multipliers,
                setMultipliers,
                distributionSelection,
                setDistributionSelection,
                streamDistributions,
                setStreamDistributions,
                getTaskMultiplier,
                getFixedCostMultiplier,
                getRevenueStreamMultiplier,
                getStreamDistribution,
            }}
        >
            {children}
        </RiskContext.Provider>
    );
}

export function useRisk() {
    const context = useContext(RiskContext);
    if (!context) {
        throw new Error("useRisk must be used within a RiskProvider");
    }
    return context;
}
