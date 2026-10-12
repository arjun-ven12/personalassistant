import { describe, it, expect, vi } from "vitest";
import { CLOUD_ENGINEERING_LIMITS } from "@alexa-control/shared";
import {
  Ec2CloudWorkspaceProvider,
  type Ec2Clients,
  createEc2Clients,
} from "./ec2-provider.js";
import {
  parseEc2EngineeringConfiguration,
  Ec2InfrastructureConfigurationSchema,
} from "./ec2-configuration.js";
import type { WorkspaceProvisionRequest } from "./provider.js";
const company = crypto.randomUUID(),
  workspace = crypto.randomUUID(),
  repository = crypto.randomUUID(),
  worker = crypto.randomUUID();
const account = "123456789012",
  now = new Date("2026-10-04T00:00:00Z"),
  resource = "i-1234567890abcdef0";
const config = {
  runtimeEnabled: true,
  previewEnabled: true,
  accountId: account,
  region: "ap-southeast-1" as const,
  companyId: company,
  imageId: "ami-1234567890abcdef0",
  imageSnapshotId: "snap-1234567890abcdef0",
  runtimeDigest: "a".repeat(64),
  subnetId: "subnet-1234567890abcdef0",
  vpcId: "vpc-1234567890abcdef0",
  securityGroupId: "sg-1234567890abcdef0",
  previewSecurityGroupId: "sg-2234567890abcdef0",
  instanceProfileArn: `arn:aws:iam::${account}:instance-profile/AthenaEngineeringWorker`,
  schedulerRoleArn: `arn:aws:iam::${account}:role/AthenaEngineeringReaper`,
  schedulerGroup: "athena-engineering-test",
  previewListenerArn: `arn:aws:elasticloadbalancing:ap-southeast-1:${account}:listener/app/athena/abc/def`,
  previewCertificateArn: `arn:aws:acm:ap-southeast-1:${account}:certificate/12345678-1234-1234-1234-123456789012`,
  previewDomain: "preview.example.com",
  evidenceDocumentHash: "b".repeat(64),
  previewDocumentHash: "c".repeat(64),
};
const request: WorkspaceProvisionRequest = {
  workspaceId: workspace,
  companyId: company,
  ownerId: crypto.randomUUID(),
  repositoryId: repository,
  workerId: worker,
  generation: 1,
  limits: CLOUD_ENGINEERING_LIMITS,
  bootstrap: {
    backendOrigin: "https://api.example.com/",
    token: "n".repeat(43),
    expiresAt: "2026-10-04T00:03:00Z",
    serverPublicKeyX: "s".repeat(43),
    baseCommit: "a".repeat(40),
    defaultBranch: "main",
    workspaceLocatorId: `cloud.${repository}`,
  },
};
const scope = {
  companyId: company,
  workspaceId: workspace,
  repositoryId: repository,
  workerId: worker,
  generation: 1,
};
const instance = () => ({
  InstanceId: resource,
  ImageId: config.imageId,
  InstanceType: "t3.medium",
  SubnetId: config.subnetId,
  VpcId: config.vpcId,
  LaunchTime: now,
  State: { Name: "running" },
  SecurityGroups: [{ GroupId: config.securityGroupId }],
  IamInstanceProfile: { Arn: config.instanceProfileArn },
  MetadataOptions: { HttpTokens: "required", HttpPutResponseHopLimit: 1 },
  BlockDeviceMappings: [
    {
      DeviceName: "/dev/sda1",
      Ebs: { VolumeId: "vol-1234567890abcdef0", DeleteOnTermination: true },
    },
  ],
  Tags: Object.entries({
    "athena:company": company,
    "athena:workspace": workspace,
    "athena:repository": repository,
    "athena:worker": worker,
    "athena:generation": "1",
    "athena:runtime": config.runtimeDigest,
  }).map(([Key, Value]) => ({ Key, Value })),
});
const evidence = () => ({
  schemaVersion: "1",
  runtimeDigest: config.runtimeDigest,
  companyId: company,
  workspaceId: workspace,
  repositoryId: repository,
  workerId: worker,
  generation: 1,
  cpuCount: 2,
  memoryBytes: 4 * 1024 ** 3,
  writableDiskBytes: 10 * 1024 ** 3,
  pidLimit: 512,
  hardDeadline: "2026-10-04T00:58:00Z",
  idleSeconds: 300,
  supervisorUid: 0,
  executionUid: 65532,
  offlineValidation: true,
  dependencyProxyOnly: true,
  previewInternalNetwork: true,
  containersReadOnly: true,
  noHostSecretsMounted: true,
  kernelDeadlineArmed: true,
  instanceMetadataBlockedForTasks: true,
  controlPlaneBlockedForTasks: true,
});
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  const send = vi.fn(
    async (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => {
      await Promise.resolve();
      const name = command.constructor.name;
      calls.push({ name, input: command.input });
      if (name in overrides) {
        const value = overrides[name];
        if (value instanceof Error) throw value;
        return value;
      }
      switch (name) {
        case "DescribeInstancesCommand":
          return {
            Reservations: command.input.InstanceIds
              ? [{ OwnerId: account, Instances: [instance()] }]
              : [],
          };
        case "DescribeImagesCommand":
          return {
            Images: [
              {
                ImageId: config.imageId,
                OwnerId: account,
                State: "available",
                RootDeviceName: "/dev/sda1",
                BlockDeviceMappings: [
                  {
                    DeviceName: "/dev/sda1",
                    Ebs: { SnapshotId: config.imageSnapshotId, VolumeSize: 10 },
                  },
                ],
              },
            ],
          };
        case "RunInstancesCommand":
          return { OwnerId: account, Instances: [instance()] };
        case "DescribeVolumesCommand":
          return {
            Volumes: [
              {
                VolumeId: "vol-1234567890abcdef0",
                Size: 10,
                Encrypted: true,
                State: "in-use",
                Attachments: [{ InstanceId: resource, DeleteOnTermination: true }],
              },
            ],
          };
        case "GetScheduleCommand":
          return {
            State: "ENABLED",
            ScheduleExpressionTimezone: "UTC",
            ActionAfterCompletion: "DELETE",
            ScheduleExpression: "at(2026-10-04T00:55:00)",
            FlexibleTimeWindow: { Mode: "OFF" },
            Target: {
              Arn: "arn:aws:scheduler:::aws-sdk:ec2:terminateInstances",
              RoleArn: config.schedulerRoleArn,
              Input: JSON.stringify({ InstanceIds: [resource] }),
            },
          };
        case "DescribeSecurityGroupsCommand":
          return {
            SecurityGroups: [
              {
                VpcId: config.vpcId,
                IpPermissions: [
                  {
                    IpProtocol: "tcp",
                    FromPort: 8080,
                    ToPort: 8080,
                    UserIdGroupPairs: [{ GroupId: config.previewSecurityGroupId }],
                  },
                ],
              },
            ],
          };
        case "SendCommandCommand":
          return { Command: { CommandId: "11111111-1111-4111-8111-111111111111" } };
        case "GetCommandInvocationCommand":
          return {
            Status: "Success",
            StandardOutputContent: JSON.stringify(evidence()),
            StandardErrorContent: "",
          };
        case "DescribeListenersCommand":
          return {
            Listeners: [
              {
                ListenerArn: config.previewListenerArn,
                Protocol: "HTTPS",
                Port: 443,
                Certificates: [{ CertificateArn: config.previewCertificateArn }],
              },
            ],
          };
        case "DescribeRulesCommand":
          return { Rules: [] };
        case "DescribeTargetGroupsCommand":
          throw Object.assign(new Error(), { name: "TargetGroupNotFoundException" });
        default:
          return {};
      }
    },
  );
  const client = { send };
  const clients = {
    ec2: client,
    ssm: client,
    scheduler: client,
    elb: client,
  } as unknown as Ec2Clients;
  return {
    calls,
    send,
    provider: new Ec2CloudWorkspaceProvider(config, clients, () => now),
  };
}
describe("EC2 company infrastructure boundary", () => {
  it("keeps runtime inactive by default and makes no AWS calls when provisioning is disabled", async () => {
    const f = fixture();
    const inactive = { ...config, runtimeEnabled: undefined };
    const clients = Object.fromEntries(
      ["ec2", "ssm", "scheduler", "elb"].map((k) => [k, { send: f.send }]),
    ) as unknown as Ec2Clients;
    const provider = new Ec2CloudWorkspaceProvider(
      Ec2InfrastructureConfigurationSchema.parse(inactive),
      clients,
      () => now,
    );
    await expect(provider.provision(request)).rejects.toMatchObject({
      code: "INVALID_CONFIGURATION",
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it("supports preparation without fabricated preview resources and denies all preview calls", async () => {
    const f = fixture();
    const draft = {
      ...Object.fromEntries(
        Object.entries(config).filter(
          ([k]) =>
            ![
              "previewDomain",
              "previewListenerArn",
              "previewCertificateArn",
              "previewDocumentHash",
            ].includes(k),
        ),
      ),
      previewEnabled: false,
      runtimeEnabled: false,
    };
    expect(Ec2InfrastructureConfigurationSchema.safeParse(draft).success).toBe(true);
    expect(
      Ec2InfrastructureConfigurationSchema.safeParse({ ...draft, previewEnabled: true })
        .success,
    ).toBe(false);
    const clients = Object.fromEntries(
      ["ec2", "ssm", "scheduler", "elb"].map((k) => [k, { send: f.send }]),
    ) as unknown as Ec2Clients;
    const provider = new Ec2CloudWorkspaceProvider(
      Ec2InfrastructureConfigurationSchema.parse(draft),
      clients,
      () => now,
    );
    await expect(provider.getConnectionInfo(resource)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    await expect(provider.write(resource, {})).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it("creates exactly one bounded instance, persists BOOTING before external reaper creation and sends no provider keys", async () => {
    const f = fixture(),
      boot = vi.fn(() => {
        expect(f.calls.some((c) => c.name === "CreateScheduleCommand")).toBe(false);
        return Promise.resolve();
      });
    await f.provider.provision(request, boot);
    expect(boot).toHaveBeenCalledOnce();
    const run = f.calls.find((c) => c.name === "RunInstancesCommand")!.input;
    expect(run).toMatchObject({
      MinCount: 1,
      MaxCount: 1,
      InstanceType: "t3.medium",
      CreditSpecification: { CpuCredits: "standard" },
    });
    expect(run.BlockDeviceMappings).toEqual([
      {
        DeviceName: "/dev/sda1",
        Ebs: {
          VolumeSize: 10,
          VolumeType: "gp3",
          Encrypted: true,
          DeleteOnTermination: true,
        },
      },
    ]);
    const data = Buffer.from(run.UserData as string, "base64").toString();
    expect(data).not.toMatch(/runcmd|AWS_ACCESS_KEY|secretAccessKey|password/);
    expect(
      f.calls.find((c) => c.name === "CreateScheduleCommand")!.input,
    ).toMatchObject({
      ScheduleExpression: "at(2026-10-04T00:55:00)",
      FlexibleTimeWindow: { Mode: "OFF" },
    });
  });
  it("reconciles the exact generation instead of creating another environment", async () => {
    const f = fixture({
      DescribeInstancesCommand: {
        Reservations: [{ OwnerId: account, Instances: [instance()] }],
      },
    });
    await f.provider.provision(request);
    expect(f.calls.some((c) => c.name === "RunInstancesCommand")).toBe(false);
  });
  it("repairs a missing deadline after an uncertain provision without creating another instance", async () => {
    const f = fixture({
      DescribeInstancesCommand: {
        Reservations: [{ OwnerId: account, Instances: [instance()] }],
      },
      GetScheduleCommand: Object.assign(new Error(), {
        name: "ResourceNotFoundException",
      }),
    });
    await f.provider.reconcile({
      companyId: company,
      workspaceId: workspace,
      generation: 1,
    });
    expect(f.calls.filter((c) => c.name === "CreateScheduleCommand")).toHaveLength(1);
    expect(f.calls.some((c) => c.name === "RunInstancesCommand")).toBe(false);
  });
  it("does not recreate a deadline when its outcome is uncertain", async () => {
    const f = fixture({
      DescribeInstancesCommand: {
        Reservations: [{ OwnerId: account, Instances: [instance()] }],
      },
      GetScheduleCommand: new Error("secret provider error"),
    });
    await expect(f.provider.provision(request)).rejects.toMatchObject({
      code: "UNCERTAIN",
    });
    expect(
      f.calls.some((c) =>
        ["RunInstancesCommand", "CreateScheduleCommand"].includes(c.name),
      ),
    ).toBe(false);
  });
  it("fails closed on duplicate environments", async () => {
    const f = fixture({
      DescribeInstancesCommand: {
        Reservations: [{ OwnerId: account, Instances: [instance(), instance()] }],
      },
    });
    await expect(f.provider.provision(request)).rejects.toThrow();
    expect(f.calls.some((c) => c.name === "RunInstancesCommand")).toBe(false);
  });
  it("denies tenant mismatch and limit increases before API calls", async () => {
    const f = fixture();
    await expect(
      f.provider.provision({ ...request, companyId: crypto.randomUUID() }),
    ).rejects.toThrow();
    await expect(
      f.provider.provision({
        ...request,
        limits: { ...request.limits, processes: 513 } as never,
      }),
    ).rejects.toThrow();
    expect(f.send).not.toHaveBeenCalled();
  });
  it("does not retry uncertain creates or expose SDK secrets", async () => {
    const f = fixture({ RunInstancesCommand: new Error("RAW_PROVIDER_SECRET") });
    await expect(f.provider.provision(request)).rejects.toThrow(
      "Cloud provider uncertain",
    );
    expect(f.calls.filter((c) => c.name === "RunInstancesCommand")).toHaveLength(1);
  });
  it("requires provider disk, scheduled cleanup and runtime evidence before trust", async () => {
    const f = fixture();
    await expect(f.provider.attest(resource, scope)).resolves.toMatchObject({
      pidLimit: 512,
    });
    expect(f.calls.find((c) => c.name === "SendCommandCommand")!.input).toMatchObject({
      DocumentName: "AthenaEngineeringEvidenceV1",
      DocumentVersion: "1",
      DocumentHash: config.evidenceDocumentHash,
      Parameters: {},
    });
  });
  it.each([
    { pidLimit: 513 },
    { generation: 2 },
    { repositoryId: crypto.randomUUID() },
    { kernelDeadlineArmed: false },
    { dependencyProxyOnly: false },
    { executionUid: 0 },
    { hardDeadline: "2026-10-04T01:01:00Z" },
  ])("rejects invalid runtime evidence %j", async (patch) => {
    const f = fixture({
      GetCommandInvocationCommand: {
        Status: "Success",
        StandardOutputContent: JSON.stringify({ ...evidence(), ...patch }),
        StandardErrorContent: "",
      },
    });
    await expect(f.provider.attest(resource, scope)).rejects.toThrow();
  });
  it("rejects public ingress and oversized disk", async () => {
    const f = fixture({
      DescribeSecurityGroupsCommand: {
        SecurityGroups: [
          {
            VpcId: config.vpcId,
            IpPermissions: [
              {
                IpProtocol: "tcp",
                FromPort: 8080,
                ToPort: 8080,
                IpRanges: [{ CidrIp: "0.0.0.0/0" }],
              },
            ],
          },
        ],
      },
    });
    await expect(f.provider.attest(resource, scope)).rejects.toThrow();
    const g = fixture({ DescribeVolumesCommand: { Volumes: [{ Size: 11 }] } });
    await expect(g.provider.attest(resource, scope)).rejects.toThrow();
  });
  it("denies another workspace preview grant and arbitrary targets", async () => {
    const f = fixture();
    await expect(
      f.provider.write(resource, {
        workspaceId: crypto.randomUUID(),
        companyId: company,
        previewId: crypto.randomUUID(),
        generation: 1,
        port: 4173,
        healthPath: "/",
        tokenHash: "a".repeat(64),
        expiresAt: "2026-10-04T00:10:00Z",
      }),
    ).rejects.toThrow();
    expect(f.calls.some((c) => c.name === "SendCommandCommand")).toBe(false);
  });
  it("requires external TLS configuration and reports costs UNKNOWN", async () => {
    const f = fixture();
    expect(await f.provider.getConnectionInfo(resource)).toEqual({
      privateHost: `${resource}.preview.example.com`,
      previewPort: 8080,
    });
    expect(await f.provider.getUsage(resource)).toMatchObject({
      runtimeSeconds: null,
      costUsd: null,
      costStatus: "UNKNOWN",
    });
  });
  it("does not accept arbitrary credential sources or unknown config", () => {
    expect(() =>
      createEc2Clients("ap-southeast-1", { secretAccessKey: "RAW_PROVIDER_SECRET" }),
    ).toThrow("Cloud provider invalid configuration");
    expect(() =>
      parseEc2EngineeringConfiguration(
        JSON.stringify([
          {
            ...config,
            ownerId: request.ownerId,
            backendOrigin: request.bootstrap.backendOrigin,
            commandProfileId: "approved",
            capabilityProfileId: "approved",
            authorizedAgentIds: [worker],
            credentialReferenceId: crypto.randomUUID(),
            shell: "evil",
          },
        ]),
      ),
    ).toThrow();
  });
});
