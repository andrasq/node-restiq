/**
 * http error builder
 * for each http error eg 404 Not Found creates a new error class
 * ErrorNotFound with err.code = 404 and default message
 *
 * Copyright (C) 2015,2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var util = require('util');
var http = require('http');


for (var statusCode in http.STATUS_CODES) {
    var label = http.STATUS_CODES[statusCode].replace(/[^a-zA-Z0-9_]/g, '');
    var name = 'Error' + label;
    module.exports[name] = makeError(name, statusCode, label, http.STATUS_CODES[statusCode]);
    module.exports[statusCode] = module.exports[name];
}

// restify compat errors
// module.exports['InvalidCredentialsError'] = makeError('InvalidCredentialsError', 401, 'InvalidCredentials', http.STATUS_CODES[401]);
module.exports.InvalidCredentialsError = function InvalidCredentialsError( parts ) {
    var err = new Error();
    err.statusCode = 401;
    err.statuscode = 'InvalidCredentials';
    err.body = {
        code: 'InvalidCredentials',
        message: 'InvalidCredentials',
    }
    if (parts && parts.message !== undefined) err.message = parts.message;
    for (var k in parts) err.body[k] = parts[k];
    return err;
}

function escapeQuotes( str ) {
    return str.replace('\\', '\\\\').replace('\'', '\\\'');
}

function makeError( name, code, label, message ) {
    // build a new Error constructor of the given name, have it inherit from Error
    // use eval() to give each error class a unique name (eval binds to scope)
    var builder =
        "function " + name + "(umsg) {\n" +
        "    Error.call(this, umsg || '" + escapeQuotes(message) + "');\n" +
        "    Error.captureStackTrace(this, this.constructor);\n" +
        "    this.code = code;\n" +
        "    this.statusCode = code;\n" +               // restify compat
        "    this.statuscode = '" + label + "';\n" +    // restify compat
        "    // work around the message not being set by Error.call()\n" +
        "    this.message = umsg || '" + escapeQuotes(message) + "';\n" +
        "}\n" +
        "util.inherits(" + name + ", Error);\n" +
        "" + name + ";\n" +
        "";
    var func = eval(builder);
    return func;
}
