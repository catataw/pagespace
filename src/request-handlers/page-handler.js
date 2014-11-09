"use strict";

//support
var fs = require("fs")
var bunyan = require('bunyan');
var hbs = require('hbs');
var BluebirdPromise = require('bluebird');

//util
var util = require('../misc/util');
var logger =  bunyan.createLogger({ name: 'page-handler' });
logger.level('debug');

var adminbarFilePromise = null;

var PageHandler = function(pageResolver, parts) {
    this.pageResolver = pageResolver;
    this.parts = parts;
};

module.exports = function(pageResolver, parts) {
    return new PageHandler(pageResolver, parts);
};

/**
 * Process a valid request
 */
PageHandler.prototype.doRequest = function(req, res, next) {

    var self = this;

    logger.info('Processing page request for ' + req.url);

    //turn on and off edit mode
    if(req.query._edit) {
        if(req.user && req.user.role === 'admin' && util.typeify(req.query._edit) === true) {
            logger.debug("Switching edit mode on");
            req.session.edit = true;
        } else if(util.typeify(req.query._edit) === false) {
            logger.debug("Switching edit mode off");
            req.session.edit = false;
        }
    }
    var showAdminBar = req.user && req.user.role === 'admin';
    var editMode = typeof req.session.edit === "boolean" && req.session.edit;

    self.pageResolver.findPage(req.url).then(function(page) {

        logger.info('Page found for ' + req.url + ': ' + page.id);

        var promises = [];
        promises.push(page);

        if(showAdminBar) {
            var readFile = BluebirdPromise.promisify(fs.readFile);
            adminbarFilePromise = adminbarFilePromise || readFile(__dirname + '/../../views/adminbar.hbs', "utf8");
            promises.push(adminbarFilePromise);
        } else {
            promises.push('');
        }

        //read data for each part
        page.regions.forEach(function (region) {
            if (region.part) {
                var partModule = self.parts[region.part];
                promises.push(partModule.read(region.data));
            } else {
                promises.push(null);
            }
        });
        return promises;
    }).spread(function() {
        var args = Array.prototype.slice.call(arguments, 0);
        var page = args.shift();
        var adminbar = args.shift();

        hbs.registerPartial('adminbar', adminbar);

        var pageData = {};
        pageData.edit = editMode;
        page.regions.forEach(function (region, i) {
            if (region.part) {
                pageData[region.name] = {
                    content: args[i] || {},
                    edit: pageData.edit,
                    region: region.name,
                    pageId: page._id
                };

                var partModule = self.parts[region.part];
                var partView = partModule.getView(editMode);
                hbs.registerPartial(region.name, partView);
            }
        });

        var templateSrc = !page.template ? 'default.hbs' : page.template.src;
        res.render(templateSrc, pageData, function(err, html) {
            if(err) {
                logger.error(err, 'Trying to render page, %s', req.url);
                next(err);
            } else {
                logger.info('Sending page for %s', req.url);
                res.send(html);
            }
        });
    }).catch(function(err) {
        logger.error(err);
        next();
    });
};