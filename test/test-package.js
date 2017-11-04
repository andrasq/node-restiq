/**
 * Copyright (C) 2015,2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

module.exports = {
    'should parse package.json': function(t) {
        var json = require('../package.json');
        t.equal(json.name, "restiq");
        t.done();
    },
};
