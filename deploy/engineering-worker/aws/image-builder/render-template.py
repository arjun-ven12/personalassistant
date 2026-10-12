"""Unprivileged deterministic renderer. Never contacts AWS or executes recipes."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ref = lambda name: {'Ref': name}
sub = lambda text: {'Fn::Sub': text}
get = lambda name, attr: {'Fn::GetAtt': [name, attr]}


def bash(name, command, timeout=600):
    return {'name': name, 'action': 'ExecuteBash', 'onFailure': 'Abort', 'maxAttempts': 1,
            'timeoutSeconds': timeout, 'inputs': {'commands': [command]}}


def python(name, file, prelude=''):
    return bash(name, prelude + "/usr/bin/python3 - <<'ATHENA_FIXED_PYTHON'\n" + (HERE / file).read_text() + '\nATHENA_FIXED_PYTHON')


def render():
    params = {
        'BaseAmiId': {'Type': 'String', 'AllowedPattern': 'ami-[a-f0-9]{17}', 'Description': 'Literal reviewed Ubuntu 24.04 x86_64 base AMI; no SSM alias. Retain reviewed preinstalled Snap SSM; exact version/revision and refresh hold required.'},
        'RootDeviceName': {'Type': 'String', 'AllowedValues': ['/dev/sda1', '/dev/xvda'], 'Description': 'Exact RootDeviceName of approved base; verify exactly one EBS root; only reviewed instance-store mappings may remain.'},
        'VpcId': {'Type': 'AWS::EC2::VPC::Id', 'Default': 'vpc-04179b719aaccf907'},
        'SubnetId': {'Type': 'AWS::EC2::Subnet::Id', 'Default': 'subnet-0c35a5bf3347d05ce', 'Description': 'Original subnet audit reference retained for existing stack parameters; builder uses its dedicated managed subnet.'},
        'BuildRouteTableId': {'Type': 'String', 'Default': 'rtb-08c9c017691e1b4a0', 'AllowedPattern': 'rtb-[a-f0-9]{17}', 'Description': 'Reviewed existing route table in this VPC with active Internet Gateway route; builder association only.'},
        'BuildRevision': {'Type': 'String', 'AllowedPattern': '[a-z0-9-]{1,40}', 'Description': 'Unique immutable review revision; never reuse after pins change.'},
        'RecipeVersion': {'Type': 'String', 'AllowedPattern': '[0-9]+\\.[0-9]+\\.[0-9]+', 'Default': '1.0.0'},
        'CompanyId': {'Type': 'String', 'AllowedPattern': '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'},
        'PayloadSha256': {'Type': 'String', 'AllowedPattern': '[a-f0-9]{64}'},
        'ToolingSha256': {'Type': 'String', 'AllowedPattern': '[a-f0-9]{64}'},
        'LockSha256': {'Type': 'String', 'AllowedPattern': '[a-f0-9]{64}'},
        'CreateImageBuilderServiceRole': {'Type': 'String', 'AllowedValues': ['true', 'false'], 'Default': 'false', 'Description': 'true only if AWSServiceRoleForImageBuilder does not exist. Separate AWS platform service role, never a runtime role.'},
    }
    pins = "export PAYLOAD_SHA256='${PayloadSha256}' TOOLS_SHA256='${ToolingSha256}' LOCK_SHA256='${LockSha256}' BASE_AMI='${BaseAmiId}'\n"
    seal = """import json, os, re, subprocess, urllib.request
from pathlib import Path
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
req = urllib.request.Request('http://169.254.169.254/latest/api/token', method='PUT', headers={'X-aws-ec2-metadata-token-ttl-seconds':'60'})
token = opener.open(req, timeout=3).read().decode()
req = urllib.request.Request('http://169.254.169.254/latest/meta-data/instance-id', headers={'X-aws-ec2-metadata-token':token})
iid = opener.open(req, timeout=3).read().decode()
if not re.fullmatch(r'i-[a-f0-9]{17}', iid): raise ValueError('Invalid instance identity')
# No stdout leak from installation: only the sealed non-secret digest is captured.
digest = subprocess.check_output(['/bin/sh','/opt/athena-build/image/install-image'], text=True, timeout=120).strip()
if not re.fullmatch(r'[a-f0-9]{64}', digest): raise ValueError('Invalid sealed runtime digest')
# Restart Docker once with its sealed settings, without starting task networks.
subprocess.run(['/usr/bin/systemctl','restart','docker.service'], check=True, timeout=60)
record = {'companyId':'${CompanyId}','schemaVersion':'1','baseAmiId':'${BaseAmiId}','buildInstanceId':iid,'buildRevision':'${BuildRevision}',
'payloadSha256':'${PayloadSha256}','toolingSha256':'${ToolingSha256}','lockSha256':'${LockSha256}',
'sealedRuntimeSha256':digest,'releaseStatus':'PENDING_LIVE_RELEASE_GATE','runtimePermissionsActivated':False,'previewEnabled':False}
Path('/etc/athena-image-build.json').write_text(json.dumps(record, sort_keys=True))
os.chmod('/etc/athena-image-build.json', 0o444)
print(iid, end='')
"""
    build = {'schemaVersion': '1.0', 'phases': [{'name': 'build', 'steps': [
        {'name': 'DownloadReviewedInputs', 'action': 'S3Download', 'onFailure': 'Abort', 'maxAttempts': 1, 'inputs': [
            {'source': 's3://${Artifacts}/inputs/${BuildRevision}/payload.tar', 'destination': '/tmp/athena-payload.tar', 'expectedBucketOwner': '${AWS::AccountId}', 'overwrite': False},
            {'source': 's3://${Artifacts}/inputs/${BuildRevision}/tools.tar', 'destination': '/tmp/athena-tools.tar', 'expectedBucketOwner': '${AWS::AccountId}', 'overwrite': False}]},
        python('InstallPinnedTooling', 'prepare.py', pins),
        {'name': 'RebootIntoPidBoundary', 'action': 'Reboot', 'onFailure': 'Abort', 'maxAttempts': 1, 'inputs': {'delaySeconds': 0}},
        bash('SealReviewedRuntime', "/usr/bin/python3 - <<'ATHENA_FIXED_PYTHON'\n" + seal + 'ATHENA_FIXED_PYTHON'),
        {'name': 'ExportBuildRecord', 'action': 'S3Upload', 'onFailure': 'Abort', 'maxAttempts': 1, 'inputs': [
            {'source': '/etc/athena-image-build.json', 'destination': 's3://${Artifacts}/evidence/${BuildRevision}/{{ build.SealReviewedRuntime.outputs.stdout }}.json', 'expectedBucketOwner': '${AWS::AccountId}'}]},
        python('RemoveBuildMaterial', 'cleanup.py'),
    ]}, {'name': 'validate', 'steps': [python('VerifyBuildImage', 'test.py')]}]}
    seal_component = {'schemaVersion': '1.0', 'phases': [
        {'name': 'build', 'steps': build['phases'][0]['steps'][3:]},
        build['phases'][1],
    ]}
    build['phases'] = [{'name': 'build', 'steps': build['phases'][0]['steps'][:3]}]
    tests = {'schemaVersion': '1.0', 'phases': [{'name': 'test', 'steps': [python('VerifyBootedPrivateImage', 'test.py')]}]}
    tags = {'athena:purpose': 'engineering-image-build', 'athena:company': ref('CompanyId'), 'athena:build': ref('BuildRevision'), 'athena:release': 'PENDING_LIVE_RELEASE_GATE'}
    resources = {
        'ImageBuilderServiceRole': {'Type': 'AWS::IAM::ServiceLinkedRole', 'Condition': 'CreateServiceRole', 'Properties': {'AWSServiceName': 'imagebuilder.amazonaws.com'}},
        'Artifacts': {'Type': 'AWS::S3::Bucket', 'DeletionPolicy': 'Retain', 'UpdateReplacePolicy': 'Retain', 'Properties': {
            'PublicAccessBlockConfiguration': {'BlockPublicAcls': True, 'BlockPublicPolicy': True, 'IgnorePublicAcls': True, 'RestrictPublicBuckets': True},
            'OwnershipControls': {'Rules': [{'ObjectOwnership': 'BucketOwnerEnforced'}]},
            'VersioningConfiguration': {'Status': 'Enabled'},
            'BucketEncryption': {'ServerSideEncryptionConfiguration': [{'ServerSideEncryptionByDefault': {'SSEAlgorithm': 'AES256'}}]},
            'LifecycleConfiguration': {'Rules': [{'Id': 'BoundIncompleteUploads', 'Status': 'Enabled', 'AbortIncompleteMultipartUpload': {'DaysAfterInitiation': 1}}]},
        }},
        'ArtifactsPolicy': {'Type': 'AWS::S3::BucketPolicy', 'Properties': {'Bucket': ref('Artifacts'), 'PolicyDocument': {'Version': '2012-10-17', 'Statement': [
            {'Effect': 'Deny', 'Principal': '*', 'Action': 's3:*', 'Resource': [get('Artifacts', 'Arn'), sub('${Artifacts.Arn}/*')], 'Condition': {'Bool': {'aws:SecureTransport': 'false'}}},
        ]}}},
        'BuildSecurityGroup': {'Type': 'AWS::EC2::SecurityGroup', 'Properties': {'GroupDescription': 'Image build only: no ingress, HTTPS AWS orchestration; never attached to runtime workers', 'VpcId': ref('VpcId'), 'SecurityGroupEgress': [{'IpProtocol': 'tcp', 'FromPort': 443, 'ToPort': 443, 'CidrIp': '0.0.0.0/0'}], 'Tags': [{'Key': k, 'Value': v} for k, v in tags.items()]}},
        'BuildRole': {'Type': 'AWS::IAM::Role', 'Properties': {'AssumeRolePolicyDocument': {'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'ec2.amazonaws.com'}, 'Action': 'sts:AssumeRole'}]}, 'Policies': [{'PolicyName': 'ReviewedImageBuildOnly', 'PolicyDocument': {'Version': '2012-10-17', 'Statement': [
            {'Effect': 'Allow', 'Action': ['s3:GetObject'], 'Resource': [sub('${Artifacts.Arn}/inputs/${BuildRevision}/payload.tar'), sub('${Artifacts.Arn}/inputs/${BuildRevision}/tools.tar')]},
            {'Effect': 'Allow', 'Action': ['s3:PutObject'], 'Resource': [sub('${Artifacts.Arn}/evidence/${BuildRevision}/*'), sub('${Artifacts.Arn}/logs/*')]},
            # AWS-owned AWSTOE bootstrap distribution, as documented in the AWS
            # instance-profile policy. No company bucket wildcards/read authority.
            {'Effect': 'Allow', 'Action': ['s3:GetObject'], 'Resource': 'arn:aws:s3:::ec2imagebuilder*'},
            {'Effect': 'Allow', 'Action': ['logs:CreateLogStream', 'logs:PutLogEvents'], 'Resource': get('BuildLogs', 'Arn')},
            {'Effect': 'Allow', 'Action': ['imagebuilder:GetComponent'], 'Resource': [ref('BuildComponent'), ref('SealComponent'), ref('TestComponent')]},
            {'Effect': 'Allow', 'Action': ['ssm:UpdateInstanceInformation', 'ssmmessages:CreateControlChannel', 'ssmmessages:CreateDataChannel', 'ssmmessages:OpenControlChannel', 'ssmmessages:OpenDataChannel'], 'Resource': '*', 'Condition': {'StringEquals': {'aws:RequestedRegion': 'ap-southeast-1'}}},
        ]}}]}},
        'BuildLogs': {'Type': 'AWS::Logs::LogGroup', 'Properties': {'LogGroupName': sub('/aws/imagebuilder/${AWS::StackName}'), 'RetentionInDays': 14}},
        'BuildProfile': {'Type': 'AWS::IAM::InstanceProfile', 'Properties': {'Roles': [ref('BuildRole')]}},
        'BuildComponent': {'Type': 'AWS::ImageBuilder::Component', 'Properties': {'Name': sub('${AWS::StackName}-build'), 'Version': ref('RecipeVersion'), 'Platform': 'Linux', 'Data': sub(json.dumps(build).replace('${Version}', '${!Version}').replace('${Architecture}', '${!Architecture}').replace('${binary:Package}', '${!binary:Package}').replace('${db:Status-Status}', '${!db:Status-Status}')), 'Tags': tags}},
        'SealComponent': {'Type': 'AWS::ImageBuilder::Component', 'Properties': {'Name': sub('${AWS::StackName}-seal'), 'Version': ref('RecipeVersion'), 'Platform': 'Linux', 'Data': sub(json.dumps(seal_component).replace('${Version}', '${!Version}').replace('${Architecture}', '${!Architecture}').replace('${db:Status-Status}', '${!db:Status-Status}')), 'Tags': tags}},
        'TestComponent': {'Type': 'AWS::ImageBuilder::Component', 'Properties': {'Name': sub('${AWS::StackName}-safe-tests'), 'Version': ref('RecipeVersion'), 'Platform': 'Linux', 'Data': sub(json.dumps(tests).replace('${Version}', '${!Version}').replace('${Architecture}', '${!Architecture}').replace('${db:Status-Status}', '${!db:Status-Status}')), 'Tags': tags}},
        'Recipe': {'Type': 'AWS::ImageBuilder::ImageRecipe', 'Properties': {'Name': sub('${AWS::StackName}-recipe'), 'Version': ref('RecipeVersion'), 'ParentImage': ref('BaseAmiId'), 'Components': [{'ComponentArn': ref('BuildComponent')}, {'ComponentArn': ref('SealComponent')}, {'ComponentArn': ref('TestComponent')}], 'BlockDeviceMappings': [{'DeviceName': ref('RootDeviceName'), 'Ebs': {'VolumeSize': 10, 'VolumeType': 'gp3', 'Encrypted': True, 'DeleteOnTermination': True}}], 'AdditionalInstanceConfiguration': {'SystemsManagerAgent': {'UninstallAfterBuild': False}}, 'Tags': tags}},
        'BuilderSubnet': {'Type': 'AWS::EC2::Subnet', 'Properties': {'VpcId': ref('VpcId'), 'CidrBlock': '10.84.0.128/26', 'AvailabilityZone': 'ap-southeast-1a', 'MapPublicIpOnLaunch': True, 'Tags': [{'Key': k, 'Value': v} for k, v in {**tags, 'Name': sub('${AWS::StackName}-build-subnet')}.items()]}},
        'BuilderRouteAssociation': {'Type': 'AWS::EC2::SubnetRouteTableAssociation', 'Properties': {'SubnetId': ref('BuilderSubnet'), 'RouteTableId': ref('BuildRouteTableId')}},
        'Infrastructure': {'Type': 'AWS::ImageBuilder::InfrastructureConfiguration', 'DependsOn': 'BuilderRouteAssociation', 'Properties': {'Name': sub('${AWS::StackName}-infrastructure'), 'InstanceProfileName': ref('BuildProfile'), 'InstanceTypes': ['c7i-flex.large'], 'SubnetId': ref('BuilderSubnet'), 'SecurityGroupIds': [ref('BuildSecurityGroup')], 'TerminateInstanceOnFailure': True, 'InstanceMetadataOptions': {'HttpTokens': 'required', 'HttpPutResponseHopLimit': 1}, 'Logging': {'S3Logs': {'S3BucketName': ref('Artifacts'), 'S3KeyPrefix': 'logs'}}, 'ResourceTags': tags, 'Tags': tags}},
        'Distribution': {'Type': 'AWS::ImageBuilder::DistributionConfiguration', 'Properties': {'Name': sub('${AWS::StackName}-private-distribution'), 'Distributions': [{'Region': 'ap-southeast-1', 'AmiDistributionConfiguration': {'Name': sub('athena-engineering-${BuildRevision}-{{ imagebuilder:buildDate }}'), 'AmiTags': {**tags, 'athena:lock': ref('LockSha256'), 'athena:payload': ref('PayloadSha256'), 'athena:preview': 'disabled', 'athena:runtime-permissions': 'inactive', 'athena:tooling': ref('ToolingSha256')}}}], 'Tags': tags}},
        'Pipeline': {'Type': 'AWS::ImageBuilder::ImagePipeline', 'Properties': {'Name': sub('${AWS::StackName}-pipeline'), 'ImageRecipeArn': ref('Recipe'), 'InfrastructureConfigurationArn': ref('Infrastructure'), 'DistributionConfigurationArn': ref('Distribution'), 'ImageTestsConfiguration': {'ImageTestsEnabled': True, 'TimeoutMinutes': 60}, 'Status': 'ENABLED', 'LoggingConfiguration': {'PipelineLogGroupName': ref('BuildLogs'), 'ImageLogGroupName': ref('BuildLogs')}, 'EnhancedImageMetadataEnabled': False, 'Tags': tags}},
    }
    return {'AWSTemplateFormatVersion': '2010-09-09', 'Description': 'Private Athena Engineering image production only. No runtime activation, preview, worker bootstrap or RELEASED attestation.',
        'Parameters': params, 'Rules': {'AccountAndRegion': {'Assertions': [
            {'Assert': {'Fn::Equals': [ref('AWS::AccountId'), '737073451069']}, 'AssertDescription': 'Reviewed owner account only'},
            {'Assert': {'Fn::Equals': [ref('AWS::Region'), 'ap-southeast-1']}, 'AssertDescription': 'Singapore only'}]}},
        'Conditions': {'CreateServiceRole': {'Fn::Equals': [ref('CreateImageBuilderServiceRole'), 'true']}}, 'Resources': resources,
        'Outputs': {'BuildSubnetId': {'Value': ref('BuilderSubnet')}, 'ArtifactsBucket': {'Value': ref('Artifacts')}, 'PipelineArn': {'Value': ref('Pipeline')}, 'BuildRoleArn': {'Value': get('BuildRole', 'Arn')}, 'InputPrefix': {'Value': sub('inputs/${BuildRevision}/')}, 'EvidencePrefix': {'Value': sub('evidence/${BuildRevision}/')}, 'ReleaseStatus': {'Value': 'PENDING_LIVE_RELEASE_GATE'}, 'RuntimePermissionsActivated': {'Value': 'false'}, 'PreviewEnabled': {'Value': 'false'}}}


if __name__ == '__main__':
    destination = HERE / 'image-builder.cloudformation.json'
    destination.write_text(json.dumps(render(), indent=2) + '\n')
    print(destination)
