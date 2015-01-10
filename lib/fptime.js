try {
    module.exports = require('arlib/fptime');
    return;
}
catch (err) {
    // catch the "not found" error and explicitly return, to prevent a memory leak
    module.exports = function(){ var t = process.hrtime(); return t[0] + t[1] * 1e-9; };
    return;
}
