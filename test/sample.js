if (process.argv[1].indexOf('nodeunit') >= 0 || process.argv[1].indexOf('qnit') >= 0) return;

require('qtimers')

// sample Restiq app

var cluster = require('cluster');
var Restiq = require('../index');

echoStack = [
    //Restiq.mw.parseQueryParams,
    //Restiq.mw.readBody,
    //Restiq.mw.parseBodyParams,
    //Restiq.mw.skipBody,
    function(req, res, next) {
        res.writeHeader(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(req.params));
        next();
    }
];

if (0 && cluster.isMaster) {
    cluster.fork();
    cluster.fork();
    cluster.fork();
//    cluster.fork();
}
else {
    var app = Restiq.createServer({
        //debug: 1,
        //setNoDelay: true,
        //readImmediate: 2,
        //readBinary: true,
    });
    app.addStep(app.mw.parseQueryParams);
    //app.pre(Restiq.mw.skipBody);
    //app.pre(app.mw.readBody);
    //app.pre(app.mw.parseBodyParams);
    app.addRoute('GET', '/echo', echoStack);
    app.addRoute('POST', '/echo', echoStack);
    // 18.8k/s static routes w/ 5 url query params
    // wrk -d20s -t2 -c8
    // => 0.2.0: 19.1k/s (but 0.2.0 was buggy)
    // => 0.3.0: 19.3k/s utf8, 18.2k/s binary 5 query params
    // => 0.4.0: 19.6k/s utf8
    // 20.5k/s static routes w/ 5 query params, skipped body (...why not closer to 27k/s?)
/**
app.addRoute('GET', '/:parm1/:parm2/echo1', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo2', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo3', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo4', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo5', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo6', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo7', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo8', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo9', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo10', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo11', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo12', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo13', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo14', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo15', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo16', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo17', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo18', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo19', echoStack);
app.addRoute('GET', '/:parm1/:parm2/echo20', echoStack);
**/
    app.addRoute('GET', '/:parm1/:parm2/echo', echoStack);
//    app.addRoute('POST', '/:parm1/:parm2/echo', echoStack);
    // 20.3k/s parametric routes (2 parametric, no echo)
    // => 0.5.0 21.7k/s 2 path params, no echo
    // 17.7k/s 2 parametric + 5 echo
    //app.addRoute('GET', '/echo2/:parm1/:parm2/:parm3/:parm4/:parm5', echoStack);
    app.addRoute('GET', '/:parm1/:parm2/:parm3/:parm4/:parm5/echo', echoStack);
    app.addRoute('POST', '/:parm1/:parm2/:parm3/:parm4/:parm5/echo', echoStack);
    // 19.3k/s 5 path params w/o any query params
    // 16.7k/s 5 path params + 5 query params
    // => 0.3.0: 20.0k/s 5 path params w/o query params (strings)
    // => 0.5.0: 17.3k/s 5 path params w 5 query params

    app.listen(1337);
    console.log("Server listening on 1337");
}
