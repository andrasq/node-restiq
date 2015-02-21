/**
 * rlib -- the restiq library of useful functions
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var querystring = require('querystring');
var http_build_query = require('qhttp/http_build_query');
var http_parse_query = require('qhttp/http_parse_query');
var Restiq = require('./restiq');

module.exports = (function() {
    var paramDecoders = {
        'application/json':                     JSON.parse,
        'text/plain':                           http_parse_query,
        'application/octet-stream':             function decodeOctets(s) { var obj = new Buffer(s, 'binary'); obj.__notHash = true; return obj; },
        'base64':                               function base64(s) { var obj = new Buffer(s, 'base64'); obj.__notHash = true; return obj; },
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
        // TODO: http_build_query is faster but has no option to encode a=1&a=2 flat arrays
        'application/x-www-form-urlencoded':    function encodeForm(s) { return querystring.encode(s) },
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

    function _tryDecodeQuery( queryString, params ) {
        try { decodeBody('application/x-www-form-urlencoded', queryString, params); }
        catch (e) { return new Restiq.errors.ErrorBadRequest("error decoding query params: " + e.message); }
    }

    function parseQueryParams( req, res, next ) {
        var err, qmark, queryParams = {};
        if ((qmark = req.url.indexOf('?')) >= 0) {
            var hmark = req.url.indexOf('#');
            if (hmark < 0) hmark = req.url.length;
            err = _tryDecodeQuery(req.url.slice(qmark+1, hmark), req.query = {});
            for (var i in req.query) req.params[i] = req.query[i];
        }
        if (next) next(err);
    };

    // decode body, or return err
    function _tryDecodeBody( req, type ) {
        // if could decode then change req.body to the decoded object, else leave as-is
        try { var body = decodeBody(type, req.body); if (body) req.body = body; }
        catch (e) { return new Restiq.errors.ErrorBadRequest("error decoding body params"); }
    }

    // parse message body and store resulting object in req.body
    function parseBody( req, res, next ) {
        function isBase64( str, limit ) {
            var charp = str.charCodeAt ? str.charCodeAt : function(i) { return str[i] };
            var len = Math.min(limit, str.length);
            for (var i=0; i<len; i++) {
                // checks that all characters in the string are valid base64
                // effectively, str.match(/^[0-9a-fA-F+\/\r\n/]*[=\r\n]*$/)
                var c = charp(i);
                if (!(c >= 0x30 && c <= 0x39 ||         // [0-9]
                      c >= 0x41 && c <= 0x5a ||         // [A-Z]
                      c >= 0x61 && c <= 0x7a ||         // [a-z]
                      c === 0x2b ||                     // [+]
                      c === 0x2f ||                     // [/]
                      c === 0x3d ||                     // [=]
                      c === 0x0d ||                     // [\r]
                      c === 0x0a))                      // [\n]
                    return false;
            }
            return true;
        }

        module.exports.readBody(req, res, function(err) {
            if (err) return next ? next(err) : null;
            if (!err) {
                // FIXME: we key off Content-Type to determine how to decode,
                // but this should be exposed and configurable via the app
                var type = req.headers['content-type'];
// FIXME: tentative: content-type auto-detection
                if (!type) {
                    // auto-detect type based on content if no content-type
                    if (req.body[0] === '{' || req.body[0] === 0x7b) type = 'application/json';
                    else if (req.body[0] === '[' || req.body[0] === 0x5b) type = 'application/octet-stream';
                    else if (isBase64(req.body, 2000)) type = 'base64';
                    else type = 'application/octet-stream';
                }
                if (type !== 'text/plain') {
                    err = _tryDecodeBody(req, type);
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
        for (i in vars) params[i] = http_parse_query.urldecode(vars[i]);
        if (next) next();
    };

    function skipBody( req, res, next ) {
        // CAUTION: only use if can guarantee that there is no body
        // (eg, when used in strictly controlled environment)
        req.body = "";
        req._bodyEof = true;
        if (next) next();
    };

    function readBody( req, res, next ) {
        // body is read only once ever, and _bodyEof is the mutex
        if (req._bodyEof !== undefined) return next ? next() : null;
        req._bodyEof = false;

        var data = "";
        var databuf;
        //var chunks = new Array();
        var readBinary = req.restiq._opts.readBinary;
        var readImmediate = req.restiq._opts.readImmediate;

        // default to on('data'), not the fastest but more versatile
        // 2 is 15% less max throughput than 0 and 10% slower than 1,
        // but scales down better than 0 and doesnt affect gc like 1
        if (readImmediate === undefined) readImmediate = 2;

        function appendBuffer( databuf, chunk ) {
            // TODO: if (databuf) impose maxBodySize and error out if too big
            return databuf ? databuf.concat([databuf, chunk]) : chunk;
            // TODO: find an efficient way of combining contents,
            // eg preallocate space and copy data into it.
        }
        function gatherChunk(chunk) {
            // NOTE: it is faster to concat strings than to push the buffers
            // NOTE: toString('binary') is not binary, it converts from latin-1
            if (readBinary) databuf = appendBuffer(databuf, chunk);
            else data += chunk;
            //else chunks.push(chunk);
        }
        function readloop() {
            if (!req._bodyEof) {
                var chunk = req.read();
                if (chunk) {
                    //gatherChunk(chunk);
                    if (readBinary) gatherChunk(chunk);
                    else data += chunk;
                }
                if (!readImmediate) {
                    // 35% higher peak throughput with setTimeout (2800/s vs 2050)
                    // 3x higher throughput per connection with setImmediate (1700/s vs 550)
                    // +10% peak throughput when using qtimers (3000/s, 2300/s)
                    setTimeout(readloop, 1);
                }
                else {
                    // Note: setImmediate internally can chew up lots of memory and perform poorly
                    // in wrk -d8s -t2 -c8 throughput tests.  But then it performs better in kds
                    // and in restify emulation mode; else it`s about even.
                    // needs qtimers setImmediate else can trample the gc system
                    setImmediate(readloop);
                }
            }
        }
        // consume data to trigger the 'end' event
        // read() is 40% quicker than on('data') (v0.10.29)
        // TODO: time out after some amount of inactivity!
        if (readImmediate == 2) req.on('data', gatherChunk);
        else readloop();

        req.on('error', function(err) {
            req._bodyEof = true;
            var msg = "error reading request body" + (req.restiq._opts.debug ? (": " + err.stack) : "");
            if (next) next(new Restiq.errors.ErrorInternalServerError(msg));
        });

        req.on('end', function() {
            req._bodyEof = true;
            req.body = databuf || data /*|| (chunks ? Buffer.concat(chunks) : "")*/;
            if (next) next();
        });
    };

    // restify compatible Basic auth header parsing
    // the auth info is stored in req.authorization.basic and req.authorization.username
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
        ps = decode(str);
        if (params && !params.__notHash) for (var i in ps) params[i] = ps[i];
        return ps;
    };
})();
