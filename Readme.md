restiq
======

smaller, lighter, faster framework for REST API's, in the spirit of restify.

Useful to serve 16k requests per second per thread, not 4k.  Intended for
lean, fast micro-services; client requests maybe later.

This is a work in progress.  The basics are in place -- route mapping, fast
route decoding, pre-, post- and per-route stacks are working.  Errors are caught
and converted into a 500 response.  Unmapped routes return 405 errors.


Objectives
----------

Why yet another framework?  I wanted

- to run as fast the node built-in http.createServer()
- user-defined output formats
- different output formats call by call
- fewer built-ins in favor of more add-ons


Example
-------

        var Restiq = require('restiq');
        var app = Restic.createServer();
        app.pre(Restiq.mw.parseQueryParams);
        app.addRoute('GET', '/echo', [
            function(req, res, next) {
                res.writeHeaders(200, {'Content-Type': 'application/json'}),
                res.end(JSON.stringify(req.params)),
                next();
            }
        ]);
        app.listen(8080);

        // wrk -d20s -t2 -c8 'http://localhost:8080/echo?a=1&b=2&c=3&d=4&e=5'
        // => 18.8k requests / second (54.3k/s cluster of 3)


Tips
----

Some notes on how to build fast fast services

- REST path params are faster to extract than query string params
- passing just REST or just GET params is faster than passing both
- JSON is slower to encode and to parse than query strings

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

        app = Restiq.createServer();
        app.pre(stepBefore

The Restiq request and responses are just node
[`http.incomingMessage`](https://www.nodejs.org/api/http.html#http_http_incomingmessage)
and
[`http.ServerResponse`](https://www.nodejs.org/api/http.html#http_class_http_serverresponse)
objects.

Will eventually include a thin compatibility layer for shimming simple
[`restify`](https://www.npmjs.org/package/restify)
applications onto Restiq.


Methods
-------

### new Restiq( )

### restiq.listen( port, [hostname], [backlog], [confirmationCallback] )

start the service.  If given, confirmationCallback will be invoked when the
service is ready to receive requests.

### restiq.pre( func )

add shared middleware step to be called before every request.

### restiq.use( func )

add shared middleware step to be called before every request after the `pre()`
steps have all finished.

### restiq.post( func )

add shared middleware step to be called after every request.

### restiq.addRoute( method, path, func )

register a path along with a function (or array of functions) to handle
requests for it.  Requesting a path that has not been registered or calling a
path with a different GET, POST, etc request method than it was registered
with results in a 405 error.

Paths can embed named parameters, denoted with `/:paramName`.  Named
parameters are extracted and stored into req.params (see also
`mw.parseRouteParams` below.

### restiq.mapRoute( method, path )

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

### restiq.mw

A library of pre-written middleware utility functions:

#### restiq.mw.parseQueryParams( req, res, next )

merge the query string parameters into req.params

#### restiq.mw.parseRouteParams( req, res, next )

merge the parameters embedded in the request path into req.params.  This is
done automatically as soon as the route is mapped, but explicit param parsing
can override these value.  Re-merging allows control of the param source
precedence.

#### restiq.mw.parseBodyParams( req, res, next )

merge the query string parameters from the body into req.params.  Will read
the body with mw.readBody if it has not been read already.

#### restiq.mw.readBody( req, res, next )

gather up the message that was sent with the http request, and save it in
req.body.  This call is safe to call more than once, but sets body only the
first time.

#### restiq.mw.skipBody( req, res, next )

if the request body is guaranteed to be empty, it is faster to skip waiting
for the on('end') event.  Be careful when using this:  if the request has a
body it needs to be consumed.


TODO
----

- unit tests
- res.send() method
- res.sendHeader() method
