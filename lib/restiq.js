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
var RestifyqRes = require('./restifyqres');
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
util.inherits(Restiq, EventEmitter);

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
    if (!res.headersSent) {
        // if no response sent yet, send the error
        res.writeHead(code, {'Content-Type': 'text/plain'});
        if (this._debug > 0) message += "; " + err.stack;
        res.end(message);
    }

    if (next) next(err);
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
        res.header = function(name,value) {
            return this.setHeader(name, value);
        };
        res.send = function(statusCode, object) {
            if (!object && typeof statusCode !== 'number') { object = statusCode; statusCode = 200; }
            this.writeHead(statusCode, {'Content-Type': 'application/json'});
            this.end(JSON.stringify(object));
        };
        res.get = function(name) {
            return this.getHeader(name);
        };
        req.getId = function() {
            return this.headers['x-request-id'] || this.headers['request-id'];
        };
        req._version = app._opts.version;
        req.version = function() {
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
        aflow.applyVisitor(
            middlewareStack,
            function visitor(handler, cb) {
                runHandler(handler, req, res, function(err) {
                    // false halts processing, error aborts
                    if (err === false) cb('halt mw');
                    else cb(err);
                });
            },
            function whenDone(err) {
                return next ? next(err) : err;
            }
        );
    }

    var server = http.createServer( function(req, res) {
        var self = app;
        req.params = {};
        req.body = "";

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
            // self._post run unconditionally
        );

        runMiddlewareStack(middlewareStack, req, res, function(err) {
            if (err === 'halt mw') err = null;
            runMiddlewareStack(self._post, req, res, function(err2) {
                if (err) self._endWithError(req, res, err);
                // log the call, err, err2
                if (!req._bodyEof) self.mw.readBody(req, res);
                if (!res.headersSent) res.end();
                // TODO: what route to emit?
                self.emit('after', req, res, route.name, err);
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
console.log("AR: use depth", this._use.length);
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
        var info = this._routesGet.addRoute(path, handlers);
    }
    else if (method === 'POST') {
        var info = this._routesPost.addRoute(path, handlers);
    }
    else {
        var routeName = Restiq._buildRouteName(method, path);
        var info = this._routesOther.addRoute(routeName, handlers);
    }
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
    this.addRoute('GET', path, fn);
};
Restiq.prototype.put = function( path, fn ) {
    this.addRoute('PUT', path, fn);
};
Restiq.prototype.post = function( path, fn ) {
    this.addRoute('POST', path, fn);
};
Restiq.prototype.del = function( path, fn ) {
    this.addRoute('DELETE', path, fn);
};
Restiq.prototype.delete = Restiq.prototype.del;
Restiq.queryParser = function( ) {
    return Restiq.mw.parseQueryParams;
};
Restiq.bodyParser = function( ) {
    return Restiq.mw.parseBodyParams;
};
