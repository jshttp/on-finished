
var EventEmitter = require('events').EventEmitter
var should = require('should')
var assert = require('assert')
var http = require('http')

var onFinished = require('..')

function createThingie() {
  var ee = new EventEmitter
  ee.socket = new EventEmitter
  ee.socket.writable = true
  return ee
}

describe('on socket error', function () {
  it('should execute the callback on socket error', function () {
    var thingie = createThingie()
    var called = false
    onFinished(thingie, function (err) {
      called = true
      err.message.should.equal('boom')
    })
    thingie.socket.emit('error', new Error('boom'))
    called.should.be.true
  })

  it('should not execute the callback if response is finished', function (done) {
    var thingie = createThingie()
    onFinished(thingie, function (err) {
      assert.ifError(err)
      done()
    })
    thingie.emit('finish')
    thingie.socket.emit(new Error('boom'))
  })
})

describe('when the socket is not writable', function () {
  it('should execute the callback immediately', function (done) {
    var thingie = createThingie()
    thingie.socket.writable = false
    onFinished(thingie, function (err) {
      done()
    })
  })
})

describe('when the socket closes', function () {
  it('should execute the callback', function (done) {
    var thingie = createThingie()
    onFinished(thingie, done)
    thingie.socket.emit('close')
  })
})

describe('when an emitter emits a non-error', function () {
  it('should ignore the error', function (done) {
    var thingie = createThingie()
    onFinished(thingie, done)
    thingie.socket.emit('close', false)
  })
})

describe('http', function () {
  describe('when the request finishes', function () {
    it('should execute the callback', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, done)
        setTimeout(res.end.bind(res), 0)
      })
      server.listen(function () {
        var port = this.address().port
        http.get('http://127.0.0.1:' + port, function (res) {
          res.resume()
          res.on('close', server.close.bind(server))
        })
      })
    })

    it('should execute the callback when called after finish', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function () {
          onFinished(res, done)
        })
        setTimeout(res.end.bind(res), 0)
      })
      server.listen(function () {
        var port = this.address().port
        http.get('http://127.0.0.1:' + port, function (res) {
          res.resume()
          res.on('close', server.close.bind(server))
        })
      })
    })
  })

  describe('when the request aborts', function () {
    it('should execute the callback', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        onFinished(res, done)
        setTimeout(client.abort.bind(client), 0)
      })
      server.listen(function () {
        var port = this.address().port
        client = http.get('http://127.0.0.1:' + port)
        client.on('error', function () {})
      })
    })
  })
})

describe('event emitter leaks', function () {
  describe('when adding a lot of listeners on the same request', function () {
    it('should not warn and add at most 1 listener per emitter per event', function () {
      // we just have to make sure tests pass without a bunch of logs
      var thingie = createThingie()
      var called = false

      onFinished(thingie, function (err) {
        called = true
        err.message.should.equal('boom')
      })

      for (var i = 0; i < 1000; i++) {
        onFinished(thingie, noop)
      }

      assert.equal(1, thingie.socket.listeners('error').length)
      assert.equal(1, thingie.socket.listeners('close').length)
      assert.equal(1, thingie.listeners('finish').length)

      thingie.socket.emit('error', new Error('boom'))
      called.should.be.true
    })
  })

  it('should clean up after itself', function (done) {
    var thingie = createThingie()
    onFinished(thingie, function () {
      assert(!thingie.socket.listeners('error').length)
      assert(!thingie.socket.listeners('close').length)
      assert(!thingie.listeners('finish').length)
      done()
    })

    thingie.socket.emit('error')
  })
})

function noop() {}
