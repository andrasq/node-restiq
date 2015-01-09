/**
 * rlib -- the restiq library of useful functions
 */

var http_parse_query = require('arlib/http_parse_query');


module.exports.parseQueryParams = function( req, res, next ) {
    var err, qmark, queryParams = {};
    if ((qmark = req.url.indexOf('?')) >= 0) {
        try { decodeParams('application/x-www-form-urlencoded', req.url.slice(qmark+1), req.params); }
        catch (err) { throw new Error(400, "error decoding query params: " + err.message); }
    }
    if (next) next();
};

module.exports.parseBodyParams = function( req, res, next ) {
    var err, type = req.headers['content-type'] || 'text/plain';
    if (req.body) {
        try { decodeParams(type, req.body, req.params); }
        catch (e) { throw new Error(400, "error decoding body params"); }
    }
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
        res.writeError(500, "error reading request body");
        if (next) next(err);
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
