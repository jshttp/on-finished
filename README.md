# finished

[![NPM Version](http://img.shields.io/npm/v/finished.svg?style=flat)](https://www.npmjs.org/package/finished)
[![Node.js Version](http://img.shields.io/badge/node.js->=_0.8-blue.svg?style=flat)](http://nodejs.org/download/)
[![Build Status](http://img.shields.io/travis/expressjs/finished.svg?style=flat)](https://travis-ci.org/expressjs/finished)
[![Coverage Status](https://img.shields.io/coveralls/expressjs/finished.svg?style=flat)](https://coveralls.io/r/expressjs/finished)

Execute a callback when a request closes, finishes, or errors.

## Install

```sh
$ npm install finished
```

## API

```js
var onFinished = require('finished')
```

### onFinished(res, listener)

Attach a listener to listen for the response to finish. The listener will
be invoked only once when the response finished. If the response finished
to to an error, the first argument will contain the error.

Listening to the end of a response would be used to close things associated
with the response, like open files.

```js
onFinished(res, function (err) {
  // do something maybe
})
```

### onFinished(req, listener)

Attach a listener to listen for the request to finish. The listener will
be invoked only once when the request finished. If the request finished
to to an error, the first argument will contain the error.

Listening to the end of a request would be used to know when to continue
after reading the data.

```js
var data = ''

req.setEncoding('utf8')
res.on('data', function (str) {
  data += str
})

onFinished(req, function (err) {
  // if err, data is probably incomplete
})
```

### onFinished.isFinished(res)

Determine if `res` is already finished. This would be useful to check and
not even start certain operations if the response has already finished.

### onFinished.isFinished(req)

Determine if `req` is already finished. This would be useful to check and
not even start certain operations if the request has already finished.

### Example

The following code ensures that file descriptors are always closed
once the response finishes.

```js
var destroy = require('destroy')
var http = require('http')
var onFinished = require('finished')

http.createServer(function onRequest(req, res) {
  var stream = fs.createReadStream('package.json')
  stream.pipe(res)
  onFinished(res, function (err) {
    destroy(stream)
  })
})
```

## License

[MIT](LICENSE)
