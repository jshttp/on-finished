var EventEmitter = require('events').EventEmitter

var onSocketError = require('./')

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
    onSocketError(thingie, function (err) {
      called = true
      err.message.should.equal('boom')
    })
    thingie.socket.emit('error', new Error('boom'))
    called.should.be.true
  })

  it('should not execute the callback if response is finished', function () {
    var thingie = createThingie()
    var called = false
    onSocketError(thingie, function () {
      called = true
    })
    thingie.emit('finish')
    try {
      // throws if there are no listeners
      thingie.socket.emit('error', new Error('boom'))
      throw new Error('alksdjflaksjdf')
    } catch (err) {
      if (err.message !== 'boom')
        throw new Error('wtf')
    }
    called.should.be.false
  })
})

describe('when the socket is not writable', function () {
  it('should execute the callback immediately', function (done) {
    var thingie = createThingie()
    thingie.socket.writable = false
    onSocketError(thingie, function (err) {
      done()
    })
  })
})