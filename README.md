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

### finished(response, callback)

```js
var onFinished = require('finished')

onFinished(res, function (err) {
  // do something maybe
})
```

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
