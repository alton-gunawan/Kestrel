/**
 * Clearly-labeled WebMCP polyfill (D-013) — DEV/TEST ONLY.
 *
 * When the browser does not implement document.modelContext natively
 * (Chrome 149+ ships it behind an Origin Trial), this module installs a
 * minimal conforming implementation so the adapter, tool catalog, and the
 * entire WebMCP code path can run in development and in Playwright.
 *
 * The polyfill is IDENTIFIED: it sets window.__MEETINGOPS_WEBMCP_POLYFILL and
 * logs a console notice. The UI status badge shows "polyfill" vs "native" so
 * no one can mistake polyfilled registration for native support (honesty
 * rule: never claim unverified capability).
 */

interface StoredTool {
  tool: WebMCP.ModelContextTool;
  signal?: AbortSignal;
}

class PolyfilledModelContext extends EventTarget implements WebMCP.ModelContext {
  ontoolchange: ((this: WebMCP.ModelContext, ev: Event) => unknown) | null = null;
  private readonly tools = new Map<string, StoredTool>();

  async registerTool(tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions): Promise<void> {
    if (options?.signal?.aborted) return;
    this.tools.set(tool.name, { tool, signal: options?.signal });
    options?.signal?.addEventListener('abort', () => {
      this.tools.delete(tool.name);
      this.dispatchEvent(new Event('toolchange'));
    });
    this.dispatchEvent(new Event('toolchange'));
  }

  async getTools(): Promise<WebMCP.RegisteredTool[]> {
    return Array.from(this.tools.values()).map(({ tool }) => ({
      name: tool.name,
      title: tool.title ?? tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema ? structuredClone(tool.inputSchema) : undefined,
      window: window,
      origin: window.location.origin,
      annotations: tool.annotations ? { ...tool.annotations } : undefined,
    }));
  }
}

declare global {
  interface Window {
    __MEETINGOPS_WEBMCP_POLYFILL?: true;
    /** Test/verification hook: the polyfill's original tool definitions. */
    __MEETINGOPS_POLYFILL_TOOLS__?: Map<string, WebMCP.ModelContextTool>;
  }
}

export function installWebmcpPolyfillIfUnsupported(): boolean {
  // Already polyfilled (StrictMode re-runs this effect) — idempotent.
  if (typeof window !== 'undefined' && window.__MEETINGOPS_WEBMCP_POLYFILL === true) return true;
  if (typeof document !== 'undefined' && document.modelContext) return false;
  const ctx = new PolyfilledModelContext();
  // Test/verification hook (documented in the polyfill header): lets test
  // harnesses execute tools through the exact executor an agent invokes.
  const toolRegistry = new Map<string, WebMCP.ModelContextTool>();
  const nativeRegister = ctx.registerTool.bind(ctx);
  ctx.registerTool = async (tool, options) => {
    toolRegistry.set(tool.name, tool);
    return nativeRegister(tool, options);
  };
  if (typeof window !== 'undefined') {
    window.__MEETINGOPS_POLYFILL_TOOLS__ = toolRegistry;
  }
  Object.defineProperty(document, 'modelContext', {
    value: ctx,
    configurable: true,
    writable: false,
  });
  if (typeof window !== 'undefined') {
    window.__MEETINGOPS_WEBMCP_POLYFILL = true;
  }
  console.info(
    '[MeetingOps] Native document.modelContext not detected — installing the labeled MeetingOps dev polyfill (D-013). Tool calls in this mode are real API calls; native interoperability must be verified separately (docs/webmcp-native-verification.md).',
  );
  return true;
}
