import { ModelItem, LoadingStatus, WorkspaceItem } from "../../common/types";
import { SelectProps } from "@cloudscape-design/components";
import { ModelInterface } from "../../common/types";
export interface ChatBotConfiguration {
  streaming: boolean;
  showMetadata: boolean;
  maxTokens: number;
  temperature: number;
  topP: number;
  imageUrl: string | null | undefined;
}

export interface ChatInputState {
  value: string;
  workspaces?: WorkspaceItem[];
  models?: ModelItem[];
  selectedModel: SelectProps.Option | null;
  selectedModelMetadata: ModelItem | null;
  selectedWorkspace: SelectProps.Option | null;
  modelsStatus: LoadingStatus;
  workspacesStatus: LoadingStatus;
}

export enum ChatBotMessageType {
  AI = "ai",
  Human = "human",
}

export enum ChatBotAction {
  Run = "run",
  FinalResponse = "final_response",
  LLMNewToken = "llm_new_token",
  Error = "error",
}

export enum ChatBotModelInterface {
  Langchain = "langchain",
  Idefics = "idefics",
}

export enum ChatBotMode {
  Chain = "chain",
}

export interface ChatBotRunRequest {
  action: ChatBotAction.Run;
  modelInterface: ModelInterface;
  data: {
    modelName: string;
    provider: string;
    sessionId?: string;
    imageUrl: string | null;
    text: string;
    mode: string;
    workspaceId?: string;
    modelKwargs?: Record<string, string | boolean | number>;
  };
}

export interface ChatBotToken {
  sequenceNumber: number;
  runId?: string;
  value: string;
}

export interface ChatBotHistoryItem {
  type: ChatBotMessageType;
  content: string;
  metadata: Record<string, string | boolean | number>;
  tokens?: ChatBotToken[];
}

export interface ChatBotMessageResponse {
  action: ChatBotAction;
  data: {
    sessionId: string;
    token?: ChatBotToken;
    content?: string;
    metadata: Record<string, string | boolean | number>;
  };
}

export enum ChabotInputModality {
  Text = "TEXT",
  Image = "IMAGE",
}

export enum ChabotOutputModalities {
  Text = "TEXT",
  Image = "IMAGE",
}
