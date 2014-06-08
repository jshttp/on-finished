/*!
 * finished
 * Copyright(c) 2014 Jonathan Ong
 * MIT Licensed
 */

/**
* Variables.
*/

/* istanbul ignore next */
var defer = typeof setImmediate === 'function'
  ? setImmediate
  : function(fn){ process.nextTick(fn.bind.apply(fn, arguments)) }

/**
 * Invoke callback when the response has finished, useful for
 * cleaning up resources afterwards.
 *
 * @param {object} thingie
 * @param {function} callback
 * @return {object}
 * @api public
 */

module.exports = function finished(thingie, callback) {
  var socket = thingie.socket || thingie
  var res = thingie.res || thingie

  if (res.finished || !socket.writable) {
    defer(callback)
    return thingie
  }

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
