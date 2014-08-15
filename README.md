# finished

[![NPM Version](https://badge.fury.io/js/finished.svg)](http://badge.fury.io/js/finished)
[![Build Status](https://travis-ci.org/expressjs/finished.svg?branch=master)](https://travis-ci.org/expressjs/finished)
[![Coverage Status](https://img.shields.io/coveralls/expressjs/finished.svg?branch=master)](https://coveralls.io/r/expressjs/finished)

Execute a callback when a request closes, finishes, or errors.

#### Install

```sh
$ npm install finished
```

#### Uses

This is useful for cleaning up streams. For example, you want to destroy any file streams you create on socket errors otherwise you will leak file descriptors.

This is required to fix what many perceive as issues with node's streams. Relevant:

- [node#6041](https://github.com/joyent/node/issues/6041)
- [koa#184](https://github.com/koajs/koa/issues/184)
- [koa#165](https://github.com/koajs/koa/issues/165)

## API

### finished(response, callback)

```js
var onFinished = require('finished')

onFinished(res, function (err) {
  // do something maybe
})
```

### Examples

The following code ensures that file descriptors are always closed once the response finishes.

#### Node / Connect / Express

```js
var onFinished = require('finished')

function (req, res, next) {
  var stream = fs.createReadStream('thingie.json')
  stream.pipe(res)
  onFinished(res, function (err) {
    stream.destroy()
  })
}
```

#### Koa

```js
function* () {
  var stream = this.body = fs.createReadStream('thingie.json')
  onFinished(this, function (err) {
    stream.destroy()
  })
}
```

## License

[MIT](LICENSE)
