import { Action, ActionPanel, Form, Icon, useNavigation } from "@raycast/api";
import { useForm } from "@raycast/utils";
import { Result } from "@/components/result";
import { MotionRequest, OutputFormat, Quality } from "@/lib/types";
import { EXAMPLE_PROMPTS, FORMAT_OPTIONS, QUALITY_OPTIONS } from "@/constants";

type FormValues = {
  prompt: string;
  quality: string;
  format: string;
};

export function CreateForm() {
  const { push } = useNavigation();

  const { handleSubmit, itemProps, setValue } = useForm<FormValues>({
    initialValues: { quality: "medium", format: "mp4" },
    validation: {
      prompt: (value) => (!value?.trim() ? "Describe the animation you want" : undefined),
    },
    onSubmit(values) {
      const request: MotionRequest = {
        prompt: values.prompt.trim(),
        quality: values.quality as Quality,
        format: values.format as OutputFormat,
      };
      push(<Result request={request} />);
    },
  });

  return (
    <Form
      navigationTitle="Create Math Motion"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Generate Animation" icon={Icon.Wand} onSubmit={handleSubmit} />
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
