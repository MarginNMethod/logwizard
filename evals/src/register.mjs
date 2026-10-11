// Lets plain `node` (which strips TypeScript types natively) run the repo's TypeScript
// sources, which import siblings with a ".js" suffix (for example "./limits.js" -> limits.ts).
// No packages are needed. Usage: node --import ./src/register.mjs src/run.ts
import * as nodeModule from "node:module";

function resolve(specifier, context, nextResolve) {
  try {
    return nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      return nextResolve(specifier.slice(0, -3) + ".ts", context);
    }
    throw error;
  }
}

nodeModule.registerHooks({ resolve });
