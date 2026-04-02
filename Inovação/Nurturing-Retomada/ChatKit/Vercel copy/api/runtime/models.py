from typing import Any

from pydantic import BaseModel, ConfigDict


class FlowRequest(BaseModel):
    """Normalized local flow input based on current GAS payload."""

    model_config = ConfigDict(extra="allow")

    input_as_text: str = "Processar."
    cadencia: str | None = None
    etapa: int | None = None
    emails_anteriores: str | None = None
    owner_id: str | None = None


class FlowOutput(BaseModel):
    """Expected output shape consumed by GAS/Pipedrive path."""

    titulo: str
    corpo_html: str


def coerce_flow_output(raw_result: Any) -> dict[str, str]:
    """Normalize any flow result to the exact title/body contract."""

    if isinstance(raw_result, dict):
        if "titulo" in raw_result and "corpo_html" in raw_result:
            return FlowOutput(**raw_result).model_dump()

        if "output_parsed" in raw_result and isinstance(
            raw_result["output_parsed"], dict
        ):
            parsed = raw_result["output_parsed"]
            return FlowOutput(**parsed).model_dump()

    raise ValueError(
        "Fluxo local retornou formato inválido. Esperado dict com 'titulo' e 'corpo_html'."
    )
