/**
 * rlib -- the restiq library of useful functions
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var http_build_query = require('arlib/http_build_query');
var http_parse_query = require('arlib/http_parse_query');
var Restiq = require('./restiq');

module.exports = (function() {
    var paramDecoders = {
        'application/json':                     JSON.parse,
        'text/plain':                           http_parse_query,
        // TODO: 'binary' is deprecated, but how else to exchange raw byte streams?
        // TODO: A: capture the buffer from the request chunks (not the string), and use that
        'application/octet-stream':             function decodeOctets(s) { return new Buffer(s, 'binary') },
        'base64':                               function base64(s) { return new Buffer(s, 'base64') },
        // TODO: how to decode javascript input?
        //'application/javascript':               function decodeJs(s)  { }
        'application/x-www-form-urlencoded':    http_parse_query,
    };

    var responseEncoders = {
        'application/json':                     JSON.stringify,
        'text/plain':                           function encodeText(s) { return s },
        'application/octet-stream':             function encodeOctets(s) { return s },
        // TODO: how to encode javascript responses?
        //'application/javascript':               function encodeJs(s) { return new Buffer(JSON.stringify(s)).toString('base64') },
        'application/x-www-form-urlencoded':    function encodeForm(s) { return http_build_query(s) },
    };

    return {
        parseQueryParams: parseQueryParams,
        skipBody: skipBody,
        readBody: readBody,
        parseBody: parseBody,
        parseBodyParams: parseBodyParams,
        parseRouteParams: parseRouteParams,
        parseAuthorization: parseAuthorization,
        closeResponse: closeResponse,

        getDefaultResponseEncoders: function() { return responseEncoders },
    };

    function parseQueryParams( req, res, next ) {
        var err, qmark, queryParams = {};
        if ((qmark = req.url.indexOf('?')) >= 0) {
            var hmark = req.url.indexOf('#');
            if (hmark < 0) hmark = req.url.length;
            try { decodeBody('application/x-www-form-urlencoded', req.url.slice(qmark+1, hmark), req.params); }
            catch (e) { err = new Restiq.errors.ErrorBadRequest("error decoding query params: " + e.message); }
        }
        if (next) next(err);
    };

    // decode body, or return err
    function tryDecodeBody( req, type ) {
        try { req.body = decodeBody(type, req.body, {}); }
        catch (e) { return new Restiq.errors.ErrorBadRequest("error decoding body params"); }
    }

    // parse message body and store resulting object in req.body
    function parseBody( req, res, next ) {
        module.exports.readBody(req, res, function(err) {
            if (err) return next ? next(err) : null;
            if (!err) {
                // FIXME: we key off Content-Type to determine how to decode,
                // but this should be exposed and configurable via the app
                var type = req.headers['content-type'];
// FIXME: tentative
                if (!type) {
                    // TODO: auto-detect type based on content?
                    if (req.body[0] === '{') type = 'application/json';
                    // array bson
                    else if (req.body[0] === '[') type = 'application/octet-stream';
                    // base64 bson
                    else if (req.body.length <= 10000 && req.body.match(/^[0-9a-fA-F+\r\n/]*[=\r\n]*$/)) type = 'base64';
                    else if (req.body.length > 10000 && req.body.slice(0, 10000).match(/^[0-9a-fA-F+\r\n/]*[=\r\n]*$/)) type = 'base64';
                    else type = 'text/plain';
                }
                if (type !== 'text/plain') {
                    tryDecodeBody(req, type);
                }
            }
            if (next) next(err);
        });
    }

    function parseBodyParams( req, res, next ) {
        if (!req._bodyEof) {
            // if body has not been read yet, read it first
            module.exports.readBody(req, res, function(err) {
                if (err) return next ? next(err) : null;
                parseBodyParams(req, res, next);
            });
        }
        else {
            // FIXME: we key off Content-Type to determine how to decode,
            // but this should be exposed and configurable via the app
            var err, type = req.headers && req.headers['content-type'] || 'text/plain';
            try { decodeBody(type, req.body, req.params); }
            catch (e) { err = new Restiq.errors.ErrorBadRequest("error decoding body params"); }
            if (next) next(err);
        }
    };

    function parseRouteParams( req, res, next ) {
        // module params were extracted with the route match regex, transcribe them
        var i, params = req.params, vars = req._route.vars;
        for (i in vars) params[i] = vars[i];
        if (next) next();
    };

    function skipBody( req, res, next ) {
        // CAUTION: only if use can guarantee that there is no body
        // (eg, when used in strictly controlled environment)
        req.body = "";
        req._bodyEof = true;
        if (next) next();
    };

    function readBody( req, res, next ) {
        var data = "";
        var chunks = new Array();

        // run only one reader, and _bodyEof is the mutex
        if (req._bodyEof !== undefined) return next ? next() : null;
        req._bodyEof = false;

        // consume data to trigger the 'end' event
        //req.on('data', function(chunk){ data += chunk; });
        // read() is 40% quicker than on('data') (v0.10.29)
        function readloop() {
            if (!req._bodyEof) {
                var chunk = req.read();
                // NOTE: it is faster to concat strings than to push the buffers
                // NOTE: but buffers are needed to extract binary data (not utf8)
                //if (chunk) data += chunk.toString();
                if (chunk) chunks.push(chunk);
                // 35% higher peak throughput with setTimeout (2800/s vs 2050), but
                // 3x higher throughput per connection with setImmediate (1700/s vs 550)
                // +10% peak throughput when using qtimers (3000/s, 2300/s)
                setTimeout(readloop, 1);
                // Note: setImmediate internally chews up lots memory, and performs poorly
                // in wrk -d8s -t2 -c8 throughput tests.  But it performs better in kds
                // and in restify emulation mode.  TODO: make configurable
                //setImmediate(readloop);
            }
        }
        readloop();

        req.on('error', function(err) {
            if (next) next(new Restiq.errors.ErrorInternalServerError("error reading request body"));
        });

        req.on('end', function(){
            req._bodyEof = true;
            //req.body = data;
            req.body = Buffer.concat(chunks).toString();
            if (next) next();
        });
    };

    // restify compatible Basic auth header parsing
    function parseAuthorization( req, res, next ) {
        var auth = req.headers['authorization'];
        if (!auth) return next();
        var parts = auth.split(' ');
        if (parts[0] === 'Basic' || parts.toLowerCase[0] === 'basic') {
            var nameval = new Buffer(parts[1], 'base64');
            for (var i=0; i<nameval.length; i++) if (nameval[i] === ':'.charCodeAt(0)) break;
            var user = nameval.slice(0, i).toString();
            var pass = nameval.slice(i+1).toString();
            req.username = user;
            req.authorization = { basic: { username: user, password: pass } };
        }
        else if (parts[0] === 'Signature' || parts[0].toLowerCase() === 'signature') {
            // TODO: not supported yet
        }
        next();
    }

    // forcibly flush the response if necessary end the connection
    function closeResponse( req, res, next ) {
        if (!res.headersSent) {
            if (res.body === undefined) res.body = "";
            if (typeof res.body !== 'string') res.body = JSON.stringify(res.body);
            res.end(res.body);
        }
        if (next) next();
    };

    function decodeBody( type, str, params ) {
        var ps, decode = paramDecoders[type];
        // TODO: is it an error if cannot decode?
        if (!decode) return;
        // TODO: make the decoders accept an optional object to populate with fields,
        // since iterating an object is much slower than passing it to the decode function
        ps = decode(str);
        for (var i in ps) params[i] = ps[i];
        return params;
    };
})();
