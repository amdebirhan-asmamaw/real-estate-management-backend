import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(
  context: RequestContext,
  callback: () => T,
): T => storage.run(context, callback);

export const getRequestId = (): string | undefined =>
  storage.getStore()?.requestId;
