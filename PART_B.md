# Part B: decisions

Prepared for the technical call. Part A outputs (`routes.txt`) and the input files are unchanged; everything below is derived from them plus `ops-notes.md`.

**Method.** The scenarios were computed by re-running the Part A routing functions (`src/router.ts`) in memory, keeping Part A's rules and sequential stock reservations, with:

- warehouses switched on or off;
- for option 3, a selection step defined in the Q2 section.

No input or output file was modified to produce them.

**Labels used below.**

- **Fact**: stated in the assessment, the data files or `ops-notes.md`.
- **Computed**: derived from those by a sequential re-run.
- **Estimate**: Priya's figures applied to order volumes.
- **Assumption**: my interpretation, open to challenge.

---

## Facts used

| Source | Fact |
|---|---|
| `orders.json` | All orders were placed **Tue Oct 20 2026, 9:00–10:15 AM ET**. The next Monday is Oct 26. |
| Marco, Mon Oct 19, 8:10 AM ET | WH-NV had water damage. "**Nothing can ship from NV** until further notice, at least through next week." The router config still shows NV as enabled. |
| Keisha, Mon Oct 19, 4:30 PM ET | WH-GA is short-staffed. "**Everything is going out**", but it is "about **2 business days behind on picking** until Monday". |
| Marco, Tue Oct 20, 9:05 AM ET | Asks to stop routing to GA until Monday: "Customers shouldn't wait 2 extra days." |
| Priya, Tue Oct 20, 10:20 AM ET | GA ships ~420 orders/day. If GA is off: ~70% go to a warehouse 2+ zones farther (~**2 more days in transit**, ~**$2.35 more per parcel**). ~30% have another warehouse within one zone (~**half a day more in transit**, ~**$0.40 more per parcel**). |
| `warehouses.json` | Starting stock (VITD/MULTI/MAG): WH-NJ 400/120/**2**, WH-GA **4**/300/150, WH-NV 200/**0**/220, WH-TX 500/500/500. WH-TX is `enabled: false`; no ops note explains this or says it can be turned on. |

## Scenarios and reconciliation

Part A results are kept separate from the hypothetical scenarios below. All counts are over the 26 orders (computed).

| Scenario | Definition | NJ | GA | NV | PARTNER | Total |
|---|---|---|---|---|---|---|
| **Part A** (`routes.txt`) | Rules as given; NV enabled in config | 5 | 11 | 5 | 5 | 26 |
| **NV unavailable** (= option 2) | Part A rules with NV disabled | 6 | 14 | 0 | 6 | 26 |
| Option 1 | NV and GA disabled | 14 | 0 | 0 | 12 | 26 |
| Option 3 (inclusive reading) | NV disabled + option 3 rule | 10 | 11 | 0 | 5 | 26 |
| Option 3 ("+1 only" reading) | NV disabled + stricter rule | 8 | 12 | 0 | 6 | 26 |
| Option 4 | GA disabled, NV enabled | 11 | 0 | 10 | 5 | 26 |

**Part A → NV unavailable**, 6 changes:

| Order | Part A | NV unavailable |
|---|---|---|
| #2036 | NV z2 | GA z7 |
| #2038 | NV z4 | NJ z8 |
| #2043 | NV z3 | GA z8 |
| #2051 | NV z2 | GA z7 |
| #2052 | NV z5 | GA z8 |
| #2056 | GA z5 | PARTNER |

Reconciliation:

- NJ: 5 + 1 = 6
- GA: 11 + 4 − 1 = 14
- NV: 5 − 5 = 0
- PARTNER: 5 + 1 = 6

---

## Question 1: where should each order actually ship from today?

> Assessment wording: "Answer for the router as it runs today, plus anything in the ops notes that affects where an order can ship. Don't apply your answer to question 4 here; that's a separate decision."

How I applied it:

- **"The router as it runs today"**: the Part A results.
- **"Affects where an order can ship"**:
  - NV **cannot** ship anything (Marco), so it is treated as unavailable.
  - GA **can** ship ("everything is going out"). Its picking delay affects *how fast*, not *whether*, so it is not applied here; it is the subject of question 2.
- **"Question 4"**: Part B has no question 4. I assume it means question 2 (see the instruction check below), so no question 2 decision is applied in these answers.

| Order | Part A result (literal, unchanged) | What the ops notes change | **Answer** | Evidence |
|---|---|---|---|---|
| #2033 | **PARTNER**: `zip` is the JSON number `2134` (rule 2) | Nothing | **Hold for a person to decide** | The algorithm's result is PARTNER. The same record says `state: "MA"`, a JSON number cannot keep a leading zero, and prefix `021` exists in `zones.json`. Correcting customer address data is a human decision the assessment does not define. *Hypothetical, only if a person approves "02134":* **WH-NJ zone 3** (GA 6; NV unavailable; TX disabled). NJ has 399 VITD at that point. |
| #2037 | PARTNER: country `CA` (rule 1) | Nothing | **Partner warehouse** | Rule 1. |
| #2040 | WH-GA zone 5 | NV (zone 8) was the only other candidate and is unavailable | **WH-GA** | Bundle = VITD 1 + MAG 1. NJ's 2 MAG were used by #2039 (zone 1, created earlier). GA stock before this order: VITD 3, MAG 147 with NV unavailable (MAG 149 in Part A, where #2036 went to NV). GA's picking delay applies but belongs to question 2. |
| #2041 | WH-GA zone 7 (VITD + MULTI after the edit) | None: NV has no MULTI, so it was never a candidate | **WH-GA** | The edit at +18 min is inside the 30-minute window. Candidates: GA zone 7, NJ zone 8. Ignoring the edit would send it to NV, which is both incomplete and unable to ship. |
| #2045 | **PARTNER**: SKU `nw-mag-90` is not in the catalog (rule 7) | Nothing | **Hold for a person to decide** | The algorithm's result is PARTNER. The only catalog SKU differing just by case is `NW-MAG-90`, and a warehouse could not pick the line as written. *Hypothetical, only if a person approves `NW-MAG-90`:* **WH-GA zone 3**, the only warehouse able to ship it (NJ has 0 MAG at that point, NV unavailable, TX disabled). |
| #2050 | WH-NJ zone 5 | NV (zone 7) removed; result unchanged | **WH-NJ** | Needs 2 VITD. GA (zone 1) has only 1 left after #2035, #2040 and #2041. NJ is the only remaining candidate. |
| #2051 | **WH-NV zone 2** | **NV cannot ship** | **WH-GA** (assumption: re-routed in creation order; see below) | Re-routed in creation order with NV unavailable: GA zone 7 (exactly 1 VITD left) vs NJ zone 8, and rule 4 picks GA. Choosing NJ *because of GA's delay* would apply question 2. |

### Effect of the #2033 and #2045 corrections on other orders (computed)

Each correction was re-run sequentially in all six scenarios above, singly and together.

- **No other order's destination changes in any scenario.**
- **Final stock does change**, by exactly the corrected order's own unit:
  - #2033: NJ VITD −1
  - #2045: GA MAG −1 (where it ships from GA)
- Later cover values shift slightly, but no tie-break winner changes.
- The corrected order's own destination depends on the scenario:

| Scenario | #2033 corrected | #2045 corrected |
|---|---|---|
| Part A, NV unavailable, option 3 | NJ z3 | GA z3 |
| Option 1 | NJ z3 | PARTNER (GA off, NJ has no MAG) |
| Option 4 | NJ z3 | NV z7, which cannot ship |

### How NV-bound orders are reassigned: #2051 depends on the method

The assessment does not say how to apply "NV can't ship" to orders the live router has already assigned. Two methods were computed:

| Method | #2051 | #2056 (not in Q1) | Other Q1 orders |
|---|---|---|---|
| **A. Re-route the day in creation order with NV unavailable** (used above) | **GA z7**: takes GA's last VITD | PARTNER (GA has no VITD left, NJ has no MAG) | Unchanged |
| **B. Keep every non-NV Part A result, then reassign the 5 NV orders** with the stock left at the end of the day | **NJ z8**: #2056 already took GA's last VITD in Part A | GA z5 (keeps its Part A result) | Unchanged |

**I used method A.** It follows the assessment's own rule: "Route orders in the order they were created. Each routed order reserves its stock." This is an **assumption**.

Method B ships both #2051 and #2056 domestically: #2051 at one zone farther, and #2056 avoids PARTNER. It may be the better operational outcome if Part A's reservations are already committed. **This is unresolved, and #2051 is the only Q1 order affected.**

**Other orders affected by NV being out (method A, not in Q1):**

- #2036 → GA z7
- #2038 → NJ z8
- #2043 → GA z8
- #2052 → GA z8
- #2056 → PARTNER

IT should disable NV in the router config.

### Sensitivity to the "question 4" wording

Suppose "question 4" does **not** mean question 2, and the question 2 decision were meant to apply in Q1. Then these answers would change (computed, method A):

| Applied decision | #2040 | #2041 | #2050 | #2051 |
|---|---|---|---|---|
| Option 3 (inclusive) | WH-NJ z2 | WH-NJ z8 | WH-GA z1 | WH-NJ z8 |
| Option 1 | WH-NJ z2 | WH-NJ z8 | WH-NJ z5 | WH-NJ z8 |

#2033, #2037 and #2045 would not change.

---

## Question 2: WH-GA until Monday

### Definition of option 3 used (assumption)

"Route away from WH-GA only when another warehouse is within one zone of it" is implemented as follows, for each order in creation order:

1. **Find the eligible warehouses exactly as in Part A:** enabled, with a zone for the ZIP prefix, and enough stock *at that moment* for the whole order. NV is unavailable and TX is disabled.
2. **Find the normal winner** (lowest zone, then most days of cover, then NJ > GA > NV > TX). If it is not WH-GA, ship from it. Nothing is diverted.
3. **If the normal winner is WH-GA at zone Z,** look for another eligible warehouse with zone **≤ Z + 1**:
   - Since GA already has the lowest zone, this means zone **Z (an equal-zone tie that GA won on cover) or Z + 1**.
   - If one exists, ship from the best such warehouse by the normal tie-breakers. Otherwise ship from GA.
4. **Reserve stock** at the chosen warehouse before the next order.

"Within one zone" therefore **includes equal-zone ties (+0)**. In code this is `zone <= gaZone + 1`, checked only among warehouses that can ship the whole order. A stricter "+1 only" reading (`zone === gaZone + 1`) was also computed.

With NV unavailable and TX disabled, the **only possible alternative is WH-NJ**.

### Sequential trace: option 3 (inclusive) vs option 2, NV unavailable

- Starting stock (VITD/MULTI/MAG): **NJ 400/120/2, GA 4/300/150**.
- Each row shows stock *after* that order. Stock *before* an order is the previous row.
- **Bold** marks orders whose result differs from option 2.
- Every row was checked against a fresh simulation (computed).

| Order | Needs | Option 2 | Option 3 decision | Option 3 result | NJ after | GA after |
|---|---|---|---|---|---|---|
| #2031 | VITD 1 | NJ z1 | not GA | NJ z1 | 399/120/2 | 4/300/150 |
| #2032 | MULTI 1 | GA z1 | stays GA (NJ is +4) | GA z1 | 399/120/2 | 4/299/150 |
| #2033 | – | PARTNER | invalid ZIP | PARTNER | 399/120/2 | 4/299/150 |
| **#2034** | MAG 1 | GA z5 | **diverted** (NJ z5, +0) | **NJ z5** | 399/120/**1** | 4/299/150 |
| #2035 | VITD 1 | GA z4 | stays GA (NJ is +2) | GA z4 | 399/120/1 | 3/299/150 |
| #2036 | MAG 2 | GA z7 | stays GA (NJ has 1 MAG, needs 2) | GA z7 | 399/120/1 | 3/299/148 |
| #2037 | – | PARTNER | international | PARTNER | 399/120/1 | 3/299/148 |
| #2038 | VITD 1 | NJ z8 | not GA | NJ z8 | 398/120/1 | 3/299/148 |
| **#2039** | MAG 2 | NJ z1 | NJ has 1 MAG, so GA is the only candidate | **GA z5** | 398/120/1 | 3/299/146 |
| **#2040** | VITD 1 + MAG 1 | GA z5 | NJ wins normally (z2) | **NJ z2** | 397/120/**0** | 3/299/146 |
| **#2041** | VITD 1 + MULTI 1 | GA z7 | **diverted** (NJ z8, +1) | **NJ z8** | 396/119/0 | 3/299/146 |
| #2042 | – | PARTNER | unknown prefix 968 | PARTNER | 396/119/0 | 3/299/146 |
| #2043 | MAG 1 | GA z8 | stays GA (no eligible alternative) | GA z8 | 396/119/0 | 3/299/145 |
| **#2044** | MULTI 1 | GA z6 | **diverted** (NJ z7, +1) | **NJ z7** | 396/118/0 | 3/299/145 |
| #2045 | – | PARTNER | unknown SKU | PARTNER | 396/118/0 | 3/299/145 |
| #2046 | – | PARTNER | no ZIP | PARTNER | 396/118/0 | 3/299/145 |
| #2047 | MULTI 3 | GA z4 | stays GA (NJ is +2) | GA z4 | 396/118/0 | 3/296/145 |
| #2048 | VITD 1 | NJ z5 | not GA | NJ z5 | 395/118/0 | 3/296/145 |
| #2049 | MAG 1 | GA z4 | stays GA (no eligible alternative) | GA z4 | 395/118/0 | 3/296/144 |
| **#2050** | VITD 2 | NJ z5 | GA has 3 VITD and wins normally; NJ is +4 | **GA z1** | 395/118/0 | 1/296/144 |
| **#2051** | VITD 1 | GA z7 | **diverted** (NJ z8, +1) | **NJ z8** | 394/118/0 | 1/296/144 |
| #2052 | MAG 1 | GA z8 | stays GA (no eligible alternative) | GA z8 | 394/118/0 | 1/296/143 |
| #2053 | MULTI 1 | NJ z2 | not GA | NJ z2 | 394/117/0 | 1/296/143 |
| #2054 | MAG 1 | GA z4 | stays GA (no eligible alternative) | GA z4 | 394/117/0 | 1/296/142 |
| **#2055** | MULTI 1 | GA z8 | **diverted** (NJ z8, +0) | **NJ z8** | 394/116/0 | 1/296/142 |
| **#2056** | VITD 1 + MAG 1 | PARTNER | GA has 1 VITD; GA is the only candidate | **GA z5** | 394/116/0 | 0/296/141 |

**Consequences (computed):**

- **5 direct diversions, all to NJ:** #2034 (+0), #2041 (+1), #2044 (+1), #2051 (+1), #2055 (+0).
- **4 knock-on changes**, caused only by changed stock:
  - **#2039 is worse.** An NJ zone-1 customer moves to GA zone 5 and into GA's backlog, because #2034 used one of NJ's only 2 MAG.
  - **#2040 is better.** It moves from GA z5 to NJ z2 using NJ's remaining MAG, and avoids the backlog.
  - **#2050 is mixed.** It moves from NJ z5 to GA z1: 4 zones closer, but into GA's backlog. GA kept VITD because #2040 and #2041 left GA.
  - **#2056 is better.** It moves from PARTNER to GA z5 and ships domestically, because #2051's diversion left GA's last VITD.
- **GA was the normal winner but the order was not diverted:**
  - #2032, #2035, #2047 and #2050: NJ is 2+ zones farther.
  - #2036, #2039, #2043, #2049, #2052, #2054 and #2056: NJ lacks the stock.
- **Net effect:**
  - 6 orders leave GA's backlog: #2034, #2040, #2041, #2044, #2051, #2055.
  - 3 join it: #2039, #2050, #2056.
  - Orders shipped from GA: 14 − 6 + 3 = 11.
- **Ending stock:** NJ 394/116/0 and GA 0/296/141, vs NJ 395/119/0 and GA 0/293/142 under option 2.

**Stricter "+1 only" reading (computed):**

- **3 diversions:** #2036 (+1), #2041 (+1), #2044 (+1). #2034 and #2055 are equal-zone ties, so they are not diverted.
- **#2036 (MAG 2) takes both of NJ's MAG**, so **#2039 is still pushed to GA z5**.
- **#2050 still moves to GA z1.** GA then has no VITD left, so **#2051 goes to NJ z8 under the normal rules** (a knock-on, not a diversion).
- **#2056 still goes to PARTNER.**
- **Totals:** NJ 8, GA 12, PARTNER 6.
- **The #2039 side effect occurs under both readings.** It comes from NJ's 2-unit MAG stock, not from the interpretation.

### Limits of Priya's 70% / 30% estimate

- **Alternatives considered.** Priya's message does not say whether NV or TX were counted as alternatives. With NV unavailable and TX disabled, NJ is the only one.
- **No "no alternative" category, and no sequential stock.** Her two groups add up to 100%. In today's sample (NV unavailable, option 2), the 14 orders routed to GA split as follows *before any diversion* (computed):
  - **6 had an alternative within one zone:** #2034, #2036, #2041, #2044, #2051, #2055.
  - **3 had one only 2+ zones away:** #2032, #2035, #2047.
  - **5 had no eligible alternative at all:** #2040, #2043, #2049, #2052, #2054.
  - Applying option 3 in sequence, only 5 of those 6 were diverted: #2036 was not, because #2034 had already used NJ's MAG.
- **Sample size.** 26 orders covering about an hour, vs ~420 GA orders/day.
- **Units.** Keisha's delay is in *business* days. Priya does not say whether her transit days are business or calendar days.
- **Consistency with the stock data.** GA's daily velocities add up to 70 units/day in `warehouses.json`, vs Priya's ~420 orders/day. This cannot be reconciled from the files. NJ's capacity to absorb diverted orders is not stated anywhere.

### Cost calculations (estimates, with inputs)

**Inputs (Priya, fact as stated):**

- 420 GA orders/day.
- 70% of them: +$2.35 per parcel. 30% of them: +$0.40 per parcel.
- These figures describe GA being *off*. Applying them to option 3, or to individual sample orders, is my **assumption**.

**Per day (estimate):**

| Option | Calculation | Result |
|---|---|---|
| Option 1 | 0.70 × 420 = 294 parcels × $2.35 = $690.90; 0.30 × 420 = 126 parcels × $0.40 = $50.40; $690.90 + $50.40 | **$741.30/day** |
| Option 2 | No routing change; the files state no cost for GA's backlog | **$0 incremental** |
| Option 3 | Assumes exactly the 30% are diverted at Priya's within-one-zone cost: 126 × $0.40 | **$50.40/day**. Ratio vs option 1: $741.30 ÷ $50.40 ≈ **14.7×** |
| Option 4 | Orders sent to NV do not ship | **Not estimable** |

**Today's sample (estimate):** Priya's per-parcel figures are applied by each order's zone change. Equal-zone moves (+0) are charged $0.40 as a conservative "within one zone" cost.

| Option | Priced | Total | Not priced (no cost basis in the files) |
|---|---|---|---|
| Option 1 | 3 orders 2+ zones farther (#2032 +4, #2035 +2, #2047 +2): 3 × $2.35 = $7.05. 5 within one zone (#2034 +0, #2041 +1, #2044 +1, #2051 +1, #2055 +0): 5 × $0.40 = $2.00 | **$9.05** | 6 new PARTNER orders (#2036, #2039, #2043, #2049, #2052, #2054); #2040 moves 3 zones *closer* |
| Option 3 (inclusive) | 5 diversions: 5 × $0.40 | **$2.00** | Knock-ons: #2039 (+4 zones), #2040 (−3), #2050 (−4), #2056 (PARTNER → GA z5) |
| Option 3 ("+1 only") | 3 diversions: 3 × $0.40 | **$1.20** | Knock-ons: #2039, #2050, #2051 |

### Comparison of the four strategies

Physical fact for all four: NV cannot ship. Options 1–3 treat NV as unavailable; option 4 turns it on in the router despite that. TX stays disabled in all four. Rows marked "today's sample" are computed from the 26 orders.

| | **1. GA off** | **2. Keep GA** | **3. Away from GA within one zone** | **4. GA off + NV on** |
|---|---|---|---|---|
| **Customer impact** (Priya, estimate) | ~70%: ~2 more transit days *in place of* ~2 business days' picking delay, so roughly no faster. ~30%: ~0.5 day more transit in place of ~2 business days' delay, so ~1.5 days faster | GA orders ~2 business days late until Monday (Keisha). No transit change | The ~30% within one zone: ~1.5 days faster. The rest unchanged | Orders sent to NV **do not ship** (Marco) |
| **Customer impact** (today's sample, computed) | GA 0, NJ 14, **PARTNER 12**. 7 of the 12 are domestic orders no warehouse can ship whole: #2036, #2039, #2043, #2049, #2052, #2054, #2056 | GA 14 (delayed), NJ 6, PARTNER 6 (1 for lack of stock: #2056) | GA 11, NJ 10, PARTNER 5 (0 for lack of stock). 6 orders leave the backlog, 3 join. **#2039 worse** (NJ z1 → GA z5) | NV 10 (cannot ship), NJ 11, PARTNER 5. Includes #2039, an NJ zone-1 order, sent to NV z8 |
| **Incremental cost** (estimate; arithmetic above) | ~$741.30/day. Sample: $9.05 plus 6 unpriced PARTNER orders | $0 | ~$50.40/day if the 30% holds. Sample: $2.00 plus unpriced knock-ons | Not estimable |
| **Inventory feasibility** (computed) | **Poor.** NJ is the only warehouse left and holds 2 MAG, so MAG orders are stranded | **Good.** GA's 150 MAG is what lets MAG orders ship domestically | **Mostly good.** Diversions respect whole-order stock, but they spend NJ's scarce MAG and can displace later NJ-local MAG orders (#2039) | **Infeasible.** Relies on a warehouse that cannot ship |
| **Operational risk** (assessment) | High: all domestic volume on NJ (capacity unknown); PARTNER doubles in the sample | Lowest: no router change. GA's backlog persists | Medium: a new temporary rule written and tested mid-week. Ties and stock depletion must be handled correctly | Highest: contradicts an explicit ops statement |
| **Reversibility** | The config switch is reversible; parcels already shipped are not | Nothing to reverse | Reversible if built as a switch that expires Monday and can be turned off at once | Stuck orders need manual recovery |

### Recommendation (conditional)

**If option 3 can be implemented, tested and deployed safely before it's needed, ship option 3.**

"Safely" means:

- unit tests for the rule as defined above, including equal-zone ties and stock depletion;
- a replay of today's orders that reproduces the trace above;
- a switch that expires Monday and can be turned off immediately.

Why option 3:

- It keeps orders at GA when the alternative is 2+ zones away. Priya's figures suggest those moves would cost ~$2.35 each without arriving sooner.
- It moves orders only when the alternative is close, at ~$0.40 each, which Priya's figures suggest saves ~1.5 days.

**Key trade-off:** a small per-parcel cost and a small new rule, in exchange for faster delivery to some customers. The known downside is that diversions spend NJ's 2 units of MAG, which displaced #2039 in today's sample.

**If it cannot be done safely in time, ship option 2 (keep routing to GA as normal).** It is the safer fallback:

- no code change;
- no stock risk;
- no incremental cost;
- GA is confirmed to be shipping everything, about 2 business days late.

*Reasoning, not a stated fact:* option 3's benefit lasts only until Monday, so the later it ships, the less it is worth against the risk of a routing bug.

**Why the others are weaker:**

- **Option 1** costs ~14.7× option 3 per day (Priya-based estimate). By Priya's figures it makes ~70% of affected customers no faster. With NV unavailable it strands MAG orders: PARTNER rises from 6 to 12 in today's sample.
- **Option 4** sends orders to a warehouse that, per Marco, cannot ship anything until at least next week. Never acceptable.

---

## Check against the assessment instructions

| Instruction (verbatim) | How it is handled |
|---|---|
| "Use your Part A results and `ops-notes.md`" | Part A results are the baseline and kept separate (reconciliation table). Every adjustment traces to a quoted ops note. |
| Q1: "Answer for the router as it runs today, plus anything in the ops notes that affects where an order can ship." | Part A result, plus NV unavailable (Marco). GA is treated as able to ship (Keisha: "Everything is going out"). |
| Q1: "Don't apply your answer to **question 4** here; that's a separate decision." | **Unresolved numbering inconsistency, not resolved silently.** Part B contains only questions 1 and 2. I **assume** it means question 2, because question 2 is the only other decision and concerns GA routing. No question 2 decision is applied in Q1. The sensitivity table shows what would change otherwise. |
| Q1 choices: WH-NJ, WH-GA, WH-NV, WH-TX, Partner warehouse, Hold for a person to decide | Every answer uses one of these. WH-NV is never chosen (cannot ship). WH-TX is never chosen (disabled). |
| Q2: "What do you ship?" with four options | Option 3, conditional on safe implementation, with option 2 as the fallback. Options 1 and 4 are rejected with reasons. |

---

## Open questions for the operations team

1. **Numbering:** does "question 4" in the Q1 instructions mean question 2, or something else?
2. **#2033 and #2045:** who may approve data corrections (ZIP `2134` → `02134`, SKU `nw-mag-90` → `NW-MAG-90`)? Should such orders be held, or sent to PARTNER as rules 2 and 7 say?
3. **NV reassignment:** should orders the live router sent to NV be re-routed in creation order (#2051 → GA, #2056 → PARTNER), or reassigned on top of today's existing reservations (#2051 → NJ, #2056 stays at GA)?
4. **Priya's 70/30:** were NV and TX counted as alternatives? With NV down, what share of GA orders have **no** domestic alternative?
5. **WH-NJ capacity:** can NJ absorb diverted volume? It holds 2 units of NW-MAG-90. Is a restock coming before Monday?
6. **NV config:** when will IT disable WH-NV? Part A sent five of today's orders there: #2036, #2038, #2043, #2051, #2052.
7. **WH-TX:** why is it disabled, and is it an option this week? It holds 500 units of each product with velocity 0. The files give no reason.
8. **Days:** are Keisha's "2 business days" and Priya's "2 more days in transit" directly comparable?
