// Order router for Part A. Pure functions only: no file I/O, no clock, no randomness.

export type Line = { sku: string; quantity: number };
export type ShipTo = { country?: unknown; state?: unknown; zip?: unknown };
export type OrderEvent = {
  type: string;
  orderNumber: string;
  at: string;
  shipTo?: ShipTo;
  lines?: Line[];
  addedLines?: Line[];
};
export type InventoryItem = { available: number; dailyVelocity?: number };
export type Warehouse = { code: string; city?: string; enabled: boolean; inventory: Record<string, InventoryItem> };
// zones.json also carries a "_note" string next to the per-warehouse tables.
export type Zones = Record<string, Record<string, number> | string>;
export type Catalog = {
  products: { sku: string }[];
  bundles: { sku: string; components: Line[] }[];
};

export type Order = { orderNumber: string; createdAt: number; index: number; shipTo: ShipTo; lines: Line[] };
export type Route = { orderNumber: string; destination: string; reason: string };
export type Candidate = { code: string; zone: number; cover: number };

export const PARTNER = "PARTNER";
export const PRIORITY = ["WH-NJ", "WH-GA", "WH-NV", "WH-TX"];
export const EDIT_WINDOW_MS = 30 * 60 * 1000;

function parseTime(at: string, label: string): number {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) throw new Error(`invalid timestamp ${JSON.stringify(at)} on ${label}`);
  return ms;
}

// Folds order_edited events into their orders, then returns orders in creation order.
export function buildOrders(events: OrderEvent[]): { orders: Order[]; warnings: string[] } {
  const warnings: string[] = [];
  const byNumber = new Map<string, Order>();
  const edits: { event: OrderEvent; at: number; index: number }[] = [];

  events.forEach((event, index) => {
    if (event.type === "order_created") {
      if (byNumber.has(event.orderNumber)) {
        warnings.push(`duplicate order_created for ${event.orderNumber} ignored (first one kept)`);
        return;
      }
      byNumber.set(event.orderNumber, {
        orderNumber: event.orderNumber,
        createdAt: parseTime(event.at, event.orderNumber),
        index,
        shipTo: event.shipTo ?? {},
        lines: [...(event.lines ?? [])],
      });
    } else if (event.type === "order_edited") {
      edits.push({ event, at: parseTime(event.at, `edit of ${event.orderNumber}`), index });
    } else {
      warnings.push(`unknown event type ${JSON.stringify(event.type)} at position ${index} ignored`);
    }
  });

  // Multiple edits to one order are appended in the order they happened.
  edits.sort((a, b) => (a.at !== b.at ? (a.at < b.at ? -1 : 1) : a.index - b.index));
  for (const { event, at } of edits) {
    const order = byNumber.get(event.orderNumber);
    if (!order) {
      warnings.push(`edit for unknown order ${event.orderNumber} ignored`);
      continue;
    }
    const elapsed = at - order.createdAt;
    if (elapsed < 0 || elapsed > EDIT_WINDOW_MS) {
      warnings.push(`edit of ${event.orderNumber} at ${event.at} is outside the 30-minute window; not applied`);
      continue;
    }
    if (!Array.isArray(event.addedLines)) {
      warnings.push(`edit of ${event.orderNumber} has no addedLines; ignored`);
      continue;
    }
    order.lines.push(...event.addedLines);
  }

  const orders = [...byNumber.values()].sort((a, b) =>
    a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? -1 : 1) : a.index - b.index,
  );
  return { orders, warnings };
}

// Rules 1 and 2. Values are used exactly as given: no trimming, case folding or ZIP padding.
export function checkAddress(shipTo: ShipTo, knownPrefixes: Set<string>): { prefix: string } | { reason: string } {
  const { country, zip } = shipTo;
  if (country === undefined || country === null || country === "") return { reason: "missing country" };
  if (country !== "US") return { reason: `international (country ${String(country)})` };
  if (zip === undefined || zip === null || zip === "") return { reason: "no ZIP" };
  if (typeof zip !== "string") {
    return { reason: `invalid ZIP ${JSON.stringify(zip)} (${typeof zip}, expected a string; not padded)` };
  }
  const prefix = zip.slice(0, 3);
  if (!knownPrefixes.has(prefix)) return { reason: `unknown ZIP prefix ${prefix}` };
  return { prefix };
}

function unknownSkuReason(sku: unknown, catalog: Catalog): string {
  const lower = String(sku).toLowerCase();
  const match = [...catalog.products, ...catalog.bundles].find((p) => p.sku.toLowerCase() === lower);
  return `unknown SKU ${String(sku)}` + (match ? ` (case differs from catalog SKU ${match.sku})` : "");
}

// Expands bundles into components and sums units per product SKU.
export function requiredStock(lines: Line[], catalog: Catalog): { need: Map<string, number> } | { reason: string } {
  if (lines.length === 0) return { reason: "order has no lines" };
  const need = new Map<string, number>();
  const add = (sku: string, quantity: number) => need.set(sku, (need.get(sku) ?? 0) + quantity);

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return { reason: `invalid quantity ${JSON.stringify(line.quantity)} for ${String(line.sku)}` };
    }
    const bundle = catalog.bundles.find((b) => b.sku === line.sku);
    if (bundle) {
      for (const component of bundle.components) add(component.sku, component.quantity * line.quantity);
    } else if (catalog.products.some((p) => p.sku === line.sku)) {
      add(line.sku, line.quantity);
    } else {
      // No warehouse can stock an unknown SKU, so rule 7 applies.
      return { reason: unknownSkuReason(line.sku, catalog) };
    }
  }
  return { need };
}

// Velocity of 0 (or missing) means the stock is not being drawn down: unlimited cover.
export function daysOfCover(available: number, dailyVelocity: number | undefined): number {
  return typeof dailyVelocity === "number" && dailyVelocity > 0 ? available / dailyVelocity : Infinity;
}

function priorityRank(code: string): number {
  const rank = PRIORITY.indexOf(code);
  return rank === -1 ? PRIORITY.length : rank;
}

// Rules 4-6: lowest zone, then most days of cover, then fixed warehouse priority.
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.zone !== b.zone) return a.zone < b.zone ? -1 : 1;
  if (a.cover !== b.cover) return a.cover > b.cover ? -1 : 1;
  const ra = priorityRank(a.code);
  const rb = priorityRank(b.code);
  if (ra !== rb) return ra < rb ? -1 : 1;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

function zoneFor(zones: Zones, code: string, prefix: string): number | undefined {
  const table = zones[code];
  if (typeof table !== "object") return undefined;
  const zone = table[prefix];
  return typeof zone === "number" ? zone : undefined;
}

export function knownPrefixes(zones: Zones): Set<string> {
  const prefixes = new Set<string>();
  for (const table of Object.values(zones)) {
    if (typeof table === "object") for (const prefix of Object.keys(table)) prefixes.add(prefix);
  }
  return prefixes;
}

export type RouteResult = {
  routes: Route[];
  warnings: string[];
  remaining: Record<string, Record<string, number>>;
};

export function routeAll(events: OrderEvent[], warehouses: Warehouse[], zones: Zones, catalog: Catalog): RouteResult {
  const { orders, warnings } = buildOrders(events);
  const stock = structuredClone(warehouses); // never mutate the caller's data
  const prefixes = knownPrefixes(zones);
  const routes: Route[] = [];
  const partner = (order: Order, reason: string) =>
    routes.push({ orderNumber: order.orderNumber, destination: PARTNER, reason });

  for (const order of orders) {
    const address = checkAddress(order.shipTo, prefixes);
    if ("reason" in address) {
      partner(order, address.reason);
      continue;
    }
    const required = requiredStock(order.lines, catalog);
    if ("reason" in required) {
      partner(order, required.reason);
      continue;
    }

    // Rule 3: enabled, ships to this prefix, and has enough stock for every item.
    const candidates: Candidate[] = [];
    for (const wh of stock) {
      if (wh.enabled !== true) continue;
      const zone = zoneFor(zones, wh.code, address.prefix);
      if (zone === undefined) continue;
      let cover = Infinity;
      let eligible = true;
      for (const [sku, quantity] of required.need) {
        const item = wh.inventory[sku];
        const available = typeof item?.available === "number" ? item.available : 0;
        // Written as !(>=) so a NaN stock value is rejected rather than slipping through `<`.
        if (!(available >= quantity)) {
          eligible = false;
          break;
        }
        cover = Math.min(cover, daysOfCover(available, item.dailyVelocity));
      }
      if (eligible) candidates.push({ code: wh.code, zone, cover });
    }

    if (candidates.length === 0) {
      partner(order, "no enabled warehouse has stock for the whole order");
      continue;
    }

    candidates.sort(compareCandidates);
    const [best, runnerUp] = candidates;
    let note = "";
    if (runnerUp && runnerUp.zone === best.zone) {
      note = runnerUp.cover === best.cover ? " (tie on zone and cover; warehouse priority)" : " (tie on zone; most days of cover)";
    }

    // Reserve only after the warehouse is chosen; the whole order ships from it.
    const chosen = stock.find((wh) => wh.code === best.code)!;
    for (const [sku, quantity] of required.need) chosen.inventory[sku].available -= quantity;
    routes.push({ orderNumber: order.orderNumber, destination: best.code, reason: `zone ${best.zone}${note}` });
  }

  const remaining = Object.fromEntries(
    stock.map((wh) => [wh.code, Object.fromEntries(Object.entries(wh.inventory).map(([sku, i]) => [sku, i.available]))]),
  );
  return { routes, warnings, remaining };
}

export function formatRoutes(routes: Route[]): string {
  return routes.map((r) => `${r.orderNumber} ${r.destination} ${r.reason}`).join("\n") + "\n";
}
