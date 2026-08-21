import { describe, expect, it } from "vitest";

import {
  DevelopmentLoopbackNetworkVerifier,
  StaticNetworkVerifier,
  TailscaleNetworkVerifier,
  isTailscaleAddress,
} from "./network.js";

describe("Tailscale network verification", () => {
  it("parses official IPv4, IPv6, and mapped address ranges", () => {
    expect(isTailscaleAddress("100.64.0.1")).toBe(true);
    expect(isTailscaleAddress("100.127.255.254")).toBe(true);
    expect(isTailscaleAddress("::ffff:100.100.100.100")).toBe(true);
    expect(isTailscaleAddress("fd7a:115c:a1e0::1234")).toBe(true);
    expect(isTailscaleAddress("192.168.1.2")).toBe(false);
    expect(isTailscaleAddress("10.0.0.2")).toBe(false);
    expect(isTailscaleAddress("8.8.8.8")).toBe(false);
  });

  it("requires LocalAPI identity for direct Tailscale addresses", async () => {
    const verifier = new TailscaleNetworkVerifier({
      trustServeProxy: false,
      lookup: {
        lookup: (address) =>
          Promise.resolve({
            tailscaleIp: address,
            nodeId: "node-1",
            nodeName: "controller.example.ts.net",
            userLogin: "owner@example.com",
          }),
      },
    });
    await expect(
      verifier.verify({ remoteAddress: "100.100.10.20" }),
    ).resolves.toMatchObject({
      state: "PRIVATE_NETWORK",
      source: "tailscale_localapi",
      tailscaleIp: "100.100.10.20",
    });
  });

  it("fails closed for spoofing, mismatches, invalid input, and unavailable LocalAPI", async () => {
    const spoofed = new TailscaleNetworkVerifier({
      trustServeProxy: false,
      lookup: { lookup: () => Promise.resolve(null) },
    });
    await expect(
      spoofed.verify({
        remoteAddress: "127.0.0.1",
        tailscaleUserLogin: "attacker@example.com",
      }),
    ).resolves.toMatchObject({
      state: "UNKNOWN",
      reasonCode: "TAILSCALE_HEADERS_FROM_UNTRUSTED_PROXY",
    });
    await expect(
      spoofed.verify({ remoteAddress: "192.168.1.2" }),
    ).resolves.toMatchObject({ state: "PUBLIC_NETWORK" });
    await expect(spoofed.verify({ remoteAddress: "not-an-ip" })).resolves.toMatchObject(
      { state: "UNKNOWN" },
    );

    const unavailable = new TailscaleNetworkVerifier({
      trustServeProxy: false,
      lookup: {
        lookup: () => Promise.reject(new Error("offline")),
      },
    });
    await expect(
      unavailable.verify({ remoteAddress: "100.100.10.20" }),
    ).resolves.toMatchObject({ state: "UNAVAILABLE" });
  });

  it("accepts Serve headers only from an explicitly trusted loopback proxy", async () => {
    const verifier = new TailscaleNetworkVerifier({
      trustServeProxy: true,
      lookup: { lookup: () => Promise.resolve(null) },
    });
    await expect(
      verifier.verify({
        remoteAddress: "::1",
        tailscaleUserLogin: "owner@example.com",
        tailscaleUserName: "Controller",
      }),
    ).resolves.toMatchObject({
      state: "PRIVATE_NETWORK",
      source: "trusted_proxy",
    });
  });

  it("keeps the private test verifier explicit", async () => {
    await expect(
      new StaticNetworkVerifier("PRIVATE_NETWORK").verify({
        remoteAddress: "127.0.0.1",
      }),
    ).resolves.toMatchObject({ state: "PRIVATE_NETWORK", source: "test" });
  });

  it("allows only loopback for the development verifier", async () => {
    const verifier = new DevelopmentLoopbackNetworkVerifier();
    await expect(verifier.verify({ remoteAddress: "127.0.0.1" })).resolves.toMatchObject(
      {
        state: "PRIVATE_NETWORK",
        reasonCode: "DEVELOPMENT_LOOPBACK_VERIFIED",
      },
    );
    await expect(verifier.verify({ remoteAddress: "::1" })).resolves.toMatchObject({
      state: "PRIVATE_NETWORK",
      reasonCode: "DEVELOPMENT_LOOPBACK_VERIFIED",
    });
    await expect(
      verifier.verify({ remoteAddress: "192.168.1.2" }),
    ).resolves.toMatchObject({
      state: "PUBLIC_NETWORK",
      reasonCode: "DEVELOPMENT_LOOPBACK_REQUIRED",
    });
  });
});
