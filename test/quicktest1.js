if (process.argv[1].indexOf('nodeunit') >= 0 || process.argv[1].indexOf('qnit') >= 0) return;

// quicktest:

var cluster = require('cluster');
var http = require('http');

if (0 && cluster.isMaster) {
    cluster.fork();
    cluster.fork();
    cluster.fork();
}
else {

//require('qtimers');
//setImmediate.maxTickDepth = 1;
// process.versions.node = '0.10.29'

var server1 = http.createServer( function(req, res) {
    var data = "";
    var eof = false;

    // consume data (and discard) to trigger the 'end' event
    function readloop() {
        if (!eof) {
            // read() is 40% quicker than on('data') (v0.10.29)
            var chunk = req.read();
            if (chunk) data += chunk;
            //setImmediate(readloop);   // 16k/s 10.29 and 11.13
            setTimeout(readloop, 1);    // 22.5k/s 10.29, 6k/s 11.13
            // 22.5k/s v0.10.29 using setTimeout loop, 16k/s on('data')
            // 15.5k/s v0.11.13 using setImmediate loop, 15.5k/s on('data')
        }
    }
    //data = req.read();
    readloop();

    //req.on('data', function(){});
    req.on('end', function(){
        eof = true;
        req.body = data;
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
        //res.end(json.encode({a:1,b:2,c:3,d:4,e:5}));
    });

    // 27k/s to send reply and ignore data
    // 25.5k/s send JSON 5 params
    // 26.3k/s send json-simple 5 params
    // 19k/s if processing on the 'end' (40% faster w/o data)
    // 24.5k/s if triggering 'end' with read() (instead of with on('data'))
    // 22.5k/s if triggering 'end' with setTimeout read loop (23.5k/s w/ qtimers)
    // 16k/s w/ setImmediate loop (24k/s setImmediate loop with qtimers !! 50% faster !! :-) (17k/s qtimers maxTickDepth=1)
    // 24k/s if calling readloop but not waiting for it to finish
    // BUT: above 22.5k/s is 5k/s with node-v0.11.13 !! (15.5k/s w/ on('data') and w/ setImmediate loop)
    // BUT: qtimers setImmediate is slower! (15k/s) than native, and qtimers setTimeout is 6k/s
});
server1.listen(1337, '127.0.0.1');
console.log('Server running at http://127.0.0.1:1337/');
// 27k/s

var mustWaitForBody = {
    // http://www.w3.org/Protocols/rfc2616/rfc2616-sec9.html
    'OPTIONS': 1,
    'GET': 1,
    'HEAD': 0,
    'PUT': 1,
    'POST': 1,
    'DELETE': 1,
    'TRACE': 1,
    'CONNECT': 0,
};
var server1b = http.createServer( function(req, res) {
    var data = "";
    var type = req.headers['content-type'] || 'text/plain';
    var url = req.url;

    // handle connection:
    // - if route expects streaming input, do not assemble chunks
    // - else if no body expected, do not assemble chunks (ignore body)
    // - else assemble chunks and set req.body
    // - middleware step decodes query params, body params as configured
    // - before steps: in common to all routes
    // - after steps: in common to all routes
    // - per-route steps: per route
    // - NO BUILT-IN STEPS!  the default is a blank slate (no parsing, no response)
    // - override res to capture headers, emit them all together
    //   with eg send(statusCode, response) and sendHeader(name, value)

    if (mustWaitForBody[req.method]) {
        req.on('data', function(chunk) {
            data += chunk;
        });
        req.on('error', function(err) {
            res.writeHead(500);
            res.end("request error");
        });
        req.on('end', function() {
data = '{"a":1,"b":2,"c":3,"d":4,"e":5}';
            req.body = data;
            req.params = {};
decodeBodyParams(req, res, function(){});

            // FIXME: merge query params and body params
            res.writeHead(200, {'Content-Type': 'text/plain'});
            //res.end('Hello World\n');
            res.end(JSON.stringify(req.params));
        });
    }
    else {
        req.params = {};
        req.body = "";  // suppress body
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
    }

    //res.end(json.encode({a:1,b:2,c:3,d:4,e:5}));
    // 27k/s
    // 25.5k/s JSON parsing 5 params
    // 26.3k/s json-simple 5 params
    // 22.5k/s if decoding 5 query string args
    // 19.4k/s if assembling the post data from chunks
    // 16.4k/s if parsing 5 json body params from post request (25 vs 16: EventEmitter overhead, waiting for 'end')
    // 16.0k/s if parsing both query params and post data params (5 + 5 fields) (18k/s w/o query params)
});
//server1b.listen(1337, '127.0.0.1');
//console.log('Server running at http://127.0.0.1:1337/');
// 27k/s

var server2 = http.createServer(function(req, res) {
    //
    res.statusCode = 200;                               // avoid! 4% slower
    res.setHeader('Content-Type', 'text/plain');        // avoid! 17% slower
    //res.sendDate = true;
    res.write("Hello, world.");
    res.end();
    //res.end(JSON.stringify({done:1}));
    //res.write(JSON.stringify({done:1}));                      // AVOID!  slows to 25/sec per connection
    //res.writeHeader(200, { 'Content-Type': 'application/json', });
    //res.end(JSON.stringify({done:1}));  // 25.5k/s
    //res.end(json.encode({done:1}));     // 26.4k/s
    //res.end("Hello, world.");           // 27k/s
    //res.writeHeader(200, { 'Content-Type': 'application/json', });
    //res.end('{"done":1}');
    // 23k/s for header + end
    // 28k/s w/o headers (w. or w/o date formatting)
    // 27k/s w/ writeHeader
    // 23k/s w/ setHeader (instead of writeHeader) (w. or w/o statusCode)
    // 25/s per thread write + end !? (flushes once every 40ms??) (peak ~5000/sec, limited by procs/fd's)
    // 27k/s if end() writes all the data too (do not call write!)
    // 23k/s if setHeader() used + end() -- use writeHeader() instead, *much* faster !?
    // 25k/s if statusCode set *and* writeHeader() used
    // 26k/s if JSON.stringify, 27k/s if string contstant, 
});
//server2.listen(1337, undefined, 2047);
//console.log("listening on 1337...");
//
// wth?? capped at 200 connections / sec ?!


//    server1.listen(1337);
//    console.log("Server running at http://localhost:1337");
}


var paramDecoders = {
    'text/plain': function(s){ return http_parse_query(s); },
    'x-www-form-urlencoded': function(s){ return http_parse_query(s); },
    'application/json': function(s){ return JSON.parse(s); },
    // make this be installed externally by the app config!
    // 'application/bson': function(s){ return BSONPure.decode(s); }
};

function decodeParams( type, str, params ) {
    var decode, ps;
    ps = ((decode = paramDecoders[type])) ? decode(str) : {};
    // FIXME: make http_parse_query accept an optional object to populate with fields,
    // since iterating an object is much slower than passing it to the function
    for (var i in ps) params[i] = ps[i];
}

function decodeQueryParams( req, res, next ) {
    var qmark, queryParams = {};
    if ((qmark = req.url.indexOf('?') >= 0)) {
        decodeParams('x-www-form-urlencoded', req.url.slice(qmark+1), req.params);
    }
    next();
}

function decodeBodyParams( req, res, next ) {
    var type = req.headers['content-type'] || 'text/plain';
    if (req.body) {
        decodeParams(type, req.body, req.params);
    }
    next();
}
