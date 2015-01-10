/**
 * Quick REST route mapping and lookup
 *
 * 2015-01-08 - AR.
 */

'use strict';

module.exports = QRoute;

function QRoute( ) {
    this._literals = {};
    this._patterns = new Array();
}

/**
 * register the handlers associated with the route routeName
 */
QRoute.prototype.addRoute = function addRoute( routeName, handlers ) {
    if (routeName.indexOf("/:") < 0) {
        this._literals[routeName] = {name: routeName, handlers: handlers};
    }
    else {
        var match = this._buildCapturingRegex(routeName);
        this._patterns.push({name: routeName, handlers: handlers, patt: match.patt, names: match.names});
    }
};

/**
 * look up the added route matching routeName
 */
QRoute.prototype.mapRoute = function mapRoute( routeName ) {
    var i, route;
    var tail = "", qmark = routeName.indexOf('?');
    if (qmark >= 0) { tail = routeName.slice(qmark+1); routeName = routeName.slice(0, qmark); }
    if ((route = this._literals[routeName])) {
        return {
            path: routeName,
            name: route.name,
            tail: tail,
            vars: {},
            handlers: route.handlers,
            _type: 'lit'
        };
        return {path: routeName, name: route.name, tail: tail, vars: {}, handlers: route.handlers, _type: 'lit'};
    }
    var patterns = this._patterns;
    for (i=0; i<patterns.length; i++) {
        var j, match, vars = {};
        if ((match = routeName.match(patterns[i].patt))) {
            var names = patterns[i].names;
            for (j=0; j<names.length; j++) vars[names[j]] = match[j+1];
            return {
                path: routeName,
                name: patterns[i].name,
                tail: match[j+1],
                vars: vars,
                handlers: patterns[i].handlers,
                _type: 'patt'
            };
            return {path: routeName, name: patterns[i].name, tail: match[j+1], vars: vars, handlers: patterns[i].handlers, _type: ''};
        }
    }
    return undefined;
};

/**
 * build a regex to match the routeName and extract any /:param parameters
 */
QRoute.prototype._buildCapturingRegex = function _buildCapturingRegex( routeName ) {
    var match, names = new Array();
    var pattern = "^";
    while ((match = routeName.match(/\/:[^/]*/))) {
        if (match.index > 0) pattern += this._regexEscape(routeName.slice(0, match.index));
        pattern += '\/([^/]*)';
        names.push(match[0].slice(2));
        routeName = routeName.slice(match.index + match[0].length);
    }
    pattern += this._regexEscape(routeName);
    // the route matches if the query string ends here or continues only past / or ?
    pattern += "([/?].*)?$";
    return {patt: new RegExp(pattern), names: names};
};

/**
 * backslash-escape the chars that have special meaning in regex strings
 */
QRoute.prototype._regexEscape = function _regexEscape( str ) {
    // For PCRE or POSIX, the regex metacharacters are:
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
f.addRoute('GET::/foo/bar', 1);
f.addRoute('POST::/:kid/b]ar/:collection/:op', 2);
console.log(f.mapRoute('POST::/kid/b]ar/collection/op/zed?a=1'));

//timeit(100000, function(){ f.mapRoute('POST::/foo/bar') });

timeit(100000, function(){ f.mapRoute('GET::/foo/bar') });
// 3m/s (2.6m/s node-v0.11.13)
// (but only 1.4m/s if mapped w/ regex... => regex param capturing is free)
// 19.5m/s without the routeName string concat !!

timeit(100000, function(){ f.mapRoute('POST::/kid/bar/collection/op') });
// 1.47m/s (single regex) (1.53m/s node-v0.11.13)
// ...ie, 50 routes is at most 27k requests mapped / sec (so mapped routes *halve* the service rate)
// 4m/s without the routeName string concat !!
// to avoid concat: have caller create an array of QRoute mappers, one per GET,POST etc method

//console.log(f);

/**/
