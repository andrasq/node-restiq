/**
 * Copyright (C) 2015,2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var assert = require('assert');
var http = require('http');
var Restiq = require('../index');

module.exports = {
    setUp: function(done) {
        this.app = new Restiq({restify: true});
        done();
    },

    'should create a restify mimic app': function(t) {
        var app = new Restiq({restify: true});
        t.done();
    },

    'should set app._emulateRestify': function(t) {
        var app1 = new Restiq({});
        var app2 = new Restiq({ restify: true });
        t.ok(!app1._emulateRestify);
        t.equal(app2._emulateRestify, true);
        t.done();
    },

    'should expose restify route creation calls': function(t) {
        var methods = ['get', 'put', 'post', 'del'];
        for (var i in methods) t.ok(this.app[methods[i]]);
        t.done();
    },

    'should expose restify middleware insert calls': function(t) {
        var methods = ['pre', 'use'];
        for (var i in methods) t.ok(this.app[methods[i]]);
        t.done();
    },

    'class should expose restify middleware library calls': function(t) {
        var methods = ['queryParser', 'bodyParser', 'authorizationParser'];
        for (var i in methods) t.ok(Restiq[methods[i]]);
        t.done();
    },

    'should have restify-compat mw and route methods': function(t) {
        var i, expect = ['pre', 'use', 'get', 'put', 'post', 'del'];
        for (i in expect) {
            t.ok(typeof this.app[expect[i]] === 'function');
        }
        t.done();
    },

    'should have restify-compat methods': function(t) {
        t.equal(typeof Restiq.bodyParser, 'function');
        t.equal(typeof Restiq.queryParser, 'function');
        t.done();
    },
};
