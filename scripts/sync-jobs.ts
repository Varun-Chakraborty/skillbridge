import "dotenv/config";

import { syncAllSources } from "../lib/jobs/sync";

async function main() {
  const reports = await syncAllSources();

  for (const report of reports) {
    const status = report.ok ? "ok  " : "FAIL";
    const detail = report.ok
      ? `${report.written} written`
      : (report.error ?? "unknown error");
    process.stdout.write(`${status} ${report.source.padEnd(24)} ${detail}\n`);
  }

  const failed = reports.filter((r) => !r.ok);
  const written = reports.reduce((sum, r) => sum + r.written, 0);

  process.stdout.write(
    `\n${reports.length - failed.length}/${reports.length} sources ok, ${written} opportunities written\n`,
  );

  if (failed.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`sync failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
