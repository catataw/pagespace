var express = require('express');
var path = require('path')
var theApp = require('./src/index');
var bodyParser = require('body-parser');
var session = require("express-session")

var app = express();

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/bower_components',  express.static(__dirname + '/bower_components'));
app.use('/favicon.ico', express.static(path.join(__dirname, 'favicon.ico')));
app.use(bodyParser.json());
app.use(session({secret: 'keyboard cat'}));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use('/app/static', express.static(path.join(__dirname, 'views/static')));
app.use(theApp({
    templatesDir: path.join(__dirname, 'templates'),
    viewBase: path.join(__dirname, 'views')
}));

/// catch 404 and forwarding to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
/*app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});*/

app.listen(9999);

module.exports = app;