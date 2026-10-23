import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadInputs, PROJECT_ROOT } from "../src/inputs.ts";
import { formatRoutes, routeAll } from "../src/router.ts";

// Expected routes.txt for the supplied files, applying the rules literally (no ZIP padding, exact SKUs).
const EXPECTED = `#2031 WH-NJ zone 1
#2032 WH-GA zone 1
#2033 PARTNER invalid ZIP 2134 (number, expected a string; not padded)
#2034 WH-GA zone 5 (tie on zone; most days of cover)
#2035 WH-GA zone 4
#2036 WH-NV zone 2
#2037 PARTNER international (country CA)
#2038 WH-NV zone 4
#2039 WH-NJ zone 1
#2040 WH-GA zone 5
#2041 WH-GA zone 7
#2042 PARTNER unknown ZIP prefix 968
#2043 WH-NV zone 3
#2044 WH-GA zone 6
#2045 PARTNER unknown SKU nw-mag-90 (case differs from catalog SKU NW-MAG-90)
#2046 PARTNER no ZIP
#2047 WH-GA zone 4
#2048 WH-NJ zone 5 (tie on zone; most days of cover)
#2049 WH-GA zone 4
#2050 WH-NJ zone 5
#2051 WH-NV zone 2
#2052 WH-NV zone 5
#2053 WH-NJ zone 2
#2054 WH-GA zone 4
#2055 WH-GA zone 8 (tie on zone; most days of cover)
#2056 WH-GA zone 5
`;

const route = (inputs = loadInputs()) => routeAll(inputs.events, inputs.warehouses, inputs.zones, inputs.catalog);

describe("full supplied data", () => {
  it("produces exactly the expected routes.txt content", () => {
    const result = route();
    assert.equal(formatRoutes(result.routes), EXPECTED);
    assert.deepEqual(result.warnings, []);
  });

  it("matches the routes.txt committed next to the inputs (run `npm start` to regenerate)", () => {
    assert.equal(readFileSync(join(PROJECT_ROOT, "routes.txt"), "utf8"), EXPECTED);
  });

  it("is deterministic and leaves the loaded inputs untouched", () => {
    const inputs = loadInputs();
    const before = structuredClone(inputs);
    const first = formatRoutes(route(inputs).routes);
    const second = formatRoutes(route(inputs).routes);
    assert.equal(first, second);
    assert.deepEqual(inputs, before);
  });

  it("ends with the expected remaining stock", () => {
    assert.deepEqual(route().remaining, {
      "WH-NJ": { "NW-VITD-60": 396, "NW-MULTI-30": 119, "NW-MAG-90": 0 },
      "WH-GA": { "NW-VITD-60": 0, "NW-MULTI-30": 293, "NW-MAG-90": 145 },
      "WH-NV": { "NW-VITD-60": 198, "NW-MULTI-30": 0, "NW-MAG-90": 216 },
      "WH-TX": { "NW-VITD-60": 500, "NW-MULTI-30": 500, "NW-MAG-90": 500 },
    });
  });
});

describe("regression: the #2041 edit changes later reservations", () => {
  const withEdit = route();
  const inputs = loadInputs();
  const withoutEdit = route({ ...inputs, events: inputs.events.filter((e) => e.type !== "order_edited") });
  const byOrder = (r: typeof withEdit) => new Map(r.routes.map((x) => [x.orderNumber, `${x.destination} ${x.reason}`]));

  it("routes #2041 once, with its added MULTI, at its creation slot", () => {
    // NV has no NW-MULTI-30, so the edited order cannot go to NV.
    assert.equal(byOrder(withEdit).get("#2041"), "WH-GA zone 7");
    assert.equal(withEdit.routes.filter((r) => r.orderNumber === "#2041").length, 1);
  });

  it("changes exactly #2041, #2050 and #2056 compared with ignoring the edit", () => {
    const a = byOrder(withEdit);
    const b = byOrder(withoutEdit);
    const changed = [...a.keys()].filter((k) => a.get(k) !== b.get(k));
    assert.deepEqual(changed, ["#2041", "#2050", "#2056"]);

    // Without the edit, #2041 takes NV's VITD, so GA still has 2 VITD when #2050 (needs 2) arrives.
    assert.equal(b.get("#2041"), "WH-NV zone 2");
    assert.equal(b.get("#2050"), "WH-GA zone 1");
    assert.equal(b.get("#2056"), "WH-NV zone 8");
    // With the edit, #2041 uses one of GA's VITD; GA has only 1 left, so #2050 goes to NJ, and #2056 gets GA's last unit.
    assert.equal(a.get("#2050"), "WH-NJ zone 5");
    assert.equal(a.get("#2056"), "WH-GA zone 5");
  });

  it("leaves different stock behind", () => {
    assert.deepEqual(withoutEdit.remaining["WH-NJ"], { "NW-VITD-60": 398, "NW-MULTI-30": 119, "NW-MAG-90": 0 });
    assert.deepEqual(withoutEdit.remaining["WH-GA"], { "NW-VITD-60": 0, "NW-MULTI-30": 294, "NW-MAG-90": 146 });
    assert.deepEqual(withoutEdit.remaining["WH-NV"], { "NW-VITD-60": 196, "NW-MULTI-30": 0, "NW-MAG-90": 215 });
  });
});
