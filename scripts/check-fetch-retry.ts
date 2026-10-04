import "dotenv/config";

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

import { fetchJson } from "../lib/jobs/normalize";

/**
 * Exercises the retry and refusal behaviour of `fetchJson` against a real HTTP
 * server rather than a mocked `fetch`.
 *
 * Mocking would assert that the code calls `fetch` N times, which is not the
 * property that matters. What matters is that a slow or reset connection is
 * tried again, that a 404 is not, and that the budgets are independent — all of
 * which are invisible from the call site and cheap to get silently wrong.
 *
 * Every route here is a real socket, so the timeout cases genuinely abort
 * mid-flight and the reset case genuinely produces ECONNRESET, which is the
 * only honest way to test the `cause` chain walk.
 */

const TIMEOUT_MS = 250;

type Scenario = {
  path: string;
  /** Responses before the route starts succeeding. */
  failFirst: number;
  /** How each failing attempt misbehaves. */
  failure: "timeout" | "reset" | "status429" | "status404" | "status500";
  /** What a successful attempt returns. */
  expect: { ok: boolean; attempts: number; message?: RegExp; label: string };
};

const SCENARIOS: Scenario[] = [
  {
    path: "/slow-then-ok",
    failFirst: 1,
    failure: "timeout",
    expect: { ok: true, attempts: 2, label: "one timeout, then success -> retried" },
  },
  {
    path: "/always-slow",
    failFirst: Number.POSITIVE_INFINITY,
    failure: "timeout",
    expect: {
      ok: false,
      attempts: 3,
      message: /timed out after 250ms/,
      label: "always times out -> fails after the retry budget",
    },
  },
  {
    path: "/reset-then-ok",
    failFirst: 1,
    failure: "reset",
    expect: { ok: true, attempts: 2, label: "connection reset -> retried" },
  },
  {
    path: "/throttled",
    failFirst: 2,
    failure: "status429",
    expect: { ok: true, attempts: 3, label: "two 429s -> retried on the rate-limit budget" },
  },
  {
    path: "/missing",
    failFirst: Number.POSITIVE_INFINITY,
    failure: "status404",
    expect: {
      ok: false,
      attempts: 1,
      message: /HTTP 404/,
      label: "404 -> never retried",
    },
  },
  {
    path: "/broken",
    failFirst: Number.POSITIVE_INFINITY,
    failure: "status500",
    expect: {
      ok: false,
      attempts: 1,
      message: /HTTP 500/,
      label: "500 -> never retried",
    },
  },
];

async function main(): Promise<void> {
  const attempts = new Map<string, number>();
  const sockets = new Set<import("node:net").Socket>();

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const path = (req.url ?? "/").split("?")[0];
    const scenario = SCENARIOS.find((s) => s.path === path);
    const seen = (attempts.get(path) ?? 0) + 1;
    attempts.set(path, seen);

    if (!scenario) {
      res.writeHead(404).end("{}");
      return;
    }

    if (seen <= scenario.failFirst) {
      switch (scenario.failure) {
        case "timeout":
          // Deliberately never respond. The client's AbortController is what ends
          // this, which is exactly the production case.
          return;
        case "reset":
          req.socket.destroy();
          return;
        case "status429":
          res.writeHead(429, { "retry-after": "0" }).end("{}");
          return;
        case "status404":
          res.writeHead(404).end("{}");
          return;
        case "status500":
          res.writeHead(500).end("{}");
          return;
      }
    }

    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
  };

  const server: Server = createServer(handle);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  console.log(`fetchJson retry behaviour (timeout ${TIMEOUT_MS}ms)\n`);
  let failures = 0;

  for (const scenario of SCENARIOS) {
    attempts.set(scenario.path, 0);

    let ok = false;
    let message = "";
    try {
      await fetchJson("check", `${base}${scenario.path}`, { timeoutMs: TIMEOUT_MS });
      ok = true;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    const seen = attempts.get(scenario.path) ?? 0;
    const passes =
      ok === scenario.expect.ok &&
      seen === scenario.expect.attempts &&
      (!scenario.expect.message || scenario.expect.message.test(message));

    if (!passes) failures++;
    console.log(
      `  ${passes ? "ok  " : "FAIL"} ${scenario.expect.label.padEnd(52)} ` +
        `attempts=${seen}/${scenario.expect.attempts}${ok ? "" : `  error="${message}"`}`,
    );
  }

  // A hung route leaves the connection open on our side; destroy rather than
  // waiting, so the process exits promptly instead of holding the event loop.
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log(
    failures === 0
      ? "\nall retry scenarios behaved as specified"
      : `\n${failures} scenario(s) did not behave as specified`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
