(function() {

    /**
     *
     * @type {*}
     */
    var adminApp = angular.module('adminApp');
    adminApp.controller('PageMacroEditController', function($scope, $rootScope, $timeout, $location, siteService, pageService,
                                                      $routeParams, macroService, $log, $window) {

        $rootScope.pageTitle = 'Edit page content';
        
        var macroId = $routeParams.macroId;
        var pageId = $location.search().pageId;

        $scope.page = null;

        if(pageId) {
            $log.debug('Fetching page data for: %s', pageId);
            $scope.pageId = pageId;
            macroService.getMacro(macroId).then(function(macro) {
                $scope.macro = macro;
                return pageService.getPage(pageId);
            }).then(function(page) {
                $log.debug('Got page data OK.');
                $log.trace('...with data:\n', JSON.stringify(page, null, '\t'));
                $scope.page = page;

                //depopulate redirect page
                if(page.redirect) {
                    page.redirect = page.redirect._id;
                }
            });
        }
        
        $scope.updateUrl = function() {
            $scope.page.url = pageService.generateUrl($scope.page);
        };

        $scope.cancel = function() {
            //roll back the newly created page
            if($location.search().created === 'true' && $scope.page) {
                pageService.deletePage($scope.page).then(function() {
                    $location.path('/pages');
                }).catch(function(err) {
                    $log.error(err, 'Error rolling back page creation');
                    $scope.showError('Error rolling back page creation', err);
                });
            }
        };

        $scope.save = function(form) {
            if(form.$invalid) {
                $scope.submitted = true;
                $window.scrollTo(0,0);
                return;
            }

            var page = $scope.page;

            $log.info('Update page: %s...', pageId);
            $log.trace('...with data:\n%s', JSON.stringify(page, null, '\t'));
            page = pageService.depopulatePage(page);
            pageService.updatePage(pageId, page).then(function() {
                $log.info('Page successfully updated');
                $scope.showSuccess('Page: ' + page.name + ' saved.');
                $scope.$broadcast('save');
                $timeout(function() {
                    $location.path(`/pages/macros/${macroId}/list`);
                }, 100);

            }).catch(function(err) {
                $log.error(err, 'Error updating page');
                $scope.showError('Error updating page', err);
            });
        };
    });

})();