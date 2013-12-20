# On Socket Error [![Build Status](https://travis-ci.org/expressjs/on-socket-error.png)](https://travis-ci.org/expressjs/on-socket-error)

Execute a callback on if the socket errors. Specifically, this is when the client aborts a request. You want to destroy any file streams you create on socket errors otherwise you will leak file descriptors.

Node / Connect / Express:

```js
var onSocketError = require('on-socket-error')

function (req, res, next) {
  var stream = fs.createReadStream('thingie.json')
  stream.pipe(res)
  onSocketError(res, function () {
    stream.destroy()
  })
}
```

Koa:

```js
function* () {
  var stream = this.body = fs.createReadStream('thingie.json')
  onSocketError(this, function () {
    stream.destroy()
  })
}
```

## License

The MIT License (MIT)

Copyright (c) 2013 Jonathan Ong me@jongleberry.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.