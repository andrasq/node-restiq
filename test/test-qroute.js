'use strict';

var QRoute = require('../lib/qroute');

module.exports = {
    setUp: function(done) {
        this.cut = new QRoute();
        done();
    },

    'should add and get route': function(t) {
        var route = this.cut.addRoute('/echo', ['mw-stack']);
        var route2 = this.cut.mapRoute("/echo?a=1");
        t.ok(route2._route === route, "mapped _route differs from the added route");
        t.done();
    },

    'mapped route should have path, name, tail': function(t) {
        var route = this.cut.addRoute('/echo', ['mw-stack']);
        var route2 = this.cut.mapRoute("/echo?a=1");
        t.equal(route2.path, "/echo");
        t.equal(route2.name, '/echo');
        t.equal(route2.tail, "a=1");
        t.done();
    },

    // TODO: write tests
};
