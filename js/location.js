'use strict';

;(function (root, $) {
    var LocationViewModel = function LocationViewModel(options) {

        var self = this;

        self.isUsingGooglePlaces = ko.observable(options.isGooglePlacesEnabled);

        var GP = undefined;
        if (self.isUsingGooglePlaces()) {
            try {
                GP = new uship.googleMaps.Place();
            } catch (err) {
                self.isUsingGooglePlaces(false);
            }
        }

        self.showGooglePlaces = function () {
            var gpPickupInput = document.getElementById('pickupGP');
            var gpDeliveryInput = document.getElementById('deliveryGP');
            var zipPickupInput = document.getElementById('pickupZIP');
            var zipDeliveryInput = document.getElementById('deliveryZIP');
            var provincePickupInput = document.getElementById('pickupProvince');
            var provinceDeliveryInput = document.getElementById('deliveryProvince');
            var cityPickupInput = document.getElementById('pickupCity');
            var cityDeliveryInput = document.getElementById('deliveryCity');
            if (gpPickupInput) gpPickupInput.style.display = "block";
            if (gpDeliveryInput) gpDeliveryInput.style.display = "block";
            if (zipPickupInput) zipPickupInput.style.display = "none";
            if (zipDeliveryInput) zipDeliveryInput.style.display = "none";
            if (provincePickupInput) provincePickupInput.style.display = "none";
            if (provinceDeliveryInput) provinceDeliveryInput.style.display = "none";
            if (cityPickupInput) cityPickupInput.style.display = "none";
            if (cityDeliveryInput) cityDeliveryInput.style.display = "none";
            $('.tt-hint').removeAttr("disabled"); //safari on mobile disables gp inputs by default, so we explicitly enable them
            self.isUsingGooglePlaces(true);
        };

        self.hideGooglePlaces = function () {
            var gpPickupInput = document.getElementById('pickupGP');
            var gpDeliveryInput = document.getElementById('deliveryGP');
            var zipPickupInput = document.getElementById('pickupZIP');
            var zipDeliveryInput = document.getElementById('deliveryZIP');
            var provincePickupInput = document.getElementById('pickupProvince');
            var provinceDeliveryInput = document.getElementById('deliveryProvince');
            var cityPickupInput = document.getElementById('pickupCity');
            var cityDeliveryInput = document.getElementById('deliveryCity');
            if (gpPickupInput) gpPickupInput.style.display = "none";
            if (gpDeliveryInput) gpDeliveryInput.style.display = "none";
            if (zipPickupInput) zipPickupInput.style.display = "block";
            if (zipDeliveryInput) zipDeliveryInput.style.display = "block";
            if (provincePickupInput) provincePickupInput.style.display = "block";
            if (provinceDeliveryInput) provinceDeliveryInput.style.display = "block";
            if (cityPickupInput) cityPickupInput.style.display = "block";
            if (cityDeliveryInput) cityDeliveryInput.style.display = "block";
            self.isUsingGooglePlaces(false);
        };

        self.showEnabledOriginAndDestination = function () {
            if (self.isUsingGooglePlaces()) {
                self.showGooglePlaces();
            } else {
                self.hideGooglePlaces();
            }
        };

        self.shouldValidateLocation = function () {
            return uship.prefs.i18n.siteid === 1;
        };

        self.ajaxProPath = options.ajaxProPath;
        self.addressType = options.addressType || '';
        self.countryCode = ko.observable();
        self.country = ko.computed(function () {
            return ko.utils.arrayFirst(ko.unwrap(uship.steponeform.countries), function (country) {
                return country.value === self.countryCode();
            });
        });
        self.countryName = ko.computed(function () {
            var country = self.country();
            return country ? country.label : '';
        });
        self.isSelectingCountry = ko.observable(false);
        self.selectCountry = function () {
            self.isSelectingCountry(true);
        };
        self.postalCode = ko.observable(undefined).extend({
            required: {
                message: uship.loc('postalCodeRequiredError'),
                onlyIf: function onlyIf() {
                    return !self.isUsingGooglePlaces();
                }
            }
        });
        self.isUsCa = ko.computed(function () {
            var country = self.country();
            return country && (country.value === 'US' || country.value === 'CA');
        });
        self.postalCodeText = ko.computed(function () {
            var locText = self.isUsCa() ? 'MainJsZIP' : 'MainJsPostalCode';
            return uship.loc(locText);
        });
        self.countryCode.subscribe(function () {
            self.isSelectingCountry(false);
            self.postalCode() != undefined && self.postalCode.notifySubscribers();
        });
        self.provinces = ko.observableArray([]);
        self.loadProvinces = function () {
            $.ajaxPro({
                type: 'GET',
                url: self.ajaxProPath,
                method: 'GetProvinces',
                data: {
                    countryId: self.country().id
                },
                success: function success(response) {
                    self.provinces(JSON.parse(response));
                }
            });
        };

        self.lookup = new uship.steponeform.PostalCodeLookupViewModel({
            ajaxProPath: self.ajaxProPath,
            provinces: self.provinces,
            country: self.country,
            loadProvinces: self.loadProvinces,
            callback: function callback(postalCode) {
                self.postalCode(postalCode);
            }
        });
        self.flatModel = function () {
            var useGooglePlacesValues = self.isUsingGooglePlaces() && self.place();
            return {
                postalCode: useGooglePlacesValues ? self.place().postalCode || self.postalCode() : self.postalCode(),
                countryCode: useGooglePlacesValues ? self.place().countryCode || self.countryCode() : self.countryCode(),
                addressType: self.addressType,
                GPInfo: {
                    city: useGooglePlacesValues ? self.place().city || '' : '',
                    state: useGooglePlacesValues ? self.place().state || '' : '',
                    country: useGooglePlacesValues ? self.place().country || '' : '',
                    streetName: useGooglePlacesValues ? self.place().route || '' : '',
                    streetNumber: useGooglePlacesValues ? self.place().streetNumber || '' : '',
                    lat: useGooglePlacesValues ? self.place().latitude || '' : '',
                    lng: useGooglePlacesValues ? self.place().longitude || '' : '',
                    formattedAddress: useGooglePlacesValues ? self.query() || '' : ''
                }
            };
        };
        self.postalCode.subscribe(function () {
            var pickupDeliveryElems = $('.js-postalcode');
            self.addressType == 'pickup' && pickupDeliveryElems && pickupDeliveryElems.length > 1 && pickupDeliveryElems[1].visible === true && pickupDeliveryElems[1].focus();
        });

        self.place = ko.observable(GP);
        self.query = ko.observable();
        self.userRegion = ko.observable(); // siteId
        self.lang = options.lang.substring(0, 2);
        self.allowGPS = ko.observable();
        self.countryBounds = uship.list.latLngByCountry[options.googleCountryCode];
        if (self.isUsingGooglePlaces()) {
            self.allowGPS(true);
        } else {
            self.allowGPS(false);
        }
        self.disableGp = self.hideGooglePlaces;

        self.populatePreviousAddresses = function (previousAddresses) {

            if (options.isLoggedIn) {
                for (var i = 0; self.isUsingGooglePlaces() && i < options.userPreviousAddresses.length; ++i) {
                    var address = options.userPreviousAddresses[i];
                    var value = uship.list.getFormattedAddress(address);
                    if (jQuery.inArray(value, previousAddresses) === -1) previousAddresses.push(value);
                }
            } else if (self.isUsingGooglePlaces() && window.location.href.indexOf('qrid') > -1) {
                var length = options.userPreviousAddresses.length;
                for (var i = 1; self.isUsingGooglePlaces() && length > 3 && i < 3; ++i) {
                    var address = options.userPreviousAddresses[length - i];
                    var value = uship.list.getFormattedAddress(address);
                    if (jQuery.inArray(value, previousAddresses) === -1) previousAddresses.push(value);
                }
            }
        };

        var previousAddresses = [];
        self.populatePreviousAddresses(previousAddresses);

        self.addressSuggestions = ko.observable([{ name: 'previousAddresses',
            minLength: 0,
            limit: 3,
            local: previousAddresses
        }]);

        self.extendGooglePlacesQueryForValidation = function () {
            self.place.extend({
                hasSufficientLocationInfo: {
                    params: true,
                    onlyIf: function onlyIf() {
                        return self.isUsingGooglePlaces();
                    }
                },
                isSupportedCountry: {
                    useMvcCall: false
                }
            });
        };

        self.HandleNoSelectionFromTypeahead = function (userText, googlePlacesQuery, inputElement) {
            var matchFound = false;
            userText = userText.toLowerCase().replace(/,/g, '');
            var originalTextLength = userText.length;
            var gpSuggestions = inputElement.siblings().find('.tt-suggestion');
            for (var j = 1; j < originalTextLength && !matchFound; j++) {

                for (var i = 0; i < gpSuggestions.length && !matchFound; i++) {
                    var suggestion = gpSuggestions[i];
                    var suggestionText = suggestion.children[0].innerHTML;
                    var lowerCaseSuggestionWithNoCommas = suggestionText.toLowerCase().replace(/,/g, '');
                    if (lowerCaseSuggestionWithNoCommas.indexOf(userText.toLowerCase()) != -1) {
                        googlePlacesQuery(suggestionText);
                        matchFound = true;
                    }
                }
                userText = userText.substring(0, userText.length - j);
            }
        };

        self.HandleCustomTabbingForInput = function (id) {
            //debugger;
            if (id === 'pickupGPInput') {
                $('#deliveryGPInput').focus();
            }
            if (id === 'deliveryGPInput') {
                $('.form-input-text-date-pickadate').focus();
            }
        };

        self.prefillBasicLocation = function (location) {
            if (!location) return;

            self.countryCode(location.countryCode);
            self.postalCode(location.postalCode || undefined);
            self.addressType = location.addressType;

            if (location.GPInfo && location.GPInfo.formattedAddress) {
                self.query(location.GPInfo.formattedAddress);
            }
        };
        self.prefill = function (location) {
            self.prefillBasicLocation(location);
        };
    };

    var LocationExtendedViewModel = function LocationExtendedViewModel(options) {
        var self = this;
        $.extend(self, new uship.steponeform.LocationViewModel(options));
        //self.ajaxProPath = options.ajaxProPath;
        self.provinceName = ko.observable();
        self.failedValidation = ko.observable(false);

        self.secondLevelCountry = ko.computed(function () {
            var country = self.country();
            return country && [3, 12, 16, 31, 44, 46, 53, 70, 76, 94, 129, 139, 178, 179, 207].indexOf(country.id) > -1;
        });

        self.thirdLevelCountry = ko.computed(function () {
            return !self.secondLevelCountry() && !self.isUsCa();
        });

        self.postalCode.extend({
            validPostalCode: {
                countryId: function countryId() {
                    return self.country().id;
                },
                ajaxProPath: self.ajaxProPath,
                xhttpMethod: 'ValidatePostalCode',
                isUsingGooglePlaces: self.isUsingGooglePlaces()
            }
        });

        self.isCityVisible = ko.computed(function () {
            return self.failedValidation() && (self.isUsCa() || self.secondLevelCountry()) || self.thirdLevelCountry();
        });

        self.isProvinceNameVisible = ko.computed(function () {
            return self.failedValidation() && self.secondLevelCountry() || self.thirdLevelCountry();
        });

        self.isProvinceDropdownVisible = ko.computed(function () {
            return self.failedValidation() && self.isUsCa();
        });
        self.isProvinceDropdownVisible.subscribe(function (visible) {
            visible && self.loadProvinces();
        });
        self.cityName = ko.observable(undefined).extend({
            required: {
                message: uship.loc('CityNameRequired'),
                onlyIf: function onlyIf() {
                    return self.isCityVisible() && !self.isUsingGooglePlaces();
                }
            }
        });
        self.doneSelectingCountry = function () {
            self.cityName(undefined);
            self.cityName.isModified(false);
        };
        self.countryCode.subscribe(self.doneSelectingCountry, self);
        self.postalCode.subscribe(function () {
            if (!self.failedValidation()) {
                self.cityName(undefined);
                self.cityName.isModified(false);
            }
        });

        self.provinceValue = ko.observable().extend({
            message: uship.loc('ProvinceRequired'),
            onlyIf: function onlyIf() {
                return !self.isUsingGooglePlaces();
            }
        });

        self.province = ko.computed(function () {
            return ko.utils.arrayFirst(ko.unwrap(self.provinces), function (_province) {
                return _province.value === self.provinceValue();
            });
        });

        self.init = function () {
            self.cityName(undefined);
            self.provinceValue(undefined);
            self.provinceName(undefined);
        };
        self.prefillExtendedLocation = function (location) {
            self.prefillBasicLocation(location);
            self.cityName(location.cityName || undefined);
            self.provinceName(location.provinceName);
            self.provinceValue(location.provinceValue);
        };
        self.prefill = function (location) {
            self.prefillExtendedLocation(location);
        };
        self.init();
    };

    var FreightLocationViewModel = function FreightLocationViewModel(options) {
        var self = this;

        $.extend(self, new uship.steponeform.LocationExtendedViewModel(options));
        self.liftgateOverride = ko.observable(false);
        self.locationType = ko.observable(undefined).extend({
            required: {
                message: uship.loc('LocationTypeRequired')
            }
        });
        self.liftgateAlertText = '';
        self.showLiftgateMessage = ko.observable(false);
        self.handleLiftgateMessage = function (selectedValue) {
            self.showLiftgateMessage(["Residence", "BusinessWithoutLoadingDockOrForklift", "FarmRanchEstate", "School", "GovernmentLocation", "ReligiousInstitution", "GolfCourseResortPark"].indexOf(selectedValue) > -1 && !self.liftgateOverride());
        };
        self.locationTypeCaption = '';
        self.flatModel = function () {
            var useGooglePlacesValues = self.isUsingGooglePlaces() && self.place();
            return {
                postalCode: useGooglePlacesValues ? self.place().postalCode || self.postalCode() : self.postalCode(),
                provinceName: self.provinceName(),
                countryCode: useGooglePlacesValues ? self.place().countryCode || self.countryCode() : self.countryCode(),
                locationType: self.locationType(),
                provinceValue: self.provinceValue(),
                locationValidationAttempt: self.failedValidation() ? 1 : 0,
                addressType: self.addressType,
                GPInfo: {
                    city: useGooglePlacesValues ? self.place().city || '' : '',
                    state: useGooglePlacesValues ? self.place().state || '' : '',
                    country: useGooglePlacesValues ? self.place().country || '' : '',
                    streetName: useGooglePlacesValues ? self.place().route || '' : '',
                    streetNumber: useGooglePlacesValues ? self.place().streetNumber || '' : '',
                    lat: useGooglePlacesValues ? self.place().latitude || '' : '',
                    lng: useGooglePlacesValues ? self.place().longitude || '' : '',
                    formattedAddress: useGooglePlacesValues ? self.query() || '' : ''
                }
            };
        };
        self.prefillFreightLocation = function (location) {
            if (!location) return;
            self.prefillExtendedLocation(location);
            location.locationType && self.locationType(location.locationType);
            self.locationType.subscribe(self.handleLiftgateMessage.bind(self));
            if (self.addressType != 'pickup' && self.addressType != 'delivery') self.addressType = location.addressType;
            self.locationTypeCaption = uship.loc(self.addressType == 'pickup' ? 'PickupType' : 'DeliveryLocationType') + '...';
            self.liftgateAlertText = self.addressType === 'pickup' ? String.format(uship.loc('LiftgateWarning'), uship.loc('tsp_homePickup')) : String.format(uship.loc('LiftgateWarning'), uship.loc('MainDelivery'));
        };
        self.prefill = function (location) {
            self.prefillFreightLocation(location);
        };
    };
    root.uship.namespace('steponeform').extend({
        LocationViewModel: LocationViewModel,
        LocationExtendedViewModel: LocationExtendedViewModel,
        FreightLocationViewModel: FreightLocationViewModel
    });
})(window, jQuery);