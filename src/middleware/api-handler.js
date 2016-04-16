/**
 * Copyright © 2016, Versatile Internet
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

//deps
const
    url = require('url'),
    handlebars = require('handlebars'),
    typeify = require('../support/typeify'),
    BaseHandler = require('./base-handler');

//maps model ur namel parts to model names
const urlToModelMap = {
    sites: 'Site',
    pages: 'Page',
    plugins: 'Plugin',
    includes: 'Include',
    templates:'Template',
    users: 'User',
    media: 'Media',
    hits: 'Hit'
};

//fields to auto populate when making queries to these model names (the keys)
const populationsMap = {
    Site: '',
    Page: 'parent template basePage regions.includes.plugin regions.includes.include redirect createdBy updatedBy',
    Plugin: '',
    Include: '',
    Template: 'regions.includes.plugin',
    User: '',
    Media: '',
    Hit: ''
};

class ApiHandler extends BaseHandler {
    
    get pattern() {
        return new RegExp('^/_api/(sites|pages|plugins|includes|templates|users|media|hits)/?(.*)');
    }

    init(support) {
        this.logger = support.logger;
        this.dbSupport = support.dbSupport;
    }

    parseApiInfo(req) {
        const urlPath = url.parse(req.url).pathname;
        const apiInfo = this.pattern.exec(urlPath);
        return {
            apiType: apiInfo[1],
            itemId: apiInfo[2]
        };
    }

    getModel(apiType) {
        const modelName = urlToModelMap[apiType];
        return this.dbSupport.getModel(modelName) || null;
    }

    doGet(req, res, next) {
        const logger = this.getRequestLogger(this.logger, req);
        const apiInfo = this.parseApiInfo(req);
        const itemId = apiInfo.itemId;
        const Model = this.getModel(apiInfo.apiType);
    
        //clear props not to write to db
        delete req.body._id;
        delete req.body.__v;
    
        const filter = {};
        if (itemId) {
            filter._id = itemId;
            logger.debug('Searching for items by id [%s]: %s', itemId, Model.modelName);
        } else {
            logger.debug('Searching for items in model: %s', Model.modelName);
        }
    
        //create a filter from the query string
        for (let p in req.query) {
            //use __ prefix to stop special query params being included in filter
            if (req.query.hasOwnProperty(p) && p.indexOf('__') !== 0) {
                filter[p] = typeify(req.query[p]);
            }
        }
    
        const populations = typeify(req.query.__nopop) ? '' : populationsMap[Model.modelName];
        Model.find(filter, '-__v').populate(populations).sort('-createdAt').then((results) => {
            logger.info('API request OK in %s ms', Date.now() - req.startTime);
            results = itemId ? results[0] : results;
            if (req.headers.accept && req.headers.accept.indexOf('application/json') === -1) {
                const modelName = Model.modelName;
                const resultName = results.name || '';
                const itemId = itemId || 'all';
                const htmlBody = htmlStringify(results);
                const html = `<title>${modelName}: ${resultName}, ${itemId}</title>\n${htmlBody}`;
                res.send(html, {
                    'Content-Type': 'text/html'
                }, 200);
            } else {
                res.json(results);
            }
        }).then(undefined, (err) => {
            logger.error(err, 'Error trying API GET for %s', Model.modelName);
            next(err);
        });
    }

    doPost(req, res, next) {
        const logger = this.getRequestLogger(this.logger, req);
        const apiInfo = this.parseApiInfo(req);
        const itemId = apiInfo.itemId;
        const Model = this.getModel(apiInfo.apiType);
    
        //clear props not to write to db
        delete req.body._id;
        delete req.body.__v;
    
        if (itemId) {
            const message = `Cannot POST for this url. It should not contain an id [${itemId}]`;
            logger.warn(message);
            const err = new Error(message);
            err.status = 400;
            next(err);
        } else {
            logger.info('Creating new %s', Model.modelName);
            logger.debug('Creating new model with data: ');
            logger.debug(req.body);
    
            const docData = req.body;
            const model = new Model(docData);
            model.createdBy = req.user._id;
            model.save().then((model) => {
                logger.info('API POST OK in %s ms', Date.now() - req.startTime);
                res.status(201);
                res.json(model);
            }).then(undefined, (err) => {
                if(err.name === 'CastError' || err.name === 'ValidationError') {
                    //it was the client's fault
                    err.status = 400;
                }
                logger.error(err, 'Trying to save for API POST for %s', Model.name);
                next(err);
            });
        }
    }

    doPut(req, res, next) {
        const logger = this.getRequestLogger(this.logger, req);
        const apiInfo = this.parseApiInfo(req);
        const itemId = apiInfo.itemId;
        const Model = this.getModel(apiInfo.apiType);
    
        //clear props not to write to db
        delete req.body._id;
        delete req.body.__v;
    
        if (!itemId) {
            const message = 'Cannot PUT for this url. It should contain an id';
            logger.warn(message);
            const err = new Error(message);
            err.status = 400;
            next(err);
        } else {
            logger.info('Updating %s with id [%s]', Model.modelName, itemId);
            logger.debug('Updating model with data: ');
            const docData = req.body;
            docData.updatedBy = req.user._id;
            docData.draft = true;
            logger.debug(req.body);
            Model.findOneAndUpdate({_id: itemId}, docData, { 'new': true }).then( (doc) => {
                logger.info('API PUT OK in %s ms', Date.now() - req.startTime);
                res.json(doc);
            }).then(undefined, (err) => {
                if(err.name === 'CastError' || err.name === 'ValidationError') {
                    //it was the client's fault
                    err.status = 400;
                }
                logger.error(err, 'Trying to update for API PUT for %s', Model.modelName);
                next(err);
            });
        }
    }
    
    doDelete(req, res, next) {
        const logger = this.getRequestLogger(this.logger, req);
        const apiInfo = this.parseApiInfo(req);
        const itemId = apiInfo.itemId;
        const Model = this.getModel(apiInfo.apiType);
    
        //clear props not to write to db
        delete req.body._id;
        delete req.body.__v;
    
        if (!itemId) {
            const message = 'Cannot delete for this url. It should contain an id';
            logger.warn(message);
            const err = new Error(message);
            err.status = 400;
            next(err);
        } else {
            logger.info('Removing %s with id [%s]', Model.modelName, itemId);
            Model.findByIdAndRemove(itemId).then(() => {
                logger.info('API DELETE OK in %s ms', Date.now() - req.startTime);
                res.statusCode = 204;
                res.send();
            }).then(undefined, (err) => {
                if(err.name === 'CastError') {
                    //it was the client's fault
                    err.status = 400;
                }
                logger.error(err, 'Trying to do API DELETE for %s', Model.modelName);
                next(err);
            });
        }
    }
}

function htmlStringify(obj) {
    const html =
        '<pre style="font-family: Consolas, \'Courier New\'">' +
        handlebars.escapeExpression(JSON.stringify(obj, null, 4)) +
        '</pre>';
    return html;
}

module.exports = new ApiHandler();