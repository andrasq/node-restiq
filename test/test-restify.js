/**
 * Copyright (C) 2015,2017-2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var assert = require('assert');
var http = require('http');
var Restiq = require('../index');
var qrestify = require('../lib/qrestify');

module.exports = {
    setUp: function(done) {
        this.app = new Restiq({restify: true});
        this.getMockReq = function getMockReq(url) {
            var req = new http.IncomingMessage(url);
            req.restiq = { _opts: {} };
            return req;
        };
        this.getMockRes = function getMockRes(req) {
            var res = new http.ServerResponse(req);
            return res;
        };
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

    'should decorate restiq app with routing methods': {
        'pre, use should invoke addStep': function(t) {
            var app = Restiq({ restify: true });

            var spy = t.spy(app, 'addStep');
            app.pre(function(req, res, next) { });
            app.use(function(req, res, next) { });
            t.equal(spy.callCount, 2);

            t.done();
        },

        'http methods should invoke _addRestifyRoute': function(t) {
            var app = Restiq({ restify: true });

            var spy = t.spy(app, '_addRestifyRoute');
            app.get('/test', function(req, res, next) { });
            app.put('/test', function(req, res, next) { });
            app.post('/test', function(req, res, next) { });
            app.del('/test', function(req, res, next) { });
            app.head('/test', function(req, res, next) { });
            app.opts('/test', function(req, res, next) { });
            app.patch('/test', function(req, res, next) { });
            t.equal(spy.callCount, 7);

            t.done();
        },
    },

    'should decorate res': {
        'with send': {
            'should set res._body': function(t) {
                var req = this.getMockReq('/test');
                var res = this.getMockRes(req);
                qrestify.addRestifyMethodsToReqRes({}, res);
                res.send(201, { x: 202 }, { 'Content-Type': 'text/plain' });
                assert.equal(res.statusCode, 201);
                assert.deepEqual(res._body, { x: 202 });
                assert.deepEqual(res.header('Content-Type'), 'text/plain');
                t.done();
            },
        },
    },
};
