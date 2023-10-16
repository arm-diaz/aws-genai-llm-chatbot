import {
  Container,
  SpaceBetween,
  ExpandableSection,
  TextContent,
  Spinner,
  Box,
  Popover,
  Button,
  StatusIndicator,
} from "@cloudscape-design/components";
import {
  ChatBotConfiguration,
  ChatBotHistoryItem,
  ChatBotMessageType,
} from "./types";
import { JsonView, darkStyles } from "react-json-view-lite";
import ReactMarkdown from "react-markdown";
import { Dispatch } from "react";
import styles from "../../styles/chat.module.scss";

import "react-json-view-lite/dist/index.css";

export interface ChatMessageProps {
  message: ChatBotHistoryItem;
  configuration: ChatBotConfiguration;
  setConfiguration: Dispatch<React.SetStateAction<ChatBotConfiguration>>;
}

export default function ChatMessage(props: ChatMessageProps) {
  return (
    <div>
      {props.message?.type === ChatBotMessageType.AI && (
        <Container
          footer={
            props.message.metadata &&
            props.configuration.showMetadata && (
              <ExpandableSection variant="footer" headerText="Metadata">
                <JsonView data={props.message.metadata} style={darkStyles} />
              </ExpandableSection>
            )
          }
        >
          <SpaceBetween size="s" direction="vertical">
            {props.message.content.length === 0 ? (
              <Box float="left">
                <Spinner />
              </Box>
            ) : null}
            <ReactMarkdown children={props.message.content} />
            {props.message.content.length > 0 ? (
              <div className={styles.btn_chabot_message_copy}>
                <Popover
                  size="medium"
                  position="top"
                  triggerType="custom"
                  dismissButton={false}
                  content={
                    <StatusIndicator type="success">
                      Answer copied to clipboard
                    </StatusIndicator>
                  }
                >
                  <Button
                    variant="inline-icon"
                    iconName="copy"
                    onClick={() => {
                      navigator.clipboard.writeText(props.message.content);
                    }}
                  />
                </Popover>
              </div>
            ) : null}
          </SpaceBetween>
        </Container>
      )}
      {props.message?.type === ChatBotMessageType.Human && (
        <>
          {props.message.metadata.imageUrl &&
            props.message?.type === ChatBotMessageType.Human && (
              <img
                src={props.message.metadata.imageUrl as string}
                className={styles.img_chabot_message}
              />
            )}
          <TextContent>
            <strong>{props.message.content}</strong>
          </TextContent>
        </>
      )}
    </div>
  );
}
