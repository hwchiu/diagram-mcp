import { ARCHITECTURE_SPECS } from "../../src/showcase/architecture.js";
import { layoutArchitecture } from "../../src/layout/grid.js";
const make = (ARCHITECTURE_SPECS as any)[process.argv[2]];
layoutArchitecture(make());
