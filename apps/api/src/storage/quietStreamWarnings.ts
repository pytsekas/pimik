import { PassThrough } from 'node:stream';

type ListenerWarning = Error & { emitter?: unknown };

/**
 * @google-cloud/storage streams every download through teeny-request, which wraps the
 * response in a PassThrough that the library's own pipeline then gives an 11th
 * `error`/`close` listener. The count is fixed per request (not a growing leak) but
 * Node warns about it on each larger download. Only that exact warning is dropped;
 * every other warning, including listener leaks on other emitters, still reaches stderr.
 */
export function silenceStorageStreamWarning(): void {
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const isStreamListenerWarning =
      warning instanceof Error &&
      warning.name === 'MaxListenersExceededWarning' &&
      (warning as ListenerWarning).emitter instanceof PassThrough;
    if (isStreamListenerWarning) return;
    (original as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
}
