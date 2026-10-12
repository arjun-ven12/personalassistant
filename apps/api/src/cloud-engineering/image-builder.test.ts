import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ImageBuilderBuildRecordSchema,
  ImageBuilderToolLockSchema,
} from "./image-builder-contract.js";

type ComponentDocument = {
  phases: { steps: { onFailure: string; inputs: { commands?: string[] } }[] }[];
};
type Resource = {
  Type: string;
  Properties: {
    Data?: { "Fn::Sub": string };
    ManagedPolicyArns?: string[];
    Policies: { PolicyDocument: { Statement: { Action: string[] }[] } }[];
    InstanceTypes: string[];
    TerminateInstanceOnFailure: boolean;
    InstanceMetadataOptions: { HttpTokens: string };
    BlockDeviceMappings: { Ebs: Record<string, unknown> }[];
    AdditionalInstanceConfiguration: { UserDataOverride?: string };
    Distributions: {
      Region: string;
      AmiDistributionConfiguration: { LaunchPermissionConfiguration?: unknown };
    }[];
    ImageTestsConfiguration: { ImageTestsEnabled: boolean; TimeoutMinutes: number };
    EnhancedImageMetadataEnabled: boolean;
    Schedule?: unknown;
  };
};
type Template = {
  Parameters: Record<string, unknown>;
  Resources: Record<
    | "BuildRole"
    | "BuilderSubnet"
    | "BuilderRouteAssociation"
    | "BuildSecurityGroup"
    | "Infrastructure"
    | "Recipe"
    | "Distribution"
    | "Pipeline"
    | "BuildComponent"
    | "TestComponent"
    | "SealComponent",
    Resource
  >;
  Outputs: Record<"RuntimePermissionsActivated" | "PreviewEnabled", { Value: string }>;
};

const directory = fileURLToPath(
  new URL("../../../../deploy/engineering-worker/aws/image-builder/", import.meta.url),
);
const template = JSON.parse(
  readFileSync(`${directory}image-builder.cloudformation.json`, "utf8"),
) as Template;
const hash = "a".repeat(64);
const lock = {
  schemaVersion: "2",
  baseAmiId: `ami-${"a".repeat(17)}`,
  kernelAbi: "6.8.0-1000-aws",
  packageInventorySha256: hash,
  baseInventory: [
    "linux-aws",
    "linux-image-6.8.0-1000-aws",
    "linux-modules-6.8.0-1000-aws",
    "systemd",
    "cloud-init",
    "iproute2",
    "util-linux",
    "snapd",
    "python3-minimal",
    "python3.12",
    "python3.12-minimal",
    "libpython3.12-stdlib",
  ].map((name) => ({
    name,
    version: "1",
    architecture: "amd64",
    sourceRepository: `base-ami:ami-${"a".repeat(17)}`,
  })),
  nodeVersion: "24.21.0",
  ssmInstallation: {
    strategy: "deb",
    runtimeVersion: "3.3.5390.0",
    packageVersion: "3.3.5390.0-1",
    artifactSha256: hash,
  },
  dockerBase: `node@sha256:${hash}`,
  artifacts: Object.fromEntries(
    ["node", "ssm", "pnpm"].map((name) => [
      name,
      { file: `${name}.tar`, sha256: hash },
    ]),
  ),
  packages: [
    "git",
    "python3",
    "docker.io",
    "containerd",
    "runc",
    "iptables",
    "ca-certificates",
    "xz-utils",
  ].map((name) => ({
    name,
    version: "1.2.3-1",
    architecture: "amd64",
    sourceRepository: `http://archive.ubuntu.com/ubuntu/pool/${name}.deb`,
    file: `${name}.deb`,
    sha256: hash,
  })),
};

describe("reviewed Image Builder pins", () => {
  it("requires immutable compatible artifact and package identities", () => {
    expect(ImageBuilderToolLockSchema.safeParse(lock).success).toBe(true);
    for (const change of [
      { baseAmiId: "ssm:/latest" },
      { nodeVersion: "22.0.0" },
      { ssmInstallation: { ...lock.ssmInstallation, runtimeVersion: "3.3.2000.0" } },
      { dockerBase: "node:latest" },
      { runtimeEnabled: true },
      { packages: [...lock.packages, lock.packages[0]] },
      { packages: lock.packages.slice(1) },
      { artifacts: { ...lock.artifacts, node: { file: "../node.tar", sha256: hash } } },
      {
        artifacts: { ...lock.artifacts, pnpm: { file: "pnpm.tar", sha256: "UNKNOWN" } },
      },
      {
        packages: [
          ...lock.packages,
          { name: "openssh-server", version: "1", file: "ssh.deb", sha256: hash },
        ],
      },
    ])
      expect(ImageBuilderToolLockSchema.safeParse({ ...lock, ...change }).success).toBe(
        false,
      );
  });
  it("cannot upgrade build evidence into release or runtime trust", () => {
    const record = {
      schemaVersion: "1",
      baseAmiId: lock.baseAmiId,
      companyId: "11111111-1111-4111-8111-111111111111",
      buildInstanceId: `i-${"a".repeat(17)}`,
      buildRevision: "review-1",
      payloadSha256: hash,
      toolingSha256: hash,
      lockSha256: hash,
      sealedRuntimeSha256: hash,
      releaseStatus: "PENDING_LIVE_RELEASE_GATE",
      runtimePermissionsActivated: false,
      previewEnabled: false,
    };
    expect(ImageBuilderBuildRecordSchema.safeParse(record).success).toBe(true);
    for (const change of [
      { releaseStatus: "RELEASED" },
      { runtimePermissionsActivated: true },
      { previewEnabled: true },
    ])
      expect(
        ImageBuilderBuildRecordSchema.safeParse({ ...record, ...change }).success,
      ).toBe(false);
  });
});

describe("Image Builder infrastructure boundary", () => {
  it("limits public address assignment to the dedicated build subnet and preserves no ingress", () => {
    const resources = template.Resources;
    expect(resources.BuilderSubnet.Properties).toMatchObject({
      VpcId: { Ref: "VpcId" },
      CidrBlock: "10.84.0.128/26",
      AvailabilityZone: "ap-southeast-1a",
      MapPublicIpOnLaunch: true,
    });
    expect(resources.BuilderRouteAssociation.Properties).toEqual({
      SubnetId: { Ref: "BuilderSubnet" },
      RouteTableId: { Ref: "BuildRouteTableId" },
    });
    expect(resources.Infrastructure.Properties).toMatchObject({
      SubnetId: { Ref: "BuilderSubnet" },
      SecurityGroupIds: [{ Ref: "BuildSecurityGroup" }],
    });
    expect(resources.BuildSecurityGroup.Properties).not.toHaveProperty(
      "SecurityGroupIngress",
    );
    expect(resources.BuildSecurityGroup.Properties).toMatchObject({
      SecurityGroupEgress: [
        { IpProtocol: "tcp", FromPort: 443, ToPort: 443, CidrIp: "0.0.0.0/0" },
      ],
    });
    expect(
      Object.values(resources).filter((r) => r.Type === "AWS::EC2::Subnet"),
    ).toHaveLength(1);
    expect(
      Object.values(resources).some((r) =>
        ["AWS::EC2::Route", "AWS::EC2::NatGateway"].includes(r.Type),
      ),
    ).toBe(false);
  });

  it("keeps role separate, private distribution, bounds, tests and no automatic runtime activation", () => {
    const resources = template.Resources;
    expect(resources.BuildRole.Properties.ManagedPolicyArns).toBeUndefined();
    const statements =
      resources.BuildRole.Properties.Policies[0]!.PolicyDocument.Statement;
    const actions = statements.flatMap(
      (statement: { Action: string[] }) => statement.Action,
    );
    expect(
      actions.some((action: string) =>
        /^(iam|ec2|secretsmanager|kms|scheduler):/.test(action),
      ),
    ).toBe(false);
    expect(actions).not.toContain("ssm:SendCommand");
    expect(JSON.stringify(resources.BuildRole)).not.toMatch(
      /AthenaEngineeringWorker|AWS_ENGINEERING_CREDENTIAL|Railway|github/i,
    );
    expect(resources.Infrastructure.Properties.InstanceTypes).toEqual([
      "c7i-flex.large",
    ]);
    expect(resources.Infrastructure.Properties.TerminateInstanceOnFailure).toBe(true);
    expect(resources.Infrastructure.Properties.InstanceMetadataOptions.HttpTokens).toBe(
      "required",
    );
    expect(resources.Recipe.Properties.BlockDeviceMappings[0]!.Ebs).toMatchObject({
      VolumeSize: 10,
      Encrypted: true,
      DeleteOnTermination: true,
    });
    expect(
      resources.Recipe.Properties.AdditionalInstanceConfiguration.UserDataOverride,
    ).toBeUndefined();
    expect(resources.Distribution.Properties.Distributions).toHaveLength(1);
    expect(resources.Distribution.Properties.Distributions[0]!.Region).toBe(
      "ap-southeast-1",
    );
    expect(
      resources.Distribution.Properties.Distributions[0]!.AmiDistributionConfiguration
        .LaunchPermissionConfiguration,
    ).toBeUndefined();
    expect(
      resources.Pipeline.Properties.ImageTestsConfiguration.ImageTestsEnabled,
    ).toBe(true);
    // AWS still validates this ignored legacy field: minimum 60, maximum 1440.
    expect(resources.Pipeline.Properties.EnhancedImageMetadataEnabled).toBe(false);
    expect(resources.Pipeline.Properties.ImageTestsConfiguration.TimeoutMinutes).toBe(
      60,
    );
    expect(resources.Pipeline.Properties.Schedule).toBeUndefined();
    expect(template.Outputs.RuntimePermissionsActivated.Value).toBe("false");
    expect(template.Outputs.PreviewEnabled.Value).toBe("false");
    expect(Object.values(resources).some((r) => r.Type === "AWS::SSM::Document")).toBe(
      false,
    );
  });
  it("fits AWS component/Console limits and renders without unknown substitutions", () => {
    expect(Buffer.byteLength(JSON.stringify(template))).toBeLessThan(51_200);
    const names = new Set([
      ...Object.keys(template.Parameters),
      ...Object.keys(template.Resources),
      "AWS::AccountId",
      "AWS::Region",
      "AWS::StackName",
    ]);
    for (const resource of Object.values(template.Resources)) {
      if (resource.Type !== "AWS::ImageBuilder::Component") continue;
      const data = resource.Properties.Data!["Fn::Sub"];
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(16_000);
      for (const match of data.matchAll(/\$\{([^}]+)\}/g))
        expect(match[1]!.startsWith("!") || names.has(match[1]!)).toBe(true);
      const document = JSON.parse(
        data.replace(/\$\{!([^}]+)\}/g, "${$1}"),
      ) as ComponentDocument;
      for (const phase of document.phases)
        for (const step of phase.steps) {
          expect(step.onFailure).toBe("Abort");
          for (const command of step.inputs.commands ?? []) {
            // AWSTOE treats Docker Go-template braces as undeclared parameters.
            // Construct those fixed delimiters only at runtime, after AWSTOE parsing.
            expect(command).not.toMatch(/\{\{/);
            // Parse shell only. Never execute build commands or root operations.
            execFileSync("/bin/bash", ["-n"], { input: command });
          }
        }
    }
  });
  it("generated template exactly matches reviewed fixed recipe sources", () => {
    const result = execFileSync(
      "python3",
      [
        "-c",
        "import importlib.util,json,sys;s=importlib.util.spec_from_file_location('r',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.render()))",
        `${directory}render-template.py`,
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(result)).toEqual(template);
  });
  it("rejects traversal, symlinks, duplicate members and wrong digest without privileged execution", () => {
    const script = `import importlib.util,sys,tempfile,tarfile,io,hashlib
from pathlib import Path
s=importlib.util.spec_from_file_location('p',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'input.tar'
 for kind in ('traversal','symlink','duplicate','digest'):
  with tarfile.open(p,'w') as t:
   member=tarfile.TarInfo('../escape' if kind=='traversal' else 'safe')
   if kind=='symlink': member.type=tarfile.SYMTYPE;member.linkname='/etc/shadow'
   else: member.size=1
   t.addfile(member, None if kind=='symlink' else io.BytesIO(b'x'))
   if kind=='duplicate': t.addfile(member,io.BytesIO(b'x'))
  expected='0'*64 if kind=='digest' else hashlib.sha256(p.read_bytes()).hexdigest()
  try: m.extract(p,Path(d)/'out',expected)
  except ValueError: continue
  raise Exception('unsafe archive accepted')
 print('four-negative-archive-gates-passed')`;
    expect(
      execFileSync("python3", ["-c", script, `${directory}prepare.py`], {
        encoding: "utf8",
      }).trim(),
    ).toBe("four-negative-archive-gates-passed");
  });
});
