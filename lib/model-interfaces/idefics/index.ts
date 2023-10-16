import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { CfnEndpoint } from "aws-cdk-lib/aws-sagemaker";
import { Construct } from "constructs";
import { Shared } from "../../shared";
import { SystemConfig } from "../../shared/types";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

interface IdeficsInterfaceProps {
  readonly shared: Shared;
  readonly config: SystemConfig;
  readonly messagesTopic: sns.Topic;
  readonly sessionsTable: dynamodb.Table;
  readonly byUserIdIndex: string;
}

export class IdeficsInterface extends Construct {
  public readonly ingestionQueue: sqs.Queue;
  public readonly requestHandler: lambda.Function;

  constructor(scope: Construct, id: string, props: IdeficsInterfaceProps) {
    super(scope, id);

    const requestHandler = new lambda.DockerImageFunction(
      this,
      "IdeficsInterfaceRequestHandler",
      {
        vpc: props.shared.vpc,
        code: lambda.DockerImageCode.fromImageAsset(
          path.join(__dirname, "./functions/request-handler")
        ),
        architecture: props.shared.lambdaArchitecture,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.minutes(15),
        memorySize: 1024,
        environment: {
          ...props.shared.defaultEnvironmentVariables,
          CONFIG_PARAMETER_NAME: props.shared.configParameter.parameterName,
          SESSIONS_TABLE_NAME: props.sessionsTable.tableName,
          SESSIONS_BY_USER_ID_INDEX_NAME: props.byUserIdIndex,
          MESSAGES_TOPIC_ARN: props.messagesTopic.topicArn,
        },
      }
    );

    props.sessionsTable.grantReadWriteData(requestHandler);
    props.messagesTopic.grantPublish(requestHandler);
    props.shared.configParameter.grantRead(requestHandler);

    const deadLetterQueue = new sqs.Queue(this, "GenericModelInterfaceDLQ");
    const queue = new sqs.Queue(this, "GenericModelInterfaceQueue", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#events-sqs-queueconfig
      visibilityTimeout: cdk.Duration.minutes(15 * 6),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    queue.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["sqs:SendMessage"],
        resources: [queue.queueArn],
        principals: [
          new iam.ServicePrincipal("events.amazonaws.com"),
          new iam.ServicePrincipal("sqs.amazonaws.com"),
        ],
      })
    );

    requestHandler.addEventSource(new lambdaEventSources.SqsEventSource(queue));

    this.ingestionQueue = queue;
    this.requestHandler = requestHandler;
  }

  public addSageMakerEndpoint({
    endpoint,
    name,
  }: {
    endpoint: CfnEndpoint;
    name: string;
  }) {
    this.requestHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["sagemaker:InvokeEndpoint"],
        resources: [endpoint.ref],
      })
    );
    const cleanName = name.replace(/[\s.\-_]/g, "").toUpperCase();
    this.requestHandler.addEnvironment(
      `SAGEMAKER_ENDPOINT_${cleanName}`,
      endpoint.attrEndpointName
    );
  }
}
