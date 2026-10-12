import { createHash } from "node:crypto";

export class ToolSchemaError extends Error {
  constructor(message: string) { super(message); this.name = "ToolSchemaError"; }
}

type JsonSchema = Record<string, unknown>;
const allowed = new Set(["type", "description", "properties", "required", "additionalProperties", "items", "enum", "minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems"]);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

/** A deliberately small JSON Schema subset. Unknown constraints fail closed. */
export function normalizeSchema(value: unknown): JsonSchema {
  if (bytes(value) > 32_768) throw new ToolSchemaError("Schema exceeds 32 KiB.");
  let nodes = 0;
  function walk(node: unknown, depth: number): JsonSchema {
    if (!isObject(node) || depth > 8 || ++nodes > 200) throw new ToolSchemaError("Schema is malformed or too complex.");
    for (const key of Object.keys(node)) if (!allowed.has(key)) throw new ToolSchemaError(`Unsupported schema keyword: ${key}`);
    const type = node.type;
    if (!["object", "array", "string", "integer", "number", "boolean", "null"].includes(String(type))) throw new ToolSchemaError("A supported explicit type is required.");
    if (node.description !== undefined && (typeof node.description !== "string" || node.description.length > 500)) throw new ToolSchemaError("Invalid description.");
    if (node.enum !== undefined && (!Array.isArray(node.enum) || node.enum.length < 1 || node.enum.length > 50 || node.enum.some((item) => isObject(item) || Array.isArray(item)))) throw new ToolSchemaError("Invalid enum.");
    const result: JsonSchema = { type };
    if (node.description !== undefined) result.description = node.description;
    if (node.enum !== undefined) result.enum = node.enum;
    for (const key of ["minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum"]) {
      if (node[key] !== undefined) {
        if (typeof node[key] !== "number" || !Number.isFinite(node[key]) || (["minLength", "maxLength", "minItems", "maxItems"].includes(key) && (!Number.isInteger(node[key]) || node[key] < 0))) throw new ToolSchemaError(`Invalid ${key}.`);
        result[key] = node[key];
      }
    }
    if (type === "object") {
      if (!isObject(node.properties) || Object.keys(node.properties).length > 80 || node.additionalProperties !== false) throw new ToolSchemaError("Objects require bounded properties and additionalProperties: false.");
      if (!Array.isArray(node.required) || node.required.some((name) => typeof name !== "string" || !(name in (node.properties as Record<string, unknown>)))) throw new ToolSchemaError("Invalid required fields.");
      const properties: Record<string, JsonSchema> = {};
      for (const [key, child] of Object.entries(node.properties)) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key)) throw new ToolSchemaError("Invalid property name.");
        properties[key] = walk(child, depth + 1);
      }
      result.properties = properties;
      result.required = [...new Set(node.required)];
      result.additionalProperties = false;
    } else if (type === "array") {
      if (node.items === undefined || typeof node.maxItems !== "number" || node.maxItems > 100) throw new ToolSchemaError("Arrays need items and maxItems <= 100.");
      result.items = walk(node.items, depth + 1);
    } else if (node.properties !== undefined || node.required !== undefined || node.items !== undefined || node.additionalProperties !== undefined) throw new ToolSchemaError("Schema keywords do not match type.");
    return result;
  }
  return walk(value, 0);
}

export const schemaDigest = (schema: unknown) => createHash("sha256").update(JSON.stringify(normalizeSchema(schema))).digest("hex");

export function validateValue(schema: JsonSchema, value: unknown): void {
  function walk(node: JsonSchema, current: unknown, depth: number): void {
    if (depth > 8) throw new ToolSchemaError("Value is too deep.");
    const type = node.type;
    const matches = type === "object" ? isObject(current) : type === "array" ? Array.isArray(current) : type === "null" ? current === null : type === "integer" ? typeof current === "number" && Number.isInteger(current) : type === "number" ? typeof current === "number" && Number.isFinite(current) : typeof current === type;
    if (!matches) throw new ToolSchemaError("Value type does not match schema.");
    if (Array.isArray(node.enum) && !node.enum.includes(current)) throw new ToolSchemaError("Value is outside enum.");
    if (typeof current === "string" && ((typeof node.minLength === "number" && current.length < node.minLength) || (typeof node.maxLength === "number" && current.length > node.maxLength))) throw new ToolSchemaError("String constraint failed.");
    if (typeof current === "number" && ((typeof node.minimum === "number" && current < node.minimum) || (typeof node.maximum === "number" && current > node.maximum))) throw new ToolSchemaError("Number constraint failed.");
    if (Array.isArray(current)) {
      if ((typeof node.minItems === "number" && current.length < node.minItems) || (typeof node.maxItems === "number" && current.length > node.maxItems)) throw new ToolSchemaError("Array constraint failed.");
      for (const item of current) walk(node.items as JsonSchema, item, depth + 1);
    }
    if (isObject(current)) {
      const properties = node.properties as Record<string, JsonSchema>;
      for (const required of node.required as string[]) if (!(required in current)) throw new ToolSchemaError("Required field missing.");
      for (const [key, item] of Object.entries(current)) {
        if (!properties[key]) throw new ToolSchemaError("Unexpected field.");
        walk(properties[key], item, depth + 1);
      }
    }
  }
  if (bytes(value) > 65_536) throw new ToolSchemaError("Value exceeds 64 KiB.");
  walk(schema, value, 0);
}
