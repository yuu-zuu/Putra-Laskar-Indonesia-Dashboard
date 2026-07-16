import { spawn } from "node:child_process";

const children = [
  spawn("npm", ["run", "dev:api"], { stdio: "inherit", shell: process.platform === "win32" }),
  spawn("npm", ["run", "dev:web"], { stdio: "inherit", shell: process.platform === "win32" }),
];

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 5_000).unref();
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const exitPromises = children.map(
  (child) =>
    new Promise((resolve) => {
      child.once("error", () => resolve(127));
      child.once("exit", (code, signal) => resolve(code ?? (signal === null ? 1 : 0)));
    }),
);

const firstExitCode = await Promise.race(exitPromises);
stop();
const exitCodes = await Promise.all(exitPromises);
process.exitCode = exitCodes.find((code) => code !== 0) ?? firstExitCode;
