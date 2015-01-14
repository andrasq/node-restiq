var Restiq = require('../index');

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
            t.done();
        },

        'should expose errors': function(t) {
            t.ok(Restiq.errors);
            t.ok(Restiq.errors['405']);
            var e = new Restiq.errors[405]("msg");
            t.ok(e.code);
            t.ok(e.message);
            // TODO: this fails:
            // t.equal(e.message, 'msg');
            t.ok(e.stack);
            t.done();
        },

        'should have restify-compat methods': function(t) {
            t.equal(typeof Restiq.bodyParser, 'function');
            t.equal(typeof Restiq.queryParser, 'function');
            t.done();
        },

        'should create app': function(t) {
            var app = Restiq.createServer();
            t.ok(app instanceof Restiq);
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
    },

    'restiq app': {
        setUp: function(done) {
            this.app = Restiq.createServer();
            done();
        },

        'should start on listen, end on close': function(t) {
            var app = this.app;
            t.expect(1);
            var ok = this.app.listen(21337, function(err) {
                app.close(function() {
                    t.ok(1);
                    t.done();
                });
            });
        },

        'should have expected mw add methods': function(t) {
            var i, expect = ['addRoute', 'mapRoute', 'pre', 'use', 'after', 'finally', 'get', 'put', 'post', 'del'];
            for (i in expect) {
                t.ok(typeof this.app[expect[i]] === 'function');
            }
            t.done();
        },

        'should add and map route': function(t) {
            var i, methods = ['GET', 'PUT', 'POST', 'DEL'];
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

        'rest routes should extract path params': function(t) {
            this.app.addRoute('GET', '/:x/:y/echo', function(){});
            var route = this.app.mapRoute('GET', '/1/2/echo');
            t.equal(route.vars.x, 1);
            t.equal(route.vars.y, 2);
            t.done();
        },
    },
};
