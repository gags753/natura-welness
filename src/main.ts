import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadInputs, PROJECT_ROOT } from "./inputs.ts";
import { formatRoutes, routeAll } from "./router.ts";

const { events, warehouses, zones, catalog } = loadInputs();
const { routes, warnings } = routeAll(events, warehouses, zones, catalog);
const output = formatRoutes(routes);

for (const warning of warnings) console.error(`warning: ${warning}`);
writeFileSync(join(PROJECT_ROOT, "routes.txt"), output);
process.stdout.write(output);
