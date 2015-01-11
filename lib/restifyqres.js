/**
 * given an http.ServerResponse, mimic a restify response
 */

'use strict';

module.exports = RestifyqRes;

//var http = require('http');
//var util = require('util');
//var EventEmitter = require('events').EventEmitter;

// TODO: delegate all http methods, all restify methods
function RestifyqRes( res ) {
    // EventEmitter.call(this);
    this.statusCode = res.statusCode;
    this.sendDate = res.sendDate;
    this.headersSent = res.headersSent;
    this._res = res;
    var self = this;
    // NOTE: original http.ServerResponse is an event emitter
    // NOTE: original http.ServerResponse is also a WritableStream
}
// util.inherits(RestifyqRes, EventEmitter)
// util.inherits(RestifyqRes, http.ServerResponse)

// ----------------------------------------------------------------
// restify.res methods
// TODO: these are just a few, should emulate all

RestifyqRes.prototype.send = function(statusCode, object) {
    if (!object && typeof statusCode !== 'number') { object = statusCode; statusCode = 200; }
    this._res.writeHead(statusCode, {'Content-Type': 'application/json'});
    var ret = this._res.end(JSON.stringify(object));
    this.headerSent = this._res.headersSent;
    return ret;
};

RestifyqRes.prototype.header = function(name, value) {
    this._res.setHeader(name, value);
};

RestifyqRes.prototype.writeHead = function(statusCode, reasonPhrase, headers) {
    this._res.statusCode = this.statusCode;
    this._res.sendDate = this.sendDate;
    var ret = this._res.writeHead(statusCode, reasonPhrase, headers);
    this.headerSent = this._res.headersSent;
    return ret;
};
// writeHeader is an alias for writeHead
RestifyqRes.prototype.writeHeader = RestifyqRes.prototype.writeHead;

RestifyqRes.prototype.end = function(data) {
    this._res.statusCode = this.statusCode;
    this._res.sendDate = this.sendDate;
    var ret = this._res.end(data);
    this.headerSent = this._res.headersSent;
    return ret;
};

RestifyqRes.prototype.write = function(chunk, encoding) {
    this._res.statusCode = this.statusCode;
    this._res.sendDate = this.sendDate;
    var ret = this._res.write(chunk, encoding);
    this.headersSent = this._res.headersSent;
    return ret;
};

// ----------------------------------------------------------------
// some other http.ServerResponse methods

if (0) {

RestifyqRes.prototype.setHeader = function(name, value) {
    this._res.setHeader(name, value);
};

RestifyqRes.prototype.getHeader = function(name) {
    this._res.getHeader(name);
};

RestifyqRes.prototype.removeHeader = function(name) {
    this._res.removeHeader(name);
};

RestifyqRes.prototype.addTrailers = function(headers) {
    return this._res.addTrailers(headers);
};

}
