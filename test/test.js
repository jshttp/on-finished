
var assert = require('assert')
var http = require('http')
var net = require('net')
var onFinished = require('..')

describe('finished(res, listener)', function () {
  describe('when the response finishes', function () {
    it('should fire the callback', function (done) {
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

    it('should fire when called after finish', function (done) {
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

  describe('when using keep-alive', function () {
    it('should fire for each response', function (done) {
      var called = false
      var server = http.createServer(function (req, res) {
        onFinished(res, function () {
          if (called) {
            socket.end()
            server.close()
            done(called !== req ? null : new Error('fired twice on same req'))
            return
          }

          called = req

          writerequest(socket)
        })

        res.end()
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writerequest(this)
        })
      })
    })
  })

  describe('when response errors', function () {
    it('should fire with error', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function (err) {
          assert.ok(err)
          done()
        })

        socket.on('error', noop)
        socket.write('W')
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writerequest(this, true)
        })
      })
    })
  })

  describe('when the response aborts', function () {
    it('should execute the callback', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        onFinished(res, done)
        setTimeout(client.abort.bind(client), 0)
      })
      server.listen(function () {
        var port = this.address().port
        client = http.get('http://127.0.0.1:' + port)
        client.on('error', noop)
      })
    })
  })

  describe('when calling many times on same response', function () {
    it('should not print warnings', function (done) {
      var server = http.createServer(function (req, res) {
        var stderr = captureStderr(function () {
          for (var i = 0; i < 400; i++) {
            onFinished(res, noop)
          }
        })

        onFinished(res, done)
        assert.equal(stderr, '')
        res.end()
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
})

describe('finished(req, listener)', function () {
  describe('when the request finishes', function () {
    it('should fire the callback', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, done)
        req.resume()
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

    it('should fire when called after finish', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function () {
          onFinished(req, done)
        })
        req.resume()
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

  describe('when using keep-alive', function () {
    it('should fire for each request', function (done) {
      var called = false
      var server = http.createServer(function (req, res) {
        var data = ''

        onFinished(req, function (err) {
          assert.ifError(err)
          assert.equal(data, 'A')

          if (called) {
            socket.end()
            server.close()
            done(called !== req ? null : new Error('fired twice on same req'))
            return
          }

          called = req

          res.end()
          writerequest(socket, true)
        })

        req.setEncoding('utf8')
        req.on('data', function (str) {
          data += str
        })

        socket.write('1\r\nA\r\n')
        socket.write('0\r\n\r\n')
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writerequest(this, true)
        })
      })
    })
  })

  describe('when request errors', function () {
    it('should fire with error', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function (err) {
          assert.ok(err)
          done()
        })

        socket.on('error', noop)
        socket.write('W')
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writerequest(this, true)
        })
      })
    })
  })

  describe('when the request aborts', function () {
    it('should execute the callback', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        onFinished(req, done)
        setTimeout(client.abort.bind(client), 0)
      })
      server.listen(function () {
        var port = this.address().port
        client = http.get('http://127.0.0.1:' + port)
        client.on('error', noop)
      })
    })
  })

  describe('when calling many times on same request', function () {
    it('should not print warnings', function (done) {
      var server = http.createServer(function (req, res) {
        var stderr = captureStderr(function () {
          for (var i = 0; i < 400; i++) {
            onFinished(req, noop)
          }
        })

        onFinished(req, done)
        assert.equal(stderr, '')
        res.end()
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
})

function captureStderr(fn) {
  var chunks = []
  var write = process.stderr.write

  process.stderr.write = function write(chunk, encoding) {
    chunks.push(new Buffer(chunk, encoding))
  }

  try {
    fn()
  } finally {
    process.stderr.write = write
  }

  return Buffer.concat(chunks).toString('utf8')
}

function noop() {}

function writerequest(socket, chunked) {
  socket.write('GET / HTTP/1.1\r\n')
  socket.write('Host: localhost\r\n')
  socket.write('Connection: keep-alive\r\n')

  if (chunked) {
    socket.write('Transfer-Encoding: chunked\r\n')
  }

  socket.write('\r\n')
}
