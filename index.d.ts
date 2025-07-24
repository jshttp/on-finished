/// <reference types="node" />

import { IncomingMessage, ServerResponse } from "node:http";

declare function onFinished<T extends IncomingMessage | ServerResponse>(
  msg: T,
  listener: (err: Error | null | undefiend, msg: T) => void
): T;

declare namespace onFinished {
  function isFinished(msg: IncomingMessage | ServerResponse): boolean;
}

export = onFinished;
