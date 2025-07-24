import { IncomingMessage, ServerResponse, createServer } from "node:http";
import { expectTypeOf } from "expect-type";
import onFinished, { isFinished } from "..";

createServer((req, res) => {
  onFinished(req, (err, req) => {
    expectTypeOf(err).toEqualTypeOf<Error | null | undefined>();
    expectTypeOf(req).toEqualTypeOf<IncomingMessage>();
  });

  onFinished(res, (err, res) => {
    expectTypeOf(err).toEqualTypeOf<Error | null | undefined>();
    expectTypeOf(res).toEqualTypeOf<
      ServerResponse<IncomingMessage> & {
        req: IncomingMessage;
      }
    >();
  });

  expectTypeOf(isFinished(req)).toEqualTypeOf<boolean>();
  expectTypeOf(isFinished(res)).toEqualTypeOf<boolean>();
});
