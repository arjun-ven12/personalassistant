import { createHash } from "node:crypto";
import { z } from "zod";
import {
  EC2Client,
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeVolumesCommand,
  DescribeSecurityGroupsCommand,
  RunInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
} from "@aws-sdk/client-ssm";
import {
  SchedulerClient,
  CreateScheduleCommand,
  GetScheduleCommand,
} from "@aws-sdk/client-scheduler";
import {
  ElasticLoadBalancingV2Client,
  DescribeTargetGroupsCommand,
  DescribeListenersCommand,
  CreateTargetGroupCommand,
  RegisterTargetsCommand,
  DescribeRulesCommand,
  CreateRuleCommand,
  DeleteRuleCommand,
  DeleteTargetGroupCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  Ec2RuntimeEvidenceSchema,
  CloudResourceLimitsSchema,
  type CloudUsage,
} from "@alexa-control/shared";
import { CloudPreviewGrantSchema } from "./preview-gate.js";
import {
  Ec2InfrastructureConfigurationSchema,
  type Ec2InfrastructureConfiguration,
} from "./ec2-configuration.js";
import {
  CloudProviderError,
  type CloudWorkspaceProvider,
  type WorkspaceProvisionRequest,
  type ProviderWorkspace,
} from "./provider.js";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const id = z.string().regex(/^i-[a-f0-9]{17}$/);
const Instance = z
  .object({
    InstanceId: id,
    ImageId: z.string(),
    InstanceType: z.literal("t3.medium"),
    SubnetId: z.string(),
    VpcId: z.string(),
    LaunchTime: z.date(),
    State: z
      .object({
        Name: z.enum([
          "pending",
          "running",
          "stopping",
          "stopped",
          "shutting-down",
          "terminated",
        ]),
      })
      .passthrough(),
    Tags: z
      .array(z.object({ Key: z.string(), Value: z.string() }).passthrough())
      .max(50),
    SecurityGroups: z.array(z.object({ GroupId: z.string() }).passthrough()).max(1),
    IamInstanceProfile: z.object({ Arn: z.string() }).passthrough().optional(),
    MetadataOptions: z
      .object({
        HttpTokens: z.literal("required"),
        HttpPutResponseHopLimit: z.literal(1),
      })
      .passthrough()
      .optional(),
    BlockDeviceMappings: z
      .array(
        z
          .object({
            DeviceName: z.string(),
            Ebs: z
              .object({ VolumeId: z.string(), DeleteOnTermination: z.literal(true) })
              .passthrough(),
          })
          .passthrough(),
      )
      .max(1),
  })
  .passthrough();
type Instance = z.infer<typeof Instance>;
export { Ec2RuntimeEvidenceSchema } from "@alexa-control/shared";
const Credentials = z
  .object({
    accessKeyId: z.string().regex(/^[A-Z0-9]{20}$/),
    secretAccessKey: z.string().min(40).max(128),
    sessionToken: z.string().min(16).optional(),
  })
  .strict();
export interface Ec2Clients {
  ec2: Pick<EC2Client, "send">;
  ssm: Pick<SSMClient, "send">;
  scheduler: Pick<SchedulerClient, "send">;
  elb: Pick<ElasticLoadBalancingV2Client, "send">;
}
/** No implicit AWS credential chain; only the company secret-reference resolver may supply these. */
export function createEc2Clients(region: "ap-southeast-1", raw: unknown): Ec2Clients {
  let credentials: z.infer<typeof Credentials>;
  try {
    credentials = Credentials.parse(
      typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw,
    );
  } catch {
    throw new CloudProviderError("INVALID_CONFIGURATION");
  }
  const options = {
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
    },
    maxAttempts: 1,
    requestHandler: { requestTimeout: 20_000, connectionTimeout: 5_000 },
  };
  return {
    ec2: new EC2Client(options),
    ssm: new SSMClient(options),
    scheduler: new SchedulerClient(options),
    elb: new ElasticLoadBalancingV2Client(options),
  };
}
/** Infrastructure lifecycle only. No public SDK request, shell, executable or target composer. */
export class Ec2CloudWorkspaceProvider implements CloudWorkspaceProvider {
  readonly id = "aws-ec2";
  readonly #config: Ec2InfrastructureConfiguration;
  constructor(
    config: Ec2InfrastructureConfiguration,
    readonly clients: Ec2Clients,
    readonly now: () => Date = () => new Date(),
  ) {
    this.#config = Ec2InfrastructureConfigurationSchema.parse(config);
  }
  private async call<T>(run: () => Promise<T>, mutation = false): Promise<T> {
    try {
      return await run();
    } catch (e) {
      if (e instanceof CloudProviderError) throw e;
      throw new CloudProviderError(mutation ? "UNCERTAIN" : "UNAVAILABLE");
    }
  }
  private tags(v: Instance) {
    return Object.fromEntries(v.Tags.map((t) => [t.Key, t.Value]));
  }
  private scope(v: Instance) {
    const c = this.#config,
      t = this.tags(v);
    if (
      v.ImageId !== c.imageId ||
      v.SubnetId !== c.subnetId ||
      v.VpcId !== c.vpcId ||
      (v.State.Name !== "terminated" &&
        (v.SecurityGroups[0]?.GroupId !== c.securityGroupId ||
          v.IamInstanceProfile?.Arn !== c.instanceProfileArn ||
          !v.MetadataOptions ||
          v.BlockDeviceMappings.length !== 1)) ||
      t["athena:company"] !== c.companyId ||
      t["athena:runtime"] !== c.runtimeDigest ||
      !z.string().uuid().safeParse(t["athena:workspace"]).success ||
      !z.string().uuid().safeParse(t["athena:repository"]).success ||
      !z.string().uuid().safeParse(t["athena:worker"]).success ||
      !z.coerce.number().int().positive().safeParse(t["athena:generation"]).success
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    return v;
  }
  private view(v: Instance): ProviderWorkspace {
    return {
      resourceId: v.InstanceId,
      state:
        v.State.Name === "running"
          ? "RUNNING"
          : v.State.Name === "terminated"
            ? "DESTROYED"
            : v.State.Name === "stopped"
              ? "STOPPED"
              : "BOOTING",
    };
  }
  private async read(resourceId: string) {
    id.parse(resourceId);
    const raw = await this.call(() =>
      this.clients.ec2.send(
        new DescribeInstancesCommand({ InstanceIds: [resourceId] }),
      ),
    );
    const rows = z
      .object({
        Reservations: z
          .array(
            z
              .object({
                OwnerId: z.literal(this.#config.accountId),
                Instances: z.array(Instance).max(1),
              })
              .passthrough(),
          )
          .max(1),
      })
      .passthrough()
      .parse(raw);
    const v = rows.Reservations[0]?.Instances[0];
    if (!v) throw new CloudProviderError("SCOPE_MISMATCH");
    return this.scope(v);
  }
  async reconcile(
    input: Pick<WorkspaceProvisionRequest, "workspaceId" | "companyId" | "generation">,
  ) {
    if (input.companyId !== this.#config.companyId)
      throw new CloudProviderError("SCOPE_MISMATCH");
    const raw = await this.call(() =>
      this.clients.ec2.send(
        new DescribeInstancesCommand({
          MaxResults: 5,
          Filters: [
            { Name: "tag:athena:company", Values: [input.companyId] },
            { Name: "tag:athena:workspace", Values: [input.workspaceId] },
            { Name: "tag:athena:generation", Values: [String(input.generation)] },
          ],
        }),
      ),
    );
    const rows = z
      .object({
        Reservations: z
          .array(
            z
              .object({
                OwnerId: z.literal(this.#config.accountId),
                Instances: z.array(Instance).max(5),
              })
              .passthrough(),
          )
          .max(5),
        NextToken: z.string().optional(),
      })
      .passthrough()
      .parse(raw);
    if (rows.NextToken) throw new CloudProviderError("UNCERTAIN");
    const found = rows.Reservations.flatMap((r) => r.Instances).map((v) =>
      this.scope(v),
    );
    if (found.length > 1) throw new CloudProviderError("UNCERTAIN");
    if (found[0]) {
      const t = this.tags(found[0]);
      if (
        t["athena:workspace"] !== input.workspaceId ||
        t["athena:generation"] !== String(input.generation)
      )
        throw new CloudProviderError("SCOPE_MISMATCH");
    }
    if (found[0] && ["running", "pending"].includes(found[0].State.Name))
      await this.ensureSchedule(found[0]);
    return found[0] ? this.view(found[0]) : null;
  }
  async provision(
    input: WorkspaceProvisionRequest,
    onBooting?: (v: ProviderWorkspace) => Promise<void>,
  ) {
    CloudResourceLimitsSchema.parse(input.limits);
    if (
      input.companyId !== this.#config.companyId ||
      !z.string().uuid().safeParse(input.workspaceId).success ||
      input.generation < 1
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    if (!this.#config.runtimeEnabled)
      throw new CloudProviderError("INVALID_CONFIGURATION");
    const prior = await this.reconcile(input);
    if (prior) return prior;
    const c = this.#config;
    const images = z
      .object({
        Images: z
          .array(
            z
              .object({
                ImageId: z.string(),
                OwnerId: z.string(),
                State: z.literal("available"),
                RootDeviceName: z.string(),
                BlockDeviceMappings: z
                  .array(
                    z
                      .object({
                        DeviceName: z.string(),
                        Ebs: z
                          .object({
                            SnapshotId: z.string(),
                            VolumeSize: z.number().int().min(1).max(10),
                          })
                          .passthrough(),
                      })
                      .passthrough(),
                  )
                  .length(1),
              })
              .passthrough(),
          )
          .length(1),
      })
      .passthrough()
      .parse(
        await this.call(() =>
          this.clients.ec2.send(
            new DescribeImagesCommand({ ImageIds: [c.imageId], Owners: [c.accountId] }),
          ),
        ),
      ).Images[0]!;
    if (
      images.OwnerId !== c.accountId ||
      images.ImageId !== c.imageId ||
      images.BlockDeviceMappings[0]?.Ebs.SnapshotId !== c.imageSnapshotId
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    const token = hash(`${input.companyId}:${input.workspaceId}:${input.generation}`);
    const tags = Object.entries({
      "athena:company": input.companyId,
      "athena:workspace": input.workspaceId,
      "athena:repository": input.repositoryId,
      "athena:worker": input.workerId,
      "athena:generation": String(input.generation),
      "athena:runtime": c.runtimeDigest,
    }).map(([Key, Value]) => ({ Key, Value }));
    const bootstrap = Buffer.from(
      JSON.stringify({
        schemaVersion: "2",
        previewEnabled: c.previewEnabled,
        ...input.bootstrap,
        ...Object.fromEntries(
          [
            "workspaceId",
            "companyId",
            "repositoryId",
            "workerId",
            "generation",
            "limits",
          ].map((k) => [k, input[k as keyof WorkspaceProvisionRequest]]),
        ),
      }),
    ).toString("base64");
    // cloud-init writes a data file only. The pinned AMI owns the finite startup unit; no runcmd/shell/user executable.
    const lifetime = Buffer.from(
      JSON.stringify({
        expiresAt: new Date(this.now().getTime() + 3_500_000).toISOString(),
        idleSeconds: 300,
        runtimeDigest: c.runtimeDigest,
      }),
    ).toString("base64");
    const userData = `#cloud-config\nwrite_files:\n  - path: /run/athena/bootstrap.json\n    owner: root:root\n    permissions: '0600'\n    encoding: b64\n    content: ${bootstrap}\n  - path: /run/athena/lifetime.json\n    owner: root:root\n    permissions: '0600'\n    encoding: b64\n    content: ${lifetime}\n`;
    const raw = await this.call(
      () =>
        this.clients.ec2.send(
          new RunInstancesCommand({
            ClientToken: token,
            ImageId: c.imageId,
            InstanceType: "t3.medium",
            MinCount: 1,
            MaxCount: 1,
            SubnetId: c.subnetId,
            SecurityGroupIds: [c.securityGroupId],
            IamInstanceProfile: { Arn: c.instanceProfileArn },
            MetadataOptions: {
              HttpTokens: "required",
              HttpPutResponseHopLimit: 1,
              InstanceMetadataTags: "disabled",
            },
            CreditSpecification: { CpuCredits: "standard" },
            DisableApiTermination: false,
            InstanceInitiatedShutdownBehavior: "terminate",
            BlockDeviceMappings: [
              {
                DeviceName: images.RootDeviceName,
                Ebs: {
                  VolumeSize: 10,
                  VolumeType: "gp3",
                  Encrypted: true,
                  DeleteOnTermination: true,
                },
              },
            ],
            TagSpecifications: [
              { ResourceType: "instance", Tags: tags },
              { ResourceType: "volume", Tags: tags },
            ],
            UserData: Buffer.from(userData).toString("base64"),
          }),
        ),
      true,
    );
    const instance = z
      .object({ Instances: z.array(Instance).length(1) })
      .passthrough()
      .parse(raw).Instances[0]!;
    this.scope(instance);
    const view = this.view(instance);
    await onBooting?.(view);
    await this.createSchedule(instance);
    return view;
  }
  private validateSchedule(v: Instance, raw: unknown) {
    z.object({
      State: z.literal("ENABLED"),
      ScheduleExpression: z.literal(
        `at(${new Date(v.LaunchTime.getTime() + 3_300_000).toISOString().slice(0, 19)})`,
      ),
      ScheduleExpressionTimezone: z.literal("UTC"),
      FlexibleTimeWindow: z.object({ Mode: z.literal("OFF") }).passthrough(),
      ActionAfterCompletion: z.literal("DELETE"),
      Target: z
        .object({
          Arn: z.literal("arn:aws:scheduler:::aws-sdk:ec2:terminateInstances"),
          RoleArn: z.literal(this.#config.schedulerRoleArn),
          Input: z.literal(JSON.stringify({ InstanceIds: [v.InstanceId] })),
        })
        .passthrough(),
    })
      .passthrough()
      .parse(raw);
  }
  private async ensureSchedule(v: Instance) {
    let raw: unknown;
    try {
      raw = await this.clients.scheduler.send(
        new GetScheduleCommand({
          Name: this.scheduleName(v),
          GroupName: this.#config.schedulerGroup,
        }),
      );
    } catch (error) {
      // Only confirmed absence permits creation; unavailable/uncertain reads never authorize a mutation.
      if (!(error instanceof Error && error.name === "ResourceNotFoundException"))
        throw new CloudProviderError("UNCERTAIN");
      if (this.now().getTime() >= v.LaunchTime.getTime() + 3_300_000)
        throw new CloudProviderError("UNAVAILABLE");
      await this.createSchedule(v);
      return;
    }
    this.validateSchedule(v, raw);
  }
  private async createSchedule(v: Instance) {
    // Independent provider-side backup. The reviewed AMI's kernel deadline remains mandatory.
    const c = this.#config;
    await this.call(
      () =>
        this.clients.scheduler.send(
          new CreateScheduleCommand({
            Name: this.scheduleName(v),
            GroupName: c.schedulerGroup,
            ClientToken: hash(`${c.companyId}:${v.InstanceId}:deadline`),
            ScheduleExpression: `at(${new Date(v.LaunchTime.getTime() + 3_300_000).toISOString().slice(0, 19)})`,
            ScheduleExpressionTimezone: "UTC",
            FlexibleTimeWindow: { Mode: "OFF" },
            ActionAfterCompletion: "DELETE",
            Target: {
              Arn: "arn:aws:scheduler:::aws-sdk:ec2:terminateInstances",
              RoleArn: c.schedulerRoleArn,
              Input: JSON.stringify({ InstanceIds: [v.InstanceId] }),
              RetryPolicy: { MaximumEventAgeInSeconds: 60, MaximumRetryAttempts: 2 },
            },
          }),
        ),
      true,
    );
  }
  private scheduleName(v: Instance) {
    return `athena-${hash(`${this.#config.companyId}:${v.InstanceId}`).slice(0, 40)}`;
  }
  private async document(
    v: Instance,
    kind: "evidence" | "preview",
    parameters: Record<string, string[]>,
  ) {
    const sent = z
      .object({ Command: z.object({ CommandId: z.string().uuid() }).passthrough() })
      .passthrough()
      .parse(
        await this.call(
          () =>
            this.clients.ssm.send(
              new SendCommandCommand({
                InstanceIds: [v.InstanceId],
                DocumentName: `AthenaEngineering${kind === "evidence" ? "Evidence" : "PreviewGrant"}V1`,
                DocumentVersion: "1",
                DocumentHash:
                  kind === "evidence"
                    ? this.#config.evidenceDocumentHash
                    : this.preview().previewDocumentHash,
                DocumentHashType: "Sha256",
                Parameters: parameters,
                TimeoutSeconds: 30,
                CloudWatchOutputConfig: { CloudWatchOutputEnabled: false },
                MaxConcurrency: "1",
                MaxErrors: "0",
              }),
            ),
          true,
        ),
      );
    const deadline = Date.now() + 30_000;
    do {
      try {
        const raw = await this.clients.ssm.send(
          new GetCommandInvocationCommand({
            CommandId: sent.Command.CommandId,
            InstanceId: v.InstanceId,
          }),
        );
        const status = z.object({ Status: z.string() }).passthrough().parse(raw).Status;
        if (status === "Success")
          return z
            .object({
              Status: z.literal("Success"),
              StandardOutputContent: z.string().max(16384),
              StandardErrorContent: z.literal(""),
            })
            .passthrough()
            .parse(raw);
        if (!["Pending", "InProgress", "Delayed"].includes(status))
          throw new CloudProviderError("UNAVAILABLE");
      } catch (e) {
        if (!(e instanceof Error && e.name === "InvocationDoesNotExist"))
          throw new CloudProviderError("UNAVAILABLE");
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    throw new CloudProviderError("UNAVAILABLE");
  }
  async attest(
    resourceId: string,
    input: Pick<
      WorkspaceProvisionRequest,
      "companyId" | "workspaceId" | "repositoryId" | "workerId" | "generation"
    >,
  ) {
    const v = await this.read(resourceId),
      t = this.tags(v);
    for (const [key, value] of Object.entries(input)) {
      const tag =
        key === "companyId"
          ? "company"
          : key === "workspaceId"
            ? "workspace"
            : key === "repositoryId"
              ? "repository"
              : key === "workerId"
                ? "worker"
                : "generation";
      if (t[`athena:${tag}`] !== String(value))
        throw new CloudProviderError("SCOPE_MISMATCH");
    }
    if (v.State.Name !== "running") throw new CloudProviderError("UNAVAILABLE");
    const volumes = z
      .object({
        Volumes: z
          .array(
            z
              .object({
                VolumeId: z.string(),
                Size: z.literal(10),
                Encrypted: z.literal(true),
                State: z.literal("in-use"),
                Attachments: z
                  .array(
                    z
                      .object({ InstanceId: id, DeleteOnTermination: z.literal(true) })
                      .passthrough(),
                  )
                  .length(1),
              })
              .passthrough(),
          )
          .length(1),
      })
      .passthrough()
      .parse(
        await this.call(() =>
          this.clients.ec2.send(
            new DescribeVolumesCommand({
              VolumeIds: [v.BlockDeviceMappings[0]!.Ebs.VolumeId],
            }),
          ),
        ),
      );
    if (volumes.Volumes[0]?.Attachments[0]?.InstanceId !== v.InstanceId)
      throw new CloudProviderError("SCOPE_MISMATCH");
    const schedule = await this.call(() =>
      this.clients.scheduler.send(
        new GetScheduleCommand({
          Name: this.scheduleName(v),
          GroupName: this.#config.schedulerGroup,
        }),
      ),
    );
    this.validateSchedule(v, schedule);
    const groups = await this.call(() =>
      this.clients.ec2.send(
        new DescribeSecurityGroupsCommand({ GroupIds: [this.#config.securityGroupId] }),
      ),
    );
    const sg = groups.SecurityGroups?.[0];
    if (
      groups.SecurityGroups?.length !== 1 ||
      sg?.VpcId !== this.#config.vpcId ||
      sg.IpPermissions?.length !== 1
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    const rule = sg.IpPermissions[0]!;
    if (
      rule.IpProtocol !== "tcp" ||
      rule.FromPort !== 8080 ||
      rule.ToPort !== 8080 ||
      rule.IpRanges?.length ||
      rule.Ipv6Ranges?.length ||
      rule.PrefixListIds?.length ||
      rule.UserIdGroupPairs?.length !== 1 ||
      rule.UserIdGroupPairs[0]?.GroupId !== this.#config.previewSecurityGroupId
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    const result = await this.document(v, "evidence", {});
    const evidence = Ec2RuntimeEvidenceSchema.parse(
      JSON.parse(result.StandardOutputContent) as unknown,
    );
    if (
      evidence.runtimeDigest !== this.#config.runtimeDigest ||
      Date.parse(evidence.hardDeadline) <= this.now().getTime() ||
      Date.parse(evidence.hardDeadline) > v.LaunchTime.getTime() + 3_600_000
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    for (const [k, val] of Object.entries(input))
      if (evidence[k as keyof typeof evidence] !== val)
        throw new CloudProviderError("SCOPE_MISMATCH");
    return evidence;
  }
  async getStatus(resourceId: string) {
    return this.view(await this.read(resourceId));
  }
  async stop(resourceId: string) {
    await this.read(resourceId);
    await this.call(
      () =>
        this.clients.ec2.send(new StopInstancesCommand({ InstanceIds: [resourceId] })),
      true,
    );
  }
  async destroy(resourceId: string) {
    const v = await this.read(resourceId);
    if (v.State.Name !== "terminated")
      await this.call(
        () =>
          this.clients.ec2.send(
            new TerminateInstancesCommand({ InstanceIds: [resourceId] }),
          ),
        true,
      );
    await this.removeIngress(v);
  }
  async getUsage(resourceId: string): Promise<CloudUsage> {
    await this.read(resourceId);
    // Elapsed wall time is not actual billable running time after stop/start; do not invent cost or usage.
    return {
      runtimeSeconds: null,
      cpuSeconds: null,
      peakMemoryBytes: null,
      storageBytes: null,
      networkBytes: null,
      costUsd: null,
      costStatus: "UNKNOWN",
      observedAt: this.now().toISOString(),
    };
  }
  private preview() {
    const c = this.#config;
    if (
      !c.previewEnabled ||
      !c.previewDomain ||
      !c.previewListenerArn ||
      !c.previewCertificateArn ||
      !c.previewDocumentHash
    )
      throw new CloudProviderError("UNAVAILABLE");
    return {
      previewDomain: c.previewDomain,
      previewListenerArn: c.previewListenerArn,
      previewCertificateArn: c.previewCertificateArn,
      previewDocumentHash: c.previewDocumentHash,
    };
  }
  private groupName(v: Instance) {
    return `athena-${hash(v.InstanceId).slice(0, 24)}`;
  }
  private host(v: Instance) {
    return `${v.InstanceId}.${this.preview().previewDomain}`;
  }
  async getConnectionInfo(resourceId: string) {
    this.preview();
    const v = await this.read(resourceId);
    if (v.State.Name !== "running") throw new CloudProviderError("UNAVAILABLE");
    const listeners = await this.call(() =>
      this.clients.elb.send(
        new DescribeListenersCommand({
          ListenerArns: [this.preview().previewListenerArn],
        }),
      ),
    );
    const listener = listeners.Listeners?.[0];
    if (
      listeners.Listeners?.length !== 1 ||
      listener?.ListenerArn !== this.preview().previewListenerArn ||
      listener.Protocol !== "HTTPS" ||
      listener.Port !== 443 ||
      !listener.Certificates?.some(
        (cert) => cert.CertificateArn === this.preview().previewCertificateArn,
      )
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    return { privateHost: this.host(v), previewPort: 8080 as const };
  }
  private async groups(v: Instance) {
    try {
      return (
        (
          await this.clients.elb.send(
            new DescribeTargetGroupsCommand({ Names: [this.groupName(v)] }),
          )
        ).TargetGroups ?? []
      );
    } catch (e) {
      if (e instanceof Error && e.name === "TargetGroupNotFoundException") return [];
      throw new CloudProviderError("UNAVAILABLE");
    }
  }
  async write(resourceId: string, raw: unknown) {
    this.preview();
    const grant = CloudPreviewGrantSchema.parse(raw),
      v = await this.read(resourceId),
      t = this.tags(v);
    if (
      grant.companyId !== this.#config.companyId ||
      grant.workspaceId !== t["athena:workspace"] ||
      String(grant.generation) !== t["athena:generation"]
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    if (Date.parse(grant.expiresAt) <= this.now().getTime()) {
      await this.removeIngress(v);
      if (v.State.Name === "running")
        await this.document(v, "preview", {
          grant: [Buffer.from(JSON.stringify(grant)).toString("base64")],
        });
      return;
    }
    await this.document(v, "preview", {
      grant: [Buffer.from(JSON.stringify(grant)).toString("base64")],
    });
    const existing = await this.groups(v);
    if (existing.length > 1) throw new CloudProviderError("UNCERTAIN");
    const group =
      existing[0] ??
      (
        await this.call(
          () =>
            this.clients.elb.send(
              new CreateTargetGroupCommand({
                Name: this.groupName(v),
                VpcId: this.#config.vpcId,
                Protocol: "HTTP",
                Port: 8080,
                TargetType: "instance",
                HealthCheckPath: "/",
                Matcher: { HttpCode: "403" },
                Tags: [{ Key: "athena:company", Value: this.#config.companyId }],
              }),
            ),
          true,
        )
      ).TargetGroups?.[0];
    if (
      !group?.TargetGroupArn ||
      group.VpcId !== this.#config.vpcId ||
      group.Port !== 8080 ||
      group.TargetType !== "instance"
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    await this.call(
      () =>
        this.clients.elb.send(
          new RegisterTargetsCommand({
            TargetGroupArn: group.TargetGroupArn,
            Targets: [{ Id: resourceId, Port: 8080 }],
          }),
        ),
      true,
    );
    const rules =
      (
        await this.call(() =>
          this.clients.elb.send(
            new DescribeRulesCommand({
              ListenerArn: this.preview().previewListenerArn,
            }),
          ),
        )
      ).Rules ?? [];
    const matching = rules.filter((r) =>
      r.Conditions?.some(
        (c) => c.Field === "host-header" && c.Values?.includes(this.host(v)),
      ),
    );
    if (matching.length > 1) throw new CloudProviderError("UNCERTAIN");
    if (matching[0]) {
      if (
        matching[0].Actions?.length !== 1 ||
        matching[0].Actions[0]?.TargetGroupArn !== group.TargetGroupArn
      )
        throw new CloudProviderError("SCOPE_MISMATCH");
      return;
    }
    await this.call(
      () =>
        this.clients.elb.send(
          new CreateRuleCommand({
            ListenerArn: this.preview().previewListenerArn,
            Priority: 1 + (parseInt(hash(resourceId).slice(0, 6), 16) % 49999),
            Conditions: [{ Field: "host-header", Values: [this.host(v)] }],
            Actions: [{ Type: "forward", TargetGroupArn: group.TargetGroupArn }],
            Tags: [{ Key: "athena:company", Value: this.#config.companyId }],
          }),
        ),
      true,
    );
  }
  private async removeIngress(v: Instance) {
    if (!this.#config.previewEnabled) return;
    const rules =
      (
        await this.call(() =>
          this.clients.elb.send(
            new DescribeRulesCommand({
              ListenerArn: this.preview().previewListenerArn,
            }),
          ),
        )
      ).Rules ?? [];
    for (const r of rules.filter((r) =>
      r.Conditions?.some(
        (c) => c.Field === "host-header" && c.Values?.includes(this.host(v)),
      ),
    ))
      if (r.RuleArn)
        await this.call(
          () => this.clients.elb.send(new DeleteRuleCommand({ RuleArn: r.RuleArn })),
          true,
        );
    for (const g of await this.groups(v))
      if (g.TargetGroupArn)
        await this.call(
          () =>
            this.clients.elb.send(
              new DeleteTargetGroupCommand({ TargetGroupArn: g.TargetGroupArn }),
            ),
          true,
        );
  }
}
