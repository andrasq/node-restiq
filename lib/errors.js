/**
 * http error builder
 * for each http error eg 404 Not Found creates a new error class
 * ErrorNotFound with err.code = 404 and default message
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var util = require('util');
var http = require('http');


for (var i in http.STATUS_CODES) {
    var name = 'Error' + http.STATUS_CODES[i].replace(/[^a-zA-Z0-9_]/g, '');
    module.exports[name] = makeError(name, i, http.STATUS_CODES[i]);
    module.exports[i] = module.exports[name];
}


function makeError(name, code, message) {
    // build a new Error constructor of the given name, have it inherit from Error
    // use eval() to give each error class a unique name (eval binds to scope)
    var builder = 
        "function " + name + "(umsg) {\n" +
        "    Error.call(this, message);\n" +            // ? message not set ?
        "    Error.captureStackTrace(this, this.constructor);\n" +
        "    this.code = code;\n" +
        "    this.statusCode = code;\n" +               // restify compat
        "    this.message = umsg ? umsg : message;\n" +
        "}\n" +
        "util.inherits(" + name + ", Error);\n" +
        "" + name + ";\n" +
        "";
    return eval(builder);
}
