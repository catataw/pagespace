/**
 * Copyright © 2015, Philip Mander
 *
 * This file is part of Pagespace.
 *
 * Pagespace is free software: you can redistribute it and/or modify
 * it under the terms of the Lesser GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Pagespace is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * Lesser GNU General Public License for more details.

 * You should have received a copy of the Lesser GNU General Public License
 * along with Pagespace.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

//support
var passport = require('passport'),
    async = require('async'),
    psUtil = require('../misc/pagespace-util');


var LoginHandler = function(support) {
    this.logger = support.logger;
    this.reqCount = 0;
};

module.exports = function(support) {
    return new LoginHandler(support);
};

LoginHandler.prototype.doRequest = function(req, res, next) {

    var logger = psUtil.getRequestLogger(this.logger, req, 'login', ++this.reqCount);

    logger.info('New login request');

    if(req.method === 'GET') {
        var doNext = function(err) {
            if(err) {
                return next(err);
            } else {
                var data = {
                    badCredentials: psUtil.typeify(req.query.badCredentials) || false
                };
                if(req.headers.accept && req.headers.accept.indexOf('application/json') === -1) {
                    return res.render('login.hbs', data, function(err, html) {
                        if(err) {
                            logger.error(err, 'Trying to render login');
                            next(err);
                        } else {
                            logger.info('Sending login page');
                            res.send(html);
                        }
                    });
                } else {
                    return res.json({
                        message: res.status === 403 ?
                            'You are not authorized to access this resource' :
                            'You must login to access this resource'
                    });

                }
            }
        };

        return passport.authenticate('remember-me', function(err, user) {
            if (err) {
                return next(err);
            }
            req.logIn(user, function(err) {
                if (err) {
                    logger.warn(err, 'Error authenticating user with remember me');
                    return next(err);
                } else {
                    logger.info('User authenticated with remember me: %s', user.username);
                    return res.redirect(req.session.loginToUrl);
                }
            });
        })(req, res, doNext);
    } else if(req.method === 'POST') {
        return passport.authenticate('local', function(err, user) {
            if (err) {
                return next(err);
            }
            if (!user) {
                return res.redirect('/_login?badCredentials=true');
            }
            async.series([
                function(callback) {
                    if (req.body.remember_me) {
                        user.rememberToken = user.generateToken();
                        user.save(function(err) {
                            if (err) {
                                callback(err);
                            } else {
                                callback(null, user.rememberToken);
                            }
                        });
                    } else {
                        callback();
                    }
                },
                function(callback) {
                    req.logIn(user, function(err) {
                        if (err) {
                            callback(err);
                        } else {
                            callback();
                        }
                    });
                }
            ], function(err, results) {
                if(err) {
                    logger.info('User logged failed');
                    return next(err);
                } else {
                    logger.info('User logged in OK');
                    if(results[0]) {
                        res.cookie('remember_me', results[0], {
                            path: '/',
                            httpOnly: true,
                            maxAge: 604800000
                        });
                    }
                    return res.json({
                        href: req.session.loginToUrl || '/_admin/dashboard'
                    });
                }
            });
        })(req, res, next);
    }
};