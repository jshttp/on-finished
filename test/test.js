
var assert = require('assert')
var http = require('http')
var net = require('net')
var onFinished = require('..')

describe('onFinished(res, listener)', function () {
  it('should invoke listener given an unknown object', function (done) {
    onFinished({}, done)
  })

  describe('when the response finishes', function () {
    it('should fire the callback', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, done)
        setTimeout(res.end.bind(res), 0)
      })

      sendget(server)
    })

    it('should include the response object', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function (err, msg) {
          assert.ok(!err)
          assert.equal(msg, res)
          done()
        })
        setTimeout(res.end.bind(res), 0)
      })

      sendget(server)
    })

    it('should fire when called after finish', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function () {
          onFinished(res, done)
        })
        setTimeout(res.end.bind(res), 0)
      })

      sendget(server)
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

  describe('when requests pipelined', function () {
    it('should fire for each request', function (done) {
      var count = 0
      var responses = []
      var server = http.createServer(function (req, res) {
        responses.push(res)

        onFinished(res, function (err) {
          assert.ifError(err)
          assert.equal(responses[0], res)
          responses.shift()

          if (responses.length === 0) {
            socket.end()
            return
          }

          responses[0].end('response b')
        })

        onFinished(req, function (err) {
          assert.ifError(err)

          if (++count !== 2) {
            return
          }

          assert.equal(responses.length, 2)
          responses[0].end('response a')
        })

        if (responses.length === 1) {
          // second request
          writerequest(socket)
        }

        req.resume()
      })
      var socket

      server.listen(function () {
        var data = ''
        socket = net.connect(this.address().port, function () {
          writerequest(this)
        })

        socket.on('data', function (chunk) {
          data += chunk.toString('binary')
        })
        socket.on('end', function () {
          assert.ok(/response a/.test(data))
          assert.ok(/response b/.test(data))
          server.close(done)
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

    it('should include the response object', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function (err, msg) {
          assert.ok(err)
          assert.equal(msg, res)
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

describe('isFinished(res)', function () {
  it('should return undefined for unknown object', function () {
    assert.strictEqual(onFinished.isFinished({}), undefined)
  })

  it('should be false before response finishes', function (done) {
    var server = http.createServer(function (req, res) {
      assert.ok(!onFinished.isFinished(res))
      res.end()
      done()
    })

    sendget(server)
  })

  it('should be true after response finishes', function (done) {
    var server = http.createServer(function (req, res) {
      onFinished(res, function (err) {
        assert.ifError(err)
        assert.ok(onFinished.isFinished(res))
        done()
      })

      res.end()
    })

    sendget(server)
  })

  describe('when requests pipelined', function () {
    it('should have correct state when socket shared', function (done) {
      var count = 0
      var responses = []
      var server = http.createServer(function (req, res) {
        responses.push(res)

        onFinished(req, function (err) {
          assert.ifError(err)

          if (++count !== 2) {
            return
          }

          assert.ok(!onFinished.isFinished(responses[0]))
          assert.ok(!onFinished.isFinished(responses[1]))

          responses[0].end()
          responses[1].end()
          socket.end()
          server.close(done)
        })

        if (responses.length === 1) {
          // second request
          writerequest(socket)
        }

        req.resume()
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writerequest(this)
        })
      })
    })

    it('should handle aborted requests', function (done) {
      var count = 0
      var requests = 0
      var server = http.createServer(function (req, res) {
        requests++

        onFinished(req, function (err) {
          switch (++count) {
            case 1:
              assert.ifError(err)
              // abort the socket
              socket.on('error', noop)
              socket.destroy()
              break
            case 2:
              server.close(done)
              break
          }
        })

        req.resume()

        if (requests === 1) {
          // second request
          writerequest(socket, true)
        }
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
    it('should return true', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function (err) {
          assert.ok(err)
          assert.ok(onFinished.isFinished(res))
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
    it('should return true', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        onFinished(res, function (err) {
          assert.ifError(err)
          assert.ok(onFinished.isFinished(res))
          done()
        })
        setTimeout(client.abort.bind(client), 0)
      })
      server.listen(function () {
        var port = this.address().port
        client = http.get('http://127.0.0.1:' + port)
        client.on('error', noop)
      })
    })
  })
})

describe('onFinished(req, listener)', function () {
  describe('when the request finishes', function () {
    it('should fire the callback', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, done)
        req.resume()
        setTimeout(res.end.bind(res), 0)
      })

      sendget(server)
    })

    it('should include the request object', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function (err, msg) {
          assert.ok(!err)
          assert.equal(msg, req)
          done()
        })
        req.resume()
        setTimeout(res.end.bind(res), 0)
      })

      sendget(server)
    })

    it('should fire when called after finish', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function () {
          onFinished(req, done)
        })
        req.resume()
        setTimeout(res.end.bind(res), 0)
      })

      sendget(server)
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

    it('should include the request objecy', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function (err, msg) {
          assert.ok(err)
          assert.equal(msg, req)
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

  describe('when CONNECT method', function () {
    it('should fire when request finishes', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        res.statusCode = 405
        res.end()
      })
      server.on('connect', function (req, socket, bodyHead) {
        var data = [bodyHead]

        onFinished(req, function (err) {
          assert.ifError(err)
          assert.equal(Buffer.concat(data).toString(), 'knock, knock')

          socket.on('data', function (chunk) {
            assert.equal(chunk.toString(), 'ping')
            socket.end('pong')
          })
          socket.write('HTTP/1.1 200 OK\r\n\r\n')
        })

        req.on('data', function (chunk) {
          data.push(chunk)
        })
      })

      server.listen(function () {
        client = http.request({
          hostname: '127.0.0.1',
          method: 'CONNECT',
          path: '127.0.0.1:80',
          port: this.address().port
        })
        client.on('connect', function (res, socket, bodyHead) {
          socket.write('ping')
          socket.on('data', function (chunk) {
            assert.equal(chunk.toString(), 'pong')
            socket.end()
            server.close(done)
          })
        })
        client.end('knock, knock')
      })
    })

    it('should fire when called after finish', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        res.statusCode = 405
        res.end()
      })
      server.on('connect', function (req, socket, bodyHead) {
        var data = [bodyHead]

        onFinished(req, function (err) {
          assert.ifError(err)
          assert.equal(Buffer.concat(data).toString(), 'knock, knock')
          socket.write('HTTP/1.1 200 OK\r\n\r\n')
        })

        socket.on('data', function (chunk) {
          assert.equal(chunk.toString(), 'ping')
          onFinished(req, function (err) {
            socket.end('pong')
          })
        })

        req.on('data', function (chunk) {
          data.push(chunk)
        })
      })

      server.listen(function () {
        client = http.request({
          hostname: '127.0.0.1',
          method: 'CONNECT',
          path: '127.0.0.1:80',
          port: this.address().port
        })
        client.on('connect', function (res, socket, bodyHead) {
          socket.write('ping')
          socket.on('data', function (chunk) {
            assert.equal(chunk.toString(), 'pong')
            socket.end()
            server.close(done)
          })
        })
        client.end('knock, knock')
      })
    })
  })
})

describe('isFinished(req)', function () {
  it('should return undefined for unknown object', function () {
    assert.strictEqual(onFinished.isFinished({}), undefined)
  })

  it('should be false before request finishes', function (done) {
    var server = http.createServer(function (req, res) {
      assert.ok(!onFinished.isFinished(req))
      req.resume()
      res.end()
      done()
    })

    sendget(server)
  })

  it('should be true after request finishes', function (done) {
    var server = http.createServer(function (req, res) {
      onFinished(req, function (err) {
        assert.ifError(err)
        assert.ok(onFinished.isFinished(req))
        done()
      })

      req.resume()
      res.end()
    })

    sendget(server)
  })

  describe('when request data buffered', function () {
    it('should be false before request finishes', function (done) {
      var server = http.createServer(function (req, res) {
        assert.ok(!onFinished.isFinished(req))

        req.pause()
        setTimeout(function () {
          assert.ok(!onFinished.isFinished(req))
          req.resume()
          res.end()
          done()
        }, 10)
      })

      sendget(server)
    })
  })

  describe('when request errors', function () {
    it('should return true', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function (err) {
          assert.ok(err)
          assert.ok(onFinished.isFinished(req))
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
    it('should return true', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        onFinished(res, function (err) {
          assert.ifError(err)
          assert.ok(onFinished.isFinished(req))
          done()
        })
        setTimeout(client.abort.bind(client), 0)
      })
      server.listen(function () {
        var port = this.address().port
        client = http.get('http://127.0.0.1:' + port)
        client.on('error', noop)
      })
    })
  })

  describe('when CONNECT method', function () {
    it('should be true immediately', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        res.statusCode = 405
        res.end()
      })

      server.on('connect', function (req, socket, bodyHead) {
        assert.ok(onFinished.isFinished(req))
        assert.equal(bodyHead.length, 0)
        req.resume()

        socket.on('data', function (chunk) {
          assert.equal(chunk.toString(), 'ping')
          socket.end('pong')
        })
        socket.write('HTTP/1.1 200 OK\r\n\r\n')
      })

      server.listen(function () {
        client = http.request({
          hostname: '127.0.0.1',
          method: 'CONNECT',
          path: '127.0.0.1:80',
          port: this.address().port
        })

        client.on('connect', function (res, socket, bodyHead) {
          socket.write('ping')
          socket.on('data', function (chunk) {
            assert.equal(chunk.toString(), 'pong')
            socket.end()
            server.close(done)
          })
        })
        client.end()
      })
    })

    it('should be true after request finishes', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        res.statusCode = 405
        res.end()
      })
      server.on('connect', function (req, socket, bodyHead) {
        var data = [bodyHead]

        onFinished(req, function (err) {
          assert.ifError(err)
          assert.ok(onFinished.isFinished(req))
          assert.equal(Buffer.concat(data).toString(), 'knock, knock')
          socket.write('HTTP/1.1 200 OK\r\n\r\n')
        })

        socket.on('data', function (chunk) {
          assert.equal(chunk.toString(), 'ping')
          socket.end('pong')
        })

        req.on('data', function (chunk) {
          data.push(chunk)
        })
      })

      server.listen(function () {
        client = http.request({
          hostname: '127.0.0.1',
          method: 'CONNECT',
          path: '127.0.0.1:80',
          port: this.address().port
        })
        client.on('connect', function (res, socket, bodyHead) {
          socket.write('ping')
          socket.on('data', function (chunk) {
            assert.equal(chunk.toString(), 'pong')
            socket.end()
            server.close(done)
          })
        })
        client.end('knock, knock')
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

function sendget(server) {
  server.listen(function onListening() {
    var port = this.address().port
    http.get('http://127.0.0.1:' + port, function onResponse(res) {
      res.resume()
      res.on('close', server.close.bind(server))
    })
  })
}

function writerequest(socket, chunked) {
  socket.write('GET / HTTP/1.1\r\n')
  socket.write('Host: localhost\r\n')
  socket.write('Connection: keep-alive\r\n')

  if (chunked) {
    socket.write('Transfer-Encoding: chunked\r\n')
  }

  socket.write('\r\n')
}
