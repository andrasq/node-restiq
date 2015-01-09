/**
 * rlib -- the restiq library of useful functions
 */

var http_parse_query = require('arlib/http_parse_query');


module.exports.parseQueryParams = function( req, res, next ) {
    var qmark, queryParams = {};
    if ((qmark = req.url.indexOf('?')) >= 0) {
        decodeParams('application/x-www-form-urlencoded', req.url.slice(qmark+1), req.params);
    }
    if (next) next();
};

module.exports.parseBodyParams = function( req, res, next ) {
    var type = req.headers['content-type'] || 'text/plain';
    if (req.body) {
        decodeParams(type, req.body, req.params);
    }
    if (next) next();
};

module.exports.readBody = function( req, res, next ) {
    var data = "";
    var eof = false;

    // consume data to trigger the 'end' event
    // read() is 40% quicker than on('data') (v0.10.29)
    function readloop() {
        if (!eof) {
            var chunk = req.read();
            if (chunk) data += chunk;
            setTimeout(readloop, 1);
        }
    }
    readloop();

    req.on('end', function(){
        eof = true;
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
