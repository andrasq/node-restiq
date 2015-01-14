/**
 * rest framework for micro-services
 * ...speed, speed, speed
 */

'use strict';

var http = require('http');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var aflow = require('aflow');
var QRoute = require('./qroute');
module.exports = Restiq;
module.exports.mw = require('./rlib');
module.exports.errors = require('./errors');

function Restiq( opts ) {
    this._opts = opts || {};
    // middleware stacks
    this._preCount = 0;
    this._before = new Array();
    this._routesGet = new QRoute();
    this._routesPost = new QRoute();
    this._routesOther = new QRoute();
    this._after = new Array();
    this._finally = new Array();

    this._emulateRestify = this._opts.restify;
    this._setNoDelay = this._opts.setNoDelay;
    this._debug = this._opts.debug;

    this._server = null;
    this._errorHandler = null;
}
util.inherits(Restiq, EventEmitter);

// bring these closer, for faster access
Restiq.prototype.mw = module.exports.mw;
Restiq.prototype.errors = module.exports.errors;

Restiq.prototype.setErrorHandler = function setErrorHandler( handler ) {
    // handler(req, res, err, next)
    this._errorHandler = handler;
}

Restiq.prototype.setOutputHandler = function setOutputHandler( handler ) {
    // handler( ??? )
    this._outputHandler = handler;
};

Restiq.prototype._endWithError = function _endWithError( req, res, err, next ) {
    // be sure to consume all input, even in case of error.
    // Either that, or close the connection and force the client to reconnect.
    // TODO: or ensure that http skips the rest of the body
    if (!req._bodyEof) this.mw.readBody(req, res);

    if (this._errorHandler) {
        this._errorHandler(req, res, err, function(err) {
            if (next) next(err);
            return err;
        });
    }
    else {
        var code = 500, message = "middleware error";
        if (err.statusCode) { code = err.statusCode, message = err.message; }
        else if (err.code) { code = err.code, message = err.message; }

        // TODO: have the commit() hook format the response, and
        // TODO: do not set statusCode or emit response here
        if (!res.headersSent) {
            // if no response sent yet, send the error
            // TODO: make top-level error response configurable (pluggable handler)
            res.writeHead(code, {'Content-Type': 'text/plain'});
            if (this._debug > 0) message += "; " + err.stack;
            res.end(message);
        }

        if (next) next(err);
    }
    return err;
};

// make our http.ServerResponse behave kinda like restify.res
function addRestifyMethodsToReqRes( app, req, res ) {
    res.header = function res_header( name, value ) {
        return this.setHeader(name, value);
    };
    res.send = function res_send( statusCode, object ) {
        if (object === undefined && typeof statusCode !== 'number') { object = statusCode; statusCode = null; }
        // TODO: the below inline code yields 50% faster throughput than mw.encodeResponseBody()
        var type = this.getHeader('content-type');
        if (!type) {
            // send serialized objects, as-is strings (bson).  Seems to work for KDS.
            if (typeof object === 'string') type = 'text/plain';                    // text/bson
            else type = 'application/json';                                         // object
            // TODO: will bson really arrive as an untyped buffer object?
            // if (Buffer.isBuffer(object)) type = 'application/octet-stream';         // bson
            if (typeof statusCode === 'number')
                if (!this.headersSent) this.writeHead(statusCode, {'Content-Type': type});
            else {
                this.setHeader('Content-Type', type);
            }
        }
        else {
            if (typeof statusCode === 'number') this.statusCode = statusCode;
        }
        if (type === 'application/octet-stream' || type === 'text/plain') this.end(object);
        else if (type === 'application/json') this.end(JSON.stringify(object));
        else this.end(object);
        // TODO: can send() take a callback?
        // if (typeof arguments[arguments.length-1] === 'function') (arguments[arguments.length-1])();
    };
    res.get = function res_get(name) {
        return this.getHeader(name);
    };
    req.getId = function res_getId() {
        return this.headers['x-request-id'] || this.headers['request-id'] || "-";
    };
    req._version = app._opts.version;
    req.version = function res_version() {
        return this._version;
    };
}

function concatArrays( /* VARARGS */ ) {
    var i, j, dst = new Array(), nargs = arguments.length;
    for (i=0; i<nargs; i++) {
        var arr = arguments[i], len = arr.len || arr.length;
        for (j=0; j<len; j++) dst.push(arr[j]);
    }
    return dst;
}

function runMiddlewareStack( app, middlewareStack, req, res, next ) {
    var i = 0, done = false, len = middlewareStack.length;
    if (len <= 0) return next();
    aflow.repeatUntil(
        function visitor(cb) {
            var handler = middlewareStack[i];
            i++;
            handler(req, res, function(err) {
                if (err === false) err = 'halt mw';
                cb(err, i >= len);
            });
        },
        function whenDone(err) {
            if (err && err !== 'halt mw') app._endWithError(req, res, err, next);
            else next();
        }
    );
}

function finishMiddlewareStack(app, req, res, err) {
    if (err) return app._endWithError(req, res, err);

    // log the call, err, err2

    if (!req._bodyEof) app.mw.readBody(req, res);

    // TODO: what route to emit?
    app.emit('after', req, res, req._route.name, err);

    // NOTE: do NOT force an end(), a poorly written call can have
    // unfinished continuations that may send a response later.
    // Yes, that will mess with call timing / metrics (hooked to 'after').
    // if (!res.headersSent) res.end();
}

Restiq.createServer = function createServer( opts ) {
    var app = new Restiq(opts);
    var createServer = http.createServer;
    if (opts) {
        if (opts.createServer) createServer = opts.createServer;
    }

    app._server = createServer( function(req, res, whenDone) {
        var self = app;
        req.params = {};
        req.body = "";

        // 1% overhead to disable the 40ms timeout on write() (19.3k/s vs 19.5k/s)
        // but 5% overhead to editing res.write method to disable on demand
        if (self._setNoDelay) res.socket.setNoDelay();

        if (self._emulateRestify) {
            addRestifyMethodsToReqRes(app, req, res);
            app.setErrorHandler(function(req, res, err, next) {
                if (!res.headersSent) {
                    // only restify errors have .statusCode and .body
                    res.writeHead(err.statusCode || 500, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify(err.body ? err.body : {code: err.code, message: err.message, stack: this._debug ? err.stack : null}));
                }
            });
        }

        var route = self.mapRoute(req.method, req.url);
        if (!route) { return self._endWithError(req, res, new self.errors.ErrorMethodNotAllowed("route not mapped")); }

        req._route = route;     // save for parseRouteParams
        if (route._type === 'patt') self.mw.parseRouteParams(req, res);

        // restify compat hack: restify only runs those use() steps that existed when the route was added
        self._before.len = route.steps + self._preCount;

        // build the middleware stack for this call
        // faster to append singly than to use concat
        var middlewareStack = concatArrays(
            self._before,
            route.handlers,
            self._after
            // self._finally run unconditionally
        );

        // process the request, return the response
        runMiddlewareStack(self, middlewareStack, req, res, function(err) {
            runMiddlewareStack(self, self._finally, req, res, function(err2) {
                finishMiddlewareStack(self, req, res, err);
                // if mocking the server, will be provided with a callback
                if (whenDone) whenDone();
            });
        });
    });
   
    return app;
}

// add mw step to run unconditionally before every request.
// The pre steps will in the order added before any of teh use steps
Restiq.prototype.pre = function pre( func ) {
    this._before.splice(this._preCount, 0, func);
    this._preCount++;
}

// add mw step to run before every request.  All the use steps will run
// in the order added before any of the route-specific steps
// Each route will run those mw steps that existed at the time it was added
Restiq.prototype.use = function use( func ) {
    this._before.push(func);
}

// add mw step to run after every request, except if the stack errors out.
// All the after steps will run in the order added
Restiq.prototype.after = function after( func ) {
    this._after.push(func);
}

// add mw step to run unconditionally after every request, even after errors.
// All the finally steps will run in the order added after all other steps
Restiq.prototype.finally = function finally_( func ) {
    this._finally.push(func);
}

Restiq.prototype.addRoute = function addRoute( method, path, handlers ) {
    method = method.toUpperCase();
    if (!Array.isArray(handlers)) handlers = [handlers];
    if (typeof path === 'object') {
        // TODO: restify can set a route with options
        path = path.path;
    }
    if (method === 'GET') {
        var info = this._routesGet.addRoute(path, handlers);
    }
    else if (method === 'POST') {
        var info = this._routesPost.addRoute(path, handlers);
    }
    else {
        var routeName = method.toUpperCase() + '::' + path;
        var info = this._routesOther.addRoute(routeName, handlers);
    }
    // for restify compatibility, only run those mw "use" steps that existed
    // when this route was added.  Any new steps added later will be ignored,
    // though any new 'pre' steps will still be run.
    info.steps = this._before.length - this._preCount;
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
        var routeName = method.toUpperCase() + '::' + url;
        route = this._routesOther.mapRoute(routeName)
        // strip off the prepended
        route.path = route.path.slice(route.path.indexOf('::') + 2);
        route.name = route.name.slice(route.name.indexOf('::') + 2);
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

Restiq.prototype.close = function close( cb ) {
    this._server.close(cb);
};

//
// restify compatibility functions
//
Restiq.prototype.get = function restify_get( path, fn ) {
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('GET', path, handlers);
};
Restiq.prototype.put = function restify_put( path, fn ) {
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('PUT', path, handlers);
};
Restiq.prototype.post = function restify_post( path, fn ) {
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('POST', path, handlers);
};
Restiq.prototype.del = function restify_del( path, fn ) {
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('DELETE', path, handlers);
};
Restiq.prototype.delete = Restiq.prototype.del;
Restiq.queryParser = function( ) {
    return Restiq.mw.parseQueryParams;
};
Restiq.bodyParser = function( ) {
    return Restiq.mw.parseBodyParams;
};
