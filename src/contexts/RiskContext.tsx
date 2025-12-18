import { createContext, useContext, useState, ReactNode } from "react";

export type RiskMultipliers = {
    tasks: Record<string, number>; // taskId -> multiplier
    fixedCosts: Record<string, number>; // fixedCostId -> multiplier
    revenueStreams: Record<string, number>; // streamId -> multiplier
};

export type DistributionSelection = "min" | "mode" | "max";

type RiskContextType = {
    multipliers: RiskMultipliers;
    setMultipliers: (multipliers: RiskMultipliers) => void;
    distributionSelection: DistributionSelection;
    setDistributionSelection: (selection: DistributionSelection) => void;
    streamDistributions: Record<string, DistributionSelection>;
    setStreamDistributions: (distributions: Record<string, DistributionSelection>) => void;
    getTaskMultiplier: (taskId: string) => number;
    getFixedCostMultiplier: (fixedCostId: string) => number;
    getRevenueStreamMultiplier: (streamId: string) => number;
    getStreamDistribution: (streamId: string) => DistributionSelection;
};

const RiskContext = createContext<RiskContextType | undefined>(undefined);

export function RiskProvider({ children }: { children: ReactNode }) {
    const [multipliers, setMultipliers] = useState<RiskMultipliers>({
        tasks: {},
        fixedCosts: {},
        revenueStreams: {},
    });

    const [distributionSelection, setDistributionSelection] = useState<DistributionSelection>("mode");
    const [streamDistributions, setStreamDistributions] = useState<Record<string, DistributionSelection>>({});

    const getTaskMultiplier = (taskId: string) => multipliers.tasks[taskId] ?? 1;
    const getFixedCostMultiplier = (fixedCostId: string) => multipliers.fixedCosts[fixedCostId] ?? 1;
    const getRevenueStreamMultiplier = (streamId: string) => multipliers.revenueStreams[streamId] ?? 1;
    const getStreamDistribution = (streamId: string) => streamDistributions[streamId] ?? "mode";

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
