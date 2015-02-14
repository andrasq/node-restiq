var http = require('http');
var HttpClient = require('../http-client');
var EventEmitter = require('events').EventEmitter;

module.exports = {
    setUp: function(done) {
        this.client = new HttpClient( { setNoDelay: true } );
        done();
    },

    'call should return request': function(t) {
        var req = this.client.call('GET', "http://localhost:80", function(err, res) { });
        t.ok(req instanceof http.ClientRequest);
        t.done();
    },

    'response should include Buffer body': function(t) {
        t.expect(3);
        var req = this.client.call('GET', "http://localhost:80", function(err, res) {
            t.ifError(err);
            t.ok(res.body);
            t.ok(Buffer.isBuffer(res.body));
            t.done();
        });
    },

    'should return error on connect error': function(t) {
        this.client.call('GET', "http://localhost:1", function(err, res) {
            t.ok(err);
            t.done();
        });
    },

    'should return error on transmission error': function(t) {
        // TODO: fake it?
        t.done();
    },

    'should assemble response from chunks': function(t) {
        var req = new EventEmitter();
        req.end = function(data) { }
        var res = new EventEmitter();
        setTimeout(function(){ res.emit('data', new Buffer("a")) }, 1);
        setTimeout(function(){ res.emit('data', new Buffer("b")) }, 2);
        setTimeout(function(){ res.emit('data', new Buffer("c")) }, 3);
        setTimeout(function(){ res.emit('end') }, 3);
        var client = new HttpClient({request: function(options, cb) { cb(res); return req; }});
        client.call('GET', "http://localhost", function(err, cres) {
            t.equal(res, cres);
            t.equal("abc", res.body.toString());
            t.done();
        });
    },

    'should reject two-argument form': function(t) {
        var ok = false;
        try { this.client.call("http://localhost:80", function(err, res) { }); }
        catch (err) { ok = true; }
        t.ok(ok);
        t.done();
    },

    'should require a function callback': function(t) {
        var ok = false;
        try { this.client.call('GET', "http://localhost:80", "body"); }
        catch (err) { ok = true; }
        t.ok(ok);
        t.done();
    },

    'restify emulation': {
        setUp: function(done) {
            HttpClient.emulateRestifyClient(this.client);
            done();
        },

        'should expose get/post methods': function(t) {
            var methods = ['get', 'post', 'put', 'del'];
            for (var i in methods) t.equal(typeof this.client[methods[i]], 'function');
            t.done();
        },

        'should return err,req,res,obj in callback': function(t) {
            t.expect(3);
            this.client.get("http://localhost:80", function(err, req, res, obj) {
                t.ok(req instanceof http.ClientRequest);
                t.ok(res instanceof http.IncomingMessage);
                t.ok(obj);
                t.done();
            });
        },
    },
};