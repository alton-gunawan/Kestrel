export {};

interface ToolHook {
  name: string;
  // Test hook returns raw tool results; assertions narrow them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input?: Record<string, unknown>) => Promise<any>;
}

declare global {
  interface Window {
    /** Test/verification hook exposing the polyfill's tool registry. */
    __MEETINGOPS_POLYFILL_TOOLS__?: Map<string, ToolHook>;
  }
}
