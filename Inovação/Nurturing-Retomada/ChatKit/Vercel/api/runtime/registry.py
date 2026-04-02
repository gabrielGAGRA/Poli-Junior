import os

from .errors import UnknownWorkflowError
from .flows_exported import run_ndados_exported
from .models import FlowRequest


def _ndados_workflow_ids() -> set[str]:
    """Workflow IDs that should be executed by local NDados exported flow."""

    configured = os.getenv("LOCAL_FLOW_NDADOS_IDS", "").strip()
    if configured:
        return {item.strip() for item in configured.split(",") if item.strip()}

    # Default only NDados active writer workflow. Can be overridden via env.
    return {"wf_69a712cef21c8190bcc1c573a9feaad40c5ca413b5fe04d2"}


async def execute_local_flow(workflow_id: str, payload: dict) -> dict[str, str]:
    request = FlowRequest(**payload)

    if workflow_id in _ndados_workflow_ids():
        return await run_ndados_exported(request)

    raise UnknownWorkflowError(
        f"workflow_id '{workflow_id}' nao registrado no runtime local."
    )
