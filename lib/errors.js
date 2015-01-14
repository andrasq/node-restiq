'use strict';

var util = require('util');
var http = require('http');


for (var i in http.STATUS_CODES) {
    var name = 'Error' + http.STATUS_CODES[i].replace(/ /g, '');
    module.exports[name] = makeError(i, http.STATUS_CODES[i]);
    module.exports[i] = module.exports[name];
}


function makeError(code, message) {
    function RestiqError() {
        this.code = code;
        this.message = message;
        Error.call(this);
        Error.captureStackTrace(this, this.constructor);
    }
    util.inherits(RestiqError, Error);
    return RestiqError;
}
