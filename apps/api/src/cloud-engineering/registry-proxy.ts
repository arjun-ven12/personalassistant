import { createServer } from "node:http";
import { lookup } from "node:dns/promises";
import { connect, Socket } from "node:net";

/** The first acceptance uses npm only. Fixed CONNECT destination; no URL proxy. */
export function isPublicRegistryAddress(ip: string) {
  const pieces = ip.split(".").map(Number);
  if (
    pieces.length !== 4 ||
    pieces.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return false;
  const [a, b] = pieces;
  return (
    a !== 0 &&
    a !== 10 &&
    a !== 127 &&
    a! < 224 &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b! >= 16 && b! <= 31) &&
    !(a === 192 && (b === 168 || b === 0 || b === 2)) &&
    !(a === 100 && b! >= 64 && b! <= 127) &&
    !(a === 198 && (b === 18 || b === 19 || b === 51)) &&
    !(a === 203 && b === 0)
  );
}
export function createRegistryProxy() {
  let connections = 0;
  const server = createServer((_req, res) => {
    res.writeHead(403);
    res.end();
  });
  server.on("connect", (req, client, head) => {
    if (
      req.url !== "registry.npmjs.org:443" ||
      connections >= 32 ||
      head.length ||
      req.headers.authorization ||
      req.headers["proxy-authorization"]
    ) {
      client.destroy();
      return;
    }
    connections++;
    client.once("close", () => {
      connections--;
    });
    if (!(client instanceof Socket)) {
      client.destroy();
      return;
    }
    client.on("error", () => client.destroy());
    client.setTimeout(30_000, () => client.destroy());
    const lifetime = setTimeout(() => client.destroy(), 60_000);
    client.once("close", () => clearTimeout(lifetime));
    void lookup("registry.npmjs.org", { family: 4, all: true })
      .then((addresses) => {
        if (client.destroyed) return;
        if (
          !addresses.length ||
          addresses.some((a) => !isPublicRegistryAddress(a.address))
        )
          throw Error();
        // Pin the validated address for this connection: no second DNS lookup.
        const upstream = connect({ host: addresses[0]!.address, port: 443 });
        upstream.setTimeout(30_000, () => upstream.destroy());
        upstream.once("connect", () => {
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          client.pipe(upstream);
          upstream.pipe(client);
        });
        upstream.on("error", () => client.destroy());
        client.on("error", () => upstream.destroy());
        client.once("close", () => upstream.destroy());
      })
      .catch(() => client.destroy());
  });
  return server;
}
