# Natura Wellness order router (Part A)

Routes every order in `orders.json` to one warehouse (or `PARTNER`) and writes one line per order to `routes.txt`.

## Run

Requires Node ≥ 22.18 (runs the `.ts` files directly; no build step). Tested on Node 24.11.

```sh
npm install        # typescript + @types/node, only for the typecheck
npm start          # prints the routes and writes routes.txt
npm test           # unit tests + full-data integration test
npm run typecheck  # tsc --noEmit
```

`npm test` also checks that the `routes.txt` on disk matches the expected output, so run `npm start` first after any change.

## Layout

| File | Purpose |
|---|---|
| `src/router.ts` | All routing logic as pure functions (no I/O, clock or randomness) |
| `src/inputs.ts` | Reads the four JSON input files |
| `src/main.ts` | Runs the router, writes `routes.txt`, prints warnings to stderr |
| `test/router.test.ts` | Unit tests with small inline fixtures, including boundary cases |
| `test/full-data.test.ts` | Exact expected `routes.txt`, final stock, and the #2041 edit regression |

The input files are read only and never modified. `ops-notes.md` is **not** used in Part A.

## How it works

1. **Build orders.** Each `order_created` becomes an order. Each `order_edited` appends its `addedLines` to that order if it happened 0–30 minutes (inclusive) after creation. Edits are matched by order number, so file position does not matter.
2. **Sort** orders by `order_created.at`. Equal timestamps keep file order.
3. **Route each order once**, in that order:
   - Rule 1: `country` must be exactly `"US"`, otherwise PARTNER.
   - Rule 2: the ZIP must be present. Its first three characters must be a prefix listed in `zones.json`, otherwise PARTNER.
   - Bundles are expanded into components, and units are summed per SKU (a bundle plus a separate line for the same product counts both).
   - Rule 3: a warehouse can take the order if it is `enabled`, has a zone for the prefix, and has `available ≥ quantity` for every SKU.
   - Rules 4–6: lowest zone, then highest order cover (the smallest `available ÷ dailyVelocity` across the order's products, using stock before this order), then WH-NJ > WH-GA > WH-NV > WH-TX. Comparisons are explicit (`<`/`>`), never subtraction, so `Infinity` is handled correctly.
   - Rule 7: no warehouse can take it → PARTNER.
4. **Reserve** the order's units at the chosen warehouse only after it is chosen. PARTNER orders reserve nothing. Stock is changed on a copy only.

## Output

`<order> <warehouse> zone <n>` or `<order> PARTNER <reason>`. When the zone was tied, a note says which rule decided it.

| PARTNER reason | Meaning |
|---|---|
| `international (country XX)` | Rule 1 |
| `missing country` | Destination cannot be confirmed as US (defensive, see A6) |
| `no ZIP` | Rule 2: ZIP missing or empty |
| `invalid ZIP … (…, expected a string; not padded)` | ZIP is present but not a string (see A1) |
| `unknown ZIP prefix NNN` | Rule 2 |
| `unknown SKU X` (+ case-mismatch hint) | Rule 7: no warehouse can stock an unknown SKU (see A2, A10) |
| `no enabled warehouse has stock for the whole order` | Rule 7 |
| `invalid quantity …` / `order has no lines` | Defensive (see A8) |

## Decisions and assumptions

Part A applies the rules to the files **exactly as given**. Inputs are never corrected silently. Where a value can't be used as is, the order goes to PARTNER with a reason that names the problem.

| # | Decision / assumption | In the supplied data? | Effect |
|---|---|---|---|
| A1 | A ZIP that is not a string is invalid → PARTNER. It is **not** padded with leading zeros. | **Yes**: #2033 has `"zip": 2134` (a JSON number, state MA) | #2033 → PARTNER. Reading "213" literally would also give PARTNER, so only the reason text depends on this. If padded to "02134" it would be WH-NJ zone 3 |
| A2 | SKUs are matched **exactly** (case-sensitive, no trimming). The reason includes a hint when only the case differs. | **Yes**: #2045 has `nw-mag-90` | #2045 → PARTNER. If normalised it would be WH-GA zone 3. Neither choice changes any other order |
| A3 | The 30-minute window includes exactly 30:00. Late edits, edits for unknown orders, edits without `addedLines` and unknown event types are not applied, and a warning goes to stderr. Edits can only add lines (the only schema in the data). Several edits are appended in time order. | One edit (#2041, +18 min), applied | #2041 ships whole from WH-GA, which changes #2050 and #2056 (see regression test) |
| A4 | Cover uses `available` before this order's own units are reserved. | Yes (3 zone ties) | None: all three ties have the same winner either way |
| A5 | `dailyVelocity` of 0 or missing → unlimited cover (`Infinity`). A missing inventory entry → 0 available. `enabled` must be exactly `true`. | Velocity 0 only at WH-TX, which is disabled | None |
| A6 | Missing country → PARTNER, because the destination cannot be confirmed as US. | No (defensive) | None |
| A7 | Duplicate `order_created` → first kept, warning. An unparseable timestamp stops the run with an error, because the order sequence would be unknown. | No (defensive) | None |
| A8 | A quantity that is not a positive whole number, or an order with no lines → PARTNER. | No (defensive) | None |
| A9 | A ZIP prefix is "known" if any warehouse lists it in `zones.json`. A warehouse with no zone for the prefix can't take the order. ZIP format is not checked beyond the first three characters (e.g. `07030-1834` → `070`). | All warehouses list the same 13 prefixes | None |
| A10 | **Implementation assumption (not required by the assessment):** a SKU must exist in `catalog.json` (as a product or bundle) for the order to be routable. An unknown SKU sends the order to PARTNER even if a warehouse happens to list that SKU in its inventory. Rule 3 itself only refers to warehouse stock; the catalog is used here as the source of truth for valid SKUs. A non-numeric or `NaN` `available` value is treated as not enough stock. | No: every inventory key is one of the 3 catalog products, and all stock values are numbers | None |

## Result on the supplied data

26 orders: WH-GA 11, WH-NJ 5, WH-NV 5, PARTNER 5 (#2033 invalid ZIP, #2037 Canada, #2042 Hawaii prefix 968, #2045 unknown SKU, #2046 no ZIP).
