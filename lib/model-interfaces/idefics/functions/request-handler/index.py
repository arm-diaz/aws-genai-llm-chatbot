import os
import json
import uuid
from datetime import datetime

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.batch import BatchProcessor, EventType
from aws_lambda_powertools.utilities.batch.exceptions import BatchProcessingError
from aws_lambda_powertools.utilities.data_classes.sqs_event import SQSRecord
from aws_lambda_powertools.utilities.typing import LambdaContext

from langchain.llms import SagemakerEndpoint

from genai_core.utils.files import get_signed_url
from genai_core.langchain import DynamoDBChatMessageHistory
from genai_core.utils.websocket import send_to_client
from genai_core.types import ChatbotAction

from content_handler import ContentHandler

processor = BatchProcessor(event_type=EventType.SQS)
tracer = Tracer()
logger = Logger()


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
    files = data.get("files", [])

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
        "return_full_text": False,
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

    print("messages")
    print(messages)
    human_prompt_template = "User:{prompt}"
    image_prompt_tempalte = "{imageUrl}"
    ai_prompt_template = "Assistant:{prompt}"

    prompts = []
    for message in messages:
        if message.type == "human":
            prompts.append(
                human_prompt_template.format(prompt=message.content, imageUrl="")
            )
        if message.type == "ai":
            prompts.append(ai_prompt_template.format(prompt=message.content))

    # prompts.append(human_prompt_template.format(prompt=prompt, imageUrl=imageUrl))
    for file in files:
        key = file["key"]
        prompts.append(
            image_prompt_tempalte.format(
                imageUrl=get_signed_url(os.environ["CHATBOT_FILES_BUCKET_NAME"], key)
            )
        )
    prompts.append(human_prompt_template.format(prompt=prompt))

    prompts.append("<end_of_utterance>\nAssistant:")
    print(prompts)

    prompt_template = "\n".join(prompts)

    llm = SagemakerEndpoint(
        endpoint_name=model_id,
        region_name=os.environ["AWS_REGION"],
        model_kwargs=params,
        content_handler=ContentHandler(),
    )

    llm_response = llm.predict(prompt_template)

    metadata = {
        "modelId": model_id,
        "modelKwargs": model_kwargs,
        "mode": mode,
        "sessionId": session_id,
        "userId": user_id,
        "files": files,
    }

    chat_history.add_user_message(prompt)
    chat_history.add_metadata(metadata)
    chat_history.add_ai_message(llm_response)

    response = {
        "sessionId": session_id,
        "type": "text",
        "content": llm_response,
    }

    send_to_client(
        {
            "type": "text",
            "action": ChatbotAction.FINAL_RESPONSE.value,
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
                "action": ChatbotAction.FINAL_RESPONSE.value,
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
