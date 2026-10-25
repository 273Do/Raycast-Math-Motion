import { Action, ActionPanel, Form, Icon, Keyboard, useNavigation } from "@raycast/api";
import { useCachedState, useForm } from "@raycast/utils";
import { useEffect } from "react";
import { Result } from "@/components/result";
import { useOllamaModels } from "@/hooks/use-ollama-models";
import { MotionRequest, OutputFormat, Quality } from "@/lib/types";
import { EXAMPLE_PROMPTS, FORMAT_OPTIONS, QUALITY_OPTIONS } from "@/constants";

type FormValues = {
  prompt: string;
  model: string;
  quality: string;
  format: string;
};

export function CreateForm() {
  const { push } = useNavigation();
  const { models, error, isLoading, revalidate } = useOllamaModels();
  const [lastModel, setLastModel] = useCachedState("last-model", "");

  const { handleSubmit, itemProps, setValue, values } = useForm<FormValues>({
    initialValues: { model: "", quality: "medium", format: "mp4" },
    validation: {
      prompt: (value) => (!value?.trim() ? "Describe the animation you want" : undefined),
      model: (value) => (!value ? "Choose a model" : undefined),
    },
    onSubmit(values) {
      const request: MotionRequest = {
        prompt: values.prompt.trim(),
        model: values.model,
        quality: values.quality as Quality,
        format: values.format as OutputFormat,
      };
      setLastModel(values.model);
      push(<Result request={request} />);
    },
  });

  useEffect(() => {
    if (!models || models.includes(values.model)) return;
    setValue("model", models.includes(lastModel) ? lastModel : (models[0] ?? ""));
  }, [models]);

  return (
    <Form
      navigationTitle="Create Math Motion"
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Generate Animation" icon={Icon.Wand} onSubmit={handleSubmit} />
          <Action
            title="Reload Models"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={revalidate}
          />
          <ActionPanel.Section title="Examples">
            {EXAMPLE_PROMPTS.map((example) => (
              <Action key={example} title={example} icon={Icon.Text} onAction={() => setValue("prompt", example)} />
            ))}
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.TextArea title="Prompt" placeholder={EXAMPLE_PROMPTS[0]} enableMarkdown={true} {...itemProps.prompt} />
      <Form.Separator />
      <Form.Dropdown title="Model" isLoading={isLoading} {...itemProps.model}>
        {models?.map((model) => (
          <Form.Dropdown.Item key={model} value={model} title={model} />
        ))}
      </Form.Dropdown>
      {error && <Form.Description title="Ollama" text={`${error.message}\nThen press ⌘R to reload.`} />}
      {models?.length === 0 && (
        <Form.Description title="Ollama" text="No models installed. Run `ollama pull <model>`, then press ⌘R." />
      )}
      <Form.Dropdown title="Quality" {...itemProps.quality}>
        {QUALITY_OPTIONS.map((q) => (
          <Form.Dropdown.Item key={q.value} value={q.value} title={q.title} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown title="Format" {...itemProps.format}>
        {FORMAT_OPTIONS.map((f) => (
          <Form.Dropdown.Item key={f.value} value={f.value} title={f.title} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
