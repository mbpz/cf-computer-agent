import { registry, verifyReport } from "./evidence.mjs";
import { clean, preflight, prepare, serve, verify, verifyClean } from "./local.mjs";

const [command = "help", ...args] = process.argv.slice(2);
const commands = {
  plan: [0, () => registry], preflight: [0, preflight], prepare: [1, prepare],
  serve: [1, serve], verify: [1, verify], clean: [1, clean], "verify-clean": [1, verifyClean], "verify-report": [1, verifyReport],
};
try {
  if (command === "help" && args.length === 0) {
    console.log("npm run acceptance -- <plan|preflight|prepare pagination/recovery|serve UUID|verify UUID|clean UUID|verify-clean UUID|verify-report PATH>");
  } else {
    if (!Object.hasOwn(commands, command) || args.length !== commands[command][0]) throw new Error("Unknown command or wrong argument count; use help");
    console.log(JSON.stringify(await commands[command][1](...args), null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
