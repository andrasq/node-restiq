/**
 * Copyright (C) 2015,2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var errors = require('../lib/errors');

module.exports = {
    'should export 401 error': function(t) {
        t.ok(errors.ErrorUnauthorized);
        t.equal(errors[401], errors.ErrorUnauthorized);
        var err = new errors[401]();
        t.equal(err.statusCode, 401);
        t.equal(err.message, 'Unauthorized');
        t.done();
    },

    'should export InvalidCredentialsError': function(t) {
        t.ok(errors.InvalidCredentialsError);
        var err = new errors.InvalidCredentialsError();
        t.equal(err.statusCode, 401);
        t.deepEqual(err.body, { code: 'InvalidCredentials', message: 'InvalidCredentials' });
        t.done();
    },
}
