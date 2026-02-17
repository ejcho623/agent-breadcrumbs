import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import * as AjvFormats from "ajv-formats";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { ToolArguments } from "../types.js";

type JsonSchemaObject = Record<string, unknown>;

export function buildToolArgumentsValidator(inputSchema: Tool["inputSchema"]): ValidateFunction<ToolArguments> {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const addFormats =
    (AjvFormats as unknown as { default?: (instance: Ajv) => void }).default ??
    (AjvFormats as unknown as (instance: Ajv) => void);
  addFormats(ajv);
  return ajv.compile<ToolArguments>(inputSchema as JsonSchemaObject);
}

export function formatValidationErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) {
    return "Invalid arguments.";
  }

  return errors
    .map((error) => {
      const pathPrefix = error.instancePath ? `${error.instancePath} ` : "";
      return `${pathPrefix}${error.message ?? "is invalid"}`.trim();
    })
    .join("; ");
}
