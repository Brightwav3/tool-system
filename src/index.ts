/**
 * Tool System — public entry point.
 */

export const PACKAGE_NAME = "tool-system";
export const CONTRACT_VERSION = "0.1.0";

export type {
  ContextBinding,
  ContinuationOutcome,
  ErrorOutcome,
  ExecutionArguments,
  ExecutionOutcome,
  ExecutionReport,
  ExecutionRequest,
  GuardConfig,
  LifecycleOutcome,
  ParameterSchema,
  ParameterType,
  ParameterValue,
  ResultOutcome,
  SideEffectClass,
  SilentOutcome,
  Taint,
  ToolDeclaration,
  ToolError,
  ToolErrorCode,
} from "./contracts.js";
export { toolError, validateDeclaration } from "./contracts.js";

export type { ValidationOutput } from "./validation.js";
export { validateArguments } from "./validation.js";

export type {
  ProcessBrokerLike,
  RegisteredTool,
  ToolContext,
  ToolHandler,
  ToolServices,
} from "./registry.js";
export { ToolRegistry } from "./registry.js";

export type { AllowlistPolicyConfig, PolicyDecider, PolicyDecision, PolicyQuery } from "./policy.js";
export { AllowlistPolicy, PermissivePolicy } from "./policy.js";

export type { AllowlistBrokerConfig, BrokerLaunch, ProcessBroker } from "./broker.js";
export { AllowlistProcessBroker, BrokerRejection } from "./broker.js";

export type { BindingOutput, ContextProvider } from "./bindings.js";
export { MapContextProvider, resolveBindings } from "./bindings.js";

export type { ExecutionStage, TraceEntry, TraceSink } from "./trace.js";
export { InMemoryTraceSink } from "./trace.js";

export type { Clock, ToolRuntimeOptions } from "./runtime.js";
export { ToolRuntime } from "./runtime.js";

export type { AppCatalog } from "./tools/open-app.js";
export { openAppDeclaration, openAppHandler } from "./tools/open-app.js";
