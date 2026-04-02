import importlib.util
import inspect
import json
from pathlib import Path
from types import ModuleType
from typing import Any
import os

from .errors import FlowExecutionError, FlowNotImplementedError
from .models import FlowRequest, coerce_flow_output


def _vercel_root() -> Path:
    # .../ChatKit/Vercel/api/runtime/flows_exported.py -> parents[2] == .../ChatKit/Vercel
    return Path(__file__).resolve().parents[2]


def _resolve_ndados_source_path() -> Path:
    """
    Resolve NDados file path exclusively inside Vercel flows folder.

    Priority:
    1) LOCAL_FLOWS_DIR + LOCAL_FLOW_NDADOS_FILE
    2) LOCAL_FLOWS_DIR + known default names
    3) Vercel/flows default names
    """

    flows_dir = (os.getenv("LOCAL_FLOWS_DIR") or "flows").strip()
    base = Path(flows_dir)
    if not base.is_absolute():
        base = _vercel_root() / base

    requested_name = (os.getenv("LOCAL_FLOW_NDADOS_FILE") or "").strip()
    candidates = []

    if requested_name:
        candidates.append((base / requested_name).resolve())

    candidates.extend([(base / "fluxo-NDados.py").resolve()])

    for candidate in candidates:
        if candidate.exists():
            return candidate

    # Keep deterministic message with first recommended location inside flows.
    return candidates[0]


def _load_module_from_path(path: Path, module_name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(module_name, str(path))
    if spec is None or spec.loader is None:
        raise FlowExecutionError(f"Nao foi possivel carregar modulo em {path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _build_workflow_input(module: ModuleType, request: FlowRequest) -> Any:
    workflow_input_cls = getattr(module, "WorkflowInput", None)
    if workflow_input_cls is None:
        raise FlowNotImplementedError("Arquivo exportado nao define WorkflowInput.")

    request_dict = request.model_dump()
    model_fields = getattr(workflow_input_cls, "model_fields", None)
    if isinstance(model_fields, dict):
        allowed = set(model_fields.keys())
        kwargs = {k: v for k, v in request_dict.items() if k in allowed}
    else:
        kwargs = {"input_as_text": request.input_as_text}

    if "input_as_text" not in kwargs:
        kwargs["input_as_text"] = request.input_as_text

    return workflow_input_cls(**kwargs)


async def run_ndados_exported(request: FlowRequest) -> dict[str, str]:
    """
    Executes the generated fluxo-NDados.py module with best-effort adapter.

    This is intentionally isolated so future exported flows can follow
    the same adapter pattern with minimal manual work.
    """

    source_path = _resolve_ndados_source_path()
    if not source_path.exists():
        raise FlowNotImplementedError(
            f"Arquivo exportado nao encontrado: {source_path}"
        )

    try:
        module = _load_module_from_path(source_path, "chatkit_fluxo_ndados")
    except Exception as exc:  # SyntaxError/import errors included
        raise FlowExecutionError(
            f"Falha ao carregar fluxo exportado ({source_path.name}): {exc}"
        ) from exc

    run_workflow = getattr(module, "run_workflow", None)
    if run_workflow is None:
        raise FlowNotImplementedError(
            "Arquivo exportado nao define funcao run_workflow."
        )

    workflow_input = _build_workflow_input(module, request)

    try:
        result = run_workflow(workflow_input)
        if inspect.isawaitable(result):
            result = await result
    except Exception as exc:
        raise FlowExecutionError(f"Erro ao executar fluxo exportado: {exc}") from exc

    if isinstance(result, str):
        try:
            result = json.loads(result)
        except json.JSONDecodeError as exc:
            raise FlowExecutionError(
                "Fluxo exportado retornou string nao-JSON."
            ) from exc

    try:
        return coerce_flow_output(result)
    except Exception as exc:
        raise FlowExecutionError(str(exc)) from exc
