restiq
======

smaller, lighter, faster framework for REST API's, in the spirit of restify.

Lean and fast for low-latency micro-services where overhead is important.
Depending on the app, can serve 20k requests / second or more, and 18k / sec
for more complex apps.

The basics are in place -- route mapping, fast route decoding, pre-, post- and
per-route stacks are working.  Errors are caught and converted into HTTP 500
responses.  Unmapped routes return 405 errors.  The calls themselves can
return any HTTP status code.

There are not a lot of frills yet, but I was able to swap out restify in a
fairly complex project and have all its unit tests pass.


Objectives
----------

Why yet another framework?  I wanted

- to run as fast the node built-in http.createServer()
- user-defined output formats
- different output formats call by call
- fewer built-ins in favor of more add-ons


Description
-----------

An web service responds to requests sent to pathname-like addresses
("routes").  The server looks up the computation associated with the route,
runs it, and returns the generated response.

The computation is composed of a series of steps (the "middleware stack"),
each step a function taking a request, a response, and a callback to call to
indicate that the step is finished, `(req, res, next)`.  The steps are run in
sequence, each called after the preceding one has finished.

The steps are highly configurable.  They can be run on a route-by-route basis
or in common to all routes.  Steps in common can be either before or after the
per-route steps.

The Restiq request and responses are just node
[`http.incomingMessage`](https://www.nodejs.org/api/http.html#http_http_incomingmessage)
and
[`http.ServerResponse`](https://www.nodejs.org/api/http.html#http_class_http_serverresponse)
objects.

Restiq includes a thin compatibility layer for shimming simple
[`restify`](https://www.npmjs.org/package/restify)
applications onto Restiq.


Examples
--------

With http:

        var http = require('http');
        var querystring = require('querystring');
        var server = http.createServer(function(req, res) {
            req.data = "";
            req.on('data', function(chunk) { req.data += chunk; });
            req.on('end', function() {
                var url = req.url, qs = url.indexOf('?');
                if (qs >= 0) req.params = querystring.parse(url.slice(qs+1));
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify(req.params));
            });
        });
        server.listen(1337, '127.0.0.1');
        // 17.6k/s  wrk -d8s -t2 -c8 'http://localhost:1337/echo?a=1'

With restiq:

        var Restiq = require('restiq');
        var app = Restiq.createServer();
        app.use(Restiq.mw.parseQueryParams);
        app.use(Restiq.mw.parseBodyParams);
        app.addRoute('GET', '/echo', [
            function(req, res, next) {
                res.writeHeader(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify(req.params));
                next();
            }
        ]);
        app.listen(1337);
        // 19.5k/s  wrk -d8s -t2 -c8 'http://localhost:1337/echo?a=1'

With restify:

        var restify = require('restify');
        var app = restify.createServer();
        app.use(restify.queryParser());
        app.use(restify.bodyParser());
        app.get('/echo', function(req, res, next) {
            res.send(200, req.params);
            next();
        });
        app.listen(1337);
        // 4.3k/s  wrk -d8s -t2 -c8 'http://localhost:1337/echo?a=1'

Change just the first two lines to run it under restiq:

        var restify = require('restiq');
        var app = restify.createServer({restify: 1});
        // ...
        // 17.0k/s  wrk -d8s -t2 -c8 'http://localhost:1337/echo?a=1'

Surprisingly, yes it is possible to build on top of http and achieve better
throughput than a canonical http server as shown above.  Because regexes are
so fast in node, extracting query path params runs even faster.  (Timed with
node-v0.10.29 on an AMD 3.6 GHz 4x Phenom II.)


Methods
-------

### createServer( options )

create a new app.

The options:

- `debug` - include stack traces in error responses.  Be cautious about
   sending backtraces off-site.
- `restify` - make the response have methods `res.send` for easier
   compatibility with restify.  This eats into the throughput some, so
   use only as needed.

        var Restiq = require('restiq');
        var app = Restiq.createServer(options);

### app.listen( port, [hostname], [backlog], [confirmationCallback] )

start the service.  If given, confirmationCallback will be invoked when
the service is ready to receive requests.  Hostname and backlog as for
`http.createServer`.

### app.pre( func )

add shared middleware step to be called before every request.  Pre steps
are called in the order added.

### app.use( func )

add shared middleware step to be called before every request after the `pre()`
steps have all finished.

### app.finally( func )

add shared middleware step to be called after every `pre()`, `use()` and route
handler has run.  The finally steps are run regardless, even if the call
errored out.

### app.addRoute( method, path, handlers )

register a path along with a function (or array of functions) to handle
requests for it.  Requesting a path that has not been registered or calling a
path with a different GET, POST, etc request method than it was registered
with results in a 405 error.

Paths can embed named parameters, denoted with `/:paramName`.  Named
parameters are extracted and stored into req.params (see also
`mw.parseRouteParams` below.

For restify compatibility, mapped routes execute those `use` steps that
existed when the route was mapped.  In the sequence `use`, `use`, `map(1)`,
`use`, `map(2)`, calls that request the first mapped route will run only the
first two `use` steps, but calls that request the second mapped route will run
all three.  All calls will run all `finally` steps (if any).

### app.mapRoute( method, path )

for internal use, look up the route for the call.

The mapped route includes the requested `path`, the matching route `name`, the
`tail` of the query string with the query parameters, any named parameter
`vars` included, and the list of `handlers` to run for this request.

For example

        app.mapRoute('GET', '/:color/echo', echoGreen)
        app.getRoute('GET', '/green/echo?a=1&b=2')
        // => {
        //   path: '/green/echo?a=1&b=2',
        //   name: '/:color/echo',
        //   tail: '?a=1&b=2',
        //   vars: {a: 1, b: 2},
        //   handlers: [echoGreen]
        // }

### Restiq.mw

A library of pre-written middleware utility functions.

#### Restiq.mw.parseQueryParams( req, res, next )

merge the query string parameters into req.params

#### Restiq.mw.parseRouteParams( req, res, next )

merge the parameters embedded in the request path into req.params.  This is
done automatically as soon as the route is mapped, but explicit param parsing
can override these value.  Re-merging allows control of the param source
precedence.

#### Restiq.mw.parseBodyParams( req, res, next )

merge the query string parameters from the body into req.params.  Will read
the body with mw.readBody if it has not been read already.  Does not parse
JSON or BSON bodies, just HTTP query strings.

#### Restiq.mw.readBody( req, res, next )

gather up the message that was sent with the http request, and save it in
req.body.  This call is safe to call more than once, but sets body only the
first time.

#### Restiq.mw.skipBody( req, res, next )

if the request body is guaranteed to be empty, it is faster to skip waiting
for the on('end') event.  Be careful when using this:  if the request has a
body it needs to be consumed.


Restify Compatibility Layer
---------------------------

This is what I have so far --

### app.get( path, handler, [handler2, ...] )

add a GET route, with handlers to run in the order listed

### app.post( path, handler, [handler2, ...] )

add a POST route, with handlers to run in the order listed

### app.put( path, handler, [handler2, ...] )

add a PUT route, with handlers to run in the order listed

### app.del( path, handler, [handler2, ...] )

add a DEL route, with handlers to run in the order listed

### req.getId( )

returns the request id contained in the request headers.  Unlike restify,
restiq uses a dash `-` if can't find one, and  does not make one up.

### req.version( )

returns the options.version string that was passed to createServer()

### res.header( name, value )

set a header value, aka writeHeader

### res.get( name )

read back a set header value

### res.send( [statusCode], [response] )

send a response.  The default status code is 200, the default response the
empty string.  The call determines the content type from the response value,
and emits an appropriate header as well.  NOTE:  restify penalizes sending a
response without first explicitly setting the Content-Type header.  Time it
yourself.

Turns out restify responses are also extensions of `http.ServerResponse`, so
all the usual write(), writeHead(), end() work as well.


Tips
----

Random observations on building fast REST services

- REST path params are faster to extract than query string params
- passing just REST or just GET params is faster than passing both
- JSON is slower to encode and to parse than query strings
- http has a speed-of-light of around 27k queries per second, with
  plaintext responses, and empty request bodies.  Having to assemble the
  body from the chunks limits http to under 23k calls/s


Todo
----

- unit tests
- refactor all internal functions into methods for testability
- write parseBodyObject to decode JSON and BSON request bodies
- describe the built-in restify compatibily adapter
