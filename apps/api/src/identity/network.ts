import http from "node:http";
import net from "node:net";

import {
  NetworkVerificationResultSchema,
  type NetworkVerificationInput,
  type NetworkVerificationResult,
  type NetworkVerifier,
} from "@alexa-control/shared";

export interface TailscaleNodeIdentity {
  tailscaleIp: string;
  nodeId?: string;
  nodeName?: string;
  userLogin?: string;
  tags?: string[];
}

export interface TailscaleIdentityLookup {
  lookup(address: string): Promise<TailscaleNodeIdentity | null>;
}

const normalizeAddress = (address: string) => {
  const withoutPrefix = address.split("/")[0] ?? address;
  const zoneIndex = withoutPrefix.indexOf("%");
  const withoutZone =
    zoneIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, zoneIndex);
  if (withoutZone.toLowerCase().startsWith("::ffff:")) {
    const mapped = withoutZone.slice(7);
    if (net.isIPv4(mapped)) return mapped;
  }
  return withoutZone;
};

const ipv4Number = (address: string) => {
  if (!net.isIPv4(address)) return null;
  return (
    address
      .split(".")
      .map(Number)
      .reduce((value, octet) => (value << 8) + octet, 0) >>> 0
  );
};

const ipv6BigInt = (address: string) => {
  if (!net.isIPv6(address)) return null;
  const [left = "", right = ""] = address.toLowerCase().split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const fill = 8 - leftParts.length - rightParts.length;
  if (fill < 0) return null;
  const parts = [...leftParts, ...Array<string>(fill).fill("0"), ...rightParts];
  if (parts.length !== 8) return null;
  return parts.reduce((value, part) => (value << 16n) + BigInt(`0x${part || "0"}`), 0n);
};

const isIpv4Cidr = (address: string, network: string, prefix: number) => {
  const addressNumber = ipv4Number(address);
  const networkNumber = ipv4Number(network);
  if (addressNumber === null || networkNumber === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (addressNumber & mask) === (networkNumber & mask);
};

const isIpv6Cidr = (address: string, network: string, prefix: number) => {
  const addressNumber = ipv6BigInt(address);
  const networkNumber = ipv6BigInt(network);
  if (addressNumber === null || networkNumber === null) return false;
  const shift = BigInt(128 - prefix);
  return addressNumber >> shift === networkNumber >> shift;
};

export const isTailscaleAddress = (rawAddress: string) => {
  const address = normalizeAddress(rawAddress);
  return (
    isIpv4Cidr(address, "100.64.0.0", 10) || isIpv6Cidr(address, "fd7a:115c:a1e0::", 48)
  );
};

export const isLoopbackAddress = (rawAddress: string) => {
  const address = normalizeAddress(rawAddress);
  return isIpv4Cidr(address, "127.0.0.0", 8) || address === "::1";
};

const result = (
  input: NetworkVerificationInput,
  values: Omit<NetworkVerificationResult, "verifiedAt" | "remoteAddress">,
) =>
  NetworkVerificationResultSchema.parse({
    ...values,
    remoteAddress: input.remoteAddress,
    verifiedAt: new Date().toISOString(),
  });

export class UnknownNetworkVerifier implements NetworkVerifier {
  verify(input: NetworkVerificationInput) {
    return Promise.resolve(
      result(input, {
        state: "UNKNOWN",
        source: "direct_socket",
        reasonCode: "NETWORK_VERIFIER_NOT_CONFIGURED",
      }),
    );
  }
}

/** Kept as a compatibility name for development. Production rejects this verifier. */
export class PlaceholderNetworkVerifier extends UnknownNetworkVerifier {}

export class StaticNetworkVerifier implements NetworkVerifier {
  constructor(
    private readonly state: NetworkVerificationResult["state"],
    private readonly reasonCode = "TEST_NETWORK_STATE",
  ) {}

  verify(input: NetworkVerificationInput) {
    return Promise.resolve(
      result(input, {
        state: this.state,
        source: "test",
        reasonCode: this.reasonCode,
      }),
    );
  }
}

export class DevelopmentLoopbackNetworkVerifier implements NetworkVerifier {
  verify(input: NetworkVerificationInput) {
    if (!isLoopbackAddress(input.remoteAddress)) {
      return Promise.resolve(
        result(input, {
          state: "PUBLIC_NETWORK",
          source: "direct_socket",
          reasonCode: "DEVELOPMENT_LOOPBACK_REQUIRED",
        }),
      );
    }
    return Promise.resolve(
      result(input, {
        state: "PRIVATE_NETWORK",
        source: "direct_socket",
        reasonCode: "DEVELOPMENT_LOOPBACK_VERIFIED",
      }),
    );
  }
}

export interface TailscaleNetworkVerifierOptions {
  lookup: TailscaleIdentityLookup;
  trustServeProxy: boolean;
  expectedTags?: string[];
}

export class TailscaleNetworkVerifier implements NetworkVerifier {
  constructor(private readonly options: TailscaleNetworkVerifierOptions) {}

  async verify(input: NetworkVerificationInput): Promise<NetworkVerificationResult> {
    const remoteAddress = normalizeAddress(input.remoteAddress);
    if (net.isIP(remoteAddress) === 0) {
      return result(input, {
        state: "UNKNOWN",
        source: "direct_socket",
        reasonCode: "REMOTE_ADDRESS_INVALID",
      });
    }

    if (isLoopbackAddress(remoteAddress) && input.tailscaleUserLogin) {
      if (!this.options.trustServeProxy) {
        return result(input, {
          state: "UNKNOWN",
          source: "direct_socket",
          reasonCode: "TAILSCALE_HEADERS_FROM_UNTRUSTED_PROXY",
        });
      }
      return result(input, {
        state: "PRIVATE_NETWORK",
        source: "trusted_proxy",
        userLogin: input.tailscaleUserLogin,
        ...(input.tailscaleUserName ? { nodeName: input.tailscaleUserName } : {}),
        reasonCode: "TAILSCALE_SERVE_IDENTITY_VERIFIED",
      });
    }

    if (!isTailscaleAddress(remoteAddress)) {
      return result(input, {
        state: "PUBLIC_NETWORK",
        source: "direct_socket",
        reasonCode: "REMOTE_ADDRESS_OUTSIDE_TAILSCALE_RANGES",
      });
    }

    try {
      const identity = await this.options.lookup.lookup(remoteAddress);
      if (!identity || normalizeAddress(identity.tailscaleIp) !== remoteAddress) {
        return result(input, {
          state: "UNKNOWN",
          source: "tailscale_localapi",
          reasonCode: "TAILSCALE_IDENTITY_MISMATCH",
        });
      }
      const expectedTags = this.options.expectedTags ?? [];
      if (
        expectedTags.length > 0 &&
        !expectedTags.some((tag) => identity.tags?.includes(tag))
      ) {
        return result(input, {
          state: "UNKNOWN",
          source: "tailscale_localapi",
          reasonCode: "TAILSCALE_NODE_TAG_UNEXPECTED",
        });
      }
      return result(input, {
        state: "PRIVATE_NETWORK",
        source: "tailscale_localapi",
        tailscaleIp: identity.tailscaleIp,
        ...(identity.nodeId ? { nodeId: identity.nodeId } : {}),
        ...(identity.nodeName ? { nodeName: identity.nodeName } : {}),
        ...(identity.userLogin ? { userLogin: identity.userLogin } : {}),
        ...(identity.tags ? { tags: identity.tags } : {}),
        reasonCode: "TAILSCALE_LOCALAPI_IDENTITY_VERIFIED",
      });
    } catch {
      return result(input, {
        state: "UNAVAILABLE",
        source: "tailscale_localapi",
        reasonCode: "TAILSCALE_LOCALAPI_UNAVAILABLE",
      });
    }
  }
}

interface LocalApiWhoIs {
  Node?: { ID?: string; Name?: string; Addresses?: string[]; Tags?: string[] };
  UserProfile?: { LoginName?: string };
}

export class TailscaleLocalApiClient implements TailscaleIdentityLookup {
  constructor(private readonly socketPath: string) {}

  lookup(address: string): Promise<TailscaleNodeIdentity | null> {
    const socketAddress = net.isIPv6(address) ? `[${address}]:0` : `${address}:0`;
    return new Promise((resolve, reject) => {
      const request = http.get(
        {
          socketPath: this.socketPath,
          path: `/localapi/v0/whois?addr=${encodeURIComponent(socketAddress)}`,
          headers: { Host: "local-tailscaled.sock" },
          timeout: 2_000,
        },
        (response) => {
          if (response.statusCode !== 200) {
            response.resume();
            resolve(null);
            return;
          }
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => {
            if (body.length < 64_000) body += chunk;
          });
          response.on("end", () => {
            try {
              const payload = JSON.parse(body) as LocalApiWhoIs;
              const matchedAddress = payload.Node?.Addresses?.find(
                (candidate) =>
                  normalizeAddress(candidate) === normalizeAddress(address),
              );
              resolve(
                matchedAddress
                  ? {
                      tailscaleIp: normalizeAddress(matchedAddress),
                      ...(payload.Node?.ID ? { nodeId: payload.Node.ID } : {}),
                      ...(payload.Node?.Name
                        ? { nodeName: payload.Node.Name.replace(/\.$/, "") }
                        : {}),
                      ...(payload.UserProfile?.LoginName
                        ? { userLogin: payload.UserProfile.LoginName }
                        : {}),
                      ...(payload.Node?.Tags ? { tags: payload.Node.Tags } : {}),
                    }
                  : null,
              );
            } catch (error) {
              reject(
                error instanceof Error ? error : new Error("Invalid LocalAPI response"),
              );
            }
          });
        },
      );
      request.on("timeout", () => request.destroy(new Error("LocalAPI timed out")));
      request.on("error", reject);
    });
  }
}
