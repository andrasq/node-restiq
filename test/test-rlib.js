/**
 * Copyright (C) 2015,2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

if (process.argv[1].indexOf('nodeunit') >= 0 || process.argv[1].indexOf('qnit') >= 0) return;

var http = require('http');
var qmock = require('qnit').qmock;

var rlib = require('../lib/rlib');

module.exports = {
    setUp: function(done) {
        this.getMockReq = function getMockReq(url) {
            var req = new http.IncomingMessage(url);
            req.restiq = { _opts: {} };
            return req;
        };
        this.getMockRes = function getMockRes(req) {
            var res = new http.ServerResponse(req);
            return res;
        };
        this.mockReq = this.getMockReq("http://localhost:80");
        this.mockRes = this.getMockRes(this.mockReq);
        done();
    },

    tearDown: function(done) {
        qmock.unmockHttp();
        done();
    },

    'skipBody': {
        'should clear body and set _bodyEof': function(t) {
            var req = this.mockReq, res = this.mockRes;
            rlib.skipBody(res, res);
            t.equal(res.body, "");
            t.equal(res._bodyEof, true);
            t.done();
        },
    },

    'parseAuthorization': {
        'should parse Authorization header': function(t) {
            this.mockReq.headers['authorization'] = "Basic " + new Buffer("user123:pass456").toString('base64');
            rlib.parseAuthorization(this.mockReq, this.mockRes);
            t.equal(this.mockReq.username, "user123");
            t.deepEqual(this.mockReq.authorization, { basic: { username: "user123", password: "pass456" } });
            t.done();
        }
    },

    'readBody': {
        setUp: function(done) {
            this.testReadBody = function testReadBody( chunks, cb ) {
                var req = this.mockReq, res = this.mockRes;
                for (var i=0; i<chunks.length; i++) req.push(new Buffer(chunks[i]));
                req.push(null);
                rlib.readBody(req, res, function(err) {
                    cb(err, req, res);
                })
            }
            done();
        },

        'should expose methods': function(t) {
            t.equal(typeof rlib.readBody, 'function');
            t.done();
        },

        'should concatenate and return body': function(t) {
            var req = this.mockReq, res = this.mockRes;
            setTimeout(function(){ req.emit('data', new Buffer("test")) }, 2);
            setTimeout(function(){ req.emit('data', new Buffer("message")) }, 3);
            setTimeout(function(){ req.emit('end') }, 4);
            rlib.readBody(req, res, function(err) {
                t.equal(req.body, "testmessage");
                t.done();
            })
        },

        'should concatenate and return raw body from multiple chunks': function(t) {
            this.mockReq.restiq._opts.readBinary = true;
            this.testReadBody(["test", "message"], function(err, req, res) {
                t.ok(Buffer.isBuffer(req.body));
                t.equal(req.body.toString(), "testmessage");
                t.done();
            })
        },

        'should concatenate and return empty body from one chunk': function(t) {
            this.mockReq.restiq._opts.readBinary = true;
            this.testReadBody(["testmessage"], function(err, req, res) {
                t.equal(req.body.toString(), "testmessage");
                t.done();
            })
        },

        'should concatenate and return empty body from zero chunks': function(t) {
            this.mockReq.restiq._opts.readBinary = true;
            var req = this.mockReq;
            this.testReadBody([], function(err, req, res) {
                t.ok(Buffer.isBuffer(req.body));
                t.equal(req.body.toString(), "");
                t.done();
            })
        },

        'should concatenate and return body reading stream with a setTimeout loop': function(t) {
            var req = this.mockReq;
            req.restiq._opts.readImmediate = 0;
            rlib.readBody(req, this.mockRes, function(err) {
                t.ok(!err);
                t.equal(req.body.toString(), "testmessage");
                t.done();
            })
            req.push(new Buffer("test"));
            req.push(new Buffer("message"));
            req.push(null);
        },

        'should concatenate and return body reading stream with a setImmedate loop': function(t) {
            var req = this.mockReq;
            req.restiq._opts.readImmediate = 1;
            rlib.readBody(req, this.mockRes, function(err) {
                t.ok(!err);
                t.equal(req.body.toString(), "testmessage");
                t.done();
            })
            req.push(new Buffer("test"));
            req.push(new Buffer("message"));
            req.push(null);
        },

        'should return only once': function(t) {
            var ncalls = 0;
            rlib.readBody(this.mockReq, this.mockRes, function() {
                ncalls += 1;
            })
            this.mockReq.emit('end');
            this.mockReq.emit('end');
            setTimeout(function() {
                t.equal(ncalls, 1);
                t.done();
            }, 2);
        },

        'errors': {
            'should return immediately without setting _bodyEof if already reading': function(t) {
                var req = this.mockReq;
                req._bodyEof = "yes";
                rlib.readBody(this.mockReq, this.mockRes);
                rlib.readBody(this.mockReq, this.mockRes, function(err) {
                    t.strictEqual(req._bodyEof, "yes");
                    t.done();
                })
            },

            'should return socket error': function(t) {
                this.mockReq.restiq._opts.debug = true;
                rlib.readBody(this.mockReq, this.mockRes, function(err) {
                    t.ok(err);
                    t.ok(err.message.indexOf("deliberate error") > 0);
                    t.done();
                })
                this.mockReq.emit('error', new Error("deliberate error"));
            },

            'should fail if larger than maxBodySize': function(t) {
                var readBody = rlib.buildReadBody({ maxBodySize: 5 });
                readBody(this.mockReq, this.mockRes, function(err) {
                    t.ok(err);
                    t.ok(err.message.indexOf(" max ") > 0);
                    t.done();
                })
                this.mockReq.emit('data', "testmessage");
                t.done();
            },
        },
    },
}
