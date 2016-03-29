'use strict';

/**
 * uShip UI Components
 * Defines a library of common utilities
 */

;(function (root, ko, $, uship) {

    /*
     *  UTILITIES
     */

    var templateEngine = new ko.stringTemplateEngine();

    var templateConfig = { templateEngine: templateEngine };

    var isRetina = function () {
        var mediaQuery = '(-webkit-min-device-pixel-ratio: 1.5),\
                (min--moz-device-pixel-ratio: 1.5),\
                (-o-min-device-pixel-ratio: 3/2),\
                (min-resolution: 1.5dppx)';
        if (window.devicePixelRatio > 1) return true;
        if (window.matchMedia && window.matchMedia(mediaQuery).matches) return true;
        return false;
    }();

    var wrapObservable = function wrapObservable(property, value) {
        ko.isObservable(property) ? property(value) : property = value;
    };

    /*
     *  Address Autocomplete Binding
     *
     *  <input data-bind="addressAutocomplete: { sources: { local: myPreviousAddresses }, value: myAddress }"></div>
     *
     *  Depends on the typeahead binding.
     *
     */

    var googleAutocompleteService, googleGeocoder;
    var IsGooglePlacesReturningHealthyStatusCodes = true;
    var googleApiKey = 'AIzaSyBXNKfkj-1eFQi8y_dYFa7xBEPf2JJ_PyE';

    var LogGooglePlacesErrorCodes = function LogGooglePlacesErrorCodes(status) {
        $.ajaxPro({
            type: 'GET',
            url: '/ajaxpro/id3Solutions.UShip.Web.addresses,id3Solutions.UShip.ashx',
            method: 'LogGooglePlacesErrorCodes',
            async: false,
            data: {
                statusCode: status
            }
        });
    };

    var getCurrentLocationAsync = function getCurrentLocationAsync() {
        var deferred = $.Deferred();
        if (navigator.geolocation) {
            var location_timeout = setTimeout(deferred.reject, 8000);

            navigator.geolocation.getCurrentPosition(function (location) {
                // success
                clearTimeout(location_timeout);
                deferred.resolve(location.coords);
            }, function (error) {
                // fail
                clearTimeout(location_timeout);
                deferred.reject();
            });
        } else {
            deferred.reject();
        }
        return deferred.promise();
    };

    var prependCurrentLocationOption = function prependCurrentLocationOption(options, promptText) {
        if (root.navigator.geolocation) {
            options.unshift({
                name: 'current-location',
                minLength: 0,
                local: [{ value: promptText }]
            });
        }
    };

    var setupGoogleSuggestions = function setupGoogleSuggestions(sources, config) {
        sources.push({
            name: 'google-suggestions',
            minLength: 1,
            limit: 3,
            computed: function computed(query, done) {

                if (typeof google === 'undefined') return;

                var defaults = {
                    input: query,
                    types: [config.granularity]
                };

                if (config.bounds) {
                    defaults.bounds = new google.maps.LatLngBounds(new google.maps.LatLng(config.bounds.latitude - 3, config.bounds.longitude - 3), new google.maps.LatLng(config.bounds.latitude + 3, config.bounds.longitude + 3));
                }

                googleAutocompleteService && googleAutocompleteService.getPlacePredictions(defaults, function (results) {
                    if (!results) return;
                    var options = results.map(function (option) {
                        var tokens = option.terms.map(function (term) {
                            return term.value;
                        });
                        return { value: option.description, tokens: tokens };
                    });
                    done(options);
                });
            }
        });
    };

    var getPostalCodeFromLatLng = function getPostalCodeFromLatLng(coords, callback, city) {
        var latlng = new google.maps.LatLng(coords.latitude, coords.longitude);

        googleGeocoder.geocode({ 'latLng': latlng }, function (results, status) {

            if (status == google.maps.GeocoderStatus.OK) {
                var resultThatMatchesCity = new uship.googleMaps.selectPlaceResultWithMatchingCity(city, results);
                var placeResult = new uship.googleMaps.Place(resultThatMatchesCity);
                callback(placeResult.postalCode);
            } else {

                if (status == google.maps.GeocoderStatus.OVER_QUERY_LIMIT || status == google.maps.GeocoderStatus.REQUEST_DENIED || status == google.maps.GeocoderStatus.UNKNOWN_ERROR) {
                    IsGooglePlacesReturningHealthyStatusCodes = false;
                    LogGooglePlacesErrorCodes(status);
                }
                callback();
            }
        });
    };

    var geocodeQueue = [];

    var addressAutocompleteBindingHandler = {
        init: function init(element, valueAccessor, allBindingsAccessor) {
            var value = valueAccessor(),
                allBindings = allBindingsAccessor(),
                inputValue = value.value,
                sources = ko.toJS(value.sources) || [],
                place = value.place || new uship.googleMaps.Place(),
                region = value.region || 'US',
                granularity = value.granularity || '(regions)',
                bounds = value.bounds,
                allowGPS = value.gps,
                isGpEnabled = value.isGpEnabled ? value.isGpEnabled() : true,
                disableGp = uship.utils.asCallable(value.disableGp),
                lang = value.lang || uship.globalize.culture().language || 'en',
                $element = $(element);

            var currentLocationPrompt = uship.loc('CurrentLocation');
            var googleSuggestionsConfig = {};

            if (bounds) googleSuggestionsConfig.bounds = bounds;
            googleSuggestionsConfig.granularity = granularity;

            var initialPlace = ko.unwrap(place);
            var latLngPreset = false;
            if (initialPlace) {
                latLngPreset = !isNaN(initialPlace.latitude) && !isNaN(initialPlace.longitude);
            }

            setupGoogleSuggestions(sources, googleSuggestionsConfig);
            if (ko.unwrap(allowGPS)) prependCurrentLocationOption(sources, currentLocationPrompt);

            var typeaheadConfig = ko.observable({
                config: sources
            });

            // initialize the typeahead binding
            ko.bindingHandlers.typeahead.init(element, ko.observable(typeaheadConfig), ko.observable(value));

            // update the typeahead binding any time the config observable changes
            ko.isObservable(value.sources) && value.sources.subscribe(function (newValue) {
                if (ko.unwrap(allowGPS)) prependCurrentLocationOption(newValue, currentLocationPrompt);
                setupGoogleSuggestions(newValue);
                ko.bindingHandlers.typeahead.update(element, ko.observable({ config: newValue }), valueAccessor);
            });

            var skipNextgeocodeExecution = latLngPreset;

            // geocode the chosen address
            ko.computed(function () {
                var newValue = ko.unwrap(inputValue);

                if (skipNextgeocodeExecution) {
                    skipNextgeocodeExecution = false;
                    return;
                }

                // current location
                if (newValue == currentLocationPrompt) {

                    skipNextgeocodeExecution = true;
                    getCurrentLocationAsync().then(function (coords) {
                        //success
                        var latlng = new google.maps.LatLng(coords.latitude, coords.longitude);
                        googleGeocoder.geocode({ 'latLng': latlng }, function (results, status) {
                            if (status == google.maps.GeocoderStatus.OK) {
                                var placeResult = new uship.googleMaps.Place(results[0]);
                                placeResult.latitude = coords.latitude;
                                placeResult.longitude = coords.longitude;
                                place(placeResult);
                                var formattedAddress = uship.list.createFormattedAddressFromCurrentLocation(placeResult);
                                var label = [formattedAddress];
                                inputValue(label.join(', '));
                            } else {

                                if (status == google.maps.GeocoderStatus.OVER_QUERY_LIMIT || status == google.maps.GeocoderStatus.REQUEST_DENIED || status == google.maps.GeocoderStatus.UNKNOWN_ERROR) {
                                    IsGooglePlacesReturningHealthyStatusCodes = false;
                                    LogGooglePlacesErrorCodes(status);
                                }
                            }
                            return;
                        });
                    }, function () {
                        //faliure
                        //getting current location falied
                        //or user decided to deny browser from setting coordinates
                        inputValue(''); //reset GP binding
                        element.value = ''; //reset text
                        return;
                    });

                    return;
                }

                var geocode = function geocode() {

                    // regular address
                    googleGeocoder.geocode({ 'address': newValue, 'region': ko.unwrap(region) }, function (results, status) {

                        if (!newValue) {
                            newValue = '';
                        }
                        //try to get postal code from user input
                        var fiveDigitAmericanZipCodeRegex = /\d{5}/;
                        var nineDigitAmericanZipCodeRegex = /\d{5}-\d{4}/;
                        var fiveDigitZipCodeFromUserInput = newValue.match(fiveDigitAmericanZipCodeRegex);
                        var nineDigitZipCodeFromUserInput = newValue.match(nineDigitAmericanZipCodeRegex);

                        if (status == google.maps.GeocoderStatus.OK) {
                            var result = new uship.googleMaps.Place(results[0]);
                            if (result.postalCode) {
                                //google has returned a result with a postal code, so let's keep it
                                place(result);
                            } else if (result.countryCode === 'US' && fiveDigitZipCodeFromUserInput) {
                                //google has not returned a result with a postal code, but the user entered one, so let's use his/her entry
                                var zip = fiveDigitZipCodeFromUserInput[fiveDigitZipCodeFromUserInput.length - 1];
                                result.postalCode = zip;
                                place(result);
                            } else if (result.countryCode === 'US' && nineDigitZipCodeFromUserInput) {
                                //google has not returned a result with a postal code, but the user entered one, so let's use his/her entry
                                var zip = nineDigitZipCodeFromUserInput[nineDigitZipCodeFromUserInput.length - 1];
                                result.postalCode = zip;
                                place(result);
                            } else {
                                //user has not entered a postal code and google did not return a postal code, so let's reverse geocode to find one
                                getPostalCodeFromLatLng(result, function (postalCode) {
                                    result.postalCode = postalCode;
                                    place(result);
                                }, result.city);
                            }
                        } else {

                            if (status == google.maps.GeocoderStatus.OVER_QUERY_LIMIT || status == google.maps.GeocoderStatus.REQUEST_DENIED || status == google.maps.GeocoderStatus.UNKNOWN_ERROR) {
                                IsGooglePlacesReturningHealthyStatusCodes = false;
                                LogGooglePlacesErrorCodes(status);
                            }
                            wrapObservable(inputValue, '');
                        }
                    }); // geocoder
                };

                googleGeocoder && isGpEnabled ? geocode() : geocodeQueue.push(geocode);
            });

            // load Google autocomplete and geocoder and ensure all applicable components for load are present
            if (typeof google !== 'undefined' && google.maps && google.maps.Geocoder && google.maps.places && google.maps.places.AutocompleteService) {
                if (!googleGeocoder) googleGeocoder = new google.maps.Geocoder();
                if (!googleAutocompleteService) googleAutocompleteService = new google.maps.places.AutocompleteService();
            } else {
                uship.utils.injectCallbackScript('//maps.google.com/maps/api/js?libraries=places&sensor=false&callback=googleMapsInit&key=' + googleApiKey + '&language=' + lang, 'googleMapsInit').fail(function (e) {
                    disableGp();
                    LogGooglePlacesErrorCodes('google places script or one of its dependencies failed to inject');
                }).done(function () {
                    googleGeocoder = googleGeocoder || new google.maps.Geocoder();
                    googleAutocompleteService = googleAutocompleteService || new google.maps.places.AutocompleteService();
                    geocodeQueue.forEach(function (locationToGeocode) {
                        locationToGeocode();
                    });
                    geocodeQueue = [];
                });
            }

            ko.bindingHandlers.typeahead.update(element, ko.observable(typeaheadConfig), valueAccessor);
        }
    }; // addressAutocompleteBindingHandler

    var showGooglePlaces = function showGooglePlaces() {
        return IsGooglePlacesReturningHealthyStatusCodes;
    };

    /*
    *   Tooltip Binding
    *
    *   <div data-bind="tooltip: { content: myContent, direction: ('right', 'down', 'left', 'down-left') }"></div>
    */

    var tooltipTemplateString = ['<div data-bind="attr: { \'class\': tooltipOpenClass }">', '   <span class="icon-help tooltip-open-icon"></span>', '   <div class="tooltip-container" style="display: none;">', '       <span class="icon-close tooltip-close"></span>', '       <p class="tooltip-content" data-bind="html: content"></p>', '   </div>', '</div>'].join('\n');

    templateEngine.addTemplate('tooltipTemplate', tooltipTemplateString);

    var TooltipViewModel = function TooltipViewModel(configuration) {
        var self = this;

        self.content = configuration.content;
        self.tooltipOpenClass = configuration.tooltipOpenClass;
    };

    var tooltipBindingHandler = {
        init: function init(element, valueAccessor) {
            var value = valueAccessor(),
                template = value.template || 'tooltipTemplate',
                content = value.content || 'tooltip content',
                direction = value.direction || 'right';

            var configuration = {
                content: content,
                tooltipOpenClass: 'tooltip-open open-' + direction
            };

            if (!$.fn.tooltip) initJqueryTooltip();

            var tooltipViewModel = new TooltipViewModel(configuration);

            ko.renderTemplate(template, tooltipViewModel, { templateEngine: templateEngine }, element, 'replaceChildren');

            $(element).find('.tooltip-open').tooltip({
                containerSelector: '.tooltip-container',
                closeSelector: '.tooltip-close'
            });

            return { controlsDescendantBindings: true };
        }
    };

    var initJqueryTooltip = function initJqueryTooltip() {

        $.fn.tooltip = function (options) {
            options = $.extend({}, $.fn.tooltip.defaultOptions, options);

            var everythingElse = $(options.everythingElseSelector);
            var overrideContainer = options.container ? $(options.container) : null;
            var overrideClose = options.close ? $(options.close) : null;

            return this.each(function (i, e) {
                var tooltipLink = $(e);
                var tooltipContainer = overrideContainer || tooltipLink.find(options.containerSelector);
                var tooltipClose = overrideClose || tooltipLink.find(options.closeSelector);

                bindShowBehavior();
                tooltipContainer.click(function (event) {
                    event.stopPropagation();
                });
                tooltipClose.click(hidetooltip);

                function hidetooltip(event) {
                    event.stopPropagation();
                    tooltipContainer.hide(options.closeSpeed);
                    bindShowBehavior();
                }
                function showtooltip(event) {
                    event.stopPropagation();
                    tooltipContainer.show(options.openSpeed);
                    bindHideBehavior();
                }
                function bindShowBehavior() {
                    tooltipLink.click(showtooltip);
                    everythingElse.unbind('click', hidetooltip);
                }
                function bindHideBehavior() {
                    everythingElse.click(hidetooltip);
                    tooltipLink.unbind('click', showtooltip);
                }
            });
        };

        $.fn.tooltip.defaultOptions = {
            containerSelector: '.tooltip-container',
            closeSelector: '.tooltip-close',
            everythingElseSelector: 'body',
            openSpeed: 100,
            closeSpeed: 100
        };
    };

    /*
     *   Checkbox Binding
     *
     *   <div data-bind="checkbox: { label: myLabel, value: isChecked }"></div>
     */

    var checkboxTemplateString = ['<div class="checkbox-list">', '   <label class="checkbox" data-bind="css: { checked: isChecked, focus: hasFocus }">', '       <span class="indicator"></span>', '       <input type="checkbox" data-bind="', '           attr: {', '               value: value,', '               name: value },', '           event: { ', '               focusin: applyFocus,', '               focusout: removeFocus },', '           checked: isChecked" />', '       <!-- ko text: label --><!-- /ko -->', '   </label>', '</div>'].join('\n');

    templateEngine.addTemplate('checkboxTemplate', checkboxTemplateString);

    var checkboxBindingHandler = {
        init: function init(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

            var value = valueAccessor();
            var boundValue = value.value;
            var template = value.template || 'checkboxTemplate';
            var renderingConfig = value.template ? {} : templateConfig;
            var initialState = ko.unwrap(boundValue) ? 'checked' : 'unchecked';

            var checkboxViewModel = new CheckboxModel(true, value.label, initialState);

            checkboxViewModel.isChecked.subscribe(boundValue);
            boundValue.subscribe(checkboxViewModel.isChecked);

            ko.renderTemplate(template, checkboxViewModel, renderingConfig, element, 'replaceChildren');

            return { controlsDescendantBindings: true };
        }
    };

    /*
     *   Checkbox List Binding
     *
     *   <div data-bind="checkboxlist: { options: myOptions, selectedOptions }"></div>
     */

    var checkboxListTemplateString = ['<!-- ko if: selectAllEnabled -->', '   <div class="checkbox-list" data-bind="css: skin()">', '       <label class="checkbox" data-bind="css: { checked: selectAll, focused: selectAllHasFocus }" onclick="">', '           <span class="indicator" data-bind="attr: {\'data-selenium\': \'selectAll\' }" ></span>', '           <input type="checkbox" value="true" name="selectAll" data-bind="checked: selectAll,', '               attr: { tabindex: tabIndex },', '           event: { ', '               focusin: applyFocusToSelectAll,', '               focusout: removeFocusFromSelectAll }"/>', '           <!-- ko text: selectAllPrompt --><!-- /ko -->', '       </label>', '   </div>', '<!-- /ko -->', '<div class="checkbox-list" data-bind="foreach: options, css: skin()">', '   <label class="checkbox" data-bind="css: { checked: isChecked, focused: hasFocus }">', '       <span class="indicator" data-bind="attr: { \'data-selenium\': value}" ></span>', '       <input type="checkbox" data-bind="', '           click: $parent.clickCallback,', '           attr: {', '               value: value,', '               name: value,', '               tabindex: $parent.tabIndex },', '           event: { ', '               focusin: applyFocus,', '               focusout: removeFocus },', '           checked: isChecked" />', '       <!-- ko text: label --><!-- /ko -->', '   </label>', '</div>'].join('\n');

    templateEngine.addTemplate('checkboxListTemplate', checkboxListTemplateString);

    var CheckboxModel = function CheckboxModel(value, label, state, children) {
        var self = this;

        self.value = ko.observable(value || true);
        self.label = ko.observable(label || '');
        self.state = ko.observable(state || 'unchecked');
        self.hasFocus = ko.observable(false);

        self.isChecked = ko.computed({
            read: function read() {
                return self.state() === 'checked';
            },
            write: function write(checked) {
                var children = self.children();
                if (children) {
                    for (var child in children) {
                        if (children.hasOwnProperty(child)) {
                            children[child].isChecked(checked);
                        }
                    }
                }

                self.state(checked ? 'checked' : 'unchecked');
            }
        });

        self.isIndeterminate = ko.computed({
            read: function read() {
                return self.state() === 'indeterminate';
            },
            write: function write(indeterminate) {
                self.state(indeterminate ? 'indeterminate' : 'unchecked');
            }
        });

        self.children = ko.computed(function () {
            var childOptions = ko.unwrap(children);

            if (!childOptions) return null;

            var mappedChildren = childOptions.map(function (child) {
                return new CheckboxModel(child.value, child.label, child.state, child.children);
            });

            return mappedChildren;
        });

        self.selected = ko.computed(function () {
            var value = self.value();
            if (self.isChecked()) {
                return value;
            }

            var children = self.children() || [];

            if (!children.length) {
                return null;
            }

            var selectedChildren = [];
            for (var child in children) {
                if (children.hasOwnProperty(child)) {
                    var selected = children[child].selected();
                    if (selected) selectedChildren.push(selected);
                }
            }

            if (selectedChildren.length === children.length) {
                self.isChecked(true);
                return value;
            } else if (selectedChildren.length) {
                var valueToReturn = {};
                valueToReturn[value] = selectedChildren;
                self.isIndeterminate(true);
                return valueToReturn;
            }
        });

        self.tally = ko.computed(function () {
            if (self.isChecked()) return uship.loc('MessAll');

            var selected = self.selected();
            var value = self.value();
            if (selected && selected[value]) return selected[value].length;

            return '';
        });

        self.applyFocus = function () {
            self.hasFocus(true);
        };

        self.removeFocus = function () {
            self.hasFocus(false);
        };
    };

    var CheckboxListViewModel = function CheckboxListViewModel(configuration) {
        var self = this;

        self.model = configuration.model;
        self.context = configuration.context;
        self.boundValue = configuration.boundValue;
        self.boundOptions = configuration.options;

        self.optionsText = ko.unwrap(configuration.optionsText);
        self.optionsValue = ko.unwrap(configuration.optionsValue);
        self.options = ko.observableArray();
        self.skin = ko.observable(configuration.skin);
        self.clickCallback = configuration.clickCallback;
        self.tabIndex = configuration.tabIndex;

        self.handleChkClick = function (option) {
            self.clickCallback && self.clickCallback(option);
        };

        self.selected = ko.computed(function () {
            var options = self.options();
            var selected = [];

            if (!options.length) return selected;

            ko.utils.arrayForEach(options, function (option) {
                if (option.isChecked()) selected.push(option.value.peek());
            });

            var uniqueSelected = ko.utils.arrayGetDistinctValues(selected).sort();

            self.boundValue(uniqueSelected);

            return uniqueSelected;
        });

        self.setOptions = function (options) {
            var selectedOptions = ko.unwrap(self.boundValue);

            var myOptions = ko.utils.arrayMap(ko.unwrap(options), function (option) {
                var state = selectedOptions.indexOf(option[self.optionsValue]) > -1 ? 'checked' : 'unchecked';
                return new CheckboxModel(option[self.optionsValue], option[self.optionsText], state);
            });
            self.options(myOptions);
        };

        ko.isObservable(self.boundOptions) && self.boundOptions.subscribe(function (newOptions) {
            self.setOptions(newOptions);
        });

        self.setSelectedOptions = function (selectedOptions) {
            self.options().forEach(function (option) {
                option.isChecked(selectedOptions.indexOf(option.value()) > -1);
            });
        };

        self.setOptions(self.boundOptions);

        self.boundValue.subscribe(self.setSelectedOptions, self);

        self.selectAllEnabled = ko.observable(!!configuration.selectAll);
        self.selectAllPrompt = ko.observable(configuration.selectAll);
        self.selectAllHasFocus = ko.observable(false);

        self.selectAll = ko.computed({
            read: function read() {
                return self.selected().length === self.options().length;
            },
            write: function write(shouldSelectAll) {
                self.options().forEach(function (option) {
                    option.isChecked(shouldSelectAll);
                });
            }
        });

        self.applyFocusToSelectAll = function () {
            self.selectAllHasFocus(true);
        };

        self.removeFocusFromSelectAll = function () {
            self.selectAllHasFocus(false);
        };
    };

    var checkboxListBindingHandler = {
        init: function init(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

            var value = valueAccessor();
            var template = value.template || 'checkboxListTemplate';
            var renderingConfig = value.template ? {} : templateConfig;

            var config = {
                model: viewModel,
                context: bindingContext,
                element: element,
                boundValue: value.selected,
                options: value.options,
                optionsText: value.optionsText || 'label',
                optionsValue: value.optionsValue || 'value',
                selectAll: value.selectAll || false,
                skin: value.skin || '',
                clickCallback: value.clickCallback,
                tabIndex: value.tabIndex || 0
            };

            var checkboxListViewModel = new CheckboxListViewModel(config);

            ko.renderTemplate(template, checkboxListViewModel, renderingConfig, element, 'replaceChildren');

            return { controlsDescendantBindings: true };
        }
    };

    /*
     *  Drillable Checkbox List Binding
     *
     *  <div data-bind="drillable: { options: myOptions, selected: selectedOptions }"></div>
     */

    var drillableTemplateString = ['<div class="drillable">', '<!-- ko if: parents().length -->', '<div class="breadcrumbs" data-bind="foreach: parents">', '<span class="breadcrumb" data-bind="text: label"></span> ', '</div>', '<div class="nav">', '<div class="wrap">', '<button class="button primary" data-bind="click: moveBack">', '<span aria-hidden="true" class="icon-arrow-left"></span> <span data-bind="loc: \'Mobile_Done\'"></span>', '</button>', '</div>', '</div>', '<!-- /ko -->', '<!-- ko if: selectAllEnabled -->', '<div class="checkbox-list boxy">', '<label class="checkbox" data-bind="css: { checked: selectAll }" onclick="">', '<span class="indicator"></span>', '<input type="checkbox" value="true" name="selectAll" data-bind="checked: selectAll"/>', '<!-- ko text: selectAllPrompt --><!-- /ko -->', '</label>', '</div>', '<!-- /ko -->', '<div class="checkbox-list boxy" data-bind="foreach: options">', '<label class="checkbox" data-bind="css: { checked: isChecked, indeterminate: isIndeterminate }" onclick="">', '<span class="indicator"></span>', '<input type="checkbox" data-bind="attr: { value: value, name: value }, checked: isChecked"/>', '<!-- ko text: label --><!-- /ko -->',
    // ' - state: (<!-- ko text: state --><!-- /ko -->)',
    // ' isChecked: (<!-- ko text: isChecked --><!-- /ko -->)',

    '<!-- ko if: children -->', '<span class="tally" data-bind="text: tally"></span>', '<a class="drill" href="#" data-bind="click: function () { $parent.drillDown($data) }">', '<span aria-hidden="true" class="icon-caret-right"></span>', '</a>', '<!-- /ko -->', '</label>', '</div>', '<!-- ko if: validate && !isDrilledDown() -->', '<small class="error" data-bind="validationMessage: validate"></small>', '<!-- /ko -->', '<!-- ko if: !isDrilledDown() && submit -->', '<button class="large button primary" data-bind="click: submit, loc: \'MainContinue\'"></button>', '<!-- /ko -->', '</div>' //,
    //'Drillable Selected: <pre data-bind="text: ko.toJSON(selected, null, 2)"></pre><hr />'
    ].join('');

    templateEngine.addTemplate('drillableTemplate', drillableTemplateString);

    var DrillableListViewModel = function DrillableListViewModel(configuration) {
        var self = this;

        self.element = configuration.element;
        self.boundValue = configuration.boundValue;
        self.boundOptions = configuration.options;

        self.optionsText = ko.unwrap(configuration.optionsText);
        self.optionsValue = ko.unwrap(configuration.optionsValue);
        self.optionsChildren = ko.unwrap(configuration.optionsChildren);
        self.options = ko.observableArray();

        self.parents = ko.observableArray();
        self.parentLists = ko.observableArray();

        self.validate = configuration.validate;

        self.selected = ko.computed(function () {
            var options = self.options();
            var selected = [];

            if (!options.length) return selected;
            ko.utils.arrayForEach(options, function (option) {
                var value = option.value();

                if (option.isChecked()) {
                    selected.push(value);
                } else if (option.children) {
                    var optionSelected = option.selected();
                    if (optionSelected) {
                        if (configuration.flatten && typeof optionSelected !== 'string') {
                            selected = selected.concat(self.flattenSelected(optionSelected[value]));
                        } else {
                            selected.push(optionSelected);
                        }
                    }
                }
            });

            var uniqueSelected = ko.utils.arrayGetDistinctValues(selected).sort();

            self.boundValue(uniqueSelected);

            return uniqueSelected;
        }).extend({ throttle: 1 });

        self.isDrilledDown = ko.computed(function () {
            return self.parents().length > 0;
        });

        if (configuration.isDrilledDown) {
            self.isDrilledDown.subscribe(function (newValue) {
                configuration.isDrilledDown(newValue);
            });
        }

        self.setChildrenState = function (childOptions, selectedValues) {
            return ko.utils.arrayMap(childOptions, function (opt) {
                var childOptions = ko.unwrap(opt[self.optionsChildren]);
                if (childOptions) {
                    opt.children = self.setChildrenState(childOptions, selectedValues);
                }
                opt.label = opt[self.optionsText];
                opt.value = opt[self.optionsValue];
                opt.state = selectedValues.indexOf(opt[self.optionsValue]) > -1 ? 'checked' : 'unchecked';
                return opt;
            });
        };

        self.mapCheckBoxes = function (checkBoxData, selectedValues) {
            var withState = self.setChildrenState(checkBoxData, selectedValues);
            var checkBoxModels = ko.utils.arrayMap(withState, function (obj) {
                if (obj.children) {
                    return new CheckboxModel(obj[self.optionsValue], obj[self.optionsText], obj.state, obj.children);
                }
                return new CheckboxModel(obj[self.optionsValue], obj[self.optionsText], obj.state);
            });
            return checkBoxModels;
        };

        self.setOptions = function (options) {
            var selectedOptions = ko.unwrap(self.boundValue);
            var myOptions = self.mapCheckBoxes(ko.unwrap(options), selectedOptions);
            self.options(myOptions);
        };

        self.selectAllEnabled = ko.observable(!!configuration.selectAll);
        self.selectAllPrompt = ko.computed(function () {
            return self.parents().length ? uship.loc('Mobile_Select_All') || configuration.selectAll : configuration.selectAll;
        });
        self.selectAll = ko.computed({
            read: function read() {
                return self.selected().length && self.selected().length === self.options().length;
            },
            write: function write(shouldSelectAll) {
                self.options().forEach(function (option) {
                    option.isChecked(shouldSelectAll);
                });

                self.selectAll();
            }
        }).extend({ throttle: 1 });

        self.submit = configuration.submit;

        self.lockBackButton = function () {
            var topPostion = $(self.element).offset().top;
            var bottomPosition = topPostion + $(self.element).height();
            var scrollHeight = $(window).scrollTop();

            if (scrollHeight > topPostion && scrollHeight < bottomPosition) {
                $(self.element).find('.nav').addClass('lock');
            } else {
                $(self.element).find('.nav').removeClass('lock');
            }
        };

        self.drillDown = function (selected) {
            self.parents.push(selected);
            self.parentLists.push(self.options());

            var childOptions = ko.isObservable(selected[self.optionsChildren]) ? selected[self.optionsChildren]() : selected[self.optionsChildren];
            self.options(childOptions);

            if (selected.isChecked()) self.selectAll(true);

            $(window).on('scroll.drillable', self.lockBackButton);
        };

        self.moveBack = function () {
            var parent = self.parents.pop();
            var selected = self.selected();

            if (selected.length > 0) {
                if (self.selectAll()) {
                    parent.isChecked(true);
                } else {
                    parent.isIndeterminate(true);
                }
            } else {
                parent.isChecked(false);
            }

            var parentList = self.parentLists.pop();

            self.options(parentList);

            if (!self.parents().length) $(window).off('.drillable');
        };

        self.flattenSelected = function (selected) {
            var selectedArr = [];

            for (var item in selected) {
                if (selected.hasOwnProperty(item)) {
                    if (typeof selected[item] === 'string' || typeof selected[item] === 'number') {
                        selectedArr.push(selected[item]);
                    } else {
                        selectedArr = selectedArr.concat(self.flattenSelected(selected[item]));
                    }
                }
            }
            return selectedArr;
        };

        self.boundOptions.subscribe(function (newOptions) {
            self.setOptions(newOptions);
        });

        self.setOptions(self.boundOptions);
    };

    var drillableBindingHandler = {
        init: function init(element, valueAccessor, allBindingsAccessor, viewModel) {

            var value = valueAccessor();
            var template = value.template || 'drillableTemplate';

            var config = {
                element: element,
                boundValue: value.selected,
                options: value.options,
                optionsText: value.optionsText || 'label',
                optionsValue: value.optionsValue || 'value',
                optionsChildren: value.optionsChildren || 'children',
                flatten: value.flatten || false,
                selectAll: value.selectAll || false,
                validate: value.validate,
                submit: value.submit && value.submit.bind(viewModel),
                isDrilledDown: value.isDrilledDown
            };

            var drillableListViewModel = new DrillableListViewModel(config);

            ko.renderTemplate(template, drillableListViewModel, templateConfig, element, 'replaceChildren');

            return { controlsDescendantBindings: true };
        }
    };

    /*
     *  Dropdown Binding
     *
     *  <div data-bind="dropdown: { options: myOptions, selected: selectedOptions }"></div>
     */

    var dropdownTemplateString = ['<div class="custom dropdown" data-bind="css: css">', '    <div class="current" data-bind="css: getFacadeClasses()">', '        <span class="val" data-bind="text: selectedText"></span>', '    </div>', '    <select data-bind="', '        value: selected,', '        options: options,', '        optionsValue : optionsValue,', '        optionsText: optionsText,', '        optionsCaption: (includeCaption) ? optionsCaption : null,', '        valueAllowUnset: valueAllowUnset,', '        attr: { ', '            name: name,', '            tabindex: tabIndex,', '            \'data-selenium\': seleniumTag},', '        event: { ', '            focusin: applyFocus,', '            focusout: removeFocus,', '            mouseover: applyHover,', '            mouseout: removeHover }">', '    </select>', '</div>'].join('\n');

    templateEngine.addTemplate('dropdownTemplate', dropdownTemplateString);

    function DropdownViewModel(configuration) {
        this.selected = configuration.selected;
        this.options = configuration.options;
        this.optionsText = configuration.optionsText;
        this.optionsValue = configuration.optionsValue;
        this.optionsCaption = configuration.optionsCaption;
        this.name = configuration.name;
        this.css = configuration.css;
        this.facadeCss = configuration.facadeCss;
        this.tabIndex = configuration.tabIndex;
        this.seleniumTag = configuration.seleniumTag;
        this.includeCaption = configuration.includeCaption;
        this.hasErrors = false;
        this.valueAllowUnset = configuration.valueAllowUnset;

        this.isFacadeHovered = ko.observable(false);
        this.isFacadeFocused = ko.observable(false);

        this.initializeSelectedText(configuration.selectedText);
        this.initializeValidation(this.selected);
    }

    uship.utils.extend(DropdownViewModel.prototype, {

        initializeSelectedText: function initializeSelectedText(selectedTextObsv) {

            // A passed-in observer may want to store the selected value's display text
            // If not, selectedText is read-only
            var observer = ko.isObservable(selectedTextObsv) ? this.setSelectedText.bind(this, selectedTextObsv) : uship.utils.noop;

            if (ko.unwrap(this.options).length) {
                observer(this.selected());
            }

            this.selectedText = ko.computed({
                read: this.getSelectedText,
                write: observer,
                owner: this
            }).subscribeTo(this.selected);

            if (ko.isObservable(this.options)) {
                this.options.subscribe(function () {
                    observer(this.selected());
                }.bind(this));
            }
        },

        initializeValidation: function initializeValidation(observableWithValidation) {

            if (!ko.hasOwnProperty('validation') || !ko.isObservable(observableWithValidation) || !observableWithValidation.isValid) return;

            this.hasErrors = ko.computed(this.observableHasErrors, observableWithValidation);
        },

        getFacadeClasses: function getFacadeClasses() {
            var defaults = {
                focus: this.isFacadeFocused,
                hover: this.isFacadeHovered,
                error: this.hasErrors
            };

            return uship.utils.extend(defaults, this.facadeCss);
        },

        observableHasErrors: function observableHasErrors() {
            return this.isModified() && !this.isValidating() && !this.isValid();
        },

        getSelectedText: function getSelectedText() {
            var selectedText = ko.unwrap(this.optionsCaption),
                selectedOption = this.findSelectedOption(ko.unwrap(this.selected));

            if (selectedOption) selectedText = selectedOption[this.optionsText];

            return selectedText;
        },

        findSelectedOption: function findSelectedOption(val) {
            var optionsValue = this.optionsValue;

            var selectedOption = ko.utils.arrayFirst(ko.unwrap(this.options), function (option) {
                return option[optionsValue] == val;
            });

            if (!selectedOption) return undefined;

            return selectedOption;
        },

        setSelectedText: function setSelectedText(obsv, val) {
            obsv(this.getSelectedText(val));
        },

        applyFocus: function applyFocus() {
            this.isFacadeFocused(true);
        },

        removeFocus: function removeFocus() {
            this.isFacadeFocused(false);
        },

        applyHover: function applyHover() {
            this.isFacadeHovered(true);
        },

        removeHover: function removeHover() {
            this.isFacadeHovered(false);
        }

    });

    var dropdownBindingHandler = {
        init: function init(element, valueAccessor) {
            var value = ko.unwrap(valueAccessor());
            var template = value.template || 'dropdownTemplate';

            if (!value.hasOwnProperty('optionsCaption')) {
                value.optionsCaption = 'Select a value...';
            }

            if (!value.hasOwnProperty('includeCaption')) {
                value.includeCaption = true;
            }

            if (!value.hasOwnProperty('valueAllowUnset')) {
                value.valueAllowUnset = true;
            }

            var config = {
                element: element,
                selected: value.selected || ko.observable(),
                selectedText: value.selectedText,
                options: value.options || [],
                optionsText: value.optionsText || 'label',
                optionsValue: value.optionsValue || 'value',
                optionsCaption: value.optionsCaption,
                includeCaption: value.includeCaption,
                valueAllowUnset: value.valueAllowUnset,
                name: value.name,
                css: value.css,
                facadeCss: constructCssBinding(value.facadeCss),
                tabIndex: value.tabIndex || 0,
                seleniumTag: value.seleniumTag
            };

            var dropdownViewModel = new DropdownViewModel(config);

            ko.renderTemplate(template, dropdownViewModel, templateConfig, element, 'replaceChildren');

            return { controlsDescendantBindings: true };
        }
    };

    function constructCssBinding(val) {
        if (!val) return {};
        if (!uship.utils.isObject(val)) throw new Error('Pass facadeCss settings as an object literal where key is the name of the CSS class to apply and value is the expression that determines whether or not to apply it');
        return val;
    }

    function closeAllContentDropdowns() {

        var dropdowns = $('.dropdown-content');

        for (var i = 0; i < dropdowns.length; i++) {
            var context = ko.contextFor(dropdowns[i]);

            if (context) {
                var viewModel = context.$data;
                if (ko.isObservable(viewModel.isOpen) && viewModel.isOpen()) {
                    viewModel.close();
                }
            }
        }
    }

    var dropdownContentTemplateString = ['<div class="custom dropdown dropdown-content">', '<a href="#" class="current" data-bind="click: toggle, html: prompt"></a>', '<a href="#" class="selector"></a>', '<!-- ko \'if\': isOpen -->', '<div data-bind="template: template" style="position: relative; z-index: 1000;"></div>', '<!-- /ko -->', '</div>'].join('');

    templateEngine.addTemplate('dropdownContentTemplate', dropdownContentTemplateString);

    var DropdownContentViewModel = function DropdownContentViewModel(opts) {
        var self = this;
        self.template = opts.template;
        self.prompt = opts.prompt;

        self.isOpen = ko.observable(false);

        self.open = function (data, event) {
            self.isOpen(true);
            $(document).on('click.dropdown', closeAllContentDropdowns);
        };
        self.close = function (data, event) {
            self.isOpen(false);
            $(document).off('.dropdown');
        };
        self.toggle = function (data, event) {
            closeAllContentDropdowns();
            event.stopPropagation();
            !self.isOpen() ? self.open() : self.close();
        };
    };

    ko.bindingHandlers.dropdownContent = {
        init: function init(element, valueAccessor, allBindingsAccessor) {
            var template = valueAccessor();
            var prompt = ko.unwrap(allBindingsAccessor().prompt) || 'Click to Open...';

            var dropdownContentViewModel = new DropdownContentViewModel({ template: template, prompt: prompt });

            ko.renderTemplate('dropdownContentTemplate', dropdownContentViewModel, templateConfig, element, 'replaceChildren');

            return { controlsDescendantBindings: true };
        }
    };

    var timeFrameTemplateString = ['<div class="row" style="position: relative;">', '<div class="small-6 columns" style="position: relative;">', '<input type="text" data-bind="placeholder: uship.loc(\'dateOptional\')" class="pickadate range-start radius" autofocus=true readonly />', '<span class="icon-close" data-bind="click: clearEarliest, visible: earliest"></span>', '</div>', '<span class="icon-arrow-right" style="position: absolute; left: 50%; top: 25%; font-size: 0.75em; margin: 0 -0.5em; color: #999;"></span>', '<div class="small-6 columns" style="position: relative;">', '<input type="text" data-bind="placeholder: uship.loc(\'dateOptional\')" class="pickadate range-end radius" readonly />', '<span class="icon-close" data-bind="click: clearLatest, visible: latest"></span>', '</div>', '</div>', '<div class="row" style="margin-bottom: 10px">', '<div class="small-12 columns" id="pickadate-container" style="min-height: 260px; margin: 0 auto;"></div>', '<div style="clear: both;"></div>', '</div>', '<div class="row hide-for-small">', '<div class="small-12 columns">', '<button name="done" class="button primary radius" data-bind="loc: \'Mobile_Done\', click: close" style="margin: 0;"></button>', '</div>', '</div>'].join('');

    var mobileTimeframeDropdown = ['<div class="modalWrapper">', '<div class="modal-mobile">', '<div class="modal-content">', '<div class="timeframe-dropdown" data-bind="template: { name: template, afterRender: setupPickers }"></div>', '</div>', '<div class="page-header">', '<div class="top-nav">', '<div class="modal-title small-6 columns small-offset-3" data-bind="text: title"></div>', '<div class="small-3 columns text-right"><a href="#" class="small button primary" data-bind="click: close, loc: \'Mobile_Done\'"></a></div>', '</div> ', '</div>', '</div>', '</div>'];

    var desktopTimeframeDropdown = ['<div style="position: absolute; z-index: 1000;">', '<div class="timeframe-dropdown" data-bind="template: { name:  template, afterRender: setupPickers }"></div>', '</div>'];

    var timeFrameDropdownTemplateString = [].concat('<div class="dropdown-content" style="border: 1px solid #ccc;background-color:#FAFAFA;cursor:pointer;font-size: 14px;" data-bind="css: facadeCss">', '<span style="line-height:2.6em;padding: 0 0.6em;display:inline-block; width:100%;" data-bind="click: toggle, html: prompt"></span>', '<span class="icon-calendar" data-bind="click: toggle" style="line-height: 2.6em; position: absolute; right: 0; top: 0; width: 2.6875em; text-align: center; cursor: pointer;"></span>', '<!-- ko \'if\': isOpen() -->', '<!-- ko if: windowWidth() >= 768 -->', desktopTimeframeDropdown, '<!-- /ko -->', '<!-- ko if: windowWidth() < 768 -->', mobileTimeframeDropdown, '<!-- /ko -->', '<!-- /ko -->', '</div>').join('');

    templateEngine.addTemplate('timeframeDropdownTemplate', timeFrameDropdownTemplateString);

    var TimeFramePickerViewModel = function TimeFramePickerViewModel(config) {
        var self = this;

        this.template = config.template || 'timeframe_template';
        this.prompt = config.prompt || 'Select a Date';
        this.title = uship.loc(config.title);
        this.boundValue = config.value || ko.observable();
        this.startOption = config.startOption || 'earliest';
        this.endOption = config.endOption || 'latest';
        this.facadeCss = constructCssBinding(config.facadeCss);

        var initalValue = ko.toJS(self.boundValue);

        this.earliest = ko.observable(initalValue[self.startOption]);
        this.latest = ko.observable(initalValue[self.endOption]);

        this.earliestMin = ko.computed(function () {
            return ko.unwrap(config.min) || true;
        });
        this.earliestMax = ko.computed(function () {
            return self.latest() || 179;
        });
        this.latestMin = ko.computed(function () {
            return self.earliest() && self.earliest().getTime() > new Date().getTime() ? self.earliest() : 1;
        });
        this.latestMax = ko.computed(function () {
            return ko.unwrap(config.max) || 179;
        });

        this.rangeStartPicker = ko.observable();
        this.rangeEndPicker = ko.observable();

        this.isOpen = ko.observable(false);

        this.showHeader = showHeader;
        this.hideHeader = hideHeader;

        this.open = function (data, event) {
            self.isOpen(true);
            this.hideHeader();
            $(document).on('click.dropdown', closeAllContentDropdowns);
        };
        this.close = function (data, event) {
            self.isOpen(false);
            this.showHeader();
            $(document).off('.dropdown');
        };
        this.toggle = function (data, event) {
            var open = self.isOpen();
            closeAllContentDropdowns();
            event.stopPropagation();
            !open ? self.open() : self.close();
        };
        this.clearEarliest = function (data, event) {
            self.earliest(undefined);
            self.rangeStartPicker().clear().open();
            self.rangeEndPicker().set('min', self.earliestMin());
            event.stopPropagation();
        };
        this.clearLatest = function (data, event) {
            self.latest(undefined);
            self.rangeEndPicker().clear().open();
            self.rangeStartPicker().set('max', self.latestMax());
            event.stopPropagation();
        };

        this.setupPickers = function () {
            setTimeout(function () {
                var $rangeStartInput = $('.range-start').pickadate({
                    range: 'earliest',
                    container: '#pickadate-container',
                    format: uship.globalize.culture().calendar.patterns.d.toLowerCase(),
                    today: '',
                    clear: '',
                    min: self.earliestMin(),
                    max: self.earliestMax(),
                    onOpen: function onOpen() {
                        var configTime = ko.unwrap(config.max);
                        var latestTime = self.latest();

                        if (!latestTime && !configTime) return;

                        if (latestTime && configTime) {
                            this.set('max', new Date(Math.min(configTime.getTime(), latestTime.getTime())));
                        } else {
                            this.set('max', latestTime || configTime);
                        }
                    },
                    onClose: function onClose() {
                        setTimeout(function () {
                            rangeEndPicker.open();
                        }, 0);
                    },
                    onSet: function onSet(event) {
                        if (!event.select) return;
                        self.earliest(new Date(event.select));
                    }
                });

                var $rangeEndInput = $('.range-end').pickadate({
                    range: 'latest',
                    container: '#pickadate-container',
                    min: self.latestMin(),
                    max: self.latestMax(),
                    format: uship.globalize.culture().calendar.patterns.d.toLowerCase(),
                    today: '',
                    clear: '',
                    onOpen: function onOpen() {
                        //var min = Math.max(self.earliest().getTime(), ko.unwrap(self.min).getTime())
                        if (self.earliest()) this.set('min', self.earliest());
                    },
                    onClose: function onClose() {
                        setTimeout(function () {
                            rangeStartPicker.open();
                        }, 0);
                    },
                    onSet: function onSet(event) {
                        if (!event.select) return;

                        self.latest(new Date(event.select));
                    }
                });

                var rangeStartPicker = $rangeStartInput.pickadate('picker');
                var rangeEndPicker = $rangeEndInput.pickadate('picker');

                var boundValue = ko.toJS(self.boundValue) || {};

                if (boundValue) {
                    var initialStartValue = boundValue[ko.unwrap(self.startOption)];
                    var initialEndValue = boundValue[ko.unwrap(self.endOption)];

                    if (initialStartValue && initialStartValue.getDate()) rangeStartPicker.set('select', initialStartValue);
                    if (initialEndValue && initialEndValue.getDate()) rangeEndPicker.set('select', initialEndValue);
                }

                self.rangeStartPicker(rangeStartPicker);
                self.rangeEndPicker(rangeEndPicker);

                $rangeStartInput.focus();
            }, 1);
        };

        this.tearDownPickers = function () {
            var rangeStartPicker = self.rangeStartPicker();
            var rangeEndPicker = self.rangeEndPicker();

            rangeStartPicker.stop();
            rangeEndPicker.stop();
        };

        this.earliest.subscribe(function (earliest) {
            var rangeEndPicker = self.rangeEndPicker();

            if (!rangeEndPicker) return;

            rangeEndPicker.set('min', earliest);
            rangeEndPicker.set('highlight', earliest);

            var rangeEndValue = rangeEndPicker.get('value');

            if (rangeEndValue) {
                var latest = new Date(rangeEndValue);
                if (earliest > latest) rangeEndPicker.setDate(startDate);
            }

            self.boundValue[self.startOption](earliest);
        });

        this.latest.subscribe(function (latest) {
            var rangeStartPicker = self.rangeStartPicker();

            if (!rangeStartPicker) return;

            rangeStartPicker.set('max', latest);
            rangeStartPicker.set('highlight', latest);

            self.boundValue[self.endOption](latest);
        });

        this.windowWidth = ko.observable(root.document.body.offsetWidth);

        $(root).on('resize.modal', function () {
            self.windowWidth(root.document.body.offsetWidth);
        });

        this.isOpen.subscribe(function (isOpen) {
            $('body').toggleClass('fixed', isOpen && self.windowWidth() < 768);

            if (!isOpen) self.tearDownPickers();
        });
    };

    var timeframeDropdownBindingHandler = {
        init: function init(element, valueAccessor) {
            uship.utils.injectTemplate('timeframe_template', timeFrameTemplateString);

            var value = ko.unwrap(valueAccessor()),
                timeFramePickerViewModel = new TimeFramePickerViewModel(value);

            ko.renderTemplate('timeframeDropdownTemplate', timeFramePickerViewModel, templateConfig, element, 'replaceChildren');

            return { controlsDescendantBindings: true };
        }
    };

    ko.bindingHandlers.addressRange = timeframeDropdownBindingHandler;
    ko.bindingHandlers.timeframeDropdown = timeframeDropdownBindingHandler;

    /*
     *  Static Mapbox Binding
     *
     *  <div data-bind="mapbox: { lat: 'myContentTemplate', lng: myData }"></div>
     */

    var createMapboxStaticUrl = function createMapboxStaticUrl(lat, lng, config) {
        if (!lat || !lng) return null;

        lat = lat.toFixed(3);
        lng = lng.toFixed(3);

        var mapUrlBase = '//a.tiles.mapbox.com/v3/uship.map-doms27z9',

        // pin = config.pin ? 'url-' + encodeURIComponent(config.pin) : 'pin-s+0d620a';
        pin = 'pin-s';
        var userPin = pin + '(' + lng + ',' + lat + ')',
            uShipPin = 'url-t.ushipcdn.com%2Fimages%2Ficons%2Fuship-marker.png(-97.7424,30.2645)',
            zoom = '13',
            dimRatio = isRetina ? 1.75 : 1.25;
        var dims = parseInt(config.width * dimRatio) + 'x' + parseInt(config.height * dimRatio);

        return mapUrlBase + '/' + userPin + /* ',' + uShipPin + */'/' + lng + ',' + lat + ',' + zoom + '/' + dims + '.png';
    };

    var mapboxStaticTemplateString = '<img data-bind="attr: { src: src }, visible: src" />';

    templateEngine.addTemplate('mapboxStaticTemplate', mapboxStaticTemplateString);

    var mapboxStaticBindingHandler = {
        init: function init(element, valueAccessor, allBindingsAccessor, viewModel) {
            var value = ko.utils.unwrapObservable(valueAccessor()),
                config = ko.unwrap(value.config) || {};

            var defaults = {
                pin: value.pin
            };

            var mapboxConfig = uship.utils.extend({}, defaults, config);

            var mapboxImgUrl = ko.computed(function () {
                mapboxConfig.width = element.offsetWidth;
                mapboxConfig.height = config.height || 80;
                return createMapboxStaticUrl(ko.unwrap(value.lat), ko.unwrap(value.lng), mapboxConfig);
            }, this).extend({ throttle: 1 });

            ko.renderTemplate('mapboxStaticTemplate', { src: mapboxImgUrl }, templateConfig, element, 'replaceChildren');

            return { controlsDescendantBindings: true };
        }
    };

    /*
     *  Modal Binding
     *
     *  <div data-bind="modal: { content: 'myContentTemplate', data: myData, open: showModal }"></div>
     */

    var modalTemplateString = ['<!-- ko \'if\': open -->', '<div class="modalWrapper">', '<!-- ko \'if\': blankModal -->', '<!-- ko \'if\': windowWidth() >= 768 -->', '<div class="modal-desktop panel" style="z-index: 1002;" >', '<span id="modalDismissButton" data-bind="click: onCancel" style="display: block; float: right; box-shadow: 0 0 12px -2px #333; position: relative; left: 12px; bottom: 12px; border-radius: 50%; width: 30px; background-color: #EFEFEF; height: 30px; text-align: center; border: none; line-height:35px;">', '<span class="icon-close" style="color: #878787;"></span>', '</span>', '<!-- ko \'if\': !$data.showTextTitle() -->', '<!-- ko template: { name: titleTemplate, data: data } --><!-- /ko -->', '<!-- /ko -->', '<!-- ko template: { name: content, data: data } --><!-- /ko -->', '</div>', '<div class="modal-overlay"></div>', '<!-- /ko -->', '<!-- /ko --> ', '<!-- ko \'if\': !blankModal && windowWidth() >= 768 -->', '<div class="modal-desktop panel" style="z-index: 1002;">', '<div class="row modal-top-bar" style="background-color: #F5F5F5;border-bottom: 1px solid #E5E5E5;margin: 0 auto;">', '<h3 class="small-11 large-11 medium-11 columns panel-title"  style="border-bottom: none;" data-bind="text: title, visible: $data.showTextTitle()"></h3>', '<div class="small-1 large-1 medium-1 columns" style="padding: 15px; font-size:15px; text-align: center;">', '<a class="close-reveal-modal" style="color: #8e8e8e;" data-bind="if: $data.showCornerCancel, click: onCancel"><div aria-hidden="true" class="icon-close" ></div></a>', '</div>', '</div>', '<!-- ko \'if\': !$data.showTextTitle() -->', '<!-- ko template: { name: titleTemplate, data: data } --><!-- /ko -->', '<!-- /ko -->', '<!-- ko template: { name: content, data: data } --><!-- /ko -->', '<div class="panel-section" style="background-color: #F5F5F5">', '<div>', '<button name="modal-done" class="button primary" data-bind="click: validateSubmit, loc: $data.doneButtonLocalizationKey, visible: $data.showSubmit" style="margin-right: 20px"></button>', '<button name="modal-cancel" class="button secondary" data-bind="click: onCancel, loc: $data.cancelButtonLocalizationKey, visible: $data.showCancel"></button>', '<!-- ko \'if\': $data._remove -->', '<button name="modal-remove" class="button alert right" data-bind="click: $data._remove, loc: \'MainRemoveItem\', visible: $data.showRemove"></button>', '<!-- /ko -->', '</div>', '</div>', '</div>', '<div class="modal-overlay"></div>', '<!-- /ko -->', '<!-- ko \'if\': windowWidth() < 768 -->', '<div class="modal-mobile">', '<div class="modal-content">', '<div data-bind="template: { name: content, data: data }"></div>', '<div style="width: 100%; position: relative; padding: 0 10px;">', '<button name="modal-remove" style="margin: 10px 0;" class="button alert expand" data-bind="click: $data._remove, loc: \'MainRemoveItem\', visible: $data.showRemove"></button>', '</div>', '</div>', '<div class="page-header">', '<div class="top-nav">', '<div class="left"><button name="modal-cancel" class="small button secondary" data-bind="click: onCancel, loc: \'MainCancel\', visible: $data.showCancel"></button></div>', '<div class="right"><button name="modal-done" class="small button primary" data-bind="click: validateSubmit, loc: \'Mobile_Done\'"></button></div>', '<div class="modal-title" data-bind="text: shortTitle"></div>', '</div> ', '</div>', '</div>', '<!-- /ko -->', '</div>', '<!-- /ko --> '].join('');

    templateEngine.addTemplate('modalTemplate', modalTemplateString);

    var ModalViewModel = function ModalViewModel(configuration, viewModel) {
        var modal = this,
            tabbableEls;

        this.title = ko.observable(configuration.title);
        this.doneButtonLocalizationKey = configuration.doneButtonLocalizationKey;
        this.cancelButtonLocalizationKey = configuration.cancelButtonLocalizationKey;
        this.showSubmit = configuration.showSubmit;
        this.showRemove = configuration.showRemove;
        this.showCancel = configuration.showCancel;
        this.showCornerCancel = configuration.showCornerCancel;
        this.shouldShowHeader = ko.unwrap(configuration.data.showHeader);
        this.blankModal = configuration.blankModal;
        this.growlId = configuration.growlId;
        this.ajaxPathToDismiss = configuration.ajaxProPath;

        this.showHeader = showHeader;
        this.hideHeader = hideHeader;
        this.windowWidth = ko.observable(root.document.body.offsetWidth);

        this.cancel = function () {
            modal.open(false);
        };

        this.submit = function () {
            return true;
        };

        this._remove = function () {
            configuration.remove.call(viewModel);
            $('body').removeClass('fixed');
        };

        this.showTextTitle = function () {
            return configuration.titleTemplate === '';
        };

        this.validateSubmit = function () {
            var submit = this.submit.bind(viewModel);
            if (submit()) {
                $('body').removeClass('fixed');
                this.showHeader();
                modal.open(false);
            }
        };

        this.disableTabbingNonModalContent = function () {

            var allTabbable = $(document).find(':input, a'),
                modalTabbable = $('.modalWrapper').find(':input, a'),
                toDisable = allTabbable.not(modalTabbable);

            toDisable.each(function () {
                $(this).data('origTabIndex', this.tabIndex);
                this.tabIndex = -1;
            });

            tabbableEls = toDisable;
        };

        this.enableTabbingNonModalContent = function () {
            if (!tabbableEls) return;

            tabbableEls.each(function () {
                this.tabIndex = $(this).data('origTabIndex');
            });

            tabbableEls = undefined;
        };

        this.onCancel = function () {

            if (this.ajaxPathToDismiss && this.growlId > 0) {
                $.ajaxPro({
                    type: 'GET',
                    url: this.ajaxPathToDismiss,
                    method: 'Dismiss',
                    async: false,
                    data: {
                        growlId: ko.toJSON(this.growlId)
                    }
                }).done(function (response) {}).always(function () {
                    $('body').removeClass('fixed');
                    modal.showHeader();
                    modal.enableTabbingNonModalContent();
                    modal.cancel();
                });
            } else {
                $('body').removeClass('fixed');
                modal.showHeader();
                modal.enableTabbingNonModalContent();
                modal.cancel();
            }
        };

        this.onOpen = function (isOpen) {
            if (!isOpen) return;
            $('body').addClass('fixed');
            if (this.shouldShowHeader === false) {
                this.hideHeader();
            }
            this.disableTabbingNonModalContent();
        };

        uship.utils.extend(this, configuration);

        this.open.subscribe(this.onOpen, this);

        $(root).on('resize.modal', function () {
            modal.windowWidth(root.document.body.offsetWidth);
        });

        this.onOpen(this.open());
    };

    var modalBindingHandler = {
        init: function init(element, valueAccessor, allBindingsAccessor, viewModel) {

            var value = ko.utils.unwrapObservable(valueAccessor());
            var config = {
                title: value.title || '',
                shortTitle: value.shortTitle || value.title,
                titleTemplate: value.titleTemplate || '',
                content: value.content,
                data: value.data || {},
                growlId: value.growlId,
                ajaxProPath: value.ajaxProPath,
                blankModal: value.blankModal,
                open: ko.isObservable(value.open) ? value.open : ko.observable(!!value.open),
                submit: value.submit || function () {
                    return true;
                },
                cancel: value.cancel,
                remove: value.remove,
                showSubmit: value.showSubmit !== undefined ? value.showSubmit : true,
                showRemove: value.showRemove,
                showCancel: value.showCancel,
                showCornerCancel: value.showCornerCancel,
                doneButtonLocalizationKey: value.doneButtonLocalizationKey || 'Mobile_Done',
                cancelButtonLocalizationKey: value.cancelButtonLocalizationKey || 'MainCancel'
            };

            var modalViewModel = new ModalViewModel(config, viewModel);
            ko.renderTemplate('modalTemplate', modalViewModel, { templateEngine: templateEngine }, element, 'replaceChildren');
            return { controlsDescendantBindings: true };
        }
    };

    /*
     *  Radio Button List Binding
     *
     *  <div data-bind="radiolist: { options: myOptions, selected: selectedOptions }"></div>
     */

    var radioListTemplateString = ['<div class="radio-list" data-bind="foreach: options, css: skin()">', '<label class="radio" data-bind="css: { checked: $parent.selected() == value }, attr: {\'data-selenium\': value}" onclick="">', '<input type="radio" data-bind="attr: { value: value, name: name }, checked: $parent.selected">', '<span class="indicator"></span>', '<!-- ko text: label --><!-- /ko -->', '</label>', '</div>'].join('');

    templateEngine.addTemplate('radiolistTemplate', radioListTemplateString);

    var RadioListViewModel = function RadioListViewModel(configuration) {
        var self = this;

        self.name = configuration.name || 'radio';
        self.selected = configuration.boundValue;
        self.optionsText = ko.unwrap(configuration.optionsText);
        self.optionsValue = ko.unwrap(configuration.optionsValue);
        self.options = ko.observableArray();
        // knockout doesn't support static classes along side dynamic classes. http://stackoverflow.com/a/21528681/46429
        self.skin = ko.observable('radio-list ' + configuration.skin);
        self.inline = configuration.inline || false;

        self.setOptions = function (options) {
            var myOptions = ko.utils.arrayMap(ko.unwrap(options), function (option) {
                return { value: option[self.optionsValue], label: option[self.optionsText] };
            });
            self.options(myOptions);
        };

        ko.computed(function () {
            self.setOptions(configuration.options);
        });
    };

    var radioListBindingHandler = {
        init: function init(element, valueAccessor) {
            var value = valueAccessor();
            var template = value.template || 'radiolistTemplate';

            var config = {
                element: element,
                boundValue: value.selected,
                options: value.options,
                optionsText: value.optionsText || 'label',
                optionsValue: value.optionsValue || 'value',
                name: value.name || 'radio-group',
                skin: value.skin || '',
                inline: value.inline
            };

            var radioListViewModel = new RadioListViewModel(config);

            ko.renderTemplate(template, radioListViewModel, { templateEngine: templateEngine }, element, 'replaceChildren');

            return { controlsDescendantBindings: true };
        }
    };

    /*
     *  Toggle Binding
     *
     *  <div data-bind="radioToggle: { checked: selected }"></div>
     */

    var radioToggleIndex = 0;

    var radioToggleTemplateString = ['<div class="checkbox-toggle" data-bind="css: { checked: checked }">', '<input type="checkbox" data-bind="checked: checked, attr: { id: id, name: name }," />', '<label data-bind="attr: { \'for\': id }, css: { checked: checked }, html: label"></label>', '</div>'].join('');

    templateEngine.addTemplate('radioToggleTemplate', radioToggleTemplateString);

    var RadioToggleViewModel = function RadioToggleViewModel(configuration) {
        var self = this;

        this.checked = configuration.value;
        this.id = configuration.id;
        this.name = configuration.name;
        this.label = configuration.label;
    };

    var radioToggleBindingHandler = {
        init: function init(element, valueAccessor) {
            var value = valueAccessor(),
                template = value.template || 'radioToggleTemplate',
                boundValue = value.checked || ko.observable(),
                name = value.name || 'toggle',
                label = value.label || '&nbsp;',
                id = value.id || name + '-' + ++radioToggleIndex;

            var config = {
                value: boundValue,
                name: name,
                label: label,
                id: id
            };

            var toggleViewModel = new RadioToggleViewModel(config);

            ko.renderTemplate(template, toggleViewModel, { templateEngine: templateEngine }, element, 'replaceChildren');

            return { controlsDescendantBindings: true };
        }
    };

    /*
     *  Toggle Binding
     *
     *  <div data-bind="toggle: { options: myOptions, selected: selectedOptions }"></div>
     */

    var toggleTemplateString = ['<div class="switch radius" data-bind="foreach: options, css: skin(), click:handleChkClick">', //
    '<input type="radio" name="quotingSwitch" data-bind="attr: {checked: checked }">', '<label for="quotingSwitch" data-bind="css: label">', '</label>', '<span></span>', '</div>'].join('');

    templateEngine.addTemplate('toggleTemplate', toggleTemplateString);

    var ToggleViewModel = function ToggleViewModel(configuration) {
        var self = this;

        //self.name = configuration.name || 'toggle';
        self.selected = configuration.boundValue; //why is name an observable?
        self.optionsText = ko.unwrap(configuration.optionsText);
        self.optionsValue = ko.unwrap(configuration.optionsValue);
        self.options = ko.observableArray();
        self.skin = ko.observable(configuration.skin);
        self.clickCallback = configuration.clickCallback;

        self.handleChkClick = function (viewModel) {
            if (viewModel.options()[0].checked === true) {
                self.selected(viewModel.options()[1].value);
                viewModel.options()[1].checked = true;
                viewModel.options()[0].checked = false;
            } else {
                self.selected(viewModel.options()[0].value);
                viewModel.options()[0].checked = true;
                viewModel.options()[1].checked = false;
            }

            self.clickCallback && self.clickCallback(viewModel);
        };

        self.setOptions = function (options) {
            var myOptions = ko.utils.arrayMap(ko.unwrap(options), function (option) {
                var isChecked = option[self.optionsValue] === self.selected();
                return { value: option[self.optionsValue], label: option[self.optionsText], checked: isChecked };
            });
            self.options(myOptions);
        };

        ko.computed(function () {
            self.setOptions(configuration.options);
        });
    };

    var toggleBindingHandler = {
        init: function init(element, valueAccessor) {
            var value = valueAccessor();
            var template = value.template || 'toggleTemplate';

            var defaults = {
                boundValue: value.selected || true,
                options: [{ value: true, label: 'icon-check' }, { value: false, label: 'icon-close' }],
                optionsText: 'label',
                optionsValue: 'value',
                //name: (value.name()) ? value.name() + '-toggle-group' : 'toggle-group', //why is name an observable?
                skin: ''
            };

            var config = uship.utils.extend({}, defaults, value);

            var toggleViewModel = new ToggleViewModel(config);

            ko.renderTemplate(template, toggleViewModel, { templateEngine: templateEngine }, element, 'replaceChildren');

            return { controlsDescendantBindings: true };
        }
    };

    /*
     *  Twitter Typeahead Binding
     *
     *  <input data-bind="typeahead: { local: myOptions }, value: selectedOption""></div>
     */

    var typeaheadBindingHandler = {
        init: function init(element, valueAccessor, allBindingsAccessor) {
            var value = valueAccessor(),
                allBindings = allBindingsAccessor(),
                boundValue = value.value || allBindings.value,
                config = ko.toJS(value.config),
                $element = jQuery(element);

            var HandleNoSelectionFromTypeahead = allBindingsAccessor().HandleNoSelectionFromTypeahead || function () {
                return;
            };
            var HandleCustomTabbingForInput = allBindingsAccessor().HandleCustomTabbingForInput || undefined;
            var MakeVisualSelectionPrediction = allBindingsAccessor().MakeVisualSelectionPrediction || false;
            var inputValue = allBindingsAccessor().value;
            var inputId = allBindingsAccessor().name || '';

            //$element.typeahead(config);

            var predictedSuggestion = undefined;
            var tabPressedInElement = false;
            $element.on('keydown', function (ev) {
                var tabKey = 9;
                if (ev.which == tabKey) {
                    tabPressedInElement = true;
                } else {
                    tabPressedInElement = false;
                }
            });

            var highlightSuggestionForUser = function highlightSuggestionForUser(ev) {
                var upKey = 38;
                var downKey = 40;
                if (MakeVisualSelectionPrediction) {
                    if (ev.which == downKey || ev.which == upKey) {
                        uship.list.RemovePredictionHighlighting(predictedSuggestion);
                    } else {
                        setTimeout(function () {
                            predictedSuggestion = uship.list.MakeVisualSelectionPrediction($element.val());
                        }, 50);
                    }
                }
            };

            $element.on('keyup', highlightSuggestionForUser);

            $element.blur(function (ev) {
                setTimeout(function () {
                    var previousValue = ko.unwrap(boundValue);
                    if ((!previousValue || previousValue !== $element.val()) && $element.val() !== '') {
                        HandleNoSelectionFromTypeahead($element.val(), inputValue, $element);
                    }

                    $element.typeahead('setQuery', ko.unwrap(boundValue));

                    if (tabPressedInElement && HandleCustomTabbingForInput) {
                        HandleCustomTabbingForInput(inputId);
                        tabPressedInElement = false;
                    }
                }, 250);
            });

            boundValue.subscribe(function (newValue) {
                if (newValue !== '') $element.typeahead('setQuery', newValue);
            });

            // set the bound value when something is selected from the typeahead
            ko.utils.registerEventHandler(element, 'typeahead:selected typeahead:autocompleted', function (event, input) {
                ko.isObservable(boundValue) ? boundValue(input.value) : boundValue = input.value;
                $element.blur();
            });

            // remove typeahead event handlers
            ko.utils.domNodeDisposal.addDisposeCallback(element, function () {
                $(element).typeahead('destroy');
            });
        },
        update: function update(element, valueAccessor, allBindingsAccessor) {
            var value = valueAccessor(),
                allBindings = allBindingsAccessor(),
                boundValue = value.value || allBindings.value,
                config = ko.unwrap(value).config,
                $element = jQuery(element);

            $element.typeahead('destroy');
            $element.typeahead(config);

            var initialValue = ko.unwrap(boundValue);

            if (initialValue && $element.val() !== initialValue) {
                $element.typeahead('setQuery', initialValue);
            }
        }
    }; // typeaheadBindingHandler

    /**
     * Price input
     * <input data-bind="price: myPrice" />
     */
    var priceboxTemplateString = ['<div class="pricebox">', '<input type="text" class="pricebox-amount" tabindex="0" maxLength="10"/>', '<div class="pricebox-symbol" data-bind="text: uship.globalize.culture().numberFormat.currency.symbol">', '</div>', '</div>'].join('');

    templateEngine.addTemplate('priceboxTemplate', priceboxTemplateString);

    var priceBindingHandler = {
        init: function init(element, valueAccessor) {
            var groupSeparator = uship.globalize.culture().numberFormat.currency[','];
            var decimalSeparator = uship.globalize.culture().numberFormat.currency['.'];

            ko.renderTemplate('priceboxTemplate', null, templateConfig, element, 'replaceChildren');
            var textbox = $(element).children().children(":first");

            //only allow numbers and an optional decimal
            textbox.keypress(function (event) {
                event = event || window.event;
                var keyCode = event.keyCode || event.which;

                var specialKeys = [8, 9, 46];

                if (specialKeys.indexOf(keyCode) > -1) return true;

                var string = String.fromCharCode(keyCode);
                var num = parseInt(string, 10);
                var decimal = string == decimalSeparator;
                var value = textbox.val();
                var secondDecimal = string == decimalSeparator && value.indexOf(decimalSeparator) != -1;
                var allowed = (!isNaN(num) || decimal) && !secondDecimal;
                var extra = extraDecimals(value, string, textbox.get(0).selectionStart);
                if (extra) {
                    return false;
                }
                return allowed;
            });

            //returns true if there is an attempt to add more than 2 decimal places
            var extraDecimals = function extraDecimals(current, attempted, attemptedPosition) {
                var split = current.split(decimalSeparator);
                if (split.length != 2) {
                    return false;
                } else {
                    var decimals = split[1];
                    var decimalPlace = current.indexOf(decimalSeparator);
                    if (decimals.length >= 2 && attemptedPosition > decimalPlace) {
                        return true;
                    } else {
                        return false;
                    }
                }
            };

            //format number
            textbox.keyup(function () {
                var str = textbox.val().split(decimalSeparator);
                var integerWithCommas = str[0];
                if (integerWithCommas === '' && textbox.val().indexOf(decimalSeparator) != -1) {
                    integerWithCommas = '0';
                    textbox.val('0' + textbox.val());
                }
                var integer = integerWithCommas.split(groupSeparator).join('');
                var commafy = commaSeparateNumber(integer);

                if (integerWithCommas != commafy) {
                    var decimals = str[1] === undefined ? '' : decimalSeparator + str[1];
                    textbox.val(commafy + decimals);
                }
                var value = valueAccessor();
                var valInElement = textbox.val();
                var stripped = valInElement.split(groupSeparator).join('');
                if (stripped.substring(stripped.length - 1, stripped.length) == decimalSeparator) {
                    stripped = stripped.substring(0, stripped.length - 1);
                }
                if (decimalSeparator == ',') {
                    stripped = stripped.replace(decimalSeparator, '.');
                }
                if (stripped === '') {
                    value(undefined);
                } else if (isNaN(stripped)) {
                    value(undefined);
                } else {
                    value(stripped);
                }
                value.isModified(false);
            });

            //force 2 decimals
            textbox.blur(function () {
                var amount = textbox.val();
                var hasDecimal = amount.indexOf(decimalSeparator) != -1;
                var str = amount.split(decimalSeparator);
                if (hasDecimal && str[1].length === 0) {
                    textbox.val(amount + '00');
                } else if (hasDecimal && str[1].length == 1) {
                    textbox.val(amount + '0');
                }
                valueAccessor().isModified(true);
            });

            return { controlsDescendantBindings: true };

            //adds commas
            function commaSeparateNumber(val) {
                while (/(\d+)(\d{3})/.test(val.toString())) {
                    val = val.toString().replace(/(\d+)(\d{3})/, '$1' + groupSeparator + '$2');
                }
                return val;
            }
        },

        update: function update(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            var value = valueAccessor();
            var valueUnwrapped = ko.unwrap(value); //always in ###.## format
            if (!valueUnwrapped) return;

            var textbox = $(element).find('.pricebox-amount');
            var decimalSeparator = uship.globalize.culture().numberFormat.currency['.'];
            var localAmount = ("" + valueUnwrapped).replace('.', decimalSeparator);
            if (localAmount == '0') {
                localAmount = '0' + decimalSeparator;
            }
            var initialLoad = textbox.val() === '';
            textbox.val(localAmount);
            textbox.keyup(); //triggers autoformat
            if (initialLoad) {
                textbox.blur();
            }
        }
    };

    var radioButtonDrivenButtonGroupBindingHandler = {
        init: function init(element, valueAccessor) {
            var el = $(element);
            el.hide();

            if (el.data().koButtonGroup) {
                el.data().koButtonGroup.remove();
            }

            // get the group name
            var name = el.find('input[type="radio"]').attr('name');

            // build a data structure from the existing radio buttons
            var options = el.find('input[name="' + name + '"]:enabled').map(function (i, x) {
                return {
                    label: el.find('label[for="' + x.id + '"]').html(),
                    value: x.value
                };
            });

            var selected = ko.observable(el.find('input[name="' + name + '"]:checked').val());

            var data = {
                name: name,
                options: ko.observableArray(options),
                selected: selected,
                clicked: function clicked(d) {
                    var element = $('input[name="' + name + '"][value="' + d.value + '"]');
                    element.attr('checked', true).trigger('click');
                    selected(element.val());
                }
            };

            var template = ['<ul data-bind="foreach: options, attr: {\'class\': \'button-group even-\' + options().length}">', '<li>', '<a href="#" class="button radius secondary" data-bind="', 'css   : { selected: $parent.selected() === $data.value },', 'click : $parent.clicked">', '<span data-bind="html: $data.label"></span>', '</a>', '</li>', '</ul>'].join('');

            var buttonGroup = $(template).insertAfter(el);
            el.data({ koButtonGroup: buttonGroup });
            ko.applyBindings(data, buttonGroup.get(0));
        }
    };

    var showHeader = function showHeader() {
        $('#hd').show();
    };

    var hideHeader = function hideHeader() {
        $('#hd').hide();
    };

    uship.namespace('knockout.ui').extend({
        CheckboxModel: CheckboxModel,
        CheckboxListViewModel: CheckboxListViewModel,
        showGooglePlaces: showGooglePlaces,
        showHeader: showHeader,
        hideHeader: hideHeader
    });

    // extend knockout
    ko.bindingHandlers.addressAutocomplete = addressAutocompleteBindingHandler;
    ko.bindingHandlers.tooltip = tooltipBindingHandler;
    ko.bindingHandlers.checkbox = checkboxBindingHandler;
    ko.bindingHandlers.checkboxlist = checkboxListBindingHandler;
    ko.bindingHandlers.drillable = drillableBindingHandler;
    ko.bindingHandlers.dropdown = dropdownBindingHandler;
    ko.bindingHandlers.radiolist = radioListBindingHandler;
    ko.bindingHandlers.mapbox = mapboxStaticBindingHandler;
    ko.bindingHandlers.modal = modalBindingHandler;
    ko.bindingHandlers.toggle = toggleBindingHandler;
    ko.bindingHandlers.radioToggle = radioToggleBindingHandler;
    ko.bindingHandlers.typeahead = typeaheadBindingHandler;
    ko.bindingHandlers.price = priceBindingHandler;
    ko.bindingHandlers.radioButtonGroup = radioButtonDrivenButtonGroupBindingHandler;

    //required for validation of custom binding
    var makeBindingHandlerValidatable = function makeBindingHandlerValidatable(handlerName) {
        var init = ko.bindingHandlers[handlerName].init;
        ko.bindingHandlers[handlerName].init = function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            var bindingSettings = init(element, valueAccessor, allBindingsAccessor);
            ko.bindingHandlers['validationCore'].init(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext);
            // In some cases, bindings will control descendant bindings. validationCore always returns undefined
            return bindingSettings;
        };
    };

    makeBindingHandlerValidatable('price');
})(window, ko, jQuery, uship);