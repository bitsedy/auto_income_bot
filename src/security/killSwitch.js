// Checks for a KILL_SWITCH file in the repo. If present, exit.
import { existsSync } from "fs";
import { join } from "path";

export function checkKillSwitch() {
  const killPath = join(process.cwd(), "KILL_SWITCH");
  if (existsSync(killPath)) {
    console.log("🛑 KILL SWITCH ACTIVE. Exiting immediately.");
    process.exit(0);
  }
}
