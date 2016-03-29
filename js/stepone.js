'use strict';

;(function (root, $) {
    'use strict';

    var StepOneFormViewModel = function StepOneFormViewModel(commoditiesToDisplay, options) {

        var self = this;
        self.animate = true;
        self.formBusy = ko.observable(false);
        self.templateVisible = ko.observable(false);
        self.modelElementId = options.modelElementId;
        self.options = options;
        self.countries = ko.observable(uship.steponeform.countries);
        self.ajaxProPath = options.ajaxProPath;
        self.model = options.model;
        self.currentTemplateId = options.currentTemplateId;
        self.sessionId = options.sessionId;
        self.displayMode = options.displayMode || 'landingpage';
        self.steponecss = ko.observable({ 'steponeform': self.displayMode != 'modal' && self.displayMode != 'steptwoform',
            'alt': self.displayMode == 'landingpage',
            'steponeform-modal': self.displayMode == 'modal' || self.displayMode == 'steptwoform' });
        self.commodityId = ko.observable().extend({
            required: { message: uship.loc('CategoryWarning') ? uship.loc('CategoryWarning') : 'Required' }
        });
        self.ltlCommodities = JSON.parse(options.ltlCommodities);
        var commodities = new uship.commodityList.Commodities(commoditiesToDisplay);
        self.commodities = ko.observableArray(commodities.commodityList);

        var _subCommodityId = ko.observable();

        self.commodity = function () {
            return ko.utils.arrayFirst(ko.unwrap(self.commodities), function (commodity) {
                return commodity.value == self.commodityId();
            });
        };
        self.subCommodities = ko.computed(function () {
            var commodity = self.commodity();
            return commodity ? commodity.children : [];
        });

        var existingSubCommodity = function existingSubCommodity(subCommodityId) {
            if (!subCommodityId) return false;
            return self.subCommodities().some(function (s) {
                return s.value == subCommodityId;
            });
        };

        self.isLeafLevelCommodity = function () {
            return +self.commodityId() > 0 && self.subCommodities().length == 0;
        };

        self.subCommodityId = ko.computed({
            read: function read() {
                if (!_subCommodityId() && self.model.subCommodityId > 0 && !self.isLeafLevelCommodity() && !existingSubCommodity(self.model.subCommodityId)) {
                    return self.model.subCommodityId.toString();
                }
                return _subCommodityId() ? _subCommodityId().toString() : undefined;
            },
            write: function write(newValue) {
                _subCommodityId(newValue);
            }
        }).extend({
            required: {
                message: uship.loc('MainJSSelectSubCat'),
                onlyIf: function onlyIf() {
                    return self.subCommodities().length > 0;
                }
            }
        });

        self.renderExternalComponents = function (elems, currentViewModel) {
            uship.events.attach('submitsteponeform', self.getQuotes.bind(self));
            uship.ns.modalpanel.init();
            uship.ns.pickadate.init();
            //var currentForm = self.currentForm();
            self.templateVisible(true);
            currentViewModel.afterRender && currentViewModel.afterRender();
        };

        self.previousTemplateName = '';

        self.userGeneratedId = options.userGeneratedId || -1;
        self.showEasyRelistModal = ko.observable(false);
        self.commodityId.subscribe(function () {
            self.subCommodityId(undefined);
            self.subCommodityId.notifySubscribers();
            self.subCommodityId.isModified(false);
            self.isLeafLevelCommodity() && setCurrentTemplate();
        });
        self.previousShipments = ko.observableArray([]);
        self.showPreviousShipmentsButton = ko.computed(function () {
            return self.options.isLoggedIn && self.displayMode !== 'steptwoform';
        });

        var fetchPreviousShipments = function fetchPreviousShipments() {
            $.ajaxPro({
                type: 'GET',
                url: self.ajaxProPath,
                method: 'GetRecentLtlShipments',
                async: true,
                data: {
                    userId: self.userGeneratedId
                }
            }).done(function (result) {
                function selectRecentShipment(data) {
                    self.currentForm().prefill(data.Model);
                }

                result = JSON.parse(result);
                $.each(result, function (i, shipment) {
                    shipment.selectRecentShipment = selectRecentShipment;
                    self.previousShipments.push(shipment);
                });
            });
        };
        self.getDefaultFormTemplate = ko.computed(function () {
            var commodityId = +self.commodityId();
            var subCommodityId = +self.subCommodityId();
            var siteId = uship.prefs.i18n.siteid;

            if (!commodityId || !subCommodityId) {
                return 'empty-template';
            }

            if (self.displayMode === 'steptwoform' || commodityId === 1721 || subCommodityId === 79 && siteId === 1 || subCommodityId === 80 && siteId === 1) {
                return 'default-form-template';
            } else {
                return 'empty-template';
            }
        });

        //this should not be a computed. It should be an obervable, and all this logic should be executed as a
        //subscription to subcommodity change.
        self.currentTemplate = ko.observable({ name: 'empty-template', data: {} });

        //Now, since we extracted our template logic out computed, we can fire it manually which is used for Heavy Equipment.
        function setCurrentTemplate(newSubCommodity) {
            var commodityId = +self.commodityId();
            var subCommodityId = +newSubCommodity;
            var template = { name: 'empty-template', data: {} };

            if (self.ltlCommodities.indexOf(subCommodityId) > -1) {
                if (!self.ltlForm) {
                    if (self.displayMode !== 'steptwoform') {
                        uship.events.fire('heapTrack', []);
                        fetchPreviousShipments();
                    }
                    self.ltlForm = new uship.steponeform.LtlFormViewModel(self.options, self.model.shipmentModel);
                }
                template = {
                    name: 'stepone-ltl-template',
                    data: self.ltlForm
                };
            } else if (commodityId === 4 && subCommodityId === 79) {
                self.cltForm = self.cltForm || new uship.steponeform.CLTViewModel(self.options, self.model.shipmentModel);
                template = {
                    name: 'clt-moto-template',
                    data: self.cltForm
                };
            } else if (commodityId === 146 && subCommodityId === 80) {
                self.motoForm = self.motoForm || new uship.steponeform.MotoViewModel(self.options, self.model.shipmentModel);
                template = {
                    name: 'clt-moto-template',
                    data: self.motoForm
                };
            } else if (commodityId > 0 && (subCommodityId > 0 || self.isLeafLevelCommodity())) {
                //console.log('leaf level');
                self.options.subCommodityId = newSubCommodity;
                self.defaultForm = self.defaultForm || new uship.steponeform.DefaultViewModel(self.options, self.model.shipmentModel);
                template = {
                    name: self.getDefaultFormTemplate(),
                    data: self.defaultForm
                };
            } else {
                template = { name: 'empty-template', data: {} };
            }
            template.afterRender = self.renderExternalComponents.bind(self);
            if (self.previousTemplateName != template.name && self.animate) {
                self.templateVisible(false);
            }
            self.previousTemplateName = template.name;
            self.currentTemplate(template);
        }

        var forceGooglePlacesInputsToValidateOrAutoComplete = function forceGooglePlacesInputsToValidateOrAutoComplete() {
            var gpPickupInput = $('#pickupGPInput');
            var gpDeliveryInput = $('#deliveryGPInput');
            if (gpPickupInput) {
                gpPickupInput.blur();
            }
            if (gpDeliveryInput) {
                gpDeliveryInput.blur();
            }
        };

        self.validationsAttempted = 0;

        self.getQuotes = function (elem, event) {
            self.formBusy(true);
            forceGooglePlacesInputsToValidateOrAutoComplete();
            var currentForm = self.currentForm();
            if (self.errors().length > 0 || currentForm === undefined) {
                self.formIsNotReady();
            } else {
                currentForm.isFormValid().then(self.continueSubmission.bind(self), self.formIsNotReady.bind(self));
            }
        };

        self.formBusy.subscribe(function (newValue) {
            uship.events.fire('steponeformBusy', [newValue]);
        });

        self.currentForm = function () {
            var _currentForm = self.currentTemplate().data;
            return $.isEmptyObject(_currentForm) ? undefined : _currentForm;
        };

        self.formIsNotReady = function () {
            self.formBusy(false);
            self.errors.showAllMessages();
            var offset = $('small.error:visible').first().parent().offset();
            if (offset && Math.abs(document.body.getBoundingClientRect().top) > offset.top - 100) {
                $('html, body').animate({ scrollTop: offset.top ? offset.top - 100 : 0 });
            }
        };

        self.continueSubmission = function () {
            var currentForm = self.currentForm();
            if (self.errors().length > 0 || currentForm === undefined) {
                self.formIsNotReady();
            }
            var topLevelModel = {
                commodityId: self.commodityId(),
                subCommodityId: self.subCommodityId() || 0,
                displayMode: self.displayMode,
                testData: {
                    queryString: window.location.search.replace('?', ''),
                    sessionId: self.sessionId
                }
            };

            var dataModel = currentForm.getFormModel();
            if (currentForm.formName === 'defaultForm') {
                topLevelModel.shipmentModel = { location: dataModel };
            } else {
                topLevelModel.shipmentModel = dataModel;
            }

            $(self.modelElementId).val(ko.toJSON(topLevelModel));
            $.ajaxPro({
                type: 'GET',
                url: self.ajaxProPath,
                method: 'PostStepOne',
                async: false,
                data: {
                    modelString: ko.toJSON(topLevelModel)
                }
            }).done(function (response) {
                response = JSON.parse(response);
                if (response.errors && response.errors.length > 0) {
                    self.formBusy(false);
                }
                currentForm.handlePostSubmit(response);
            }).always(function () {});
        };

        self.prefill = function (model) {
            if (model.commodityId > 0 && model.commodityId != +self.commodityId() || model.subCommodityId != +self.subCommodityId() && model.subCommodityId > 0) {
                self.animate = false;
                self.commodityId(model.commodityId);
                self.subCommodityId(model.subCommodityId);
            } else {
                var currentForm = self.currentForm();
                currentForm && currentForm.prefill(model.shipmentModel);
                self.animate = true;
            }
        };

        $(root).load(function () {
            //should this be out side of this viewmodel? let me think!
            var prefillModel = $(self.modelElementId).val();
            if (prefillModel) {
                $.extend(self.model, JSON.parse(prefillModel));
                self.prefill(self.model);
                self.formBusy(false);
            }
        });

        //this being last is important. This will trigger subscriptions with ko which will populate the form
        self.commodityId(self.model.commodityId > 0 ? self.model.commodityId.toString() : undefined);
        self.subCommodityId(self.model.subCommodityId > 0 ? self.model.subCommodityId.toString() : undefined);
        self.subCommodityId.subscribe(setCurrentTemplate.bind(self));
        //Lets set the current template manually on load.
        //This is important to not be dependant on subcommodity subsciption, since it wont fire for commodities that
        //doesnt have subcommodities
        setCurrentTemplate(self.subCommodityId());

        //This should be after we set commodity and subcommodity.
        //this is a dependancy, and we need to make it more elegant.
        self.isCommoditySelectorVisible = !((self.displayMode == 'steptwoform' || self.displayMode == 'steponeform') && +self.commodityId() > 0 && +self.subCommodityId() > 0);
        self.errors = ko.validation.group(self, { deep: false });
    };
    var DefaultViewModel = function DefaultViewModel(options, model) {
        var self = this;
        self.formName = 'defaultForm';
        self.pickup = new uship.steponeform.LocationViewModel({
            ajaxProPath: options.ajaxProPath,
            lang: options.lang,
            isLoggedIn: options.isLoggedIn,
            userPreviousAddresses: options.userPreviousAddresses,
            isGooglePlacesEnabled: options.isGooglePlacesEnabled,
            googleCountryCode: options.googleCountryCode
        });

        self.delivery = new uship.steponeform.LocationViewModel({
            ajaxProPath: options.ajaxProPath,
            lang: options.lang,
            isLoggedIn: options.isLoggedIn,
            userPreviousAddresses: options.userPreviousAddresses,
            isGooglePlacesEnabled: options.isGooglePlacesEnabled,
            googleCountryCode: options.googleCountryCode
        });
        self.getDefaultLocationModel = function () {
            //ko.toJS is slow and overkill in this instance
            var pickup = self.pickup.flatModel();
            pickup.addressType = 'pickup';
            var delivery = self.delivery.flatModel();
            delivery.addressType = 'delivery';
            return {
                pickup: pickup,
                delivery: delivery
            };
        };
        self.getFormModel = function () {
            var locationModel = self.getDefaultLocationModel();
            return locationModel;
        };
        self.afterRender = function () {
            self.pickup.showEnabledOriginAndDestination();
            self.delivery.showEnabledOriginAndDestination();
        };

        self.handlePostSubmit = function (response) {
            if (options.isIframe) {
                window.parent.location.href = response.redirect;
            } else {
                window.location = response.redirect;
            }
        };

        self.defaultLocationPrefill = function (location) {
            if (!location) return;
            self.pickup.prefill(location.pickup);
            self.pickup.addressType = 'pickup';
            self.delivery.prefill(location.delivery);
            self.delivery.addressType = 'delivery';
        };
        self.errors = ko.validation.group(self, { deep: true });

        self.prepareGooglePlacesForValidation = function () {
            self.pickup.extendGooglePlacesQueryForValidation();
            self.delivery.extendGooglePlacesQueryForValidation();
        };

        self.isFormValid = function () {
            var dfd = $.Deferred();
            if (options.displayMode === 'steptwoform') {
                self.prepareGooglePlacesForValidation();
                ko.validation.group(self, { deep: true });
                self.checkValidation().then(dfd.resolve, dfd.reject);
            } else {
                // Assume passes validation
                dfd.resolve();
            }
            return dfd.promise();
        };

        self.checkValidation = function () {
            var dfd = $.Deferred();
            setTimeout(function () {
                if (self.isValidating()) {
                    self.checkValidation().then(dfd.resolve, dfd.reject);
                } else {
                    if (self.errors().length > 0) {
                        self.errors = ko.validation.group(self, { deep: true });
                        self.errors.showAllMessages();
                        dfd.reject();
                    } else {
                        dfd.resolve();
                    }
                }
            }, 50);
            return dfd.promise();
        };

        self.prefill = function (location) {
            self.defaultLocationPrefill(location);
        };
        model && self.prefill(model.location);
    };

    root.uship.namespace('steponeform').extend({
        DefaultViewModel: DefaultViewModel,
        StepOneFormViewModel: StepOneFormViewModel
    });
})(window, jQuery);