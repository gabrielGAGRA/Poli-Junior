import importlib.util
import inspect
import json
from pathlib import Path
from types import ModuleType
from typing import Any

from .errors import FlowExecutionError, FlowNotImplementedError


def _vercel_root() -> Path:
    # .../ChatKit/Vercel/api/runtime/flows_exported.py -> parents[2] == .../ChatKit/Vercel
    return Path(__file__).resolve().parents[2]


def _resolve_ndados_source_path() -> Path:
    """Resolve NDados source using a fixed, low-config convention."""

    base = (_vercel_root() / "flows").resolve()
    candidates = [
        (base / "fluxo-NDados.py").resolve(),
        (base / "fluxo_NDados.py").resolve(),
    ]

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


def _normalized_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "input_as_text": payload.get("input_as_text") or "Processar.",
        "cadencia": payload.get("cadencia"),
        "etapa": payload.get("etapa"),
        "emails_anteriores": payload.get("emails_anteriores") or "",
        "owner_id": payload.get("owner_id"),
    }


def _build_workflow_input(module: ModuleType, payload: dict[str, Any]) -> Any:
    workflow_input_cls = getattr(module, "WorkflowInput", None)
    if workflow_input_cls is None:
        raise FlowNotImplementedError("Arquivo exportado nao define WorkflowInput.")

    normalized = _normalized_payload(payload)
    model_fields = getattr(workflow_input_cls, "model_fields", None)
    if isinstance(model_fields, dict):
        allowed = set(model_fields.keys())
        kwargs = {k: v for k, v in normalized.items() if k in allowed}
    else:
        kwargs = {"input_as_text": normalized["input_as_text"]}

    if "input_as_text" not in kwargs:
        kwargs["input_as_text"] = normalized["input_as_text"]

    return workflow_input_cls(**kwargs)


def _coerce_flow_output(raw_result: Any) -> dict[str, str]:
    if isinstance(raw_result, dict):
        if "titulo" in raw_result and "corpo_html" in raw_result:
            return {
                "titulo": str(raw_result["titulo"]),
                "corpo_html": str(raw_result["corpo_html"]),
            }

        parsed = raw_result.get("output_parsed")
        if isinstance(parsed, dict) and "titulo" in parsed and "corpo_html" in parsed:
            return {
                "titulo": str(parsed["titulo"]),
                "corpo_html": str(parsed["corpo_html"]),
            }

    raise FlowExecutionError(
        "Fluxo local retornou formato invalido. Esperado dict com 'titulo' e 'corpo_html'."
    )


async def run_ndados_exported(payload: dict[str, Any]) -> dict[str, str]:
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

    workflow_input = _build_workflow_input(module, payload)

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

    return _coerce_flow_output(result)
