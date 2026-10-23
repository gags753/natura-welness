import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareCandidates,
  routeAll,
  type Candidate,
  type Catalog,
  type Line,
  type OrderEvent,
  type RouteResult,
  type ShipTo,
  type Warehouse,
  type Zones,
} from "../src/router.ts";

// ---- fixtures -------------------------------------------------------------

const T0 = Date.UTC(2026, 9, 20, 13, 0, 0);
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const us = (zip: unknown = "10001"): ShipTo => ({ country: "US", state: "NY", zip });

const created = (orderNumber: string, seconds: number, lines: Line[], shipTo: ShipTo = us()): OrderEvent => ({
  type: "order_created",
  orderNumber,
  at: at(seconds),
  shipTo,
  lines,
});
const edited = (orderNumber: string, seconds: number, addedLines: Line[]): OrderEvent => ({
  type: "order_edited",
  orderNumber,
  at: at(seconds),
  addedLines,
});
const A = (quantity = 1): Line => ({ sku: "A", quantity });
const B = (quantity = 1): Line => ({ sku: "B", quantity });
const AB = (quantity = 1): Line => ({ sku: "AB", quantity });

// inventory: sku -> [available, dailyVelocity?]
const wh = (code: string, inventory: Record<string, [number, number?]>, enabled = true): Warehouse => ({
  code,
  enabled,
  inventory: Object.fromEntries(
    Object.entries(inventory).map(([sku, [available, dailyVelocity]]) => [
      sku,
      dailyVelocity === undefined ? { available } : { available, dailyVelocity },
    ]),
  ),
});

const catalog: Catalog = {
  products: [{ sku: "A" }, { sku: "B" }],
  bundles: [{ sku: "AB", components: [{ sku: "A", quantity: 1 }, { sku: "B", quantity: 1 }] }],
};

// Prefix "100": NJ 1, GA 2, NV 3, TX 4.
const zones: Zones = {
  _note: "test zones",
  "WH-NJ": { "100": 1, "021": 3 },
  "WH-GA": { "100": 2, "021": 3 },
  "WH-NV": { "100": 3, "021": 3 },
  "WH-TX": { "100": 4, "021": 3 },
};
// Every warehouse is zone 1 for "100".
const flatZones: Zones = { "WH-NJ": { "100": 1 }, "WH-GA": { "100": 1 }, "WH-NV": { "100": 1 }, "WH-TX": { "100": 1 } };

const run = (events: OrderEvent[], warehouses: Warehouse[], z: Zones = zones) => routeAll(events, warehouses, z, catalog);
const lines = (result: RouteResult) => result.routes.map((r) => `${r.orderNumber} ${r.destination} ${r.reason}`);

// ---- tests ----------------------------------------------------------------

describe("order edits", () => {
  const stock = () => [wh("WH-NJ", { A: [100, 1], B: [0, 1] }), wh("WH-GA", { A: [100, 1], B: [100, 1] })];

  it("applies an in-window edit before routing, so the order ships whole", () => {
    const result = run([created("#1", 0, [A()]), edited("#1", 600, [B()])], stock());
    assert.deepEqual(lines(result), ["#1 WH-GA zone 2"]);
    assert.deepEqual(result.remaining["WH-GA"], { A: 99, B: 99 });
    assert.deepEqual(result.remaining["WH-NJ"], { A: 100, B: 0 });
  });

  it("applies an edit at exactly 30:00 but not one at 30:01", () => {
    const result = run(
      [created("#1", 0, [A()]), created("#2", 10, [A()]), edited("#1", 1800, [B()]), edited("#2", 10 + 1801, [B()])],
      stock(),
    );
    assert.deepEqual(lines(result), ["#1 WH-GA zone 2", "#2 WH-NJ zone 1"]);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /#2 .*outside the 30-minute window/);
  });

  it("ignores an edit for an unknown order, with a warning", () => {
    const result = run([created("#1", 0, [A()]), edited("#9", 60, [B()])], stock());
    assert.deepEqual(lines(result), ["#1 WH-NJ zone 1"]);
    assert.deepEqual(result.warnings, ["edit for unknown order #9 ignored"]);
  });

  it("applies an edit that appears before its order in the file", () => {
    const result = run([edited("#1", 600, [B()]), created("#1", 0, [A()])], stock());
    assert.deepEqual(lines(result), ["#1 WH-GA zone 2"]);
  });

  it("combines multiple edits by appending their lines", () => {
    const warehouses = [wh("WH-GA", { A: [10, 1], B: [1, 1] }), wh("WH-NV", { A: [10, 1], B: [2, 1] })];
    const result = run([created("#1", 0, [A()]), edited("#1", 300, [B()]), edited("#1", 600, [B()])], warehouses);
    assert.deepEqual(lines(result), ["#1 WH-NV zone 3"]);
    assert.deepEqual(result.remaining["WH-NV"], { A: 9, B: 0 });
  });
});

describe("routing order", () => {
  const stock = () => [wh("WH-NJ", { A: [1, 1] }), wh("WH-GA", { A: [10, 1] })];

  it("routes by creation time, not file position, and the earlier order reserves first", () => {
    const result = run([created("#late", 60, [A()]), created("#early", 0, [A()])], stock());
    assert.deepEqual(lines(result), ["#early WH-NJ zone 1", "#late WH-GA zone 2"]);
  });

  it("keeps file order when creation times are equal", () => {
    const result = run([created("#x", 0, [A()]), created("#y", 0, [A()])], stock());
    assert.deepEqual(lines(result), ["#x WH-NJ zone 1", "#y WH-GA zone 2"]);
  });

  it("keeps the first of duplicate order_created events, with a warning", () => {
    const result = run([created("#1", 0, [A(1)]), created("#1", 10, [A(5)])], stock());
    assert.deepEqual(lines(result), ["#1 WH-NJ zone 1"]);
    assert.match(result.warnings[0], /duplicate order_created for #1/);
  });
});

describe("bundles", () => {
  it("multiplies component quantities by the bundle quantity", () => {
    const warehouses = [wh("WH-NJ", { A: [2, 1], B: [1, 1] }), wh("WH-GA", { A: [2, 1], B: [2, 1] })];
    const result = run([created("#1", 0, [AB(2)])], warehouses);
    assert.deepEqual(lines(result), ["#1 WH-GA zone 2"]);
    assert.deepEqual(result.remaining["WH-GA"], { A: 0, B: 0 });
  });

  it("sums a bundle component with a separate line for the same SKU", () => {
    const warehouses = [wh("WH-NJ", { A: [1, 1], B: [5, 1] }), wh("WH-GA", { A: [2, 1], B: [1, 1] })];
    const result = run([created("#1", 0, [AB(), A()])], warehouses);
    assert.deepEqual(lines(result), ["#1 WH-GA zone 2"]);
  });
});

describe("address rules", () => {
  const stock = () => [wh("WH-NJ", { A: [10, 1] })];
  const one = (shipTo: ShipTo) => lines(run([created("#1", 0, [A()], shipTo)], stock()))[0];

  it("sends non-US orders to PARTNER", () => {
    assert.equal(one({ country: "CA", state: "ON", zip: "M5V 2T6" }), "#1 PARTNER international (country CA)");
  });

  it("sends a missing country to PARTNER (defensive)", () => {
    assert.equal(one({ state: "NY", zip: "10001" }), "#1 PARTNER missing country");
  });

  it("sends an empty or missing ZIP to PARTNER", () => {
    assert.equal(one(us("")), "#1 PARTNER no ZIP");
    assert.equal(one({ country: "US", state: "NY" }), "#1 PARTNER no ZIP");
  });

  it("does not pad a numeric ZIP, even when the padded prefix would exist", () => {
    const result = run([created("#1", 0, [A()], us(2134))], [wh("WH-NJ", { A: [10, 1] })]);
    assert.deepEqual(lines(result), ["#1 PARTNER invalid ZIP 2134 (number, expected a string; not padded)"]);
    assert.deepEqual(result.remaining["WH-NJ"], { A: 10 });
  });

  it("uses the first three characters of a ZIP+4", () => {
    assert.equal(one(us("10001-1234")), "#1 WH-NJ zone 1");
  });

  it("sends an unknown prefix to PARTNER", () => {
    assert.equal(one(us("96815")), "#1 PARTNER unknown ZIP prefix 968");
    assert.equal(one(us("M5V 2T6")), "#1 PARTNER unknown ZIP prefix M5V");
  });

  it("checks only the prefix, with no extra ZIP format rules", () => {
    assert.equal(one(us("100")), "#1 WH-NJ zone 1");
  });
});

describe("eligibility", () => {
  it("accepts available == quantity and rejects one unit short", () => {
    const stock = () => [wh("WH-NJ", { A: [3, 1] }), wh("WH-GA", { A: [10, 1] })];
    assert.deepEqual(lines(run([created("#1", 0, [A(3)])], stock())), ["#1 WH-NJ zone 1"]);
    assert.deepEqual(lines(run([created("#1", 0, [A(4)])], stock())), ["#1 WH-GA zone 2"]);
  });

  it("skips a disabled warehouse even when it is closest and fully stocked", () => {
    const z: Zones = { "WH-TX": { "100": 1 }, "WH-GA": { "100": 2 } };
    const warehouses = [wh("WH-TX", { A: [100, 0] }, false), wh("WH-GA", { A: [10, 1] })];
    assert.deepEqual(lines(run([created("#1", 0, [A()])], warehouses, z)), ["#1 WH-GA zone 2"]);
  });

  it("sends the order to PARTNER without reserving when no warehouse has everything", () => {
    const warehouses = [wh("WH-NJ", { A: [5, 1], B: [0, 1] }), wh("WH-GA", { A: [0, 1], B: [5, 1] })];
    const result = run([created("#1", 0, [A(), B()])], warehouses);
    assert.deepEqual(lines(result), ["#1 PARTNER no enabled warehouse has stock for the whole order"]);
    assert.deepEqual(result.remaining, { "WH-NJ": { A: 5, B: 0 }, "WH-GA": { A: 0, B: 5 } });
  });

  it("treats a missing inventory entry as zero available", () => {
    const warehouses = [wh("WH-NJ", {}), wh("WH-GA", { A: [10, 1] })];
    assert.deepEqual(lines(run([created("#1", 0, [A()])], warehouses)), ["#1 WH-GA zone 2"]);
  });

  it("rejects a warehouse whose available stock is NaN", () => {
    const warehouses = [wh("WH-NJ", { A: [NaN, 1] }), wh("WH-GA", { A: [10, 1] })];
    const result = run([created("#1", 0, [A()])], warehouses);
    assert.deepEqual(lines(result), ["#1 WH-GA zone 2"]);
    assert.ok(Number.isNaN(result.remaining["WH-NJ"].A));
  });
});

describe("tie-breakers", () => {
  it("prefers a lower zone over a higher cover", () => {
    const warehouses = [wh("WH-NJ", { A: [1, 100] }), wh("WH-GA", { A: [1000, 1] })];
    assert.deepEqual(lines(run([created("#1", 0, [A()])], warehouses)), ["#1 WH-NJ zone 1"]);
  });

  it("breaks a zone tie by most days of cover", () => {
    const warehouses = [wh("WH-NJ", { A: [10, 10] }), wh("WH-GA", { A: [20, 10] })];
    assert.deepEqual(lines(run([created("#1", 0, [A()])], warehouses, flatZones)), [
      "#1 WH-GA zone 1 (tie on zone; most days of cover)",
    ]);
  });

  it("uses the smallest product cover as the order's cover", () => {
    // NJ: A 100 days, B 1 day -> 1. GA: A 5, B 5 -> 5.
    const warehouses = [wh("WH-NJ", { A: [100, 1], B: [1, 1] }), wh("WH-GA", { A: [5, 1], B: [5, 1] })];
    assert.deepEqual(lines(run([created("#1", 0, [A(), B()])], warehouses, flatZones)), [
      "#1 WH-GA zone 1 (tie on zone; most days of cover)",
    ]);
  });

  it("breaks a zone and cover tie by NJ, GA, NV, TX regardless of file order", () => {
    const all = ["WH-TX", "WH-NV", "WH-GA", "WH-NJ"];
    const pick = (codes: string[]) =>
      run([created("#1", 0, [A()])], codes.map((code) => wh(code, { A: [10, 2] })), flatZones).routes[0].destination;
    assert.equal(pick(all), "WH-NJ");
    assert.equal(pick(all.filter((c) => c !== "WH-NJ")), "WH-GA");
    assert.equal(pick(["WH-TX", "WH-NV"]), "WH-NV");
    assert.match(lines(run([created("#1", 0, [A()])], all.map((c) => wh(c, { A: [10, 2] })), flatZones))[0], /warehouse priority/);
  });

  it("treats zero or missing velocity as unlimited cover", () => {
    const zero = [wh("WH-NJ", { A: [1000, 1] }), wh("WH-GA", { A: [1, 0] })];
    assert.equal(run([created("#1", 0, [A()])], zero, flatZones).routes[0].destination, "WH-GA");
    const missing = [wh("WH-NJ", { A: [1000, 1] }), wh("WH-GA", { A: [1] })];
    assert.equal(run([created("#1", 0, [A()])], missing, flatZones).routes[0].destination, "WH-GA");
  });

  it("falls through to priority when both covers are unlimited", () => {
    const warehouses = [wh("WH-GA", { A: [5, 0] }), wh("WH-NJ", { A: [5, 0] })];
    assert.deepEqual(lines(run([created("#1", 0, [A()])], warehouses, flatZones)), [
      "#1 WH-NJ zone 1 (tie on zone and cover; warehouse priority)",
    ]);
  });

  it("compareCandidates orders by zone, then cover (Infinity highest), then priority", () => {
    const candidates: Candidate[] = [
      { code: "WH-TX", zone: 2, cover: Infinity },
      { code: "WH-NV", zone: 1, cover: 3 },
      { code: "WH-GA", zone: 1, cover: Infinity },
      { code: "WH-NJ", zone: 1, cover: Infinity },
      { code: "WH-XX", zone: 1, cover: 3 },
    ];
    assert.deepEqual(
      [...candidates].sort(compareCandidates).map((c) => c.code),
      ["WH-NJ", "WH-GA", "WH-NV", "WH-XX", "WH-TX"],
    );
  });
});

describe("reservation", () => {
  it("reserves stock after each assignment so later orders see less", () => {
    const warehouses = [wh("WH-NJ", { A: [2, 1] }), wh("WH-GA", { A: [10, 1] })];
    const result = run([created("#1", 0, [A()]), created("#2", 1, [A()]), created("#3", 2, [A()])], warehouses);
    assert.deepEqual(lines(result), ["#1 WH-NJ zone 1", "#2 WH-NJ zone 1", "#3 WH-GA zone 2"]);
    assert.deepEqual(result.remaining, { "WH-NJ": { A: 0 }, "WH-GA": { A: 9 } });
  });

  it("does not mutate the caller's warehouse data", () => {
    const warehouses = [wh("WH-NJ", { A: [2, 1] })];
    const before = structuredClone(warehouses);
    run([created("#1", 0, [A()])], warehouses);
    assert.deepEqual(warehouses, before);
  });
});

describe("SKUs and lines", () => {
  const stock = () => [wh("WH-NJ", { A: [10, 1] })];

  it("matches SKUs exactly and hints at a case-only mismatch", () => {
    const result = run([created("#1", 0, [{ sku: "a", quantity: 1 }])], stock());
    assert.deepEqual(lines(result), ["#1 PARTNER unknown SKU a (case differs from catalog SKU A)"]);
    assert.deepEqual(result.remaining["WH-NJ"], { A: 10 });
  });

  it("reports a truly unknown SKU without a hint", () => {
    assert.deepEqual(lines(run([created("#1", 0, [{ sku: "ZZZ", quantity: 1 }])], stock())), ["#1 PARTNER unknown SKU ZZZ"]);
  });

  it("sends invalid quantities and empty orders to PARTNER (defensive)", () => {
    assert.deepEqual(lines(run([created("#1", 0, [A(0)])], stock())), ["#1 PARTNER invalid quantity 0 for A"]);
    assert.deepEqual(lines(run([created("#1", 0, [A(1.5)])], stock())), ["#1 PARTNER invalid quantity 1.5 for A"]);
    assert.deepEqual(lines(run([created("#1", 0, [])], stock())), ["#1 PARTNER order has no lines"]);
  });
});
