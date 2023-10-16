import {
  Box,
  Button,
  Form,
  FormField,
  Input,
  Modal,
  SpaceBetween,
  Spinner,
  FileUpload,
} from "@cloudscape-design/components";
import { useForm } from "../../common/hooks/use-form";
import { ChatBotConfiguration } from "./types";
import { Dispatch, useEffect, useState } from "react";
import { Storage } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";

export interface ImageDialogProps {
  sessionId: string;
  visible: boolean;
  setVisible: (visible: boolean) => void;
  configuration: ChatBotConfiguration;
  setConfiguration: Dispatch<React.SetStateAction<ChatBotConfiguration>>;
}

export default function ImageDialog(props: ImageDialogProps) {
  const [files, setFiles] = useState<File[]>([] as File[]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disableFileUpload, setDisableFileUpload] = useState<boolean>(false);
  const [disableUrl, setDisableUrl] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  

  const { onChange, errors, validate } = useForm({
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
      imageUrl: fileUrl,
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

  useEffect(() => {
    if (files.length === 0) {
      setDisableUrl(false);
      return;
    }
    setLoading(true);
    setDisableUrl(true);
    const file: File = files[0];
    const uploadFile = async () => {
      console.log(file);
      try {
        const id = uuidv4();
        const shortId = id.split("-")[0];
        const url = await Storage.put(shortId, file, {
          level: "public",
        });
        const signedUrl = await Storage.get(url.key, { level: "public", expires: 60 * 60 });
        setFileUrl(signedUrl);
      } catch (error) {
        const errorMessage = "Error uploading file: " + error;
        console.log(errorMessage);
        setError(errorMessage);
        setDisableUrl(false);
      } finally {
        setLoading(false);
      }
    };

    uploadFile();
  }, [files]);
  

  useEffect(() => {
    if (fileUrl) {
      setDisableFileUpload(true);
    } else {
      setDisableFileUpload(false);
    }
  }
  , [fileUrl]);

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
              Save
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Add image to conversation"
    >
      <Form>
        <SpaceBetween size="m">
          <FormField
            label="URL"
            errorText={errors.imageUrl}
            description="You can set the URL of the image to be used for this conversation."
          >
            <Input
              type="url"
              value={fileUrl as string}
              disabled={disableUrl}
              onChange={({ detail: { value } }) => {
                setFileUrl(value);
              }}
            />
          </FormField>
          <FormField
            label="Upload from device"
            errorText={errors.filesUrl}
            description="You can upload an image to be used for this conversation."
          >
            {!disableFileUpload && (
            <FileUpload
              onChange={({ detail }) => {
                setFiles(detail.value)
                setFileUrl(null);
              }}
              value={files}
              i18nStrings={{
                uploadButtonText: (e) => (e ? "Choose files" : "Choose file"),
                dropzoneText: (e) =>
                  e ? "Drop files to upload" : "Drop file to upload",
                removeFileAriaLabel: (e) => `Remove file ${e + 1}`,
                limitShowFewer: "Show fewer files",
                limitShowMore: "Show more files",
                errorIconAriaLabel: "Error",
              }}
              
              errorText={error}
              showFileThumbnail
              tokenLimit={3}
              constraintText=".png, .jpg, .jpeg"
            />
            )}
            {disableFileUpload && (
              <Button
                variant="primary"
                onClick={() => {
                  setFileUrl(null);
                  setFiles([]);
                  setDisableFileUpload(false);
                }}
              >
                Upload a file
              </Button>
            )}

          </FormField>
          {loading && (
          <Spinner />
          )}
          {fileUrl && (
            <img src={fileUrl} style={{ width: "100px" }} />
          )}
        </SpaceBetween>
      </Form>
    </Modal>
  );
}
