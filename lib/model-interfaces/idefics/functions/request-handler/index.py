import os
import boto3
import json
import uuid
from datetime import datetime

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities import parameters
from aws_lambda_powertools.utilities.batch import BatchProcessor, EventType
from aws_lambda_powertools.utilities.batch.exceptions import BatchProcessingError
from aws_lambda_powertools.utilities.data_classes.sqs_event import SQSRecord
from aws_lambda_powertools.utilities.typing import LambdaContext

from chat_message_history import DynamoDBChatMessageHistory

from sagemaker.huggingface import HuggingFacePredictor

processor = BatchProcessor(event_type=EventType.SQS)
tracer = Tracer()
logger = Logger()

AWS_REGION = os.environ["AWS_REGION"]
MESSAGES_TOPIC_ARN = os.environ["MESSAGES_TOPIC_ARN"]

sns = boto3.client("sns", region_name=AWS_REGION)

sequence_number = 0


def send_to_client(detail):
    sns.publish(
        TopicArn=MESSAGES_TOPIC_ARN,
        Message=json.dumps(detail),
    )


def handle_run(record):
    connection_id = record["connectionId"]
    user_id = record["userId"]
    data = record["data"]
    provider = data["provider"]
    model_id = data["modelName"]
    mode = data["mode"]
    model_kwargs = data.get("modelKwargs", {})
    prompt = data["text"]
    session_id = data.get("sessionId")
    imageUrl = data.get(
        "imageUrl",
    )

    if not session_id:
        session_id = str(uuid.uuid4())

    chat_history = DynamoDBChatMessageHistory(
        table_name=os.environ["SESSIONS_TABLE_NAME"],
        session_id=session_id,
        user_id=user_id,
    )

    messages = chat_history.messages

    params = {
        "do_sample": True,
        "top_p": 0.2,
        "temperature": 0.4,
        "top_k": 50,
        "max_new_tokens": 512,
        "stop": ["User:", "<end_of_utterance>"],
    }

    params = {}
    if "temperature" in model_kwargs:
        params["temperature"] = model_kwargs["temperature"]
    if "topP" in model_kwargs:
        params["top_p"] = model_kwargs["topP"]
    if "maxTokens" in model_kwargs:
        params["max_new_tokens"] = model_kwargs["maxTokens"]

    vlm = HuggingFacePredictor(
        endpoint_name=model_id,
    )

    print("messages")
    print(messages)
    human_prompt_template = "User:{prompt}![]({imageUrl})"
    ai_prompt_template = "Assistant:{prompt}"

    prompts = []
    for message in messages:
        print(dir(message))
        print(message.type)
        print(message.content)
        print(message.additional_kwargs)
        if message.type == "human":
            prompts.append(
                human_prompt_template.format(prompt=message.content, imageUrl="")
            )
        if message.type == "ai":
            prompts.append(ai_prompt_template.format(prompt=message.content))

    prompts.append(human_prompt_template.format(prompt=prompt, imageUrl=imageUrl))
    prompts.append("<end_of_utterance>\nAssistant:")
    print(prompts)

    prompt_template = "\n".join(prompts)
    chat = vlm.predict({"inputs": prompt_template, "parameters": params})
    response = chat[0]["generated_text"][len(prompt_template) :].strip()
    metadata = {
        "modelId": model_id,
        "modelKwargs": model_kwargs,
        "mode": mode,
        "sessionId": session_id,
        "userId": user_id,
        "imageUrl": imageUrl,
    }

    chat_history.add_user_message(prompt)
    chat_history.add_metadata(metadata)
    chat_history.add_ai_message(response)

    response = {
        "sessionId": session_id,
        "type": "text",
        "content": response,
    }

    send_to_client(
        {
            "type": "text",
            "action": "final_response",
            "direction": "OUT",
            "connectionId": connection_id,
            "timestamp": str(int(round(datetime.now().timestamp()))),
            "userId": user_id,
            "data": response,
        }
    )


@tracer.capture_method
def record_handler(record: SQSRecord):
    payload: str = record.body
    message: dict = json.loads(payload)
    detail: dict = json.loads(message["Message"])
    logger.info(detail)

    if detail["action"] == "run":
        handle_run(detail)


def handle_failed_records(records):
    for triplet in records:
        status, error, record = triplet
        payload: str = record.body
        message: dict = json.loads(payload)
        detail: dict = json.loads(message["Message"])
        logger.info(detail)
        connection_id = detail["connectionId"]
        user_id = detail["userId"]
        data = detail.get("data", {})
        session_id = data.get("sessionId", "")

        send_to_client(
            {
                "type": "text",
                "action": "error",
                "direction": "OUT",
                "connectionId": connection_id,
                "userId": user_id,
                "timestamp": str(int(round(datetime.now().timestamp()))),
                "data": {
                    "sessionId": session_id,
                    "content": str(error),
                    "type": "text",
                },
            }
        )


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler
def handler(event, context: LambdaContext):
    batch = event["Records"]

    try:
        with processor(records=batch, handler=record_handler):
            processed_messages = processor.process()
    except BatchProcessingError as e:
        logger.error(e)

    logger.info(processed_messages)
    handle_failed_records(
        message for message in processed_messages if message[0] == "fail"
    )

    return processor.response()
