export type WorkflowOption = {
  id: string;
  name: string;
  description?: string;
};

export function getWorkflowOptions(): WorkflowOption[] {
  const raw = process.env.NEXT_PUBLIC_WORKFLOWS;
  const fallbackId = process.env.NEXT_PUBLIC_DEFAULT_WORKFLOW_ID;

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item?.id && item?.name);
      }
    } catch {}
  }

  if (fallbackId) {
    return [
      {
        id: fallbackId,
        name: 'Default Agent',
        description: 'Primary published workflow',
      },
    ];
  }

  return [];
}
