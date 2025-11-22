const http1 = require('http')
const http2 = require('http2')

exports.sendGetHTTP1 = sendGetHTTP1
exports.sendGetHTTP2 = sendGetHTTP2
exports.close = close
exports.noop = noop
exports.captureStderr = captureStderr

function sendGetHTTP1 (server) {
  server.listen(function onListening () {
    var port = this.address().port
    http1.get('http://127.0.0.1:' + port, function onResponse (res) {
      res.resume()
      res.on('end', server.close.bind(server))
    })
  })
}

function sendGetHTTP2 (server) {
  server.listen(function onListening () {
    var port = this.address().port
    const client = http2.connect('http://127.0.0.1:' + port)
    client.request({ ':path': '/' })    
  })
}

function close (server, callback) {
  return function (error) {
    server.close(function (err) {
      callback(error || err)
    })
  }
}

function noop () {}

function captureStderr (fn) {
  var chunks = []
  var write = process.stderr.write

  process.stderr.write = function write (chunk, encoding) {
    chunks.push(Buffer.from(chunk, encoding))
  }

  try {
    fn()
  } finally {
    process.stderr.write = write
  }

  return Buffer.concat(chunks).toString('utf8')
}
