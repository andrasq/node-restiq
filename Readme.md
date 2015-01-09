restiq
======

smaller, lighter, faster framework for REST API's, in the spirit of restify.

Useful to serve 16k requests per second per thread, not 4k.  Intended for
writing lean, fast micro-services; client requests maybe later.

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


Summary
-------

An web service responds to requests sent to pathname-like addresses.  Each
address can have a series of computation steps associated with it (the
"middleware stack").  Each step is passed the request, the response, and a
callback to call when finished.

The request and response are essentially just node http.incomingMessage and
http.ServerResponse objects.


API
---

### new Restiq( )

### restiq.listen( port, [hostname], [backlog], [confirmationCallback] )

start the service.  If given, confirmationCallback will be invoked when the
service is ready to receive requests.

### restiq.pre( func )

add shared middleware steps to be called before every request.

### restiq.post( func )

add shared middleware steps to be called after every request.

### restiq.addRoute( method, path, func )

register a path along with a function (or array of functions) to handle
requests for it.  Requesting a path that has not been registered or calling a
path with a different GET, POST, etc request method than it was registered
with results in a 405 error.

### restiq.mapRoute( method, path )

for internal use, look up the route for the call

### restiq.mw

A library of pre-written utility middleware functions:

#### restiq.mw.parseQueryParams( req, res, next )

merge the query string parameters into req.params

#### restiq.mw.parseBodyParams( req, res, next )

merge the query string parameters from the body into req.params.  The body
must have been read already.

#### restiq.mw.readBody( req, res, next )

gather up the message that was sent with the http request, and save it in
req.body.  This call is safe to call more than once, but sets body only the
first time.


TODO
----

- unit tests
- res.send() method
- res.end() method
- res.sendHeader() method
