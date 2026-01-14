const assert = require('assert')
const { AsyncLocalStorage } = require('node:async_hooks')
const http2 = require('http2')
const onFinished = require('..')
const { sendGetHTTP2: sendGet, noop, captureStderr } = require('./support/utils')

describe('http2 compatibility mode', function () {
  describe('onFinished(res, listener)', function () {
    describe('when reusing an HTTP/2 session', function () {
      it('should fire for each response on the same HTTP/2 session', function (done) {
        var called = false
        var server = http2.createServer(function (req, res) {
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
          session = http2.connect('http://127.0.0.1:' + port)

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
        var server = http2.createServer(function (req, res) {
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
          session = http2.connect('http://127.0.0.1:' + port)

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
        var server = http2.createServer(function (req, res) {
          onFinished(res, function (_err) {
          // HTTP/2 don't emit error messages on response streams
            server.close(done)
          })
        // intentionally do not end the response; client will abort
        })

        server.listen(function () {
          var port = this.address().port
          var client = http2.connect('http://127.0.0.1:' + port)
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
        var server = http2.createServer(function (req, res) {
          onFinished(res, function (_err, msg) {
            assert.strictEqual(msg, res)
            server.close(done)
          })
        })

        server.listen(function () {
          var port = this.address().port
          var client = http2.connect('http://127.0.0.1:' + port)
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
        var server = http2.createServer(function (req, res) {
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
          const client = http2.connect('http://127.0.0.1:' + port)
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
        var server = http2.createServer(function (req, res) {
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

          session = http2.connect('http://127.0.0.1:' + port)

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
        var server = http2.createServer(function (req, res) {
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
          clientSession = http2.connect('http://127.0.0.1:' + port)

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
        var server = http2.createServer(function (req, res) {
          onFinished(res, function (_err) {
            assert.ok(onFinished.isFinished(res))
            server.close(done)
          })
        })

        server.listen(function () {
          var port = this.address().port
          var client = http2.connect('http://127.0.0.1:' + port)
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
        var server = http2.createServer(function (req, res) {
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
          session = http2.connect('http://127.0.0.1:' + port)

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
        var server = http2.createServer(function (req, res) {
          onFinished(req, function (_err) {
            server.close(done)
          })
        // intentionally do not end the response; client will abort
        })

        server.listen(function () {
          var port = this.address().port
          var client = http2.connect('http://127.0.0.1:' + port)
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
        var server = http2.createServer(function (req, res) {
          onFinished(req, function (_err, msg) {
            assert.strictEqual(msg, req)
            server.close(done)
          })
        // intentionally do not end the response; client will abort
        })

        server.listen(function () {
          var port = this.address().port
          var client = http2.connect('http://127.0.0.1:' + port)
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

    describe('when requests pipelined', function () {
      it('should handle socket errors', function (done) {
        var count = 0
        var server = http2.createServer(function (req, res) {
          onFinished(req, function (err) {
            assert.ifError(err)
            if (++count === 2) server.close(done)
          })

          // intentionally do not end the response; client will abort
        })

        server.listen(function () {
          var port = this.address().port
          var client = http2.connect('http://127.0.0.1:' + port)
          client.on('error', noop)

          // send two requests over the same HTTP/2 session
          var r1 = client.request({ ':path': '/' })
          r1.on('response', function () {})
          r1.end()

          var r2 = client.request({ ':path': '/' })
          r2.on('response', function () {})
          r2.end()

          // destroy the client session to simulate a network error
          setImmediate(function () {
            client.destroy()
          })
        })
      })
    })

    describe('when calling many times on same request', function () {
      it('should not print warnings', function (done) {
        var server = http2.createServer(function (req, res) {
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
          const client = http2.connect('http://127.0.0.1:' + port)
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
        var server = http2.createServer(function (req, res) {
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
          client = http2.connect('http://127.0.0.1:' + server.address().port)
          var response = client.request({ ':method': 'CONNECT', ':authority': 'localhost' })
          response.on('data', function (chunk) {
            assert.strictEqual(chunk.toString(), 'pong')
            client.close()
            server.close(done)
          })

          response.end('knock, knock')
        })
      })
    })
  })

  describe('isFinished(req)', function () {
    it('should be true after request finishes', function (done) {
      var server = http2.createServer(function (req, res) {
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
        var server = http2.createServer(function (req, res) {
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
        var server = http2.createServer(function (req, res) {
          onFinished(req, function (_err) {
            assert.ok(onFinished.isFinished(req))
            server.close(done)
          })

        // intentionally do not end the response; client will abort
        })

        server.listen(function () {
          var port = this.address().port
          var client = http2.connect('http://127.0.0.1:' + port)
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

    describe('when CONNECT method', function () {
      it('should be false immediately', function (done) {
        var client
        var data = []
        var server = http2.createServer(function (req, res) {
          res.statusCode = 405
          res.end()
        })

        server.on('connect', function (req, socket) {
          assert.ok(!onFinished.isFinished(req))
          req.resume()

          socket.end('pong')

          req.on('data', function (chunk) {
            data.push(chunk)
          })
        })

        server.listen(function () {
          client = http2.connect('http://127.0.0.1:' + server.address().port)

          var response = client.request({ ':method': 'CONNECT', ':authority': 'localhost' })
          response.on('data', function (chunk) {
            assert.strictEqual(chunk.toString(), 'pong')
            client.close()
            server.close(done)
          })

          response.end('knock, knock')
        })
      })

      it('should be true after request finishes', function (done) {
        var client
        var server = http2.createServer(function (req, res) {
          res.statusCode = 405
          res.end()
        })

        server.on('connect', function (req, socket) {
          var data = []

          onFinished(req, function (err) {
            assert.ifError(err)
            assert.ok(onFinished.isFinished(req))
            assert.strictEqual(Buffer.concat(data).toString(), 'knock, knock')
            socket.end('pong')
          })

          req.on('data', function (chunk) {
            data.push(chunk)
          })
        })

        server.listen(function () {
          client = http2.connect('http://127.0.0.1:' + server.address().port)

          var response = client.request({ ':method': 'CONNECT', ':authority': 'localhost' })
          response.on('data', function (chunk) {
            assert.strictEqual(chunk.toString(), 'pong')
            client.close()
            server.close(done)
          })

          response.end('knock, knock')
        })
      })
    })
  })
})

describe('HTTP/2 Native', function () {
  describe('onFinished(res, listener)', function () {
    describe('with ServerResponse', function () {
      it('should fire when response finishes', function (done) {
        const server = http2.createServer()

        server.on('stream', (stream, headers) => {
          onFinished(stream, done)
          stream.respond({ ':status': 200 })
          setTimeout(() => stream.end('hello world'), 10)
        })

        server.listen(0, function () {
          const port = server.address().port
          const client = http2.connect(`http://localhost:${port}`)
          const req = client.request({ ':path': '/' })

          req.on('response', () => {
            req.on('end', () => {
              client.close()
              server.close()
            })
          })
          req.end()
        })
      })

      it('should include the stream object', function (done) {
        const server = http2.createServer()

        server.on('stream', (stream, headers) => {
          onFinished(stream, (err, msg) => {
            assert.ok(!err)
            assert.strictEqual(msg, stream)
            done()
          })
          stream.respond({ ':status': 200 })
          setTimeout(() => stream.end('hello world'), 10)
        })

        server.listen(0, function () {
          const port = server.address().port
          const client = http2.connect(`http://localhost:${port}`)
          const req = client.request({ ':path': '/' })

          req.on('response', () => {
            req.on('end', () => {
              client.close()
              server.close()
            })
          })
          req.end()
        })
      })

      it('should fire when response is destroyed', function (done) {
        const server = http2.createServer()

        server.on('stream', (stream, headers) => {
          onFinished(stream, done)
          stream.respond({ ':status': 200 })
          setTimeout(() => stream.destroy(), 10)
        })

        server.listen(0, function () {
          const port = server.address().port
          const client = http2.connect(`http://localhost:${port}`)
          const req = client.request({ ':path': '/' })

          req.on('error', () => {
            // Ignore client error
          })

          req.on('close', () => {
            client.close()
            server.close()
          })

          req.end()
        })
      })

      describe('when called after finish', function () {
        it('should fire immediately', function (done) {
          const server = http2.createServer()

          server.on('stream', (stream, headers) => {
            onFinished(stream, () => {
              onFinished(stream, done)
            })
            stream.respond({ ':status': 200 })
            setTimeout(() => stream.end('hello world'), 10)
          })

          server.listen(0, function () {
            const port = server.address().port
            const client = http2.connect(`http://localhost:${port}`)
            const req = client.request({ ':path': '/' })

            req.on('response', () => {
              req.on('end', () => {
                client.close()
                server.close()
              })
            })
            req.end()
          })
        })

        describe('with async local storage', function () {
          it('should persist store in callback', function (done) {
            const asyncLocalStorage = new AsyncLocalStorage()
            const store = { foo: 'bar' }

            const server = http2.createServer()

            server.on('stream', (stream, headers) => {
              onFinished(stream, () => {
                asyncLocalStorage.run(store, () => {
                  onFinished(stream, () => {
                    assert.strictEqual(asyncLocalStorage.getStore().foo, 'bar')
                    done()
                  })
                })
              })
              stream.respond({ ':status': 200 })
              setTimeout(() => stream.end('hello world'), 10)
            })

            server.listen(0, function () {
              const port = server.address().port
              const client = http2.connect(`http://localhost:${port}`)
              const req = client.request({ ':path': '/' })

              req.on('response', () => {
                req.on('end', () => {
                  client.close()
                  server.close()
                })
              })
              req.end()
            })
          })
        })
      })

      describe('with async local storage', function () {
        it('should persist store in callback', function (done) {
          const asyncLocalStorage = new AsyncLocalStorage()
          const store = { foo: 'bar' }

          const server = http2.createServer()

          server.on('stream', (stream, headers) => {
            asyncLocalStorage.run(store, () => {
              onFinished(stream, () => {
                assert.strictEqual(asyncLocalStorage.getStore().foo, 'bar')
                done()
              })
            })
            stream.respond({ ':status': 200 })
            setTimeout(() => stream.end('hello world'), 10)
          })

          server.listen(0, function () {
            const port = server.address().port
            const client = http2.connect(`http://localhost:${port}`)
            const req = client.request({ ':path': '/' })

            req.on('response', () => {
              req.on('end', () => {
                client.close()
                server.close()
              })
            })
            req.end()
          })
        })
      })
    })

    describe('with multiple streams', function () {
      it('should fire for each stream independently', function (done) {
        const server = http2.createServer()
        let count = 0

        server.on('stream', (stream, headers) => {
          onFinished(stream, () => {
            count++
            if (count === 2) {
              done()
            }
          })
          stream.respond({ ':status': 200 })
          setTimeout(() => stream.end(`response ${count}`), 10)
        })

        server.listen(0, function () {
          const port = server.address().port
          const client = http2.connect(`http://localhost:${port}`)

          const req1 = client.request({ ':path': '/1' })
          const req2 = client.request({ ':path': '/2' })

          let responses = 0

          req1.on('response', () => {
            req1.on('end', () => {
              responses++
              if (responses === 2) {
                client.close()
                server.close()
              }
            })
          })
          req1.end()

          req2.on('response', () => {
            req2.on('end', () => {
              responses++
              if (responses === 2) {
                client.close()
                server.close()
              }
            })
          })
          req2.end()
        })
      })
    })

    describe('when client closes connection', function () {
      it('should fire the callback', function (done) {
        const server = http2.createServer()

        server.on('stream', (stream, headers) => {
          onFinished(stream, () => {
            done()
          })
          stream.respond({ ':status': 200 })
          // Don't end the stream, let client close it
        })

        server.listen(0, function () {
          const port = server.address().port
          const client = http2.connect(`http://localhost:${port}`)
          const req = client.request({ ':path': '/' })

          req.on('response', () => {
            setTimeout(() => {
              req.close()
              setTimeout(() => {
                client.close()
                server.close()
              }, 50)
            }, 10)
          })

          req.on('error', () => {
            // Ignore client errors
          })

          req.end()
        })
      })
    })

    describe('when stream errors', function () {
      it('should fire the callback', function (done) {
        const server = http2.createServer()

        server.on('stream', (stream, headers) => {
          onFinished(stream, () => {
            done()
          })
          stream.respond({ ':status': 200 })
          setTimeout(() => {
            stream.destroy()
          }, 10)
        })

        server.listen(0, function () {
          const port = server.address().port
          const client = http2.connect(`http://localhost:${port}`)
          const req = client.request({ ':path': '/' })

          req.on('error', () => {
            // Ignore client errors
          })

          req.on('close', () => {
            client.close()
            server.close()
          })

          req.end()
        })
      })
    })
  })

  describe('isFinished(res)', function () {
    it('should return false for unfinished stream', function (done) {
      const server = http2.createServer()

      server.on('stream', (stream, headers) => {
        assert.strictEqual(onFinished.isFinished(stream), false)
        stream.respond({ ':status': 200 })
        stream.end('hello')
        done()
      })

      server.listen(0, function () {
        const port = server.address().port
        const client = http2.connect(`http://localhost:${port}`)
        const req = client.request({ ':path': '/' })

        req.on('response', () => {
          req.on('end', () => {
            client.close()
            server.close()
          })
        })
        req.end()
      })
    })

    it('should return true for finished stream', function (done) {
      const server = http2.createServer()

      server.on('stream', (stream, headers) => {
        onFinished(stream, () => {
          assert.strictEqual(onFinished.isFinished(stream), true)
          done()
        })
        stream.respond({ ':status': 200 })
        setTimeout(() => stream.end('hello'), 10)
      })

      server.listen(0, function () {
        const port = server.address().port
        const client = http2.connect(`http://localhost:${port}`)
        const req = client.request({ ':path': '/' })

        req.on('response', () => {
          req.on('end', () => {
            client.close()
            server.close()
          })
        })
        req.end()
      })
    })

    it('should return true for destroyed stream', function (done) {
      const server = http2.createServer()

      server.on('stream', (stream, headers) => {
        stream.respond({ ':status': 200 })
        setTimeout(() => {
          stream.destroy()
          // Check after destroy completes
          setImmediate(() => {
            assert.strictEqual(onFinished.isFinished(stream), true)
            done()
          })
        }, 10)
      })

      server.listen(0, function () {
        const port = server.address().port
        const client = http2.connect(`http://localhost:${port}`)
        const req = client.request({ ':path': '/' })

        req.on('error', () => {
          // Ignore
        })

        req.on('close', () => {
          client.close()
          server.close()
        })

        req.end()
      })
    })
  })
})
