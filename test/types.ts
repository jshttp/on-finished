import { ClientRequest, IncomingMessage, createServer } from "node:http";
import { Http2ServerRequest, Http2ServerResponse, createServer as createHttp2Server } from "node:http2";
import { expectTypeOf } from "expect-type";
import onFinished, { isFinished } from "..";

createServer((req, res) => {
  const returnedReq = onFinished(req, (err, req) => {
    expectTypeOf(err).toEqualTypeOf<Error | null | undefined>();
    expectTypeOf(req).toEqualTypeOf<IncomingMessage>();
  });

  const returnedRes = onFinished(res, (err, msg) => {
    expectTypeOf(err).toEqualTypeOf<Error | null | undefined>();
    expectTypeOf(msg).toEqualTypeOf<typeof res>();
  });

  expectTypeOf(returnedReq).toEqualTypeOf<typeof req>();
  expectTypeOf(returnedRes).toEqualTypeOf<typeof res>();
  expectTypeOf(isFinished(req)).toEqualTypeOf<boolean | undefined>();
  expectTypeOf(isFinished(res)).toEqualTypeOf<boolean | undefined>();
});

createHttp2Server((req, res) => {
  const returnedReq = onFinished(req, (err, req) => {
    expectTypeOf(err).toEqualTypeOf<Error | null | undefined>();
    expectTypeOf(req).toEqualTypeOf<Http2ServerRequest>();
  });

  const returnedRes = onFinished(res, (err, res) => {
    expectTypeOf(err).toEqualTypeOf<Error | null | undefined>();
    expectTypeOf(res).toEqualTypeOf<Http2ServerResponse<Http2ServerRequest>>();
  });

  expectTypeOf(returnedReq).toEqualTypeOf<typeof req>();
  expectTypeOf(returnedRes).toEqualTypeOf<typeof res>();
  expectTypeOf(isFinished(req)).toEqualTypeOf<boolean | undefined>();
  expectTypeOf(isFinished(res)).toEqualTypeOf<boolean | undefined>();
});

declare const clientRequest: ClientRequest;

const returnedClientRequest = onFinished(clientRequest, (err, req) => {
  expectTypeOf(err).toEqualTypeOf<Error | null | undefined>();
  expectTypeOf(req).toEqualTypeOf<ClientRequest>();
});

expectTypeOf(returnedClientRequest).toEqualTypeOf<ClientRequest>();
expectTypeOf(isFinished(clientRequest)).toEqualTypeOf<boolean | undefined>();
