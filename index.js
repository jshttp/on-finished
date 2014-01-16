module.exports = function (thingie, callback) {
  var socket = thingie.socket
  var res = thingie.res || thingie
  if (!socket.writable)
    return setImmediate(callback)

  socket.on('error', done)
  socket.on('close', done)
  res.on('finish', done)

  function done(err) {
    socket.removeListener('error', done)
    socket.removeListener('close', done)
    res.removeListener('finish', done)
    callback(err)
  }

  return thingie
}