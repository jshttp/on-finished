2.4.2
=====

  * Use `writableEnded` instead of deprecated `finished`, with a fallback for older Node.js versions (#54)

2.4.1
=====

  * Fix error on early async hooks implementations

2.4.0
=====

  * Prevent loss of async hooks context

2.3.0
=====

  * Add defined behavior for HTTP `CONNECT` requests
  * Add defined behavior for HTTP `Upgrade` requests
  * deps: ee-first@1.1.1

2.2.1
=====

  * Fix `isFinished(req)` when data buffered

2.2.0
=====

  * Add message object to callback arguments

2.1.1
=====

  * Fix handling of pipelined requests

2.1.0
=====

  * Check if `socket` is detached
  * Return `undefined` for `isFinished` if state unknown

2.0.0
=====

  * Add `isFinished` function
  * Move to `jshttp` organization
  * Remove support for plain socket argument
  * Rename to `on-finished`
  * Support both `req` and `res` as arguments
  * deps: ee-first@1.0.5

1.2.2
=====

  * Reduce listeners added to emitters
    - avoids "event emitter leak" warnings when used multiple times on same request

1.2.1
=====

  * Fix returned value when already finished

1.2.0
=====

  * Call callback when called on already-finished socket

1.1.4
=====

  * Support node.js 0.8

1.1.3
=====

  * Make sure errors passed as instanceof `Error`

1.1.2
=====

  * Default the `socket` to passed-in object

1.1.1
=====

  * Rename module to `finished`

1.1.0
=====

  * Call callback when called on already-errored socket

1.0.1
=====

  * Actually pass the error to the callback

1.0.0
=====

  * Initial release
