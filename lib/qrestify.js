/**
 * restify compatibility functions
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

module.exports = {
    emulateRestify: emulateRestify,
};


// load and augment Restiq class
var Restiq = require('./restiq.js');

/*
 * restify middleware insertion functions
 */
Restiq.prototype.pre = function restify_pre( func ) {
    this.addStep(func, 'setup');
};
Restiq.prototype.use = function restify_use( func ) {
    this.addStep(func, 'use');
};

/*
 * restify route creation functions
 */
Restiq.prototype.get = function restify_get( path, fn ) {
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('GET', path, handlers);
};
Restiq.prototype.put = function restify_put( path, fn ) {
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('PUT', path, handlers);
};
Restiq.prototype.post = function restify_post( path, fn ) {
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('POST', path, handlers);
};
Restiq.prototype.del = function restify_del( path, fn ) {
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('DELETE', path, handlers);
};
Restiq.prototype.delete = Restiq.prototype.del;

/*
 * restify middleware library, is exposed via a set of builder functions
 */
Restiq.queryParser = function restify_queryParser( ) {
    return Restiq.mw.parseQueryParams;
};
Restiq.bodyParser = function restify_bodyParser( options ) {
    // TODO: this is similar, but not sure if the same
    // TODO: check mapParams:true compatibility
    if (options && options.mapParams) return Restiq.mw.parseBodyParams;
    else return Restiq.mw.parseBody;
};
Restiq.authorizationParser = function restify_authorizationParser( ) {
    // TODO: handles Basic, but not Signature
    return Restiq.mw.parseAuthorization;
};
Restiq.acceptParser = function restify_acceptParser( ) {
    // TODO: WRITEME
};

// configure req and res to behave kinda like in restify
function emulateRestify( req, res, next ) {
    var app = req.restiq;
    addRestifyMethodsToReqRes(req, res);
    app.setErrorHandler(function(req, res, err, next) {
        if (!res.headersSent) {
            // only restify errors have .statusCode and .body
            res.writeHead(err.statusCode || 500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(err.body ? err.body : {code: err.code, message: err.message, stack: this._debug ? err.stack : null}));
        }
    });
    if (next) next();
}

// make our http.ServerResponse behave kinda like restify.res
function addRestifyMethodsToReqRes( req, res ) {
    res.header = function res_header( name, value ) {
        return value === undefined ? this.getHeader(name) : this.setHeader(name, value);
    };
    res.send = function res_send( statusCode, body, headers) {
        // TODO: headers ??
        if (body === undefined) {
            if (typeof statusCode === 'number') body = "";
            else { body = statusCode; statusCode = 200; }
        }
        var encoding, content;

        // send auto-detects the encoding type from the response body sent,
        // one of Object, Buffer, or Error (we also accept plaintext)
        // TODO: match response format to req Accept: header
        // note: reading accept = headers['accept'] is pretty slow, 14k vs 16k/s
        // note: 10% faster to inline the encoding vs via encoders table
        if (typeof body !== 'object') encoding = 'text/plain';
        else if (body) {
            if (body.message && body.stack && body instanceof Error) {
                statusCode = body.statusCode || 500;
                encoding = 'application/json';
                // TODO: convert generic error into restify error response
            }
            else if (typeof body.length === 'number' && Buffer.isBuffer(body)) encoding = 'application/octet-stream';
            else encoding = 'application/json';
        }
        else encoding = 'application/json';

        // TODO: use registered encoders for encoding
        // eg content = req.restiq.mw.responseEncoders[encoding](body);
        if (encoding === 'application/json') content = JSON.stringify(body);
        else if (encoding === 'application/octet-stream') content = body;
        else /*if (encoding === 'text/plain')*/ content = body + "";

        // TODO: properly utf-8 encode the response

        this.writeHead(statusCode, {
            'Content-Type': encoding,
            'Content-Length': content.length
        });
        if (statusCode === 204 || statusCode === 304 || req.method === 'HEAD') this.end();
        else this.end(content);
    };
    res.get = function res_get(name) {
        return this.getHeader(name);
    };
    res.json = function res_json(statusCode, body) {
        if (body === undefined) { body = statusCode; statusCode = this.statusCode ? this.statusCode : 200; }
        this.writeHead(statusCode, {'Content-Type': 'application/json'});
        this.end(JSON.stringify(body));
    };
    // TODO:
    // charSet(type)
    // cache([type], [options])
    // status(statusCode)

    req.getId = function res_getId() {
        return this.headers['x-request-id'] || this.headers['request-id'] || "-";
    };
    req.version = function req_version() {
        return this.restiq._opts.version;
    };
    req.header = function req_header(name, defaultValue) {
        var value = this.headers[name.toLowerCase()];
        return (value || value !== undefined) ? value : defaultValue;
    };
    req.accepts = function req_accepts( types ) {
        // TODO: this is here only for restify acceptParser().
        // TODO: either deprecate, or use in a Restiq.acceptParser (tbd)
        if (typeof types === 'string') types = [types];
        var acceptTypes = this.headers['accept'];
        if (!acceptTypes || acceptTypes.indexOf('*/*') >= 0) return types[0];

        // restify decorates req with a method accepts() that, when passed the app.acceptable
        // returns the "best" supported type for this request.
        // do not map(), iterate to stop early on first match
        acceptTypes = acceptTypes.split(';');
        for (var i=0; i<acceptTypes.length; i++) {
            var type = acceptTypes[i].trim();
            var idx = types.indexOf(type);
            if (idx >= 0) return types[idx];
            if (type.indexOf('/') < 0) {
                var aliases = {
                    'text': 'text/plain',
                    'html': 'text/html',
                    'json': 'application/json',
                };
                if (aliases[type]) return aliases[type];
            }
        }
        // no match found, force a json response? or error out?
        return false;
    };
    // TODO:
    // is(type)
    // isSecure()
    // isChunked()
    // isKeepAlive()
    // getLogger()
    // time()
}
