/**
 * very basic http client, originally written for the restiq unit tests
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var http = require('http');
var Url = require('url');

module.exports = HttpClient;
module.exports.emulateRestifyClient = emulateRestifyClient;

function HttpClient( options ) {
    this._options = { url: "", headers: {} };
    for (var i in options) this._options[i] = options[i];
    this._request = this._options.request || http.request;
};

HttpClient.prototype = {
    call:
    function call( method, uri, body, cb ) {
        if (cb === undefined) { cb = body; body = ""; }
        if (typeof cb !== 'function') throw new Error("callback is required");
        var options = this._buildRequestOptions(method, uri);

        body = this._encodeBody(options.headers, body);

        var req = this._request(options, function(res) {
            var chunks = new Array();
            res.on('data', function(chunk) {
                chunks.push(chunk);
            });
            res.on('error', function(err) {
                cb(err);
            });
            res.on('end', function() {
                res.body = chunks.length ? Buffer.concat(chunks) : chunks[0] ? chunks[0] : new Buffer("");
                cb(null, res);
            });
        });
        req.on('error', function(err) {
            return cb(err);
        });
        req.end(body);
        return req;
    },

    _buildRequestOptions:
    function _buildRequestOptions( method, uri ) {
        var i, options = {};
        if (typeof uri === 'string') {
            options = Url.parse((!uri || uri[0] === '/') ? this._options.url + uri : uri);
        }
        for (i in this._options) options[i] = this._options[i];
        for (i in uri) options[i] = uri[i];
        // TODO: copy out just the parts of interest, not all fields from uri
        options.method = method;
        return options;
    },

    _encodeBody:
    function _encodeBody( headers, body ) {
        if (!body || typeof body === 'string') { headers['Content-Type'] = 'text/plain'; }
        else if (Buffer.isBuffer(body)) {        headers['Content-Type'] = 'application/octet-stream'; }
        else {                                   headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
        return body;
    },
};


// TODO: make into own class, and move these methods into the prototype
function emulateRestifyClient( self ) {
    self.basicAuth =
        function basicAuth( user, pass ) {
            this._options.headers['Authorization'] = "Basic " + new Buffer(user + ":" + pass).toString('base64');
        },

    self.get =
        function get( uri, body, cb ) { return this._callRestifyCompatible('GET', uri, body, cb); };

    self.post =
        function post( uri, body, cb ) { return this._callRestifyCompatible('POST', uri, body, cb); };

    self.put =
        function put( uri, body, cb ) { return this._callRestifyCompatible('PUT', uri, body, cb); };

    self.delete =
        function delete_( uri, body, cb ) { return this._callRestifyCompatible('DELETE', uri, body, cb); };

    self.del =
        self.delete;

    self._callRestifyCompatible =
        function _callRestifyCompatible( method, uri, body, cb ) {
            if (cb === undefined) { cb = body; body = {}; }
            var self = this;
            var req = this.call(method, uri, body, function(err, res) {
                cb(err, req, res, self._decodeBody(res));
            });
            return req;
        };

    self._decodeBody =
        function _decodeBody( res ) {
            // TODO: decode based on content-type
            var body = res.body, first = body[0], last = body[body.length-1];
            if (first === '{' && last === '}') return JSON.parse(body.toString());
            else if (first === '[' && last === ']') return new Buffer(JSON.parse(body.toString())); 
            else return body;
        };
}
