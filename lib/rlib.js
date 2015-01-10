/**
 * rlib -- the restiq library of useful functions
 */

var http_parse_query = require('arlib/http_parse_query');


module.exports.parseQueryParams = function( req, res, next ) {
    var err, qmark, queryParams = {};
    if ((qmark = req.url.indexOf('?')) >= 0) {
        try { decodeParams('application/x-www-form-urlencoded', req.url.slice(qmark+1), req.params); }
        catch (e) { err = new Error(400, "error decoding query params: " + err.message); }
    }
    if (next) next(err);
};

module.exports.parseBodyParams = function( req, res, next ) {
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
        var err, type = req.headers['content-type'] || 'text/plain';
        try { decodeParams(type, req.body, req.params); }
        catch (e) { err = new ErrorBadRequest("error decoding body params"); }
        if (next) next(err);
    }
};

module.exports.parseRouteParams = function( req, res, next ) {
    // module params were extracted with the route match regex, transcribe them
    var i, params = req.params, vars = req._route.vars;
    for (i in vars) params[i] = vars[i];
    if (next) next();
};

module.exports.skipBody = function( req, res, next ) {
    // WARNING: only if use can guarantee that there is no body
    // (eg, when used in strictly controlled environment)
    // If so, it is 40% not waiting for the on('end').
    req.body = "";
    req._bodyEof = true;
    if (next) next();
};

module.exports.readBody = function( req, res, next ) {
    var data = "";

    // allow being called more than once, even concurrently
    if (req._bodyEof !== undefined) return next();

    // consume data to trigger the 'end' event
    // read() is 40% quicker than on('data') (v0.10.29)
    function readloop() {
        if (!req._bodyEof) {
            var chunk = req.read();
            if (chunk) data += chunk;
            setTimeout(readloop, 1);
        }
    }
    readloop();
    //req.on('data', function(chunk){ data += chunk; });

    req.on('error', function(err) {
        if (next) next(new ErrorInternalServerError("error reading request body"));
    });

    req.on('end', function(){
        req._bodyEof = true;
        req.body = data;
        if (next) next();
    });
};

var paramDecoders = {
    'text/plain': function(s){ return http_parse_query(s); },
    'application/x-www-form-urlencoded': function(s){ return http_parse_query(s); },
    'application/json': function(s){ return JSON.parse(s); },
    // make bson be installed externally by the app config!
    // 'application/bson': function(s){ return BSONPure.decode(s); }
};
function decodeParams( type, str, params ) {
    var decode, ps;
    ps = ((decode = paramDecoders[type])) ? decode(str) : {};
    // TODO: make the decoders accept an optional object to populate with fields,
    // since iterating an object is much slower than passing it to the function
    for (var i in ps) params[i] = ps[i];
}
