/**
 * very basic http client, originally written for the restiq unit tests
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var http = require('http');
var url = require('url');

module.exports = HttpClient;

function HttpClient( options ) {
    this._options = { url: "", headers: {} };
    for (var i in options) this._options[i] = options[i];
};

HttpClient.prototype = {
    basicAuth:
    function basicAuth( user, pass ) {
        this._options.headers['Authorization'] = "Basic " + new Buffer(user + ":" + pass).toString('base64');
    },

    get: function get( uri, body, cb ) { this._call(uri, 'GET', body, cb); },
    post: function post( uri, body, cb ) { this._call(uri, 'POST', body, cb); },
    put: function put( uri, body, cb ) { this._call(uri, 'PUT', body, cb); },
    delete: function delete_( uri, body, cb ) { this._call(uri, 'DELETE', body, cb); },
    del: HttpClient.prototype.delete,

    _call:
    function _call( uri, method, body, cb ) {
        if (!cb && typeof body === 'function') { cb = body; body = ""; }
        var options = this._buildRequestOptions(uri);
        options.method = method;

        if (!body || typeof body === 'string') { options.headers['Content-Type'] = 'text/plain'; }
        else if (Buffer.isBuffer(body)) {        options.headers['Content-Type'] = 'application/octet-stream'; }
        else {                                   options.headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }

        var req = http.request(options, function(res) {
            var chunks = new Array();
            res.on('data', function(chunk) {
                chunks.push(chunk);
            });
            res.on('error', function(err) {
                cb(err);
            });
            res.on('end', function() {
                res.body = chunks.length > 1 ? Buffer.concat(chunks) : chunks[0] ? chunks[0] : "";
                cb(null, res);
            });
        });
        req.on('error', function(err) {
            return cb(err);
        });
        req.end(body);
    },

    _buildRequestOptions: function _buildRequestOptions( uri ) {
        var i, options = {};
        if (typeof uri === 'string') {
            options = url.parse(uri[0] === '/' ? this._options.url + uri : uri);
        }
        for (i in this._options) options[i] = this._options[i];
        return options;
    },
};
