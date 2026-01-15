/// <reference types="node" />

import { IncomingMessage, OutgoingMessage } from "node:http";

declare function onFinished<T extends IncomingMessage | OutgoingMessage>(
  msg: T,
  listener: (err: Error | null | undefined, msg: T) => void
): T;

declare namespace onFinished {
  function isFinished(msg: IncomingMessage | ServerResponse): boolean | undefined;
}

export = onFinished;
