module.exports = function (thingie, callback) {
  var socket = thingie.socket || thingie
  var res = thingie.res || thingie
  if (!socket.writable)
    return setImmediate(callback)

  socket.on('error', done)
  socket.on('close', done)
  res.on('finish', done)

  function done(err) {
    if (err != null && !(err instanceof Error)) err = null; // suck it node
    socket.removeListener('error', done)
    socket.removeListener('close', done)
    res.removeListener('finish', done)
    callback(err)
  }

  return thingie
}
