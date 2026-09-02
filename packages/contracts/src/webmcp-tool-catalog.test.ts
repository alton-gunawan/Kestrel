import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import {
  ALL_TOOLS,
  REQUIRED_TOOL_NAMES,
  getToolDefinition,
} from './webmcp-tool-catalog.js';
import { toJsonSchema } from './jsonschema.js';
import { executeApprovedProposalInputSchema, prepareMeetingProposalInputSchema } from './schemas.js';

const ajv = new Ajv({ allErrors: true, strict: false });

describe('webmcp tool catalog', () => {
  it('contains exactly the 21 documented tools (20 core + get_integrations)', () => {
    expect(ALL_TOOLS.map((t) => t.name)).toEqual([...REQUIRED_TOOL_NAMES]);
    expect(REQUIRED_TOOL_NAMES).toHaveLength(21);
  });

  it('exposes integration status as a read-only tool, not a mutation', () => {
    const integrations = getToolDefinition('get_integrations');
    expect(integrations).toBeDefined();
    expect(integrations?.sideEffect).toBe('read');
    expect(integrations?.annotations.readOnlyHint).toBe(true);
  });

  it('does not expose an approval tool', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(names).not.toContain('approve_proposal');
    expect(names.join(' ')).not.toMatch(/approve/i);
  });

  it('gives every tool a stable name, title, description, schema and annotations', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name).toMatch(/^[a-z0-9_.-]{1,128}$/);
      expect(tool.title.length).toBeGreaterThan(3);
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema).toBeTypeOf('object');
      expect(tool.annotations).toBeTypeOf('object');
    }
  });

  it('classifies side effects and annotations coherently', () => {
    for (const tool of ALL_TOOLS) {
      if (tool.sideEffect === 'read' || tool.sideEffect === 'verify') {
        expect(tool.annotations.readOnlyHint).toBe(true);
      } else {
        expect(tool.annotations.readOnlyHint ?? false).toBe(false);
      }
    }
    const mutatingNames = ALL_TOOLS.filter((t) => t.sideEffect === 'mutate').map((t) => t.name);
    expect(mutatingNames).toEqual([
      'create_meeting',
      'update_meeting',
      'create_agenda_item',
      'record_decision',
      'create_action_item',
      'assign_action_item',
      'schedule_followup',
    ]);
  });

  it('never accepts approval metadata in any input schema', () => {
    // Check property names recursively: no input field may carry approval
    // semantics ('approved' as a meeting *status enum value* is fine).
    const forbiddenKey = /approved|approval|allowExecute|approve/i;
    const findForbiddenKeys = (node: unknown, path: string): string[] => {
      const found: string[] = [];
      if (Array.isArray(node)) {
        node.forEach((item, i) => found.push(...findForbiddenKeys(item, `${path}[${i}]`)));
      } else if (node !== null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (key !== 'description' && forbiddenKey.test(key)) {
            found.push(`${path}.${key}`);
          }
          found.push(...findForbiddenKeys(value, `${path}.${key}`));
        }
      }
      return found;
    };
    for (const tool of ALL_TOOLS) {
      expect(findForbiddenKeys(tool.inputSchema, tool.name)).toEqual([]);
    }
  });

  it('getToolDefinition returns definitions by name', () => {
    expect(getToolDefinition('find_available_slots')?.name).toBe('find_available_slots');
    expect(getToolDefinition('not_a_tool')).toBeUndefined();
  });
});

describe('generated JSON schemas', () => {
  it('reject unknown fields at the JSON-Schema layer', () => {
    const schema = toJsonSchema(executeApprovedProposalInputSchema);
    const validate = ajv.compile(schema);
    expect(validate({ proposalId: 'prp_1', idempotencyKey: 'idem-12345678' })).toBe(true);
    expect(
      validate({
        proposalId: 'prp_1',
        idempotencyKey: 'idem-12345678',
        approved: true,
        approvedBy: 'agent',
      }),
    ).toBe(false);
  });

  it('generated schemas are valid JSON Schema for every tool', () => {
    for (const tool of ALL_TOOLS) {
      const validate = ajv.compile(tool.inputSchema);
      expect(typeof validate).toBe('function');
    }
  });

  it('bounds arrays and enum values as documented', () => {
    const schema = toJsonSchema(prepareMeetingProposalInputSchema) as {
      properties: Record<string, { maxItems?: number; minimum?: number; maximum?: number }>;
    };
    expect(schema.properties.participants?.maxItems).toBe(20);
    expect(schema.properties.agenda?.maxItems).toBe(20);
    expect(schema.properties.durationMinutes?.minimum).toBe(5);
    expect(schema.properties.durationMinutes?.maximum).toBe(180);
  });
});
