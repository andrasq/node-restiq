/**
 * rest-like framework for micro-services
 * ...speed, speed, speed
 */

'use strict';

var http = require('http');
var aflow = require('aflow');

var QRoute = require('./qroute');

module.exports = Restiq;
module.exports.mw = require('./rlib');
module.exports.errors = require('./errors');

function Restiq( opts ) {
    this._opts = opts || {};
    // middleware stacks
    this._pre = new Array();
    this._use = new Array();
    this._routesGet = new QRoute();
    this._routesPost = new QRoute();
    this._routesOther = new QRoute();
    this._post = new Array();

    this._restifyCompat = this._opts.restify;
    this._debug = this._opts.debug;
    this._server = null;
}

// bring these closer, for faster access
Restiq.prototype.mw = Restiq.mw;
Restiq.prototype.errors = Restiq.errors;

Restiq.prototype._endWithError = function _endWithError( req, res, err, next ) {
    // be sure to consume all input, even in case of error.
    // Either that, or close the connection and force the client to reconnect.
    if (!req._bodyEof) this.mw.readBody(req, res);

    var code = 500, message = "middleware error";
    if (err.code) { code = err.code, message = err.message; }

    // TODO: have the commit() hook format the response, and
    // TODO: do not set statusCode or emit response here
    res.writeHeader(code, {'Content-Type': 'text/plain'});
    if (this._debug > 0) message += "; " + err.stack;
    res.end(message);

    if (next) next(err);
};

Restiq._buildRouteName = function _buildRouteName( method, path ) {
    if (!method || !path) throw new Error("_buildRouteName: method and path are required");
    return method.toUpperCase() + "::" + path;
};

Restiq.createServer = function createServer( opts ) {
    var app = new Restiq(opts);

    function readBody( req, res, next ) {
        if (!res._bodyEof) app.mw.readBody(req, res, next);
        else next();
    }

    function try_run( handler, req, res, next ) {
        // try/catch prevents v8 optimization of function, keep it separate
        try { handler(req, res, next); }
        catch (err) { app._endWithError(req, res, err, next); }
    }

    function concatArrays( ) {
        var i, j, dst = new Array(), nargs = arguments.length;
        for (i=0; i<nargs; i++) {
            var arr = arguments[i], len = arr.length;
            for (j=0; j<len; j++) dst.push(arr[j]);
        }
        return dst;
    }

    function sendRestifyResponse( res, code, response ) {
        // TODO: encode with the configured response coder
        if (!response && typeof code !== 'number') {
            response = code;
            code = 200;
        }
        res.writeHeader(code, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(response));
    }

    var server = http.createServer( function(req, res) {
        var self = app;
        req.params = {};
        req.body = "";

        // building the send() function slows calls 37%, from 19.9k/s to 14.5k/s
        if (self._restifyCompat) {
            res.send = function(code, response){ sendRestifyResponse(res, code, response); }
        }

        var route = self.mapRoute(req.method, req.url);
        if (!route) { return self._endWithError(req, res, new errors.ErrorMethodNotAllowed("route not mapped")); }

        req._route = route;
        if (route._type === 'patt') self.mw.parseRouteParams(req, res);

        // build the middleware stack for this call
        // faster to append singly than to use concat
        var middlewareStack = concatArrays(
            self._pre,
            self._use,
            route.handlers,
            self._post
        );
        // append readBody() to the stack to ensure that the request is fully consumed
        middlewareStack.push(readBody);

        // run the middleware stack
        aflow.applyVisitor(
            middlewareStack,
            function visitor(handler, cb) {
                try_run(handler, req, res, function(err) {
                    if (err === false) cb("halt mw");
                    else cb(err);
                });
            },
            function whenDone(err) {
                // middleware steps can return false to stop further processing,
                // or an error object to have the loop handle it
                if (err === 'halt mw') return self._endWithError(req, res, new errors.ErrorOK("OK"));
                else if (err) return self._endWithError(req, res, err);
                else return;
            }
        );

    });
    app._server = server;
   
    return app;
}

Restiq.prototype.pre = function pre( func ) {
    this._pre.push(func);
}

Restiq.prototype.use = function use( func ) {
    this._use.push(func);
}

Restiq.prototype.post = function post( func ) {
    this._post.push(func);
}

Restiq.prototype.commit = function commit( func ) {
    this._commit = funct;
}

Restiq.prototype.addRoute = function addRoute( method, path, handlers ) {
    method = method.toUpperCase();
    if (!Array.isArray(handlers)) handlers = [handlers];
    if (method === 'GET') {
        this._routesGet.addRoute(path, handlers);
    }
    else if (method === 'POST') {
        this._routesPost.addRoute(path, handlers);
    }
    else {
        var routeName = Restiq._buildRouteName(method, path);
        this._routesOther.addRoute(routeName, handlers);
    }
    return this;
}

Restiq.prototype.mapRoute = function mapRoute( method, url ) {
    var route;
    if (method === 'GET') {
        route = this._routesGet.mapRoute(url);
    }
    else if (method === 'POST') {
        route = this._routesPost.mapRoute(url);
    }
    else {
        var routeName = Restiq._buildRouteName(method, url);
        route = this._routesOther.mapRoute(routeName)
    }
    return route;
};

// start the service, invoke the callback to confirm started
// This is *not* used to listen to each request arrive
Restiq.prototype.listen = function listen( ) {
    var i, args = new Array();
    for (i=0; i<arguments.length; i++) args.push(arguments[i]);
    var confirmationCallback = (typeof args[args.length - 1] === 'function') ? args.pop() : false;

    this._server.listen.apply(this._server, args);
    if (confirmationCallback) confirmationCallback();
};

// restify compatibility functions
Restiq.prototype.get = function( path, fn ) {
    this.addRoute('GET', path, fn);
};
Restiq.prototype.put = function( path, fn ) {
    this.addRoute('PUT', path, fn);
};
Restiq.prototype.post = function( path, fn ) {
    this.addRoute('POST', path, fn);
};
Restiq.prototype.delete = function( path, fn ) {
    this.addRoute('DELETE', path, fn);
};
Restiq.queryParser = function( ) {
    return Restiq.mw.parseQueryParams;
};
Restiq.bodyParser = function( ) {
    return Restiq.mw.parseBodyParams;
};
