//require('qtimers');

if (process.argv[2] === 'restify' || process.argv[2] === 'emulated' || process.argv[2] === 'emulate') {
    var Framework = (process.argv[2] === 'restify') ? require('restify') : require('../index');
    var app = Framework.createServer({
        name: 'test',
        version: '0.0.0',
        restify: true,
        //readImmediate: 0,
        //readBinary: false,
        debug: 1
    });
    app.use(Framework.queryParser());
    app.get('/echo', function(req, res, next) {
        res.send(req.params);
        next();
    });
    app.get('/:p1/:p2/echo', function(req, res, next) {
        res.send(req.params);
        next();
    });
    app.listen(1337, function(){
        console.log("%s listening on 1337", process.argv[2])
    });

    // wrk -d20s -t2 -c8 'http://localhost:1337/echo?a=1&b=2&c=3'
    // => 4.3k requests / second native restify (both query and query+path params)
    // => 18.2k/s emulated w/ kds compatible restiq (18.6 on first 2s run, then drops)
    // => 14.5k/s emulated w/ 0.2.0
    // => 15.2k/s emulated w/ 0.4.0
    // => 14.2k/s emulated w 0.5.0 (but 15.4 w readBinary:false)
    //    16.3k/s emulated w 0.5.1 binary, read=2
}
else {
    var Restiq = require('../index');
    var app = Restiq.createServer({
        // 0 is faster than 2, 1 messes with gc (uses lots of memory)
        //readBinary: false,
        readImmediate: 0,
        // note: 1 aggravates gc, 0 is nice, 2 is ok
    });
    app.addStep(app.mw.parseQueryParams);
    app.addRoute('GET', '/echo', function(req, res, next) {
        res.writeHead(200, {'Content-Type': 'application/json'}),
        res.end(JSON.stringify(req.params)),
        next();
    });
    app.addRoute('GET', '/:p1/:p2/echo', function(req, res, next) {
        res.writeHead(200, {'Content-Type': 'application/json'}),
        res.end(JSON.stringify(req.params)),
        next();
    });
    app.listen(1337, function(){
        console.log("Restiq listening on 1337")
    });

    // wrk -d20s -t2 -c8 'http://localhost:1337/echo?a=1&b=2&c=3'
    // => 20.0k requests / second sT, 17k/s on'data'
    // => 20.9k/s 0.5.1 sT, 17.9k/s on'data'
}
