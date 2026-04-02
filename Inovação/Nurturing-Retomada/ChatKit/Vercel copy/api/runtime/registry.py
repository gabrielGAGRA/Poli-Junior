from .errors import UnknownWorkflowError
from .flows_exported import run_ndados_exported
from .models import FlowRequest


async def execute_local_flow(workflow_id: str, payload: dict) -> dict[str, str]:
    if not workflow_id or not workflow_id.strip():
        raise UnknownWorkflowError("workflow_id ausente na requisição.")

    request = FlowRequest(**payload)
    return await run_ndados_exported(request)
