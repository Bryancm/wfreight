'use strict';

;(function (root, $) {

    var DATE_FORMAT = uship.prefs.i18n.dateformat.toUpperCase();

    ko.validation.rules['validPickupDate'] = {
        validator: function validator(val) {
            var dt = moment(val, DATE_FORMAT);
            if (!dt.isValid()) {
                return false;
            }
            var midnight = moment().startOf('day');
            return (dt.isSame(midnight) || dt.isAfter(midnight)) && dt.isBefore(midnight.add(180, 'days'));
        }
    };
    ko.validation.registerExtenders();

    var LtlFormViewModel = function LtlFormViewModel(options, model) {
        var self = this;
        self.formName = 'ltlForm';
        self.isUS = uship.prefs.i18n.siteid === 1;
        self.ajaxProPath = options.ajaxProPath;
        self.locationTypes = ko.observable(options.locationTypes);
        self.additionalServicesIsVisible = ko.observable(false);
        self.pickupDate = ko.observable(undefined).extend({
            validPickupDate: {
                message: uship.loc('InvalidDate') || uship.loc('DimensionInvalid')
            }
        });

        self.pickupDate2 = self.pickupDate();
        self.openCalendar = function (xx, event) {
            event.stopPropagation();
            uship.ns.pickadate.StepOneFormPickupDate && uship.ns.pickadate.StepOneFormPickupDate.calendar.open();
        };

        self.pickupMoment = function () {
            return moment(self.pickupDate(), DATE_FORMAT);
        };

        self.weekendPickupWarningVisible = ko.computed(function () {
            var pd = self.pickupDate();
            var dt = self.pickupMoment();
            return pd && (dt.day() === 0 || dt.day() === 6); // Saturday and Sunday
        });

        self.pickupWarningVisible = ko.computed(function () {
            if (self.weekendPickupWarningVisible()) {
                return false;
            }
            var dt = self.pickupMoment();
            var now = moment();
            var midnight = moment(now).startOf('day');
            return dt.isSame(midnight) && now.hour() >= 14; // 2pm
        });

        self.toggleAdditionalServices = function () {
            self.additionalServicesIsVisible(!self.additionalServicesIsVisible());
        };

        self.getFormModel = function () {
            var freightItemsModel = self.freightItems.getFreightItems();

            var jsVm = ko.toJS(self);
            return {
                selectedAccessorials: jsVm.selectedAccessorials.pickup.concat(jsVm.selectedAccessorials.delivery).concat(jsVm.selectedAccessorials.additional).concat(jsVm.selectedAccessorials.notification),
                pickupDate: self.pickupMoment().startOf('day').format('YYYY-MM-DD'),
                location: {
                    pickup: jsVm.location.pickup.flatModel(),
                    delivery: jsVm.location.delivery.flatModel()
                },
                itemsModel: freightItemsModel
            };
        };

        self.ajaxRequest = function (options) {
            var success = options.success;

            options.success = function (response) {
                return success(JSON.parse(response));
            };

            options.url = self.ajaxProPath;
            $.ajaxPro(options);
        };
        self.location = {}; // new uship.steponeform.LTLLocation(options, model);

        self.location.pickup = new uship.steponeform.FreightLocationViewModel({
            ajaxProPath: self.ajaxProPath,
            displayMode: options.displayMode,
            lang: options.lang,
            isLoggedIn: options.isLoggedIn,
            userPreviousAddresses: options.userPreviousAddresses,
            isGooglePlacesEnabled: options.isGooglePlacesEnabled,
            googleCountryCode: options.googleCountryCode,
            addressType: 'pickup'
        });

        self.location.delivery = new uship.steponeform.FreightLocationViewModel({
            ajaxProPath: self.ajaxProPath,
            displayMode: options.displayMode,
            lang: options.lang,
            isLoggedIn: options.isLoggedIn,
            userPreviousAddresses: options.userPreviousAddresses,
            isGooglePlacesEnabled: options.isGooglePlacesEnabled,
            googleCountryCode: options.googleCountryCode,
            addressType: 'delivery'
        });

        self.accessorials = JSON.parse(options.accessorials.replace(/(\r\n|\n|\r)/gm, ''));

        self.selectedAccessorials = {};

        self.getSelectedAccessorials = function (selectedAccessorials, type) {
            if (!selectedAccessorials) return [];
            var filteredAcc = self.accessorials[type].filter(function (acc) {
                return selectedAccessorials.indexOf(acc.value) > -1;
            });
            var returnArr = [];
            for (var i = 0; i < filteredAcc.length; i++) {
                returnArr.push(filteredAcc[i].value);
            }
            return returnArr;
        };
        self.selectedAccessorials.pickup = ko.observableArray();
        self.selectedAccessorials.delivery = ko.observableArray();
        self.selectedAccessorials.notification = ko.observableArray();
        self.selectedAccessorials.additional = ko.observableArray();
        //display additional services if it has anything preselected
        self.selectedAccessorials.additional().length > 0 && self.additionalServicesIsVisible(true);
        self.freightItems = new uship.steponeform.FreightItemsViewModel({
            userSiteId: options.userSiteId,
            siteUrl: options.siteUrl,
            freightTypes: options.freightTypes
        });
        self.handleChkClick = function (option) {
            if (option.value() == "PickupLiftgateRequired") {
                self.location.pickup.liftgateOverride(true);
                self.location.pickup.showLiftgateMessage(false);
            } else if (option.value() == "DeliveryLiftgateRequired") {
                self.location.delivery.liftgateOverride(true);
                self.location.delivery.showLiftgateMessage(false);
            }
            return true;
        };
        self.handleLiftgate = function (locationType, accList, selectedValue) {
            var useroverride = locationType == 'pickup' ? self.location.pickup.liftgateOverride() : self.location.delivery.liftgateOverride();
            if (!useroverride) {
                var accessorial = locationType == 'pickup' ? 'PickupLiftgateRequired' : 'DeliveryLiftgateRequired';
                var index = accList.indexOf(accessorial);
                if (["Residence", "BusinessWithoutLoadingDockOrForklift", "FarmRanchEstate", "School", "GovernmentLocation", "ReligiousInstitution", "GolfCourseResortPark"].indexOf(selectedValue) > -1) index < 0 && accList.push(accessorial);else index > -1 && accList.splice(index, 1);
            }
        };
        self.afterRender = function () {
            //uship.ns.pickadate.init();
            setTimeout(function () {
                $(uship.ns.pickadate.StepOneFormPickupDate).bind('select', function (instance) {
                    self.pickupDate(instance.target.getSelectedDate().format(DATE_FORMAT));
                });
            }, 1000);

            self.location.pickup.showEnabledOriginAndDestination();
            self.location.delivery.showEnabledOriginAndDestination();
            setupPickupLocationTooltip();
        };

        self.handlePostSubmit = function (response) {
            if (response.redirect) {
                var salesid = uship.utils.getUrlParam('salesid');
                if (salesid.trim() != '') {
                    response.redirect += '&salesid=' + salesid;
                }
                var redirectLocation = response.redirect;
                if (options.isIframe) {
                    window.parent.location.href = redirectLocation;
                } else {
                    window.location = redirectLocation;
                }
            } else {
                for (var i = 0, l = response.errors.length; i < l; i++) {
                    if (response.errors[i] === 'pickup') {
                        self.location.pickup.failedValidation(true);
                    } else if (response.errors[i] === 'delivery') {
                        self.location.delivery.failedValidation(true);
                    }
                }
            }
        };
        self.prefill = function (ltlModel) {
            if (!ltlModel) return;

            self.pickupDate(ltlModel.pickupDate ? moment(ltlModel.pickupDate).format(DATE_FORMAT) : undefined);

            var dt = self.pickupMoment();
            var midnight = moment().startOf('day');
            if (dt.isValid() && dt.isBefore(midnight)) {
                self.pickupDate(undefined);
                self.pickupDate.isModified(true);
            }

            self.selectedAccessorials.pickup(self.getSelectedAccessorials(ltlModel.selectedAccessorials, 'pickup'));
            self.selectedAccessorials.delivery(self.getSelectedAccessorials(ltlModel.selectedAccessorials, 'delivery'));
            self.selectedAccessorials.additional(self.getSelectedAccessorials(ltlModel.selectedAccessorials, 'additional'));
            ltlModel.location && ltlModel.location.pickup && self.location.pickup.prefill(ltlModel.location.pickup);
            ltlModel.location && ltlModel.location.delivery && self.location.delivery.prefill(ltlModel.location.delivery);
            //self.location.defaultLocationPrefill(ltlModel.defaultLocation);
            self.freightItems.prefill(ltlModel.itemsModel);
        };
        model && self.prefill(model);
        self.location.pickup.locationType.subscribe(self.handleLiftgate.bind(self, 'pickup', self.selectedAccessorials.pickup));
        self.location.delivery.locationType.subscribe(self.handleLiftgate.bind(self, 'delivery', self.selectedAccessorials.delivery));

        self.prepareGooglePlacesForValidation = function () {
            self.location.pickup.extendGooglePlacesQueryForValidation();
            self.location.delivery.extendGooglePlacesQueryForValidation();
        };

        self.isFormValid = function () {
            var dfd = $.Deferred();
            self.prepareGooglePlacesForValidation();
            ko.validation.group(self, { deep: true });
            self.checkValidation().then(dfd.resolve, dfd.reject);
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

        self.errors = ko.validation.group(self, { deep: true });
        uship.events.fire('ltlFormInit');
    };

    function setupPickupLocationTooltip() {
        var pickupLocation = $('#ltl-pickup-location');
        var locationType = pickupLocation.find('.location-type');

        var modal = $('#location-type-modal');
        var body = $('body');
        locationType.on('click.locationtype', showModal).on('mousedown.locationtype', showModal);
        body.off('click.locationtype');
        function showModal(e) {
            e.stopPropagation();
            modal.addClass('show');
            //timeout is for avoiding the scenario, where user clicks and releases mouse resulting in
            //showing the modal and hiding it immediately.
            setTimeout(function () {
                body.on('mouseup.locationtype', hideModal).on('touchstart.locationtype', hideModal);
            }, 200);
            locationType.off('click.locationtype').off('mousedown.locationtype');
        }

        function hideModal(e) {
            e.stopPropagation();
            modal.removeClass('show');
            //mousedown doesnt work, when selecting items in dropdown.
            //mouseup event is good one to rely upon especially dealing with dropdowns.
            body.off('mouseup.locationtype').off('touchstart.locationtype');
            locationType.off('click.locationtype').off('mousedown.locationtype');
            setTimeout(function () {
                locationType.on('click.locationtype', showModal).on('mousedown.locationtype', showModal);
            }, 200);
        }
    }

    root.uship.namespace('steponeform').extend({
        LtlFormViewModel: LtlFormViewModel
    });
})(window, jQuery);