import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Catalog, OrderEvent, Warehouse, Zones } from "./router.ts";

export const PROJECT_ROOT = join(import.meta.dirname, "..");

export type Inputs = { events: OrderEvent[]; warehouses: Warehouse[]; zones: Zones; catalog: Catalog };

export function loadInputs(dir = PROJECT_ROOT): Inputs {
  const read = (file: string) => JSON.parse(readFileSync(join(dir, file), "utf8"));
  return {
    events: read("orders.json"),
    warehouses: read("warehouses.json"),
    zones: read("zones.json"),
    catalog: read("catalog.json"),
  };
}
