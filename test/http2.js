const assert = require('assert')
const http = require('http2')
const onFinished = require('..')
const { sendGetHTTP2: sendGet, noop, captureStderr } = require('./support/utils')

describe('http2 onFinished(res, listener)', function () {
  describe('when reusing an HTTP/2 session', function () {
    it('should fire for each response on the same HTTP/2 session', function (done) {
      var called = false
      var server = http.createServer(function (req, res) {
        onFinished(res, function () {
          if (called) {
            // second response, make sure it's a different request object
            session.close()
            server.close()
            done(called !== req ? null : new Error('fired twice on same req'))
            return
          }

          called = req
        })

        res.end()
      })

      var session

      server.listen(function () {
        var port = this.address().port
        session = http.connect('http://127.0.0.1:' + port)

        // first request
        var s1 = session.request({ ':path': '/' })
        s1.on('response', function () {})
        s1.on('end', function () {
          // second request re-using the same HTTP/2 session
          var s2 = session.request({ ':path': '/' })
          s2.on('response', function () {})
          s2.on('end', function () {
            // wait for server to call done from its second onFinished
          })
          s2.resume()
        })
        s1.resume()
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
            // close the client session from the server side
            if (session) session.close()
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

        req.resume()
      })
      var session

      server.listen(function () {
        var port = this.address().port
        var data = ''
        session = http.connect('http://127.0.0.1:' + port)

        // send two concurrent requests over the same HTTP/2 session
        var r1 = session.request({ ':path': '/' })
        var r2 = session.request({ ':path': '/' })

        r1.on('data', function (chunk) { data += chunk.toString() })
        r2.on('data', function (chunk) { data += chunk.toString() })

        var ended = 0
        function onend () {
          if (++ended === 2) {
            assert.ok(/response a/.test(data))
            assert.ok(/response b/.test(data))
            server.close(done)
          }
        }

        r1.on('end', onend)
        r2.on('end', onend)

        r1.resume()
        r2.resume()
      })
    })
  })

  describe('when response errors', function () {
    it('should fire with error', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function (_err) {
          // HTTP/2 don't emit error messages on response streams
          server.close(done)
        })
        // intentionally do not end the response; client will abort
      })

      server.listen(function () {
        var port = this.address().port
        var client = http.connect('http://127.0.0.1:' + port)
        client.on('error', noop)

        var req = client.request({ ':path': '/' })
        req.on('response', function () {})
        req.end()

        // destroy the client session to simulate a network error
        setImmediate(function () {
          client.destroy()
        })
      })
    })

    it('should include the response object', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function (_err, msg) {
          assert.strictEqual(msg, res)
          server.close(done)
        })
      })

      server.listen(function () {
        var port = this.address().port
        var client = http.connect('http://127.0.0.1:' + port)
        client.on('error', noop)
        client.on('close', noop)

        var req = client.request({ ':path': '/' })
        req.on('response', function () {})
        req.end()

        setImmediate(function () {
          client.destroy()
        })
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
        const client = http.connect('http://127.0.0.1:' + port)
        client.request({ ':path': '/' })
        client.on('response', function (headers) {
          client.on('end', server.close.bind(server))
        })
      })
    })
  })
})

describe('http2 isFinished(res)', function () {
  describe('when requests pipelined', function () {
    it('should have correct state when session shared', function (done) {
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
          if (session) session.close()
          server.close(done)
        })

        req.resume()
      })
      var session

      server.listen(function () {
        var port = this.address().port

        session = http.connect('http://127.0.0.1:' + port)

        // send two requests over the same HTTP/2 session
        var r1 = session.request({ ':path': '/' })
        r1.on('response', function () {})
        r1.end()

        var r2 = session.request({ ':path': '/' })
        r2.on('response', function () {})
        r2.end()
      })
    })

    it('should handle aborted requests', function (done) {
      var count = 0
      var server = http.createServer(function (req, res) {
        onFinished(req, function (err) {
          switch (++count) {
            case 1:
              assert.ifError(err)
              // abort the client session to simulate a network error
              if (clientSession) clientSession.destroy()
              break
            case 2:
              server.close(done)
              break
          }
        })

        req.resume()
      })
      var clientSession

      server.listen(function () {
        var port = this.address().port
        clientSession = http.connect('http://127.0.0.1:' + port)

        // send two requests over the same HTTP/2 session
        var r1 = clientSession.request({ ':path': '/' })
        r1.on('response', function () {})
        r1.end()

        var r2 = clientSession.request({ ':path': '/' })
        r2.on('response', function () {})
        r2.end()
      })
    })
  })

  describe('when response errors', function () {
    it('should return true', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(res, function (_err) {
          assert.ok(onFinished.isFinished(res))
          server.close(done)
        })
      })

      server.listen(function () {
        var port = this.address().port
        var client = http.connect('http://127.0.0.1:' + port)
        client.on('error', noop)
        client.on('close', noop)

        var req = client.request({ ':path': '/' })
        req.on('response', function () {})
        req.end()

        setImmediate(function () {
          client.destroy()
        })
      })
    })
  })
})

describe('onFinished(req, listener)', function () {
  describe('when reusing an HTTP/2 session', function () {
    it('should fire for each request', function (done) {
      var called = false
      var server = http.createServer(function (req, res) {
        onFinished(req, function () {
          if (called) {
            session.close()
            server.close()
            done(called !== req ? null : new Error('fired twice on same req'))
            return
          }

          called = req
        })

        res.end()
      })

      var session

      server.listen(function () {
        var port = this.address().port
        session = http.connect('http://127.0.0.1:' + port)

        // first request
        var s1 = session.request({ ':path': '/' })
        s1.on('response', function () {})
        s1.on('end', function () {
          // second request re-using the same HTTP/2 session
          var s2 = session.request({ ':path': '/' })
          s2.on('response', function () {})
          s2.on('end', function () {
            // wait for server to call done from its second onFinished
          })
          s2.end()
        })
        s1.end()
      })
    })
  })

  describe('when request errors', function () {
    it('should fire with error', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function (_err) {
          server.close(done)
        })
        // intentionally do not end the response; client will abort
      })

      server.listen(function () {
        var port = this.address().port
        var client = http.connect('http://127.0.0.1:' + port)
        client.on('error', noop)

        var req = client.request({ ':path': '/' })
        req.on('response', function () {})
        req.end()

        // destroy the client session to simulate a network error
        setImmediate(function () {
          client.destroy()
        })
      })
    })

    it('should include the request object', function (done) {
      var server = http.createServer(function (req, res) {
        onFinished(req, function (_err, msg) {
          assert.strictEqual(msg, req)
          server.close(done)
        })
        // intentionally do not end the response; client will abort
      })

      server.listen(function () {
        var port = this.address().port
        var client = http.connect('http://127.0.0.1:' + port)
        client.on('error', noop)
        client.on('close', noop)

        var req = client.request({ ':path': '/' })
        req.on('response', function () {})
        req.end()

        setImmediate(function () {
          client.destroy()
        })
      })
    })
  })

  //   describe('when requests pipelined', function () {
  //     it('should handle socket errors', function (done) {
  //       var count = 0
  //       var server = http.createServer(function (req) {
  //         var num = ++count

  //         onFinished(req, function (err) {
  //           assert.ok(err)
  //           if (!--wait) server.close(done)
  //         })

  //         if (num === 1) {
  //           // second request
  //           writeRequest(socket, true)
  //           req.pause()
  //         } else {
  //           // cause framing error in second request
  //           socket.write('W')
  //           req.resume()
  //         }
  //       })
  //       var socket
  //       var wait = 3

  //       server.listen(function () {
  //         socket = net.connect(this.address().port, function () {
  //           writeRequest(this)
  //         })

  //         socket.on('close', function () {
  //           assert.strictEqual(count, 2)
  //           if (!--wait) server.close(done)
  //         })

  //         socket.resume()
  //       })
  //     })
  //   })

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
        const client = http.connect('http://127.0.0.1:' + port)
        var r = client.request({ ':path': '/' })
        r.on('response', function () {})
        r.on('end', server.close.bind(server))
        r.end()
        r.resume()
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

      server.on('connect', function (req, session) {
        var data = []

        onFinished(req, function (err) {
          assert.ifError(err)
          assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')
          session.end('pong')
        })

        req.on('data', function (chunk) {
          data.push(chunk)
        })
      })

      server.listen(function () {
        client = http.connect('http://127.0.0.1:' + server.address().port)
        var response = client.request({ ':method': 'CONNECT', ':authority': 'localhost' })
        response.on('data', function (chunk) {
          assert.strictEqual(chunk.toString(), 'pong')
          client.close()
          server.close(done)
        })

        response.end('knock, knock')
      })
    })

    //     it('should fire when called after finish', function (done) {
    //       var client
    //       var server = http.createServer(function (req, res) {
    //         res.statusCode = 405
    //         res.end()
    //       })
    //       server.on('connect', function (req, socket, bodyHead) {
    //         var data = [bodyHead]

    //         onFinished(req, function (err) {
    //           assert.ifError(err)
    //           assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')
    //           socket.write('HTTP/1.1 200 OK\r\n\r\n')
    //         })

    //         socket.on('data', function (chunk) {
    //           assert.strictEqual(chunk.toString(), 'ping')
    //           onFinished(req, function () {
    //             socket.end('pong')
    //           })
    //         })

    //         req.on('data', function (chunk) {
    //           data.push(chunk)
    //         })
    //       })

  //       server.listen(function () {
  //         client = http.request({
  //           hostname: '127.0.0.1',
  //           method: 'CONNECT',
  //           path: '127.0.0.1:80',
  //           port: this.address().port
  //         })
  //         client.on('connect', function (res, socket, bodyHead) {
  //           socket.write('ping')
  //           socket.on('data', function (chunk) {
  //             assert.strictEqual(chunk.toString(), 'pong')
  //             socket.end()
  //             server.close(done)
  //           })
  //         })
  //         client.end('knock, knock')
  //       })
  //     })
  })

  //   describe('when Upgrade request', function () {
  //     it('should fire when request finishes', function (done) {
  //       var client
  //       var server = http.createServer(function (req, res) {
  //         res.statusCode = 405
  //         res.end()
  //       })
  //       server.on('upgrade', function (req, socket, bodyHead) {
  //         var data = [bodyHead]

  //         onFinished(req, function (err) {
  //           assert.ifError(err)
  //           assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')

  //           socket.on('data', function (chunk) {
  //             assert.strictEqual(chunk.toString(), 'ping')
  //             socket.end('pong')
  //           })
  //           socket.write('HTTP/1.1 101 Switching Protocols\r\n')
  //           socket.write('Connection: Upgrade\r\n')
  //           socket.write('Upgrade: Raw\r\n')
  //           socket.write('\r\n')
  //         })

  //         req.on('data', function (chunk) {
  //           data.push(chunk)
  //         })
  //       })

  //       server.listen(function () {
  //         client = http.request({
  //           headers: {
  //             Connection: 'Upgrade',
  //             Upgrade: 'Raw'
  //           },
  //           hostname: '127.0.0.1',
  //           port: this.address().port
  //         })

  //         client.on('upgrade', function (res, socket, bodyHead) {
  //           socket.write('ping')
  //           socket.on('data', function (chunk) {
  //             assert.strictEqual(chunk.toString(), 'pong')
  //             socket.end()
  //             server.close(done)
  //           })
  //         })
  //         client.end('knock, knock')
  //       })
  //     })

  //     it('should fire when called after finish', function (done) {
  //       var client
  //       var server = http.createServer(function (req, res) {
  //         res.statusCode = 405
  //         res.end()
  //       })
  //       server.on('upgrade', function (req, socket, bodyHead) {
  //         var data = [bodyHead]

  //         onFinished(req, function (err) {
  //           assert.ifError(err)
  //           assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')

  //           socket.write('HTTP/1.1 101 Switching Protocols\r\n')
  //           socket.write('Connection: Upgrade\r\n')
  //           socket.write('Upgrade: Raw\r\n')
  //           socket.write('\r\n')
  //         })

  //         socket.on('data', function (chunk) {
  //           assert.strictEqual(chunk.toString(), 'ping')
  //           onFinished(req, function () {
  //             socket.end('pong')
  //           })
  //         })

  //         req.on('data', function (chunk) {
  //           data.push(chunk)
  //         })
  //       })

  //       server.listen(function () {
  //         client = http.request({
  //           headers: {
  //             Connection: 'Upgrade',
  //             Upgrade: 'Raw'
  //           },
  //           hostname: '127.0.0.1',
  //           port: this.address().port
  //         })

//         client.on('upgrade', function (res, socket, bodyHead) {
//           socket.write('ping')
//           socket.on('data', function (chunk) {
//             assert.strictEqual(chunk.toString(), 'pong')
//             socket.end()
//             server.close(done)
//           })
//         })
//         client.end('knock, knock')
//       })
//     })
//   })
})

describe('isFinished(req)', function () {
  it('should be true after request finishes', function (done) {
    var server = http.createServer(function (req, res) {
      onFinished(req, function (err) {
        assert.ifError(err)
        assert.ok(onFinished.isFinished(req))
        done()
      })

      // WHY?
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
        onFinished(req, function (_err) {
          assert.ok(onFinished.isFinished(req))
          server.close(done)
        })

        // intentionally do not end the response; client will abort
      })

      server.listen(function () {
        var port = this.address().port
        var client = http.connect('http://127.0.0.1:' + port)
        client.on('error', noop)

        var req = client.request({ ':path': '/' })
        req.on('response', function () {})
        req.end()

        // destroy the client session to simulate a network error
        setImmediate(function () {
          client.destroy()
        })
      })
    })
  })

  //   describe('when CONNECT method', function () {
  //     it('should be true immediately', function (done) {
  //       var client
  //       var server = http.createServer(function (req, res) {
  //         res.statusCode = 405
  //         res.end()
  //       })

  //       server.on('connect', function (req, socket, bodyHead) {
  //         assert.ok(onFinished.isFinished(req))
  //         assert.strictEqual(bodyHead.length, 0)
  //         req.resume()

  //         socket.on('data', function (chunk) {
  //           assert.strictEqual(chunk.toString(), 'ping')
  //           socket.end('pong')
  //         })
  //         socket.write('HTTP/1.1 200 OK\r\n\r\n')
  //       })

  //       server.listen(function () {
  //         client = http.request({
  //           hostname: '127.0.0.1',
  //           method: 'CONNECT',
  //           path: '127.0.0.1:80',
  //           port: this.address().port
  //         })

  //         client.on('connect', function (res, socket, bodyHead) {
  //           socket.write('ping')
  //           socket.on('data', function (chunk) {
  //             assert.strictEqual(chunk.toString(), 'pong')
  //             socket.end()
  //             server.close(done)
  //           })
  //         })
  //         client.end()
  //       })
  //     })

  //     it('should be true after request finishes', function (done) {
  //       var client
  //       var server = http.createServer(function (req, res) {
  //         res.statusCode = 405
  //         res.end()
  //       })
  //       server.on('connect', function (req, socket, bodyHead) {
  //         var data = [bodyHead]

  //         onFinished(req, function (err) {
  //           assert.ifError(err)
  //           assert.ok(onFinished.isFinished(req))
  //           assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')
  //           socket.write('HTTP/1.1 200 OK\r\n\r\n')
  //         })

  //         socket.on('data', function (chunk) {
  //           assert.strictEqual(chunk.toString(), 'ping')
  //           socket.end('pong')
  //         })

  //         req.on('data', function (chunk) {
  //           data.push(chunk)
  //         })
  //       })

  //       server.listen(function () {
  //         client = http.request({
  //           hostname: '127.0.0.1',
  //           method: 'CONNECT',
  //           path: '127.0.0.1:80',
  //           port: this.address().port
  //         })
  //         client.on('connect', function (res, socket, bodyHead) {
  //           socket.write('ping')
  //           socket.on('data', function (chunk) {
  //             assert.strictEqual(chunk.toString(), 'pong')
  //             socket.end()
  //             server.close(done)
  //           })
  //         })
  //         client.end('knock, knock')
  //       })
  //     })
  //   })

  //   describe('when Upgrade request', function () {
  //     it('should be true immediately', function (done) {
  //       var client
  //       var server = http.createServer(function (req, res) {
  //         res.statusCode = 405
  //         res.end()
  //       })

  //       server.on('upgrade', function (req, socket, bodyHead) {
  //         assert.ok(onFinished.isFinished(req))
  //         assert.strictEqual(bodyHead.length, 0)
  //         req.resume()

  //         socket.on('data', function (chunk) {
  //           assert.strictEqual(chunk.toString(), 'ping')
  //           socket.end('pong')
  //         })
  //         socket.write('HTTP/1.1 101 Switching Protocols\r\n')
  //         socket.write('Connection: Upgrade\r\n')
  //         socket.write('Upgrade: Raw\r\n')
  //         socket.write('\r\n')
  //       })

  //       server.listen(function () {
  //         client = http.request({
  //           headers: {
  //             Connection: 'Upgrade',
  //             Upgrade: 'Raw'
  //           },
  //           hostname: '127.0.0.1',
  //           port: this.address().port
  //         })

  //         client.on('upgrade', function (res, socket, bodyHead) {
  //           socket.write('ping')
  //           socket.on('data', function (chunk) {
  //             assert.strictEqual(chunk.toString(), 'pong')
  //             socket.end()
  //             server.close(done)
  //           })
  //         })
  //         client.end()
  //       })
  //     })

  //     it('should be true after request finishes', function (done) {
  //       var client
  //       var server = http.createServer(function (req, res) {
  //         res.statusCode = 405
  //         res.end()
  //       })
  //       server.on('upgrade', function (req, socket, bodyHead) {
  //         var data = [bodyHead]

  //         onFinished(req, function (err) {
  //           assert.ifError(err)
  //           assert.ok(onFinished.isFinished(req))
  //           assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')

  //           socket.write('HTTP/1.1 101 Switching Protocols\r\n')
  //           socket.write('Connection: Upgrade\r\n')
  //           socket.write('Upgrade: Raw\r\n')
  //           socket.write('\r\n')
  //         })

  //         socket.on('data', function (chunk) {
  //           assert.strictEqual(chunk.toString(), 'ping')
  //           socket.end('pong')
  //         })

  //         req.on('data', function (chunk) {
  //           data.push(chunk)
  //         })
  //       })

  //       server.listen(function () {
  //         client = http.request({
  //           headers: {
  //             Connection: 'Upgrade',
  //             Upgrade: 'Raw'
  //           },
  //           hostname: '127.0.0.1',
  //           port: this.address().port
  //         })

//         client.on('upgrade', function (res, socket, bodyHead) {
//           socket.write('ping')
//           socket.on('data', function (chunk) {
//             assert.strictEqual(chunk.toString(), 'pong')
//             socket.end()
//             server.close(done)
//           })
//         })
//         client.end('knock, knock')
//       })
//     })
//   })
})
