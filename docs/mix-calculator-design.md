# Mix Calculator — Design & Unit Conversion Specification

## 1. Problem Statement

Fertigation and foliar recipes are authored at a **base rate per unit of solution** — for example, `0.125 tsp/gal` or `1 ml/L`. When an operator prepares a batch, they need to know the quantity of each ingredient to measure out for their specific target volume.

The target volume itself depends on operational context:

> "I am watering sub-zone Z1A — 150 containers, 30-gal pots, 2 plants per container — at 0.5 gal per plant. How many teaspoons of Fish Hydrolysate do I measure?"

> "I want to mix 50 gallons of AUTO-FLOWER solution. Give me metric quantities."

> "I have 3 specific dry containers in row Z2-A-R3. What do I mix for 3 gallons?"

The calculator bridges recipe authoring (base rates) and field execution (concrete measurements), operating entirely client-side. It requires:

1. A recipe (fertigation or foliar) with at least one ingredient
2. A target volume in gallons (derived from scope inputs or entered directly)
3. A preferred unit system (imperial or metric) for the output

The output is a numbered ingredient list with quantities scaled to the target volume, displayed in human-readable units appropriate to each quantity's magnitude, plus a printable mixing card designed for field use.

---

## 2. Input Scenarios — Zone and Plant Aware

### 2.1 Scenario A: Full Sub-zone Drip

The most common daily scenario. The operator is watering an entire sub-zone via drip irrigation.

**Inputs:**
- Sub-zone selector (Z1A, Z1B, Z2A, Z2B, Z3A, Z3B, Z4A, Z4B)
- Application rate: gallons per plant (gal/plant)
- Plants per container: pulled from the active batch on that sub-zone, or entered manually (default 1)

**Fixed infrastructure values** (from `cv_sub_zones` seed data):

| Sub-zone | Designation | Pot size | Containers | Rows |
|----------|-------------|----------|------------|------|
| Z1A–Z4A  | A           | 30 gal   | 150        | 5 × 30 |
| Z1B–Z4B  | B           | 10 gal   | 145        | 5 × 29 |

**Calculation:**
```
total_gallons = container_count × plants_per_container × rate_gal_per_plant
```

**Examples:**
- Z1A, 2 plants/container, 0.5 gal/plant: `150 × 2 × 0.5 = 150.0 gal`
- Z1B, 1 plant/container, 0.3 gal/plant: `145 × 1 × 0.3 = 43.5 gal`
- Z3A, 2 plants/container, 0.4 gal/plant: `150 × 2 × 0.4 = 120.0 gal`

**UI note:** Sub-zone selection auto-fills `container_count` and `pot_size_gal` from the known infrastructure. The operator only enters the rate and plants-per-container.

---

### 2.2 Scenario B: Specific Rows

The operator is watering selected rows within a sub-zone — for example, rows 3 and 4 because they dried out faster.

**Inputs:**
- Sub-zone (determines row sizes)
- Row selector (checkboxes or chips): R1, R2, R3, R4, R5
- Application rate: gal/plant
- Plants per container: from batch record or manual entry

**Fixed row sizes:**
- A-sub-zone rows: 30 containers each
- B-sub-zone rows: 29 containers each

**Calculation:**
```
selected_containers = Σ(container_count for each selected row)
total_gallons = selected_containers × plants_per_container × rate_gal_per_plant
```

**Example:** Z2A rows R3 and R4, 1 plant/container, 0.5 gal/plant:
```
selected_containers = 30 + 30 = 60
total_gallons = 60 × 1 × 0.5 = 30.0 gal
```

---

### 2.3 Scenario C: Plant Count Direct

The operator knows exactly how many plants need water — common for supplemental hand-watering after spotting dry containers across multiple rows.

**Inputs:**
- Number of plants (integer, 1+)
- Application rate: gal/plant

**Calculation:**
```
total_gallons = plant_count × rate_gal_per_plant
```

**Example:** 12 dry plants at 0.5 gal/plant → `12 × 0.5 = 6.0 gal`

**UI note:** No zone awareness. Operator types a plant count directly. This is the fastest path for ad-hoc supplemental watering.

---

### 2.4 Scenario D: Manual Volume

The operator bypasses zone math entirely and enters a total volume.

**Inputs:**
- Total volume with unit selector: gallons or liters

**Calculation:**
```
total_gallons = entered_value (if gal)
total_gallons = entered_value × 0.264172 (if liters → gal conversion)
```

**Use cases:**
- Mixing a stock tank of a specific size (e.g., "fill this 50-gallon tank")
- Preparing solution for multiple uses without needing plant-count math
- Foliar concentrate preparation where volume is measured by sprayer capacity

---

### 2.5 Scenario E: Foliar Spray

Foliar recipes are sprayed at much lower volumes per plant than fertigation. The input rate uses ounces or milliliters per plant rather than gallons.

**Inputs:**
- Row selector or plant count
- Application rate: oz/plant or mL/plant (selector)
- Plants per container: from batch or manual

**Calculation (row-based):**
```
plant_count = selected_containers × plants_per_container
total_oz = plant_count × rate_oz_per_plant
total_gal = total_oz / 128
```

**Calculation (plant-count-based):**
```
total_oz = plant_count × rate_oz_per_plant
total_gal = total_oz / 128
```

**Typical foliar rates:** 2–4 oz per plant. A 30-container row with 1 plant each at 3 oz/plant = 90 oz = 0.70 gal.

**UI note:** For foliar, `total_gal` is the internal intermediate. Displayed output volume uses liters or ounces/quarts depending on magnitude.

---

## 3. Unit Conversion Tables

### 3.1 Volume Unit Relationships

All calculations use **gallons as the internal intermediate**. Input and output can be any of the listed units.

```
1 gallon (US) =
    3785.41 mL
    3.78541 L
    768 tsp      (teaspoons)
    256 tbsp     (tablespoons)
    128 fl oz    (fluid ounces)
    16 cups
    8 pt         (pints)
    4 qt         (quarts)

1 liter =
    1000 mL
    33.814 fl oz
    4.22675 cups
    202.884 tsp

1 fl oz =
    29.5735 mL
    6 tsp
    2 tbsp

1 tbsp =
    14.7868 mL
    3 tsp

1 tsp =
    4.92892 mL

1 drop ≈
    0.05 mL     (standard medical dropper; documented assumption, not precise)
```

### 3.2 Rate Units in Use

These are the `rate_unit` values stored in `cv_fertigation_recipe_ingredients` and `cv_foliar_recipe_ingredients`, as reflected in the `RATE_UNIT_LABELS` map in `FertigationRecipeDetail.jsx`:

| rate_unit value   | Display label | Meaning                    |
|-------------------|---------------|----------------------------|
| `tsp_per_gal`     | tsp/gal       | teaspoons per gallon of solution |
| `tbsp_per_gal`    | tbsp/gal      | tablespoons per gallon     |
| `ml_per_gal`      | ml/gal        | milliliters per gallon     |
| `oz_per_gal`      | oz/gal        | fluid ounces per gallon    |
| `g_per_gal`       | g/gal         | grams per gallon (dry weight) |
| `g_per_L`         | g/L           | grams per liter (dry weight) |
| `ml_per_L`        | ml/L          | milliliters per liter      |
| `drops_per_gal`   | drops/gal     | drops per gallon           |

> **Note:** `g_per_gal` and `g_per_L` are weight-based (dry ingredients). The calculator outputs these in grams or ounces by weight, not fluid volume. The output unit selector does not apply to weight-based ingredients — they always display in g or oz (weight).

### 3.3 Canonical Intermediate: mL of Ingredient per mL of Solution

To handle all rate units uniformly, convert every ingredient rate to a **mL/mL ratio** (mL of ingredient per mL of solution). Scale by total volume to get the total ingredient volume in mL, then convert to the output unit.

**Conversion formulas for each rate_unit:**

```
tsp_per_gal:   mL_per_mL = rate_value × 4.92892 / 3785.41
tbsp_per_gal:  mL_per_mL = rate_value × 14.7868 / 3785.41
ml_per_gal:    mL_per_mL = rate_value / 3785.41
oz_per_gal:    mL_per_mL = rate_value × 29.5735 / 3785.41
drops_per_gal: mL_per_mL = rate_value × 0.05 / 3785.41
ml_per_L:      mL_per_mL = rate_value / 1000
g_per_gal:     g_per_mL  = rate_value / 3785.41   ← weight, not volume
g_per_L:       g_per_mL  = rate_value / 1000       ← weight, not volume
```

**Worked conversion examples:**

```
0.125 tsp/gal:
  = 0.125 × 4.92892 / 3785.41
  = 0.616115 / 3785.41
  = 0.0001628 mL/mL

1 ml/gal:
  = 1 / 3785.41
  = 0.0002642 mL/mL

1 ml/L:
  = 1 / 1000
  = 0.001000 mL/mL

1 drops/gal:
  = 0.05 / 3785.41
  = 0.0000132 mL/mL
```

**Scaling to target volume:**

```
total_ingredient_mL = mL_per_mL × target_volume_gal × 3785.41
```

Or equivalently:

```
total_ingredient_mL = mL_per_mL × target_volume_mL
where target_volume_mL = target_volume_gal × 3785.41
```

---

## 4. Output Quantities — Practical Units and Auto-Selection

### 4.1 Imperial Auto-Unit Selection

When the operator selects imperial output, choose the most readable unit based on the calculated quantity in mL:

| Calculated ingredient volume | Display unit | Conversion |
|------------------------------|--------------|------------|
| < 1 mL                       | drops        | mL ÷ 0.05 |
| 1 mL – 14.79 mL              | tsp          | mL ÷ 4.92892 |
| 14.79 mL – 44.36 mL         | tbsp         | mL ÷ 14.7868 |
| 44.36 mL – 236.6 mL         | fl oz        | mL ÷ 29.5735 |
| 236.6 mL – 946.4 mL         | cups         | mL ÷ 236.588 |
| 946.4 mL – 3785.4 mL        | qt           | mL ÷ 946.353 |
| ≥ 3785.4 mL                  | gal          | mL ÷ 3785.41 |

### 4.2 Metric Auto-Unit Selection

| Calculated ingredient volume | Display unit | Conversion |
|------------------------------|--------------|------------|
| < 1 mL                       | drops        | mL ÷ 0.05 |
| 1 mL – 999 mL                | mL           | (as-is) |
| ≥ 1000 mL                    | L            | mL ÷ 1000 |

### 4.3 Weight-Based Ingredients

For `g_per_gal` and `g_per_L` ingredients, always display in grams until quantity ≥ 1000 g, then display in kg. Do not apply the fluid volume unit ladder.

```
total_g = g_per_mL × target_volume_mL
display: X.XX g   (if < 1000 g)
display: X.XX kg  (if ≥ 1000 g)
```

### 4.4 Display Precision

- **Always show exactly 2 decimal places.** `1.50 tsp`, `0.83 fl oz`.
- **Never show trailing unit ambiguity.** "fl oz" not "oz" (reserves oz for weight context).
- **Zero-check:** If a calculated quantity rounds to 0.00 in the chosen unit, drop one unit tier and re-display. (e.g., 0.00 drops → impossible; 0.00 tsp → display in drops instead.)

---

## 5. UI Design

### 5.1 Entry Points

The Mix Calculator is reachable from four locations:

| Location | UI element | Navigation |
|----------|------------|------------|
| `FertigationRecipeDetail` | "Mix Calculator" button (alongside Print Recipe Card) | `/recipes/calculator?recipe_type=fertigation&recipe_id={id}` |
| `FoliarRecipeDetail` | "Mix Calculator" button | `/recipes/calculator?recipe_type=foliar&recipe_id={id}` |
| `FertigationNew` | "Calculate mix →" link below the recipe display chip | `/recipes/calculator?recipe_type=fertigation&recipe_id={id}&return_to=fertigation&batch_id={id}` |
| `FoliarNew` | "Calculate mix →" link below the recipe display | `/recipes/calculator?recipe_type=foliar&recipe_id={id}&return_to=foliar&batch_id={id}` |
| `RecipeIndex` | "Mix Calculator" card/link | `/recipes/calculator` (no pre-selection) |

When launched from an application form (`return_to` param present), the "Use This Volume" button pre-fills `volume_gallons` in the originating form and navigates back to it.

When launched from a recipe detail page with a `batch_id` param, the calculator pre-selects the sub-zone from that batch and pulls `plants_per_container` from the batch record.

### 5.2 Route

```
/recipes/calculator
```

Accessible to all authenticated users (same as recipe detail pages — no minRole restriction).

### 5.3 Layout (Mobile-First, Field-Optimized)

```
┌─────────────────────────────────────────────┐
│  ← Back                  Mix Calculator      │  ← header, 56pt min height
├─────────────────────────────────────────────┤
│                                             │
│  Recipe                                     │
│  ┌───────────────────────────────────────┐  │
│  │  [AUTO-FLOWER v1.2              ▼]    │  │  ← dropdown (fertigation or foliar)
│  └───────────────────────────────────────┘  │
│                                             │
│  ─── Target Volume ───────────────────────  │
│                                             │
│  How are you watering?                      │
│  ┌──────────┐ ┌──────┐ ┌─────────────┐     │
│  │Full sub- │ │ Rows │ │Plant count  │     │  ← 56pt chip buttons
│  │  zone    │ │      │ │             │     │
│  └──────────┘ └──────┘ └─────────────┘     │
│  ┌──────────────────┐                       │
│  │  Manual volume   │                       │
│  └──────────────────┘                       │
│                                             │
│  [Scenario-specific inputs — see 5.4]      │
│                                             │
│  → 150 containers × 2 plants × 0.50 gal    │  ← live calculation display
│  → Total: 150.0 gallons                    │
│                                             │
│  Output units:  [Imperial ●]  [Metric  ○]  │
│                                             │
│  ─── Mixing Instructions ─────────────────  │
│                                             │
│  Mix 150.0 gallons total                   │
│  EC target: 1.8–2.2 mS/cm                 │
│  pH target: 6.0–6.2                        │
│                                             │
│  1.  Armor Si          ·····  3.00 fl oz   │
│  2.  Fish Hydrolysate  ····  14.40 fl oz   │
│  3.  Cal-Mag           ·····  9.60 fl oz   │
│  4.  Superthrive       ·····  0.80 fl oz   │
│                                             │
├─────────────────────────────────────────────┤
│  [Print Mixing Card]    [Use This Volume]   │  ← fixed bottom, 64pt
└─────────────────────────────────────────────┘
```

**Fixed bottom bar:** `[Print Mixing Card]` (secondary, border style) and `[Use This Volume]` (primary, green-800). `[Use This Volume]` is only visible when `return_to` param is present.

**Calculation display** updates live on every input change — no submit button for the calculation itself.

**No volume → greyed-out ingredient list** with placeholder "Enter a target volume to see quantities."

### 5.4 Scenario-Specific Input Controls

**Scenario A — Full sub-zone:**
```
Sub-zone: [Z1A ▼]   Rate: [0.50] gal/plant   Plants/container: [2]
```
Sub-zone dropdown auto-fills container count. Plants/container defaults to batch value if batch context is available, otherwise 1.

**Scenario B — Rows:**
```
Sub-zone: [Z1A ▼]
Rows: [R1] [R2] [✓R3] [✓R4] [R5]   (chip toggle)
Rate: [0.50] gal/plant   Plants/container: [2]
Intermediate: 60 containers selected
```

**Scenario C — Plant count:**
```
Plants: [300]   Rate: [0.50] gal/plant
```

**Scenario D — Manual volume:**
```
Volume: [150.0]   Unit: [gal ▼] (or L)
```

**Scenario E — Foliar spray:**
```
(Row chips same as Scenario B, or switch to "Plant count" sub-mode)
Rate: [3.0] oz/plant   (or [90] mL/plant with unit selector)
Plants/container: [1]
Intermediate: 30 plants × 3.0 oz = 90 oz = 0.70 gal
```

### 5.5 Recipe Selector

- Dropdown shows: `{name} v{version}` for all active recipes of the selected type
- Grouped: fertigation recipes first, then a divider, then foliar recipes (if `recipe_type` is not pre-specified)
- When launched from a recipe detail page, the recipe is pre-selected and the dropdown is still editable (operator may want to compare)
- Inactive/superseded recipe versions are excluded from the dropdown

### 5.6 Ingredient List Display

```
┌─────────────────────────────────────────────┐
│  1.  Armor Si               3.00 fl oz      │
│      (Add first — silica needs adjustment   │
│       time before pH-sensitive nutrients)   │
│  2.  Fish Hydrolysate       14.40 fl oz     │
│  3.  Cal-Mag                9.60 fl oz      │
│  4.  Superthrive            0.80 fl oz      │
│                                             │
│      ─────────────────────────────────      │
│      Targeting 150.0 gal total              │
└─────────────────────────────────────────────┘
```

- Numbered by `order_index` (ascending)
- Product name displayed as `item_name` from farmstock, fallback to `Product #N` if farmstock unavailable
- Ingredient `notes` (if present) displayed as small gray subtext below the product name
- Quantities right-aligned in `JetBrains Mono` font for easy reading
- Unit in a lighter weight next to the quantity

### 5.7 UX Rules (from Field UX Requirements)

- All numeric inputs use `inputMode="decimal"` or `inputMode="numeric"` — no keyboard-mode switching
- Minimum touch target 56pt for all selectors and chip buttons
- Calculation output updates live — no "Calculate" button required
- State persists through `localStorage` under `cv_draft_calculator` on every change — operator can close and return
- No modal stacks — the entire calculator is a single page with inline sections

---

## 6. Print Mixing Card

### 6.1 Purpose and Format

The mixing card is a **browser-print output** designed to be laminated and attached to a mixing station, tank, or clipboard. It is formatted for legibility from 2–3 feet away and under grow-environment lighting conditions.

### 6.2 Visual Design

Matches the wall chart style: Fraunces serif headers, JetBrains Mono for numbers, earthy palette.

```
┌─────────────────────────────────────────────────────────────────┐
│  Fairwater Farm Cultivation                 [date printed]      │
│                                                                 │
│  AUTO-FLOWER                                                    │  ← 40pt Fraunces bold, leaf-dark
│  Version 1.2                                                    │  ← 14pt rust
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   150.0 GALLONS                                         │   │  ← 56pt JetBrains Mono, white on leaf-dark
│  │   EC 1.8–2.2 mS/cm    pH 6.0–6.2                      │   │  ← 18pt
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Z1A · 150 containers · 2 plants/container                     │  ← batch context if available
│  0.50 gal/plant                                                │
│                                                                 │
│  ─── Ingredients ────────────────────────────────────────────  │
│                                                                 │
│  1   Armor Si                               3.00 fl oz         │  ← 22pt JetBrains Mono quantity
│  2   Fish Hydrolysate                      14.40 fl oz         │
│  3   Cal-Mag                                9.60 fl oz         │
│  4   Superthrive                            0.80 fl oz         │
│                                                                 │
│  ─── Mixing Order ───────────────────────────────────────────  │
│                                                                 │
│  [recipe.mixing_order text — pre-wrap]                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────     │
│  cultivate.hatstak.app · Fairwater Farm                        │  ← 10pt rust
└─────────────────────────────────────────────────────────────────┘
```

**Color palette:**
- Background: `#faf6ed` (cream)
- Header text: `#1f3320` (leaf-dark)
- Volume block background: `#1f3320`, text: `#faf6ed`
- Accent / rule lines: `#a04727` (rust)
- Ingredient numbers / quantities: `#1f3320`, `JetBrains Mono`
- Footer: `#a04727`

### 6.3 Implementation

- `window.print()` triggered by the "Print Mixing Card" button
- Print-specific CSS in a `<style media="print">` block hides all screen UI (`display: none` on `.print:hidden` elements)
- The mixing card is a `.hidden.print:block` element rendered in the DOM at all times but invisible on screen — same pattern as the existing `FertigationRecipeDetail.jsx` PrintCard component
- Google Fonts import in the print block: `Fraunces` + `JetBrains Mono` — already used in the existing print card
- `@page { margin: 0.75in; size: letter; }` — landscape if total ingredient count > 8, otherwise portrait
- No browser chrome, no navigation, no colors that won't reproduce in black-and-white (the volume block should still work in B&W via high contrast)

### 6.4 Print Card Batch Context

When the calculator was launched from an application form with a `batch_id`:
- Show: `{sub_zone_id} · {container_count} containers · {plants_per_container} plants/container`
- Show: `{rate} gal/plant`
- Show: `{strain_name} — {batch status}`

When launched from a recipe detail page without batch context:
- Show: `Manual volume: {volume} {unit}` or `{plant_count} plants × {rate} gal/plant`

---

## 7. Plants-per-Container Awareness

### 7.1 The Distinction

The calculator must distinguish between:

- **Containers:** physical pots in fixed positions (e.g., 150 for Z1A)
- **Plants:** biological entities assigned to containers; a container may hold more than one

The application rate is specified **per plant**, not per container, because each plant consumes water regardless of how many share a container.

### 7.2 Data Source for plants_per_container

Priority order when determining the plants-per-container value:

1. **Active batch on the selected sub-zone:** Pull `plants_per_container` from `cv_plant_batches` where `sub_zone_id` matches and `status NOT IN ('closed')`. Use the first result.
2. **URL param `batch_id`:** If the calculator was launched from an application form, use that batch's `plants_per_container`.
3. **Manual entry:** If no batch is found or no batch context exists, show an editable field defaulting to 1.

When `plants_per_container = 2` (common for autoflowers):
```
Z1A: 150 containers × 2 plants = 300 plants
total_gal = 300 × 0.5 gal/plant = 150 gal
```

When `plants_per_container = 1` (standard for photoperiods):
```
Z1A: 150 containers × 1 plant = 150 plants
total_gal = 150 × 0.5 gal/plant = 75 gal
```

### 7.3 Rate Specifiers — Per Plant vs. Per Container vs. Per Gallon Pot Volume

The UI offers three rate specifiers via a unit selector next to the rate input:

| Rate specifier | Multiplier logic |
|----------------|-----------------|
| `gal/plant` (default) | `containers × plants_per_container × rate` |
| `gal/container` | `containers × rate` (ignores plants_per_container) |
| `gal/gal-pot` | `containers × pot_size_gal × rate` (e.g., 0.02 gal per gal of pot volume = 6 gal per 30-gal pot) |

`gal/container` and `gal/gal-pot` are advanced options — collapsed behind a "More options" disclosure in the UI but fully functional. The default and most commonly used is `gal/plant`.

### 7.4 Displaying the Intermediate

Always show the intermediate calculation before the total so the operator can verify the math:

```
150 containers × 2 plants/container × 0.50 gal/plant = 150.0 gal
```
or (container mode):
```
150 containers × 0.50 gal/container = 75.0 gal
```

This single line is the operator's sanity check and should be prominent — `text-sm font-mono text-gray-600` on screen, 12pt on print.

---

## 8. Calculation Examples

### Example 1: Z1A Auto Batch, Full Sub-zone, 0.5 gal/plant, Imperial Output

**Inputs:**
- Recipe: AUTO-FLOWER v1.2
- Scenario: Full sub-zone (A)
- Sub-zone: Z1A
- Container count: 150 (seed data)
- Plants per container: 2 (autoflower batch)
- Rate: 0.5 gal/plant
- Output unit: imperial

**Volume calculation:**
```
total_gal = 150 × 2 × 0.5 = 150.0 gal
total_mL = 150.0 × 3785.41 = 567,811.5 mL
```

**Ingredient: Armor Si at 0.5 ml/gal**
```
mL_per_mL = 0.5 / 3785.41 = 0.0001321 mL/mL
total_ingredient_mL = 0.0001321 × 567,811.5 = 75.00 mL
display: 75.00 mL → 44.36–236.6 range → fl oz: 75.00 / 29.5735 = 2.54 fl oz
```

**Ingredient: Fish Hydrolysate at 0.25 tsp/gal**
```
mL_per_mL = 0.25 × 4.92892 / 3785.41 = 0.0003256 mL/mL
total_ingredient_mL = 0.0003256 × 567,811.5 = 184.87 mL
display: 184.87 mL → 44.36–236.6 range → fl oz: 184.87 / 29.5735 = 6.25 fl oz
```

**Ingredient: Cal-Mag at 2 ml/gal**
```
mL_per_mL = 2 / 3785.41 = 0.0005284 mL/mL
total_ingredient_mL = 0.0005284 × 567,811.5 = 300.00 mL
display: 300.00 mL → 236.6–946.4 range → cups: 300.00 / 236.588 = 1.27 cups
```

**Ingredient: Superthrive at 1 drops/gal**
```
mL_per_mL = 1 × 0.05 / 3785.41 = 0.0000132 mL/mL
total_ingredient_mL = 0.0000132 × 567,811.5 = 7.50 mL
display: 7.50 mL → 1–14.79 range → tsp: 7.50 / 4.92892 = 1.52 tsp
```

**Output (imperial):**
```
Mix 150.0 gallons total
EC target: 1.8–2.2 mS/cm   pH target: 6.0–6.2

1. Armor Si          2.54 fl oz
2. Fish Hydrolysate  6.25 fl oz
3. Cal-Mag           1.27 cups
4. Superthrive       1.52 tsp
```

---

### Example 2: 3 Specific Containers in Z2-B-R3, 0.5 gal/container, Metric Output

**Inputs:**
- Recipe: AUTO-VEG v1.0
- Scenario: Plant count direct (operator counted 3 dry containers, 1 plant each)
- Plant count: 3
- Rate: 0.5 gal/container → using "gal/container" specifier, so effectively 3 containers × 0.5 = 1.5 gal
- Output unit: metric

**Volume calculation:**
```
total_gal = 3 × 0.5 = 1.5 gal
total_mL = 1.5 × 3785.41 = 5,678.1 mL
```

**Ingredient: Fish Hydrolysate at 0.125 tsp/gal**
```
mL_per_mL = 0.125 × 4.92892 / 3785.41 = 0.0001628 mL/mL
total_ingredient_mL = 0.0001628 × 5,678.1 = 0.924 mL
display metric: 0.924 mL → 1–999 range → mL: 0.92 mL
```

**Ingredient: Armor Si at 0.5 ml/gal**
```
mL_per_mL = 0.5 / 3785.41 = 0.0001321 mL/mL
total_ingredient_mL = 0.0001321 × 5,678.1 = 0.750 mL
display metric: 0.750 mL → 1–999 range → mL: 0.75 mL
(Note: rounds to 0.75 mL — borderline case; show as mL not drops since ≥ 1 mL)
```

**Ingredient: Superthrive at 1 drops/gal**
```
mL_per_mL = 0.05 / 3785.41 = 0.0000132 mL/mL
total_ingredient_mL = 0.0000132 × 5,678.1 = 0.075 mL
display metric: 0.075 mL → < 1 mL → drops: 0.075 / 0.05 = 1.50 drops → 1.50 drops
```

**Output (metric):**
```
Mix 5.68 L total   (1.5 gal)

1. Armor Si           0.75 mL
2. Fish Hydrolysate   0.92 mL
3. Superthrive        1.50 drops
```

---

### Example 3: Manual 25-Gallon Foliar Mix, Metric Output

**Inputs:**
- Recipe: Weekly Preventive Foliar v1.0 (foliar recipe)
- Scenario: Manual volume
- Volume: 25 gal (entered directly — operator knows their spray tank capacity)
- Output unit: metric

**Volume calculation:**
```
total_gal = 25.0 gal
total_mL = 25.0 × 3785.41 = 94,635.25 mL = 94.635 L
```

**Ingredient: Foliar Cal-Mag at 2 ml/L**
```
mL_per_mL = 2 / 1000 = 0.002000 mL/mL
total_ingredient_mL = 0.002 × 94,635.25 = 189.27 mL
display metric: 189.27 mL → 1–999 range → mL: 189.27 mL
```

**Ingredient: Kelp Extract at 1 ml/L**
```
mL_per_mL = 1 / 1000 = 0.001000 mL/mL
total_ingredient_mL = 0.001 × 94,635.25 = 94.64 mL
display metric: 94.64 mL → 1–999 range → mL: 94.64 mL
```

**Ingredient: Foliar Si at 0.5 ml/L**
```
mL_per_mL = 0.5 / 1000 = 0.000500 mL/mL
total_ingredient_mL = 0.000500 × 94,635.25 = 47.32 mL
display metric: 47.32 mL → 1–999 range → mL: 47.32 mL
```

**Output (metric):**
```
Mix 94.64 L total   (25 gal)

1. Foliar Cal-Mag   189.27 mL
2. Kelp Extract      94.64 mL
3. Foliar Si         47.32 mL
```

---

## 9. Implementation Notes

### 9.1 Frontend-Only Feature

The Mix Calculator is a **pure frontend calculation** — no new API routes required. All data it needs is already available:

- Recipe + ingredients: `api.getFertigationRecipe(id)` or `api.getFoliarRecipe(id)` — both already fetch ingredients
- Sub-zone data: static constants derived from the known infrastructure (no API call needed)
- Batch data (optional, for plants_per_container): `api.getBatch(id)` if `batch_id` param is present
- Farmstock item names: already fetched by recipe detail endpoints and included in ingredient objects as `item_name`

### 9.2 Calculation Module

Extract the calculation logic into a single pure function module at:
```
client/src/lib/mix-calculator.js
```

Exports:
```javascript
// Convert rate_value + rate_unit → mL per mL of solution ratio
function rateToMlPerMl(rateValue, rateUnit)

// Convert mL quantity to display string in chosen unit system
function formatIngredientQuantity(mL, unitSystem)   // unitSystem: 'imperial' | 'metric'

// Main calculation: recipe ingredients × target volume → display rows
function calculateMix(ingredients, targetVolumeGal, unitSystem)
// returns: { totalGal, totalL, rows: [{ order_index, item_name, input_id, notes, displayQty, displayUnit }] }
```

This module should have unit tests in `src/tests/unit/mix-calculator.test.js` covering:
- Each rate_unit conversion
- Auto-unit selection thresholds (boundary conditions: exactly 1 mL, exactly 14.79 mL, etc.)
- Weight-based ingredient path (`g_per_gal`, `g_per_L`)
- Zero-quantity edge case
- All three worked examples from Section 8

### 9.3 Route Registration

```jsx
// client/src/App.jsx
import MixCalculator from './pages/recipes/MixCalculator';
// ...
<Route path="/recipes/calculator" element={<ProtectedRoute><MixCalculator /></ProtectedRoute>} />
```

Must be registered before any dynamic `:id` routes in the recipes group to prevent shadowing.

### 9.4 Entry Point Wiring

**FertigationRecipeDetail.jsx** — add alongside the existing Print Recipe Card button:
```jsx
<Link
  to={`/recipes/calculator?recipe_type=fertigation&recipe_id=${recipe.recipe_id}`}
  className="flex items-center gap-1.5 px-4 py-2.5 border border-green-300 bg-green-50 rounded-xl text-sm font-medium text-green-800 hover:bg-green-100 transition-colors"
  style={{ minHeight: '44px' }}
>
  Mix Calculator
</Link>
```

**FertigationNew.jsx** — add below the recipe display chip (the green box showing active recipe name):
```jsx
{displayBatch?.active_recipe_id && (
  <Link
    to={`/recipes/calculator?recipe_type=fertigation&recipe_id=${displayBatch.active_recipe_id}&return_to=fertigation&batch_id=${batchIdParam || ''}`}
    className="text-xs text-green-700 underline font-medium"
  >
    Calculate mix →
  </Link>
)}
```

The same pattern applies to FoliarRecipeDetail.jsx and FoliarNew.jsx (using `recipe_type=foliar` and `foliar_recipe_id`).

### 9.5 "Use This Volume" — Return Flow

When `return_to` is in the URL params and the operator taps "Use This Volume":

```javascript
// Store the calculated volume in sessionStorage for the originating form to pick up
sessionStorage.setItem('cv_calc_volume_gal', String(totalGal));
sessionStorage.setItem('cv_calc_volume_batch_id', batchId || '');

// Navigate back
if (returnTo === 'fertigation') {
  navigate(`/applications/fertigation/new${batchId ? `?batch_id=${batchId}` : ''}`);
} else if (returnTo === 'foliar') {
  navigate(`/applications/foliar/new${batchId ? `?batch_id=${batchId}` : ''}`);
}
```

The originating form reads this on mount:
```javascript
useEffect(() => {
  const calcVol = sessionStorage.getItem('cv_calc_volume_gal');
  const calcBatch = sessionStorage.getItem('cv_calc_volume_batch_id');
  if (calcVol && (!batchIdParam || calcBatch === batchIdParam)) {
    setVolumeGallons(calcVol);
    sessionStorage.removeItem('cv_calc_volume_gal');
    sessionStorage.removeItem('cv_calc_volume_batch_id');
  }
}, []);
```

This is a one-shot handoff — volume is consumed once and cleared.

---

*Last updated: May 2026. Spec owned by cultivate project.*
