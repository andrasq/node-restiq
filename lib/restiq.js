/**
 * rest framework for micro-services
 * ...speed, speed, speed
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var http = require('http');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

// faster to predefine the fields that restiq appends to req
http.IncomingMessage.prototype.headers = null;
http.IncomingMessage.prototype.restiq = null;
http.IncomingMessage.prototype.params = null;
http.IncomingMessage.prototype.body = "";
http.IncomingMessage.prototype._route = null;
http.IncomingMessage.prototype._bodyEof = undefined;
// restify adds this method, and restify users expect it (eg unit tests)
http.IncomingMessage.prototype.header = function req_header(name) {
    return this.headers[name.toLowerCase()];
};

// also predefine restify compatibility methods added to req and res
http.IncomingMessage.prototype.method = null;
http.IncomingMessage.prototype.accepts = undefined;
http.IncomingMessage.prototype.getId = null;
http.IncomingMessage.prototype.version = null;
//http.IncomingMessage.prototype.headers = {};
//http.IncomingMessage.prototype.statusCode = 200;
http.IncomingMessage.prototype.authorization = null;
http.IncomingMessage.prototype.username = null;
// restify adds this method, and restify users expect it (eg unit tests)
http.ServerResponse.prototype.header = function res_header(name, value) {
    if (value) this.setHeader(name, value);
    else return this.getHeader(name);
}
http.ServerResponse.prototype.send = null;
http.ServerResponse.prototype.get = null;
http.ServerResponse.prototype.json = null;

var aflow = require('aflow');
var QRoute = require('./qroute');
module.exports = Restiq;
module.exports.mw = require('./rlib');
module.exports.errors = require('./errors');

function Restiq( opts ) {
    this._opts = opts || {};
    this._emulateRestify = this._opts.restify;
    this._setNoDelay = this._opts.setNoDelay;
    this._debug = this._opts.debug;

    // middleware stacks
    this._setup = new Array();                  // pre-routing mw
    this._before = new Array();                 // pre-call mw
    this._routesGet = new QRoute();             // GET routed mw
    this._routesPost = new QRoute();            // POST mw
    this._routesOther = new QRoute();           // all other routed mw
    this._after = new Array();                  // post-call mw
    this._finally = new Array();                // teardown mw

    this._server = null;
    this._errorHandler = null;

    if (this._emulateRestify) this._before.push(emulateRestify);
}
util.inherits(Restiq, EventEmitter);

// bring these closer, for faster access
Restiq.prototype.mw = module.exports.mw;
Restiq.prototype.errors = module.exports.errors;

// restify compat: the list of recognized mime types
// TODO: populate this from the mime types of the configured decoders
Restiq.prototype.acceptable = [
    'application/json',                         // json object
    'text/plain',                               // urlencoded query string
    'application/octet-stream',                 // Buffer object
    'application/javascript',                   // json object ... but as Buffer?
    'application/x-www-form-urlencoded',        // urlencoded query string
];

Restiq.prototype.setErrorHandler = function setErrorHandler( handler ) {
    // handler(req, res, err, next)
    this._errorHandler = handler;
}

Restiq.prototype.setOutputHandler = function setOutputHandler( handler ) {
    // handler( ??? )
    this._outputHandler = handler;
};

Restiq.createServer = function createServer( opts ) {
    var app = new Restiq(opts);
    var createServer = http.createServer;
    if (opts) {
        if (opts.createServer) createServer = opts.createServer;
    }

    app._server = createServer( function(req, res, whenDone) {
        var self = app;
        // assign instance vars, else param parsing stores by reference into the parent!
        req.params = {};

        // faster to setNoDelay here than to on-the-fly disable it on write()
        if (self._setNoDelay) res.socket.setNoDelay();

        // run the setup stack before anything else, even routing
        req.restiq = app;
        runMiddlewareStack(self, self._setup, req, res, function(err) {
            // error before routing even: clean up and quit
            if (err) return runMiddlewareStack(self, self._finally, req, res, function(err2) {
                finishMiddlewareStack(self, req, res, err);
                if (whenDone) whenDone();
            });

            // route the call
            var route = self.mapRoute(req.method, req.url);
            if (!route) { return self._endWithError(req, res, new self.errors.ErrorMethodNotAllowed("route not mapped")); }
            req._route = route;     // save for parseRouteParams
            if (route._route.type === 'patt') self.mw.parseRouteParams(req, res);

            // build the middleware stack for this call
            var middlewareStack;
            if (route._route.stack) {
                middlewareStack = route._route.stack;
            }
            else {
                // restify compat: only run those mw steps that existed when the route was added
                self._before.len = route._route.steps;

                middlewareStack = concatArrays(
                    self._before,
                    route._route.handlers,
                    self._after
                    // self._finally run unconditionally
                );
                route._route.stack = middlewareStack;
            }

            // process the request, return the response
            runMiddlewareStack(self, middlewareStack, req, res, function(err) {
                runMiddlewareStack(self, self._finally, req, res, function(err2) {
                    finishMiddlewareStack(self, req, res, err);
                    // if mocking the server, will be provided with a callback
                    if (whenDone) whenDone();
                });
            });
        });
    });

    return app;
}

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

    // fully consume request body, for connection reuse
    if (!req._bodyEof) app.mw.readBody(req, res);

    // TODO: what route to emit?
    if (app._emulateRestify) app.emit('after', req, res, req._route.name, err);

    // NOTE: do NOT force an end(), a poorly written call can have
    // unfinished queued continuations that may send a response later.
    // Yes, that will mess with call timing / metrics (hooked to 'after').
    // if (!res.headersSent) res.end();
}

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

// ----------------------------------------------------------------

Restiq.prototype.addStep = function addStep( func, where ) {
    if (!where) where = 'use';
    if (Array.isArray(func)) {
        for (var i=0; i<func.length; i++) this.addStep(func[i], where);
        return;
    }
    if (typeof func !== 'function') throw new Error("middleware handler must be a function: ", util.inspect(func));
    switch (where) {
    case 'setup':   this._setup.push(func); break;
    case 'use':     this._before.push(func); break;
    case 'after':   this._after.push(func); break;
    case 'finally': this._finally.push(func); break;
    default: throw new Error(where + ": unknown middleware step location");
    }
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
    // when this route was added.  Any new steps added later will be ignored
    info.steps = this._before.length;
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

// ----------------------------------------------------------------
// restify compatibility functions
//

Restiq.prototype.pre = function restify_pre( func ) {
    this.addStep(func, 'setup');
};
Restiq.prototype.use = function restify_use( func ) {
    this.addStep(func, 'use');
};
// TODO: finally is a restiq addition, deprecate
Restiq.prototype.finally = function restify_finally( func ) {
    this.addStep(func, 'finally');
};

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
Restiq.bodyParser = function( options ) {
    // TODO: this is similar, but not sure if the same
    // TODO: check mapParams:true compatibility
    if (options && options.mapParams) return Restiq.mw.parseBodyParams;
    else return Restiq.mw.parseBody;
};
Restiq.authorizationParser = function( ) {
    // TODO: handles Basic, but not Signature
    return Restiq.mw.parseAuthorization;
};

// configure req and res to behave kinda like in restify
function emulateRestify( req, res, next ) {
    var app = req.restiq;
    addRestifyMethodsToReqRes(req, res);
    app.setErrorHandler(function(req, res, err, next) {
        if (!res.headersSent) {
            // only restify errors have .statusCode and .body
            res.writeHead(err.statusCode || 500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(err.body ? err.body : {code: err.code, message: err.message, stack: this._debug ? err.stack : null}));
        }
    });
    if (next) next();
}

// make our http.ServerResponse behave kinda like restify.res
function addRestifyMethodsToReqRes( req, res ) {
    res.header = function res_header( name, value ) {
        return value === undefined ? this.getHeader(name) : this.setHeader(name, value);
    };
    res.send = function res_send( statusCode, body, headers) {
        // TODO: headers ??
        if (body === undefined) {
            if (typeof statusCode === 'number') body = "";
            else { body = statusCode; statusCode = 200; }
        }
        var encoding, content;

        // send auto-detects the encoding type from the response body sent,
        // one of Object, Buffer, or Error (we also accept plaintext)
        // TODO: match response format to req Accept: header
        // note: reading accept = headers['accept'] is pretty slow, 14k vs 16k/s
        // note: 10% faster to inline the encoding vs via encoders table
        if (typeof body !== 'object') encoding = 'text/plain';
        else if (body) {
            if (body.message && body.stack && body instanceof Error) {
                statusCode = body.statusCode || 500;
                encoding = 'application/json';
                // TODO: convert generic error into restify error response
            }
            else if (typeof body.length === 'number' && Buffer.isBuffer(body)) encoding = 'application/octet-stream';
            else encoding = 'application/json';
        }
        else encoding = 'application/json';

        // TODO: use registered encoders for encoding
        // eg content = req.restiq.mw.responseEncoders[encoding](body);
        if (encoding === 'application/json') content = JSON.stringify(body);
        else if (encoding === 'application/octet-stream') content = body;
        else /*if (encoding === 'text/plain')*/ content = body + "";

        // TODO: properly utf-8 encode the response

        this.writeHead(statusCode, {
            'Content-Type': encoding,
            'Content-Length': content.length
        });
        if (statusCode === 204 || statusCode === 304 || req.method === 'HEAD') this.end();
        else this.end(content);
    };
    res.get = function res_get(name) {
        return this.getHeader(name);
    };
    res.json = function res_json(statusCode, body) {
        if (body === undefined) { body = statusCode; statusCode = this.statusCode ? this.statusCode : 200; }
        this.writeHead(statusCode, {'Content-Type': 'application/json'});
        this.end(JSON.stringify(body));
    };
    // TODO:
    // charSet(type)
    // cache([type], [options])
    // status(statusCode)

    req.getId = function res_getId() {
        return this.headers['x-request-id'] || this.headers['request-id'] || "-";
    };
    req.version = function req_version() {
        return this.restiq._opts.version;
    };
    req.header = function req_header(name, defaultValue) {
        var value = this.headers[name.toLowerCase()];
        return (value || value !== undefined) ? value : defaultValue;
    };
    req.accepts = function req_accepts( types ) {
        if (typeof types === 'string') types = [types];
        var acceptTypes = this.headers['accept'];
        if (!acceptTypes || acceptTypes.indexOf('*/*') >= 0) return types[0];

        // restify decorates req with a method accepts() that, when passed the app.acceptable
        // returns the "best" supported type for this request.
        // do not map(), iterate to stop early on first match
        acceptTypes = acceptTypes.split(';');
        for (var i=0; i<acceptTypes.length; i++) {
            var type = acceptTypes[i].trim();
            var idx = types.indexOf(type);
            if (idx >= 0) return types[idx];
            // TODO: match 'html' against 'text/html', etc
            if (type.indexOf('/') < 0) {
                var aliases = {
                    'text': 'text/plain',
                    'html': 'text/html',
                    'json': 'application/json',
                };
                if (aliases[type]) return aliases[type];
            }
        }
        // no match found, force a json response? or error out?
        return false;
    };
    // TODO:
    // is(type)
    // isSecure()
    // isChunked()
    // isKeepAlive()
    // getLogger()
    // time()
}
