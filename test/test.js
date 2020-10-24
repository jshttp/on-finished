
var assert = require('assert')
var asyncHooks = tryRequire('async_hooks')
var http = require('http')
var net = require('net')
var onFinished = require('..')

var describeAsyncHooks = typeof asyncHooks.AsyncLocalStorage === 'function'
  ? describe
  : describe.skip

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

      sendGet(server)
    })

    it('should include the response object', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function (err, msg) {
          assert.ok(!err)
          assert.strictEqual(msg, res)
          done()
        })
        setTimeout(res.end.bind(res), 0)
      })

      sendGet(server)
    })

    describe('when called after finish', function () {
      it('should fire when called after finish', function (done) {
        var server = http.createServer(function (req, res) {
          onFinished(res, function () {
            onFinished(res, done)
          })
          setTimeout(res.end.bind(res), 0)
        })

        sendGet(server)
      })

      describeAsyncHooks('when async local storage', function () {
        it('should presist store in callback', function (done) {
          var asyncLocalStorage = new asyncHooks.AsyncLocalStorage()
          var store = { foo: 'bar' }

          var server = http.createServer(function (req, res) {
            onFinished(res, function () {
              asyncLocalStorage.run(store, function () {
                onFinished(res, function () {
                  assert.strictEqual(asyncLocalStorage.getStore().foo, 'bar')
                  done()
                })
              })
            })
            setTimeout(res.end.bind(res), 0)
          })

          sendGet(server)
        })
      })
    })

    describeAsyncHooks('when async local storage', function () {
      it('should presist store in callback', function (done) {
        var asyncLocalStorage = new asyncHooks.AsyncLocalStorage()
        var store = { foo: 'bar' }

        var server = http.createServer(function (req, res) {
          asyncLocalStorage.run(store, function () {
            onFinished(res, function () {
              assert.strictEqual(asyncLocalStorage.getStore().foo, 'bar')
              done()
            })
          })
          setTimeout(res.end.bind(res), 0)
        })

        sendGet(server)
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

          writeRequest(socket)
        })

        res.end()
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writeRequest(this)
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
          assert.strictEqual(responses[0], res)
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

          assert.strictEqual(responses.length, 2)
          responses[0].end('response a')
        })

        if (responses.length === 1) {
          // second request
          writeRequest(socket)
        }

        req.resume()
      })
      var socket

      server.listen(function () {
        var data = ''
        socket = net.connect(this.address().port, function () {
          writeRequest(this)
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
          server.close(done)
        })

        socket.on('error', noop)
        socket.write('W')
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writeRequest(this, true)
        })
      })
    })

    it('should include the response object', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function (err, msg) {
          assert.ok(err)
          assert.strictEqual(msg, res)
          server.close(done)
        })

        socket.on('error', noop)
        socket.write('W')
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writeRequest(this, true)
        })
      })
    })
  })

  describe('when the response aborts', function () {
    it('should execute the callback', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        onFinished(res, close(server, done))
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
        assert.strictEqual(stderr, '')
        res.end()
      })

      server.listen(function () {
        var port = this.address().port
        http.get('http://127.0.0.1:' + port, function (res) {
          res.resume()
          res.on('end', server.close.bind(server))
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

    sendGet(server)
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

    sendGet(server)
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
          writeRequest(socket)
        }

        req.resume()
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writeRequest(this)
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
          writeRequest(socket, true)
        }
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writeRequest(this)
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
          server.close(done)
        })

        socket.on('error', noop)
        socket.write('W')
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writeRequest(this, true)
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
          server.close(done)
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

      sendGet(server)
    })

    it('should include the request object', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function (err, msg) {
          assert.ok(!err)
          assert.strictEqual(msg, req)
          done()
        })
        req.resume()
        setTimeout(res.end.bind(res), 0)
      })

      sendGet(server)
    })

    describe('when called after finish', function () {
      it('should fire when called after finish', function (done) {
        var server = http.createServer(function (req, res) {
          onFinished(req, function () {
            onFinished(req, done)
          })
          req.resume()
          setTimeout(res.end.bind(res), 0)
        })

        sendGet(server)
      })

      describeAsyncHooks('when async local storage', function () {
        it('should presist store in callback', function (done) {
          var asyncLocalStorage = new asyncHooks.AsyncLocalStorage()
          var store = { foo: 'bar' }

          var server = http.createServer(function (req, res) {
            onFinished(req, function () {
              asyncLocalStorage.run(store, function () {
                onFinished(req, function () {
                  assert.strictEqual(asyncLocalStorage.getStore().foo, 'bar')
                  done()
                })
              })
            })
            req.resume()
            setTimeout(res.end.bind(res), 0)
          })

          sendGet(server)
        })
      })
    })

    describeAsyncHooks('when async local storage', function () {
      it('should presist store in callback', function (done) {
        var asyncLocalStorage = new asyncHooks.AsyncLocalStorage()
        var store = { foo: 'bar' }

        var server = http.createServer(function (req, res) {
          asyncLocalStorage.run(store, function () {
            onFinished(req, function () {
              assert.strictEqual(asyncLocalStorage.getStore().foo, 'bar')
              done()
            })
          })
          req.resume()
          setTimeout(res.end.bind(res), 0)
        })

        sendGet(server)
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
          assert.strictEqual(data, 'A')

          if (called) {
            socket.end()
            server.close()
            done(called !== req ? null : new Error('fired twice on same req'))
            return
          }

          called = req

          res.end()
          writeRequest(socket, true)
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
          writeRequest(this, true)
        })
      })
    })
  })

  describe('when request errors', function () {
    it('should fire with error', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function (err) {
          assert.ok(err)
          server.close(done)
        })

        socket.on('error', noop)
        socket.write('W')
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writeRequest(this, true)
        })
      })
    })

    it('should include the request object', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function (err, msg) {
          assert.ok(err)
          assert.strictEqual(msg, req)
          server.close(done)
        })

        socket.on('error', noop)
        socket.write('W')
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writeRequest(this, true)
        })
      })
    })
  })

  describe('when requests pipelined', function () {
    it('should handle socket errors', function (done) {
      var count = 0
      var server = http.createServer(function (req) {
        var num = ++count

        onFinished(req, function (err) {
          assert.ok(err)
          if (!--wait) server.close(done)
        })

        if (num === 1) {
          // second request
          writeRequest(socket, true)
          req.pause()
        } else {
          // cause framing error in second request
          socket.write('W')
          req.resume()
        }
      })
      var socket
      var wait = 3

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writeRequest(this)
        })

        socket.on('close', function () {
          assert.strictEqual(count, 2)
          if (!--wait) server.close(done)
        })

        socket.resume()
      })
    })
  })

  describe('when the request aborts', function () {
    it('should execute the callback', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        onFinished(req, close(server, done))
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
        assert.strictEqual(stderr, '')
        res.end()
      })

      server.listen(function () {
        var port = this.address().port
        http.get('http://127.0.0.1:' + port, function (res) {
          res.resume()
          res.on('end', server.close.bind(server))
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
          assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')

          socket.on('data', function (chunk) {
            assert.strictEqual(chunk.toString(), 'ping')
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
            assert.strictEqual(chunk.toString(), 'pong')
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
          assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')
          socket.write('HTTP/1.1 200 OK\r\n\r\n')
        })

        socket.on('data', function (chunk) {
          assert.strictEqual(chunk.toString(), 'ping')
          onFinished(req, function () {
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
            assert.strictEqual(chunk.toString(), 'pong')
            socket.end()
            server.close(done)
          })
        })
        client.end('knock, knock')
      })
    })
  })

  describe('when Upgrade request', function () {
    it('should fire when request finishes', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        res.statusCode = 405
        res.end()
      })
      server.on('upgrade', function (req, socket, bodyHead) {
        var data = [bodyHead]

        onFinished(req, function (err) {
          assert.ifError(err)
          assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')

          socket.on('data', function (chunk) {
            assert.strictEqual(chunk.toString(), 'ping')
            socket.end('pong')
          })
          socket.write('HTTP/1.1 101 Switching Protocols\r\n')
          socket.write('Connection: Upgrade\r\n')
          socket.write('Upgrade: Raw\r\n')
          socket.write('\r\n')
        })

        req.on('data', function (chunk) {
          data.push(chunk)
        })
      })

      server.listen(function () {
        client = http.request({
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'Raw'
          },
          hostname: '127.0.0.1',
          port: this.address().port
        })

        client.on('upgrade', function (res, socket, bodyHead) {
          socket.write('ping')
          socket.on('data', function (chunk) {
            assert.strictEqual(chunk.toString(), 'pong')
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
      server.on('upgrade', function (req, socket, bodyHead) {
        var data = [bodyHead]

        onFinished(req, function (err) {
          assert.ifError(err)
          assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')

          socket.write('HTTP/1.1 101 Switching Protocols\r\n')
          socket.write('Connection: Upgrade\r\n')
          socket.write('Upgrade: Raw\r\n')
          socket.write('\r\n')
        })

        socket.on('data', function (chunk) {
          assert.strictEqual(chunk.toString(), 'ping')
          onFinished(req, function () {
            socket.end('pong')
          })
        })

        req.on('data', function (chunk) {
          data.push(chunk)
        })
      })

      server.listen(function () {
        client = http.request({
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'Raw'
          },
          hostname: '127.0.0.1',
          port: this.address().port
        })

        client.on('upgrade', function (res, socket, bodyHead) {
          socket.write('ping')
          socket.on('data', function (chunk) {
            assert.strictEqual(chunk.toString(), 'pong')
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

    sendGet(server)
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

    sendGet(server)
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

      sendGet(server)
    })
  })

  describe('when request errors', function () {
    it('should return true', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function (err) {
          assert.ok(err)
          assert.ok(onFinished.isFinished(req))
          server.close(done)
        })

        socket.on('error', noop)
        socket.write('W')
      })
      var socket

      server.listen(function () {
        socket = net.connect(this.address().port, function () {
          writeRequest(this, true)
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
          server.close(done)
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
        assert.strictEqual(bodyHead.length, 0)
        req.resume()

        socket.on('data', function (chunk) {
          assert.strictEqual(chunk.toString(), 'ping')
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
            assert.strictEqual(chunk.toString(), 'pong')
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
          assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')
          socket.write('HTTP/1.1 200 OK\r\n\r\n')
        })

        socket.on('data', function (chunk) {
          assert.strictEqual(chunk.toString(), 'ping')
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
            assert.strictEqual(chunk.toString(), 'pong')
            socket.end()
            server.close(done)
          })
        })
        client.end('knock, knock')
      })
    })
  })

  describe('when Upgrade request', function () {
    it('should be true immediately', function (done) {
      var client
      var server = http.createServer(function (req, res) {
        res.statusCode = 405
        res.end()
      })

      server.on('upgrade', function (req, socket, bodyHead) {
        assert.ok(onFinished.isFinished(req))
        assert.strictEqual(bodyHead.length, 0)
        req.resume()

        socket.on('data', function (chunk) {
          assert.strictEqual(chunk.toString(), 'ping')
          socket.end('pong')
        })
        socket.write('HTTP/1.1 101 Switching Protocols\r\n')
        socket.write('Connection: Upgrade\r\n')
        socket.write('Upgrade: Raw\r\n')
        socket.write('\r\n')
      })

      server.listen(function () {
        client = http.request({
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'Raw'
          },
          hostname: '127.0.0.1',
          port: this.address().port
        })

        client.on('upgrade', function (res, socket, bodyHead) {
          socket.write('ping')
          socket.on('data', function (chunk) {
            assert.strictEqual(chunk.toString(), 'pong')
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
      server.on('upgrade', function (req, socket, bodyHead) {
        var data = [bodyHead]

        onFinished(req, function (err) {
          assert.ifError(err)
          assert.ok(onFinished.isFinished(req))
          assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')

          socket.write('HTTP/1.1 101 Switching Protocols\r\n')
          socket.write('Connection: Upgrade\r\n')
          socket.write('Upgrade: Raw\r\n')
          socket.write('\r\n')
        })

        socket.on('data', function (chunk) {
          assert.strictEqual(chunk.toString(), 'ping')
          socket.end('pong')
        })

        req.on('data', function (chunk) {
          data.push(chunk)
        })
      })

      server.listen(function () {
        client = http.request({
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'Raw'
          },
          hostname: '127.0.0.1',
          port: this.address().port
        })

        client.on('upgrade', function (res, socket, bodyHead) {
          socket.write('ping')
          socket.on('data', function (chunk) {
            assert.strictEqual(chunk.toString(), 'pong')
            socket.end()
            server.close(done)
          })
        })
        client.end('knock, knock')
      })
    })
  })
})

function captureStderr (fn) {
  var chunks = []
  var write = process.stderr.write

  process.stderr.write = function write (chunk, encoding) {
    chunks.push(new Buffer(chunk, encoding)) // eslint-disable-line node/no-deprecated-api
  }

  try {
    fn()
  } finally {
    process.stderr.write = write
  }

  return Buffer.concat(chunks).toString('utf8')
}

function close (server, callback) {
  return function (error) {
    server.close(function (err) {
      callback(error || err)
    })
  }
}

function noop () {}

function sendGet (server) {
  server.listen(function onListening () {
    var port = this.address().port
    http.get('http://127.0.0.1:' + port, function onResponse (res) {
      res.resume()
      res.on('end', server.close.bind(server))
    })
  })
}

function tryRequire (name) {
  try {
    return require(name)
  } catch (e) {
    return {}
  }
}

function writeRequest (socket, chunked) {
  socket.write('GET / HTTP/1.1\r\n')
  socket.write('Host: localhost\r\n')
  socket.write('Connection: keep-alive\r\n')

  if (chunked) {
    socket.write('Transfer-Encoding: chunked\r\n')
  }

  socket.write('\r\n')
}
