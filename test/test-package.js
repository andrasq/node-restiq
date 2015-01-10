module.exports = {
    'should parse package.json': function(t) {
        var json = require('../package.json');
        t.equal(json.name, "restiq");
        t.done();
    },
};
