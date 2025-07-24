/*!
 * on-finished
 * Copyright(c) 2013 Jonathan Ong
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module exports.
 * @public
 */

module.exports = onFinished
module.exports.isFinished = isFinished

/**
 * Module dependencies.
 * @private
 */

const { AsyncResource } = require('node:async_hooks')
const stream = require('node:stream')

/**
 * Invoke callback when the response has finished, useful for
 * cleaning up resources afterwards.
 *
 * @param {object} msg
 * @param {function} listener
 * @return {object}
 * @public
 */

function onFinished (msg, listener) {
  if (isFinished(msg) !== false) {
    setImmediate(listener, null, msg)
    return msg
  }

  // attach the listener to the message
  attachListener(
    msg,
    AsyncResource.bind(listener, listener.name || 'bound-anonymous-fn', null)
  )

  return msg
}

/**
 * Determine if message is already finished.
 *
 * @param {object} msg
 * @return {boolean}
 * @public
 */

function isFinished (msg) {
  var socket = msg.socket

  if (typeof msg.finished === 'boolean') {
    // OutgoingMessage
    return Boolean(msg.finished || (socket && !socket.writable))
  }

  if (typeof msg.complete === 'boolean') {
    // IncomingMessage
    return Boolean(msg.upgrade || !socket || !socket.readable || (msg.complete && !msg.readable))
  }

  // don't know
  return undefined
}

/**
 * Attach a finished listener to the message.
 *
 * @param {object} msg
 * @param {function} callback
 * @private
 */

function attachFinishedListener (msg, callback) {
  let finished = false
  let cleanupSocket

  function onFinish (error) {
    if (finished) return
    finished = true
    callback(error)
  }

  const cleanupFinished = stream.finished(msg, (error) => {
    cleanupFinished()
    if (cleanupSocket) {
      cleanupSocket()
    }

    // ignore premature close error
    if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      onFinish(error)
    } else {
      onFinish()
    }
  })

  function onSocket (socket) {
    // remove listener
    msg.removeListener('socket', onSocket)

    if (finished) return

    function onSocketErrorOrClose (error) {
      // remove listeners
      socket.removeListener('error', onSocketErrorOrClose)
      socket.removeListener('close', onSocketErrorOrClose)

      onFinish(error)
    }

    // finished on first socket event
    socket.on('error', onSocketErrorOrClose)
    socket.on('close', onSocketErrorOrClose)

    // cleanup socket listeners
    cleanupSocket = function () {
      socket.removeListener('error', onSocketErrorOrClose)
      socket.removeListener('close', onSocketErrorOrClose)
    }
  }

  if (msg.socket) {
    // socket already assigned
    onSocket(msg.socket)
  } else {
    // wait for socket to be assigned
    msg.on('socket', onSocket)

    // cleanup socket listener in case the socket is never assigned
    cleanupSocket = function () {
      msg.removeListener('socket', onSocket)
    }
  }
}

/**
 * Attach the listener to the message.
 *
 * @param {object} msg
 * @param {function} listener
 * @private
 */

function attachListener (msg, listener) {
  let attached = msg.__onFinished

  // create a private single listener with queue
  if (!attached || !attached.queue) {
    attached = msg.__onFinished = createListener(msg)
    attachFinishedListener(msg, attached)
  }

  attached.queue.push(listener)
}

/**
 * Create listener on message.
 *
 * @param {object} msg
 * @return {function}
 * @private
 */

function createListener (msg) {
  function listener (err) {
    if (msg.__onFinished === listener) msg.__onFinished = null
    if (!listener.queue) return

    var queue = listener.queue
    listener.queue = null

    for (var i = 0; i < queue.length; i++) {
      queue[i](err, msg)
    }
  }

  listener.queue = []

  return listener
}
