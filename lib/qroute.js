/**
 * Quick REST route mapping and lookup
 *
 * 2015-01-08 - AR.
 */

'use strict';

module.exports = QRoute;

function QRoute( ) {
    this._paths = {};
    this._patterns = new Array();
}

QRoute.prototype.addRoute = function addRoute( method, path, handler ) {
    var tag = method.toUpperCase() + "::" + path;
    if (path.indexOf("/:") < 0) {
        this._paths[tag] = {route: path, fn: handler};
    }
    else {
        var match = this._buildCapturingRegex(tag);
        this._patterns.push({route: path, fn: handler, patt: match.patt, names: match.names});
    }
};

QRoute.prototype.mapRoute = function mapRoute( method, path ) {
    var i, tag = method.toUpperCase() + "::" + path;
    var route;
    if ((route = this._paths[tag])) {
        return {query: path, route: route.route, vars: {}, fn: route.fn};
    }
    var patterns = this._patterns;
    for (i=0; i<patterns.length; i++) {
        var j, match, vars = {};
        if ((match = tag.match(patterns[i].patt))) {
            var names = patterns[i].names;
            for (j=0; j<names.length; j++) vars[names[j]] = match[j+1];
            return {query: path, route: patterns[i].route, tail: match[j+1], vars: vars, fn: patterns[i].fn};
        }
    }
    return undefined;
};

QRoute.prototype._buildCapturingRegex = function _buildCapturingRegex( tag ) {
    var match, names = new Array();
    var pattern = "^";
    while ((match = tag.match(/\/:[^/]*/))) {
        if (match.index > 0) pattern += this._regexEscape(tag.slice(0, match.index));
        pattern += '\/([^/]*)';
        names.push(match[0].slice(2));
        tag = tag.slice(match.index + match[0].length);
    }
    pattern += "(.*)$";
    return {patt: new RegExp(pattern), names: names};
};

QRoute.prototype._regexEscape = function _regexEscape( str ) {
    // \-escape all chars that have special meaning in regex strings
    // For PCRE or POSIX, they are:
    //   . [ (          - terms
    //   * + ? {        - repetition specifiers
    //   |              - alternation
    //   \              - escape char
    //   ^ $            - anchors
    //   )              - close paren (else invalid node regex)
    // Matching close chars ] } are not special without the open char.
    // / and is not special in a regex, it matches a literal /.
    // : and = are not special outside of [] ranges or (?) conditionals.
    // ) has to be escaped always, else results in "invalid regex"
    return str.replace(/([.[(*+?{|\\^$=)])/g, '\\$1');
};


// quickest:
/**

var timeit = require('./timeit');

var f = new QRoute();
f.addRoute('GET', '/foo/bar', 1);
f.addRoute('POST', '/:kid/b]ar/:collection/:op', 2);
console.log(f.mapRoute('POST', '/kid/b]ar/collection/op/zed?a=1'));

//timeit(100000, function(){ f.mapRoute('POST', '/foo/bar') });

timeit(100000, function(){ f.mapRoute('GET', '/foo/bar') });
// 3m/s (2.6m/s node-v0.11.13)
// (but only 1.4m/s if mapped w/ regex... => regex param capturing is free)

timeit(100000, function(){ f.mapRoute('POST', '/kid/bar/collection/op') });
// 1.47m/s (single regex) (1.53m/s node-v0.11.13)
// ...ie, 50 routes is at most 27k requests mapped / sec (so mapped routes *halve* the service rate)

//console.log(f);

/**/
