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
    this._pre = new Array();
    this._use = new Array();
    this._routesGet = new QRoute();
    this._routesPost = new QRoute();
    this._routesOther = new QRoute();
    this._finally = new Array();

    this._restifyCompat = this._opts.restify;
    this._debug = this._opts.debug;
    this._server = null;
    this._errorHandler = null;
}
util.inherits(Restiq, EventEmitter);

// bring these closer, for faster access
Restiq.prototype.mw = Restiq.mw;
Restiq.prototype.errors = Restiq.errors;

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
    else if (this._restifyCompat) {
        // TODO: make error handler pluggable!  ie, app.setErrorHandler(Restiq.mw.restifyErrorHandler);
        if (!res.headersSent) {
            res.writeHead(err.statusCode || 500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(err.body ? err.body : {code: err.code, message: err.message, stack: this._debug ? err.stack : null}));
            if (next) next(err);
        }
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

Restiq._buildRouteName = function _buildRouteName( method, path ) {
    if (!method || !path) throw new Error("_buildRouteName: method and path are required");
    return method.toUpperCase() + "::" + path;
};

Restiq.createServer = function createServer( opts ) {
    var app = new Restiq(opts);

    // make our http.ServerResponse behave kinda like restify.res
    function adaptResToRestify( app, req, res ) {
        //return new RestifyqRes(res);
        res.header = function res_header( name, value ) {
            return this.setHeader(name, value);
        };
        res.send = function res_send( statusCode, object ) {
            if (object === undefined && typeof statusCode !== 'number') { object = statusCode; statusCode = null; }
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
        return res;
    }

    function runHandler( handler, req, res, next ) {
        // try/catch prevents v8 optimization of function, keep it separate
        try { handler(req, res, next); }
        catch (err) { app._endWithError(req, res, err, next); }
    }

    function concatArrays( ) {
        var i, j, dst = new Array(), nargs = arguments.length;
        for (i=0; i<nargs; i++) {
            var arr = arguments[i], len = arr.len || arr.length;
            for (j=0; j<len; j++) dst.push(arr[j]);
        }
        return dst;
    }

    function runMiddlewareStack( middlewareStack, req, res, next ) {
        var i = 0, done = false, len = middlewareStack.length;
        aflow.repeatWhile(
            function loopTest() {
                return (i < len && !done);
            },
            function visitor(cb) {
                var handler = middlewareStack[i];
                i++;
                handler(req, res, function(err) {
                    if (err === 'halt mw') { done = true; err = null; }
                    cb(err);
                });
            },
            function whenDone(err) {
                next(err);
            }
        );
    }

    function finishMiddlewareStack(app, req, res, err) {
        if (err) return app._endWithError(req, res, err);
        // log the call, err, err2
        if (!req._bodyEof) app.mw.readBody(req, res);
        // NOTE: do not force a response, a poorly written call can have
        // unfinished continuations that may send a response later.
        // Yes, that will mess with call timing / metrics.
        // if (!res.headersSent) res.end();
        // TODO: what route to emit?
        app.emit('after', req, res, req._route.name, err);
    }

    var server = http.createServer( function(req, res) {
        var self = app;
        req.params = {};
        req.body = "";

        // 1% overhead to disable the 25-calls-per-connection limit of write()
        // but 5% overhead to editing res.write method to disable on demand
        res.socket.setNoDelay();      // 19.3k/s vs 19.5k/s

        // building the send() function slows calls 37%, from 19.9k/s to 14.5k/s
        if (self._restifyCompat) res = adaptResToRestify(app, req, res);

        var route = self.mapRoute(req.method, req.url);
        if (!route) { return self._endWithError(req, res, new self.errors.ErrorMethodNotAllowed("route not mapped")); }

        req._route = route;     // save for parseRouteParams
        if (route._type === 'patt') self.mw.parseRouteParams(req, res);

        // restify compat hack: restify only runs those use() steps that existed when the route was added
        self._use.len = route.steps;

        // build the middleware stack for this call
        // faster to append singly than to use concat
        var middlewareStack = concatArrays(
            self._pre,
            self._use,
            route.handlers
            // self._finally run unconditionally
        );

        runMiddlewareStack(middlewareStack, req, res, function(err) {
            if (err === 'halt mw') err = null;
            if (!self._finally.length) finishMiddlewareStack(self, req, res, err);
            else
            runMiddlewareStack(self._finally, req, res, function(err2) {
                finishMiddlewareStack(self, req, res, err);
/**
                if (err) self._endWithError(req, res, err);
                // log the call, err, err2
                if (!req._bodyEof) self.mw.readBody(req, res);
                if (!res.headersSent) res.end();
                // TODO: what route to emit?
                self.emit('after', req, res, route.name, err);
**/
            });
        });
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

Restiq.prototype.finally = function post( func ) {
    this._finally.push(func);
}

Restiq.prototype.commit = function commit( func ) {
    this._commit = func;
}

Restiq.prototype.addRoute = function addRoute( method, path, handlers ) {
    method = method.toUpperCase();
    if (!Array.isArray(handlers)) handlers = [handlers];
    if (method === 'GET') {
        var info = this._routesGet.addRoute(path, handlers);
    }
    else if (method === 'POST') {
        var info = this._routesPost.addRoute(path, handlers);
    }
    else {
        var routeName = Restiq._buildRouteName(method, path);
        var info = this._routesOther.addRoute(routeName, handlers);
    }
    // for restify compatibility, only run those mw "use" steps that existed
    // when this route was added.  Any new steps added later will be ignored.
    info.steps = this._use.length;
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
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('GET', path, handlers);
};
Restiq.prototype.put = function( path, fn ) {
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('PUT', path, handlers);
};
Restiq.prototype.post = function( path, fn ) {
    var path = arguments[0];
    var i, handlers = new Array();
    for (i=1; i<arguments.length; i++) handlers.push(arguments[i]);
    this.addRoute('POST', path, handlers);
};
Restiq.prototype.del = function( path, fn ) {
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
