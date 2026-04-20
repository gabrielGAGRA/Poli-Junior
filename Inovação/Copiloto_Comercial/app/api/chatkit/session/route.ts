import { NextRequest, NextResponse } from 'next/server';

const CHATKIT_URL = 'https://api.openai.com/v1/chatkit/sessions';

export async function POST(request: NextRequest) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const defaultWorkflowId = process.env.NEXT_PUBLIC_DEFAULT_WORKFLOW_ID;

    if (!openaiKey) {
      return NextResponse.json({ error: 'Missing OPENAI_API_KEY.' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const user = typeof body?.user === 'string' && body.user.trim() ? body.user.trim() : `anon_${crypto.randomUUID()}`;
    const workflowId = typeof body?.workflowId === 'string' && body.workflowId.trim() ? body.workflowId.trim() : defaultWorkflowId;

    if (!workflowId) {
      return NextResponse.json({ error: 'Missing workflowId and NEXT_PUBLIC_DEFAULT_WORKFLOW_ID.' }, { status: 500 });
    }

    const upstream = await fetch(CHATKIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
        'OpenAI-Beta': 'chatkit_beta=v1',
      },
      body: JSON.stringify({
        workflow: { id: workflowId },
        user,
      }),
      cache: 'no-store',
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error?.message || 'Failed to create ChatKit session.', details: data },
        { status: upstream.status }
      );
    }

    return NextResponse.json({
      client_secret: data.client_secret,
      user,
      workflowId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      },
      { status: 500 }
    );
  }
}
