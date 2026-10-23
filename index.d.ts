/// <reference types="node" />

import { IncomingMessage, OutgoingMessage } from "node:http";
import { Http2ServerRequest, Http2ServerResponse } from "node:http2";

type Message = IncomingMessage | OutgoingMessage | Http2ServerRequest | Http2ServerResponse;

declare function onFinished<T extends Message>(
  msg: T,
  listener: (err: Error | null | undefined, msg: T) => void
): T;

declare namespace onFinished {
  function isFinished(msg: Message): boolean | undefined;
}

export = onFinished;
