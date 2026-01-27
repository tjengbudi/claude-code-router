/**
 * Story 7.6: Inline Model Override Directive - Test Suite
 *
 * Tests inline model override mechanism for prompt-level model selection.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  extractInlineModelOverride,
  validateModelFormat,
  extractTextFromRequest,
  extractInlineModelOverrideFromRequest,
  type AgentDetectionRequest,
  type Logger
} from '../src/utils/agentDetection';

// Mock Logger
const mockLogger: Logger = {
  debug: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
};

describe('Story 7.6: extractInlineModelOverride', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // AC1: Inline directive works at prompt level - beginning of prompt
  it('should extract model override from beginning of prompt', () => {
    const text = '<!-- CCR-MODEL-OVERRIDE: kiro,claude-sonnet-4 -->\nSome content';
    const result = extractInlineModelOverride(text);

    expect(result).toBe('kiro,claude-sonnet-4');
  });

  // AC1: Inline directive works at prompt level - middle of prompt
  it('should extract model override from middle of prompt', () => {
    const text = 'Some content <!-- CCR-MODEL-OVERRIDE: glm,glm-4-flash --> more content';
    const result = extractInlineModelOverride(text);

    expect(result).toBe('glm,glm-4-flash');
  });

  // AC1: Inline directive works at prompt level - end of prompt
  it('should extract model override from end of prompt', () => {
    const text = 'Some content\n<!-- CCR-MODEL-OVERRIDE: anthropic,claude-opus-4 -->';
    const result = extractInlineModelOverride(text);

    expect(result).toBe('anthropic,claude-opus-4');
  });

  // AC1: Case insensitivity - lowercase
  it('should be case insensitive - lowercase', () => {
    const text = '<!-- ccr-model-override: kiro,claude-sonnet-4 -->';
    const result = extractInlineModelOverride(text);

    expect(result).toBe('kiro,claude-sonnet-4');
  });

  // AC1: Case insensitivity - mixed case
  it('should be case insensitive - mixed case', () => {
    const text = '<!-- CcR-MoDeL-OvErRiDe: kiro,claude-sonnet-4 -->';
    const result = extractInlineModelOverride(text);

    expect(result).toBe('kiro,claude-sonnet-4');
  });

  // AC1: Whitespace tolerance around colon
  it('should tolerate whitespace around colon', () => {
    const text = '<!-- CCR-MODEL-OVERRIDE :  kiro,claude-sonnet-4  -->';
    const result = extractInlineModelOverride(text);

    expect(result).toBe('kiro,claude-sonnet-4');
  });

  // AC3: Invalid model format - no comma
  it('should return undefined when directive is not found', () => {
    const text = 'Some content without any directive';
    const result = extractInlineModelOverride(text);

    expect(result).toBeUndefined();
  });

  // Edge case: Empty string
  it('should return undefined for empty string', () => {
    const result = extractInlineModelOverride('');

    expect(result).toBeUndefined();
  });

  // Edge case: Malformed directive - missing closing tag
  it('should return undefined for malformed directive', () => {
    const text = '<!-- CCR-MODEL-OVERRIDE: kiro,claude-sonnet-4';
    const result = extractInlineModelOverride(text);

    expect(result).toBeUndefined();
  });

  // AC1: Multiple directives - should match first
  it('should extract first directive when multiple are present', () => {
    const text = '<!-- CCR-MODEL-OVERRIDE: kiro,claude-sonnet-4 --> Some <!-- CCR-MODEL-OVERRIDE: glm,glm-4-flash -->';
    const result = extractInlineModelOverride(text);

    expect(result).toBe('kiro,claude-sonnet-4');
  });
});

describe('Story 7.6: validateModelFormat', () => {
  // AC3: Valid format
  it('should return true for valid provider,model format', () => {
    expect(validateModelFormat('kiro,claude-sonnet-4')).toBe(true);
    expect(validateModelFormat('anthropic,claude-opus-4')).toBe(true);
    expect(validateModelFormat('glm,glm-4-flash')).toBe(true);
  });

  // AC3: Invalid format - no comma
  it('should return false when no comma present', () => {
    expect(validateModelFormat('kiro-claude-sonnet-4')).toBe(false);
    expect(validateModelFormat('just-one-part')).toBe(false);
  });

  // AC3: Invalid format - too many parts
  it('should return false when more than two parts', () => {
    expect(validateModelFormat('kiro,claude,sonnet-4')).toBe(false);
    expect(validateModelFormat('one,two,three,four')).toBe(false);
  });

  // AC3: Invalid format - empty provider
  it('should return false when provider is empty', () => {
    expect(validateModelFormat(',claude-sonnet-4')).toBe(false);
    expect(validateModelFormat('  ,claude-sonnet-4')).toBe(false);
  });

  // AC3: Invalid format - empty model
  it('should return false when model is empty', () => {
    expect(validateModelFormat('kiro,')).toBe(false);
    expect(validateModelFormat('kiro,  ')).toBe(false);
  });

  // AC3: Invalid format - both empty
  it('should return false when both parts are empty', () => {
    expect(validateModelFormat(',')).toBe(false);
    expect(validateModelFormat(' , ')).toBe(false);
  });

  // Edge case: Non-string input
  it('should return false for non-string input', () => {
    expect(validateModelFormat(undefined as any)).toBe(false);
    expect(validateModelFormat(null as any)).toBe(false);
    expect(validateModelFormat(123 as any)).toBe(false);
  });

  // AC1: Whitespace tolerance in validation
  it('should trim whitespace from provider and model', () => {
    expect(validateModelFormat('  kiro  ,  claude-sonnet-4  ')).toBe(true);
  });
});

describe('Story 7.6: Integration - Extract and Validate', () => {
  it('should extract and validate complete inline override', () => {
    const text = '<!-- CCR-MODEL-OVERRIDE: kiro,claude-sonnet-4 -->';
    const extracted = extractInlineModelOverride(text);

    expect(extracted).toBe('kiro,claude-sonnet-4');
    expect(validateModelFormat(extracted!)).toBe(true);
  });

  it('should extract but validate can detect invalid format', () => {
    const text = '<!-- CCR-MODEL-OVERRIDE: invalid-format -->';
    const extracted = extractInlineModelOverride(text);

    expect(extracted).toBe('invalid-format');
    expect(validateModelFormat(extracted!)).toBe(false);
  });
});

describe('Story 7.6: extractTextFromRequest', () => {
  it('should extract text from system prompt', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          { type: 'text', text: '<!-- CCR-MODEL-OVERRIDE: kiro,claude-sonnet-4 -->\nContent' }
        ]
      }
    };

    const result = extractTextFromRequest(req);

    expect(result).toContain('<!-- CCR-MODEL-OVERRIDE: kiro,claude-sonnet-4 -->');
  });

  it('should extract text from messages with string content', () => {
    const req: AgentDetectionRequest = {
      body: {
        messages: [
          { role: 'user', content: '<!-- CCR-MODEL-OVERRIDE: glm,glm-4-flash -->\nHello' }
        ]
      }
    };

    const result = extractTextFromRequest(req);

    expect(result).toContain('<!-- CCR-MODEL-OVERRIDE: glm,glm-4-flash -->');
  });

  it('should extract text from messages with array content', () => {
    const req: AgentDetectionRequest = {
      body: {
        messages: [
          {
            role: 'user',
            content: ['<!-- CCR-MODEL-OVERRIDE: anthropic,claude-opus-4 -->', 'Hello']
          }
        ]
      }
    };

    const result = extractTextFromRequest(req);

    expect(result).toContain('<!-- CCR-MODEL-OVERRIDE: anthropic,claude-opus-4 -->');
  });

  it('should combine text from system and messages', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [{ type: 'text', text: 'System text' }],
        messages: [{ role: 'user', content: 'Message text' }]
      }
    };

    const result = extractTextFromRequest(req);

    expect(result).toBe('System text\nMessage text');
  });

  it('should return undefined for empty request', () => {
    const req: AgentDetectionRequest = {};

    const result = extractTextFromRequest(req);

    expect(result).toBeUndefined();
  });

  it('should return undefined for request without body', () => {
    const req: AgentDetectionRequest = { body: undefined };

    const result = extractTextFromRequest(req);

    expect(result).toBeUndefined();
  });

  it('should skip non-text blocks in system', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          { type: 'text', text: 'Text content' },
          { type: 'image', source: { type: 'url', url: 'https://example.com/image.png' } } as any
        ]
      }
    };

    const result = extractTextFromRequest(req);

    expect(result).toBe('Text content');
  });
});

describe('Story 7.6: extractInlineModelOverrideFromRequest', () => {
  it('should extract override from system prompt', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          { type: 'text', text: '<!-- CCR-MODEL-OVERRIDE: kiro,claude-sonnet-4 -->\nContent' }
        ]
      }
    };

    const result = extractInlineModelOverrideFromRequest(req);

    expect(result).toBe('kiro,claude-sonnet-4');
  });

  it('should extract override from messages', () => {
    const req: AgentDetectionRequest = {
      body: {
        messages: [
          { role: 'user', content: '<!-- CCR-MODEL-OVERRIDE: glm,glm-4-flash -->\nHello' }
        ]
      }
    };

    const result = extractInlineModelOverrideFromRequest(req);

    expect(result).toBe('glm,glm-4-flash');
  });

  it('should extract override from array content in messages', () => {
    const req: AgentDetectionRequest = {
      body: {
        messages: [
          {
            role: 'user',
            content: ['<!-- CCR-MODEL-OVERRIDE: anthropic,claude-opus-4 -->', 'Hello']
          }
        ]
      }
    };

    const result = extractInlineModelOverrideFromRequest(req);

    expect(result).toBe('anthropic,claude-opus-4');
  });

  it('should return undefined when no override found', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [{ type: 'text', text: 'Just normal content' }]
      }
    };

    const result = extractInlineModelOverrideFromRequest(req);

    expect(result).toBeUndefined();
  });

  it('should return undefined for malformed request', () => {
    const req: AgentDetectionRequest = {};

    const result = extractInlineModelOverrideFromRequest(req);

    expect(result).toBeUndefined();
  });

  it('should extract from beginning of prompt in request', () => {
    const req: AgentDetectionRequest = {
      body: {
        messages: [
          { role: 'user', content: '<!-- CCR-MODEL-OVERRIDE: kiro,claude-sonnet-4 -->\nSome content' }
        ]
      }
    };

    const result = extractInlineModelOverrideFromRequest(req);

    expect(result).toBe('kiro,claude-sonnet-4');
  });

  it('should extract from middle of prompt in request', () => {
    const req: AgentDetectionRequest = {
      body: {
        messages: [
          { role: 'user', content: 'Some content <!-- CCR-MODEL-OVERRIDE: glm,glm-4-flash --> more content' }
        ]
      }
    };

    const result = extractInlineModelOverrideFromRequest(req);

    expect(result).toBe('glm,glm-4-flash');
  });

  it('should extract from end of prompt in request', () => {
    const req: AgentDetectionRequest = {
      body: {
        messages: [
          { role: 'user', content: 'Some content\n<!-- CCR-MODEL-OVERRIDE: anthropic,claude-opus-4 -->' }
        ]
      }
    };

    const result = extractInlineModelOverrideFromRequest(req);

    expect(result).toBe('anthropic,claude-opus-4');
  });
});

describe('Story 7.6: Priority Chain Integration', () => {
  // AC2: Priority chain - Priority 0 (inline override) overrides Priority 2 (subagent model)
  it('should extract inline override even when subagent model tag is present', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          { type: 'text', text: 'System content' },
          {
            type: 'text',
            text: '<CCR-SUBAGENT-MODEL>openai,gpt-4o</CCR-SUBAGENT-MODEL>\n<!-- CCR-MODEL-OVERRIDE: kiro,claude-sonnet-4 -->'
          }
        ]
      }
    };

    const result = extractInlineModelOverrideFromRequest(req);

    // Priority 0 (inline) should be found and would override Priority 2 (subagent)
    expect(result).toBe('kiro,claude-sonnet-4');
  });

  it('should prioritize inline override over subagent model in messages', () => {
    const req: AgentDetectionRequest = {
      body: {
        messages: [
          {
            role: 'user',
            content: 'Help me <!-- CCR-MODEL-OVERRIDE: glm,glm-4-flash --> with this <CCR-SUBAGENT-MODEL>openai,gpt-4o</CCR-SUBAGENT-MODEL> task'
          }
        ]
      }
    };

    const result = extractInlineModelOverrideFromRequest(req);

    // Inline override should take priority over subagent routing tag
    expect(result).toBe('glm,glm-4-flash');
  });

  it('should return subagent model when no inline override present', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          { type: 'text', text: 'System content' },
          {
            type: 'text',
            text: '<CCR-SUBAGENT-MODEL>anthropic,claude-opus-4</CCR-SUBAGENT-MODEL>\nDo this task'
          }
        ]
      }
    };

    const result = extractInlineModelOverrideFromRequest(req);

    // No inline override, should fall through to subagent model (Priority 2)
    expect(result).toBeUndefined();
  });
});
