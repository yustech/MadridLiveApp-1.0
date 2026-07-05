import { execFileSync, spawn } from "node:child_process";

const DEFAULT_DEV_PORT = "5173";
const PROTECTED_SERVICE = process.env.PROTECTED_SERVICE_NAME || "madridlive-app.service";

function isProtectedServiceActive() {
  if (process.platform !== "linux") {
    return false;
  }

  try {
    execFileSync("systemctl", ["is-active", "--quiet", PROTECTED_SERVICE], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

if (!process.env.ALLOW_PROD_DEV && isProtectedServiceActive()) {
  console.error(
    `[safe-dev] Refusing to start dev server because ${PROTECTED_SERVICE} is active on this host. ` +
      "Use ALLOW_PROD_DEV=1 only for emergency debugging.",
  );
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || DEFAULT_DEV_PORT,
};

const child = spawn("tsx", ["server.ts"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
