import { useState } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Distribution } from "../types";

type DistributionInputProps = {
    value: Distribution | number | undefined;
    onChange: (value: Distribution) => void;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
};

/**
 * Distribution input component with progressive disclosure.
 *
 * Simple mode: Single value input (creates triangular distribution with min=mode=max)
 * Advanced mode: Min, Most Likely, Max inputs (triangular distribution)
 */
export function DistributionInput({
    value,
    onChange,
    label,
    placeholder = "Enter value",
    disabled = false,
    className = "",
}: DistributionInputProps) {
    // Normalize value to Distribution
    const dist: Distribution = typeof value === "number" || value === undefined
        ? { type: "triangular", min: value ?? 0, mode: value ?? 0, max: value ?? 0 }
        : value;

    // Determine if we're in simple mode (all values equal) or advanced mode
    const isSimpleMode = dist.min === dist.mode && dist.mode === dist.max;
    const [showAdvanced, setShowAdvanced] = useState(!isSimpleMode);

    const handleSimpleChange = (val: string) => {
        const num = parseFloat(val) || 0;
        onChange({
            type: "triangular",
            min: num,
            mode: num,
            max: num,
        });
    };

    const handleAdvancedChange = (field: "min" | "mode" | "max", val: string) => {
        const num = parseFloat(val) || 0;
        onChange({
            ...dist,
            [field]: num,
        });
    };

    return (
        <div className={`space-y-2 ${className}`}>
            {label && <Label>{label}</Label>}

            {!showAdvanced ? (
                // Simple mode: single input
                <div className="flex items-center gap-2">
                    <Input
                        type="number"
                        value={dist.mode ?? dist.min}
                        onChange={(e) => handleSimpleChange(e.target.value)}
                        placeholder={placeholder}
                        disabled={disabled}
                        className="h-9"
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAdvanced(true)}
                        disabled={disabled}
                        className="text-xs text-muted-foreground hover:text-foreground"
                    >
                        <ChevronRight className="h-4 w-4 mr-1" />
                        Range
                    </Button>
                </div>
            ) : (
                // Advanced mode: min/mode/max inputs
                <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">
                            Uncertainty Range
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                // Collapse to simple mode, using mode value
                                const val = dist.mode ?? dist.min;
                                onChange({
                                    type: "triangular",
                                    min: val,
                                    mode: val,
                                    max: val,
                                });
                                setShowAdvanced(false);
                            }}
                            disabled={disabled}
                            className="h-6 text-xs text-muted-foreground hover:text-foreground"
                        >
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Collapse
                        </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <Label className="text-xs text-muted-foreground">Min</Label>
                            <Input
                                type="number"
                                value={dist.min}
                                onChange={(e) => handleAdvancedChange("min", e.target.value)}
                                disabled={disabled}
                                className="h-8 mt-1"
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Most Likely</Label>
                            <Input
                                type="number"
                                value={dist.mode ?? dist.min}
                                onChange={(e) => handleAdvancedChange("mode", e.target.value)}
                                disabled={disabled}
                                className="h-8 mt-1"
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Max</Label>
                            <Input
                                type="number"
                                value={dist.max}
                                onChange={(e) => handleAdvancedChange("max", e.target.value)}
                                disabled={disabled}
                                className="h-8 mt-1"
                            />
                        </div>
                    </div>

                    {/* Validation warning */}
                    {(dist.min > (dist.mode ?? dist.min) || (dist.mode ?? dist.min) > dist.max) && (
                        <div className="text-xs text-red-600 mt-1">
                            Must satisfy: Min ≤ Most Likely ≤ Max
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Helper function to get the expected value of a distribution
 * For triangular: (min + mode + max) / 3
 */
export function getDistributionExpectedValue(dist: Distribution | number | undefined): number {
    if (typeof dist === "number") return dist;
    if (!dist) return 0;

    const mode = dist.mode ?? (dist.min + dist.max) / 2;
    return (dist.min + mode + dist.max) / 3;
}

/**
 * Helper function to create a simple distribution from a single value
 */
export function createSimpleDistribution(value: number): Distribution {
    return {
        type: "triangular",
        min: value,
        mode: value,
        max: value,
    };
}
