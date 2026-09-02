/**
 * Zod → JSON Schema conversion for WebMCP input schemas.
 *
 * docs/02_WEBMCP_SPEC.md requires strict JSON-Schema-compatible inputs.
 * Zod 4 provides z.toJSONSchema; we additionally enforce that every generated
 * schema closes open objects (`additionalProperties: false`) and validate a
 * small set of hard invariants with Ajv in tests.
 */
import { z } from 'zod';

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-7',
  });
  return closeOpenObjects(jsonSchema) as Record<string, unknown>;
}

/**
 * Recursively set `additionalProperties: false` on object schemas that do not
 * declare it, so unknown fields are rejected at the JSON-Schema layer too.
 */
function closeOpenObjects(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(closeOpenObjects);
  }
  if (node !== null && typeof node === 'object') {
    const obj = { ...(node as Record<string, unknown>) };
    if (obj.type === 'object' && obj.additionalProperties === undefined) {
      obj.additionalProperties = false;
    }
    for (const key of Object.keys(obj)) {
      obj[key] = closeOpenObjects(obj[key]);
    }
    return obj;
  }
  return node;
}
