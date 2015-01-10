/**
 * rest-like framework for micro-services
 * ...speed, speed, speed
 */

'use strict';

//require('qtimers');
var http = require('http');
var aflow = require('aflow');
var errors = require('./errors');

var QRoute = require('./qroute');
var mw = require('./rlib');

module.exports = Restiq;
module.exports.mw = require('./rlib.js');

function Restiq( opts ) {
    this._opts = opts || {};
    // middleware stacks
    this._pre = new Array();
    this._use = new Array();
    this._routesGet = new QRoute();
    this._routesPost = new QRoute();
    this._routesOther = new QRoute();
    this._post = new Array();

    this._server = this._opts.server;
}

Restiq.prototype._setServer = function _setServer( server ) {
    this._server = server;
    return this;
};

Restiq.prototype.setDebug = function setDebug( yesno ) {
    if (yesno === undefined) yesno = true;
    this._debugMode = yesno;
};

Restiq.prototype._endWithError = function _endWithError( req, res, err, next ) {
    // be sure to consume input, even in case of error.
    // Either that, or close the connection and force the client to reconnect.
    if (!req._bodyEof) Restiq.mw.readBody(req, res);

    var code = 500, message = "middleware error";
    if (err.code) { code = err.code, message = err.message; }

    // TODO: have the commit() hook format the response, and
    // TODO: do not set statusCode or emit response here
    res.writeHeader(code, {'Content-Type': 'text/plain'});
    if (this._debugMode) message += "; " + err.stack;
    res.end(message);

    if (next) next(err);
};

Restiq._buildRouteName = function _buildRouteName( method, path ) {
    if (!method || !path) throw new Error("_buildRouteName: method and path are required");
    return method.toUpperCase() + "::" + path;
};

var fptime = function(){ var t = process.hrtime(); return t[0] + t[1] * 1e-9; };

Restiq.createServer = function createServer( opts ) {
    var restiq = new Restiq(opts);

    function readBody( req, res, next ) {
        if (!res._bodyEof) Restiq.mw.readBody(req, res, next);
        else next();
    }

    function try_run( handler, req, res, next ) {
        // try/catch prevents v8 optimization of function, keep it separate
        try { handler(req, res, next); }
        catch (err) { restiq._endWithError(req, res, err, next); }
    }

    function concatArrays( ) {
        var i, j, dst = new Array(), nargs = arguments.length;
        for (i=0; i<nargs; i++) {
            var arr = arguments[i], len = arr.length;
            for (j=0; j<len; j++) dst.push(arr[j]);
        }
        return dst;
    }

    var server = http.createServer( function(req, res) {
        req.params = {};
        req.body = "";

        var route = restiq.mapRoute(req.method, req.url);
        if (!route) { return restiq._endWithError(req, res, new errors.ErrorMethodNotAllowed("route not mapped")); }

        req._route = route;
        if (route._type === 'patt') Restiq.mw.parseRouteParams(req, res);

        // build the middleware stack for this call
        // faster to append singly than to use concat
        var middlewareStack = concatArrays(
            restiq._pre,
            restiq._use,
            route.handlers,
            restiq._post
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
                if (err === 'halt mw') return restiq._endWithError(req, res, new errors.ErrorOK("OK"));
                else if (err) return restiq._endWithError(req, res, err);
                else return;
            }
        );

    });
    restiq._setServer(server);
   
    return restiq;
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
    for (i=0; i<arguments.length; i++) {
        args.push((typeof arguments[i] !== 'function') ? arguments[i] : undefined);
    }
    var confirmationCallback;
    if (typeof args[args.length - 1] === 'function') confirmationCallback = args.pop

    this._server.listen.apply(this._server, args);
    if (confirmationCallback) confirmationCallback();
};



// quicktest:

/**

var app = Restiq.createServer();
app.pre(mw.parseQueryParams);
app.pre(mw.parseBodyParams);
if (1) app.addRoute('GET', '/:kid/:func', report);
if (1) app.addRoute('POST', '/:kid/:func', report);
if (0) app.addRoute('POST', '/foo/bar', report);
if (0) app.addRoute('GET', '/foo/bar', [
    // 17.2k/s for a 10 deep middleware stack (+ param decoding)
    function(req, res, next){ next(); },
    function(req, res, next){ next(); },
    function(req, res, next){ next(); },
    function(req, res, next){ next(); },
    function(req, res, next){ next(); },
    function(req, res, next){ next(); },
    function(req, res, next){ next(); },
    function(req, res, next){ next(); },
    function(req, res, next){ next(); },
    report,
]);
app.listen(1337, function(){
    console.log("Server running on http://localhost:1337");
});

function report(req, res, next) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    //res.end('Hello World\n');
    res.end(JSON.stringify(req.params));
    //res.end(json.encode({a:1,b:2,c:3,d:4,e:5}));
    next();
}

/**/
