const assert = require('node:assert')
const { AsyncLocalStorage } = require('node:async_hooks')
const onFinished = require('..')
const { getTestHelpers, close } = require('./support/utils')

runTestSuite('http')
runTestSuite('http2')

function runTestSuite (type) {
  const { http, sendGet, sendGetError } = getTestHelpers(type)

  describe(type + ' onFinished(res, listener)', function () {
    it('should invoke listener given an unknown object', function (done) {
      onFinished({}, done)
    })

    it('should throw TypeError if listener is not a function', function () {
      assert.throws(() => { onFinished({}, 'not a function') }, /listener must be a function/)
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

        describe('when async local storage', function () {
          it('should presist store in callback', function (done) {
            var asyncLocalStorage = new AsyncLocalStorage()
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

      describe('when async local storage', function () {
        it('should presist store in callback', function (done) {
          var asyncLocalStorage = new AsyncLocalStorage()
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

    describe('when the response aborts', function () {
      it('should execute the callback', function (done) {
        var client
        var server = http.createServer(function (req, res) {
          onFinished(res, close(server, done))
          setTimeout(client.destroy.bind(client), 0)
        })

        server.listen(function () {
          var port = this.address().port
          client = sendGetError(port)
        })
      })
    })
  })

  describe(type + ' isFinished(res)', function () {
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

    describe('when the response aborts', function () {
      it('should return true', function (done) {
        var client
        var server = http.createServer(function (req, res) {
          onFinished(res, function (err) {
            assert.ifError(err)
            assert.ok(onFinished.isFinished(res))
            server.close(done)
          })
          setTimeout(client.destroy.bind(client), 0)
        })
        server.listen(function () {
          var port = this.address().port
          client = sendGetError(port)
        })
      })
    })
  })

  describe(type + ' onFinished(req, listener)', function () {
    it('should throw TypeError if listener is not a function', function () {
      assert.throws(() => { onFinished({}, 'not a function') }, /listener must be a function/)
    })

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

        describe('when async local storage', function () {
          it('should presist store in callback', function (done) {
            var asyncLocalStorage = new AsyncLocalStorage()
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

      describe('when async local storage', function () {
        it('should presist store in callback', function (done) {
          var asyncLocalStorage = new AsyncLocalStorage()
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

    describe('when the request aborts', function () {
      it('should execute the callback', function (done) {
        var client
        var server = http.createServer(function (req, res) {
          onFinished(req, close(server, done))
          setTimeout(client.destroy.bind(client), 0)
        })
        server.listen(function () {
          var port = this.address().port
          client = sendGetError(port)
        })
      })
    })
  })

  describe(type + ' isFinished(req)', function () {
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

    describe('when the request aborts', function () {
      it('should return true', function (done) {
        var client
        var server = http.createServer(function (req, res) {
          onFinished(res, function (err) {
            assert.ifError(err)
            assert.ok(onFinished.isFinished(req))
            server.close(done)
          })
          setTimeout(client.destroy.bind(client), 0)
        })
        server.listen(function () {
          var port = this.address().port
          client = sendGetError(port)
        })
      })
    })
  })
}
