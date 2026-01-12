const assert = require('node:assert')
const { AsyncLocalStorage } = require('node:async_hooks')
const http2 = require('node:http2')
const onFinished = require('..')

describe('HTTP/2', function () {
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
