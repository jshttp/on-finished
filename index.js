/*!
 * finished
 * Copyright(c) 2014 Jonathan Ong
 * MIT Licensed
 */

/**
 * Module exports.
 */

module.exports = finished;
module.exports.isFinished = isFinished;


/**
* Module dependencies.
*/

var first = require('ee-first')

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
 * @param {object} msg
 * @param {function} callback
 * @return {object}
 * @api public
 */

function finished(msg, callback) {
  var socket = msg.socket

  if (isFinished(msg)) {
    defer(callback)
    return msg
  }

  var listener = msg.__onFinished

  // create a private single listener with queue
  if (!listener || !listener.queue) {
    listener = msg.__onFinished = function onFinished(err) {
      if (msg.__onFinished === listener) msg.__onFinished = null
      var queue = listener.queue || []
      while (queue.length) queue.shift()(err)
    }
    listener.queue = []

    // finished on first event
    first([
      [socket, 'error', 'close'],
      [msg, 'end', 'finish'],
    ], listener)
  }

  listener.queue.push(callback)

  return msg
}

/**
 * Determine is message is already finished.
 *
 * @param {object} msg
 * @return {boolean}
 * @api public
 */

function isFinished(msg) {
  // finished for OutgoingMessage, complete for IncomingMessage
  return msg.finished === true
    || msg.complete === true
    || msg.socket.writable === false
}
