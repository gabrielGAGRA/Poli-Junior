class FlowRuntimeError(Exception):
    """Base class for local flow runtime errors."""


class UnknownWorkflowError(FlowRuntimeError):
    """Raised when workflow_id is not registered in local runtime."""


class FlowNotImplementedError(FlowRuntimeError):
    """Raised when a local flow exists but cannot be executed yet."""


class FlowExecutionError(FlowRuntimeError):
    """Raised when execution of a local flow fails."""
