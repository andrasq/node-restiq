var assert = require('assert');
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
};
