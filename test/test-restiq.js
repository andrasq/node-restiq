var http = require('http');
var url = require('url');
var Restiq = require('../index');
var qmock = require('qnit').qmock;

var HttpClient = require('../http-client');

module.exports = {
    'Restiq class': {
        'should have createServer method': function(t) {
            t.equal(typeof Restiq.createServer, 'function');
            t.done();
        },

        'should expose mw': function(t) {
            t.ok(Restiq.mw);
            t.ok(Restiq.mw.parseQueryParams);
            t.ok(Restiq.mw.parseBodyParams);
            t.ok(Restiq.mw.readBody);
            t.ok(Restiq.mw.buildParseQueryParams());
            t.ok(Restiq.mw.buildParseBodyParams());
            t.ok(Restiq.mw.buildReadBody());
            t.done();
        },

        'should expose errors': function(t) {
            t.ok(Restiq.errors);
            t.ok(Restiq.errors['405']);
            var e = new Restiq.errors[405]("msg");
            t.ok(e.code);
            t.ok(e.message);
            t.equal(e.message, 'msg');
            t.ok(e instanceof Error);
            t.ok(e.stack);
            t.done();
        },

        'error should have default message': function(t) {
            var e = new Restiq.errors[404]();
            t.equal(e.message, "Not Found");
            t.done();
        },

        'should create app': function(t) {
            var app = Restiq.createServer();
            t.ok(app instanceof Restiq);
            t.done();
        },

        'should create app by function': function(t) {
            var app = Restiq();
            t.ok(app instanceof Restiq);
            t.ok(! app.hasOwnProperty('listen'));
            t.done();
        },

        'should not create app by new': function(t) {
            var app = new Restiq();
            t.expect(3);
            t.ok(app instanceof Restiq);
            t.ok(app.hasOwnProperty('listen'));
            try { app.listen(); t.ok(false); }
            catch (err) { t.ok(true); }
            t.done();
        },
    },

    'restiq mw': {
        'should parse query params': function(t) {
            req = {url: "/echo?a=1&b=2", params: {}};
            t.expect(2);
            Restiq.mw.parseQueryParams(req, {}, function(err) {
                t.ok(!err);
                t.equal(req.params.b, 2);
                t.done();
            });
        },

        'should parse body params (hierarchical and urldecoded)': function(t) {
            req = {url: "/echo?a=1&b=2", body: "c[cc]=3&d%25=%25", _bodyEof: 1, params: {}};
            t.expect(3);
            Restiq.mw.parseBodyParams(req, {}, function(err) {
                t.ok(!err);
                t.equal(req.params.c.cc, 3);
                t.equal(req.params['d%'], '%');
                t.done();
            });
        },

        'should closeResponse with encodeResponseBody': function(t) {
            var res = qmock.getMock({}, ['writeHead', 'end']);
            res.body = {};
            res.expects(qmock.any()).method('getHeader').will(qmock.returnValue(undefined));
            res.expects(qmock.once()).method('end').with("{}");
            t.expect(1);
            Restiq.mw.closeResponse({}, res, function(){
                t.ok(!res.check());
                t.done();
            });
        },

        'should dispose of body': function(t) {
            req = new http.IncomingMessage();
            req.push("Not going to use this");
            req.push(null);
            // Simulating setEncoding since that is not available on the mock.
            t.expect(1);
            Restiq.mw.discardBody(req, {}, function(err) {
                t.ok(!err);
                t.done();
            });
        },

        'should sucessfully read body as a string': function(t) {
            req = new http.IncomingMessage();
            req.restiq = {
                _opts: {}
            };
            req.push("Just some data bro");
            req.push(null);
            t.expect(1);
            Restiq.mw.readBody(req, {}, function(err) {
                t.ok(!err);
                t.done();
            });
        },

        'should fail to parse body due to maxBodySize being exceeded': function(t) {
            req = new http.IncomingMessage();
            req.restiq = {
                _opts: {
                    readBinary: true
                }
            };
            req.push("Just some data bro");
            req.push(null);
            t.expect(2);
            Restiq.mw.buildReadBody({maxBodySize: 1})(req, {}, function(err) {
                t.ok(err);
                t.equal(err.message, 'Error reading body, max request body size exceeded.');
                t.done();
            });
        }
    },

    'restiq app setup': {
        setUp: function(done) {
            this.app = Restiq.createServer();
            done();
        },

        'should start on listen, end on close': function(t) {
            var app = this.app;
            t.expect(2);
            var ok = this.app.listen(21337, function(err) {
                t.ifError(err);
                app.close(function() {
                    t.ok(1);
                    t.done();
                });
            });
        },

        'should reject unmapped routes': function(t) {
            var app = this.app;
            t.expect(2);
            var ok = this.app.listen(21337, function(err) {
                t.ifError(err);
                app.close(function() {
                    t.ok(1);
                    t.done();
                });
            });
        },

        'should have the expected mw and route methods': function(t) {
            var i, expect = ['addStep', 'addRoute', 'removeRoute', 'mapRoute'];
            for (i in expect) {
                t.ok(typeof this.app[expect[i]] === 'function');
            }
            t.done();
        },

        'should add and map route': function(t) {
            var i, methods = ['GET', 'PUT', 'POST', 'DELETE', 'HEAD', 'custom'];
            var j, routes = ['/echo', '/:x/echo'];
            for (i in methods) for (j in routes) {
                this.app.addRoute(methods[i], routes[j], [ function(req, res, next){ next() } ]);
            }
            for (i in methods) for (j in routes) {
                var route = this.app.mapRoute(methods[i], routes[j] + '?a=1&b=2');
                t.ok(route);
                t.equal(route.name, routes[j]);
            }
            t.done();
        },

        'should add route with options': function(t) {
            var route = this.app.addRoute('GET', '/echo', {opt1: 1, opt2: 2}, ['mw-stack']);
            t.equal(route.handlers[0], 'mw-stack');
            t.done();
        },

        'rest routes should extract path params': function(t) {
            this.app.addRoute('GET', '/:x/:y/echo', function(){});
            var route = this.app.mapRoute('GET', '/1/2/echo');
            t.equal(route.vars.x, 1);
            t.equal(route.vars.y, 2);
            t.done();
        },
    },

    'restic app middleware': {
        setUp: function(done) {
            var self = this;
            this.app = Restiq.createServer();
            this.app.addStep(Restiq.mw.closeResponse, 'finally');
            this.httpClient = new HttpClient();
            done();
        },

        'should addStep': function(t) {
            function f1(){}
            function f2(){}
            function f3(){}
            function f4(){}

            // add middleware steps, function first
            this.app.addStep(f1);
            t.equal(this.app._before[0], f1);
            this.app.addStep(f2, 'setup');
            t.equal(this.app._setup[0], f2);
            this.app.addStep(f3, 'after');
            t.equal(this.app._after[0], f3);
            this.app.addStep(f4, 'finally');
            t.equal(this.app._finally.pop(), f4);
            
            // add middleware steps, function last
            this.app.addStep('use', f1);
            t.equal(this.app._before[1], f1);
            this.app.addStep('setup', f2);
            t.equal(this.app._setup[1], f2);
            this.app.addStep('after', f3);
            t.equal(this.app._after[1], f3);
            this.app.addStep('finally', f4);
            t.equal(this.app._finally.pop(), f4);

            // add array of functions
            this.app.addStep('use', [f1, f2, f3]);
            t.equal(this.app._before.pop(), f3);

            // throws on invalid function
            try { this.app.addStep(123); t.fail() }
            catch (err) { t.contains(err.message, "must be a function") }
            try { this.app.addStep(f1, "noplace"); t.fail() }
            catch (err) { t.contains(err.message, "unknown") }

            t.done();
        },

        'should run pre steps': function(t) {
            var app = this.app;
            var httpClient = this.httpClient;
            t.expect(4);
            app.addStep(function(req, res, next){ t.ok(1); next(); }, 'setup');
            app.addRoute('GET', '/echo', [function(req, res, next) { res.end("done"); next() }]);
            app.listen(21337, function(err){
                t.ifError(err);
                httpClient.call('GET', 'http://127.0.0.1:21337/echo', function(err, res) {
                    t.ifError(err);
                    t.equal(res.statusCode, 200);
                    app.close(function(){
                        t.done();
                    });
                });
            });
        },

        'should run steps in order': function(t) {
            // TODO: make createServer mockable
            //var req = qmock.getMock({}, []);
            //var res = qmock.getMock({}, ['end', 'writeHead', 'setHeader', 'getHeader']);
            //var run, app = Restiq.createServer({createServer: function(onConnect){ run = onConnect; }});
            var app = this.app;
            var httpClient = this.httpClient;
            var order = [];
            t.expect(3);
            app.addStep(function(req, res, next){ order.push('finally1'); next(); }, 'finally');
            app.addStep(function(req, res, next){ order.push('after1'); next(); }, 'after');
            app.addStep(function(req, res, next){ order.push('use1'); next(); }, 'use');
            app.addStep(function(req, res, next){ order.push('setup1'); next(); }, 'setup');
            app.addStep(function(req, res, next){ order.push('finally2'); next(); }, 'finally');
            app.addStep(function(req, res, next){ order.push('after2'); next(); }, 'after');
            app.addStep(function(req, res, next){ order.push('use2'); next(); }, 'use');
            app.addStep(function(req, res, next){ order.push('setup2'); next(); }, 'setup');
            app.addRoute('GET', '/echo', [ function(q,s,n){ order.push('app1'); n() }, function(q,s,n){ order.push('app2'); n() } ]);
            app.listen(21337, function(err) {
            //run(req, res, function(err) {
                t.ifError(err);
                httpClient.call('GET', 'http://127.0.0.1:21337/echo', function(err, res) {
                    t.ifError(err);
                    t.deepEqual(order, ['setup1', 'setup2',
                                        'use1', 'use2', 'app1', 'app2',
                                        'after1', 'after2', 'finally1', 'finally2']);
                    app.close();
                    t.done();
                });
            //});
            });
        },
    },
};
