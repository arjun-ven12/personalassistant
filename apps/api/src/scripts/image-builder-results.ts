/** Read-only operator result verification. No AWS calls, release or READY mutation. */
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { ImageBuilderBuildRecordSchema } from "../cloud-engineering/image-builder-contract.js";

const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}-[a-f0-9]{17}$`));
const Image = z.object({
  Images: z
    .array(
      z.object({
        ImageId: id("ami"),
        OwnerId: z.literal("737073451069"),
        Public: z.literal(false),
        State: z.literal("available"),
        Architecture: z.literal("x86_64"),
        RootDeviceName: z.string(),
        BlockDeviceMappings: z
          .array(
            z.object({
              DeviceName: z.string(),
              Ebs: z.object({
                SnapshotId: id("snap"),
                VolumeSize: z.literal(10),
                DeleteOnTermination: z.literal(true),
              }),
            }),
          )
          .length(1),
        Tags: z.array(z.object({ Key: z.string(), Value: z.string() })),
      }),
    )
    .length(1),
});
const Snapshot = z.object({
  Snapshots: z
    .array(
      z.object({
        SnapshotId: id("snap"),
        OwnerId: z.literal("737073451069"),
        State: z.literal("completed"),
        VolumeSize: z.literal(10),
        Encrypted: z.literal(true),
      }),
    )
    .length(1),
});
const Build = z.object({
  image: z.object({
    arn: z.string().regex(/^arn:aws:imagebuilder:ap-southeast-1:737073451069:image\//),
    state: z.object({ status: z.literal("AVAILABLE") }),
    outputResources: z.object({
      amis: z
        .array(
          z.object({
            region: z.literal("ap-southeast-1"),
            image: id("ami"),
            accountId: z.literal("737073451069"),
          }),
        )
        .length(1),
    }),
  }),
});
const Document = z.object({
  Name: z.literal("AthenaEngineeringEvidenceV1"),
  Owner: z.literal("737073451069"),
  DocumentVersion: z.literal("1"),
  Status: z.literal("Active"),
  DocumentType: z.literal("Command"),
  HashType: z.literal("Sha256"),
  Hash: z.string().regex(/^[a-f0-9]{64}$/),
});
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 7)
    throw Error(
      "Expected get-image, describe-images, describe-snapshots, build-record, describe-document, get-document and reviewed evidence-document JSON paths",
    );
  const values = await Promise.all(
    args.map(async (path) => JSON.parse(await readFile(path, "utf8")) as unknown),
  );
  const build = Build.parse(values[0]);
  const image = Image.parse(values[1]).Images[0]!;
  const snapshot = Snapshot.parse(values[2]).Snapshots[0]!;
  const record = ImageBuilderBuildRecordSchema.parse(values[3]);
  const document = z.object({ Document: Document }).parse(values[4]).Document;
  const content = z
    .object({
      Name: z.literal("AthenaEngineeringEvidenceV1"),
      DocumentVersion: z.literal("1"),
      Content: z.string(),
    })
    .parse(values[5]);
  if (!isDeepStrictEqual(JSON.parse(content.Content) as unknown, values[6]))
    throw Error("AWS evidence document differs from reviewed document");
  const root = image.BlockDeviceMappings[0]!;
  if (
    root.DeviceName !== image.RootDeviceName ||
    root.Ebs.SnapshotId !== snapshot.SnapshotId ||
    build.image.outputResources.amis[0]!.image !== image.ImageId
  )
    throw Error("AMI/snapshot/run binding differs");
  const tags = Object.fromEntries(image.Tags.map((tag) => [tag.Key, tag.Value]));
  for (const [key, expected] of Object.entries({
    "athena:build": record.buildRevision,
    "athena:lock": record.lockSha256,
    "athena:payload": record.payloadSha256,
    "athena:release": "PENDING_LIVE_RELEASE_GATE",
    "athena:preview": "disabled",
    "athena:runtime-permissions": "inactive",
    "athena:tooling": record.toolingSha256,
  }))
    if (tags[key] !== expected) throw Error("AMI review pin differs");
  console.log(
    JSON.stringify(
      {
        amiId: image.ImageId,
        rootSnapshotId: snapshot.SnapshotId,
        sealedRuntimeSha256: record.sealedRuntimeSha256,
        AthenaEngineeringEvidenceV1Sha256: document.Hash,
        imageBuildArn: build.image.arn,
        buildInstanceId: record.buildInstanceId,
        status: "PENDING_LIVE_RELEASE_GATE",
        runtimePermissionsActivated: false,
        previewEnabled: false,
        limitation:
          "Operator must match buildInstanceId to this run's Image Builder build logs; tags alone do not prove record-to-run identity.",
      },
      null,
      2,
    ),
  );
}
main().catch(() => {
  console.error("Result verification failed. No release or READY action performed.");
  process.exitCode = 1;
});
