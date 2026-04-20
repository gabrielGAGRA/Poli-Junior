# Premium ChatKit Multi-Agent Starter

A polished Vercel-ready Next.js starter for OpenAI Agent Builder + ChatKit.

## What it does

- Connects to one or many Agent Builder workflows
- Uses a secure server-side ChatKit session endpoint
- Gives users a premium chat UI with workflow switching
- Keeps identity anonymous with a browser-generated ID
- Requires no passwords or authentication for MVP use

## Environment variables

Create `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
NEXT_PUBLIC_DEFAULT_WORKFLOW_ID=wf_your_default_workflow_id_here
NEXT_PUBLIC_WORKFLOWS=[{"id":"wf_support","name":"Support Agent","description":"Handles FAQs, docs and customer questions"},{"id":"wf_sales","name":"Sales Agent","description":"Lead qualification and product guidance"}]
```

## Setup

```bash
npm install
npm run dev
```

## Deploy

Deploy directly to Vercel and set the same environment variables in Project Settings.

## Notes

- `NEXT_PUBLIC_WORKFLOWS` is a JSON array used by the agent switcher in the UI
- `NEXT_PUBLIC_DEFAULT_WORKFLOW_ID` is used when no workflow is selected yet
- File upload support is enabled in the UI only if your workflow/backend supports it through ChatKit hosted attachments
