import { PremiumShell } from '@/components/chat-shell';
import { getWorkflowOptions } from '@/lib/workflows';

export default function HomePage() {
  const workflows = getWorkflowOptions();
  const defaultWorkflowId = process.env.NEXT_PUBLIC_DEFAULT_WORKFLOW_ID || workflows[0]?.id || '';

  return <PremiumShell workflows={workflows} defaultWorkflowId={defaultWorkflowId} />;
}
