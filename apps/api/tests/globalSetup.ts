import { execSync } from "child_process";
import path from "path";
import dotenv from "dotenv";

export default async function globalSetup(): Promise<void> {
  // Load .env from the api package and from the monorepo root.
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
  const dbUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  if (!dbUrl) return;

  try {
    // Use a Windows-style PATH + ComSpec shell so this works under Git Bash.
    const nodeBin = path.dirname(process.execPath);
    const localBin = path.resolve(process.cwd(), "../node_modules/.bin");
    const winPath = ["C:\\Windows\\System32", "C:\\Windows", nodeBin, localBin].join(";");
    // vitest runs with cwd = apps/api; keep the api package directory.
    const parts = process.cwd().split(path.sep).filter(Boolean);
    const inApiPackage = parts.slice(-2).join(path.sep) === path.join("apps", "api");
    const apiDir = inApiPackage ? process.cwd() : path.resolve(process.cwd(), "apps/api");
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        PATH: winPath,
      },
      cwd: apiDir,
      stdio: "pipe",
      shell: process.env.ComSpec || "cmd.exe",
    });
  } catch (err) {
    // If the database is unreachable, integration tests will skip themselves.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[tests] prisma db push failed (integration tests will skip): ${message.slice(0, 300)}`);
  }
}
