/**
 * Copyright (C) 2015,2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

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

    'route should capture path parameters': function(t) {
        this.cut.addRoute('/:entity/get/:field', ['mw-stack']);
        var route = this.cut.mapRoute('/database1/get/table2?a=1');
        t.deepEqual(route.vars, { entity: 'database1', field: 'table2' });
        t.done();
    },

    'removeRoute': {
        'should remove route': function(t) {
            var route = this.cut.addRoute('/echo', ['mw-stack']);
            t.equal(this.cut.mapRoute('/echo')._route, route);
            this.cut.removeRoute(route);
            t.equal(this.cut.mapRoute('/echo'), null);
            t.done();
        },

        'should remove mapped route': function(t) {
            this.cut.addRoute('/echo', ['mw-stack']);
            var mappedRoute = this.cut.mapRoute('/echo');
            t.equal(mappedRoute.type, 'mappedRoute');
            this.cut.removeRoute(mappedRoute);
            t.equal(this.cut.mapRoute('/echo'), null);
            t.done();
        }

    },

    // TODO: write tests
};
