'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChatKit, useChatKit } from '@openai/chatkit-react';
import { getAnonymousDeviceId } from '@/lib/device-id';
import type { WorkflowOption } from '@/lib/workflows';

function ChatInner({ workflowId }: { workflowId: string }) {
  const deviceId = useMemo(() => getAnonymousDeviceId(), []);
  const sessionStorageKey = `chatkit_client_secret_${workflowId}`;

  const { control } = useChatKit({
    api: {
      async getClientSecret(existing) {
        const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem(sessionStorageKey) : null;
        const current = existing ?? saved;

        const response = await fetch('/api/chatkit/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            existingClientSecret: current,
            user: deviceId,
            workflowId,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to create ChatKit session.');
        }

        const data = await response.json();

        if (typeof window !== 'undefined' && data?.client_secret) {
          window.sessionStorage.setItem(sessionStorageKey, data.client_secret);
        }

        return data.client_secret;
      },
    },
    theme: 'dark',
    composer: {
      placeholder: 'Message your agent…',
      attachments: {
        uploadStrategy: { type: 'hosted' },
        maxCount: 3,
        maxSize: 20 * 1024 * 1024,
        accept: {
          'application/pdf': ['.pdf'],
          'text/plain': ['.txt', '.md'],
          'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
        },
      },
    },
  });

  return <ChatKit control={control} className="chatkit-root" />;
}

export default function ChatShell({ workflowId }: { workflowId: string }) {
  return <ChatInner workflowId={workflowId} />;
}

export function PremiumShell({ workflows, defaultWorkflowId }: { workflows: WorkflowOption[]; defaultWorkflowId: string }) {
  const [activeWorkflowId, setActiveWorkflowId] = useState(defaultWorkflowId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeWorkflow = workflows.find((workflow) => workflow.id === activeWorkflowId) ?? workflows[0];

  useEffect(() => {
    setActiveWorkflowId(defaultWorkflowId);
  }, [defaultWorkflowId]);

  return (
    <main className="shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo" />
          <div>
            <p className="brand-title">Premium Agent Chat</p>
            <p className="brand-subtitle">OpenAI Agent Builder + ChatKit</p>
          </div>
        </div>

        <section className="panel side-section">
          <p className="side-title">Agents</p>
          <div className="agent-list">
            {workflows.map((workflow) => (
              <button
                key={workflow.id}
                className={`agent-button ${workflow.id === activeWorkflowId ? 'active' : ''}`}
                onClick={() => {
                  setActiveWorkflowId(workflow.id);
                  setSidebarOpen(false);
                }}
              >
                <span className="agent-name">{workflow.name}</span>
                <span className="agent-description">{workflow.description || workflow.id}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel side-section">
          <p className="side-title">Conversation</p>
          <div className="agent-list">
            <button className="utility-button" onClick={() => window.location.reload()}>Start fresh</button>
            <button className="utility-button" onClick={() => navigator.clipboard.writeText(activeWorkflow?.id || '')}>Copy workflow ID</button>
          </div>
        </section>

        <section className="panel side-section">
          <p className="side-title">App status</p>
          <div className="meta-grid">
            <span>Anonymous browser identity enabled.</span>
            <span>Workflow switching enabled.</span>
            <span>Hosted attachments enabled where supported.</span>
          </div>
        </section>
      </aside>

      <section className="main">
        <div className="panel topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="mobile-toggle" onClick={() => setSidebarOpen((v) => !v)}>Menu</button>
            <div>
              <h1 className="heading">{activeWorkflow?.name || 'Agent'}</h1>
              <p className="subheading">{activeWorkflow?.description || 'Published Agent Builder workflow'}</p>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="badge"><span className="status-dot" /> Live ChatKit session flow</div>
            <div className="workflow-chip">{activeWorkflow?.id}</div>
          </div>
        </div>

        <section className="panel chat-card">
          <div className="chat-header">
            <div>
              <p className="chat-title">Conversation</p>
              <p className="chat-description">Claude-like premium layout, adapted to ChatKit-compatible features only.</p>
            </div>
          </div>

          <div className="chat-body">
            {activeWorkflow ? (
              <div className="chat-frame">
                <ChatShell workflowId={activeWorkflow.id} />
              </div>
            ) : (
              <div className="empty-state">
                No workflow configured.
                <span className="code">NEXT_PUBLIC_WORKFLOWS=[{"id":"wf_example","name":"Example Agent"}]</span>
                <div className="tip-list">
                  <div className="tip-card">Add multiple published workflow IDs to switch between agents.</div>
                  <div className="tip-card">Use Agent Builder for logic, Vercel only for session creation and UI hosting.</div>
                </div>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
