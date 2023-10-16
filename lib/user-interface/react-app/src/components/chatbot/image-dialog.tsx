import {
  Box,
  Button,
  Form,
  FormField,
  Input,
  Modal,
  SpaceBetween,
} from "@cloudscape-design/components";
import { useForm } from "../../common/hooks/use-form";
import { ChatBotConfiguration } from "./types";
import { Dispatch } from "react";

export interface ImageDialogProps {
  sessionId: string;
  visible: boolean;
  setVisible: (visible: boolean) => void;
  configuration: ChatBotConfiguration;
  setConfiguration: Dispatch<React.SetStateAction<ChatBotConfiguration>>;
}

export default function ImageDialog(props: ImageDialogProps) {
  const { data, onChange, errors, validate } = useForm({
    initialValue: () => {
      const retValue = {
        ...props.configuration,
        imageUrl: props.configuration.imageUrl,
        filesUrl: null,
      };

      return retValue;
    },
    validate: () => {
      const errors: Record<string, string | string[]> = {};
      return errors;
    },
  });

  const saveConfig = () => {
    if (!validate()) return;

    props.setConfiguration({
      ...props.configuration,
      ...data,
    });

    props.setVisible(false);
  };

  const cancelChanges = () => {
    onChange({
      ...props.configuration,
      imageUrl: props.configuration.imageUrl,
    });

    props.setVisible(false);
  };

  return (
    <Modal
      onDismiss={() => props.setVisible(false)}
      visible={props.visible}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs" alignItems="center">
            <Button variant="link" onClick={cancelChanges}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveConfig}>
              Save changes
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Add image to conversation"
    >
      <Form>
        <SpaceBetween size="m">
          <FormField
            label="Image URL"
            errorText={errors.imageUrl}
            description="You can set the URL of the image to be used for this conversation."
          >
            <Input
              value={data.imageUrl || ""}
              onChange={({ detail: { value } }) => {
                onChange({ imageUrl: value });
              }}
            />
          </FormField>
          {data.imageUrl && (
            <img src={data.imageUrl} style={{ width: "100px" }} />
          )}
        </SpaceBetween>
      </Form>
    </Modal>
  );
}
