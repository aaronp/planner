# Business Planner – Revenue, Risk & Simulation Specification

## 1. Purpose & Rationale

### Purpose

Upgrade the existing **Planner UI** so it can:

* Model **multiple independent revenue streams** instead of a flat market table
* Capture **uncertain inputs** (ranges, not point estimates)
* Explicitly track **assumptions, risks, and timelines**
* Support **Monte‑Carlo simulation** to answer:

  * When does this become profitable?
  * What is the ROI timeline?
  * What are the bear / base / bull outcomes?

### Rationale

Most planners fail because:

* Revenue streams are merged too early
* Assumptions are implicit and untestable
* Timelines and risks are disconnected from numbers

This design treats each **revenue stream as a mini‑business**, with explicit unit economics, adoption, costs, and uncertainty. The UI progressively exposes complexity while preserving a **clean internal data model** suitable for simulation.

---

## 2. High‑Level Delivery Plan

### Phase 1 – Canonical Data Model

* Define simulation‑ready domain models
* Separate **stored inputs** from **derived outputs**
* Ensure all numeric drivers support uncertainty

### Phase 2 – Planner UI Changes

* Replace existing **Market Segments table**
* Introduce **Revenue Streams** as first‑class entities
* Add sub‑tabs per revenue stream for structured input
* Add Timeline, Assumptions, and Risks tabs

### Phase 3 – Validation & Completeness

* Ensure every revenue stream is fully specified
* Prevent simulation when required inputs are missing

### Phase 4 – Summaries & Monte‑Carlo (future phase)

* Run simulations over stored distributions
* Produce P10 / P50 / P90 outputs
* Display profitability, ROI, and sensitivity

> This document fully specifies Phases 1–3. Phase 4 is intentionally deferred.

---

## 3. Information Architecture (UI Level)

### Existing State

* **Data tab** contains a simple "Market Segments" table

### Target State

**Data Tab**

* Markets
* Revenue Streams
* Costs
* Timeline
* Assumptions
* Risks

**Revenue Streams** replaces Market Segments as the primary modelling surface.

---

## 4. Canonical Data Model (Source of Truth)

### 4.1 Root Object

```ts
BusinessPlan {
  meta: Meta
  timeline: TimelineEvent[]
  markets: Market[]
  revenueStreams: RevenueStream[]
  costModel: CostModel
  assumptions: Assumption[]
  risks: Risk[]
}
```

---

### 4.2 Timeline

```ts
TimelineEvent {
  id: string
  name: string
  month: number        // Month 0 = plan start
  description?: string
}
```

Used to unlock:

* Revenue streams
* Costs
* Hiring or regulatory gates

---

### 4.3 Market (Units‑First)

```ts
Market {
  id: string
  name: string
  customerType: string
  geography: string[]
  tamUnits: number
  samUnits: number
  constraints?: string
}
```

Rules:

* No prices in markets
* Money lives in revenue streams

---

### 4.4 Revenue Stream (Core Entity)

```ts
RevenueStream {
  id: string
  name: string
  marketId: string

  pricingModel: 'subscription' | 'usage' | 'transaction' | 'license' | 'hybrid'
  revenueUnit: string

  unlockEventId?: string   // expected start date

  unitEconomics: UnitEconomics
  adoptionModel: AdoptionModel
  streamCosts: StreamCosts
}
```

Each revenue stream is independently simulatable.

---

### 4.5 Distributions (Uncertainty Primitive)

```ts
Distribution {
  type: 'triangular' | 'normal' | 'lognormal'
  min: number
  mode?: number
  max: number
}
```

Triangular is the default for user‑entered values.

---

### 4.6 Unit Economics

```ts
UnitEconomics {
  pricePerUnit: Distribution
  grossMargin: Distribution      // %
  billingFrequency: 'monthly' | 'annual'
  contractLengthMonths?: Distribution
  churnRate?: Distribution
}
```

---

### 4.7 Adoption Model

```ts
AdoptionModel {
  initialUnits: number
  acquisitionRate: Distribution    // units per month
  maxUnits?: number                // SOM cap
  churnRate?: Distribution
  expansionRate?: Distribution
}
```

---

### 4.8 Costs

#### Fixed Costs

```ts
CostModel {
  fixedMonthlyCosts: FixedCost[]
}

FixedCost {
  id: string
  name: string
  monthlyCost: Distribution
  startEventId?: string
}
```

#### Per‑Stream Costs

```ts
StreamCosts {
  cacPerUnit: Distribution
  onboardingCost?: Distribution
  variableCostPerUnit?: Distribution
}
```

---

### 4.9 Assumptions

```ts
Assumption {
  id: string
  description: string
  confidence: 'low' | 'medium' | 'high'
  affects: string[]   // ids of streams, markets, timeline events
  notes?: string
}
```

Assumptions are explanatory, not computational.

---

### 4.10 Risks

```ts
Risk {
  id: string
  name: string
  probability: number   // 0–1
  impact: RiskImpact[]
}

RiskImpact {
  targetId: string
  type: 'delay' | 'scale' | 'increase' | 'decrease'
  magnitude: Distribution
}
```

Risks modify parameters, not outcomes.

---

## 5. Planner UI Specification

### 5.1 Revenue Streams Tab (Replacement for Market Table)

**View:**

* List of revenue streams
* Add / duplicate / delete
* Each stream opens a **sub‑tab panel**

---

### 5.2 Revenue Stream Sub‑Tabs

#### Tab 1 – Overview

* Name
* Linked Market
* Revenue unit
* Pricing model
* Expected start date (Timeline Event selector)

#### Tab 2 – Market Reach

* SAM units (read‑only from market)
* SOM cap (editable)
* Initial customers

#### Tab 3 – Pricing & Margins

* Price per unit (simple input + advanced range)
* Gross margin
* Billing frequency

#### Tab 4 – Growth

* Monthly acquisition rate
* Churn toggle + rate
* Expansion toggle + rate

#### Tab 5 – Costs

* CAC per unit
* Onboarding cost
* Variable delivery cost

Each tab writes directly to the canonical model.

---

### 5.3 Progressive Uncertainty Input

Default:

```
Value: [ 100 ]
```

Advanced:

```
Min: 80
Most Likely: 100
Max: 140
```

Stored as a `Distribution`.

---

### 5.4 Timeline UI

* Simple Gantt‑style editor
* Month‑based (relative time)
* Revenue streams and costs link to events

---

### 5.5 Assumptions UI

* Free‑text entry
* Confidence selector
* "Affects" multi‑select

---

### 5.6 Risks UI

* Probability slider
* Impact type selector
* Magnitude: Low / Medium / High (mapped to ranges)

---

## 6. Validation Rules

Simulation is blocked unless:

* Each revenue stream has:

  * Market
  * Start event
  * Price distribution
  * Acquisition rate
* All distributions have valid bounds
* Timeline events have non‑negative months

---

## 7. Explicit Non‑Goals (for this phase)

* No financial charts
* No totals or rollups
* No Monte‑Carlo execution

This phase produces a **complete, explainable input model**.

---

## 8. Next Phase (Not Implemented Here)

* Monte‑Carlo engine
* Summary dashboard
* Bear / Base / Bull scenarios
* Sensitivity analysis

These will consume this model without modification.

---

## 9. Success Criteria

The system is successful if:

* A plan can be fully specified without spreadsheets
* Every number has an explanation
* Changing one assumption visibly alters outcomes
* Teams trust the model enough to argue with it

---

**End of specification**
