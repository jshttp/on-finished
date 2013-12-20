module.exports = function (thingie, callback) {
  var socket = thingie.socket
  var res = thingie.res || thingie

  socket.on('error', destroy)
  socket.on('close', destroy)
  res.on('finish', cleanup)

  function destroy(err) {
    callback(err)
    cleanup()
  }

  function cleanup() {
    socket.removeListener('error', destroy)
    socket.removeListener('close', destroy)
    res.removeListener('finish', cleanup)
  }

  return thingie
}