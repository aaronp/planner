/**
 * Simplified data model for the Wizard view
 */

export type WizardCostItem = {
    id: string;
    name: string;
    monthlyAmount: number;
    frequencyMonths: number; // How often this cost occurs (1 = monthly, 3 = quarterly, etc.)
    startMonth: number;
    durationMonths?: number; // undefined = infinite
    growthRate?: number; // Month-on-month growth rate percentage (e.g., 5 for 5% growth)
};

export type WizardRevenueItem = {
    id: string;
    name: string;
    monthlyAmount: number;
    frequencyMonths: number; // How often this revenue occurs (1 = monthly, 3 = quarterly, etc.)
    startMonth: number;
    durationMonths?: number; // undefined = infinite
    growthRate?: number; // Month-on-month growth rate percentage (e.g., 5 for 5% growth)
};

export type WizardData = {
    costs: WizardCostItem[];
    revenues: WizardRevenueItem[];
    initialInvestment: number;
    hurdleRate: number; // Minimum required rate of return (percentage)
    horizonMonths: number;
    currency: string;
};
