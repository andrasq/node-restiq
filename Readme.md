restiq
======

Smaller, lighter, faster framework for REST APIs.

Lean and fast for low-latency micro-services where overhead is important.
Depending on the app, can serve 20k requests / second or more.

There are not a lot of frills, but provides route mapping, route decoding,
pre-, post- and per-route middleware stacks.  Errors are caught and converted
into HTTP 500 responses.  Unmapped routes return 405 errors.  The calls
themselves can return any HTTP status code.

Optionally some `restify` compatibility.  I was able to swap out restify in a
fairly complex app and have all its unit tests pass, and the app runs 40-50% more
calls per second on restiq than on restify.

    var restiq = require('restiq');
    var app = restiq.createServer();

    app.addRoute('GET', '/', function(req, res, next) {
        res.end('Hello, world.');
        next();
    });
    app.listen(1337);


Objectives
----------

Why yet another framework?  I wanted

- to run as fast the node built-in http.createServer() (or faster; see below)
- user-defined output formats (tbd)
- different output formats call by call (tbd)
- fewer built-ins in favor of more add-ons
- to better understand the components of nodejs web service implementations,
  and there is no better way to learn than by doing


Comparison
----------

A small echo server, parses and returns the url query parameters:

- [restiq] - 20.9k/s
- [http] - 17.6k/s
- [express] - 7.9k/s
- [restify] - 4.6k/s (8k/s using just the http methods)
- [hapi] - 0.2k/s* (1.8k/s with `setNoDelay()`)
  (loop over the hapi sockets hashed in `reply.request.connection._connections`)

\* - there is a res.write() issue with http.ServerResponse.  Calls writing or
     piping the response run at precisely 25 requests/second per connection.
     It is very easily reproducible; the fix is to turn off the Nagle algorithm
     on the response socket with `res.socket.setNoDelay()`.


Overview
--------

A web service responds to requests sent to pathname-like addresses
("routes").  The server extracts the request parameters, looks up the
computation associated with the route, runs it, and returns the generated
response.

Parameters can be embedded in the request path itself (path parameters),
appended to the path in HTTP query string format (a `?` followed by
'&'-separated name=value pairs, eg `?a=1&b=2`), or be in the request body in
HTTP query string format or some other serialization format eg JSON or BSON.
Restiq knows about path params and on-path and in-body HTTP query params.

The computation is composed of a series of steps (the "middleware stack"),
each step a function taking the request, the response thus far, and a callback
to call to indicate that the step is finished, `(req, res, next)`.  The steps
are run in sequence, each called after the preceding one has finished.

The steps are highly configurable.  They can be run on a route-by-route basis
or in common to all routes.  Steps in common can be either before or after the
per-route steps.  In addition, steps can be configured to run after all other
processing is complete even in case of errors.

The restiq request and responses are just node [http.IncomingMessage] and
[http.ServerResponse] objects.

Restiq includes a thin compatibility layer for shimming simple
[restify] applications onto restiq.


Examples
--------

Surprisingly, it is possible to build on top of http and achieve better
throughput than a canonical http server as shown below.  Because RegExps are
very fast in node, extracting path params is only 5% slower.  (Timed with
node-v0.10.29 on an AMD 3.6 GHz 4x Phenom II.)

Canonical server using [http]:

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

With [restiq]:

    var restiq = require('restiq');
    var app = restiq.createServer({readImmediate: 0});
    app.addStep(restiq.mw.parseQueryParams);
    app.addRoute('GET', '/echo', [
        function(req, res, next) {
            res.writeHeader(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(req.params));
            next();
        }
    ]);
    app.listen(1337);
    // 20.9k/s  wrk -d8s -t2 -c8 'http://localhost:1337/echo?a=1'

With [restify]:

    var restify = require('restify');
    var app = restify.createServer();
    app.use(restify.queryParser());
    app.get('/echo', function(req, res, next) {
        res.send(200, req.params);
        next();
    });
    app.listen(1337);
    // 4.6k/s  wrk -d8s -t2 -c8 'http://localhost:1337/echo?a=1'

Change just the first two lines to run it under [restiq]:

    var restify = require('restiq');
    var app = restify.createServer({restify: true});
    // ...
    // 16.2k/s  wrk -d8s -t2 -c8 'http://localhost:1337/echo?a=1'


Methods
-------

### restiq( options )
### restiq.createServer( options )

Create a new app.  The `createServer` method returns a newly created app with
no routes and no middleware steps that is not yet listening for connections.
`restiq()` as a function is not a constructor but a builder, it creates a new
app just like `createServer` does.  (Being a builder is similar to `express`,
`createServer` is similar to `http` and `restify`)

The options:

- `debug` - include stack traces in error responses.  Be cautious about
   sending backtraces off-site.
- `setNoDelay` - turn off Nagle write-combining on the current socket.
   This can greatly reduce call latency when responses use write()
   over an internal low-latency network.  Do NOT disable Nagle for
   responses sent over the public internet.
- `restify` - make the response have methods `res.send` for easier
   compatibility with restify.  This eats into the throughput some, so
   use only as needed.
- `createServer` - the function to use to create the server.  It will be
   called with the function(req, res) that processes web requests.
   Exposed for testing, this defaults to `http.createServer`.
- `readBinary` - when reading the request body, gather the chunks into
   a Buffer instead of a utf8 string.  Gathering to string is faster,
   but Buffers are more traditional for binary data.
- `readImmediate` - when reading the request body, the loop can iterate with
   different strategies.  If set to 0 (the default), it uses `setTimeout` which
   supports the highest throughput under load.  Set to 1 for `setImmediate` and
   the highest throughput with just a few active connections.  Set to 2 for
   `on('data')`, which is in between the two -- not as fast as the others, but
   not as slow either.  As a rule of thumb, at 8 active connections or above
   0 (`setTimeout`) will offer the highest throughput.

        var restiq = require('restiq');
        var app = restiq.createServer(options);


### app.listen( port, [hostname], [backlog], [confirmationCallback] )

Start the service.  If given, `confirmationCallback` will be invoked when
the service is ready to receive requests.  Hostname and backlog as for
`http.createServer`.

### app.setErrorHandler( onError(req, res, err, next) )

Use the provided `onError` function to handle middleware errors.  The default error
handler extracts an http status code from `err`, else returns a 500 Internal Server
Error response.

### app.addStep( func, [where] )

Add a processing step to the middleware stack.  Each step is a function
`step(req, res, next)` taking request, response and a next-step callback.
`func` is a step function or an array of step functions. The optional `where`
specifies in which section of the middleware chain to insert the step; the
default is 'use'.

The middleware sections are:

- `setup`, shared steps before the call is routed
- `use`, partially shared steps before the route handlers are run
- (the route handlers, installed with `addRoute`)
- `after`, shared steps after the call successfully finished
- `finally`, shared steps run in every case after all other steps have finished

Middleware steps are run in the above section order, and steps within a
section are run in the order added.  Shared steps are run by all calls.  Use
steps are partially shared, and are run by only those routes that were added
after the use step had already been added.  I.e. if use step and routes are
added interleaved, not all routes will run all use steps; all routes will run
those use steps that are added before the first route is added.  The route
handler steps are defined per route and added with `addRoute()`.

The setup steps provide an opportunity to edit the route, i.e. implement route
aliasing, version mapping, etc.  The use and route steps implement the
call processing proper.  The after steps are for shared post-call wrapup, for
successful calls.  The finally steps are run as the call teardown, and can do
the logging, analytics reporting, etc.

### app.addRoute( method, path, [options], handlers )

Register a path along with a middleware step function (or array of functions)
to handle requests for it.  Returns a route object that can be used to remove
and re-add the route.  Requesting a path that has not been registered or
calling a path with a different GET, POST, etc request method than it was
registered with results in a 405 error.

Paths can embed named parameters, denoted with `/:paramName`.  Named
parameters are extracted and stored into `req.params` (see also
`restiq.mw.parseRouteParams` below).

For restify compatibility, mapped routes execute those `use` steps that
existed when the route was mapped.  In the sequence `use`, `use`, `map(1)`,
`use`, `map(2)`, calls that request route 1 will run only the first two `use`
steps, but calls that request route 2 will run all three.  All calls will run
all `finally` steps (if any).

Options:

- TBD; none right now.


### app.removeRoute( route )

Remove a previously added route.  The removed route can be re-added later with
`addRoute(route)`.


### app.mapRoute( method, path )

For internal use, look up the route for the call.

The mapped route includes the requested `path`, the matching route `name`, the
`tail` of the query string with the query parameters, any named parameter
`vars` included, and the list of `handlers` to run for this request.

For example:

    app.addRoute('GET', '/:color/echo', echoColor)
    app.mapRoute('GET', '/green/echo?a=1&b=2')
    // => {
    //   path: '/green/echo?a=1&b=2',
    //   name: '/:color/echo',
    //   tail: '?a=1&b=2',
    //   vars: {color: "green"},
    //   handlers: [echoColor]
    // }

Note getting the route extracts only the path params; the query string
params can be gotten with `app.mw.parseQueryParams()`.


restiq.mw
---------

A library of pre-written middleware utility functions. Each middleware is
also exposed through a configurable factory function.

### restiq.mw.parseQueryParams( req, res, next )

Merge the query string parameters into `req.params`. `buildParseQueryParams()`
returns this middleware function.

### restiq.mw.parseRouteParams( req, res, next )

Merge the parameters embedded in the request path into `req.params`.  This is
done automatically as soon as the route is mapped, but explicit param parsing
can override these values.  Re-merging allows control of the param source
precedence. `buildParseRouteParams()` returns this middleware function.

### restiq.mw.parseBodyParams( req, res, next )

Merge the query parameters from the body into `req.params`.  Will read
the body with `restiq.mw.readBody` if it has not been read already.
`buildParseBodyParams(options)` returns this middleware function.

Options as for `buildReadBody`.

### restiq.mw.readBody( req, res, next )

Gather up the message that was sent with the http request, and save it in
`req.body`.  This call is safe to call more than once, but sets body only the
first time.

`buildReadBody(options)` returns the readBody middleware function.

Options

- `maxBodySize` - The maximum request body size to allow, in bytes.
Exceeding this value results in a `400 Bad Request` error response.
There is no limit set by default.

### restiq.mw.discardBody( req, res, next )

Reads and discards request body to force the `end` event on the request.
`buildDiscardBody()` returns this middleware function.

### restiq.mw.skipBody( req, res, next )

If the request body is guaranteed to be empty, it is faster to skip waiting
for the `on('end')` event.  Be careful when using this:  if the request has a
body it needs to be consumed. `buildSkipBody` returns this middleware function.


Restify Compatibility Layer
---------------------------

This is what I have so far --


### app.pre( func )

Add shared middleware step to be called before every request, before the
request is routed.  Pre steps are called in the order added.


### app.use( func )

Add shared middleware step to be called before every request after the `pre()`
steps have all finished.  Each routed call will run only those use steps that
existed at the time it was added; use steps added after a route is added will
not be run by that route.  Use steps are run in the order added.


### app.get( path, handler, [handler2, ...] )

Add a GET route, with handlers to run in the order listed


### app.post( path, handler, [handler2, ...] )

Add a POST route, with handlers to run in the order listed


### app.put( path, handler, [handler2, ...] )

Add a PUT route, with handlers to run in the order listed


### app.delete( path, handler, [handler2, ...] )

Add a DELETE route, with handlers to run in the order listed.
This call is also available as `app.del`.


### restiq.queryParser( )

Returns a middleware `function(req, res, next)` that will extract the http query
string parameters and place them in `req.params`


### restiq.authorizationParser( )

Returns a middleware `function(req, res, next)` that will decode an
`Authorization: Basic` header and set the fields `req.authorization.username`,
`req.authorization.basic.username` and `req.authorization.basic.password`.


### restiq.bodyParser( )

Returns a middleware `function(req, res, next)` that will decode the request
body into an object, string or Buffer.  The decoding is ad-hoc based on the
incoming data type, and is not driven by the request headers.


### restiq.acceptParser( )

Sets the response content-encoding to the preferred (first) acceptable
response type specified in the request that is supported by the server.
Restiq assumes the acceptable encodings are listed in order of preference.
Throws a 406 Not Acceptable error if no match is found.


### req.getId( )

returns the request id contained in the request headers.  Unlike restify,
restiq uses a dash `-` if can't find one, and  does not make one up.


### req.version( )

Returns the options.version string that was passed to `createServer()`.


### req.header( name, [defaultValue] )

Return the named header field, or `defaultValue` if that header field was not
specified in the request.


### req.path( )

Returns `req.url`.


### res.header( name, value )

Set a header value, aka `writeHeader`.


### res.get( name )

Read back a set header value.


### res.send( [statusCode], [response] )

Send a response.  The default status code is 200, the default response the
empty string.  The call determines the content type from the response value,
and emits an appropriate header as well.  NOTE:  restify strongly penalizes a
response that does not set the Content-Type header.  Time it yourself.

Turns out restify responses are also extensions of `http.ServerResponse`, so
all the usual write(), writeHead(), end() work as well.


Tips
----

Random observations on building fast REST services

- nodejs `http` has a speed-of-light of around 27k queries per second (empty
  request body, plaintext response)
- having to assemble the body from the chunks limits http to under 24.5k/s
  (that's if not also parsing request params)
- using req.on('data') to assemble the body drops the ceiling to under 19k/s.
  It is much faster to req.read() in an setTimeout loop than to wait for
  events.  Actual times are sensitive to node version, so check.
- query string params are faster to use than REST path params (because routing
  for static paths is a single hash lookup, vs a for loop over a list of
  regexp objects).  Even though path params are faster to extract with a regexp
  than parsing the query string, it does not make up for the routing latency.
- this may be obvious, but passing just path or just query params is faster than
  passing both
- using `res.write()` to reply imposes a throttle of 25 requests per
  connection.  Workaround is to set `res.socket.setNoDelay()` to disable the
  TCP/IP Nagle algorithm.  Only disable for local traffic, never across the internet.


Todo
----

- unit tests
- refactor internal functions into methods, for testability
- would be handy to have decodeReqBody for decoding JSON and BSON request bodies
- would be handy to have encodeResBody for encoding JSON and BSON response bodies
- describe the built-in restify compatibily adapter
- make restiq apps emit the underlying http server events
- make RestifyqRest only relay events if listened for (to maintain correct semantics)
- write buildRequireParams(opts) that returns a middleware function that looks for
  required/optional/unknown params
- double-check the restify compatibility calls, only pass the arguments
  that exist!  else code that uses arguments.length will break
- make request processing time out to close the connection (w/o response) after ? 60 sec ?
- add app.set(), app.get(), app.delete() methods for key/value properties
- app.use() has a two-argument form?  (path, handler) ? (...express?)
- missing app.head() method
- key off of "Accept: text/plain" etc headers for encoding format to use
- ? allow routing regexp routes ?
- handle both base64 and json-array Buffer (binary) data
- should support gzipped responses, 'Accept-Encoding: gzip' (chunked only!)
- expose reg.log to mw functions
- split rlib into misc and mw
- (Q: how to pass app state in to steps? attach app to req? or ...cleaner?)
- ? accept routeName handlers, to hand off to another call (... conditionally??)
- compat: look for Accept-Version: header (and InvalidVersion error)
- res.send() should use registered formatters (default is built-in auto-detect)
- separate output formatting from Content-Type: allow for a post-formatting step
  to subsequently change the content type.  Look for _isFormatted = true.
  This also allows for pluggable mw formatters, for per-call formats (eg, json
  for data, plaintext for metadata)
- compat: re-emit all events from http.Server
- compat: emit restify error events, see http://mcavage.me/node-restify/ #Server+Api
- compat: expose address(), listen(), close()
- compat: make parsed query params available in req.query
- speed: time w/ bunyan vs w/ qlogger (close, 1820 vs 1750 4% restiq, 1177 vs 1066 8% restify)
- revisit send(), support headers
- save the response err to be available in finally steps
- ? save the response body to be available in finally steps
- alias the more common restify errors
- support express app.locals and res.locals 
- add disable/enable/disabled methods on .restiq, for app state (express compat)
- make app.* calls chainable (eg app.addRoute(), etc)
- make case-insensitive routing an option (downcase path)
- populate req.query et al
- make readBinary a call-by-call option?  eg readBodyBinary vs readBodyText
- make routing a mw step, to help w/ path rewriting (to route, edit, re-route)
- support limit on max request size? (error out if too big)
- call versioning
- time koa, meteor, (sails = express,) derby, socketstream mvc frameworks

Related Work:
- [express] - https://expressjs.com/
- [hapi] - https://hapijs.com/
- [http] - https://nodejs.org/api/http.html
- [http.IncomingMessage] - https://www.nodejs.org/api/http.html#http_http_incomingmessage
- [http.ServerResponse] - https://www.nodejs.org/api/http.html#http_class_http_serverresponse
- [restify] - http://restify.com/
- [restiq] - https://www.npmjs.com/package/restiq

[express]: https://www.npmjs.com/package/express
[hapi]: https://www.npmjs.com/package/hapi
[http]: https://nodejs.org/api/http.html
[http.IncomingMessage]: https://www.nodejs.org/api/http.html#http_http_incomingmessage
[http.ServerResponse]: https://www.nodejs.org/api/http.html#http_class_http_serverresponse
[restify]: https://www.npmjs.com/package/restify
[restiq]: https://www.npmjs.com/package/restiq
