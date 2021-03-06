'use strict';

/**
 * File: mockResponse
 *
 *  This file implements node.js's implementation of a 'response' object.
 *  Like all good mocks, the response file that can be called and used in
 *  place of a real HTTP response object.
 *
 * @author Howard Abrams <howard.abrams@gmail.com>
 */

/**
 * Function: createResponse
 *
 *    Creates a new mock 'response' instance. All values are reset to the
 *    defaults.
 *
 * Parameters:
 *
 *   options - An object of named parameters.
 *
 * Options:
 *
 *   encoding - The default encoding for the response
 */

var WritableStream = require('./mockWritableStream');
var EventEmitter = require('./mockEventEmitter');
var mime = require('mime');
var http = require('./node/http');
var _assign = require('lodash.assign');

function createResponse(options) {

    if (!options) {
        options = {};
    }

    var _endCalled = false;
    var _data = '';
    var _encoding = options.encoding;

    var _redirectUrl = '';
    var _renderView = '';
    var _renderData = {};

    if (options.writableStream) {
        WritableStream = options.writableStream;
    }
    if (options.eventEmitter) {
        EventEmitter = options.eventEmitter;
    }
    var writableStream = new WritableStream();
    var eventEmitter = new EventEmitter();

    // create mockResponse

    var mockResponse = {};

    mockResponse._headers = {};

    mockResponse.statusCode = 200;
    mockResponse.statusMessage = 'OK';
    mockResponse.cookies = {};
    mockResponse.headersSent = false;

    mockResponse.cookie = function(name, value, opt) {

        mockResponse.cookies[name] = {
            value: value,
            options: opt
        };

    };

    mockResponse.clearCookie = function(name) {
        delete mockResponse.cookies[name];
    };

    mockResponse.status = function(code) {
        mockResponse.statusCode = code;
        return this;
    };

    /**
     * Function: writeHead
     *
     *  The 'writeHead' function from node's HTTP API.
     *
     * Parameters:
     *
     *  statusCode - A number to send as a the HTTP status
     *  headers    - An object of properties that will be used for
     *               the HTTP headers.
     */
    mockResponse.writeHead = function(statusCode, statusMessage, headers) {

        if (_endCalled) {
            throw 'The end() method has already been called.';
        }

        if (mockResponse.headersSent) {
            // Node docs: "This method must only be called once on a message"
            // but it doesn't error if you do call it after first chunk of body is sent
            // so we shouldn't throw here either (although it's a bug in the code).
            // We return without updating since in real life it's just possible the double call didn't
            // completely corrupt the response (for example not using chunked encoding due to HTTP/1.0 client)
            // and in this case the client will see the _original_ headers.
            return;
        }

        mockResponse.statusCode = statusCode;

        // resolve statusMessage and headers as optional
        if (Object.prototype.toString.call(statusMessage) === '[object Object]') {
            headers = statusMessage;
            statusMessage = null;
        }

        if (statusMessage) {
            mockResponse.statusMessage = statusMessage;
        }

        // The headers specified earlier (been set with `mockResponse.setHeader`)
        // should not be overwritten but be merged with the headers
        // passed into `mockResponse.writeHead`.
        if (headers) {
            mockResponse._headers = _assign(mockResponse._headers, headers);
        }

    };

    /**
     *  The 'send' function from restify's Response API that returns data
     *  to the client. Can be called multiple times.
     *
     *  @see http://mcavage.me/node-restify/#response-api
     *
     * @param data The data to return. Must be a string.
     */
    mockResponse.send = function(a, b, c) {

        var _formatData = function(data) {

            if (typeof data === 'object') {

                if (data.statusCode) {
                    mockResponse.statusCode = data.statusCode;
                } else if (data.httpCode) {
                    mockResponse.statusCode = data.statusCode;
                }

                if (data.body) {
                    _data = data.body;
                } else {
                    _data = data;
                }

            } else {
                _data += data;
            }

        };

        switch (arguments.length) {

            case 1:

                if (typeof a === 'number') {
                    mockResponse.statusCode = a;
                } else {
                    _formatData(a);
                }

                break;

            case 2:

                if (typeof a === 'number') {
                    _formatData(b);
                    mockResponse.statusCode = a;
                } else if (typeof b === 'number') {
                    _formatData(a);
                    mockResponse.statusCode = b;
                    console.warn('WARNING: Called send() with deprecated parameter order');
                } else {
                    _formatData(a);
                    _encoding = b;
                }

                break;

            case 3:

                _formatData(a);
                mockResponse._headers = b;
                mockResponse.statusCode = c;
                console.warn('WARNING: Called send() with deprecated three parameters');

                break;

            default:
                break;

        }

        mockResponse.headersSent = true;

        mockResponse.emit('send');
        mockResponse.emit('end');

    };

    /**
     * Send given HTTP status code.
     *
     * Sets the response status to `statusCode` and the body of the
     * response to the standard description from node's http.STATUS_CODES
     * or the statusCode number if no description.
     *
     * Examples:
     *
     *     mockResponse.sendStatus(200);
     *
     * @param {number} statusCode
     * @api public
     */

    mockResponse.sendStatus = function sendStatus(statusCode) {
        var body = http.STATUS_CODES[statusCode] || String(statusCode);

        mockResponse.statusCode = statusCode;
        mockResponse.type('txt');

        return mockResponse.send(body);
    };


    /**
     * Function: json
     *
     *   The 'json' function from node's HTTP API that returns JSON
     *   data to the client.
     *
     *  Parameters:
     *
     *   a - Either a statusCode or string containing JSON payload
     *   b - Either a statusCode or string containing JSON payload
     *
     *  If not specified, the statusCode defaults to 200.
     *  Second parameter is optional.
     */
    mockResponse.json = function(a, b) {

        mockResponse.setHeader('Content-Type', 'application/json');
        if (a) {
            if (typeof a === 'number') {
                mockResponse.statusCode = a;
            } else {
                _data += JSON.stringify(a);
            }
        }
        if (b) {
            if (typeof b === 'number') {
                mockResponse.statusCode = b;
            } else {
                _data += JSON.stringify(b);
            }
        }

        mockResponse.emit('send');
        mockResponse.emit('end');

    };

    /**
     * Function: jsonp
     *
     *   The 'jsonp' function from node's HTTP API that returns JSON
     *   data to the client.
     *
     *  Parameters:
     *
     *   a - Either a statusCode or string containing JSON payload
     *   b - Either a statusCode or string containing JSON payload
     *
     *  If not specified, the statusCode defaults to 200.
     *  Second parameter is optional.
     */
    mockResponse.jsonp = function(a, b) {

        mockResponse.setHeader('Content-Type', 'text/javascript');

        if (a) {
            if (typeof a === 'number') {
                mockResponse.statusCode = a;
            } else {
                _data += JSON.stringify(a);
            }
        }
        if (b) {
            if (typeof b === 'number') {
                mockResponse.statusCode = b;
            } else {
                _data += JSON.stringify(b);
            }
        }

        mockResponse.emit('send');
        mockResponse.emit('end');

    };

    /**
     * Set "Content-Type" response header with `type` through `mime.lookup()`
     * when it does not contain "/", or set the Content-Type to `type` otherwise.
     *
     * Examples:
     *
     *     res.type('.html');
     *     res.type('html');
     *     res.type('json');
     *     res.type('application/json');
     *     res.type('png');
     *
     * @param {String} type
     * @return {ServerResponse} for chaining
     * @api public
     */
    mockResponse.contentType = mockResponse.type = function(type){
        return mockResponse.set('Content-Type', type.indexOf('/') >= 0 ? type : mime.lookup(type));
    };

    /**
     * Function: write
     *
     *    This function has the same behavior as the 'send' function.
     *
     * Parameters:
     *
     *  data - The data to return. Must be a string. Appended to
     *         previous calls to data.
     *  encoding - Optional encoding value.
     */

    mockResponse.write = function(data, encoding) {

        mockResponse.headersSent = true;

        _data += data;

        if (encoding) {
            _encoding = encoding;
        }

    };

    /**
     *  Function: end
     *
     *  The 'end' function from node's HTTP API that finishes
     *  the connection request. This must be called.
     *
     * Parameters:
     *
     *  data - Optional data to return. Must be a string. Appended
     *         to previous calls to <send>.
     *  encoding - Optional encoding value.
     */
    mockResponse.end = function(data, encoding) {

        mockResponse.headersSent = true;

        _endCalled = true;

        if (data) {
            _data += data;
        }

        if (encoding) {
            _encoding = encoding;
        }

        mockResponse.emit('end');

    };

    /**
     * Function: vary
     *
     *   Adds the field/s to the Vary response header
     *
     * Examples:
     *
     *    res.vary('A-B-Test');
     *    res.vary(['A-B-Test', 'Known-User']);
     */
    mockResponse.vary = function(fields) {
        var header = mockResponse.getHeader('Vary') || '';
        var values = header.length ? header.split(', ') : [];

        fields = Array.isArray(fields) ? fields : [ fields ];

        fields = fields.filter(function(field) {
            var regex = new RegExp(field, 'i');

            var matches = values.filter(function(value) {
                return value.match(regex);
            });

            return !matches.length;
        });

        values = values.concat(fields);

        return mockResponse.setHeader('Vary', values.join(', '));
    };

   /**
    * Set header `field` to `val`, or pass
    * an object of header fields.
    *
    * Examples:
    *
    *    res.set('Foo', ['bar', 'baz']);
    *    res.set('Accept', 'application/json');
    *    res.set({ Accept: 'text/plain', 'X-API-Key': 'tobi' });
    *
    * Aliased as `mockResponse.header()`.
    *
    * @param {String|Object|Array} field
    * @param {String} val
    * @return {ServerResponse} for chaining
    * @api public
    */
    mockResponse.set = mockResponse.header = function header(field, val) {
        if (arguments.length === 2) {
            if (Array.isArray(val)) {
                val = val.map(String);
            } else {
                val = String(val);
            }
            mockResponse.setHeader(field, val);
        } else {
            for (var key in field) {
                mockResponse.setHeader(key, field[key]);
            }
        }
        return mockResponse;
    };

    /**
     * Function: getHeader
     * Function: get
     *
     *   Returns a particular header by name.
     */
    mockResponse.get = mockResponse.getHeader = function(name) {
        return mockResponse._headers[name] ||
                mockResponse._headers[name.toLowerCase()] ||
                mockResponse._headers[name.toUpperCase()];
    };

    /**
     * Function: setHeader
     * Function: set
     *
     *   Set a particular header by name.
     */
    mockResponse.setHeader = function(name, value) {
        mockResponse._headers[name] = value;
        return value;
    };

    /**
     * Function: removeHeader
     *
     *   Removes an HTTP header by name.
     */
    mockResponse.removeHeader = function(name) {
        delete mockResponse._headers[name];
    };

    /**
     * Function: setEncoding
     *
     *    Sets the encoding for the data. Generally 'utf8'.
     *
     * Parameters:
     *
     *   encoding - The string representing the encoding value.
     */
    mockResponse.setEncoding = function(encoding) {
        _encoding = encoding;
    };

    /**
     * Function: redirect
     *
     *     Redirect to a url with response code
     */
    mockResponse.redirect = function(a, b) {

        switch (arguments.length) {

            case 1:

                mockResponse.statusCode = 302;
                _redirectUrl = a;
                break;

            case 2:

                if (typeof a === 'number') {
                    mockResponse.statusCode = a;
                    _redirectUrl = b;
                }

                break;

            default:
                break;

        }

        mockResponse.emit('end');
    };

    /**
     * Function: render
     *
     *     Render a view with a callback responding with the
     *     rendered string.
     */
    mockResponse.render = function(a, b) {

        _renderView = a;

        switch (arguments.length) {

            case 2:
                _renderData = b;
                break;

            default:
                break;

        }

        mockResponse.emit('render');
        mockResponse.emit('end');

    };

    // WritableStream.writable is not a function
    // mockResponse.writable = function() {
    //     return writableStream.writable.apply(this, arguments);
    // };

    // mockResponse.end = function(){
    //  return writableStream.end.apply(this, arguments);
    // };

    mockResponse.destroy = function() {
        return writableStream.destroy.apply(this, arguments);
    };

    mockResponse.destroySoon = function() {
        return writableStream.destroySoon.apply(this, arguments);
    };

    mockResponse.addListener = function() {
        return eventEmitter.addListener.apply(this, arguments);
    };

    mockResponse.on = function() {
        return eventEmitter.on.apply(this, arguments);
    };

    mockResponse.once = function() {
        return eventEmitter.once.apply(this, arguments);
    };

    mockResponse.removeListener = function() {
        return eventEmitter.removeListener.apply(this, arguments);
    };

    mockResponse.removeAllListeners = function() {
        return eventEmitter.removeAllListeners.apply(this, arguments);
    };

    mockResponse.setMaxListeners = function() {
        return eventEmitter.setMaxListeners.apply(this, arguments);
    };

    mockResponse.listeners = function() {
        return eventEmitter.listeners.apply(this, arguments);
    };

    mockResponse.emit = function() {
        return eventEmitter.emit.apply(this, arguments);
    };

    //This mock object stores some state as well
    //as some test-analysis functions:

    /**
     * Function: _isEndCalled
     *
     *  Since the <end> function must be called, this function
     *  returns true if it has been called. False otherwise.
     */
    mockResponse._isEndCalled = function() {
        return _endCalled;
    };

    /**
     * Function: _getHeaders
     *
     *  Returns all the headers that were set. This may be an
     *  empty object, but probably will have "Content-Type" set.
     */
    mockResponse._getHeaders = function() {
        return mockResponse._headers;
    };

    /**
     * Function: _getData
     *
     *  The data sent to the user.
     */
    mockResponse._getData = function() {
        return _data;
    };

    /**
     * Function: _getStatusCode
     *
     *  The status code that was sent to the user.
     */
    mockResponse._getStatusCode = function() {
        return mockResponse.statusCode;
    };

    /**
     * Function: _getStatusMessage
     *
     *  The status message that was sent to the user.
     */
    mockResponse._getStatusMessage = function() {
        return mockResponse.statusMessage;
    };

    /**
     * Function: _isJSON
     *
     *  Returns true if the data sent was defined as JSON.
     *  It doesn't validate the data that was sent.
     */
    mockResponse._isJSON = function() {
        return (mockResponse.getHeader('Content-Type') === 'application/json');
    };

    /**
     * Function: _isUTF8
     *
     *    If the encoding was set, and it was set to UTF-8, then
     *    this function return true. False otherwise.
     *
     * Returns:
     *
     *   False if the encoding wasn't set and wasn't set to "utf8".
     */
    mockResponse._isUTF8 = function() {

        if (!_encoding) {
            return false;
        }

        return (_encoding === 'utf8');

    };

    /**
     * Function: _isDataLengthValid
     *
     *    If the Content-Length header was set, this will only
     *    return true if the length is actually the length of the
     *    data that was set.
     *
     * Returns:
     *
     *   True if the "Content-Length" header was not
     *   set. Otherwise, it compares it.
     */
    mockResponse._isDataLengthValid = function() {

        if (mockResponse.getHeader('Content-Length')) {
            return (mockResponse.getHeader('Content-Length').toString() === _data.length.toString());
        }

        return true;

    };

    /**
     * Function: _getRedirectUrl
     *
     *     Return redirect url of redirect method
     *
     * Returns:
     *
     *     Redirect url
     */
    mockResponse._getRedirectUrl = function() {
        return _redirectUrl;
    };

    /**
     * Function: _getRenderView
     *
     *     Return render view of render method
     *
     * Returns:
     *
     *     render view
     */
    mockResponse._getRenderView = function() {
        return _renderView;
    };

    /**
     * Function: _getRenderData
     *
     *     Return render data of render method
     *
     * Returns:
     *
     *     render data
     */
    mockResponse._getRenderData = function() {
        return _renderData;
    };

    return mockResponse;

}

module.exports.createResponse = createResponse;
