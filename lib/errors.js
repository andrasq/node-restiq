'use strict';

var util = require('util');
var http = require('http');


for (var i in http.STATUS_CODES) {
    var name = 'Error' + http.STATUS_CODES[i].replace(/ /g, '');
    module.exports[name] = makeError(i, http.STATUS_CODES[i]);
}


function makeError(code, message) {
    function e() {
        Error.call(this);
        Error.captureStackTrace(this, this.constructor);
        this.code = code;
        this.message = message;
    }
    util.inherits(e, Error);
    return e;
}
