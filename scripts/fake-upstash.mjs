// Minimal local stand-in for the Upstash Redis REST API, for tests only.
// Implements the commands MatchPulse's storage adapter uses (GET, MGET, SET
// with NX/EX, DEL, ZADD, ZRANGE with REV, PING) with real expiry, the
// bearer-token check and the client's base64 response encoding. No network.
import http from "node:http";

export async function startFakeUpstash({ token = "test-token", port = 0 } = {}) {
  const data = new Map(); // key → { value, exp }
  const zsets = new Map(); // key → Map(member → score)
  const state = { mode: "ok", commands: [] };

  const live = (key) => {
    const entry = data.get(key);
    if (!entry) return null;
    if (entry.exp !== null && entry.exp <= Date.now()) {
      data.delete(key);
      return null;
    }
    return entry.value;
  };

  function run(cmd) {
    const [name, ...args] = cmd.map(String);
    switch (name.toUpperCase()) {
      case "PING":
        return "PONG";
      case "GET":
        return live(args[0]);
      case "MGET":
        return args.map(live);
      case "SET": {
        const [key, value, ...opts] = args;
        const upper = opts.map((o) => o.toUpperCase());
        if (upper.includes("NX") && live(key) !== null) return null;
        const ex = upper.indexOf("EX");
        const exp = ex >= 0 ? Date.now() + Number(opts[ex + 1]) * 1000 : null;
        data.set(key, { value, exp });
        return "OK";
      }
      case "DEL": {
        let removed = 0;
        for (const key of args) if (data.delete(key) || zsets.delete(key)) removed += 1;
        return removed;
      }
      case "ZADD": {
        const [key, ...pairs] = args;
        const set = zsets.get(key) ?? new Map();
        let added = 0;
        for (let i = 0; i < pairs.length; i += 2) {
          if (!set.has(pairs[i + 1])) added += 1;
          set.set(pairs[i + 1], Number(pairs[i]));
        }
        zsets.set(key, set);
        return added;
      }
      case "ZRANGE": {
        const [key, start, stop, ...opts] = args;
        const rev = opts.map((o) => o.toUpperCase()).includes("REV");
        const members = [...(zsets.get(key) ?? new Map())].sort((a, b) => (rev ? b[1] - a[1] : a[1] - b[1])).map(([m]) => m);
        const end = Number(stop) < 0 ? members.length + Number(stop) : Number(stop);
        return members.slice(Number(start), end + 1);
      }
      default:
        throw new Error(`ERR unknown command '${name}'`);
    }
  }

  const b64 = (value) =>
    typeof value === "string" && value !== "OK"
      ? Buffer.from(value, "utf8").toString("base64")
      : Array.isArray(value)
        ? value.map(b64)
        : value;

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const send = (status, payload) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
      };
      if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: "Unauthorized" });
      if (state.mode === "fail") return send(500, { error: "ERR simulated outage" });
      if (state.mode === "garbage") return send(200, "<html>not json");
      const encode = (result) => (req.headers["upstash-encoding"] === "base64" ? b64(result) : result);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return send(400, { error: "ERR invalid body" });
      }
      // Pipelines (the client auto-pipelines): [[cmd...], ...] → [{result}|{error}, ...]
      if (Array.isArray(parsed[0])) {
        return send(
          200,
          parsed.map((cmd) => {
            state.commands.push(cmd);
            try {
              return { result: encode(run(cmd)) };
            } catch (error) {
              return { error: error.message };
            }
          }),
        );
      }
      try {
        state.commands.push(parsed);
        send(200, { result: encode(run(parsed)) });
      } catch (error) {
        send(400, { error: error.message });
      }
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const bound = server.address().port;
  return {
    url: `http://127.0.0.1:${bound}`,
    token,
    state,
    /** Raw access for tests (e.g. planting malformed records). */
    rawSet: (key, value) => data.set(key, { value, exp: null }),
    rawGet: (key) => live(key),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
