/**
 * WebMCP status context: exposes registration mode (native | polyfill |
 * unavailable), registered tool names, and errors. The UI must never imply
 * native support that does not exist (honesty rule).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { registerAllTools, isWebmcpNativelySupported, type WebmcpRegistrationResult } from './adapter';
import { installWebmcpPolyfillIfUnsupported } from './polyfill';

export type WebmcpMode = 'native' | 'polyfill' | 'unavailable';

export interface WebmcpStatus {
  mode: WebmcpMode;
  registeredTools: string[];
  errors: string[];
  ready: boolean;
}

const WebmcpStatusContext = createContext<WebmcpStatus>({
  mode: 'unavailable',
  registeredTools: [],
  errors: [],
  ready: false,
});

export function useWebmcpStatus(): WebmcpStatus {
  return useContext(WebmcpStatusContext);
}

export function WebmcpStatusProvider({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<WebmcpStatus>({
    mode: 'unavailable',
    registeredTools: [],
    errors: [],
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      // Native support first; only fall back to the labeled polyfill when the
      // browser does not implement document.modelContext.
      let mode: WebmcpMode = isWebmcpNativelySupported() ? 'native' : 'unavailable';
      if (mode === 'unavailable') {
        const installed = installWebmcpPolyfillIfUnsupported();
        mode = installed ? 'polyfill' : 'unavailable';
      }
      if (mode === 'unavailable') {
        if (!cancelled) setStatus({ mode, registeredTools: [], errors: [], ready: true });
        return;
      }
      const result: WebmcpRegistrationResult = await registerAllTools();
      // Registration is idempotent (module-level promise + getTools() check),
      // so StrictMode's double effect and native duplicate detection agree.
      if (cancelled) return;
      setStatus({
        mode,
        registeredTools: result.registeredTools,
        errors: result.errors,
        ready: true,
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return <WebmcpStatusContext.Provider value={status}>{children}</WebmcpStatusContext.Provider>;
}
