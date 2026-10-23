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

/** Symbol to store the listener on the message.
 * @private
 */
const kOnFinished = Symbol('onFinished')

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
  if (typeof listener !== 'function') {
    throw new TypeError('listener must be a function')
  }

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
 * @return {boolean | undefined}
 * @public
 */

function isFinished (msg) {
  const socket = msg.socket
  const stream = msg.stream
  const isHttp2 = stream && typeof stream.closed === 'boolean'

  // OutgoingMessage or Http2ServerResponse
  if (typeof msg.writableEnded === 'boolean') {
    // Http2ServerResponse
    if (isHttp2) {
      return stream.closed
    }
    // OutgoingMessage
    return Boolean(msg.writableEnded || (socket && !socket.writable))
  }

  // IncomingMessage or Http2ServerRequest
  if (typeof msg.complete === 'boolean') {
    // Http2ServerRequest
    if (isHttp2) {
      return Boolean(stream.closed || (msg.complete && !msg.readable))
    }

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
  let socket

  const cleanupFinished = stream.finished(msg, (error) => {
    // Wait for an aborted HTTP/2 request to close so its reset error is stored.
    if (error && error.code === 'ERR_STREAM_PREMATURE_CLOSE' && msg.stream && msg.aborted && !msg.stream.errored) {
      msg.once('close', () => onFinish(error))
      return
    }

    onFinish(error)
  })

  function onFinish (error) {
    if (finished) return
    finished = true

    cleanupFinished()
    msg.removeListener('socket', onSocket)
    socket?.removeListener('close', onSocketClose)

    // The message may not forward its transport's error, especially in HTTP/2.
    const transportError = msg.stream?.errored || socket?.errored || msg.socket?.errored
    if (transportError) {
      error = transportError
    } else if (error && error.code === 'ECONNRESET' && !msg.stream && msg.aborted && socket) {
      // Ignore the generated request-abort error when the assigned socket has no error.
      error = undefined
    } else if (error && error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      // A close without a stored transport error is not itself an error.
      error = undefined
    }

    callback(error || undefined)
  }

  function onSocket (assignedSocket) {
    msg.removeListener('socket', onSocket)
    if (finished) return

    socket = assignedSocket
    socket.once('close', onSocketClose)
  }

  function onSocketClose () {
    onFinish()
  }

  // HTTP/1 messages can retain unread data after their socket closes.
  if (!msg.stream && 'socket' in msg) {
    if (msg.socket) {
      onSocket(msg.socket)
    } else {
      msg.once('socket', onSocket)
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
  let attached = msg[kOnFinished]

  // create a private single listener with queue
  if (!attached || !attached.queue) {
    attached = msg[kOnFinished] = createListener(msg)
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
    if (msg[kOnFinished] === listener) msg[kOnFinished] = null
    if (!listener.queue) return

    const queue = listener.queue
    listener.queue = null

    for (let i = 0; i < queue.length; i++) {
      queue[i](err, msg)
    }
  }

  listener.queue = []

  return listener
}
