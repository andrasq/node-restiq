/**
 * rlib -- the restiq library of useful functions
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var http_parse_query = require('arlib/http_parse_query');
var Restiq = require('./restiq');


module.exports.parseQueryParams = function parseQueryParams( req, res, next ) {
    var err, qmark, queryParams = {};
    if ((qmark = req.url.indexOf('?')) >= 0) {
        var hmark = req.url.indexOf('#');
        if (hmark < 0) hmark = req.url.length;
        try { decodeParams('application/x-www-form-urlencoded', req.url.slice(qmark+1, hmark), req.params); }
        catch (e) { err = new Restiq.errors.ErrorBadRequest("error decoding query params: " + e.message); }
    }
    if (next) next(err);
};

module.exports.parseBodyParams = function parseBodyParams( req, res, next ) {
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
        try { decodeParams(type, req.body, req.params); }
        catch (e) { err = new Restiq.errors.ErrorBadRequest("error decoding body params"); }
        if (next) next(err);
    }
};

module.exports.parseRouteParams = function parseRouteParams( req, res, next ) {
    // module params were extracted with the route match regex, transcribe them
    var i, params = req.params, vars = req._route.vars;
    for (i in vars) params[i] = vars[i];
    if (next) next();
};

module.exports.skipBody = function skipBody( req, res, next ) {
    // CAUTION: only if use can guarantee that there is no body
    // (eg, when used in strictly controlled environment)
    req.body = "";
    req._bodyEof = true;
    if (next) next();
};

module.exports.readBody = function readBody( req, res, next ) {
    var data = "";

    if (req._bodyEof !== undefined) return next ? next() : null;
    req._bodyEof = false;

    // consume data to trigger the 'end' event
    //req.on('data', function(chunk){ data += chunk; });
    // read() is 40% quicker than on('data') (v0.10.29)
    function readloop() {
        if (!req._bodyEof) {
            var chunk = req.read();
            if (chunk) data += chunk;
            setTimeout(readloop, 1);
        }
    }
    readloop();

    req.on('error', function(err) {
        if (next) next(new Restiq.errors.ErrorInternalServerError("error reading request body"));
    });

    req.on('end', function(){
        req._bodyEof = true;
        req.body = data;
        if (next) next();
    });
};

// forcibly flush the response if necessary end the connection
module.exports.closeResponse = function closeResponse( req, res, next ) {
    if (!res.headersSent) {
        if (!res.body) res.body = "";
        if (typeof res.body !== 'string') res.body = JSON.stringify(res.body);
        res.end(res.body);
    }
    if (next) next();
};

var paramDecoders = {
    'text/plain': function(s){ return http_parse_query(s); },
    'application/x-www-form-urlencoded': function(s){ return http_parse_query(s); },
    'application/json': function(s){ return JSON.parse(s); },
    // make bson be installed externally by the app config!
    // 'application/octet-stream': function(s){ return BSONPure.decode(s); }
};
function decodeParams( type, str, params ) {
    var ps, decode = paramDecoders[type];
    if (!decode) return;
    // TODO: make the decoders accept an optional object to populate with fields,
    // since iterating an object is much slower than passing it to the decode function
    ps = decode(str);
    for (var i in ps) params[i] = ps[i];
}
